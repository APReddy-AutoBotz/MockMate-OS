-- Authoritative, derived-only lifecycle for ClearSpeak V1 submissions.  This
-- table is a serialization fence; it must never contain audio or provider data.
create table if not exists public.clearspeak_accent_attempt_lifecycle (
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_id uuid not null,
  request_hash text check (request_hash is null or request_hash ~ '^[a-f0-9]{64}$'),
  status text not null check (status in ('pending', 'cancelled', 'committed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, attempt_id),
  constraint lifecycle_committed_has_hash check (status <> 'committed' or request_hash is not null)
);

alter table public.clearspeak_accent_attempt_lifecycle enable row level security;
create policy "accent lifecycle owner read" on public.clearspeak_accent_attempt_lifecycle
  for select to authenticated using (auth.uid() = user_id);
grant select on public.clearspeak_accent_attempt_lifecycle to authenticated;
revoke all on public.clearspeak_accent_attempt_lifecycle from anon;
revoke insert, update, delete on public.clearspeak_accent_attempt_lifecycle from authenticated;

-- Reserve and inspect are deliberately separate from commit so audio remains
-- process-memory-only. Every transition locks the same lifecycle row.
create or replace function public.reserve_clearspeak_accent_attempt(
  p_user_id uuid, p_attempt_id uuid, p_request_hash text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.clearspeak_accent_attempt_lifecycle;
begin
  insert into public.clearspeak_accent_attempt_lifecycle(user_id, attempt_id, request_hash, status)
    values (p_user_id, p_attempt_id, p_request_hash, 'pending')
    on conflict (user_id, attempt_id) do nothing;
  select * into l from public.clearspeak_accent_attempt_lifecycle
    where user_id=p_user_id and attempt_id=p_attempt_id for update;
  if l.request_hash is not null and l.request_hash <> p_request_hash then
    return jsonb_build_object('status','conflict');
  end if;
  if l.request_hash is null and l.status='cancelled' then
    update public.clearspeak_accent_attempt_lifecycle set request_hash=p_request_hash, updated_at=now()
      where user_id=p_user_id and attempt_id=p_attempt_id returning * into l;
  end if;
  return jsonb_build_object('status',l.status,'requestHash',l.request_hash);
end $$;

create or replace function public.commit_clearspeak_accent_attempt(
  p_user_id uuid, p_attempt_id uuid, p_request_hash text, p_attempt jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.clearspeak_accent_attempt_lifecycle; a public.clearspeak_accent_attempts;
begin
  select * into l from public.clearspeak_accent_attempt_lifecycle
    where user_id=p_user_id and attempt_id=p_attempt_id for update;
  if not found then return jsonb_build_object('status','missing'); end if;
  if l.request_hash <> p_request_hash then return jsonb_build_object('status','conflict'); end if;
  if l.status='cancelled' then return jsonb_build_object('status','cancelled','requestHash',l.request_hash); end if;
  if l.status='committed' then
    select * into a from public.clearspeak_accent_attempts where user_id=p_user_id and attempt_id=p_attempt_id;
    return jsonb_build_object('status','committed','requestHash',l.request_hash,'result',a.result,'replayed',true);
  end if;
  insert into public.clearspeak_accent_attempts(user_id,attempt_id,request_hash,prompt_id,prompt_version,prompt_content_hash,
    profile_id,profile_version,reference_set_version,scoring_policy_version,scoring_contract_version,evidence_provenance,
    fixture,dimensions,coaching,duration_ms,mime_type,result)
  values (p_user_id,p_attempt_id,p_request_hash,(p_attempt->>'prompt_id')::uuid,(p_attempt->>'prompt_version')::integer,
    p_attempt->>'prompt_content_hash',p_attempt->>'profile_id',(p_attempt->>'profile_version')::integer,
    p_attempt->>'reference_set_version',p_attempt->>'scoring_policy_version',p_attempt->>'scoring_contract_version',
    p_attempt->>'evidence_provenance',(p_attempt->>'fixture')::boolean,p_attempt->'dimensions',p_attempt->'coaching',
    (p_attempt->>'duration_ms')::integer,p_attempt->>'mime_type',p_attempt->'result') returning * into a;
  update public.clearspeak_accent_attempt_lifecycle set status='committed',updated_at=now()
    where user_id=p_user_id and attempt_id=p_attempt_id;
  return jsonb_build_object('status','committed','requestHash',p_request_hash,'result',a.result,'replayed',false);
end $$;

create or replace function public.cancel_clearspeak_accent_attempt(
  p_user_id uuid, p_attempt_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.clearspeak_accent_attempt_lifecycle; a public.clearspeak_accent_attempts;
begin
  insert into public.clearspeak_accent_attempt_lifecycle(user_id,attempt_id,status)
    values(p_user_id,p_attempt_id,'cancelled') on conflict (user_id,attempt_id) do nothing;
  select * into l from public.clearspeak_accent_attempt_lifecycle
    where user_id=p_user_id and attempt_id=p_attempt_id for update;
  if l.status='committed' then
    select * into a from public.clearspeak_accent_attempts where user_id=p_user_id and attempt_id=p_attempt_id;
    return jsonb_build_object('status','committed','requestHash',l.request_hash,'result',a.result);
  end if;
  update public.clearspeak_accent_attempt_lifecycle set status='cancelled',updated_at=now()
    where user_id=p_user_id and attempt_id=p_attempt_id;
  return jsonb_build_object('status','cancelled','requestHash',l.request_hash);
end $$;

revoke execute on function public.reserve_clearspeak_accent_attempt(uuid,uuid,text) from public,anon,authenticated;
revoke execute on function public.commit_clearspeak_accent_attempt(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke execute on function public.cancel_clearspeak_accent_attempt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_clearspeak_accent_attempt(uuid,uuid,text) to service_role;
grant execute on function public.commit_clearspeak_accent_attempt(uuid,uuid,text,jsonb) to service_role;
grant execute on function public.cancel_clearspeak_accent_attempt(uuid,uuid) to service_role;

-- The protected deletion routine must remove both result and lifecycle rows.
create or replace function public.delete_user_career_context(target_user_id uuid) returns void as $$
begin
  perform set_config('app.allow_protected_deletion','true',true);
  delete from public.clearspeak_accent_attempt_lifecycle where user_id=target_user_id;
  delete from public.clearspeak_accent_attempts where user_id=target_user_id;
  delete from public.clearspeak_generated_artifacts where user_id=target_user_id;
  delete from public.interview_generated_plans where user_id=target_user_id;
  delete from public.career_context_snapshot_items where snapshot_id in (select id from public.career_context_snapshots where user_id=target_user_id) or item_id in (select id from public.career_context_items where user_id=target_user_id);
  delete from public.career_context_bridges where user_id=target_user_id;
  delete from public.career_context_snapshots where user_id=target_user_id;
  delete from public.career_context_items where user_id=target_user_id;
  delete from public.career_context_state where user_id=target_user_id;
end;
$$ language plpgsql security definer set search_path=public,pg_temp;
revoke execute on function public.delete_user_career_context(uuid) from public,anon,authenticated;
grant execute on function public.delete_user_career_context(uuid) to service_role;
