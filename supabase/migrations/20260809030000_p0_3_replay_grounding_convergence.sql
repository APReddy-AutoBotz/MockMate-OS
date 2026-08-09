-- P0-3 replay/grounding convergence: stable artifact integrity, recoverable score
-- reservations, exactly-once progress, and serialized snapshot idempotency.

ALTER TABLE public.clearspeak_generated_artifacts
  ADD COLUMN IF NOT EXISTS scoring_lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reservation_token UUID;

CREATE OR REPLACE FUNCTION public.reserve_clearspeak_grounded_score_tx(
  p_user_id UUID,p_bridge_id UUID,p_snapshot_id UUID,p_artifact_id UUID,p_content_hash TEXT,p_submitted_hash TEXT
) RETURNS JSONB AS $$
DECLARE v_bridge RECORD; v_artifact RECORD; v_token UUID:=gen_random_uuid();
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
  IF v_bridge.status<>'confirmed' OR v_bridge.snapshot_id<>p_snapshot_id OR
     v_bridge.target_module<>'clearspeak' OR v_bridge.purpose<>'resume_to_clearspeak' THEN
    RAISE EXCEPTION 'Grounded ClearSpeak authority is unavailable';
  END IF;
  IF v_artifact.status='scoring' AND v_artifact.scoring_lease_expires_at>now() THEN
    RAISE EXCEPTION 'Grounded ClearSpeak scoring is already in progress';
  END IF;
  IF v_artifact.status NOT IN ('generated','scoring') THEN
    RAISE EXCEPTION 'Grounded ClearSpeak artifact is not retryable';
  END IF;
  UPDATE public.clearspeak_generated_artifacts
     SET status='scoring',reservation_token=v_token,
         scoring_lease_expires_at=now()+interval '2 minutes',updated_at=now()
   WHERE id=p_artifact_id;
  RETURN jsonb_build_object('replayed',false,'artifactId',p_artifact_id,
    'reservationToken',v_token,'content',v_artifact.content);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;

DROP FUNCTION IF EXISTS public.finalize_clearspeak_grounded_score_tx(UUID,UUID,UUID,UUID,TEXT,JSONB,TEXT[],JSONB);
CREATE FUNCTION public.finalize_clearspeak_grounded_score_tx(
 p_user_id UUID,p_bridge_id UUID,p_snapshot_id UUID,p_artifact_id UUID,p_topic_tag TEXT,
 p_score JSONB,p_practiced_words TEXT[],p_bridge_trigger JSONB,p_reservation_token UUID
) RETURNS JSONB AS $$
DECLARE v_bridge RECORD; v_artifact RECORD; v_usage RECORD; v_progress RECORD;
 v_session UUID:=gen_random_uuid(); v_response JSONB; v_progress_json JSONB; v_trigger JSONB;
 v_today DATE:=current_date; v_streak INT; v_trend JSONB; v_topic_scores JSONB; v_best_topic TEXT;
 v_clarity NUMERIC:=COALESCE((p_score->>'clarity')::numeric,0);
BEGIN
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
 SELECT COALESCE(jsonb_agg(value ORDER BY ord),'[]'::jsonb) INTO v_trend
 FROM (SELECT value,ord FROM jsonb_array_elements(COALESCE(v_progress.clarity_trend,'[]')) WITH ORDINALITY t(value,ord)
       UNION ALL SELECT to_jsonb(v_clarity),1000000) values_with_current
 WHERE ord > GREATEST(0,jsonb_array_length(COALESCE(v_progress.clarity_trend,'[]'))-9);
 v_topic_scores:=jsonb_set(COALESCE(v_progress.topic_best_scores,'{}'),ARRAY[p_topic_tag],
   to_jsonb(GREATEST(COALESCE((v_progress.topic_best_scores->>p_topic_tag)::numeric,0),COALESCE((p_score->>'composite')::numeric,0))),true);
 SELECT key INTO v_best_topic FROM jsonb_each_text(v_topic_scores) ORDER BY value::numeric DESC,key LIMIT 1;
 UPDATE public.clearspeak_progress SET streak=v_streak,last_practice_date=v_today,clarity_trend=v_trend,
   topic_best_scores=v_topic_scores,best_performing_topic=COALESCE(v_best_topic,''),
   total_sessions_completed=total_sessions_completed+1,updated_at=now() WHERE user_id=p_user_id;
 SELECT jsonb_build_object('userId',user_id,'streak',streak,'lastPracticeDate',last_practice_date::text,
   'clarityTrend',clarity_trend,'topicBestScores',topic_best_scores,'bestPerformingTopic',best_performing_topic,
   'hardWordCount',hard_word_count,'totalSessionsCompleted',total_sessions_completed,'updatedAt',updated_at) INTO v_progress_json
 FROM public.clearspeak_progress WHERE user_id=p_user_id;
 v_trigger:=jsonb_build_object(
   'streakMet',v_streak>=3,
   'rollingAvgMet',(SELECT COALESCE(avg(value::text::numeric),0)>80 FROM jsonb_array_elements(v_trend) WITH ORDINALITY a(value,ord)
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

-- Serialize identical snapshot operations before their first lookup. The state
-- lock alone is insufficient because snapshot creation does not advance it.
CREATE OR REPLACE FUNCTION public.create_grounding_snapshot_tx(
 p_user_id UUID, p_purpose TEXT, p_projection JSONB, p_conflicts JSONB, p_consent JSONB,
 p_source_modules TEXT[], p_item_ids UUID[], p_client_request_id TEXT, p_request_hash TEXT,
 p_expected_context_version BIGINT
) RETURNS JSONB AS $$
DECLARE v_existing RECORD; v_existing_found BOOLEAN; v_current_ver BIGINT; v_snapshot_id UUID:=gen_random_uuid(); v_now TIMESTAMPTZ:=NOW();
 v_item_id UUID; v_pos INT:=0; v_item RECORD;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_client_request_id,0));
 SELECT * INTO v_existing FROM public.career_context_snapshots WHERE user_id=p_user_id AND client_request_id=p_client_request_id;
 v_existing_found:=FOUND;
 IF v_existing_found THEN
   IF v_existing.request_hash=p_request_hash THEN RETURN jsonb_build_object('snapshotId',v_existing.id,'contextVersion',v_existing.context_version,'replayed',true); END IF;
   RAISE EXCEPTION 'unique_user_snapshot_client_req: client_request_id replay with mismatched request hash';
 END IF;
 SELECT context_version INTO v_current_ver FROM public.career_context_state WHERE user_id=p_user_id FOR UPDATE;
 IF v_current_ver IS NULL OR v_current_ver<>p_expected_context_version THEN RAISE EXCEPTION 'Stale or mismatched context version: expected %, current is %',p_expected_context_version,v_current_ver; END IF;
 IF COALESCE(array_length(p_item_ids,1),0)<>(SELECT count(DISTINCT x) FROM unnest(COALESCE(p_item_ids,'{}')) x) THEN RAISE EXCEPTION 'Duplicate snapshot item membership'; END IF;
 FOREACH v_item_id IN ARRAY COALESCE(p_item_ids,'{}') LOOP
   SELECT * INTO v_item FROM public.career_context_items WHERE id=v_item_id AND user_id=p_user_id FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Snapshot item missing or not owned by user'; END IF;
   IF NOT (v_item.source_module=ANY(p_source_modules)) THEN RAISE EXCEPTION 'Snapshot item source module is not declared by consent'; END IF;
   IF v_item.item_status<>'active' OR v_item.provenance='inferred_pending' OR v_item.sensitivity='personal_contact' THEN RAISE EXCEPTION 'Snapshot item % is not eligible for grounding',v_item_id; END IF;
   IF NOT (p_consent->'includedItemIds' ? v_item_id::text) THEN RAISE EXCEPTION 'Snapshot consent does not include item %',v_item_id; END IF;
 END LOOP;
 INSERT INTO public.career_context_snapshots(id,user_id,purpose,context_version,projection,conflicts,consent,source_modules,client_request_id,request_hash,created_at)
 VALUES(v_snapshot_id,p_user_id,p_purpose,v_current_ver,p_projection,COALESCE(p_conflicts,'[]'),p_consent,p_source_modules,p_client_request_id,p_request_hash,v_now);
 FOREACH v_item_id IN ARRAY COALESCE(p_item_ids,'{}') LOOP INSERT INTO public.career_context_snapshot_items(snapshot_id,item_id,position) VALUES(v_snapshot_id,v_item_id,v_pos); v_pos:=v_pos+1; END LOOP;
 RETURN jsonb_build_object('snapshotId',v_snapshot_id,'contextVersion',v_current_ver,'replayed',false);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;

REVOKE EXECUTE ON FUNCTION public.create_grounding_snapshot_tx(UUID,TEXT,JSONB,JSONB,JSONB,TEXT[],UUID[],TEXT,TEXT,BIGINT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_grounding_snapshot_tx(UUID,TEXT,JSONB,JSONB,JSONB,TEXT[],UUID[],TEXT,TEXT,BIGINT) TO service_role;
