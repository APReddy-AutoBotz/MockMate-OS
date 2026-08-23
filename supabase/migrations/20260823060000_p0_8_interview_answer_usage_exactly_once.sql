-- P0-8: make adaptive Interview business mutation and daily usage quota one atomic authority boundary.
-- Exact replays return the persisted turn before quota consumption; stale/invalid submissions also fail before quota consumption.
-- Any downstream failure rolls the usage increment back with the turn/session mutation.

CREATE OR REPLACE FUNCTION public.atomic_submit_adaptive_turn(
  p_session_id uuid,
  p_user_id uuid,
  p_client_submission_id uuid,
  p_question_id text,
  p_expected_session_version integer,
  p_answer_kind text,
  p_answer_text text,
  p_turn_evaluation jsonb,
  p_controller_decision jsonb,
  p_challenge_event jsonb,
  p_dimension_state jsonb,
  p_next_question_json jsonb,
  p_next_question_id text,
  p_next_stage text,
  p_next_kind text,
  p_next_root_index integer,
  p_probe_count integer,
  p_challenge_count integer,
  p_is_complete boolean,
  p_max_turns integer,
  p_total_roots integer,
  p_challenge_answered_for_root boolean DEFAULT false,
  p_reflection_completed_for_root boolean DEFAULT false,
  p_final_reflection_asked boolean DEFAULT false,
  p_turn_id uuid DEFAULT NULL,
  p_adaptive_response jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_turn record;
  v_session record;
  v_turn_id uuid;
  v_new_version integer;
  v_result jsonb;
  v_request_hash text;
  v_usage jsonb;
BEGIN
  IF p_client_submission_id IS NULL THEN
    RAISE EXCEPTION 'Adaptive submissions require client_submission_id';
  END IF;

  IF p_answer_kind NOT IN ('answered', 'skipped') THEN
    RAISE EXCEPTION 'Invalid answer kind';
  END IF;

  v_request_hash := MD5(
    p_session_id::text || ':' || p_question_id || ':' || p_answer_kind || ':' ||
    LOWER(REGEXP_REPLACE(TRIM(COALESCE(p_answer_text, '')), '\s+', ' ', 'g'))
  );

  -- Serialize every adaptive mutation for one session before replay/quota decisions.
  SELECT * INTO v_session
  FROM public.interview_sessions
  WHERE id = p_session_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found or unauthorized';
  END IF;

  -- Exact replay is a read of the already-committed business effect and therefore
  -- returns before any second quota effect can occur.
  SELECT id, session_id, adaptive_response, adaptive_request_hash INTO v_existing_turn
  FROM public.interview_turns
  WHERE session_id = p_session_id AND client_submission_id = p_client_submission_id;

  IF FOUND THEN
    IF v_existing_turn.adaptive_request_hash IS NOT NULL
       AND v_existing_turn.adaptive_request_hash <> v_request_hash THEN
      RAISE EXCEPTION 'Idempotency conflict: submission ID reused with different request payload';
    END IF;
    IF v_existing_turn.adaptive_response IS NOT NULL THEN
      RETURN v_existing_turn.adaptive_response;
    END IF;
    RAISE EXCEPTION 'Idempotent adaptive turn is missing its canonical response';
  END IF;

  -- Reject non-effects before quota mutation.
  IF v_session.status <> 'active' THEN
    RAISE EXCEPTION 'Session is not active';
  END IF;

  IF v_session.pending_question_id IS DISTINCT FROM p_question_id
     OR v_session.session_version IS DISTINCT FROM p_expected_session_version THEN
    RAISE EXCEPTION 'Stale or mismatched question submission';
  END IF;

  -- The quota update now participates in this same PostgreSQL transaction.
  -- A failed insert/session update rolls this increment back; an exact replay
  -- never reaches this line because the canonical turn is returned above.
  SELECT public.consume_daily_usage_tx(p_user_id, 'interview_question', 20) INTO v_usage;
  IF NOT COALESCE((v_usage->>'allowed')::boolean, false) THEN
    RAISE EXCEPTION 'Daily usage limit reached: interview_question';
  END IF;

  v_new_version := v_session.session_version + 1;
  v_turn_id := COALESCE(p_turn_id, gen_random_uuid());

  IF p_adaptive_response IS NULL THEN
    v_result := jsonb_build_object(
      'completedTurnId', v_turn_id::text,
      'sessionVersion', v_new_version,
      'evaluationStatus', COALESCE(p_turn_evaluation->>'evaluationStatus', 'evaluated'),
      'nextQuestion', CASE WHEN p_is_complete THEN NULL ELSE p_next_question_json END,
      'nextAction', COALESCE(p_controller_decision->>'action', 'advance_root_question'),
      'challengeEvent', p_challenge_event,
      'isSessionComplete', p_is_complete,
      'rootQuestionIndex', p_next_root_index,
      'rootQuestionCount', p_total_roots,
      'turnIndex', v_session.current_turn_index + 1,
      'maxTurns', p_max_turns,
      'stage', p_next_stage
    );
  ELSE
    v_result := p_adaptive_response;
  END IF;

  -- The session row lock prevents same-session duplicate insertion races. Do not
  -- catch unique_violation here: an unexpected conflict must abort the whole
  -- transaction, including the quota increment above.
  INSERT INTO public.interview_turns (
    id,
    user_id,
    session_id,
    client_submission_id,
    adaptive_request_hash,
    question_id,
    question,
    question_blueprint,
    question_kind,
    root_question_id,
    stage,
    answer_kind,
    answer_text,
    evaluation_status,
    turn_evaluation,
    controller_decision,
    challenge_event,
    adaptive_response,
    engine_version,
    feedback,
    created_at
  ) VALUES (
    v_turn_id,
    p_user_id,
    p_session_id,
    p_client_submission_id,
    v_request_hash,
    p_question_id,
    COALESCE(v_session.pending_question->>'question', ''),
    v_session.pending_question,
    COALESCE(v_session.pending_question_kind, 'root'),
    COALESCE(v_session.active_root_question_id, p_question_id),
    COALESCE(v_session.current_stage, 'framing'),
    p_answer_kind,
    COALESCE(p_answer_text, ''),
    COALESCE(p_turn_evaluation->>'evaluationStatus', 'evaluated'),
    p_turn_evaluation,
    p_controller_decision,
    p_challenge_event,
    v_result,
    'v2',
    jsonb_build_object(
      'answerKind', p_answer_kind,
      'sessionVersion', v_new_version,
      'usageFeature', 'interview_question',
      'usageUnits', 1,
      'usageUsedAfter', (v_usage->>'used')::integer,
      'usageLimit', (v_usage->>'limit')::integer
    ),
    now()
  );

  UPDATE public.interview_sessions SET
    session_version = v_new_version,
    current_turn_index = current_turn_index + 1,
    current_root_question_index = p_next_root_index,
    current_stage = p_next_stage,
    pending_question_kind = p_next_kind,
    active_root_question_id = CASE
      WHEN p_next_question_json IS NOT NULL
      THEN COALESCE(p_next_question_json->>'rootQuestionId', p_next_question_id)
      ELSE active_root_question_id
    END,
    pending_question_id = CASE WHEN p_is_complete THEN NULL ELSE p_next_question_id END,
    pending_question = CASE WHEN p_is_complete THEN NULL ELSE p_next_question_json END,
    probe_count_for_root = p_probe_count,
    challenge_count = p_challenge_count,
    challenge_answered_for_root = p_challenge_answered_for_root,
    reflection_completed_for_root = p_reflection_completed_for_root,
    final_reflection_asked = p_final_reflection_asked,
    dimension_state = COALESCE(p_dimension_state, dimension_state),
    last_controller_decision = p_controller_decision,
    status = CASE WHEN p_is_complete THEN 'awaiting_report' ELSE 'active' END,
    updated_at = now()
  WHERE id = p_session_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.atomic_submit_adaptive_turn(
  uuid, uuid, uuid, text, integer, text, text, jsonb, jsonb, jsonb, jsonb, jsonb,
  text, text, text, integer, integer, integer, boolean, integer, integer, boolean,
  boolean, boolean, uuid, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.atomic_submit_adaptive_turn(
  uuid, uuid, uuid, text, integer, text, text, jsonb, jsonb, jsonb, jsonb, jsonb,
  text, text, text, integer, integer, integer, boolean, integer, integer, boolean,
  boolean, boolean, uuid, jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.atomic_submit_adaptive_turn(
  uuid, uuid, uuid, text, integer, text, text, jsonb, jsonb, jsonb, jsonb, jsonb,
  text, text, text, integer, integer, integer, boolean, integer, integer, boolean,
  boolean, boolean, uuid, jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_submit_adaptive_turn(
  uuid, uuid, uuid, text, integer, text, text, jsonb, jsonb, jsonb, jsonb, jsonb,
  text, text, text, integer, integer, integer, boolean, integer, integer, boolean,
  boolean, boolean, uuid, jsonb
) TO service_role;
