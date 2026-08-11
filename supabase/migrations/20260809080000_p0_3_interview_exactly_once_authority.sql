-- Keep elected plan workers live during provider execution and make grounded
-- Interview session creation + plan/bridge binding one atomic authority boundary.

CREATE OR REPLACE FUNCTION public.renew_interview_plan_generation_tx(
  p_user_id UUID, p_bridge_id UUID, p_reservation_token UUID
) RETURNS JSONB AS $$
DECLARE v_reservation RECORD; v_plan RECORD; v_now TIMESTAMPTZ:=clock_timestamp();
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_bridge_id::text,0));
  SELECT * INTO v_plan FROM public.interview_generated_plans
    WHERE user_id=p_user_id AND bridge_id=p_bridge_id;
  IF FOUND THEN RETURN jsonb_build_object('renewed',false,'finalized',true); END IF;
  SELECT * INTO v_reservation FROM public.interview_plan_generation_reservations
    WHERE user_id=p_user_id AND bridge_id=p_bridge_id FOR UPDATE;
  IF NOT FOUND OR v_reservation.reservation_token<>p_reservation_token THEN
    RETURN jsonb_build_object('renewed',false,'stale',true);
  END IF;
  UPDATE public.interview_plan_generation_reservations
    SET lease_expires_at=v_now+interval '30 seconds'
    WHERE user_id=p_user_id AND bridge_id=p_bridge_id;
  RETURN jsonb_build_object('renewed',true,'leaseExpiresAt',v_now+interval '30 seconds');
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;

CREATE OR REPLACE FUNCTION public.create_and_bind_interview_session_tx(
  p_user_id UUID, p_plan_id UUID, p_plan_hash TEXT, p_bridge_id UUID, p_setup JSONB
) RETURNS JSONB AS $$
DECLARE
  v_plan RECORD; v_bridge RECORD; v_session RECORD; v_session_id UUID;
  v_first_question JSONB; v_question_count INTEGER; v_now TIMESTAMPTZ:=clock_timestamp();
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_bridge_id::text,0));
  SELECT * INTO v_plan FROM public.interview_generated_plans
    WHERE id=p_plan_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Authoritative plan not found or not owned'; END IF;
  IF v_plan.plan_hash<>p_plan_hash OR v_plan.bridge_id<>p_bridge_id THEN
    RAISE EXCEPTION 'Authoritative plan lineage mismatch';
  END IF;
  IF v_plan.session_id IS NOT NULL THEN
    SELECT * INTO v_session FROM public.interview_sessions
      WHERE id=v_plan.session_id AND user_id=p_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Canonical grounded session is missing'; END IF;
    RETURN jsonb_build_object('sessionId',v_plan.session_id,'replayed',true);
  END IF;

  SELECT * INTO v_bridge FROM public.career_context_bridges
    WHERE id=p_bridge_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR v_bridge.status<>'confirmed' OR v_bridge.snapshot_id<>v_plan.snapshot_id
     OR v_bridge.target_module<>'interview' THEN
    RAISE EXCEPTION 'Bridge is not confirmed or plan lineage mismatches';
  END IF;
  IF p_setup#>>'{interviewPlan,authority,planId}'<>p_plan_id::text
     OR p_setup#>>'{interviewPlan,authority,planHash}'<>p_plan_hash
     OR p_setup#>>'{interviewPlan,authority,bridgeId}'<>p_bridge_id::text
     OR p_setup#>>'{interviewPlan,authority,snapshotId}'<>v_plan.snapshot_id::text
     OR (p_setup#>'{interviewPlan}')-'authority'<>v_plan.plan_payload
     OR p_setup#>>'{candidateRole}' IS DISTINCT FROM v_plan.plan_payload#>>'{jdInsights,role}' THEN
    RAISE EXCEPTION 'Session setup does not contain the exact authoritative plan and role';
  END IF;

  v_question_count:=jsonb_array_length(v_plan.plan_payload#>'{questionSet}');
  IF v_question_count<1 THEN RAISE EXCEPTION 'Authoritative plan has no questions'; END IF;
  v_first_question:=v_plan.plan_payload#>'{questionSet,0}';
  v_session_id:=gen_random_uuid();
  INSERT INTO public.interview_sessions(
    id,user_id,role,setup,status,created_at,updated_at,engine_version,session_version,
    current_root_question_index,current_turn_index,current_stage,pending_question_kind,
    active_root_question_id,probe_count_for_root,challenge_count,
    challenge_answered_for_root,reflection_completed_for_root,final_reflection_asked,
    adaptive_policy,dimension_state,pending_question_id,pending_question,evaluation_status
  ) VALUES (
    v_session_id,p_user_id,v_plan.plan_payload#>>'{jdInsights,role}',p_setup,'active',v_now,v_now,'v2',1,
    0,0,'framing','root',v_first_question->>'id',0,0,false,false,false,
    jsonb_build_object('enabled',true,'maxTurns',LEAST(12,GREATEST(v_question_count,8)),
      'maxProbesPerRoot',1,'maxChallenges',2,'requireReflection',true),
    '{}'::jsonb,v_first_question->>'id',v_first_question,'not_tested'
  );
  UPDATE public.interview_generated_plans
    SET session_id=v_session_id,consumed_at=v_now WHERE id=p_plan_id;
  UPDATE public.career_context_bridges
    SET status='consumed',target_session_id=v_session_id,consumed_at=v_now,updated_at=v_now
    WHERE id=p_bridge_id;
  RETURN jsonb_build_object('sessionId',v_session_id,'replayed',false);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;

REVOKE EXECUTE ON FUNCTION public.renew_interview_plan_generation_tx(UUID,UUID,UUID) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.create_and_bind_interview_session_tx(UUID,UUID,TEXT,UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.renew_interview_plan_generation_tx(UUID,UUID,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_and_bind_interview_session_tx(UUID,UUID,TEXT,UUID,JSONB) TO service_role;
