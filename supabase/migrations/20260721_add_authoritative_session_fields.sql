-- Migration: Add authoritative session progression fields to interview_sessions table

ALTER TABLE interview_sessions
ADD COLUMN IF NOT EXISTS current_question_index integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS pending_question_id text,
ADD COLUMN IF NOT EXISTS pending_question jsonb,
ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS evaluation_status text DEFAULT 'not_tested',
ADD COLUMN IF NOT EXISTS evaluation_error_code text;

CREATE OR REPLACE FUNCTION atomic_submit_answer(
  p_session_id uuid,
  p_user_id uuid,
  p_question_id text,
  p_turn jsonb,
  p_next_question_json jsonb,
  p_next_question_id text,
  p_is_last boolean
) RETURNS boolean AS $$
DECLARE
  v_pending text;
  v_status text;
  v_history jsonb;
BEGIN
  -- Lock row
  SELECT pending_question_id, status, history INTO v_pending, v_status, v_history
  FROM interview_sessions
  WHERE id = p_session_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  IF v_status != 'active' THEN
    RAISE EXCEPTION 'Session is not active';
  END IF;

  IF v_pending != p_question_id THEN
    RAISE EXCEPTION 'Stale or mismatched question submission';
  END IF;

  -- Update session
  UPDATE interview_sessions SET
    history = COALESCE(v_history, '[]'::jsonb) || p_turn,
    pending_question_id = CASE WHEN p_is_last THEN NULL ELSE p_next_question_id END,
    pending_question = CASE WHEN p_is_last THEN NULL ELSE p_next_question_json END,
    current_question_index = current_question_index + 1,
    status = CASE WHEN p_is_last THEN 'completed' ELSE status END,
    completed_at = CASE WHEN p_is_last THEN now() ELSE completed_at END,
    updated_at = now()
  WHERE id = p_session_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql;
