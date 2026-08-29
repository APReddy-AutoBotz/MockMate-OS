-- P0-8 provider-authority convergence:
-- reserve one Interview answer evaluation before any provider call, count live reservations
-- against daily interview_question capacity, and convert the reservation into the
-- real quota/business effect only inside atomic_submit_adaptive_turn.

CREATE TABLE IF NOT EXISTS public.interview_answer_evaluation_reservations (
  session_id uuid PRIMARY KEY REFERENCES public.interview_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_submission_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{32}$'),
  lease_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS interview_answer_eval_reservations_user_lease_idx
  ON public.interview_answer_evaluation_reservations(user_id, lease_expires_at);

ALTER TABLE public.interview_answer_evaluation_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.interview_answer_evaluation_reservations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.interview_answer_evaluation_reservations TO service_role;

CREATE OR REPLACE FUNCTION public.adaptive_turn_request_hash(
  p_session_id uuid,
  p_question_id text,
  p_answer_kind text,
  p_answer_text text
) RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT MD5(
    p_session_id::text || ':' || p_question_id || ':' || p_answer_kind || ':' ||
    LOWER(REGEXP_REPLACE(TRIM(COALESCE(p_answer_text, '')), '\s+', ' ', 'g'))
  )
$$;

-- API-v2 sends a UUID clientSubmissionId. Legacy-v1 did not expose one, so its
-- existing server-generated non-UUID value is normalized to a deterministic UUID
-- from the same canonical request hash. That keeps the DB column and replay index
-- canonical without requiring a second route contract.
CREATE OR REPLACE FUNCTION public.canonical_adaptive_submission_id(
  p_client_submission_id text,
  p_request_hash text
) RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hash text := LOWER(COALESCE(p_request_hash, ''));
BEGIN
  IF COALESCE(p_client_submission_id, '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RETURN p_client_submission_id::uuid;
  END IF;
  IF v_hash !~ '^[0-9a-f]{32}$' THEN
    RAISE EXCEPTION 'Invalid adaptive request hash';
  END IF;
  RETURN (
    substr(v_hash,1,8) || '-' ||
    substr(v_hash,9,4) || '-' ||
    '4' || substr(v_hash,14,3) || '-' ||
    '8' || substr(v_hash,18,3) || '-' ||
    substr(v_hash,21,12)
  )::uuid;
END;
$$;

REVOKE ALL ON FUNCTION public.adaptive_turn_request_hash(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.canonical_adaptive_submission_id(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adaptive_turn_request_hash(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.canonical_adaptive_submission_id(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_adaptive_turn_evaluation_tx(
  p_session_id uuid,
  p_user_id uuid,
  p_client_submission_id text,
  p_question_id text,
  p_expected_session_version integer,
  p_answer_kind text,
  p_answer_text text,
  p_limit integer DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session record;
  v_turn record;
  v_reservation record;
  v_usage public.usage_ledger%ROWTYPE;
  v_active_reservations integer := 0;
  v_request_hash text;
  v_submission_id uuid;
  v_now timestamptz := clock_timestamp();
  v_lease_expires_at timestamptz;
BEGIN
  IF p_client_submission_id IS NULL OR p_limit < 1 THEN
    RAISE EXCEPTION 'Invalid adaptive evaluation reservation request';
  END IF;
  IF p_answer_kind NOT IN ('answered', 'skipped') THEN
    RAISE EXCEPTION 'Invalid answer kind';
  END IF;

  v_request_hash := public.adaptive_turn_request_hash(
    p_session_id, p_question_id, p_answer_kind, p_answer_text
  );
  v_submission_id := public.canonical_adaptive_submission_id(
    p_client_submission_id, v_request_hash
  );

  -- All interview_question capacity/reservation changes use the same user lock.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':interview_question', 0));

  DELETE FROM public.interview_answer_evaluation_reservations
  WHERE user_id = p_user_id AND lease_expires_at <= v_now;

  SELECT * INTO v_session
  FROM public.interview_sessions
  WHERE id = p_session_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found or unauthorized';
  END IF;

  SELECT adaptive_response, adaptive_request_hash INTO v_turn
  FROM public.interview_turns
  WHERE session_id = p_session_id AND client_submission_id = v_submission_id;

  IF FOUND THEN
    IF v_turn.adaptive_request_hash IS NOT NULL
       AND v_turn.adaptive_request_hash <> v_request_hash THEN
      RAISE EXCEPTION 'Idempotency conflict: submission ID reused with different request payload';
    END IF;
    IF v_turn.adaptive_response IS NULL THEN
      RAISE EXCEPTION 'Idempotent adaptive turn is missing its canonical response';
    END IF;
    RETURN jsonb_build_object(
      'state', 'replay',
      'requestHash', v_request_hash,
      'response', v_turn.adaptive_response
    );
  END IF;

  IF v_session.status <> 'active' THEN
    RAISE EXCEPTION 'Session is not active';
  END IF;
  IF v_session.pending_question_id IS DISTINCT FROM p_question_id
     OR v_session.session_version IS DISTINCT FROM p_expected_session_version THEN
    RAISE EXCEPTION 'Stale or mismatched question submission';
  END IF;

  SELECT * INTO v_reservation
  FROM public.interview_answer_evaluation_reservations
  WHERE session_id = p_session_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_reservation.client_submission_id = v_submission_id
       AND v_reservation.request_hash = v_request_hash
       AND v_reservation.lease_expires_at > v_now THEN
      RETURN jsonb_build_object(
        'state', 'pending',
        'requestHash', v_request_hash,
        'leaseExpiresAt', v_reservation.lease_expires_at
      );
    END IF;
    IF v_reservation.lease_expires_at > v_now THEN
      RAISE EXCEPTION 'Adaptive evaluation already reserved for this session';
    END IF;
    DELETE FROM public.interview_answer_evaluation_reservations
    WHERE session_id = p_session_id;
  END IF;

  INSERT INTO public.usage_ledger(user_id, usage_date, feature, used, limit_value)
  VALUES(p_user_id, current_date, 'interview_question', 0, p_limit)
  ON CONFLICT DO NOTHING;

  SELECT * INTO v_usage
  FROM public.usage_ledger
  WHERE user_id = p_user_id AND usage_date = current_date AND feature = 'interview_question'
  FOR UPDATE;

  SELECT count(*)::integer INTO v_active_reservations
  FROM public.interview_answer_evaluation_reservations
  WHERE user_id = p_user_id AND lease_expires_at > v_now;

  IF COALESCE(v_usage.used, 0) + v_active_reservations >= p_limit THEN
    RETURN jsonb_build_object(
      'state', 'quota_exhausted',
      'requestHash', v_request_hash,
      'used', COALESCE(v_usage.used, 0),
      'reserved', v_active_reservations,
      'limit', p_limit
    );
  END IF;

  v_lease_expires_at := v_now + interval '90 seconds';
  INSERT INTO public.interview_answer_evaluation_reservations(
    session_id, user_id, client_submission_id, request_hash,
    lease_expires_at, created_at, updated_at
  ) VALUES (
    p_session_id, p_user_id, v_submission_id, v_request_hash,
    v_lease_expires_at, v_now, v_now
  );

  RETURN jsonb_build_object(
    'state', 'reserved',
    'requestHash', v_request_hash,
    'leaseExpiresAt', v_lease_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.renew_adaptive_turn_evaluation_tx(
  p_session_id uuid,
  p_user_id uuid,
  p_client_submission_id text,
  p_request_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_lease timestamptz;
  v_submission_id uuid;
BEGIN
  v_submission_id := public.canonical_adaptive_submission_id(
    p_client_submission_id, p_request_hash
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':interview_question', 0));

  UPDATE public.interview_answer_evaluation_reservations
  SET lease_expires_at = v_now + interval '90 seconds', updated_at = v_now
  WHERE session_id = p_session_id
    AND user_id = p_user_id
    AND client_submission_id = v_submission_id
    AND request_hash = p_request_hash
    AND lease_expires_at > v_now
  RETURNING lease_expires_at INTO v_lease;

  RETURN jsonb_build_object(
    'renewed', v_lease IS NOT NULL,
    'leaseExpiresAt', v_lease
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_adaptive_turn_evaluation_tx(
  p_session_id uuid,
  p_user_id uuid,
  p_client_submission_id text,
  p_request_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted integer := 0;
  v_submission_id uuid;
BEGIN
  v_submission_id := public.canonical_adaptive_submission_id(
    p_client_submission_id, p_request_hash
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':interview_question', 0));

  DELETE FROM public.interview_answer_evaluation_reservations
  WHERE session_id = p_session_id
    AND user_id = p_user_id
    AND client_submission_id = v_submission_id
    AND request_hash = p_request_hash;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('released', v_deleted = 1);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_adaptive_turn_evaluation_tx(uuid,uuid,text,text,integer,text,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_adaptive_turn_evaluation_tx(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_adaptive_turn_evaluation_tx(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_adaptive_turn_evaluation_tx(uuid,uuid,text,text,integer,text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_adaptive_turn_evaluation_tx(uuid,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_adaptive_turn_evaluation_tx(uuid,uuid,text,text) TO service_role;

-- Ordinary interview_question consumers must not take capacity already reserved
-- for in-flight answer evaluation.
CREATE OR REPLACE FUNCTION public.consume_daily_usage_tx(
  p_user_id uuid,
  p_feature text,
  p_limit int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v public.usage_ledger%ROWTYPE;
  v_reserved integer := 0;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_user_id IS NULL
     OR p_feature NOT IN ('resume_review','resume_suggestion','interview_question','clearspeak_session')
     OR p_limit < 1 THEN
    RAISE EXCEPTION 'invalid usage request';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_feature, 0));

  IF p_feature = 'interview_question' THEN
    DELETE FROM public.interview_answer_evaluation_reservations
    WHERE user_id = p_user_id AND lease_expires_at <= v_now;
    SELECT count(*)::integer INTO v_reserved
    FROM public.interview_answer_evaluation_reservations
    WHERE user_id = p_user_id AND lease_expires_at > v_now;
  END IF;

  INSERT INTO public.usage_ledger(user_id,usage_date,feature,used,limit_value)
  VALUES(p_user_id,current_date,p_feature,0,p_limit)
  ON CONFLICT DO NOTHING;

  SELECT * INTO v
  FROM public.usage_ledger
  WHERE user_id=p_user_id AND usage_date=current_date AND feature=p_feature
  FOR UPDATE;

  IF v.used + v_reserved >= p_limit THEN
    RETURN jsonb_build_object('allowed',false,'used',v.used,'reserved',v_reserved,'limit',p_limit);
  END IF;

  UPDATE public.usage_ledger
  SET used=used+1,limit_value=p_limit,updated_at=now()
  WHERE user_id=p_user_id AND usage_date=current_date AND feature=p_feature
  RETURNING * INTO v;

  RETURN jsonb_build_object('allowed',true,'used',v.used,'reserved',v_reserved,'limit',p_limit);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_daily_usage_tx(uuid,text,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_daily_usage_tx(uuid,text,int) TO service_role;

-- Replace the UUID-typed overload so legacy-v1 non-UUID server IDs can be
-- normalized by canonical_adaptive_submission_id while v2 UUIDs remain exact.
DROP FUNCTION IF EXISTS public.atomic_submit_adaptive_turn(
  uuid,uuid,uuid,text,integer,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,
  text,text,text,integer,integer,integer,boolean,integer,integer,boolean,
  boolean,boolean,uuid,jsonb
);

CREATE FUNCTION public.atomic_submit_adaptive_turn(
  p_session_id uuid,
  p_user_id uuid,
  p_client_submission_id text,
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
  v_reservation record;
  v_turn_id uuid;
  v_submission_id uuid;
  v_new_version integer;
  v_result jsonb;
  v_request_hash text;
  v_usage jsonb;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_client_submission_id IS NULL THEN
    RAISE EXCEPTION 'Adaptive submissions require client_submission_id';
  END IF;
  IF p_answer_kind NOT IN ('answered', 'skipped') THEN
    RAISE EXCEPTION 'Invalid answer kind';
  END IF;

  v_request_hash := public.adaptive_turn_request_hash(
    p_session_id, p_question_id, p_answer_kind, p_answer_text
  );
  v_submission_id := public.canonical_adaptive_submission_id(
    p_client_submission_id, v_request_hash
  );

  -- Same lock order as reservation and ordinary quota consumers.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':interview_question', 0));

  SELECT * INTO v_session
  FROM public.interview_sessions
  WHERE id = p_session_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found or unauthorized';
  END IF;

  SELECT id, adaptive_response, adaptive_request_hash INTO v_existing_turn
  FROM public.interview_turns
  WHERE session_id = p_session_id AND client_submission_id = v_submission_id;

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

  IF v_session.status <> 'active' THEN
    RAISE EXCEPTION 'Session is not active';
  END IF;
  IF v_session.pending_question_id IS DISTINCT FROM p_question_id
     OR v_session.session_version IS DISTINCT FROM p_expected_session_version THEN
    RAISE EXCEPTION 'Stale or mismatched question submission';
  END IF;

  SELECT * INTO v_reservation
  FROM public.interview_answer_evaluation_reservations
  WHERE session_id = p_session_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_reservation.user_id <> p_user_id
     OR v_reservation.client_submission_id <> v_submission_id
     OR v_reservation.request_hash <> v_request_hash
     OR v_reservation.lease_expires_at <= v_now THEN
    RAISE EXCEPTION 'Adaptive evaluation reservation missing or expired';
  END IF;

  -- Remove our reserved slot inside this transaction, then convert it into one
  -- real ledger unit. A later failure rolls both changes back.
  DELETE FROM public.interview_answer_evaluation_reservations
  WHERE session_id = p_session_id
    AND user_id = p_user_id
    AND client_submission_id = v_submission_id
    AND request_hash = v_request_hash;

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

  INSERT INTO public.interview_turns (
    id,user_id,session_id,client_submission_id,adaptive_request_hash,
    question_id,question,question_blueprint,question_kind,root_question_id,stage,
    answer_kind,answer_text,evaluation_status,turn_evaluation,controller_decision,
    challenge_event,adaptive_response,engine_version,feedback,created_at
  ) VALUES (
    v_turn_id,p_user_id,p_session_id,v_submission_id,v_request_hash,
    p_question_id,COALESCE(v_session.pending_question->>'question',''),
    v_session.pending_question,COALESCE(v_session.pending_question_kind,'root'),
    COALESCE(v_session.active_root_question_id,p_question_id),
    COALESCE(v_session.current_stage,'framing'),p_answer_kind,COALESCE(p_answer_text,''),
    COALESCE(p_turn_evaluation->>'evaluationStatus','evaluated'),p_turn_evaluation,
    p_controller_decision,p_challenge_event,v_result,'v2',
    jsonb_build_object(
      'answerKind',p_answer_kind,'sessionVersion',v_new_version,
      'usageFeature','interview_question','usageUnits',1,
      'usageUsedAfter',(v_usage->>'used')::integer,'usageLimit',(v_usage->>'limit')::integer,
      'providerReservation',true
    ),
    now()
  );

  UPDATE public.interview_sessions SET
    session_version=v_new_version,
    current_turn_index=current_turn_index+1,
    current_root_question_index=p_next_root_index,
    current_stage=p_next_stage,
    pending_question_kind=p_next_kind,
    active_root_question_id=CASE
      WHEN p_next_question_json IS NOT NULL
      THEN COALESCE(p_next_question_json->>'rootQuestionId',p_next_question_id)
      ELSE active_root_question_id
    END,
    pending_question_id=CASE WHEN p_is_complete THEN NULL ELSE p_next_question_id END,
    pending_question=CASE WHEN p_is_complete THEN NULL ELSE p_next_question_json END,
    probe_count_for_root=p_probe_count,
    challenge_count=p_challenge_count,
    challenge_answered_for_root=p_challenge_answered_for_root,
    reflection_completed_for_root=p_reflection_completed_for_root,
    final_reflection_asked=p_final_reflection_asked,
    dimension_state=COALESCE(p_dimension_state,dimension_state),
    last_controller_decision=p_controller_decision,
    status=CASE WHEN p_is_complete THEN 'awaiting_report' ELSE 'active' END,
    updated_at=now()
  WHERE id=p_session_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.atomic_submit_adaptive_turn(
  uuid,uuid,text,text,integer,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,
  text,text,text,integer,integer,integer,boolean,integer,integer,boolean,
  boolean,boolean,uuid,jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atomic_submit_adaptive_turn(
  uuid,uuid,text,text,integer,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,
  text,text,text,integer,integer,integer,boolean,integer,integer,boolean,
  boolean,boolean,uuid,jsonb
) TO service_role;
