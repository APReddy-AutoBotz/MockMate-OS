begin;

alter table public.creator_projects
  add column if not exists client_request_id uuid;

alter table public.creator_rights_attestations
  add column if not exists artifact_id uuid references public.creator_artifacts(id) on delete restrict,
  add column if not exists artifact_version integer,
  add column if not exists client_request_id uuid;

alter table public.creator_artifacts
  add column if not exists client_request_id uuid;

alter table public.creator_reviews
  add column if not exists artifact_version integer,
  add column if not exists invalidated_at timestamptz,
  add column if not exists invalidation_reason text;

update public.creator_reviews review
set artifact_version = artifact.version_number
from public.creator_artifacts artifact
where review.artifact_id = artifact.id
  and review.artifact_version is null;

alter table public.creator_reviews
  add constraint creator_reviews_artifact_version_check
  check (artifact_version is null or artifact_version > 0);

create unique index if not exists creator_projects_owner_request_unique
  on public.creator_projects(owner_id, client_request_id);

create unique index if not exists creator_rights_project_request_unique
  on public.creator_rights_attestations(project_id, client_request_id);

create unique index if not exists creator_artifacts_project_request_unique
  on public.creator_artifacts(project_id, client_request_id);

drop index if exists public.creator_one_approval_per_artifact;
create unique index creator_one_active_approval_per_artifact
  on public.creator_reviews(artifact_id)
  where decision = 'approved' and invalidated_at is null;

alter table public.creator_artifacts
  add constraint creator_artifacts_private_path_check
  check (
    private_storage_path is null
    or (
      private_storage_path !~* '^https?://'
      and private_storage_path !~ '^/'
      and private_storage_path !~ '^public/'
      and position('..' in private_storage_path) = 0
    )
  );

alter table public.creator_artifacts
  add constraint creator_text_artifact_shape_check
  check (
    kind not in ('content', 'script')
    or (
      inline_text is not null
      and char_length(btrim(inline_text)) between 1 and 100000
      and private_storage_path is null
    )
  );

alter table public.creator_consent_profiles
  add constraint creator_consent_private_path_check
  check (
    private_sample_path !~* '^https?://'
    and private_sample_path !~ '^/'
    and private_sample_path !~ '^public/'
    and position('..' in private_sample_path) = 0
  );

create table public.creator_command_receipts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creator_projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  command_type text not null,
  entity_id uuid,
  result_stage text,
  created_at timestamptz not null default now(),
  unique (project_id, idempotency_key)
);

alter table public.creator_command_receipts enable row level security;

drop policy if exists creator_command_receipts_owner_select on public.creator_command_receipts;
create policy creator_command_receipts_owner_select
  on public.creator_command_receipts
  for select
  using (owner_id = auth.uid());

revoke all on table public.creator_command_receipts from anon, authenticated;
grant select on table public.creator_command_receipts to authenticated;

-- All writes now go through server-authoritative RPCs.
revoke insert, update, delete on table public.creator_projects from authenticated;
revoke insert, update, delete on table public.creator_rights_attestations from authenticated;
revoke insert, update, delete on table public.creator_consent_profiles from authenticated;
revoke insert, update, delete on table public.creator_artifacts from authenticated;
revoke insert, update, delete on table public.creator_reviews from authenticated;
revoke insert, update, delete on table public.creator_jobs from authenticated;
revoke insert, update, delete on table public.creator_audit_events from authenticated;

-- Artifact versions are immutable. The only permitted mutation is setting stale_at once.
create or replace function public.creator_guard_artifact_immutability()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if row(
    new.id,
    new.project_id,
    new.stage,
    new.kind,
    new.version_number,
    new.private_storage_path,
    new.inline_text,
    new.sha256,
    new.metadata,
    new.created_by,
    new.created_at,
    new.client_request_id
  ) is distinct from row(
    old.id,
    old.project_id,
    old.stage,
    old.kind,
    old.version_number,
    old.private_storage_path,
    old.inline_text,
    old.sha256,
    old.metadata,
    old.created_by,
    old.created_at,
    old.client_request_id
  ) then
    raise exception 'ARTIFACT_IMMUTABLE';
  end if;

  if old.stale_at is not null and new.stale_at is distinct from old.stale_at then
    raise exception 'ARTIFACT_STALENESS_IMMUTABLE';
  end if;

  return new;
end;
$$;

create or replace function public.creator_guard_review_immutability()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if row(
    new.id,
    new.project_id,
    new.artifact_id,
    new.reviewer_id,
    new.decision,
    new.artifact_sha256,
    new.artifact_version,
    new.notes,
    new.created_at
  ) is distinct from row(
    old.id,
    old.project_id,
    old.artifact_id,
    old.reviewer_id,
    old.decision,
    old.artifact_sha256,
    old.artifact_version,
    old.notes,
    old.created_at
  ) then
    raise exception 'REVIEW_IMMUTABLE';
  end if;

  if old.invalidated_at is not null
     and row(new.invalidated_at, new.invalidation_reason)
       is distinct from row(old.invalidated_at, old.invalidation_reason) then
    raise exception 'REVIEW_INVALIDATION_IMMUTABLE';
  end if;

  if new.invalidated_at is null and new.invalidation_reason is not null then
    raise exception 'REVIEW_INVALIDATION_TIMESTAMP_REQUIRED';
  end if;

  if old.invalidated_at is null
     and new.invalidated_at is not null
     and coalesce(btrim(new.invalidation_reason), '') = '' then
    raise exception 'REVIEW_INVALIDATION_REASON_REQUIRED';
  end if;

  return new;
end;
$$;

drop trigger if exists creator_review_immutability on public.creator_reviews;
create trigger creator_review_immutability
before update on public.creator_reviews
for each row execute function public.creator_guard_review_immutability();

create or replace function public.creator_create_project(
  p_title text,
  p_client_request_id uuid
) returns public.creator_projects
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_project public.creator_projects;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  if p_client_request_id is null then raise exception 'CLIENT_REQUEST_ID_REQUIRED'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 160 then
    raise exception 'PROJECT_TITLE_INVALID';
  end if;

  insert into public.creator_projects(owner_id, title, current_stage, client_request_id)
  values (v_actor, btrim(p_title), 'CONTENT_REVIEW', p_client_request_id)
  on conflict (owner_id, client_request_id)
  do update set client_request_id = excluded.client_request_id
  returning * into v_project;

  if v_project.owner_id <> v_actor then raise exception 'PROJECT_NOT_FOUND'; end if;
  if v_project.title <> btrim(p_title) then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;

  insert into public.creator_audit_events(project_id, actor_id, actor_kind, event_code)
  select v_project.id, v_actor, 'human', 'PROJECT_CREATED'
  where not exists (
    select 1
    from public.creator_audit_events event
    where event.project_id = v_project.id
      and event.event_code = 'PROJECT_CREATED'
  );

  return v_project;
end;
$$;

create or replace function public.creator_attest_rights(
  p_project_id uuid,
  p_artifact_id uuid,
  p_statement_version text,
  p_client_request_id uuid
) returns public.creator_rights_attestations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_project public.creator_projects;
  v_artifact public.creator_artifacts;
  v_existing public.creator_rights_attestations;
  v_attestation public.creator_rights_attestations;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  if p_client_request_id is null then raise exception 'CLIENT_REQUEST_ID_REQUIRED'; end if;
  if p_statement_version <> 'creator-rights-v1' then raise exception 'RIGHTS_STATEMENT_INVALID'; end if;

  select * into v_project
  from public.creator_projects
  where id = p_project_id
  for update;

  if not found or v_project.owner_id <> v_actor then raise exception 'PROJECT_NOT_FOUND'; end if;
  if v_project.current_stage <> 'CONTENT_REVIEW' then raise exception 'STAGE_CONFLICT'; end if;

  select * into v_existing
  from public.creator_rights_attestations
  where project_id = p_project_id
    and client_request_id = p_client_request_id;

  if found then
    if v_existing.artifact_id <> p_artifact_id then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;
    return v_existing;
  end if;

  select * into v_artifact
  from public.creator_artifacts artifact
  where artifact.id = p_artifact_id
    and artifact.project_id = p_project_id
    and artifact.kind = 'content'
    and artifact.stale_at is null;

  if not found then raise exception 'ARTIFACT_BINDING_INVALID'; end if;

  if v_artifact.version_number <> (
    select max(latest.version_number)
    from public.creator_artifacts latest
    where latest.project_id = p_project_id
      and latest.kind = 'content'
      and latest.stale_at is null
  ) then
    raise exception 'LATEST_ARTIFACT_REQUIRED';
  end if;

  insert into public.creator_rights_attestations(
    project_id,
    attested_by,
    statement_version,
    source_sha256,
    artifact_id,
    artifact_version,
    client_request_id
  ) values (
    p_project_id,
    v_actor,
    p_statement_version,
    v_artifact.sha256,
    v_artifact.id,
    v_artifact.version_number,
    p_client_request_id
  ) returning * into v_attestation;

  insert into public.creator_audit_events(
    project_id,
    actor_id,
    actor_kind,
    event_code,
    artifact_id,
    details
  ) values (
    p_project_id,
    v_actor,
    'human',
    'RIGHTS_ATTESTED',
    v_artifact.id,
    jsonb_build_object('statementVersion', p_statement_version)
  );

  return v_attestation;
end;
$$;

create or replace function public.creator_create_artifact_version(
  p_project_id uuid,
  p_kind text,
  p_inline_text text,
  p_private_storage_path text,
  p_sha256 text,
  p_client_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_project public.creator_projects;
  v_artifact public.creator_artifacts;
  v_existing public.creator_artifacts;
  v_version integer;
  v_artifact_stage text;
  v_now timestamptz := now();
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  if p_client_request_id is null then raise exception 'CLIENT_REQUEST_ID_REQUIRED'; end if;
  if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'SHA256_INVALID'; end if;
  if p_kind not in ('content', 'script') then raise exception 'ARTIFACT_KIND_NOT_ENABLED'; end if;
  if char_length(btrim(coalesce(p_inline_text, ''))) not between 1 and 100000 then
    raise exception 'ARTIFACT_TEXT_INVALID';
  end if;
  if p_private_storage_path is not null then raise exception 'TEXT_ARTIFACT_PATH_FORBIDDEN'; end if;

  select * into v_project
  from public.creator_projects
  where id = p_project_id
  for update;

  if not found or v_project.owner_id <> v_actor then raise exception 'PROJECT_NOT_FOUND'; end if;

  select * into v_existing
  from public.creator_artifacts
  where project_id = p_project_id
    and client_request_id = p_client_request_id;

  if found then
    if v_existing.kind <> p_kind or v_existing.sha256 <> p_sha256 then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    return jsonb_build_object(
      'project', to_jsonb(v_project),
      'artifact', to_jsonb(v_existing),
      'replayed', true
    );
  end if;

  if p_kind = 'content' then
    if v_project.current_stage <> 'CONTENT_REVIEW' then raise exception 'STAGE_CONFLICT'; end if;
    v_artifact_stage := 'CONTENT_REVIEW';
  else
    if v_project.current_stage not in ('SCRIPT_GENERATING', 'SCRIPT_REVIEW') then
      raise exception 'STAGE_CONFLICT';
    end if;
    v_artifact_stage := 'SCRIPT_REVIEW';
  end if;

  update public.creator_reviews review
  set invalidated_at = v_now,
      invalidation_reason = 'SUPERSEDED_BY_NEW_VERSION'
  where review.invalidated_at is null
    and review.artifact_id in (
      select artifact.id
      from public.creator_artifacts artifact
      where artifact.project_id = p_project_id
        and artifact.kind = p_kind
        and artifact.stale_at is null
    );

  update public.creator_artifacts
  set stale_at = v_now
  where project_id = p_project_id
    and kind = p_kind
    and stale_at is null;

  select coalesce(max(version_number), 0) + 1
  into v_version
  from public.creator_artifacts
  where project_id = p_project_id
    and kind = p_kind;

  insert into public.creator_artifacts(
    project_id,
    stage,
    kind,
    version_number,
    private_storage_path,
    inline_text,
    sha256,
    metadata,
    created_by,
    client_request_id
  ) values (
    p_project_id,
    v_artifact_stage,
    p_kind,
    v_version,
    null,
    btrim(p_inline_text),
    p_sha256,
    jsonb_build_object('provider', 'manual', 'synthetic', false),
    v_actor,
    p_client_request_id
  ) returning * into v_artifact;

  if p_kind = 'script' and v_project.current_stage = 'SCRIPT_GENERATING' then
    update public.creator_projects
    set current_stage = 'SCRIPT_REVIEW', updated_at = v_now
    where id = p_project_id
    returning * into v_project;
  else
    update public.creator_projects
    set updated_at = v_now
    where id = p_project_id
    returning * into v_project;
  end if;

  insert into public.creator_audit_events(
    project_id,
    actor_id,
    actor_kind,
    event_code,
    artifact_id,
    details
  ) values (
    p_project_id,
    v_actor,
    'human',
    upper(p_kind) || '_VERSION_CREATED',
    v_artifact.id,
    jsonb_build_object('version', v_version, 'provider', 'manual')
  );

  return jsonb_build_object(
    'project', to_jsonb(v_project),
    'artifact', to_jsonb(v_artifact),
    'replayed', false
  );
end;
$$;

-- Replace the earlier transition function with an idempotent, version-bound signature.
drop function if exists public.creator_transition_project(uuid, text, text, uuid, text, text);

create or replace function public.creator_transition_project(
  p_project_id uuid,
  p_expected_stage text,
  p_event text,
  p_artifact_id uuid,
  p_artifact_sha256 text,
  p_idempotency_key uuid,
  p_notes text default null
) returns public.creator_projects
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_project public.creator_projects;
  v_artifact public.creator_artifacts;
  v_receipt public.creator_command_receipts;
  v_next_stage text;
  v_expected_kind text;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  if p_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;

  select * into v_project
  from public.creator_projects
  where id = p_project_id
  for update;

  if not found or v_project.owner_id <> v_actor then raise exception 'PROJECT_NOT_FOUND'; end if;

  select * into v_receipt
  from public.creator_command_receipts
  where project_id = p_project_id
    and idempotency_key = p_idempotency_key;

  if found then
    if v_receipt.command_type <> ('transition:' || p_event) then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    return v_project;
  end if;

  if v_project.current_stage <> p_expected_stage then raise exception 'STAGE_CONFLICT'; end if;

  select transition.next_stage, transition.expected_kind
  into v_next_stage, v_expected_kind
  from (values
    ('CONTENT_REVIEW', 'APPROVE_CONTENT', 'CONTENT_APPROVED', 'content'::text),
    ('CONTENT_APPROVED', 'START_SCRIPT', 'SCRIPT_GENERATING', null::text),
    ('SCRIPT_REVIEW', 'APPROVE_SCRIPT', 'SCRIPT_APPROVED', 'script'::text),
    ('SCRIPT_APPROVED', 'START_VOICE', 'VOICE_GENERATING', null::text),
    ('VOICE_REVIEW', 'APPROVE_VOICE', 'VOICE_APPROVED', 'voice'::text),
    ('VOICE_APPROVED', 'START_AVATAR', 'AVATAR_GENERATING', null::text),
    ('AVATAR_REVIEW', 'APPROVE_AVATAR', 'AVATAR_APPROVED', 'avatar'::text),
    ('AVATAR_APPROVED', 'START_EDIT', 'EDIT_GENERATING', null::text),
    ('EDIT_REVIEW', 'APPROVE_EDIT', 'EDIT_APPROVED', 'edit'::text),
    ('EDIT_APPROVED', 'START_FINAL', 'FINAL_RENDERING', null::text),
    ('FINAL_REVIEW', 'APPROVE_FINAL', 'FINAL_APPROVED', 'final'::text)
  ) as transition(current_stage, event_code, next_stage, expected_kind)
  where transition.current_stage = p_expected_stage
    and transition.event_code = p_event;

  if v_next_stage is null then raise exception 'INVALID_WORKFLOW_TRANSITION'; end if;

  if v_expected_kind is not null then
    if p_artifact_id is null or p_artifact_sha256 is null then
      raise exception 'APPROVAL_BINDING_REQUIRED';
    end if;

    select * into v_artifact
    from public.creator_artifacts artifact
    where artifact.id = p_artifact_id
      and artifact.project_id = p_project_id
      and artifact.kind = v_expected_kind
      and artifact.stage = p_expected_stage
      and artifact.sha256 = p_artifact_sha256
      and artifact.stale_at is null;

    if not found then raise exception 'ARTIFACT_BINDING_INVALID'; end if;

    if v_artifact.version_number <> (
      select max(latest.version_number)
      from public.creator_artifacts latest
      where latest.project_id = p_project_id
        and latest.kind = v_expected_kind
        and latest.stale_at is null
    ) then
      raise exception 'LATEST_ARTIFACT_REQUIRED';
    end if;

    if p_event = 'APPROVE_CONTENT' and not exists (
      select 1
      from public.creator_rights_attestations rights
      where rights.project_id = p_project_id
        and rights.attested_by = v_actor
        and rights.artifact_id = v_artifact.id
        and rights.artifact_version = v_artifact.version_number
        and rights.source_sha256 = v_artifact.sha256
    ) then
      raise exception 'RIGHTS_ATTESTATION_REQUIRED';
    end if;

    insert into public.creator_reviews(
      project_id,
      artifact_id,
      reviewer_id,
      decision,
      artifact_sha256,
      artifact_version,
      notes
    ) values (
      p_project_id,
      v_artifact.id,
      v_actor,
      'approved',
      v_artifact.sha256,
      v_artifact.version_number,
      p_notes
    );
  end if;

  update public.creator_projects
  set current_stage = v_next_stage, updated_at = now()
  where id = p_project_id
  returning * into v_project;

  insert into public.creator_command_receipts(
    project_id,
    owner_id,
    idempotency_key,
    command_type,
    entity_id,
    result_stage
  ) values (
    p_project_id,
    v_actor,
    p_idempotency_key,
    'transition:' || p_event,
    p_artifact_id,
    v_next_stage
  );

  insert into public.creator_audit_events(
    project_id,
    actor_id,
    actor_kind,
    event_code,
    artifact_id,
    details
  ) values (
    p_project_id,
    v_actor,
    'human',
    p_event,
    p_artifact_id,
    jsonb_build_object('from', p_expected_stage, 'to', v_next_stage)
  );

  return v_project;
end;
$$;

create or replace function public.creator_request_revision(
  p_project_id uuid,
  p_target_kind text,
  p_reason text,
  p_idempotency_key uuid
) returns public.creator_projects
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_project public.creator_projects;
  v_receipt public.creator_command_receipts;
  v_target_artifact public.creator_artifacts;
  v_target_stage text;
  v_invalid_artifact_kinds text[];
  v_invalid_review_kinds text[];
  v_cancel_job_types text[];
  v_now timestamptz := now();
  v_stage_order text[] := array[
    'CONTENT_REVIEW', 'CONTENT_APPROVED', 'SCRIPT_GENERATING', 'SCRIPT_REVIEW',
    'SCRIPT_APPROVED', 'VOICE_GENERATING', 'VOICE_REVIEW', 'VOICE_APPROVED',
    'AVATAR_GENERATING', 'AVATAR_REVIEW', 'AVATAR_APPROVED', 'EDIT_GENERATING',
    'EDIT_REVIEW', 'EDIT_APPROVED', 'FINAL_RENDERING', 'FINAL_REVIEW', 'FINAL_APPROVED'
  ];
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  if p_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) not between 1 and 2000 then
    raise exception 'REVISION_REASON_INVALID';
  end if;

  select * into v_project
  from public.creator_projects
  where id = p_project_id
  for update;

  if not found or v_project.owner_id <> v_actor then raise exception 'PROJECT_NOT_FOUND'; end if;

  select * into v_receipt
  from public.creator_command_receipts
  where project_id = p_project_id
    and idempotency_key = p_idempotency_key;

  if found then
    if v_receipt.command_type <> ('revision:' || p_target_kind) then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    return v_project;
  end if;

  if p_target_kind = 'content' then
    v_target_stage := 'CONTENT_REVIEW';
    v_invalid_artifact_kinds := array['script', 'voice', 'avatar', 'edit', 'final'];
    v_invalid_review_kinds := array['content', 'script', 'voice', 'avatar', 'edit', 'final'];
    v_cancel_job_types := array['script', 'voice', 'avatar', 'edit', 'final'];
  elsif p_target_kind = 'script' then
    if array_position(v_stage_order, v_project.current_stage)
       < array_position(v_stage_order, 'SCRIPT_GENERATING') then
      raise exception 'REVISION_TARGET_NOT_REACHED';
    end if;
    v_target_stage := 'SCRIPT_REVIEW';
    v_invalid_artifact_kinds := array['voice', 'avatar', 'edit', 'final'];
    v_invalid_review_kinds := array['script', 'voice', 'avatar', 'edit', 'final'];
    v_cancel_job_types := array['voice', 'avatar', 'edit', 'final'];
  else
    raise exception 'REVISION_TARGET_INVALID';
  end if;

  update public.creator_reviews review
  set invalidated_at = v_now,
      invalidation_reason = 'UPSTREAM_REVISED'
  from public.creator_artifacts artifact
  where review.artifact_id = artifact.id
    and review.invalidated_at is null
    and artifact.project_id = p_project_id
    and artifact.kind = any(v_invalid_review_kinds);

  update public.creator_artifacts artifact
  set stale_at = v_now
  where artifact.project_id = p_project_id
    and artifact.kind = any(v_invalid_artifact_kinds)
    and artifact.stale_at is null;

  update public.creator_jobs job
  set status = 'cancelled',
      error_code = 'UPSTREAM_REVISED',
      leased_until = null,
      updated_at = v_now
  where job.project_id = p_project_id
    and job.job_type = any(v_cancel_job_types)
    and job.status in ('queued', 'leased', 'running');

  select * into v_target_artifact
  from public.creator_artifacts artifact
  where artifact.project_id = p_project_id
    and artifact.kind = p_target_kind
    and artifact.stale_at is null
  order by artifact.version_number desc
  limit 1;

  if found then
    insert into public.creator_reviews(
      project_id,
      artifact_id,
      reviewer_id,
      decision,
      artifact_sha256,
      artifact_version,
      notes
    ) values (
      p_project_id,
      v_target_artifact.id,
      v_actor,
      'revision_requested',
      v_target_artifact.sha256,
      v_target_artifact.version_number,
      btrim(p_reason)
    );
  end if;

  update public.creator_projects
  set current_stage = v_target_stage, updated_at = v_now
  where id = p_project_id
  returning * into v_project;

  insert into public.creator_command_receipts(
    project_id,
    owner_id,
    idempotency_key,
    command_type,
    entity_id,
    result_stage
  ) values (
    p_project_id,
    v_actor,
    p_idempotency_key,
    'revision:' || p_target_kind,
    v_target_artifact.id,
    v_target_stage
  );

  insert into public.creator_audit_events(
    project_id,
    actor_id,
    actor_kind,
    event_code,
    artifact_id,
    details
  ) values (
    p_project_id,
    v_actor,
    'human',
    'REVISION_REQUESTED',
    v_target_artifact.id,
    jsonb_build_object('targetKind', p_target_kind, 'reason', btrim(p_reason))
  );

  return v_project;
end;
$$;

create or replace function public.creator_prepare_biometric_upload(
  p_profile_kind text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if p_profile_kind not in ('voice', 'avatar') then raise exception 'PROFILE_KIND_INVALID'; end if;
  raise exception 'BIOMETRIC_UPLOADS_NOT_ENABLED';
end;
$$;

revoke all on function public.creator_create_project(text, uuid) from public;
revoke all on function public.creator_attest_rights(uuid, uuid, text, uuid) from public;
revoke all on function public.creator_create_artifact_version(uuid, text, text, text, text, uuid) from public;
revoke all on function public.creator_transition_project(uuid, text, text, uuid, text, uuid, text) from public;
revoke all on function public.creator_request_revision(uuid, text, text, uuid) from public;
revoke all on function public.creator_prepare_biometric_upload(text) from public;

grant execute on function public.creator_create_project(text, uuid) to authenticated;
grant execute on function public.creator_attest_rights(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.creator_create_artifact_version(uuid, text, text, text, text, uuid) to authenticated;
grant execute on function public.creator_transition_project(uuid, text, text, uuid, text, uuid, text) to authenticated;
grant execute on function public.creator_request_revision(uuid, text, text, uuid) to authenticated;
grant execute on function public.creator_prepare_biometric_upload(text) to authenticated;

commit;
