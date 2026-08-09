-- Converge grounded Interview plan generation on one recoverable reservation and
-- one lifecycle usage charge. Session binding consumes authority, but never quota.

ALTER TABLE public.interview_plan_generation_reservations
  ADD COLUMN IF NOT EXISTS reservation_token UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS usage_charged BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS usage_date DATE NOT NULL DEFAULT current_date;

-- Finalized artifacts are the canonical winner; their legacy reservations are no
-- longer useful. Unfinalized legacy reservations receive an expired lease so one
-- retry can take them over without charging again.
DELETE FROM public.interview_plan_generation_reservations r
USING public.interview_generated_plans p
WHERE p.user_id=r.user_id AND p.bridge_id=r.bridge_id;
UPDATE public.interview_plan_generation_reservations SET lease_expires_at=now()
WHERE lease_expires_at>now();

CREATE OR REPLACE FUNCTION public.reserve_interview_plan_generation_tx(p_user_id UUID,p_snapshot_id UUID,p_bridge_id UUID)
RETURNS JSONB AS $$
DECLARE v_bridge RECORD; v_plan RECORD; v_reservation RECORD; v_usage RECORD;
  v_today DATE:=current_date; v_token UUID:=gen_random_uuid(); v_now TIMESTAMPTZ:=clock_timestamp();
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_bridge_id::text,0));
  SELECT * INTO v_plan FROM public.interview_generated_plans WHERE user_id=p_user_id AND bridge_id=p_bridge_id;
  IF FOUND THEN RETURN jsonb_build_object('generate',false,'plan',to_jsonb(v_plan)); END IF;

  SELECT * INTO v_bridge FROM public.career_context_bridges WHERE id=p_bridge_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR v_bridge.status<>'confirmed' OR v_bridge.snapshot_id<>p_snapshot_id OR v_bridge.target_module<>'interview' THEN
    RAISE EXCEPTION 'Grounded Interview bridge is not confirmed, owned, or lineage-compatible';
  END IF;

  SELECT * INTO v_reservation FROM public.interview_plan_generation_reservations
  WHERE user_id=p_user_id AND bridge_id=p_bridge_id FOR UPDATE;
  IF FOUND THEN
    IF v_reservation.snapshot_id<>p_snapshot_id THEN RAISE EXCEPTION 'Grounded Interview reservation lineage mismatch'; END IF;
    IF v_reservation.lease_expires_at>v_now THEN
      RETURN jsonb_build_object('generate',false,'leaseExpiresAt',v_reservation.lease_expires_at);
    END IF;
    UPDATE public.interview_plan_generation_reservations
      SET reservation_token=v_token,lease_expires_at=v_now+interval '30 seconds'
      WHERE user_id=p_user_id AND bridge_id=p_bridge_id;
    RETURN jsonb_build_object('generate',true,'reservationToken',v_token,'takeover',true,'usageCharged',false);
  END IF;

  INSERT INTO public.usage_ledger(user_id,usage_date,feature,used,limit_value,updated_at)
  VALUES(p_user_id,v_today,'interview_question',0,20,v_now) ON CONFLICT(user_id,usage_date,feature) DO NOTHING;
  SELECT * INTO v_usage FROM public.usage_ledger
  WHERE user_id=p_user_id AND usage_date=v_today AND feature='interview_question' FOR UPDATE;
  IF v_usage.used>=20 THEN RAISE EXCEPTION 'Interview question usage limit reached'; END IF;
  UPDATE public.usage_ledger SET used=used+1,limit_value=20,updated_at=v_now
  WHERE user_id=p_user_id AND usage_date=v_today AND feature='interview_question';
  INSERT INTO public.interview_plan_generation_reservations
    (user_id,bridge_id,snapshot_id,reservation_token,lease_expires_at,usage_charged,usage_date)
  VALUES(p_user_id,p_bridge_id,p_snapshot_id,v_token,v_now+interval '30 seconds',true,v_today);
  RETURN jsonb_build_object('generate',true,'reservationToken',v_token,'takeover',false,'usageCharged',true);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;

DROP FUNCTION IF EXISTS public.finalize_interview_plan_generation_tx(UUID,UUID,UUID,TEXT,JSONB);
CREATE FUNCTION public.finalize_interview_plan_generation_tx(p_user_id UUID,p_snapshot_id UUID,p_bridge_id UUID,p_reservation_token UUID,p_plan_hash TEXT,p_plan_payload JSONB)
RETURNS JSONB AS $$
DECLARE v_reservation RECORD; v_plan RECORD;
BEGIN
  SELECT * INTO v_plan FROM public.interview_generated_plans WHERE user_id=p_user_id AND bridge_id=p_bridge_id;
  IF FOUND THEN RETURN to_jsonb(v_plan); END IF;
  SELECT * INTO v_reservation FROM public.interview_plan_generation_reservations
  WHERE user_id=p_user_id AND bridge_id=p_bridge_id AND snapshot_id=p_snapshot_id FOR UPDATE;
  IF NOT FOUND OR v_reservation.reservation_token<>p_reservation_token THEN
    RAISE EXCEPTION 'Authoritative plan generation reservation is missing, stale, or not owned';
  END IF;
  INSERT INTO public.interview_generated_plans(user_id,snapshot_id,bridge_id,plan_hash,plan_version,plan_payload)
  VALUES(p_user_id,p_snapshot_id,p_bridge_id,p_plan_hash,1,p_plan_payload) RETURNING * INTO v_plan;
  DELETE FROM public.interview_plan_generation_reservations WHERE user_id=p_user_id AND bridge_id=p_bridge_id;
  RETURN to_jsonb(v_plan);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;

CREATE FUNCTION public.release_interview_plan_generation_tx(p_user_id UUID,p_bridge_id UUID,p_reservation_token UUID)
RETURNS JSONB AS $$
DECLARE v_reservation RECORD; v_plan RECORD;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_bridge_id::text,0));
  SELECT * INTO v_plan FROM public.interview_generated_plans WHERE user_id=p_user_id AND bridge_id=p_bridge_id;
  IF FOUND THEN RETURN jsonb_build_object('released',false,'finalized',true); END IF;
  SELECT * INTO v_reservation FROM public.interview_plan_generation_reservations
  WHERE user_id=p_user_id AND bridge_id=p_bridge_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('released',false,'finalized',false); END IF;
  IF v_reservation.reservation_token<>p_reservation_token THEN
    RETURN jsonb_build_object('released',false,'stale',true);
  END IF;
  DELETE FROM public.interview_plan_generation_reservations WHERE user_id=p_user_id AND bridge_id=p_bridge_id;
  IF v_reservation.usage_charged THEN
    UPDATE public.usage_ledger SET used=GREATEST(used-1,0),updated_at=now()
    WHERE user_id=p_user_id AND usage_date=v_reservation.usage_date AND feature='interview_question';
  END IF;
  RETURN jsonb_build_object('released',true,'refunded',v_reservation.usage_charged);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;

-- The grounded lifecycle charge is owned by the plan reservation. Binding only
-- validates and consumes the already-authorized plan/bridge/session lineage.
CREATE OR REPLACE FUNCTION public.bind_interview_plan_session_tx(p_user_id UUID,p_plan_id UUID,p_plan_hash TEXT,p_bridge_id UUID,p_session_id UUID)
RETURNS JSONB AS $$
DECLARE v_plan RECORD; v_bridge RECORD; v_session RECORD; v_now TIMESTAMPTZ:=now();
BEGIN
  SELECT * INTO v_plan FROM public.interview_generated_plans WHERE id=p_plan_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Authoritative plan not found or not owned'; END IF;
  IF v_plan.plan_hash<>p_plan_hash OR v_plan.bridge_id<>p_bridge_id THEN RAISE EXCEPTION 'Authoritative plan lineage mismatch'; END IF;
  IF v_plan.session_id IS NOT NULL THEN
    IF v_plan.session_id=p_session_id THEN RETURN jsonb_build_object('sessionId',v_plan.session_id,'replayed',true,'usageCharged',false); END IF;
    RAISE EXCEPTION 'Authoritative plan has already created a canonical session';
  END IF;
  SELECT * INTO v_bridge FROM public.career_context_bridges WHERE id=p_bridge_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR v_bridge.status<>'confirmed' OR v_bridge.snapshot_id<>v_plan.snapshot_id OR v_bridge.target_module<>'interview' THEN
    RAISE EXCEPTION 'Bridge is not confirmed or plan lineage mismatches';
  END IF;
  SELECT * INTO v_session FROM public.interview_sessions WHERE id=p_session_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR v_session.setup#>>'{interviewPlan,authority,planId}'<>p_plan_id::text OR v_session.setup#>>'{interviewPlan,authority,planHash}'<>p_plan_hash THEN
    RAISE EXCEPTION 'Session does not contain the exact authoritative plan selector';
  END IF;
  UPDATE public.interview_generated_plans SET session_id=p_session_id,consumed_at=v_now WHERE id=p_plan_id;
  UPDATE public.career_context_bridges SET status='consumed',target_session_id=p_session_id,consumed_at=v_now,updated_at=v_now WHERE id=p_bridge_id;
  RETURN jsonb_build_object('sessionId',p_session_id,'replayed',false,'usageCharged',false);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;

REVOKE EXECUTE ON FUNCTION public.reserve_interview_plan_generation_tx(UUID,UUID,UUID) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_interview_plan_generation_tx(UUID,UUID,UUID,UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.release_interview_plan_generation_tx(UUID,UUID,UUID) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.bind_interview_plan_session_tx(UUID,UUID,TEXT,UUID,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_interview_plan_generation_tx(UUID,UUID,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_interview_plan_generation_tx(UUID,UUID,UUID,UUID,TEXT,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_interview_plan_generation_tx(UUID,UUID,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.bind_interview_plan_session_tx(UUID,UUID,TEXT,UUID,UUID) TO service_role;
