begin;

alter table public.creator_projects
  add constraint creator_projects_stage_check check (current_stage in (
    'CONTENT_REVIEW','CONTENT_APPROVED','SCRIPT_GENERATING','SCRIPT_REVIEW','SCRIPT_APPROVED',
    'VOICE_GENERATING','VOICE_REVIEW','VOICE_APPROVED','AVATAR_GENERATING','AVATAR_REVIEW',
    'AVATAR_APPROVED','EDIT_GENERATING','EDIT_REVIEW','EDIT_APPROVED','FINAL_RENDERING',
    'FINAL_REVIEW','FINAL_APPROVED'
  ));

alter table public.creator_artifacts
  add constraint creator_artifacts_stage_check check (stage in (
    'CONTENT_REVIEW','SCRIPT_REVIEW','VOICE_REVIEW','AVATAR_REVIEW','EDIT_REVIEW','FINAL_REVIEW'
  ));

-- Replace broad owner policies. A project owner may create and read a project, but only
-- the security-definer transition RPC may mutate its authoritative stage.
drop policy if exists creator_projects_owner_all on public.creator_projects;
create policy creator_projects_owner_select on public.creator_projects
  for select using (owner_id = auth.uid());
create policy creator_projects_owner_insert on public.creator_projects
  for insert with check (
    owner_id = auth.uid()
    and current_stage = 'CONTENT_REVIEW'
  );

-- Rights attestations are append-only evidence.
drop policy if exists creator_rights_owner_all on public.creator_rights_attestations;
create policy creator_rights_owner_select on public.creator_rights_attestations
  for select using (
    exists (
      select 1 from public.creator_projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  );
create policy creator_rights_owner_insert on public.creator_rights_attestations
  for insert with check (
    attested_by = auth.uid()
    and exists (
      select 1 from public.creator_projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  );

-- Consent profiles are append-only until dedicated revoke/delete RPCs are introduced.
drop policy if exists creator_consent_owner_all on public.creator_consent_profiles;
create policy creator_consent_owner_select on public.creator_consent_profiles
  for select using (owner_id = auth.uid());
create policy creator_consent_owner_insert on public.creator_consent_profiles
  for insert with check (owner_id = auth.uid() and active and revoked_at is null);

revoke all on table public.creator_projects from anon, authenticated;
revoke all on table public.creator_rights_attestations from anon, authenticated;
revoke all on table public.creator_consent_profiles from anon, authenticated;
revoke all on table public.creator_artifacts from anon, authenticated;
revoke all on table public.creator_reviews from anon, authenticated;
revoke all on table public.creator_jobs from anon, authenticated;
revoke all on table public.creator_audit_events from anon, authenticated;

grant select, insert on table public.creator_projects to authenticated;
grant select, insert on table public.creator_rights_attestations to authenticated;
grant select, insert on table public.creator_consent_profiles to authenticated;
grant select on table public.creator_artifacts to authenticated;
grant select on table public.creator_reviews to authenticated;
grant select on table public.creator_jobs to authenticated;
grant select on table public.creator_audit_events to authenticated;

-- Artifact versions are immutable. The only permitted update is setting stale_at once.
create or replace function public.creator_guard_artifact_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if row(
    new.id, new.project_id, new.stage, new.kind, new.version_number,
    new.private_storage_path, new.inline_text, new.sha256, new.metadata,
    new.created_by, new.created_at
  ) is distinct from row(
    old.id, old.project_id, old.stage, old.kind, old.version_number,
    old.private_storage_path, old.inline_text, old.sha256, old.metadata,
    old.created_by, old.created_at
  ) then
    raise exception 'ARTIFACT_IMMUTABLE';
  end if;
  if old.stale_at is not null and new.stale_at is distinct from old.stale_at then
    raise exception 'ARTIFACT_STALENESS_IMMUTABLE';
  end if;
  return new;
end;
$$;

drop trigger if exists creator_artifact_immutability on public.creator_artifacts;
create trigger creator_artifact_immutability
before update on public.creator_artifacts
for each row execute function public.creator_guard_artifact_immutability();

-- Remove the client-supplied next stage. The server derives it from the current stage/event.
drop function if exists public.creator_transition_project(uuid,text,text,text,uuid,text,text);

create or replace function public.creator_transition_project(
  p_project_id uuid,
  p_expected_stage text,
  p_event text,
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
  v_artifact public.creator_artifacts;
  v_actor uuid := auth.uid();
  v_next_stage text;
  v_expected_kind text;
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;

  select * into v_project
  from public.creator_projects
  where id = p_project_id
  for update;

  if not found or v_project.owner_id <> v_actor then raise exception 'PROJECT_NOT_FOUND'; end if;
  if v_project.current_stage <> p_expected_stage then raise exception 'STAGE_CONFLICT'; end if;

  select transition.next_stage, transition.expected_kind
  into v_next_stage, v_expected_kind
  from (values
    ('CONTENT_REVIEW','APPROVE_CONTENT','CONTENT_APPROVED','content'),
    ('CONTENT_APPROVED','START_SCRIPT','SCRIPT_GENERATING',null),
    ('SCRIPT_REVIEW','APPROVE_SCRIPT','SCRIPT_APPROVED','script'),
    ('SCRIPT_APPROVED','START_VOICE','VOICE_GENERATING',null),
    ('VOICE_REVIEW','APPROVE_VOICE','VOICE_APPROVED','voice'),
    ('VOICE_APPROVED','START_AVATAR','AVATAR_GENERATING',null),
    ('AVATAR_REVIEW','APPROVE_AVATAR','AVATAR_APPROVED','avatar'),
    ('AVATAR_APPROVED','START_EDIT','EDIT_GENERATING',null),
    ('EDIT_REVIEW','APPROVE_EDIT','EDIT_APPROVED','edit'),
    ('EDIT_APPROVED','START_FINAL','FINAL_RENDERING',null),
    ('FINAL_REVIEW','APPROVE_FINAL','FINAL_APPROVED','final')
  ) as transition(current_stage, event_code, next_stage, expected_kind)
  where transition.current_stage = p_expected_stage
    and transition.event_code = p_event;

  if v_next_stage is null then raise exception 'INVALID_WORKFLOW_TRANSITION'; end if;

  if v_expected_kind is not null then
    if p_artifact_id is null or p_artifact_sha256 is null then
      raise exception 'APPROVAL_BINDING_REQUIRED';
    end if;

    select * into v_artifact
    from public.creator_artifacts a
    where a.id = p_artifact_id
      and a.project_id = p_project_id
      and a.kind = v_expected_kind
      and a.sha256 = p_artifact_sha256
      and a.stale_at is null;

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
        and rights.source_sha256 = p_artifact_sha256
    ) then
      raise exception 'RIGHTS_ATTESTATION_REQUIRED';
    end if;

    insert into public.creator_reviews(
      project_id, artifact_id, reviewer_id, decision, artifact_version, artifact_sha256, notes
    ) values (
      p_project_id, p_artifact_id, v_actor, 'approved', v_artifact.version_number, p_artifact_sha256, p_notes
    );
  end if;

  update public.creator_projects
  set current_stage = v_next_stage, updated_at = now()
  where id = p_project_id
  returning * into v_project;

  insert into public.creator_audit_events(
    project_id, actor_id, actor_kind, event_code, artifact_id
  ) values (
    p_project_id, v_actor, 'human', p_event, p_artifact_id
  );

  return v_project;
end;
$$;

revoke all on function public.creator_transition_project(uuid,text,text,uuid,text,text) from public;
grant execute on function public.creator_transition_project(uuid,text,text,uuid,text,text) to authenticated;

commit;
