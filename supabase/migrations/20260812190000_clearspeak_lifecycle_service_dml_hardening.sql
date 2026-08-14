-- ClearSpeak lifecycle mutation authority ends at the SECURITY DEFINER RPCs.
-- Supabase may grant table DML to service_role through default privileges, so
-- revoke it explicitly rather than relying on RLS or installation defaults.
revoke insert, update, delete, truncate
  on table public.clearspeak_accent_attempt_lifecycle
  from service_role;
