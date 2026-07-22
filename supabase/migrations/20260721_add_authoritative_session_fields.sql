-- Migration: Add authoritative session progression fields to interview_sessions table & question_id to interview_turns

ALTER TABLE public.interview_sessions
ADD COLUMN IF NOT EXISTS current_question_index integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS pending_question_id text,
ADD COLUMN IF NOT EXISTS pending_question jsonb,
ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS evaluation_status text DEFAULT 'not_tested',
ADD COLUMN IF NOT EXISTS evaluation_error_code text;

ALTER TABLE public.interview_turns
ADD COLUMN IF NOT EXISTS question_id text;

CREATE OR REPLACE FUNCTION public.atomic_submit_answer(
  p_session_id uuid,
  p_user_id uuid,
  p_question_id text,
  p_expected_question_index integer,
  p_answer_kind text,
  p_answer_text text,
  p_next_question_json jsonb,
  p_next_question_id text,
  p_is_last boolean,
  p_total_questions integer
) RETURNS jsonb 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session record;
  v_turn_id uuid;
  v_result jsonb;
BEGIN
  -- 0. Validate answer kind
  IF p_answer_kind NOT IN ('answered', 'skipped') THEN
    RAISE EXCEPTION 'Invalid answer kind';
  END IF;

  -- 1. Lock matching session row
  SELECT * INTO v_session
  FROM public.interview_sessions
  WHERE id = p_session_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found or unauthorized';
  END IF;

  IF v_session.status != 'active' THEN
    RAISE EXCEPTION 'Session is not active';
  END IF;

  IF v_session.pending_question_id IS DISTINCT FROM p_question_id OR v_session.current_question_index IS DISTINCT FROM p_expected_question_index THEN
    RAISE EXCEPTION 'Stale or mismatched question submission';
  END IF;

  -- 2. Insert into interview_turns including user_id, question_id, and feedback
  INSERT INTO public.interview_turns (
    user_id,
    session_id,
    question_id,
    question,
    answer_text,
    feedback,
    created_at
  ) VALUES (
    p_user_id,
    p_session_id,
    p_question_id,
    COALESCE(v_session.pending_question->>'question', ''),
    COALESCE(p_answer_text, ''),
    jsonb_build_object('answerKind', p_answer_kind),
    now()
  ) RETURNING id INTO v_turn_id;

  -- 3. Update interview_sessions state
  UPDATE public.interview_sessions SET
    pending_question_id = CASE WHEN p_is_last THEN NULL ELSE p_next_question_id END,
    pending_question = CASE WHEN p_is_last THEN NULL ELSE p_next_question_json END,
    current_question_index = current_question_index + 1,
    status = CASE WHEN p_is_last THEN 'awaiting_report' ELSE 'active' END,
    updated_at = now()
  WHERE id = p_session_id;

  -- 4. Construct return JSON
  v_result := jsonb_build_object(
    'completedTurnId', v_turn_id::text,
    'nextQuestion', CASE WHEN p_is_last THEN NULL ELSE p_next_question_json END,
    'isLastQuestion', p_is_last,
    'questionIndex', v_session.current_question_index + 1,
    'totalQuestions', p_total_questions
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.atomic_submit_answer(
  uuid, uuid, text, integer, text, text, jsonb, text, boolean, integer
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.atomic_submit_answer(
  uuid, uuid, text, integer, text, text, jsonb, text, boolean, integer
) FROM anon;

REVOKE ALL ON FUNCTION public.atomic_submit_answer(
  uuid, uuid, text, integer, text, text, jsonb, text, boolean, integer
) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.atomic_submit_answer(
  uuid, uuid, text, integer, text, text, jsonb, text, boolean, integer
) TO service_role;
