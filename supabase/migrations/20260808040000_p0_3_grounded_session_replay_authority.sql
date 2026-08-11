-- Forward-only correction: grounded-session replay, bridge replay, and successor authority.

-- Exact bridge creation retries must use SELECT's row-found state; nullable columns
-- in a bridge row make composite `IS NOT NULL` an invalid existence test.
CREATE OR REPLACE FUNCTION public.create_module_bridge_tx(
    p_user_id UUID, p_source_module TEXT, p_target_module TEXT, p_purpose TEXT,
    p_snapshot_id UUID, p_source_record_id TEXT, p_client_request_id TEXT, p_request_hash TEXT
) RETURNS JSONB AS $$
DECLARE v_existing RECORD; v_existing_found BOOLEAN; v_snap_owner UUID; v_bridge_id UUID:=gen_random_uuid(); v_now TIMESTAMPTZ:=now();
BEGIN
  SELECT user_id INTO v_snap_owner FROM public.career_context_snapshots WHERE id=p_snapshot_id;
  IF NOT FOUND OR v_snap_owner<>p_user_id THEN RAISE EXCEPTION 'Bridge snapshot ownership mismatch: snapshot does not belong to user.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_client_request_id,0));
  SELECT * INTO v_existing FROM public.career_context_bridges WHERE user_id=p_user_id AND client_request_id=p_client_request_id;
  v_existing_found:=FOUND;
  IF v_existing_found THEN
    IF v_existing.request_hash=p_request_hash THEN
      RETURN jsonb_build_object('bridgeId',v_existing.id,'status',v_existing.status,'replayed',true);
    END IF;
    RAISE EXCEPTION 'unique_user_bridge_client_req: client_request_id replay with mismatched request hash';
  END IF;
  INSERT INTO public.career_context_bridges(id,user_id,source_module,target_module,purpose,snapshot_id,source_record_id,status,client_request_id,request_hash,confirmed_at,created_at,updated_at)
  VALUES(v_bridge_id,p_user_id,p_source_module,p_target_module,p_purpose,p_snapshot_id,p_source_record_id,'confirmed',p_client_request_id,p_request_hash,v_now,v_now,v_now);
  RETURN jsonb_build_object('bridgeId',v_bridge_id,'status','confirmed','replayed',false);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;
REVOKE EXECUTE ON FUNCTION public.create_module_bridge_tx(UUID,TEXT,TEXT,TEXT,UUID,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_module_bridge_tx(UUID,TEXT,TEXT,TEXT,UUID,TEXT,TEXT,TEXT) TO service_role;

-- Binding is the server-authoritative grounded session-start action. Charge usage
-- inside the same transaction only for its canonical first bind; exact replays
-- return before quota inspection or mutation.
CREATE OR REPLACE FUNCTION public.bind_interview_plan_session_tx(p_user_id UUID,p_plan_id UUID,p_plan_hash TEXT,p_bridge_id UUID,p_session_id UUID)
RETURNS JSONB AS $$
DECLARE v_plan RECORD; v_bridge RECORD; v_session RECORD; v_usage RECORD; v_now TIMESTAMPTZ:=now(); v_limit INTEGER:=20;
BEGIN
  SELECT * INTO v_plan FROM public.interview_generated_plans WHERE id=p_plan_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Authoritative plan not found or not owned'; END IF;
  IF v_plan.plan_hash<>p_plan_hash OR v_plan.bridge_id<>p_bridge_id THEN RAISE EXCEPTION 'Authoritative plan lineage mismatch'; END IF;
  IF v_plan.session_id IS NOT NULL THEN
    IF v_plan.session_id=p_session_id THEN RETURN jsonb_build_object('sessionId',v_plan.session_id,'replayed',true,'usageCharged',false); END IF;
    RAISE EXCEPTION 'Authoritative plan has already created a canonical session';
  END IF;
  SELECT * INTO v_bridge FROM public.career_context_bridges WHERE id=p_bridge_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR v_bridge.status<>'confirmed' OR v_bridge.snapshot_id<>v_plan.snapshot_id THEN RAISE EXCEPTION 'Bridge is not confirmed or plan lineage mismatches'; END IF;
  SELECT * INTO v_session FROM public.interview_sessions WHERE id=p_session_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR v_session.setup#>>'{interviewPlan,authority,planId}'<>p_plan_id::text OR v_session.setup#>>'{interviewPlan,authority,planHash}'<>p_plan_hash THEN
    RAISE EXCEPTION 'Session does not contain the exact authoritative plan selector';
  END IF;
  INSERT INTO public.usage_ledger(user_id,usage_date,feature,used,limit_value,updated_at)
    VALUES(p_user_id,current_date,'interview_question',0,v_limit,v_now) ON CONFLICT(user_id,usage_date,feature) DO NOTHING;
  SELECT * INTO v_usage FROM public.usage_ledger WHERE user_id=p_user_id AND usage_date=current_date AND feature='interview_question' FOR UPDATE;
  IF v_usage.used>=v_limit THEN RAISE EXCEPTION 'daily_limit_reached: interview_question usage limit reached'; END IF;
  UPDATE public.usage_ledger SET used=used+1,limit_value=v_limit,updated_at=v_now
    WHERE user_id=p_user_id AND usage_date=current_date AND feature='interview_question';
  UPDATE public.interview_generated_plans SET session_id=p_session_id,consumed_at=v_now WHERE id=p_plan_id;
  UPDATE public.career_context_bridges SET status='consumed',target_session_id=p_session_id,consumed_at=v_now,updated_at=v_now WHERE id=p_bridge_id;
  RETURN jsonb_build_object('sessionId',p_session_id,'replayed',false,'usageCharged',true);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;
REVOKE EXECUTE ON FUNCTION public.bind_interview_plan_session_tx(UUID,UUID,TEXT,UUID,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bind_interview_plan_session_tx(UUID,UUID,TEXT,UUID,UUID) TO service_role;

-- Confirming a source successor transfers active authority within precisely its
-- linked lineage while immutable snapshot membership/content remains untouched.
CREATE OR REPLACE FUNCTION public.mutate_career_context_item(p_user_id UUID,p_item_id UUID,p_decision TEXT,p_new_value TEXT DEFAULT NULL,p_expected_context_version BIGINT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE v_current_ver BIGINT; v_raw_item RECORD; v_predecessor RECORD; v_now TIMESTAMPTZ:=now(); v_new_id UUID; v_new_rev TEXT; v_source_hash TEXT; v_new_value_json JSONB; v_result_item RECORD;
BEGIN
 SELECT context_version INTO v_current_ver FROM public.career_context_state WHERE user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN INSERT INTO public.career_context_state(user_id,context_version,personalization_enabled,updated_at) VALUES(p_user_id,1,false,v_now) RETURNING context_version INTO v_current_ver; END IF;
 SELECT * INTO v_raw_item FROM public.career_context_items WHERE id=p_item_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Career Context item % not found for user %',p_item_id,p_user_id; END IF;
 -- An exact confirmation retry is an idempotent no-op, including after its first
 -- commit advanced the version.
 IF p_decision='confirm' AND v_raw_item.item_status='active' AND v_raw_item.provenance='user_confirmed' THEN
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
