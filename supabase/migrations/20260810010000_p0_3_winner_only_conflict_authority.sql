-- Accept winner-only UI consent while validating conflict choices against the
-- broader locked authoritative Career Context set. Rejected alternatives are
-- validation context only and never become snapshot members.

CREATE FUNCTION public.create_grounding_snapshot_tx(
 p_user_id UUID, p_purpose TEXT, p_projection JSONB, p_conflicts JSONB, p_consent JSONB,
 p_source_modules TEXT[], p_item_ids UUID[], p_client_request_id TEXT, p_request_hash TEXT,
 p_expected_context_version BIGINT, p_conflict_selections JSONB
) RETURNS JSONB AS $$
DECLARE v_item RECORD; v_selected RECORD; v_selected_found BOOLEAN; v_key TEXT; v_selected_id UUID; v_competitor_count INT; v_requested_count INT;
BEGIN
  -- Lock every currently eligible row for the implicated keys. Eligibility or
  -- status changes therefore cannot race the winner validation and membership
  -- insert performed by the delegated snapshot transaction below.
  PERFORM 1 FROM public.career_context_items i
   WHERE i.user_id=p_user_id
     AND i.canonical_key IN (
       SELECT canonical_key FROM public.career_context_items WHERE id=ANY(COALESCE(p_item_ids,'{}'::UUID[])) AND user_id=p_user_id
       UNION SELECT key FROM jsonb_each_text(COALESCE(p_conflict_selections,'{}'::JSONB))
     )
   FOR SHARE;

  FOR v_key,v_selected_id IN SELECT key,value::UUID FROM jsonb_each_text(COALESCE(p_conflict_selections,'{}'::JSONB)) LOOP
    SELECT count(*) INTO v_competitor_count FROM public.career_context_items i
     WHERE i.user_id=p_user_id AND i.canonical_key=v_key AND i.source_module=ANY(p_source_modules)
       AND i.item_status='active' AND i.provenance<>'inferred_pending' AND i.sensitivity<>'personal_contact';
    SELECT * INTO v_selected FROM public.career_context_items i
     WHERE i.id=v_selected_id AND i.user_id=p_user_id AND i.canonical_key=v_key
       AND i.source_module=ANY(p_source_modules) AND i.item_status='active'
       AND i.provenance<>'inferred_pending' AND i.sensitivity<>'personal_contact';
    v_selected_found:=FOUND;
    SELECT count(*) INTO v_requested_count FROM unnest(COALESCE(p_item_ids,'{}'::UUID[])) requested(id)
      JOIN public.career_context_items i ON i.id=requested.id
     WHERE i.user_id=p_user_id AND i.canonical_key=v_key;
    IF v_competitor_count<2 OR NOT v_selected_found OR NOT (v_selected_id=ANY(COALESCE(p_item_ids,'{}'::UUID[]))) OR v_requested_count<>1 THEN
      RAISE EXCEPTION 'Conflict selection is invalid for the authoritative context';
    END IF;
  END LOOP;

  FOR v_item IN SELECT i.* FROM public.career_context_items i
    WHERE i.id=ANY(COALESCE(p_item_ids,'{}'::UUID[])) AND i.user_id=p_user_id LOOP
    SELECT count(*) INTO v_competitor_count FROM public.career_context_items candidate
     WHERE candidate.user_id=p_user_id AND candidate.canonical_key=v_item.canonical_key
       AND candidate.source_module=ANY(p_source_modules) AND candidate.item_status='active'
       AND candidate.provenance<>'inferred_pending' AND candidate.sensitivity<>'personal_contact';
    IF v_competitor_count>1 AND COALESCE(p_conflict_selections->>v_item.canonical_key,'')<>v_item.id::TEXT THEN
      RAISE EXCEPTION 'Unresolved or mismatched authoritative conflict selection';
    END IF;
  END LOOP;

  RETURN public.create_grounding_snapshot_tx(p_user_id,p_purpose,p_projection,p_conflicts,p_consent,
    p_source_modules,p_item_ids,p_client_request_id,p_request_hash,p_expected_context_version);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;

REVOKE EXECUTE ON FUNCTION public.create_grounding_snapshot_tx(UUID,TEXT,JSONB,JSONB,JSONB,TEXT[],UUID[],TEXT,TEXT,BIGINT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_grounding_snapshot_tx(UUID,TEXT,JSONB,JSONB,JSONB,TEXT[],UUID[],TEXT,TEXT,BIGINT,JSONB) TO service_role;
