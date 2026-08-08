-- Forward-only correction: exact source lineage and transactional personalization preference.

CREATE OR REPLACE FUNCTION public.rebuild_career_context_tx(p_user_id UUID,p_drafts JSONB) RETURNS JSONB AS $$
DECLARE v_state RECORD; v_draft JSONB; v_exact RECORD; v_predecessor RECORD; v_new_id UUID; v_added INT:=0; v_updated INT:=0; v_unchanged INT:=0; v_now TIMESTAMPTZ:=now();
BEGIN
 SELECT * INTO v_state FROM public.career_context_state WHERE user_id=p_user_id FOR UPDATE;
 IF v_state IS NULL THEN INSERT INTO public.career_context_state(user_id,context_version,personalization_enabled,updated_at) VALUES(p_user_id,1,false,v_now) RETURNING * INTO v_state; END IF;
 FOR v_draft IN SELECT value FROM jsonb_array_elements(COALESCE(p_drafts,'[]')) LOOP
   -- First resolve the complete identity protected by unique_user_source_identity.
   SELECT * INTO v_exact FROM public.career_context_items
    WHERE user_id=p_user_id
      AND source_module=v_draft#>>'{source,module}' AND source_record_id=v_draft#>>'{source,recordId}'
      AND source_path=v_draft#>>'{source,fieldPath}'
      AND source_revision=COALESCE(v_draft#>>'{source,sourceRevision}','v1')
      AND source_hash=COALESCE(v_draft#>>'{source,sourceHash}','h1')
    LIMIT 1 FOR UPDATE;
   IF v_exact IS NOT NULL THEN v_unchanged:=v_unchanged+1; CONTINUE; END IF;

   -- A predecessor belongs to this source record/path, never merely to a shared canonical key.
   SELECT * INTO v_predecessor FROM public.career_context_items
    WHERE user_id=p_user_id
      AND source_module=v_draft#>>'{source,module}' AND source_record_id=v_draft#>>'{source,recordId}'
      AND source_path=v_draft#>>'{source,fieldPath}'
    ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE;
   v_new_id:=gen_random_uuid();
   INSERT INTO public.career_context_items(id,user_id,item_kind,canonical_key,label,value,source_module,source_record_id,source_path,source_revision,source_hash,exact_excerpt,provenance,item_status,sensitivity,created_at,updated_at)
   VALUES(v_new_id,p_user_id,v_draft->>'kind',v_draft->>'canonicalKey',v_draft->>'label',v_draft->'value',v_draft#>>'{source,module}',v_draft#>>'{source,recordId}',v_draft#>>'{source,fieldPath}',COALESCE(v_draft#>>'{source,sourceRevision}','v1'),COALESCE(v_draft#>>'{source,sourceHash}','h1'),v_draft->>'exactExcerpt',v_draft->>'provenance',CASE WHEN v_predecessor IS NULL THEN COALESCE(v_draft->>'status','pending_confirmation') ELSE 'pending_confirmation' END,v_draft->>'sensitivity',v_now,v_now);
   IF v_predecessor IS NULL THEN v_added:=v_added+1;
   ELSE
     UPDATE public.career_context_items SET superseded_by=v_new_id,updated_at=v_now WHERE id=v_predecessor.id;
     v_updated:=v_updated+1;
   END IF;
 END LOOP;
 IF v_added+v_updated>0 THEN UPDATE public.career_context_state SET context_version=context_version+1,updated_at=v_now WHERE user_id=p_user_id; END IF;
 RETURN jsonb_build_object('addedCount',v_added,'updatedCount',v_updated,'unchangedCount',v_unchanged);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;
REVOKE EXECUTE ON FUNCTION public.rebuild_career_context_tx(UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_career_context_tx(UUID,JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.set_personalization_preference_tx(p_user_id UUID,p_enabled BOOLEAN,p_expected_context_version BIGINT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE v_state RECORD; v_now TIMESTAMPTZ:=now();
BEGIN
 SELECT * INTO v_state FROM public.career_context_state WHERE user_id=p_user_id FOR UPDATE;
 IF v_state IS NULL THEN
   INSERT INTO public.career_context_state(user_id,context_version,personalization_enabled,updated_at)
   VALUES(p_user_id,1,false,v_now) RETURNING * INTO v_state;
 END IF;
 IF p_expected_context_version IS NOT NULL AND p_expected_context_version<>v_state.context_version THEN
   RAISE EXCEPTION 'Stale or mismatched context version: expected %, current is %',p_expected_context_version,v_state.context_version;
 END IF;
 UPDATE public.career_context_state SET personalization_enabled=p_enabled,context_version=context_version+1,updated_at=v_now
  WHERE user_id=p_user_id RETURNING * INTO v_state;
 RETURN jsonb_build_object('userId',v_state.user_id,'contextVersion',v_state.context_version,'personalizationEnabled',v_state.personalization_enabled,'updatedAt',v_state.updated_at);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;
REVOKE EXECUTE ON FUNCTION public.set_personalization_preference_tx(UUID,BOOLEAN,BIGINT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_personalization_preference_tx(UUID,BOOLEAN,BIGINT) TO service_role;
