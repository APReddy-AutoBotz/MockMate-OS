-- Forward-only closure: one-time snapshot consent and convergent source lineage.

-- Serialize bridge creation on the governed snapshot. Exact request replay is
-- returned first, but a distinct bridge may reserve a one-time snapshot only once.
CREATE OR REPLACE FUNCTION public.create_module_bridge_tx(
    p_user_id UUID, p_source_module TEXT, p_target_module TEXT, p_purpose TEXT,
    p_snapshot_id UUID, p_source_record_id TEXT, p_client_request_id TEXT, p_request_hash TEXT
) RETURNS JSONB AS $$
DECLARE v_existing RECORD; v_snapshot RECORD; v_existing_found BOOLEAN; v_bridge_id UUID:=gen_random_uuid(); v_now TIMESTAMPTZ:=now();
BEGIN
  SELECT * INTO v_snapshot FROM public.career_context_snapshots
    WHERE id=p_snapshot_id FOR UPDATE;
  IF NOT FOUND OR v_snapshot.user_id<>p_user_id THEN
    RAISE EXCEPTION 'Bridge snapshot ownership mismatch: snapshot does not belong to user.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_client_request_id,0));
  SELECT * INTO v_existing FROM public.career_context_bridges
    WHERE user_id=p_user_id AND client_request_id=p_client_request_id;
  v_existing_found:=FOUND;
  IF v_existing_found THEN
    IF v_existing.request_hash=p_request_hash THEN
      RETURN jsonb_build_object('bridgeId',v_existing.id,'status',v_existing.status,'replayed',true);
    END IF;
    RAISE EXCEPTION 'unique_user_bridge_client_req: client_request_id replay with mismatched request hash';
  END IF;

  IF v_snapshot.consent->>'scope'='one_time' AND EXISTS (
    SELECT 1 FROM public.career_context_bridges
      WHERE user_id=p_user_id AND snapshot_id=p_snapshot_id
  ) THEN
    RAISE EXCEPTION 'one_time_snapshot_already_reserved: snapshot consent permits exactly one bridge';
  END IF;

  INSERT INTO public.career_context_bridges(id,user_id,source_module,target_module,purpose,snapshot_id,source_record_id,status,client_request_id,request_hash,confirmed_at,created_at,updated_at)
  VALUES(v_bridge_id,p_user_id,p_source_module,p_target_module,p_purpose,p_snapshot_id,p_source_record_id,'confirmed',p_client_request_id,p_request_hash,v_now,v_now,v_now);
  RETURN jsonb_build_object('bridgeId',v_bridge_id,'status','confirmed','replayed',false);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;
REVOKE EXECUTE ON FUNCTION public.create_module_bridge_tx(UUID,TEXT,TEXT,TEXT,UUID,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_module_bridge_tx(UUID,TEXT,TEXT,TEXT,UUID,TEXT,TEXT,TEXT) TO service_role;

-- Rebuild exact source lineages without forcing confirmation of an obsolete
-- pending revision. A newer pending revision atomically supersedes the older
-- pending row and remains directly linked from the actual active predecessor.
CREATE OR REPLACE FUNCTION public.rebuild_career_context_tx(p_user_id UUID,p_drafts JSONB) RETURNS JSONB AS $$
DECLARE v_state RECORD; v_draft JSONB; v_exact RECORD; v_active RECORD; v_pending RECORD; v_exact_found BOOLEAN; v_active_found BOOLEAN; v_pending_found BOOLEAN; v_new_id UUID; v_added INT:=0; v_updated INT:=0; v_unchanged INT:=0; v_now TIMESTAMPTZ:=now();
BEGIN
 SELECT * INTO v_state FROM public.career_context_state WHERE user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN INSERT INTO public.career_context_state(user_id,context_version,personalization_enabled,updated_at) VALUES(p_user_id,1,false,v_now) RETURNING * INTO v_state; END IF;
 FOR v_draft IN SELECT value FROM jsonb_array_elements(COALESCE(p_drafts,'[]')) LOOP
   SELECT * INTO v_exact FROM public.career_context_items
    WHERE user_id=p_user_id
      AND source_module=v_draft#>>'{source,module}' AND source_record_id=v_draft#>>'{source,recordId}'
      AND source_path=v_draft#>>'{source,fieldPath}'
      AND source_revision=COALESCE(v_draft#>>'{source,sourceRevision}','v1')
      AND source_hash=COALESCE(v_draft#>>'{source,sourceHash}','h1')
    LIMIT 1 FOR UPDATE;
   v_exact_found:=FOUND;
   IF v_exact_found THEN v_unchanged:=v_unchanged+1; CONTINUE; END IF;

   SELECT * INTO v_active FROM public.career_context_items
    WHERE user_id=p_user_id
      AND source_module=v_draft#>>'{source,module}' AND source_record_id=v_draft#>>'{source,recordId}'
      AND source_path=v_draft#>>'{source,fieldPath}' AND item_status='active'
    ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE;
   v_active_found:=FOUND;
   SELECT * INTO v_pending FROM public.career_context_items
    WHERE user_id=p_user_id
      AND source_module=v_draft#>>'{source,module}' AND source_record_id=v_draft#>>'{source,recordId}'
      AND source_path=v_draft#>>'{source,fieldPath}' AND item_status='pending_confirmation'
    ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE;
   v_pending_found:=FOUND;

   v_new_id:=gen_random_uuid();
   INSERT INTO public.career_context_items(id,user_id,item_kind,canonical_key,label,value,source_module,source_record_id,source_path,source_revision,source_hash,exact_excerpt,provenance,item_status,sensitivity,created_at,updated_at)
   VALUES(v_new_id,p_user_id,v_draft->>'kind',v_draft->>'canonicalKey',v_draft->>'label',v_draft->'value',v_draft#>>'{source,module}',v_draft#>>'{source,recordId}',v_draft#>>'{source,fieldPath}',COALESCE(v_draft#>>'{source,sourceRevision}','v1'),COALESCE(v_draft#>>'{source,sourceHash}','h1'),v_draft->>'exactExcerpt',v_draft->>'provenance',CASE WHEN v_active_found OR v_pending_found THEN 'pending_confirmation' ELSE COALESCE(v_draft->>'status','pending_confirmation') END,v_draft->>'sensitivity',v_now,v_now);

   IF v_pending_found THEN
     UPDATE public.career_context_items SET item_status='superseded',superseded_by=v_new_id,updated_at=v_now
       WHERE id=v_pending.id AND item_status='pending_confirmation';
     IF NOT FOUND THEN RAISE EXCEPTION 'Concurrent pending successor replacement conflict'; END IF;
   END IF;
   IF v_active_found THEN
     UPDATE public.career_context_items SET superseded_by=v_new_id,updated_at=v_now
       WHERE id=v_active.id AND item_status='active';
     IF NOT FOUND THEN RAISE EXCEPTION 'Concurrent active predecessor lineage conflict'; END IF;
     v_updated:=v_updated+1;
   ELSIF v_pending_found THEN
     v_updated:=v_updated+1;
   ELSE
     v_added:=v_added+1;
   END IF;
 END LOOP;
 IF v_added+v_updated>0 THEN UPDATE public.career_context_state SET context_version=context_version+1,updated_at=v_now WHERE user_id=p_user_id; END IF;
 RETURN jsonb_build_object('addedCount',v_added,'updatedCount',v_updated,'unchangedCount',v_unchanged);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;
REVOKE EXECUTE ON FUNCTION public.rebuild_career_context_tx(UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_career_context_tx(UUID,JSONB) TO service_role;

-- Confirmation follows only the directly linked active predecessor. Superseded
-- pending evidence remains immutable history and cannot block the newest revision.
CREATE OR REPLACE FUNCTION public.mutate_career_context_item(p_user_id UUID,p_item_id UUID,p_decision TEXT,p_new_value TEXT DEFAULT NULL,p_expected_context_version BIGINT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE v_current_ver BIGINT; v_raw_item RECORD; v_predecessor RECORD; v_now TIMESTAMPTZ:=now(); v_new_id UUID; v_new_rev TEXT; v_source_hash TEXT; v_new_value_json JSONB; v_result_item RECORD;
BEGIN
 SELECT context_version INTO v_current_ver FROM public.career_context_state WHERE user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN INSERT INTO public.career_context_state(user_id,context_version,personalization_enabled,updated_at) VALUES(p_user_id,1,false,v_now) RETURNING context_version INTO v_current_ver; END IF;
 SELECT * INTO v_raw_item FROM public.career_context_items WHERE id=p_item_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Career Context item % not found for user %',p_item_id,p_user_id; END IF;
 IF p_decision='confirm' AND v_raw_item.item_status='active' AND v_raw_item.provenance='user_confirmed' AND v_raw_item.user_confirmed_at IS NOT NULL THEN
   IF p_expected_context_version IS NOT NULL AND p_expected_context_version NOT IN (v_current_ver,v_current_ver-1) THEN RAISE EXCEPTION 'Stale or mismatched context version: expected %, current is %',p_expected_context_version,v_current_ver; END IF;
   RETURN jsonb_build_object('contextVersion',v_current_ver,'item',to_jsonb(v_raw_item),'replayed',true);
 END IF;
 IF p_expected_context_version IS NOT NULL AND p_expected_context_version<>v_current_ver THEN RAISE EXCEPTION 'Stale or mismatched context version: expected %, current is %',p_expected_context_version,v_current_ver; END IF;
 IF p_decision='confirm' THEN
   SELECT * INTO v_predecessor FROM public.career_context_items WHERE user_id=p_user_id AND superseded_by=p_item_id AND item_status='active' FOR UPDATE;
   IF FOUND THEN
     UPDATE public.career_context_items SET item_status='superseded',updated_at=v_now WHERE id=v_predecessor.id AND item_status='active';
     IF NOT FOUND THEN RAISE EXCEPTION 'Concurrent successor confirmation conflict'; END IF;
   END IF;
   UPDATE public.career_context_items SET item_status='active',provenance='user_confirmed',user_confirmed_at=v_now,updated_at=v_now WHERE id=p_item_id AND user_id=p_user_id AND item_status='pending_confirmation' RETURNING * INTO v_result_item;
   IF NOT FOUND THEN RAISE EXCEPTION 'Item is not pending confirmation'; END IF;
 ELSIF p_decision IN ('reject','revoke') THEN UPDATE public.career_context_items SET item_status='revoked',updated_at=v_now WHERE id=p_item_id RETURNING * INTO v_result_item;
 ELSIF p_decision='dispute' THEN UPDATE public.career_context_items SET item_status='disputed',updated_at=v_now WHERE id=p_item_id RETURNING * INTO v_result_item;
 ELSIF p_decision IN ('edit','replace') AND p_new_value IS NOT NULL THEN
   v_new_id:=gen_random_uuid(); v_source_hash:=encode(digest(trim(p_new_value),'sha256'),'hex'); v_new_rev:=v_raw_item.source_revision||'_revised';
   IF v_raw_item.value->>'type'='string_list' THEN v_new_value_json:=jsonb_build_object('type','string_list','values',jsonb_build_array(trim(p_new_value))); ELSE v_new_value_json:=jsonb_build_object('type','text','text',trim(p_new_value)); END IF;
   INSERT INTO public.career_context_items(id,user_id,item_kind,canonical_key,label,value,source_module,source_record_id,source_path,source_revision,source_hash,exact_excerpt,provenance,item_status,sensitivity,user_confirmed_at,created_at,updated_at)
   VALUES(v_new_id,p_user_id,v_raw_item.item_kind,v_raw_item.canonical_key,v_raw_item.label||' (Edited)',v_new_value_json,v_raw_item.source_module,v_raw_item.source_record_id,v_raw_item.source_path,v_new_rev,v_source_hash,trim(p_new_value),'user_edited','active',v_raw_item.sensitivity,v_now,v_now,v_now) RETURNING * INTO v_result_item;
   UPDATE public.career_context_items SET item_status='superseded',superseded_by=v_new_id,updated_at=v_now WHERE id=p_item_id;
 ELSE RAISE EXCEPTION 'Invalid decision type or missing replacement value'; END IF;
 UPDATE public.career_context_state SET context_version=context_version+1,updated_at=v_now WHERE user_id=p_user_id RETURNING context_version INTO v_current_ver;
 RETURN jsonb_build_object('contextVersion',v_current_ver,'item',to_jsonb(v_result_item),'replayed',false);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;
REVOKE EXECUTE ON FUNCTION public.mutate_career_context_item(UUID,UUID,TEXT,TEXT,BIGINT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_career_context_item(UUID,UUID,TEXT,TEXT,BIGINT) TO service_role;
