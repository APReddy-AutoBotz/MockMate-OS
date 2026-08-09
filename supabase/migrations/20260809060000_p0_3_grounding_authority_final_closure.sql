-- Final grounding-authority convergence: non-empty snapshots and exactly-once plan generation.

CREATE TABLE public.interview_plan_generation_reservations (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bridge_id UUID NOT NULL REFERENCES public.career_context_bridges(id) ON DELETE CASCADE,
  snapshot_id UUID NOT NULL REFERENCES public.career_context_snapshots(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, bridge_id)
);
ALTER TABLE public.interview_plan_generation_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.interview_plan_generation_reservations FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.interview_plan_generation_reservations TO service_role;

CREATE FUNCTION public.reserve_interview_plan_generation_tx(p_user_id UUID,p_snapshot_id UUID,p_bridge_id UUID)
RETURNS JSONB AS $$
DECLARE v_bridge RECORD; v_plan RECORD; v_usage RECORD; v_today DATE:=current_date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_bridge_id::text,0));
  SELECT * INTO v_plan FROM public.interview_generated_plans WHERE user_id=p_user_id AND bridge_id=p_bridge_id;
  IF FOUND THEN RETURN jsonb_build_object('generate',false,'plan',to_jsonb(v_plan)); END IF;
  SELECT * INTO v_bridge FROM public.career_context_bridges WHERE id=p_bridge_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR v_bridge.status<>'confirmed' OR v_bridge.snapshot_id<>p_snapshot_id OR v_bridge.target_module<>'interview' THEN
    RAISE EXCEPTION 'Grounded Interview bridge is not confirmed, owned, or lineage-compatible';
  END IF;
  INSERT INTO public.interview_plan_generation_reservations(user_id,bridge_id,snapshot_id)
  VALUES(p_user_id,p_bridge_id,p_snapshot_id) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('generate',false); END IF;
  INSERT INTO public.usage_ledger(user_id,usage_date,feature,used,limit_value,updated_at)
  VALUES(p_user_id,v_today,'interview_question',0,20,now()) ON CONFLICT(user_id,usage_date,feature) DO NOTHING;
  SELECT * INTO v_usage FROM public.usage_ledger WHERE user_id=p_user_id AND usage_date=v_today AND feature='interview_question' FOR UPDATE;
  IF v_usage.used>=20 THEN
    DELETE FROM public.interview_plan_generation_reservations WHERE user_id=p_user_id AND bridge_id=p_bridge_id;
    RAISE EXCEPTION 'Interview question usage limit reached';
  END IF;
  UPDATE public.usage_ledger SET used=used+1,limit_value=20,updated_at=now()
  WHERE user_id=p_user_id AND usage_date=v_today AND feature='interview_question';
  RETURN jsonb_build_object('generate',true);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;
REVOKE EXECUTE ON FUNCTION public.reserve_interview_plan_generation_tx(UUID,UUID,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_interview_plan_generation_tx(UUID,UUID,UUID) TO service_role;

CREATE FUNCTION public.finalize_interview_plan_generation_tx(p_user_id UUID,p_snapshot_id UUID,p_bridge_id UUID,p_plan_hash TEXT,p_plan_payload JSONB)
RETURNS JSONB AS $$
DECLARE v_reservation RECORD; v_plan RECORD;
BEGIN
  SELECT * INTO v_plan FROM public.interview_generated_plans WHERE user_id=p_user_id AND bridge_id=p_bridge_id;
  IF FOUND THEN RETURN to_jsonb(v_plan); END IF;
  SELECT * INTO v_reservation FROM public.interview_plan_generation_reservations
  WHERE user_id=p_user_id AND bridge_id=p_bridge_id AND snapshot_id=p_snapshot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Authoritative plan generation reservation not found'; END IF;
  INSERT INTO public.interview_generated_plans(user_id,snapshot_id,bridge_id,plan_hash,plan_version,plan_payload)
  VALUES(p_user_id,p_snapshot_id,p_bridge_id,p_plan_hash,1,p_plan_payload) RETURNING * INTO v_plan;
  RETURN to_jsonb(v_plan);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;
REVOKE EXECUTE ON FUNCTION public.finalize_interview_plan_generation_tx(UUID,UUID,UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_interview_plan_generation_tx(UUID,UUID,UUID,TEXT,JSONB) TO service_role;

-- Grounded provenance is meaningless without authoritative snapshot membership.
CREATE OR REPLACE FUNCTION public.enforce_nonempty_grounding_snapshot() RETURNS TRIGGER AS $$
BEGIN
  IF COALESCE(jsonb_array_length(NEW.consent->'includedItemIds'),0)=0 THEN
    RAISE EXCEPTION 'Grounded snapshot requires at least one authoritative included fact';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SET search_path=public,pg_temp;
CREATE TRIGGER require_nonempty_grounding_snapshot BEFORE INSERT ON public.career_context_snapshots
FOR EACH ROW EXECUTE FUNCTION public.enforce_nonempty_grounding_snapshot();
