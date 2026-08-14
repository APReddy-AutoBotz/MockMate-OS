-- Recover a lost authority response by rotating the capability only while the
-- exact server-validated selector remains pending, unreserved, and unexpired.
alter table public.clearspeak_accent_attempt_lifecycle
  add column if not exists authority_selector_hash text;

alter table public.clearspeak_accent_attempt_lifecycle
  add constraint lifecycle_authority_selector_hash_format
    check (authority_selector_hash is null or authority_selector_hash ~ '^[a-f0-9]{64}$');

drop function if exists public.issue_clearspeak_accent_attempt_authority(uuid,uuid,text,timestamptz);

create function public.issue_clearspeak_accent_attempt_authority(
  p_user_id uuid, p_attempt_id uuid, p_capability_hash text,
  p_expires_at timestamptz, p_selector_hash text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.clearspeak_accent_attempt_lifecycle; lifecycle_count integer;
begin
  if p_capability_hash !~ '^[a-f0-9]{64}$' or p_selector_hash !~ '^[a-f0-9]{64}$'
     or p_expires_at <= now() or p_expires_at > now() + interval '10 minutes' then
    return jsonb_build_object('status','invalid');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into l from public.clearspeak_accent_attempt_lifecycle
    where user_id=p_user_id and attempt_id=p_attempt_id for update;
  if not found then
    select count(*) into lifecycle_count from public.clearspeak_accent_attempt_lifecycle where user_id=p_user_id;
    if lifecycle_count >= 100 then return jsonb_build_object('status','limit'); end if;
    insert into public.clearspeak_accent_attempt_lifecycle
      (user_id,attempt_id,status,capability_hash,capability_expires_at,authority_selector_hash)
      values(p_user_id,p_attempt_id,'pending',p_capability_hash,p_expires_at,p_selector_hash);
    return jsonb_build_object('status','pending');
  end if;
  if l.status <> 'pending' or l.request_hash is not null
     or l.capability_expires_at is null or l.capability_expires_at < now()
     or l.authority_selector_hash is distinct from p_selector_hash then
    return jsonb_build_object('status','conflict');
  end if;
  -- The locked update invalidates the prior capability before returning.
  update public.clearspeak_accent_attempt_lifecycle
    set capability_hash=p_capability_hash, capability_expires_at=p_expires_at, updated_at=now()
    where user_id=p_user_id and attempt_id=p_attempt_id;
  return jsonb_build_object('status','pending');
end $$;

revoke execute on function public.issue_clearspeak_accent_attempt_authority(uuid,uuid,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.issue_clearspeak_accent_attempt_authority(uuid,uuid,text,timestamptz,text) to service_role;
