-- Make attempt-authority issuance a durable, bounded state machine. A lost
-- issuance response must remain recoverable after capability expiry, but only
-- for the same owner, attempt, and server-owned selector while still pending
-- and unreserved. The row lock makes rotation race safely with reserve/cancel.
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

  -- Serialize issuance and reclamation per owner so concurrent requests cannot
  -- race the lifecycle ceiling or replace each other's authority.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into l from public.clearspeak_accent_attempt_lifecycle
    where user_id=p_user_id and attempt_id=p_attempt_id for update;

  if found then
    if l.status <> 'pending' or l.request_hash is not null
       or l.capability_expires_at is null
       or l.authority_selector_hash is distinct from p_selector_hash then
      return jsonb_build_object('status','conflict');
    end if;
    -- Exact-selector recovery is allowed even after expiry. The locked update
    -- atomically invalidates every prior capability without disclosing it.
    update public.clearspeak_accent_attempt_lifecycle
      set capability_hash=p_capability_hash,
          capability_expires_at=p_expires_at,
          updated_at=now()
      where user_id=p_user_id and attempt_id=p_attempt_id;
    return jsonb_build_object('status','pending');
  end if;

  -- Expired, unreserved issuance ghosts contain no result and no request
  -- identity. Reclaim them under the same owner lock before enforcing quota so
  -- response-loss ghosts cannot permanently consume the bounded allowance.
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
