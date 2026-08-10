-- Final P0-3 bridge provenance and grounded Interview budget parity correction.

-- Final P0-3 provenance, provider-lease, and reasoning-policy closure.

-- A declared snapshot module is not bridge provenance unless at least one item
-- selected into that immutable snapshot actually came from that module.
CREATE OR REPLACE FUNCTION public.create_module_bridge_tx(
    p_user_id UUID, p_source_module TEXT, p_target_module TEXT, p_purpose TEXT,
    p_snapshot_id UUID, p_source_record_id TEXT, p_client_request_id TEXT, p_request_hash TEXT
) RETURNS JSONB AS $$
DECLARE v_existing RECORD; v_snapshot RECORD; v_existing_found BOOLEAN; v_bridge_id UUID:=gen_random_uuid(); v_now TIMESTAMPTZ:=now(); v_source_module TEXT;
BEGIN
  SELECT * INTO v_snapshot FROM public.career_context_snapshots WHERE id=p_snapshot_id FOR UPDATE;
  IF NOT FOUND OR v_snapshot.user_id<>p_user_id THEN RAISE EXCEPTION 'Bridge snapshot ownership mismatch: snapshot does not belong to user.'; END IF;
  IF v_snapshot.purpose<>p_purpose THEN RAISE EXCEPTION 'Bridge purpose does not match authoritative snapshot consent'; END IF;
  IF NOT (
    (p_purpose='resume_to_clearspeak' AND p_source_module='resume' AND p_target_module='clearspeak') OR
    (p_purpose='resume_to_interview' AND p_source_module='resume' AND p_target_module='interview') OR
    (p_purpose='clearspeak_to_interview' AND p_source_module='clearspeak' AND p_target_module='interview') OR
    (p_purpose='interview_personalization' AND p_source_module='interview' AND p_target_module='interview')
  ) THEN
    RAISE EXCEPTION 'Bridge source, purpose, and target do not match a canonical module transition';
  END IF;
  IF NOT (p_source_module=ANY(v_snapshot.source_modules)) THEN RAISE EXCEPTION 'Bridge source module contradicts authoritative snapshot provenance'; END IF;
  SELECT sm.module_name INTO v_source_module FROM unnest(v_snapshot.source_modules) AS sm(module_name) WHERE sm.module_name=p_source_module;
  IF NOT EXISTS (
    SELECT 1 FROM public.career_context_snapshot_items si
    JOIN public.career_context_items i ON i.id=si.item_id
    WHERE si.snapshot_id=p_snapshot_id AND i.user_id=p_user_id
      AND i.source_module=v_source_module
      AND (p_source_record_id IS NULL OR i.source_record_id=p_source_record_id)
  ) THEN
    RAISE EXCEPTION 'Bridge source module or record does not belong to authoritative snapshot membership';
  END IF;
  IF (p_purpose='resume_to_clearspeak' AND p_target_module<>'clearspeak') OR
     (p_purpose IN ('resume_to_interview','clearspeak_to_interview','interview_personalization') AND p_target_module<>'interview') THEN
    RAISE EXCEPTION 'Bridge target module is incompatible with purpose';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_client_request_id,0));
  SELECT * INTO v_existing FROM public.career_context_bridges WHERE user_id=p_user_id AND client_request_id=p_client_request_id;
  v_existing_found:=FOUND;
  IF v_existing_found THEN
    IF v_existing.request_hash=p_request_hash THEN RETURN jsonb_build_object('bridgeId',v_existing.id,'status',v_existing.status,'replayed',true); END IF;
    RAISE EXCEPTION 'unique_user_bridge_client_req: client_request_id replay with mismatched request hash';
  END IF;
  IF v_snapshot.consent->>'scope'='one_time' AND EXISTS (SELECT 1 FROM public.career_context_bridges WHERE user_id=p_user_id AND snapshot_id=p_snapshot_id) THEN
    RAISE EXCEPTION 'one_time_snapshot_already_reserved: snapshot consent permits exactly one bridge';
  END IF;
  INSERT INTO public.career_context_bridges(id,user_id,source_module,target_module,purpose,snapshot_id,source_record_id,status,client_request_id,request_hash,confirmed_at,created_at,updated_at)
  VALUES(v_bridge_id,p_user_id,v_source_module,p_target_module,p_purpose,p_snapshot_id,p_source_record_id,'confirmed',p_client_request_id,p_request_hash,v_now,v_now,v_now);
  RETURN jsonb_build_object('bridgeId',v_bridge_id,'status','confirmed','replayed',false);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;
REVOKE EXECUTE ON FUNCTION public.create_module_bridge_tx(UUID,TEXT,TEXT,TEXT,UUID,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_module_bridge_tx(UUID,TEXT,TEXT,TEXT,UUID,TEXT,TEXT,TEXT) TO service_role;


-- Grounded sessions use the same authoritative difficulty budget law as ordinary sessions.
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
    jsonb_build_object('enabled',true,'maxTurns',LEAST(12,GREATEST(v_question_count,CASE WHEN v_plan.plan_payload#>>'{meta,controls,difficulty}'='expert' THEN 10 ELSE 8 END)),
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

REVOKE EXECUTE ON FUNCTION public.create_and_bind_interview_session_tx(UUID,UUID,TEXT,UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_and_bind_interview_session_tx(UUID,UUID,TEXT,UUID,JSONB) TO service_role;
