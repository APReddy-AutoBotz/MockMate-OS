-- Bound lifecycle creation to a server-issued, short-lived submission capability
-- and make individual deletion authoritative across the lifecycle/result pair.
alter table public.clearspeak_accent_attempt_lifecycle
  add column if not exists capability_hash text,
  add column if not exists capability_expires_at timestamptz;

alter table public.clearspeak_accent_attempt_lifecycle
  add constraint lifecycle_capability_hash_format
    check (capability_hash is null or capability_hash ~ '^[a-f0-9]{64}$');

create or replace function public.issue_clearspeak_accent_attempt_authority(
  p_user_id uuid, p_attempt_id uuid, p_capability_hash text, p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.clearspeak_accent_attempt_lifecycle; lifecycle_count integer;
begin
  if p_capability_hash !~ '^[a-f0-9]{64}$' or p_expires_at <= now() or p_expires_at > now() + interval '10 minutes' then
    return jsonb_build_object('status','invalid');
  end if;
  -- Serialize issuance per owner so concurrent capability requests cannot race
  -- past the hard row ceiling.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select count(*) into lifecycle_count from public.clearspeak_accent_attempt_lifecycle where user_id=p_user_id;
  if lifecycle_count >= 100 and not exists (
    select 1 from public.clearspeak_accent_attempt_lifecycle where user_id=p_user_id and attempt_id=p_attempt_id
  ) then return jsonb_build_object('status','limit'); end if;
  insert into public.clearspeak_accent_attempt_lifecycle
    (user_id,attempt_id,status,capability_hash,capability_expires_at)
    values(p_user_id,p_attempt_id,'pending',p_capability_hash,p_expires_at)
    on conflict (user_id,attempt_id) do nothing;
  select * into l from public.clearspeak_accent_attempt_lifecycle
    where user_id=p_user_id and attempt_id=p_attempt_id for update;
  if l.capability_hash is distinct from p_capability_hash then return jsonb_build_object('status','conflict'); end if;
  return jsonb_build_object('status',l.status);
end $$;

create or replace function public.reserve_clearspeak_accent_attempt_v2(
  p_user_id uuid, p_attempt_id uuid, p_request_hash text, p_capability_hash text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.clearspeak_accent_attempt_lifecycle;
begin
  select * into l from public.clearspeak_accent_attempt_lifecycle
    where user_id=p_user_id and attempt_id=p_attempt_id for update;
  if not found or l.capability_hash is distinct from p_capability_hash or l.capability_expires_at < now() then
    return jsonb_build_object('status','missing');
  end if;
  if l.request_hash is not null and l.request_hash <> p_request_hash then return jsonb_build_object('status','conflict'); end if;
  if l.request_hash is null then
    update public.clearspeak_accent_attempt_lifecycle set request_hash=p_request_hash,updated_at=now()
      where user_id=p_user_id and attempt_id=p_attempt_id returning * into l;
  end if;
  return jsonb_build_object('status',l.status,'requestHash',l.request_hash);
end $$;

create or replace function public.cancel_clearspeak_accent_attempt_v2(
  p_user_id uuid, p_attempt_id uuid, p_capability_hash text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.clearspeak_accent_attempt_lifecycle; a public.clearspeak_accent_attempts;
begin
  select * into l from public.clearspeak_accent_attempt_lifecycle
    where user_id=p_user_id and attempt_id=p_attempt_id for update;
  if not found or l.capability_hash is distinct from p_capability_hash or l.capability_expires_at < now() then
    return jsonb_build_object('status','missing');
  end if;
  if l.status='committed' then
    select * into a from public.clearspeak_accent_attempts where user_id=p_user_id and attempt_id=p_attempt_id;
    return jsonb_build_object('status','committed','requestHash',l.request_hash,'result',a.result);
  end if;
  update public.clearspeak_accent_attempt_lifecycle set status='cancelled',updated_at=now()
    where user_id=p_user_id and attempt_id=p_attempt_id;
  return jsonb_build_object('status','cancelled','requestHash',l.request_hash);
end $$;

create or replace function public.delete_clearspeak_accent_attempt(
  p_user_id uuid, p_attempt_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.clearspeak_accent_attempt_lifecycle;
begin
  select * into l from public.clearspeak_accent_attempt_lifecycle
    where user_id=p_user_id and attempt_id=p_attempt_id for update;
  if not found then
    delete from public.clearspeak_accent_attempts where user_id=p_user_id and attempt_id=p_attempt_id;
    return jsonb_build_object('status','missing');
  end if;
  perform set_config('app.allow_protected_deletion','true',true);
  delete from public.clearspeak_accent_attempts where user_id=p_user_id and attempt_id=p_attempt_id;
  delete from public.clearspeak_accent_attempt_lifecycle where user_id=p_user_id and attempt_id=p_attempt_id;
  return jsonb_build_object('status','deleted');
end $$;

revoke execute on function public.reserve_clearspeak_accent_attempt(uuid,uuid,text) from service_role;
revoke execute on function public.cancel_clearspeak_accent_attempt(uuid,uuid) from service_role;
revoke execute on function public.issue_clearspeak_accent_attempt_authority(uuid,uuid,text,timestamptz) from public,anon,authenticated;
revoke execute on function public.reserve_clearspeak_accent_attempt_v2(uuid,uuid,text,text) from public,anon,authenticated;
revoke execute on function public.cancel_clearspeak_accent_attempt_v2(uuid,uuid,text) from public,anon,authenticated;
revoke execute on function public.delete_clearspeak_accent_attempt(uuid,uuid) from public,anon,authenticated;
grant execute on function public.issue_clearspeak_accent_attempt_authority(uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.reserve_clearspeak_accent_attempt_v2(uuid,uuid,text,text) to service_role;
grant execute on function public.cancel_clearspeak_accent_attempt_v2(uuid,uuid,text) to service_role;
grant execute on function public.delete_clearspeak_accent_attempt(uuid,uuid) to service_role;
