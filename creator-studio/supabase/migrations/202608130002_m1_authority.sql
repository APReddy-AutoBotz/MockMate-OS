begin;

alter table public.creator_artifacts add constraint creator_private_storage_path check (
  private_storage_path is null or (
    private_storage_path !~* '^https?://' and private_storage_path !~ '^/'
    and private_storage_path !~ '(^|/)public/' and private_storage_path !~ '(^|/)\.\.(/|$)'
  )
);

revoke all on table public.creator_transition_requests from anon, authenticated;

create or replace function public.creator_create_project(p_title text, p_runtime_mode text default 'production')
returns public.creator_projects language plpgsql security definer set search_path = public as $$
declare v_project public.creator_projects; v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'UNAUTHORIZED'; end if;
  insert into public.creator_projects(owner_id, title, runtime_mode)
  values (v_actor, p_title, p_runtime_mode) returning * into v_project;
  return v_project;
end; $$;

create or replace function public.creator_create_artifact_version(
  p_project_id uuid, p_kind text, p_inline_text text, p_private_storage_path text,
  p_sha256 text, p_idempotency_key text
) returns public.creator_artifacts language plpgsql security definer set search_path = public as $$
declare v_project public.creator_projects; v_artifact public.creator_artifacts; v_stage text;
begin
  select * into v_project from public.creator_projects where id = p_project_id and owner_id = auth.uid() for update;
  if not found then raise exception 'PROJECT_NOT_FOUND'; end if;
  if p_kind not in ('content','script') then raise exception 'ARTIFACT_KIND_NOT_ENABLED'; end if;
  if p_kind = 'script' and v_project.current_stage not in ('CONTENT_APPROVED','SCRIPT_GENERATING','SCRIPT_REVIEW','SCRIPT_APPROVED') then
    raise exception 'CONTENT_APPROVAL_REQUIRED';
  end if;
  select * into v_artifact from public.creator_artifacts
    where project_id = p_project_id and metadata->>'idempotency_key' = p_idempotency_key;
  if found then return v_artifact; end if;
  v_stage := case p_kind when 'content' then 'CONTENT_REVIEW' else 'SCRIPT_REVIEW' end;
  insert into public.creator_artifacts(project_id, stage, kind, version_number, private_storage_path, inline_text, sha256, metadata, created_by)
  values (p_project_id, v_stage, p_kind,
    coalesce((select max(version_number) + 1 from public.creator_artifacts where project_id = p_project_id and kind = p_kind), 1),
    p_private_storage_path, p_inline_text, p_sha256, jsonb_build_object('idempotency_key', p_idempotency_key), auth.uid())
  returning * into v_artifact;
  if p_kind = 'content' and v_artifact.version_number > 1 then
    update public.creator_artifacts set stale_at = now()
      where project_id = p_project_id and kind in ('script','voice','avatar','edit','final') and stale_at is null;
    delete from public.creator_reviews r using public.creator_artifacts a
      where r.artifact_id = a.id and a.project_id = p_project_id and a.kind in ('script','voice','avatar','edit','final');
    update public.creator_jobs set status = 'cancelled', error_code = 'UPSTREAM_REVISED', updated_at = now()
      where project_id = p_project_id and job_type in ('script','voice','avatar','edit','final') and status in ('queued','leased','running');
    update public.creator_projects set current_stage = 'CONTENT_REVIEW', updated_at = now() where id = p_project_id;
  end if;
  return v_artifact;
end; $$;

create or replace function public.creator_request_revision(p_project_id uuid, p_artifact_id uuid, p_notes text, p_idempotency_key text)
returns void language plpgsql security definer set search_path = public as $$
declare v_artifact public.creator_artifacts;
begin
  if not exists (select 1 from public.creator_projects where id = p_project_id and owner_id = auth.uid()) then raise exception 'PROJECT_NOT_FOUND'; end if;
  insert into public.creator_transition_requests(project_id,idempotency_key,event_code) values(p_project_id,p_idempotency_key,'REVISION_REQUESTED') on conflict do nothing;
  if not found then return; end if;
  select * into v_artifact from public.creator_artifacts where id = p_artifact_id and project_id = p_project_id;
  if not found then raise exception 'ARTIFACT_NOT_FOUND'; end if;
  insert into public.creator_reviews(project_id,artifact_id,reviewer_id,decision,artifact_version,artifact_sha256,notes)
    values(p_project_id,p_artifact_id,auth.uid(),'revision_requested',v_artifact.version_number,v_artifact.sha256,p_notes);
end; $$;

create or replace function public.creator_prepare_biometric_upload(p_project_id uuid, p_profile_kind text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  raise exception 'BIOMETRIC_UPLOADS_NOT_ENABLED';
end; $$;

revoke all on function public.creator_create_project(text,text) from public;
revoke all on function public.creator_create_artifact_version(uuid,text,text,text,text,text) from public;
revoke all on function public.creator_request_revision(uuid,uuid,text,text) from public;
revoke all on function public.creator_prepare_biometric_upload(uuid,text) from public;
grant execute on function public.creator_create_project(text,text), public.creator_create_artifact_version(uuid,text,text,text,text,text), public.creator_request_revision(uuid,uuid,text,text), public.creator_prepare_biometric_upload(uuid,text) to authenticated;

commit;
