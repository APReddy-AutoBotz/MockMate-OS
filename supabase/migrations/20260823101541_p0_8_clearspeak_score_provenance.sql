-- P0-8 ClearSpeak truthfulness: only provider-backed transcript/timing
-- heuristics may contribute to score progress or interview bridge triggers.

ALTER TABLE public.clearspeak_progress
  ADD COLUMN IF NOT EXISTS score_evidence_basis TEXT;

ALTER TABLE public.clearspeak_progress
  DROP CONSTRAINT IF EXISTS clearspeak_progress_score_evidence_basis_check;

ALTER TABLE public.clearspeak_progress
  ADD CONSTRAINT clearspeak_progress_score_evidence_basis_check
  CHECK (
    score_evidence_basis IS NULL OR
    score_evidence_basis = 'transcript_timing_heuristic'
  );

COMMENT ON COLUMN public.clearspeak_progress.score_evidence_basis IS
  'Null for legacy/unprovenanced score-derived progress; transcript_timing_heuristic for provider-backed ASR text/timing feedback. Never a pronunciation or accent assessment.';

CREATE OR REPLACE FUNCTION public.finalize_clearspeak_grounded_score_tx(
 p_user_id UUID,p_bridge_id UUID,p_snapshot_id UUID,p_artifact_id UUID,p_topic_tag TEXT,
 p_score JSONB,p_practiced_words TEXT[],p_bridge_trigger JSONB,p_reservation_token UUID
) RETURNS JSONB AS $$
DECLARE v_bridge RECORD; v_artifact RECORD; v_usage RECORD; v_progress RECORD;
 v_session UUID:=gen_random_uuid(); v_response JSONB; v_progress_json JSONB; v_trigger JSONB;
 v_today DATE:=current_date; v_streak INT; v_trend JSONB; v_topic_scores JSONB; v_best_topic TEXT;
 v_prior_trend JSONB; v_prior_topic_scores JSONB;
 v_clarity NUMERIC:=COALESCE((p_score->>'clarity')::numeric,0);
BEGIN
 IF p_score->>'evidenceBasis' IS DISTINCT FROM 'transcript_timing_heuristic' OR
    COALESCE((p_score->>'pronunciationAssessed')::boolean,true) IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'ClearSpeak score evidence is not eligible for persistence';
 END IF;

 SELECT * INTO v_bridge FROM public.career_context_bridges WHERE id=p_bridge_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Bridge not found or not owned'; END IF;
 SELECT * INTO v_artifact FROM public.clearspeak_generated_artifacts
   WHERE id=p_artifact_id AND user_id=p_user_id AND bridge_id=p_bridge_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Generated artifact not found or not owned'; END IF;
 IF v_artifact.status='completed' AND v_artifact.canonical_response IS NOT NULL THEN
   RETURN jsonb_build_object('sessionId',v_artifact.session_id,'replayed',true,'response',v_artifact.canonical_response);
 END IF;
 IF v_artifact.status<>'scoring' OR v_artifact.reservation_token IS DISTINCT FROM p_reservation_token OR
    v_artifact.scoring_lease_expires_at<=now() OR v_bridge.status<>'confirmed' OR v_bridge.snapshot_id<>p_snapshot_id THEN
   RAISE EXCEPTION 'Grounded score finalization authority mismatch';
 END IF;
 INSERT INTO public.usage_ledger(user_id,usage_date,feature,used,limit_value,updated_at)
   VALUES(p_user_id,v_today,'clearspeak_session',0,5,now()) ON CONFLICT DO NOTHING;
 SELECT * INTO v_usage FROM public.usage_ledger WHERE user_id=p_user_id AND usage_date=v_today AND feature='clearspeak_session' FOR UPDATE;
 IF v_usage.used>=5 THEN RAISE EXCEPTION 'Daily ClearSpeak usage limit reached'; END IF;

 INSERT INTO public.clearspeak_progress(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
 SELECT * INTO v_progress FROM public.clearspeak_progress WHERE user_id=p_user_id FOR UPDATE;
 v_streak:=CASE WHEN v_progress.last_practice_date=v_today THEN v_progress.streak
                WHEN v_progress.last_practice_date=v_today-1 THEN v_progress.streak+1 ELSE 1 END;
 v_prior_trend:=CASE WHEN v_progress.score_evidence_basis='transcript_timing_heuristic'
   THEN COALESCE(v_progress.clarity_trend,'[]'::jsonb) ELSE '[]'::jsonb END;
 v_prior_topic_scores:=CASE WHEN v_progress.score_evidence_basis='transcript_timing_heuristic'
   THEN COALESCE(v_progress.topic_best_scores,'{}'::jsonb) ELSE '{}'::jsonb END;
 SELECT COALESCE(jsonb_agg(value ORDER BY ord),'[]'::jsonb) INTO v_trend
 FROM (SELECT value,ord FROM jsonb_array_elements(v_prior_trend) WITH ORDINALITY t(value,ord)
       UNION ALL SELECT to_jsonb(v_clarity),1000000) values_with_current
 WHERE ord > GREATEST(0,jsonb_array_length(v_prior_trend)-9);
 v_topic_scores:=jsonb_set(v_prior_topic_scores,ARRAY[p_topic_tag],
   to_jsonb(GREATEST(COALESCE((v_prior_topic_scores->>p_topic_tag)::numeric,0),COALESCE((p_score->>'composite')::numeric,0))),true);
 SELECT key INTO v_best_topic FROM jsonb_each_text(v_topic_scores) ORDER BY value::numeric DESC,key LIMIT 1;
 UPDATE public.clearspeak_progress SET streak=v_streak,last_practice_date=v_today,clarity_trend=v_trend,
   topic_best_scores=v_topic_scores,best_performing_topic=COALESCE(v_best_topic,''),
   score_evidence_basis='transcript_timing_heuristic',
   total_sessions_completed=total_sessions_completed+1,updated_at=now() WHERE user_id=p_user_id;
 SELECT jsonb_build_object('userId',user_id,'streak',streak,'lastPracticeDate',last_practice_date::text,
   'clarityTrend',clarity_trend,'topicBestScores',topic_best_scores,'bestPerformingTopic',best_performing_topic,
   'hardWordCount',hard_word_count,'totalSessionsCompleted',total_sessions_completed,
   'scoreEvidenceBasis',score_evidence_basis,'updatedAt',updated_at) INTO v_progress_json
 FROM public.clearspeak_progress WHERE user_id=p_user_id;
 v_trigger:=jsonb_build_object(
   'streakMet',v_streak>=3,
   'rollingAvgMet',jsonb_array_length(v_trend)>=3 AND
     (SELECT COALESCE(avg(value::text::numeric),0)>80 FROM jsonb_array_elements(v_trend) WITH ORDINALITY a(value,ord)
      WHERE ord>GREATEST(0,jsonb_array_length(v_trend)-3)),
   'currentSessionStable',COALESCE((p_score->>'rhythm')::numeric,0)>80 OR COALESCE((p_score->>'retrySuccess')::boolean,false),
   'bridgeReadyFlag',COALESCE((p_bridge_trigger->>'bridgeReadyFlag')::boolean,false));
 v_trigger:=v_trigger||jsonb_build_object('shouldSurface',
   (v_trigger->>'streakMet')::boolean AND (v_trigger->>'rollingAvgMet')::boolean AND
   (v_trigger->>'currentSessionStable')::boolean AND (v_trigger->>'bridgeReadyFlag')::boolean);

 INSERT INTO public.clearspeak_sessions(id,user_id,topic_tag,score,practiced_words,created_at)
   VALUES(v_session,p_user_id,p_topic_tag,p_score,COALESCE(p_practiced_words,'{}'),now());
 UPDATE public.usage_ledger SET used=used+1,updated_at=now() WHERE user_id=p_user_id AND usage_date=v_today AND feature='clearspeak_session';
 UPDATE public.career_context_bridges SET status='consumed',target_session_id=v_session,consumed_at=now(),updated_at=now()
   WHERE id=p_bridge_id AND status='confirmed';
 IF NOT FOUND THEN RAISE EXCEPTION 'Concurrent bridge consumption conflict'; END IF;
 v_response:=jsonb_build_object('score',p_score,'bridgeTrigger',v_trigger,'progress',v_progress_json,'sessionId',v_session);
 UPDATE public.clearspeak_generated_artifacts SET status='completed',session_id=v_session,canonical_response=v_response,
   reservation_token=NULL,scoring_lease_expires_at=NULL,updated_at=now() WHERE id=p_artifact_id;
 RETURN jsonb_build_object('sessionId',v_session,'replayed',false,'response',v_response);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;

REVOKE EXECUTE ON FUNCTION public.finalize_clearspeak_grounded_score_tx(UUID,UUID,UUID,UUID,TEXT,JSONB,TEXT[],JSONB,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_clearspeak_grounded_score_tx(UUID,UUID,UUID,UUID,TEXT,JSONB,TEXT[],JSONB,UUID) TO service_role;
