-- Converge the complete ClearSpeak Accent V1 mutation surface after all table
-- and RPC migrations have been applied. Supabase default privileges may grant
-- table mutation rights to API roles, and TRUNCATE bypasses RLS entirely.
revoke insert, update, delete, truncate
  on table public.clearspeak_accent_attempt_lifecycle,
           public.clearspeak_accent_attempts
  from public, anon, authenticated, service_role;

-- Retire every capability-free lifecycle mutation signature for every API
-- role. These functions remain only for migration compatibility and are not a
-- sanctioned application boundary.
revoke execute on function public.reserve_clearspeak_accent_attempt(uuid,uuid,text)
  from public, anon, authenticated, service_role;
revoke execute on function public.commit_clearspeak_accent_attempt(uuid,uuid,text,jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function public.cancel_clearspeak_accent_attempt(uuid,uuid)
  from public, anon, authenticated, service_role;

-- Owner history and lifecycle status remain readable through their RLS
-- policies. Mutations are available only through the exact capability-bound
-- SECURITY DEFINER functions (plus the protected deletion transactions).
grant select on table public.clearspeak_accent_attempt_lifecycle,
                      public.clearspeak_accent_attempts
  to authenticated;

revoke execute on function public.issue_clearspeak_accent_attempt_authority(uuid,uuid,text,timestamptz,text)
  from public, anon, authenticated;
revoke execute on function public.reserve_clearspeak_accent_attempt_v2(uuid,uuid,text,text)
  from public, anon, authenticated;
revoke execute on function public.commit_clearspeak_accent_attempt_v2(uuid,uuid,text,text,jsonb)
  from public, anon, authenticated;
revoke execute on function public.cancel_clearspeak_accent_attempt_v2(uuid,uuid,text)
  from public, anon, authenticated;
revoke execute on function public.delete_clearspeak_accent_attempt(uuid,uuid)
  from public, anon, authenticated;
revoke execute on function public.delete_user_career_context(uuid)
  from public, anon, authenticated;

grant execute on function public.issue_clearspeak_accent_attempt_authority(uuid,uuid,text,timestamptz,text),
                          public.reserve_clearspeak_accent_attempt_v2(uuid,uuid,text,text),
                          public.commit_clearspeak_accent_attempt_v2(uuid,uuid,text,text,jsonb),
                          public.cancel_clearspeak_accent_attempt_v2(uuid,uuid,text),
                          public.delete_clearspeak_accent_attempt(uuid,uuid),
                          public.delete_user_career_context(uuid)
  to service_role;
