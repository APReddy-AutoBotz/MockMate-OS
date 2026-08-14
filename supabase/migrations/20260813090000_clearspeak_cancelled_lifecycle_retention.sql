-- Cancelled authorities are terminal replay tombstones, not active practice
-- capacity. Keep them for one capability window so a lost cancellation response
-- can be replayed exactly, then reclaim them under the per-owner issuance lock.
-- Committed lifecycle rows remain canonical for history/replay and pending rows
-- remain the only state counted by the active-authority ceiling.
create index if not exists clearspeak_lifecycle_owner_status_updated_idx
  on public.clearspeak_accent_attempt_lifecycle (user_id, status, updated_at);

create or replace function public.issue_clearspeak_accent_attempt_authority(
  p_user_id uuid, p_attempt_id uuid, p_capability_hash text,
  p_expires_at timestamptz, p_selector_hash text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.clearspeak_accent_attempt_lifecycle; active_count integer;
begin
  if p_capability_hash !~ '^[a-f0-9]{64}$' or p_selector_hash !~ '^[a-f0-9]{64}$'
     or p_expires_at <= now() or p_expires_at > now() + interval '10 minutes' then
    return jsonb_build_object('status','invalid');
  end if;

  -- Issue, reclaim and cancel all take this owner lock. The active ceiling is
  -- therefore exact even when different attempt IDs transition concurrently.
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
    update public.clearspeak_accent_attempt_lifecycle
      set capability_hash=p_capability_hash,
          capability_expires_at=p_expires_at,
          updated_at=now()
      where user_id=p_user_id and attempt_id=p_attempt_id;
    return jsonb_build_object('status','pending','requestHash',l.request_hash);
  end if;

  -- Unreserved expiry ghosts have no request identity. Cancelled tombstones are
  -- retained for ten minutes for exact response-loss replay, then compacted.
  delete from public.clearspeak_accent_attempt_lifecycle
    where user_id=p_user_id
      and ((status='pending' and request_hash is null
            and capability_expires_at is not null and capability_expires_at < now())
        or (status='cancelled' and updated_at < now() - interval '10 minutes'));

  select count(*) into active_count
    from public.clearspeak_accent_attempt_lifecycle
    where user_id=p_user_id and status='pending';
  if active_count >= 100 then return jsonb_build_object('status','limit'); end if;

  insert into public.clearspeak_accent_attempt_lifecycle
    (user_id,attempt_id,status,capability_hash,capability_expires_at,authority_selector_hash)
    values(p_user_id,p_attempt_id,'pending',p_capability_hash,p_expires_at,p_selector_hash);
  return jsonb_build_object('status','pending');
end $$;

create or replace function public.cancel_clearspeak_accent_attempt_v2(
  p_user_id uuid, p_attempt_id uuid, p_capability_hash text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.clearspeak_accent_attempt_lifecycle; a public.clearspeak_accent_attempts;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into l from public.clearspeak_accent_attempt_lifecycle
    where user_id=p_user_id and attempt_id=p_attempt_id for update;
  if not found or l.capability_hash is distinct from p_capability_hash then
    return jsonb_build_object('status','missing');
  end if;
  -- Terminal outcomes replay canonically even after capability expiry. Pending
  -- mutation still requires a live capability and can never revive a terminal.
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
  update public.clearspeak_accent_attempt_lifecycle
    set status='cancelled',updated_at=now()
    where user_id=p_user_id and attempt_id=p_attempt_id;
  return jsonb_build_object('status','cancelled','requestHash',l.request_hash);
end $$;

revoke execute on function public.issue_clearspeak_accent_attempt_authority(uuid,uuid,text,timestamptz,text),
                           public.cancel_clearspeak_accent_attempt_v2(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.issue_clearspeak_accent_attempt_authority(uuid,uuid,text,timestamptz,text),
                          public.cancel_clearspeak_accent_attempt_v2(uuid,uuid,text)
  to service_role;
