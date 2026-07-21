-- Migration: Add authoritative session progression fields to interview_sessions table

ALTER TABLE interview_sessions
ADD COLUMN IF NOT EXISTS current_question_index integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS pending_question_id text,
ADD COLUMN IF NOT EXISTS pending_question jsonb,
ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS evaluation_status text DEFAULT 'not_tested',
ADD COLUMN IF NOT EXISTS evaluation_error_code text;
