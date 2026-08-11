-- Forward-only correction: authoritative grounded plans and immutable source-item lineage.

CREATE TABLE public.interview_generated_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_id UUID NOT NULL REFERENCES public.career_context_snapshots(id) ON DELETE RESTRICT,
  bridge_id UUID NOT NULL REFERENCES public.career_context_bridges(id) ON DELETE RESTRICT,
  plan_hash TEXT NOT NULL CHECK (plan_hash ~ '^[a-f0-9]{64}$'),
  plan_version INTEGER NOT NULL DEFAULT 1 CHECK (plan_version > 0),
  plan_payload JSONB NOT NULL,
  session_id UUID REFERENCES public.interview_sessions(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ,
  UNIQUE (user_id, id),
  UNIQUE (user_id, bridge_id)
);
CREATE INDEX interview_generated_plans_user_bridge_idx ON public.interview_generated_plans(user_id, bridge_id);
ALTER TABLE public.interview_generated_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own generated plans" ON public.interview_generated_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role manages generated plans" ON public.interview_generated_plans FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.interview_generated_plans FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.interview_generated_plans TO authenticated;
GRANT ALL ON public.interview_generated_plans TO service_role;

CREATE FUNCTION public.prevent_generated_plan_mutation() RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('app.allow_protected_deletion', true) = 'true' AND TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND (OLD.session_id IS NOT NULL OR NEW.session_id IS NULL OR
       (NEW.user_id,NEW.snapshot_id,NEW.bridge_id,NEW.plan_hash,NEW.plan_version,NEW.plan_payload,NEW.created_at)
       IS DISTINCT FROM (OLD.user_id,OLD.snapshot_id,OLD.bridge_id,OLD.plan_hash,OLD.plan_version,OLD.plan_payload,OLD.created_at)) THEN
    RAISE EXCEPTION 'Authoritative generated plan payload and lineage are immutable and bind once';
  END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Authoritative generated plans require protected account deletion'; END IF;
  RETURN COALESCE(NEW, OLD);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;
CREATE TRIGGER protect_generated_plan BEFORE UPDATE OR DELETE ON public.interview_generated_plans
FOR EACH ROW EXECUTE FUNCTION public.prevent_generated_plan_mutation();

CREATE FUNCTION public.bind_interview_plan_session_tx(p_user_id UUID,p_plan_id UUID,p_plan_hash TEXT,p_bridge_id UUID,p_session_id UUID)
RETURNS JSONB AS $$
DECLARE v_plan RECORD; v_bridge RECORD; v_session RECORD; v_now TIMESTAMPTZ:=now();
BEGIN
  SELECT * INTO v_plan FROM public.interview_generated_plans WHERE id=p_plan_id AND user_id=p_user_id FOR UPDATE;
  IF v_plan IS NULL THEN RAISE EXCEPTION 'Authoritative plan not found or not owned'; END IF;
  IF v_plan.plan_hash<>p_plan_hash OR v_plan.bridge_id<>p_bridge_id THEN RAISE EXCEPTION 'Authoritative plan lineage mismatch'; END IF;
  IF v_plan.session_id IS NOT NULL THEN
    IF v_plan.session_id=p_session_id THEN RETURN jsonb_build_object('sessionId',v_plan.session_id,'replayed',true); END IF;
    RAISE EXCEPTION 'Authoritative plan has already created a canonical session';
  END IF;
  SELECT * INTO v_bridge FROM public.career_context_bridges WHERE id=p_bridge_id AND user_id=p_user_id FOR UPDATE;
  IF v_bridge IS NULL OR v_bridge.status<>'confirmed' OR v_bridge.snapshot_id<>v_plan.snapshot_id THEN RAISE EXCEPTION 'Bridge is not confirmed or plan lineage mismatches'; END IF;
  SELECT * INTO v_session FROM public.interview_sessions WHERE id=p_session_id AND user_id=p_user_id FOR UPDATE;
  IF v_session IS NULL OR v_session.setup#>>'{interviewPlan,authority,planId}'<>p_plan_id::text OR v_session.setup#>>'{interviewPlan,authority,planHash}'<>p_plan_hash THEN
    RAISE EXCEPTION 'Session does not contain the exact authoritative plan selector';
  END IF;
  UPDATE public.interview_generated_plans SET session_id=p_session_id,consumed_at=v_now WHERE id=p_plan_id;
  UPDATE public.career_context_bridges SET status='consumed',target_session_id=p_session_id,consumed_at=v_now,updated_at=v_now WHERE id=p_bridge_id;
  RETURN jsonb_build_object('sessionId',p_session_id,'replayed',false);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;
REVOKE EXECUTE ON FUNCTION public.bind_interview_plan_session_tx(UUID,UUID,TEXT,UUID,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bind_interview_plan_session_tx(UUID,UUID,TEXT,UUID,UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.rebuild_career_context_tx(p_user_id UUID,p_drafts JSONB) RETURNS JSONB AS $$
DECLARE v_state RECORD; v_draft JSONB; v_existing RECORD; v_new_id UUID; v_added INT:=0; v_updated INT:=0; v_unchanged INT:=0; v_now TIMESTAMPTZ:=now();
BEGIN
 SELECT * INTO v_state FROM public.career_context_state WHERE user_id=p_user_id FOR UPDATE;
 IF v_state IS NULL THEN INSERT INTO public.career_context_state(user_id,context_version,personalization_enabled,updated_at) VALUES(p_user_id,1,false,v_now) RETURNING * INTO v_state; END IF;
 FOR v_draft IN SELECT value FROM jsonb_array_elements(COALESCE(p_drafts,'[]')) LOOP
   SELECT * INTO v_existing FROM public.career_context_items WHERE user_id=p_user_id AND canonical_key=v_draft->>'canonicalKey' ORDER BY created_at DESC,id DESC LIMIT 1 FOR UPDATE;
   IF v_existing IS NULL THEN
     INSERT INTO public.career_context_items(id,user_id,item_kind,canonical_key,label,value,source_module,source_record_id,source_path,source_revision,source_hash,exact_excerpt,provenance,item_status,sensitivity,created_at,updated_at)
     VALUES(gen_random_uuid(),p_user_id,v_draft->>'kind',v_draft->>'canonicalKey',v_draft->>'label',v_draft->'value',v_draft#>>'{source,module}',v_draft#>>'{source,recordId}',v_draft#>>'{source,fieldPath}',COALESCE(v_draft#>>'{source,sourceRevision}','v1'),COALESCE(v_draft#>>'{source,sourceHash}','h1'),v_draft->>'exactExcerpt',v_draft->>'provenance',COALESCE(v_draft->>'status','pending_confirmation'),v_draft->>'sensitivity',v_now,v_now); v_added:=v_added+1;
   ELSIF v_existing.source_hash IS DISTINCT FROM v_draft#>>'{source,sourceHash}' THEN
     v_new_id:=gen_random_uuid();
     INSERT INTO public.career_context_items(id,user_id,item_kind,canonical_key,label,value,source_module,source_record_id,source_path,source_revision,source_hash,exact_excerpt,provenance,item_status,sensitivity,created_at,updated_at)
     VALUES(v_new_id,p_user_id,v_draft->>'kind',v_draft->>'canonicalKey',v_draft->>'label',v_draft->'value',v_draft#>>'{source,module}',v_draft#>>'{source,recordId}',v_draft#>>'{source,fieldPath}',COALESCE(v_draft#>>'{source,sourceRevision}','v1'),COALESCE(v_draft#>>'{source,sourceHash}','h1'),v_draft->>'exactExcerpt',v_draft->>'provenance','pending_confirmation',v_draft->>'sensitivity',v_now,v_now);
     -- Only lineage metadata changes. The prior row's governed content and user-confirmed/edited authority remain intact.
     UPDATE public.career_context_items SET superseded_by=v_new_id,updated_at=v_now WHERE id=v_existing.id;
     v_updated:=v_updated+1;
   ELSE v_unchanged:=v_unchanged+1; END IF;
 END LOOP;
 IF v_added+v_updated>0 THEN UPDATE public.career_context_state SET context_version=context_version+1,updated_at=v_now WHERE user_id=p_user_id; END IF;
 RETURN jsonb_build_object('addedCount',v_added,'updatedCount',v_updated,'unchangedCount',v_unchanged);
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;
REVOKE EXECUTE ON FUNCTION public.rebuild_career_context_tx(UUID,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_career_context_tx(UUID,JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.delete_user_career_context(target_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.allow_protected_deletion','true',true);
  DELETE FROM public.interview_generated_plans WHERE user_id=target_user_id;
  DELETE FROM public.career_context_snapshot_items WHERE snapshot_id IN (SELECT id FROM public.career_context_snapshots WHERE user_id=target_user_id) OR item_id IN (SELECT id FROM public.career_context_items WHERE user_id=target_user_id);
  DELETE FROM public.career_context_bridges WHERE user_id=target_user_id;
  DELETE FROM public.career_context_snapshots WHERE user_id=target_user_id;
  DELETE FROM public.career_context_items WHERE user_id=target_user_id;
  DELETE FROM public.career_context_state WHERE user_id=target_user_id;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;
REVOKE EXECUTE ON FUNCTION public.delete_user_career_context(UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_career_context(UUID) TO service_role;
