-- Recover a reserved pending attempt after capability/response loss without
-- changing its request identity. Exact content may continue; changed content
-- is rejected later by the capability-bound reserve/commit request-hash fence.
create or replace function public.issue_clearspeak_accent_attempt_authority(
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

  if found then
    if l.status <> 'pending'
       or l.capability_expires_at is null
       or l.authority_selector_hash is distinct from p_selector_hash
       or (l.request_hash is not null and l.capability_expires_at >= now()) then
      return jsonb_build_object('status','conflict');
    end if;
    -- Rotation never clears or changes request_hash. This makes an expired
    -- reserved attempt recoverable only by an exact-content reserve retry.
    update public.clearspeak_accent_attempt_lifecycle
      set capability_hash=p_capability_hash,
          capability_expires_at=p_expires_at,
          updated_at=now()
      where user_id=p_user_id and attempt_id=p_attempt_id;
    return jsonb_build_object('status','pending','requestHash',l.request_hash);
  end if;

  -- Only issuance ghosts are reclaimable. A reserved request is canonical and
  -- remains available for exact recovery instead of being deleted for quota.
  delete from public.clearspeak_accent_attempt_lifecycle
    where user_id=p_user_id
      and status='pending'
      and request_hash is null
      and capability_expires_at is not null
      and capability_expires_at < now();

  select count(*) into lifecycle_count
    from public.clearspeak_accent_attempt_lifecycle where user_id=p_user_id;
  if lifecycle_count >= 100 then return jsonb_build_object('status','limit'); end if;

  insert into public.clearspeak_accent_attempt_lifecycle
    (user_id,attempt_id,status,capability_hash,capability_expires_at,authority_selector_hash)
    values(p_user_id,p_attempt_id,'pending',p_capability_hash,p_expires_at,p_selector_hash);
  return jsonb_build_object('status','pending');
end $$;

revoke execute on function public.issue_clearspeak_accent_attempt_authority(uuid,uuid,text,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.issue_clearspeak_accent_attempt_authority(uuid,uuid,text,timestamptz,text)
  to service_role;
