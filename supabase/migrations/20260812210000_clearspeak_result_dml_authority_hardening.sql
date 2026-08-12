-- Accent result mutation is inseparable from its authoritative lifecycle row.
-- Supabase default grants can otherwise let application roles bypass the
-- capability-bound commit/delete transactions and strand one side of the pair.
drop policy if exists "accent attempts owner delete" on public.clearspeak_accent_attempts;

revoke insert, update, delete, truncate
  on table public.clearspeak_accent_attempts
  from public, anon, authenticated, service_role;

-- Owner history remains readable through RLS. All normal result mutations are
-- performed inside the existing SECURITY DEFINER lifecycle RPCs.
grant select on table public.clearspeak_accent_attempts to authenticated;
