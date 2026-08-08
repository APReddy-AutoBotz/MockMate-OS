-- Forward-only correction: make exact source-identity replay detection explicit.
--
-- A PL/pgSQL RECORD containing nullable columns does not satisfy `record IS NOT
-- NULL`, even when SELECT INTO found a row.  Use FOUND snapshots instead so an
-- already-persisted source identity is always reused rather than reinserted.

CREATE OR REPLACE FUNCTION public.rebuild_career_context_tx(p_user_id UUID,p_drafts JSONB) RETURNS JSONB AS $$
DECLARE v_state RECORD; v_draft JSONB; v_exact RECORD; v_predecessor RECORD; v_exact_found BOOLEAN; v_predecessor_found BOOLEAN; v_new_id UUID; v_added INT:=0; v_updated INT:=0; v_unchanged INT:=0; v_now TIMESTAMPTZ:=now();
BEGIN
 SELECT * INTO v_state FROM public.career_context_state WHERE user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN INSERT INTO public.career_context_state(user_id,context_version,personalization_enabled,updated_at) VALUES(p_user_id,1,false,v_now) RETURNING * INTO v_state; END IF;
 FOR v_draft IN SELECT value FROM jsonb_array_elements(COALESCE(p_drafts,'[]')) LOOP
   -- Resolve the complete immutable identity before looking for a successor.
   SELECT * INTO v_exact FROM public.career_context_items
    WHERE user_id=p_user_id
      AND source_module=v_draft#>>'{source,module}' AND source_record_id=v_draft#>>'{source,recordId}'
      AND source_path=v_draft#>>'{source,fieldPath}'
      AND source_revision=COALESCE(v_draft#>>'{source,sourceRevision}','v1')
      AND source_hash=COALESCE(v_draft#>>'{source,sourceHash}','h1')
    LIMIT 1 FOR UPDATE;
   v_exact_found:=FOUND;
   IF v_exact_found THEN v_unchanged:=v_unchanged+1; CONTINUE; END IF;

   -- Different records sharing a canonical key are independent lineages.
   SELECT * INTO v_predecessor FROM public.career_context_items
    WHERE user_id=p_user_id
      AND source_module=v_draft#>>'{source,module}' AND source_record_id=v_draft#>>'{source,recordId}'
      AND source_path=v_draft#>>'{source,fieldPath}'
    ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE;
   v_predecessor_found:=FOUND;
   v_new_id:=gen_random_uuid();
   INSERT INTO public.career_context_items(id,user_id,item_kind,canonical_key,label,value,source_module,source_record_id,source_path,source_revision,source_hash,exact_excerpt,provenance,item_status,sensitivity,created_at,updated_at)
   VALUES(v_new_id,p_user_id,v_draft->>'kind',v_draft->>'canonicalKey',v_draft->>'label',v_draft->'value',v_draft#>>'{source,module}',v_draft#>>'{source,recordId}',v_draft#>>'{source,fieldPath}',COALESCE(v_draft#>>'{source,sourceRevision}','v1'),COALESCE(v_draft#>>'{source,sourceHash}','h1'),v_draft->>'exactExcerpt',v_draft->>'provenance',CASE WHEN v_predecessor_found THEN 'pending_confirmation' ELSE COALESCE(v_draft->>'status','pending_confirmation') END,v_draft->>'sensitivity',v_now,v_now);
   IF v_predecessor_found THEN
     -- Link the immutable predecessor without changing its governed content,
     -- provenance, confirmation, or active authority.
     UPDATE public.career_context_items SET superseded_by=v_new_id,updated_at=v_now WHERE id=v_predecessor.id;
     v_updated:=v_updated+1;
   ELSE v_added:=v_added+1;
   END IF;
 END LOOP;
 IF v_added+v_updated>0 THEN UPDATE public.career_context_state SET context_version=context_version+1,updated_at=v_now WHERE user_id=p_user_id; END IF;
 RETURN jsonb_build_object('addedCount',v_added,'updatedCount',v_updated,'unchangedCount',v_unchanged);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;
REVOKE EXECUTE ON FUNCTION public.rebuild_career_context_tx(UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_career_context_tx(UUID,JSONB) TO service_role;
