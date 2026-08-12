-- Retire the capability-free commit entry point. ClearSpeak attempt mutation
-- authority is exclusively the capability-bound reserve/commit/cancel RPCs.
revoke execute on function public.commit_clearspeak_accent_attempt(uuid,uuid,text,jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.commit_clearspeak_accent_attempt_v2(
  p_user_id uuid, p_attempt_id uuid, p_request_hash text,
  p_capability_hash text, p_attempt jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.clearspeak_accent_attempt_lifecycle; a public.clearspeak_accent_attempts;
begin
  select * into l from public.clearspeak_accent_attempt_lifecycle
    where user_id=p_user_id and attempt_id=p_attempt_id for update;
  if not found or l.capability_hash is distinct from p_capability_hash then
    return jsonb_build_object('status','missing');
  end if;
  -- A commit is never allowed to supply the first request hash. Only the
  -- capability-bound reservation may bind an unreserved authority row.
  if l.request_hash is null or l.request_hash <> p_request_hash then
    return jsonb_build_object('status','conflict');
  end if;
  if l.status='cancelled' then
    return jsonb_build_object('status','cancelled','requestHash',l.request_hash);
  end if;
  if l.status='committed' then
    select * into a from public.clearspeak_accent_attempts
      where user_id=p_user_id and attempt_id=p_attempt_id;
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

revoke execute on function public.commit_clearspeak_accent_attempt_v2(uuid,uuid,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.commit_clearspeak_accent_attempt_v2(uuid,uuid,text,text,jsonb)
  to service_role;
