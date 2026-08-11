-- Forward-only P0-3 authority and atomicity corrections.

CREATE OR REPLACE FUNCTION public.consume_module_bridge_tx(
    p_user_id UUID, p_bridge_id UUID, p_target_session_id UUID
) RETURNS JSONB AS $$
DECLARE v_bridge RECORD; v_snapshot RECORD; v_session_owner UUID; v_now TIMESTAMPTZ := NOW();
BEGIN
    SELECT * INTO v_bridge FROM public.career_context_bridges
      WHERE id = p_bridge_id AND user_id = p_user_id FOR UPDATE;
    IF v_bridge IS NULL THEN RAISE EXCEPTION 'Bridge % not found for user %', p_bridge_id, p_user_id; END IF;
    IF v_bridge.status <> 'confirmed' THEN
      RAISE EXCEPTION 'Bridge must be confirmed and has status %; it may already have been consumed', v_bridge.status;
    END IF;
    SELECT user_id INTO v_session_owner FROM public.interview_sessions WHERE id = p_target_session_id;
    IF v_session_owner IS NULL THEN RAISE EXCEPTION 'Target session not found'; END IF;
    IF v_session_owner <> p_user_id THEN RAISE EXCEPTION 'Cross-user target session consumption denied.'; END IF;
    UPDATE public.career_context_bridges SET status='consumed', target_session_id=p_target_session_id,
      consumed_at=v_now, updated_at=v_now WHERE id=p_bridge_id AND user_id=p_user_id;
    SELECT * INTO v_snapshot FROM public.career_context_snapshots WHERE id=v_bridge.snapshot_id AND user_id=p_user_id;
    RETURN jsonb_build_object('bridgeId',v_bridge.id,'status','consumed','snapshotId',v_bridge.snapshot_id,
      'projection',v_snapshot.projection,'purpose',v_bridge.purpose);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.consume_module_bridge_tx(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_module_bridge_tx(UUID, UUID, UUID) TO service_role;

DROP FUNCTION IF EXISTS public.create_grounding_snapshot_tx(UUID,TEXT,JSONB,JSONB,JSONB,TEXT[],UUID[],TEXT,TEXT);
CREATE FUNCTION public.create_grounding_snapshot_tx(
 p_user_id UUID, p_purpose TEXT, p_projection JSONB, p_conflicts JSONB, p_consent JSONB,
 p_source_modules TEXT[], p_item_ids UUID[], p_client_request_id TEXT, p_request_hash TEXT,
 p_expected_context_version BIGINT
) RETURNS JSONB AS $$
DECLARE v_existing RECORD; v_current_ver BIGINT; v_snapshot_id UUID:=gen_random_uuid(); v_now TIMESTAMPTZ:=NOW();
 v_item_id UUID; v_pos INT:=0; v_item RECORD;
BEGIN
 SELECT * INTO v_existing FROM public.career_context_snapshots WHERE user_id=p_user_id AND client_request_id=p_client_request_id;
 IF v_existing IS NOT NULL THEN
   IF v_existing.request_hash=p_request_hash THEN RETURN jsonb_build_object('snapshotId',v_existing.id,'contextVersion',v_existing.context_version,'replayed',true); END IF;
   RAISE EXCEPTION 'unique_user_snapshot_client_req: client_request_id replay with mismatched request hash';
 END IF;
 SELECT context_version INTO v_current_ver FROM public.career_context_state WHERE user_id=p_user_id FOR UPDATE;
 IF v_current_ver IS NULL OR v_current_ver <> p_expected_context_version THEN
   RAISE EXCEPTION 'Stale or mismatched context version: expected %, current is %',p_expected_context_version,v_current_ver;
 END IF;
 IF COALESCE(array_length(p_item_ids,1),0) <> (SELECT count(DISTINCT x) FROM unnest(COALESCE(p_item_ids,'{}')) x) THEN
   RAISE EXCEPTION 'Duplicate snapshot item membership'; END IF;
 FOREACH v_item_id IN ARRAY COALESCE(p_item_ids,'{}') LOOP
   SELECT * INTO v_item FROM public.career_context_items WHERE id=v_item_id AND user_id=p_user_id FOR SHARE;
   IF v_item IS NULL THEN RAISE EXCEPTION 'Snapshot item missing or not owned by user'; END IF;
   IF v_item.item_status <> 'active' OR v_item.provenance='inferred_pending' OR v_item.sensitivity='personal_contact' THEN
     RAISE EXCEPTION 'Snapshot item % is not eligible for grounding',v_item_id; END IF;
   IF NOT (p_consent->'includedItemIds' ? v_item_id::text) THEN RAISE EXCEPTION 'Snapshot consent does not include item %',v_item_id; END IF;
 END LOOP;
 INSERT INTO public.career_context_snapshots(id,user_id,purpose,context_version,projection,conflicts,consent,source_modules,client_request_id,request_hash,created_at)
 VALUES(v_snapshot_id,p_user_id,p_purpose,v_current_ver,p_projection,COALESCE(p_conflicts,'[]'),p_consent,p_source_modules,p_client_request_id,p_request_hash,v_now);
 FOREACH v_item_id IN ARRAY COALESCE(p_item_ids,'{}') LOOP
   INSERT INTO public.career_context_snapshot_items(snapshot_id,item_id,position) VALUES(v_snapshot_id,v_item_id,v_pos); v_pos:=v_pos+1;
 END LOOP;
 RETURN jsonb_build_object('snapshotId',v_snapshot_id,'contextVersion',v_current_ver,'replayed',false);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.create_grounding_snapshot_tx(UUID,TEXT,JSONB,JSONB,JSONB,TEXT[],UUID[],TEXT,TEXT,BIGINT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_grounding_snapshot_tx(UUID,TEXT,JSONB,JSONB,JSONB,TEXT[],UUID[],TEXT,TEXT,BIGINT) TO service_role;

CREATE OR REPLACE FUNCTION public.rebuild_career_context_tx(p_user_id UUID,p_drafts JSONB)
RETURNS JSONB AS $$
DECLARE v_state RECORD; v_draft JSONB; v_existing RECORD; v_added INT:=0; v_updated INT:=0; v_unchanged INT:=0; v_now TIMESTAMPTZ:=NOW();
BEGIN
 SELECT * INTO v_state FROM public.career_context_state WHERE user_id=p_user_id FOR UPDATE;
 IF v_state IS NULL THEN INSERT INTO public.career_context_state(user_id,context_version,personalization_enabled,updated_at) VALUES(p_user_id,1,false,v_now) RETURNING * INTO v_state; END IF;
 FOR v_draft IN SELECT value FROM jsonb_array_elements(COALESCE(p_drafts,'[]')) LOOP
   SELECT * INTO v_existing FROM public.career_context_items WHERE user_id=p_user_id AND canonical_key=v_draft->>'canonicalKey' ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
   IF v_existing IS NULL THEN
     INSERT INTO public.career_context_items(id,user_id,item_kind,canonical_key,label,value,source_module,source_record_id,source_path,source_revision,source_hash,exact_excerpt,provenance,item_status,sensitivity,created_at,updated_at)
     VALUES(gen_random_uuid(),p_user_id,v_draft->>'kind',v_draft->>'canonicalKey',v_draft->>'label',v_draft->'value',v_draft#>>'{source,module}',v_draft#>>'{source,recordId}',v_draft#>>'{source,fieldPath}',COALESCE(v_draft#>>'{source,sourceRevision}','v1'),COALESCE(v_draft#>>'{source,sourceHash}','h1'),v_draft->>'exactExcerpt',v_draft->>'provenance',COALESCE(v_draft->>'status','pending_confirmation'),v_draft->>'sensitivity',v_now,v_now); v_added:=v_added+1;
   ELSIF v_existing.source_hash IS DISTINCT FROM v_draft#>>'{source,sourceHash}' THEN
     UPDATE public.career_context_items SET label=v_draft->>'label',value=v_draft->'value',source_revision=v_draft#>>'{source,sourceRevision}',source_hash=v_draft#>>'{source,sourceHash}',exact_excerpt=v_draft->>'exactExcerpt',updated_at=v_now WHERE id=v_existing.id AND user_id=p_user_id; v_updated:=v_updated+1;
   ELSE v_unchanged:=v_unchanged+1; END IF;
 END LOOP;
 IF v_added+v_updated>0 THEN UPDATE public.career_context_state SET context_version=context_version+1,updated_at=v_now WHERE user_id=p_user_id; END IF;
 RETURN jsonb_build_object('addedCount',v_added,'updatedCount',v_updated,'unchangedCount',v_unchanged);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;
REVOKE EXECUTE ON FUNCTION public.rebuild_career_context_tx(UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_career_context_tx(UUID,JSONB) TO service_role;
