-- P0-5 correction: once an exact request has been successfully reserved with a
-- live submission capability, provider execution receives a short bounded lease.
-- This prevents a capability that expires during an in-flight scorer call from
-- invalidating the later commit, while still preventing indefinite mutation.
-- No provider is activated by this migration.

alter table public.clearspeak_accent_attempt_lifecycle
  add column if not exists execution_lease_expires_at timestamptz;

comment on column public.clearspeak_accent_attempt_lifecycle.execution_lease_expires_at is
  'Short server-owned lease established by exact request reservation; allows commit/cancel to finish after issuance capability expiry without extending provider execution indefinitely.';

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

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select * into l from public.clearspeak_accent_attempt_lifecycle
    where user_id=p_user_id and attempt_id=p_attempt_id for update;

  if found then
    if l.status <> 'pending'
       or l.capability_expires_at is null
       or l.authority_selector_hash is distinct from p_selector_hash
       or (l.request_hash is not null and (
            l.capability_expires_at >= now()
            or (l.execution_lease_expires_at is not null and l.execution_lease_expires_at >= now())
          )) then
      return jsonb_build_object('status','conflict');
    end if;
    -- Recovery is allowed only after both the prior capability and any reserved
    -- execution lease are over. Keep request_hash immutable; a new exact reserve
    -- must establish the next bounded execution lease.
    update public.clearspeak_accent_attempt_lifecycle
      set capability_hash=p_capability_hash,
          capability_expires_at=p_expires_at,
          execution_lease_expires_at=null,
          updated_at=now()
      where user_id=p_user_id and attempt_id=p_attempt_id;
    return jsonb_build_object('status','pending','requestHash',l.request_hash);
  end if;

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
    (user_id,attempt_id,status,capability_hash,capability_expires_at,authority_selector_hash,execution_lease_expires_at)
    values(p_user_id,p_attempt_id,'pending',p_capability_hash,p_expires_at,p_selector_hash,null);
  return jsonb_build_object('status','pending');
end $$;

create or replace function public.reserve_clearspeak_accent_attempt_v2(
  p_user_id uuid, p_attempt_id uuid, p_request_hash text, p_capability_hash text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.clearspeak_accent_attempt_lifecycle; a public.clearspeak_accent_attempts; lease_until timestamptz;
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
  -- A reservation can only start/refresh while the issuance capability is live.
  if l.capability_expires_at < now() then
    return jsonb_build_object('status','missing');
  end if;

  lease_until := now() + interval '2 minutes';
  update public.clearspeak_accent_attempt_lifecycle
    set request_hash=coalesce(request_hash,p_request_hash),
        execution_lease_expires_at=lease_until,
        updated_at=now()
    where user_id=p_user_id and attempt_id=p_attempt_id
    returning * into l;

  return jsonb_build_object(
    'status','pending',
    'requestHash',l.request_hash,
    'executionLeaseExpiresAt',l.execution_lease_expires_at
  );
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
  if l.request_hash is null then
    return jsonb_build_object('status','conflict');
  end if;
  -- Commit authority comes from the exact successful reservation, not from an
  -- issuance timestamp that may expire while provider work is already in flight.
  if l.execution_lease_expires_at is null or l.execution_lease_expires_at < now() then
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
  update public.clearspeak_accent_attempt_lifecycle
    set status='committed',execution_lease_expires_at=null,updated_at=now()
    where user_id=p_user_id and attempt_id=p_attempt_id;
  return jsonb_build_object('status','committed','requestHash',p_request_hash,'result',a.result,'replayed',false);
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
  if l.status='cancelled' then
    return jsonb_build_object('status','cancelled','requestHash',l.request_hash);
  end if;
  if l.status='committed' then
    select * into a from public.clearspeak_accent_attempts
      where user_id=p_user_id and attempt_id=p_attempt_id;
    return jsonb_build_object('status','committed','requestHash',l.request_hash,'result',a.result);
  end if;
  -- A user may still cancel an already-reserved in-flight operation during its
  -- execution lease even if the issuance capability clock elapsed meanwhile.
  if l.capability_expires_at < now()
     and (l.execution_lease_expires_at is null or l.execution_lease_expires_at < now()) then
    return jsonb_build_object('status','missing');
  end if;
  update public.clearspeak_accent_attempt_lifecycle
    set status='cancelled',execution_lease_expires_at=null,updated_at=now()
    where user_id=p_user_id and attempt_id=p_attempt_id;
  return jsonb_build_object('status','cancelled','requestHash',l.request_hash);
end $$;

revoke execute on function public.issue_clearspeak_accent_attempt_authority(uuid,uuid,text,timestamptz,text),
                           public.reserve_clearspeak_accent_attempt_v2(uuid,uuid,text,text),
                           public.commit_clearspeak_accent_attempt_v2(uuid,uuid,text,text,jsonb),
                           public.cancel_clearspeak_accent_attempt_v2(uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function public.issue_clearspeak_accent_attempt_authority(uuid,uuid,text,timestamptz,text),
                          public.reserve_clearspeak_accent_attempt_v2(uuid,uuid,text,text),
                          public.commit_clearspeak_accent_attempt_v2(uuid,uuid,text,text,jsonb),
                          public.cancel_clearspeak_accent_attempt_v2(uuid,uuid,text)
  to service_role;
