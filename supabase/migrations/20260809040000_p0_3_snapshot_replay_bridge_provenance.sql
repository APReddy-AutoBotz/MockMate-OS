-- Forward-only closure for snapshot response-loss recovery and bridge provenance.
-- Snapshot replay serialization remains in create_grounding_snapshot_tx; this
-- definition makes bridge provenance an explicit invariant of the locked,
-- authoritative snapshot rather than trusting a browser label.

CREATE OR REPLACE FUNCTION public.create_module_bridge_tx(
    p_user_id UUID, p_source_module TEXT, p_target_module TEXT, p_purpose TEXT,
    p_snapshot_id UUID, p_source_record_id TEXT, p_client_request_id TEXT, p_request_hash TEXT
) RETURNS JSONB AS $$
DECLARE v_existing RECORD; v_snapshot RECORD; v_existing_found BOOLEAN; v_bridge_id UUID:=gen_random_uuid(); v_now TIMESTAMPTZ:=now(); v_source_module TEXT;
BEGIN
  SELECT * INTO v_snapshot FROM public.career_context_snapshots WHERE id=p_snapshot_id FOR UPDATE;
  IF NOT FOUND OR v_snapshot.user_id<>p_user_id THEN RAISE EXCEPTION 'Bridge snapshot ownership mismatch: snapshot does not belong to user.'; END IF;
  IF v_snapshot.purpose<>p_purpose THEN RAISE EXCEPTION 'Bridge purpose does not match authoritative snapshot consent'; END IF;
  IF NOT (p_source_module=ANY(v_snapshot.source_modules)) THEN
    RAISE EXCEPTION 'Bridge source module contradicts authoritative snapshot provenance';
  END IF;
  -- Persist only the value validated from the locked snapshot manifest.
  SELECT sm.module_name INTO v_source_module
    FROM unnest(v_snapshot.source_modules) AS sm(module_name)
    WHERE sm.module_name=p_source_module;
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
  VALUES(v_bridge_id,p_user_id,v_source_module,p_target_module,p_purpose,p_snapshot_id,p_source_record_id,'confirmed',p_client_request_id,p_request_hash,v_now,v_now,v_now);
  RETURN jsonb_build_object('bridgeId',v_bridge_id,'status','confirmed','replayed',false);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;
REVOKE EXECUTE ON FUNCTION public.create_module_bridge_tx(UUID,TEXT,TEXT,TEXT,UUID,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_module_bridge_tx(UUID,TEXT,TEXT,TEXT,UUID,TEXT,TEXT,TEXT) TO service_role;
