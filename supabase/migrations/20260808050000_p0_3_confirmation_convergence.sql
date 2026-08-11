-- Make confirmation convergence explicit: only an item carrying durable evidence
-- of a committed confirmation may take the replay path. A retry may present the
-- version used by the first attempt (current - 1), while older versions remain
-- stale and unrelated pre-active rows are not treated as confirmed operations.
CREATE OR REPLACE FUNCTION public.mutate_career_context_item(p_user_id UUID,p_item_id UUID,p_decision TEXT,p_new_value TEXT DEFAULT NULL,p_expected_context_version BIGINT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE v_current_ver BIGINT; v_raw_item RECORD; v_predecessor RECORD; v_now TIMESTAMPTZ:=now(); v_new_id UUID; v_new_rev TEXT; v_source_hash TEXT; v_new_value_json JSONB; v_result_item RECORD;
BEGIN
 SELECT context_version INTO v_current_ver FROM public.career_context_state WHERE user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN INSERT INTO public.career_context_state(user_id,context_version,personalization_enabled,updated_at) VALUES(p_user_id,1,false,v_now) RETURNING context_version INTO v_current_ver; END IF;
 SELECT * INTO v_raw_item FROM public.career_context_items WHERE id=p_item_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Career Context item % not found for user %',p_item_id,p_user_id; END IF;

 IF p_decision='confirm' AND v_raw_item.item_status='active' AND v_raw_item.provenance='user_confirmed' AND v_raw_item.user_confirmed_at IS NOT NULL THEN
   IF p_expected_context_version IS NOT NULL AND p_expected_context_version NOT IN (v_current_ver,v_current_ver-1) THEN
     RAISE EXCEPTION 'Stale or mismatched context version: expected %, current is %',p_expected_context_version,v_current_ver;
   END IF;
   RETURN jsonb_build_object('contextVersion',v_current_ver,'item',to_jsonb(v_raw_item),'replayed',true);
 END IF;
 IF p_expected_context_version IS NOT NULL AND p_expected_context_version<>v_current_ver THEN RAISE EXCEPTION 'Stale or mismatched context version: expected %, current is %',p_expected_context_version,v_current_ver; END IF;
 IF p_decision='confirm' THEN
   SELECT * INTO v_predecessor FROM public.career_context_items WHERE user_id=p_user_id AND superseded_by=p_item_id FOR UPDATE;
   IF FOUND THEN
     IF v_predecessor.item_status<>'active' THEN RAISE EXCEPTION 'Successor predecessor is no longer the active authoritative lineage version'; END IF;
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
