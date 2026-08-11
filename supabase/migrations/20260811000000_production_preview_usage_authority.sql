-- Atomic, server-only daily quota authority. Service role supplies the authenticated user id.
CREATE OR REPLACE FUNCTION public.consume_daily_usage_tx(p_user_id uuid,p_feature text,p_limit int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v public.usage_ledger%ROWTYPE;
BEGIN
 IF p_user_id IS NULL OR p_feature NOT IN ('resume_review','resume_suggestion','interview_question','clearspeak_session') OR p_limit < 1 THEN RAISE EXCEPTION 'invalid usage request'; END IF;
 INSERT INTO public.usage_ledger(user_id,usage_date,feature,used,limit_value) VALUES(p_user_id,current_date,p_feature,0,p_limit) ON CONFLICT DO NOTHING;
 SELECT * INTO v FROM public.usage_ledger WHERE user_id=p_user_id AND usage_date=current_date AND feature=p_feature FOR UPDATE;
 IF v.used >= p_limit THEN RETURN jsonb_build_object('allowed',false,'used',v.used,'limit',p_limit); END IF;
 UPDATE public.usage_ledger SET used=used+1,limit_value=p_limit,updated_at=now() WHERE user_id=p_user_id AND usage_date=current_date AND feature=p_feature RETURNING * INTO v;
 RETURN jsonb_build_object('allowed',true,'used',v.used,'limit',p_limit);
END $$;
REVOKE ALL ON FUNCTION public.consume_daily_usage_tx(uuid,text,int) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.consume_daily_usage_tx(uuid,text,int) TO service_role;
