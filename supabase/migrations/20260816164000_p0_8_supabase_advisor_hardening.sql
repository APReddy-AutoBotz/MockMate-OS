-- P0-8 hosted preview advisor closure.
--
-- Security: trigger/helper SECURITY DEFINER functions are internal boundaries,
-- not public RPCs. Pin their search_path and remove API-role EXECUTE grants.
--
-- Performance: preserve the exact owner-only RLS semantics while allowing
-- PostgreSQL to initialize auth.uid() once per statement via `(select auth.uid())`.
--
-- Intentional INFO-only advisor findings are not changed here:
-- - ai_cache has RLS with no client policy because it is server-only.
-- - interview_plan_generation_reservations has RLS with no client policy and is
--   service-role-only by design.

alter function public.check_bridge_owner_consistency()
  set search_path = public, pg_temp;
alter function public.check_snapshot_item_owner_consistency()
  set search_path = public, pg_temp;
alter function public.prevent_snapshot_mutation()
  set search_path = public, pg_temp;
alter function public.prevent_generated_plan_mutation()
  set search_path = public, pg_temp;

revoke execute on function public.check_bridge_owner_consistency()
  from public, anon, authenticated;
revoke execute on function public.check_snapshot_item_owner_consistency()
  from public, anon, authenticated;
revoke execute on function public.prevent_snapshot_mutation()
  from public, anon, authenticated;
revoke execute on function public.prevent_generated_plan_mutation()
  from public, anon, authenticated;

alter policy "profiles owner access" on public.profiles
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "resume reviews owner access" on public.resume_reviews
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "interview sessions owner access" on public.interview_sessions
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "interview turns owner access" on public.interview_turns
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "clearspeak profiles owner access" on public.clearspeak_profiles
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "clearspeak sessions owner access" on public.clearspeak_sessions
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "clearspeak progress owner access" on public.clearspeak_progress
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "clearspeak ledgers owner access" on public.clearspeak_ledgers
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "clearspeak feedback owner access" on public.clearspeak_beta_feedback
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "usage owner read" on public.usage_ledger
  using (user_id = (select auth.uid()));

alter policy "Users can view own career_context_state" on public.career_context_state
  using ((select auth.uid()) = user_id);

alter policy "Users can view own career_context_items" on public.career_context_items
  using ((select auth.uid()) = user_id);

alter policy "Users can view own career_context_snapshots" on public.career_context_snapshots
  using ((select auth.uid()) = user_id);

alter policy "Users can view own career_context_snapshot_items" on public.career_context_snapshot_items
  using (
    exists (
      select 1
      from public.career_context_snapshots s
      where s.id = career_context_snapshot_items.snapshot_id
        and s.user_id = (select auth.uid())
    )
  );

alter policy "Users can view own career_context_bridges" on public.career_context_bridges
  using ((select auth.uid()) = user_id);

alter policy "Users can view own generated plans" on public.interview_generated_plans
  using ((select auth.uid()) = user_id);

alter policy "generated artifacts owner read" on public.clearspeak_generated_artifacts
  using ((select auth.uid()) = user_id);

alter policy "accent attempts owner read" on public.clearspeak_accent_attempts
  using ((select auth.uid()) = user_id);

alter policy "accent lifecycle owner read" on public.clearspeak_accent_attempt_lifecycle
  using ((select auth.uid()) = user_id);
