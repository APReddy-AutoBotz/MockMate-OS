-- Forward-only closure for complete source reconciliation and grounded ClearSpeak sessions.

CREATE OR REPLACE FUNCTION public.rebuild_career_context_tx(
  p_user_id UUID, p_drafts JSONB, p_source_manifest JSONB
) RETURNS JSONB AS $$
DECLARE
  v_state RECORD; v_draft JSONB; v_current RECORD; v_active RECORD; v_pending RECORD;
  v_item RECORD; v_new_id UUID; v_revision TEXT; v_added INT:=0; v_updated INT:=0;
  v_unchanged INT:=0; v_now TIMESTAMPTZ:=now(); v_changed BOOLEAN:=false;
BEGIN
  SELECT * INTO v_state FROM public.career_context_state WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.career_context_state(user_id,context_version,personalization_enabled,updated_at)
      VALUES(p_user_id,1,false,v_now) RETURNING * INTO v_state;
  END IF;

  FOR v_draft IN SELECT value FROM jsonb_array_elements(COALESCE(p_drafts,'[]'::jsonb)) LOOP
    -- A current (active/pending) row with the same source value is the only no-op.
    SELECT * INTO v_current FROM public.career_context_items
      WHERE user_id=p_user_id
        AND source_module=v_draft#>>'{source,module}'
        AND source_record_id=v_draft#>>'{source,recordId}'
        AND source_path=v_draft#>>'{source,fieldPath}'
        AND source_hash=COALESCE(v_draft#>>'{source,sourceHash}','h1')
        AND item_status IN ('active','pending_confirmation')
      ORDER BY CASE item_status WHEN 'active' THEN 0 ELSE 1 END,created_at DESC LIMIT 1 FOR UPDATE;
    IF FOUND THEN v_unchanged:=v_unchanged+1; CONTINUE; END IF;

    SELECT * INTO v_active FROM public.career_context_items
      WHERE user_id=p_user_id AND source_module=v_draft#>>'{source,module}'
        AND source_record_id=v_draft#>>'{source,recordId}' AND source_path=v_draft#>>'{source,fieldPath}'
        AND item_status='active' AND provenance<>'user_edited'
      ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    SELECT * INTO v_pending FROM public.career_context_items
      WHERE user_id=p_user_id AND source_module=v_draft#>>'{source,module}'
        AND source_record_id=v_draft#>>'{source,recordId}' AND source_path=v_draft#>>'{source,fieldPath}'
        AND item_status='pending_confirmation'
      ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

    v_new_id:=gen_random_uuid();
    v_revision:=COALESCE(v_draft#>>'{source,sourceRevision}','v1');
    IF EXISTS (SELECT 1 FROM public.career_context_items WHERE user_id=p_user_id
      AND source_module=v_draft#>>'{source,module}' AND source_record_id=v_draft#>>'{source,recordId}'
      AND source_path=v_draft#>>'{source,fieldPath}' AND source_revision=v_revision
      AND source_hash=COALESCE(v_draft#>>'{source,sourceHash}','h1')) THEN
      v_revision:=v_revision||':reconcile:'||v_new_id::text;
    END IF;
    INSERT INTO public.career_context_items(id,user_id,item_kind,canonical_key,label,value,source_module,source_record_id,source_path,source_revision,source_hash,exact_excerpt,provenance,item_status,sensitivity,created_at,updated_at)
    VALUES(v_new_id,p_user_id,v_draft->>'kind',v_draft->>'canonicalKey',v_draft->>'label',v_draft->'value',v_draft#>>'{source,module}',v_draft#>>'{source,recordId}',v_draft#>>'{source,fieldPath}',v_revision,COALESCE(v_draft#>>'{source,sourceHash}','h1'),v_draft->>'exactExcerpt',v_draft->>'provenance',CASE WHEN v_active.id IS NOT NULL OR v_pending.id IS NOT NULL THEN 'pending_confirmation' ELSE COALESCE(v_draft->>'status','pending_confirmation') END,v_draft->>'sensitivity',v_now,v_now);
    IF v_pending.id IS NOT NULL THEN
      UPDATE public.career_context_items SET item_status='superseded',superseded_by=v_new_id,updated_at=v_now WHERE id=v_pending.id AND item_status='pending_confirmation';
    END IF;
    IF v_active.id IS NOT NULL THEN
      UPDATE public.career_context_items SET superseded_by=v_new_id,updated_at=v_now WHERE id=v_active.id AND item_status='active';
      v_updated:=v_updated+1;
    ELSIF v_pending.id IS NOT NULL THEN v_updated:=v_updated+1;
    ELSE v_added:=v_added+1; END IF;
    v_changed:=true;
  END LOOP;

  -- A manifest is supplied only after every source query succeeded. Reconcile
  -- omitted source-owned lineages, but never revoke manual/user-edited authority.
  FOR v_item IN SELECT * FROM public.career_context_items i
    WHERE i.user_id=p_user_id AND i.item_status IN ('active','pending_confirmation')
      AND i.provenance<>'user_edited'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_source_manifest,'[]')) m WHERE m->>'module'=i.source_module AND m->>'recordId'='__module__')
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_drafts,'[]')) d
        WHERE d#>>'{source,module}'=i.source_module AND d#>>'{source,recordId}'=i.source_record_id AND d#>>'{source,fieldPath}'=i.source_path)
  FOR UPDATE LOOP
    UPDATE public.career_context_items SET item_status=CASE WHEN v_item.item_status='active' THEN 'revoked' ELSE 'superseded' END,updated_at=v_now
      WHERE id=v_item.id AND item_status=v_item.item_status;
    v_updated:=v_updated+1; v_changed:=true;
  END LOOP;

  IF v_changed THEN UPDATE public.career_context_state SET context_version=context_version+1,updated_at=v_now WHERE user_id=p_user_id; END IF;
  RETURN jsonb_build_object('addedCount',v_added,'updatedCount',v_updated,'unchangedCount',v_unchanged);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;
REVOKE EXECUTE ON FUNCTION public.rebuild_career_context_tx(UUID,JSONB,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_career_context_tx(UUID,JSONB,JSONB) TO service_role;

-- A bridge may target either governed session table. Ownership is validated in
-- the consuming RPC rather than by an Interview-only foreign key.
ALTER TABLE public.career_context_bridges DROP CONSTRAINT IF EXISTS career_context_bridges_target_session_id_fkey;

CREATE OR REPLACE FUNCTION public.create_clearspeak_grounded_session_tx(
  p_user_id UUID,p_bridge_id UUID,p_snapshot_id UUID,p_topic_tag TEXT,p_score JSONB,p_practiced_words TEXT[]
) RETURNS JSONB AS $$
DECLARE v_bridge RECORD; v_owner UUID; v_session_id UUID:=gen_random_uuid(); v_usage RECORD; v_now TIMESTAMPTZ:=now();
BEGIN
  SELECT * INTO v_bridge FROM public.career_context_bridges WHERE id=p_bridge_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bridge not found or not owned'; END IF;
  IF v_bridge.status='consumed' THEN
    SELECT user_id INTO v_owner FROM public.clearspeak_sessions WHERE id=v_bridge.target_session_id;
    IF v_owner=p_user_id THEN RETURN jsonb_build_object('sessionId',v_bridge.target_session_id,'replayed',true); END IF;
    RAISE EXCEPTION 'Consumed bridge target is invalid';
  END IF;
  IF v_bridge.status<>'confirmed' OR v_bridge.target_module<>'clearspeak' OR v_bridge.purpose<>'resume_to_clearspeak' OR v_bridge.snapshot_id<>p_snapshot_id THEN
    RAISE EXCEPTION 'Bridge is not valid for this grounded ClearSpeak session';
  END IF;
  INSERT INTO public.usage_ledger(user_id,usage_date,feature,used,limit_value,updated_at)
    VALUES(p_user_id,current_date,'clearspeak_session',0,5,v_now) ON CONFLICT DO NOTHING;
  SELECT * INTO v_usage FROM public.usage_ledger WHERE user_id=p_user_id AND usage_date=current_date AND feature='clearspeak_session' FOR UPDATE;
  IF v_usage.used>=5 THEN RAISE EXCEPTION 'Daily ClearSpeak usage limit reached'; END IF;
  INSERT INTO public.clearspeak_sessions(id,user_id,topic_tag,score,practiced_words,created_at)
    VALUES(v_session_id,p_user_id,p_topic_tag,p_score,COALESCE(p_practiced_words,'{}'),v_now);
  UPDATE public.usage_ledger SET used=used+1,limit_value=5,updated_at=v_now WHERE user_id=p_user_id AND usage_date=current_date AND feature='clearspeak_session';
  UPDATE public.career_context_bridges SET status='consumed',target_session_id=v_session_id,consumed_at=v_now,updated_at=v_now
    WHERE id=p_bridge_id AND user_id=p_user_id AND status='confirmed';
  IF NOT FOUND THEN RAISE EXCEPTION 'Concurrent ClearSpeak bridge consumption conflict'; END IF;
  RETURN jsonb_build_object('sessionId',v_session_id,'replayed',false);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;
REVOKE EXECUTE ON FUNCTION public.create_clearspeak_grounded_session_tx(UUID,UUID,UUID,TEXT,JSONB,TEXT[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_clearspeak_grounded_session_tx(UUID,UUID,UUID,TEXT,JSONB,TEXT[]) TO service_role;

-- Enforce the declared consent/source manifest against locked authoritative rows.
CREATE OR REPLACE FUNCTION public.assert_snapshot_source_modules_tx(p_user_id UUID,p_item_ids UUID[],p_source_modules TEXT[]) RETURNS VOID AS $$
DECLARE v_item RECORD;
BEGIN
 FOR v_item IN SELECT * FROM public.career_context_items WHERE id=ANY(COALESCE(p_item_ids,'{}')) FOR SHARE LOOP
   IF v_item.user_id<>p_user_id OR NOT (v_item.source_module=ANY(p_source_modules)) THEN
     RAISE EXCEPTION 'Snapshot item source module is not declared by consent';
   END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.career_context_items WHERE id=ANY(COALESCE(p_item_ids,'{}')))<>COALESCE(array_length(p_item_ids,1),0) THEN
   RAISE EXCEPTION 'Snapshot item missing or not owned by user';
 END IF;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;
REVOKE EXECUTE ON FUNCTION public.assert_snapshot_source_modules_tx(UUID,UUID[],TEXT[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_snapshot_source_modules_tx(UUID,UUID[],TEXT[]) TO service_role;

-- Replace snapshot creation so module validation occurs under the same locks.
DROP FUNCTION IF EXISTS public.create_grounding_snapshot_tx(UUID,TEXT,JSONB,JSONB,JSONB,TEXT[],UUID[],TEXT,TEXT);
DROP FUNCTION IF EXISTS public.create_grounding_snapshot_tx(UUID,TEXT,JSONB,JSONB,JSONB,TEXT[],UUID[],TEXT,TEXT,BIGINT);
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
   IF NOT (v_item.source_module=ANY(p_source_modules)) THEN RAISE EXCEPTION 'Snapshot item source module is not declared by consent'; END IF;
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


-- Bridge selectors must agree with the authoritative snapshot manifest and the
-- declared cross-module purpose; browser labels cannot widen consent.
CREATE OR REPLACE FUNCTION public.create_module_bridge_tx(
    p_user_id UUID, p_source_module TEXT, p_target_module TEXT, p_purpose TEXT,
    p_snapshot_id UUID, p_source_record_id TEXT, p_client_request_id TEXT, p_request_hash TEXT
) RETURNS JSONB AS $$
DECLARE v_existing RECORD; v_snapshot RECORD; v_existing_found BOOLEAN; v_bridge_id UUID:=gen_random_uuid(); v_now TIMESTAMPTZ:=now();
BEGIN
  SELECT * INTO v_snapshot FROM public.career_context_snapshots WHERE id=p_snapshot_id FOR UPDATE;
  IF NOT FOUND OR v_snapshot.user_id<>p_user_id THEN RAISE EXCEPTION 'Bridge snapshot ownership mismatch: snapshot does not belong to user.'; END IF;
  IF v_snapshot.purpose<>p_purpose OR NOT (p_source_module=ANY(v_snapshot.source_modules)) THEN
    RAISE EXCEPTION 'Bridge purpose or source module does not match authoritative snapshot consent';
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
  VALUES(v_bridge_id,p_user_id,p_source_module,p_target_module,p_purpose,p_snapshot_id,p_source_record_id,'confirmed',p_client_request_id,p_request_hash,v_now,v_now,v_now);
  RETURN jsonb_build_object('bridgeId',v_bridge_id,'status','confirmed','replayed',false);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;
REVOKE EXECUTE ON FUNCTION public.create_module_bridge_tx(UUID,TEXT,TEXT,TEXT,UUID,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_module_bridge_tx(UUID,TEXT,TEXT,TEXT,UUID,TEXT,TEXT,TEXT) TO service_role;
