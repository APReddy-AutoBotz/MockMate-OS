begin;

create extension if not exists pgcrypto;

create table public.creator_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  current_stage text not null default 'CONTENT_REVIEW',
  runtime_mode text not null default 'production' check (runtime_mode in ('development','test','preview','production')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.creator_rights_attestations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creator_projects(id) on delete cascade,
  attested_by uuid not null references auth.users(id) on delete cascade,
  statement_version text not null,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  attested_at timestamptz not null default now()
);

create table public.creator_consent_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  profile_kind text not null check (profile_kind in ('voice','avatar')),
  display_name text not null,
  consent_sha256 text not null check (consent_sha256 ~ '^[a-f0-9]{64}$'),
  private_sample_path text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.creator_artifacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creator_projects(id) on delete cascade,
  stage text not null,
  kind text not null check (kind in ('content','script','voice','avatar','edit','final')),
  version_number integer not null check (version_number > 0),
  private_storage_path text,
  inline_text text,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  stale_at timestamptz,
  unique (project_id, kind, version_number)
);

create table public.creator_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creator_projects(id) on delete cascade,
  artifact_id uuid not null references public.creator_artifacts(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  decision text not null check (decision in ('approved','revision_requested')),
  artifact_version integer not null check (artifact_version > 0),
  artifact_sha256 text not null check (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  notes text,
  created_at timestamptz not null default now()
);

create unique index creator_one_approval_per_artifact
  on public.creator_reviews(artifact_id)
  where decision = 'approved';

create table public.creator_transition_requests (
  project_id uuid not null references public.creator_projects(id) on delete cascade,
  idempotency_key text not null,
  event_code text not null,
  created_at timestamptz not null default now(),
  primary key (project_id, idempotency_key)
);

create table public.creator_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.creator_projects(id) on delete cascade,
  job_type text not null check (job_type in ('script','voice','avatar','edit','final')),
  status text not null default 'queued' check (status in ('queued','leased','running','succeeded','failed','cancelled')),
  idempotency_key text not null,
  input_artifact_id uuid references public.creator_artifacts(id) on delete restrict,
  output_artifact_id uuid references public.creator_artifacts(id) on delete set null,
  provider text not null default 'mock',
  attempt_count integer not null default 0,
  leased_until timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, idempotency_key)
);

create table public.creator_audit_events (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.creator_projects(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_kind text not null check (actor_kind in ('human','worker','system')),
  event_code text not null,
  artifact_id uuid references public.creator_artifacts(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.creator_projects enable row level security;
alter table public.creator_rights_attestations enable row level security;
alter table public.creator_consent_profiles enable row level security;
alter table public.creator_artifacts enable row level security;
alter table public.creator_reviews enable row level security;
alter table public.creator_jobs enable row level security;
alter table public.creator_audit_events enable row level security;
alter table public.creator_transition_requests enable row level security;

create policy creator_projects_owner_all on public.creator_projects
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy creator_rights_owner_all on public.creator_rights_attestations
  for all using (exists (select 1 from public.creator_projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (attested_by = auth.uid() and exists (select 1 from public.creator_projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy creator_consent_owner_all on public.creator_consent_profiles
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy creator_artifacts_owner_read on public.creator_artifacts
  for select using (exists (select 1 from public.creator_projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy creator_reviews_owner_read on public.creator_reviews
  for select using (exists (select 1 from public.creator_projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy creator_jobs_owner_read on public.creator_jobs
  for select using (exists (select 1 from public.creator_projects p where p.id = project_id and p.owner_id = auth.uid()));
create policy creator_audit_owner_read on public.creator_audit_events
  for select using (exists (select 1 from public.creator_projects p where p.id = project_id and p.owner_id = auth.uid()));

create or replace function public.creator_transition_project(
  p_project_id uuid,
  p_expected_stage text,
  p_event text,
  p_next_stage text,
  p_artifact_id uuid default null,
  p_artifact_sha256 text default null,
  p_notes text default null
) returns public.creator_projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.creator_projects;
  v_allowed boolean := false;
  v_worker_event boolean := p_event in ('SCRIPT_READY','VOICE_READY','AVATAR_READY','EDIT_READY','FINAL_READY');
begin
  select * into v_project from public.creator_projects
    where id = p_project_id for update;
  if not found or v_project.owner_id <> auth.uid() then raise exception 'PROJECT_NOT_FOUND'; end if;
  if v_worker_event then raise exception 'WORKER_EVENT_REQUIRES_SERVICE_AUTHORITY'; end if;
  if v_project.current_stage <> p_expected_stage then raise exception 'STAGE_CONFLICT'; end if;

  v_allowed := (p_expected_stage, p_event, p_next_stage) in (
    ('CONTENT_REVIEW','APPROVE_CONTENT','CONTENT_APPROVED'),
    ('CONTENT_APPROVED','START_SCRIPT','SCRIPT_GENERATING'),
    ('SCRIPT_REVIEW','APPROVE_SCRIPT','SCRIPT_APPROVED'),
    ('SCRIPT_APPROVED','START_VOICE','VOICE_GENERATING'),
    ('VOICE_REVIEW','APPROVE_VOICE','VOICE_APPROVED'),
    ('VOICE_APPROVED','START_AVATAR','AVATAR_GENERATING'),
    ('AVATAR_REVIEW','APPROVE_AVATAR','AVATAR_APPROVED'),
    ('AVATAR_APPROVED','START_EDIT','EDIT_GENERATING'),
    ('EDIT_REVIEW','APPROVE_EDIT','EDIT_APPROVED'),
    ('EDIT_APPROVED','START_FINAL','FINAL_RENDERING'),
    ('FINAL_REVIEW','APPROVE_FINAL','FINAL_APPROVED')
  );
  if not v_allowed then raise exception 'INVALID_WORKFLOW_TRANSITION'; end if;

  if p_event like 'APPROVE_%' then
    if p_artifact_id is null or p_artifact_sha256 is null then raise exception 'APPROVAL_BINDING_REQUIRED'; end if;
    if not exists (select 1 from public.creator_artifacts a where a.id = p_artifact_id and a.project_id = p_project_id and a.sha256 = p_artifact_sha256 and a.stale_at is null) then
      raise exception 'ARTIFACT_BINDING_INVALID';
    end if;
    insert into public.creator_reviews(project_id, artifact_id, reviewer_id, decision, artifact_version, artifact_sha256, notes)
      select p_project_id, p_artifact_id, auth.uid(), 'approved', version_number, p_artifact_sha256, p_notes
      from public.creator_artifacts where id = p_artifact_id;
  end if;

  update public.creator_projects set current_stage = p_next_stage, updated_at = now() where id = p_project_id returning * into v_project;
  insert into public.creator_audit_events(project_id, actor_id, actor_kind, event_code, artifact_id)
    values (p_project_id, auth.uid(), 'human', p_event, p_artifact_id);
  return v_project;
end;
$$;

revoke all on function public.creator_transition_project(uuid,text,text,text,uuid,text,text) from public;
grant execute on function public.creator_transition_project(uuid,text,text,text,uuid,text,text) to authenticated;

commit;
