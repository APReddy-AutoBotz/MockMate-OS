-- Runtime completion is forward-only: the exact immutable response supports
-- byte-for-byte idempotent replay without retaining audio or transcripts.
alter table public.clearspeak_accent_attempts add column if not exists result jsonb not null;

-- Protected account deletion remains transactional and includes V1 derivatives.
create or replace function public.delete_user_career_context(target_user_id uuid) returns void as $$
begin
  perform set_config('app.allow_protected_deletion','true',true);
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
revoke execute on function public.delete_user_career_context(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_career_context(uuid) to service_role;
