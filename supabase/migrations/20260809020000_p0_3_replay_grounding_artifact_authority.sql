-- Durable Resume -> ClearSpeak generation/scoring authority and canonical replay.
CREATE TABLE IF NOT EXISTS public.clearspeak_generated_artifacts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bridge_id UUID NOT NULL REFERENCES public.career_context_bridges(id) ON DELETE CASCADE,
  snapshot_id UUID NOT NULL REFERENCES public.career_context_snapshots(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL DEFAULT 1,
  content JSONB NOT NULL,
  content_hash TEXT NOT NULL,
  grounding_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'generated' CHECK (status IN ('generated','scoring','completed')),
  canonical_response JSONB,
  session_id UUID REFERENCES public.clearspeak_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, bridge_id)
);
ALTER TABLE public.clearspeak_generated_artifacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "generated artifacts owner read" ON public.clearspeak_generated_artifacts
  FOR SELECT USING (auth.uid()=user_id);
REVOKE INSERT,UPDATE,DELETE ON public.clearspeak_generated_artifacts FROM anon,authenticated;
GRANT ALL ON public.clearspeak_generated_artifacts TO service_role;
GRANT SELECT ON public.clearspeak_generated_artifacts TO authenticated;

CREATE OR REPLACE FUNCTION public.reserve_clearspeak_grounded_score_tx(
  p_user_id UUID,p_bridge_id UUID,p_snapshot_id UUID,p_artifact_id UUID,p_content_hash TEXT,p_submitted_hash TEXT
) RETURNS JSONB AS $$
DECLARE v_bridge RECORD; v_artifact RECORD;
BEGIN
  SELECT * INTO v_bridge FROM public.career_context_bridges WHERE id=p_bridge_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bridge not found or not owned'; END IF;
  SELECT * INTO v_artifact FROM public.clearspeak_generated_artifacts
    WHERE id=p_artifact_id AND user_id=p_user_id AND bridge_id=p_bridge_id AND snapshot_id=p_snapshot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Generated artifact not found or mismatched'; END IF;
  IF v_artifact.content_hash<>p_content_hash OR v_artifact.content_hash<>p_submitted_hash THEN
    RAISE EXCEPTION 'Generated ClearSpeak content integrity mismatch';
  END IF;
  IF v_artifact.status='completed' AND v_artifact.canonical_response IS NOT NULL THEN
    RETURN jsonb_build_object('replayed',true,'response',v_artifact.canonical_response);
  END IF;
  IF v_artifact.status<>'generated' OR v_bridge.status<>'confirmed' OR
     v_bridge.snapshot_id<>p_snapshot_id OR v_bridge.target_module<>'clearspeak' OR v_bridge.purpose<>'resume_to_clearspeak' THEN
    RAISE EXCEPTION 'Grounded ClearSpeak authority is unavailable or already reserved';
  END IF;
  UPDATE public.clearspeak_generated_artifacts SET status='scoring',updated_at=now() WHERE id=p_artifact_id;
  RETURN jsonb_build_object('replayed',false,'artifactId',p_artifact_id,'content',v_artifact.content);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;

CREATE OR REPLACE FUNCTION public.finalize_clearspeak_grounded_score_tx(
 p_user_id UUID,p_bridge_id UUID,p_snapshot_id UUID,p_artifact_id UUID,p_topic_tag TEXT,
 p_score JSONB,p_practiced_words TEXT[],p_bridge_trigger JSONB
) RETURNS JSONB AS $$
DECLARE v_bridge RECORD; v_artifact RECORD; v_usage RECORD; v_session UUID:=gen_random_uuid(); v_response JSONB;
BEGIN
 SELECT * INTO v_bridge FROM public.career_context_bridges WHERE id=p_bridge_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bridge not found or not owned'; END IF;
 SELECT * INTO v_artifact FROM public.clearspeak_generated_artifacts WHERE id=p_artifact_id AND user_id=p_user_id AND bridge_id=p_bridge_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Generated artifact not found or not owned'; END IF;
 IF v_artifact.status='completed' THEN RETURN jsonb_build_object('sessionId',v_artifact.session_id,'replayed',true,'response',v_artifact.canonical_response); END IF;
 IF v_artifact.status<>'scoring' OR v_bridge.status<>'confirmed' OR v_bridge.snapshot_id<>p_snapshot_id THEN RAISE EXCEPTION 'Grounded score finalization authority mismatch'; END IF;
 INSERT INTO public.usage_ledger(user_id,usage_date,feature,used,limit_value,updated_at)
   VALUES(p_user_id,current_date,'clearspeak_session',0,5,now()) ON CONFLICT DO NOTHING;
 SELECT * INTO v_usage FROM public.usage_ledger WHERE user_id=p_user_id AND usage_date=current_date AND feature='clearspeak_session' FOR UPDATE;
 IF v_usage.used>=5 THEN RAISE EXCEPTION 'Daily ClearSpeak usage limit reached'; END IF;
 INSERT INTO public.clearspeak_sessions(id,user_id,topic_tag,score,practiced_words,created_at)
   VALUES(v_session,p_user_id,p_topic_tag,p_score,COALESCE(p_practiced_words,'{}'),now());
 UPDATE public.usage_ledger SET used=used+1,updated_at=now() WHERE user_id=p_user_id AND usage_date=current_date AND feature='clearspeak_session';
 UPDATE public.career_context_bridges SET status='consumed',target_session_id=v_session,consumed_at=now(),updated_at=now() WHERE id=p_bridge_id AND status='confirmed';
 IF NOT FOUND THEN RAISE EXCEPTION 'Concurrent bridge consumption conflict'; END IF;
 v_response:=jsonb_build_object('score',p_score,'bridgeTrigger',p_bridge_trigger,'sessionId',v_session);
 UPDATE public.clearspeak_generated_artifacts SET status='completed',session_id=v_session,canonical_response=v_response,updated_at=now() WHERE id=p_artifact_id;
 RETURN jsonb_build_object('sessionId',v_session,'replayed',false,'response',v_response);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;

REVOKE EXECUTE ON FUNCTION public.reserve_clearspeak_grounded_score_tx(UUID,UUID,UUID,UUID,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.finalize_clearspeak_grounded_score_tx(UUID,UUID,UUID,UUID,TEXT,JSONB,TEXT[],JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_clearspeak_grounded_score_tx(UUID,UUID,UUID,UUID,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_clearspeak_grounded_score_tx(UUID,UUID,UUID,UUID,TEXT,JSONB,TEXT[],JSONB) TO service_role;

-- Generated artifacts are part of protected account deletion.
CREATE OR REPLACE FUNCTION public.delete_user_career_context(target_user_id UUID) RETURNS VOID AS $$
BEGIN
 PERFORM set_config('app.allow_protected_deletion','true',true);
 DELETE FROM public.clearspeak_generated_artifacts WHERE user_id=target_user_id;
 DELETE FROM public.interview_generated_plans WHERE user_id=target_user_id;
 DELETE FROM public.career_context_snapshot_items WHERE snapshot_id IN (SELECT id FROM public.career_context_snapshots WHERE user_id=target_user_id) OR item_id IN (SELECT id FROM public.career_context_items WHERE user_id=target_user_id);
 DELETE FROM public.career_context_bridges WHERE user_id=target_user_id;
 DELETE FROM public.career_context_snapshots WHERE user_id=target_user_id;
 DELETE FROM public.career_context_items WHERE user_id=target_user_id;
 DELETE FROM public.career_context_state WHERE user_id=target_user_id;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;
