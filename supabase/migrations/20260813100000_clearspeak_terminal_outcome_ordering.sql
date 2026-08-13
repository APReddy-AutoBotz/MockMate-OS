-- Terminal lifecycle outcomes must be observed before pending-only expiry and
-- reservation checks. A cancelled-before-reserve row has no request hash to
-- bind, so later reserve/commit calls replay cancellation without reviving it.
-- Reserved terminal rows still reject changed request content.
create or replace function public.reserve_clearspeak_accent_attempt_v2(
  p_user_id uuid, p_attempt_id uuid, p_request_hash text, p_capability_hash text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.clearspeak_accent_attempt_lifecycle; a public.clearspeak_accent_attempts;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into l from public.clearspeak_accent_attempt_lifecycle
    where user_id=p_user_id and attempt_id=p_attempt_id for update;
  if not found or l.capability_hash is distinct from p_capability_hash then
    return jsonb_build_object('status','missing');
  end if;
  if l.request_hash is not null and l.request_hash <> p_request_hash then
    return jsonb_build_object('status','conflict');
  end if;
  if l.status='cancelled' then
    return jsonb_build_object('status','cancelled','requestHash',l.request_hash);
  end if;
  if l.status='committed' then
    select * into a from public.clearspeak_accent_attempts
      where user_id=p_user_id and attempt_id=p_attempt_id;
    return jsonb_build_object('status','committed','requestHash',l.request_hash,'result',a.result);
  end if;
  if l.capability_expires_at < now() then
    return jsonb_build_object('status','missing');
  end if;
  if l.request_hash is null then
    update public.clearspeak_accent_attempt_lifecycle
      set request_hash=p_request_hash,updated_at=now()
      where user_id=p_user_id and attempt_id=p_attempt_id returning * into l;
  end if;
  return jsonb_build_object('status','pending','requestHash',l.request_hash);
end $$;

create or replace function public.commit_clearspeak_accent_attempt_v2(
  p_user_id uuid, p_attempt_id uuid, p_request_hash text,
  p_capability_hash text, p_attempt jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.clearspeak_accent_attempt_lifecycle; a public.clearspeak_accent_attempts;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into l from public.clearspeak_accent_attempt_lifecycle
    where user_id=p_user_id and attempt_id=p_attempt_id for update;
  if not found or l.capability_hash is distinct from p_capability_hash then
    return jsonb_build_object('status','missing');
  end if;
  if l.request_hash is not null and l.request_hash <> p_request_hash then
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
  -- Only reserve may establish request identity for a pending mutation.
  if l.request_hash is null then
    return jsonb_build_object('status','conflict');
  end if;
  if l.capability_expires_at < now() then
    return jsonb_build_object('status','missing');
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

revoke execute on function public.reserve_clearspeak_accent_attempt_v2(uuid,uuid,text,text),
                           public.commit_clearspeak_accent_attempt_v2(uuid,uuid,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.reserve_clearspeak_accent_attempt_v2(uuid,uuid,text,text),
                          public.commit_clearspeak_accent_attempt_v2(uuid,uuid,text,text,jsonb)
  to service_role;
