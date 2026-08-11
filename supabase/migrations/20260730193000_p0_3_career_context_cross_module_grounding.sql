-- Forward-only Migration: P0-3 Career Context and Cross-Module Grounding Schema
-- Enables user-owned, server-authoritative Career Context, immutable grounding snapshots, and idempotent bridges.

-- 1. career_context_state
CREATE TABLE IF NOT EXISTS public.career_context_state (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    context_version BIGINT NOT NULL DEFAULT 1,
    personalization_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. career_context_items
CREATE TABLE IF NOT EXISTS public.career_context_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    item_kind TEXT NOT NULL CHECK (
        item_kind IN (
            'target_role', 'career_goal', 'skill', 'experience_claim',
            'achievement', 'project', 'education', 'certification',
            'audience_context', 'communication_goal', 'speaking_challenge',
            'practiced_vocabulary', 'practice_metric', 'interview_practice_signal',
            'development_priority'
        )
    ),
    canonical_key TEXT NOT NULL CHECK (length(trim(canonical_key)) > 0),
    label TEXT NOT NULL,
    value JSONB NOT NULL,
    source_module TEXT NOT NULL CHECK (
        source_module IN ('user_profile', 'resume', 'clearspeak', 'interview', 'manual')
    ),
    source_record_id TEXT NOT NULL,
    source_path TEXT NOT NULL,
    source_revision TEXT NOT NULL,
    source_hash TEXT NOT NULL,
    exact_excerpt TEXT,
    provenance TEXT NOT NULL CHECK (
        provenance IN ('direct_source', 'user_confirmed', 'user_edited', 'system_observed', 'inferred_pending')
    ),
    item_status TEXT NOT NULL CHECK (
        item_status IN ('active', 'pending_confirmation', 'superseded', 'revoked', 'disputed')
    ),
    sensitivity TEXT NOT NULL CHECK (
        sensitivity IN ('standard', 'private', 'personal_contact')
    ),
    user_confirmed_at TIMESTAMPTZ,
    superseded_by UUID REFERENCES public.career_context_items(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_source_identity UNIQUE (user_id, source_module, source_record_id, source_path, source_revision, source_hash)
);

CREATE INDEX IF NOT EXISTS idx_career_context_items_user_status ON public.career_context_items (user_id, item_status);
CREATE INDEX IF NOT EXISTS idx_career_context_items_canonical ON public.career_context_items (user_id, canonical_key);
CREATE INDEX IF NOT EXISTS idx_career_context_items_source ON public.career_context_items (user_id, source_module, source_record_id);

-- 3. career_context_snapshots
CREATE TABLE IF NOT EXISTS public.career_context_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (
        purpose IN ('resume_to_interview', 'resume_to_clearspeak', 'clearspeak_to_interview', 'interview_personalization', 'general_practice', 'manual_selection')
    ),
    context_version BIGINT NOT NULL,
    projection JSONB NOT NULL,
    conflicts JSONB NOT NULL DEFAULT '[]'::jsonb,
    consent JSONB NOT NULL,
    source_modules TEXT[] NOT NULL,
    client_request_id TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_snapshot_client_req UNIQUE (user_id, client_request_id)
);

CREATE INDEX IF NOT EXISTS idx_career_context_snapshots_user_purpose ON public.career_context_snapshots (user_id, purpose);
CREATE INDEX IF NOT EXISTS idx_career_context_snapshots_client_req ON public.career_context_snapshots (user_id, client_request_id);

-- 4. career_context_snapshot_items
CREATE TABLE IF NOT EXISTS public.career_context_snapshot_items (
    snapshot_id UUID NOT NULL REFERENCES public.career_context_snapshots(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public.career_context_items(id) ON DELETE RESTRICT,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (snapshot_id, item_id)
);

-- 5. career_context_bridges
CREATE TABLE IF NOT EXISTS public.career_context_bridges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_module TEXT NOT NULL CHECK (
        source_module IN ('user_profile', 'resume', 'clearspeak', 'interview', 'manual')
    ),
    target_module TEXT NOT NULL CHECK (
        target_module IN ('user_profile', 'resume', 'clearspeak', 'interview', 'manual')
    ),
    purpose TEXT NOT NULL CHECK (
        purpose IN ('resume_to_interview', 'resume_to_clearspeak', 'clearspeak_to_interview', 'interview_personalization', 'general_practice', 'manual_selection')
    ),
    snapshot_id UUID NOT NULL REFERENCES public.career_context_snapshots(id) ON DELETE CASCADE,
    source_record_id TEXT,
    target_session_id UUID REFERENCES public.interview_sessions(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'drafted' CHECK (
        status IN ('drafted', 'confirmed', 'consumed', 'cancelled', 'expired')
    ),
    client_request_id TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    confirmed_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_bridge_client_req UNIQUE (user_id, client_request_id)
);

CREATE INDEX IF NOT EXISTS idx_career_context_bridges_user_client_req ON public.career_context_bridges (user_id, client_request_id);

-- OWNER CONSISTENCY TRIGGERS
CREATE OR REPLACE FUNCTION public.check_snapshot_item_owner_consistency()
RETURNS TRIGGER AS $$
DECLARE
    v_snapshot_user UUID;
    v_item_user UUID;
BEGIN
    SELECT user_id INTO v_snapshot_user FROM public.career_context_snapshots WHERE id = NEW.snapshot_id;
    SELECT user_id INTO v_item_user FROM public.career_context_items WHERE id = NEW.item_id;

    IF v_item_user IS NOT NULL AND v_snapshot_user <> v_item_user THEN
        RAISE EXCEPTION 'Cross-user context item assignment denied.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_snapshot_item_owner_check
    BEFORE INSERT ON public.career_context_snapshot_items
    FOR EACH ROW
    EXECUTE FUNCTION public.check_snapshot_item_owner_consistency();

CREATE OR REPLACE FUNCTION public.check_bridge_owner_consistency()
RETURNS TRIGGER AS $$
DECLARE
    v_snapshot_user UUID;
    v_session_user UUID;
BEGIN
    SELECT user_id INTO v_snapshot_user FROM public.career_context_snapshots WHERE id = NEW.snapshot_id;
    IF v_snapshot_user IS NULL OR v_snapshot_user <> NEW.user_id THEN
        RAISE EXCEPTION 'Bridge snapshot ownership mismatch: snapshot does not belong to user.';
    END IF;

    IF NEW.target_session_id IS NOT NULL THEN
        SELECT user_id INTO v_session_user FROM public.interview_sessions WHERE id = NEW.target_session_id;
        IF v_session_user IS NOT NULL AND v_session_user <> NEW.user_id THEN
            RAISE EXCEPTION 'Cross-user target session consumption denied.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER trg_bridge_owner_check
    BEFORE INSERT OR UPDATE ON public.career_context_bridges
    FOR EACH ROW
    EXECUTE FUNCTION public.check_bridge_owner_consistency();

-- RLS POLICIES

ALTER TABLE public.career_context_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_context_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_context_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_context_snapshot_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.career_context_bridges ENABLE ROW LEVEL SECURITY;

-- Select policies for authenticated users
CREATE POLICY "Users can view own career_context_state"
    ON public.career_context_state FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view own career_context_items"
    ON public.career_context_items FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view own career_context_snapshots"
    ON public.career_context_snapshots FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view own career_context_snapshot_items"
    ON public.career_context_snapshot_items FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.career_context_snapshots s
            WHERE s.id = snapshot_id AND s.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can view own career_context_bridges"
    ON public.career_context_bridges FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Service Role policies for server-authoritative mutations
CREATE POLICY "Service Role full access on career_context_state"
    ON public.career_context_state FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service Role full access on career_context_items"
    ON public.career_context_items FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service Role full access on career_context_snapshots"
    ON public.career_context_snapshots FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service Role full access on career_context_snapshot_items"
    ON public.career_context_snapshot_items FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service Role full access on career_context_bridges"
    ON public.career_context_bridges FOR ALL
    TO service_role
    USING (true) WITH CHECK (true);

-- GRANTS FOR SERVICE_ROLE AND AUTHENTICATED
REVOKE ALL ON public.career_context_state FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.career_context_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.career_context_snapshots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.career_context_snapshot_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.career_context_bridges FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.career_context_state TO service_role;
GRANT ALL ON public.career_context_items TO service_role;
GRANT ALL ON public.career_context_snapshots TO service_role;
GRANT ALL ON public.career_context_snapshot_items TO service_role;
GRANT ALL ON public.career_context_bridges TO service_role;

GRANT SELECT ON public.career_context_state TO authenticated;
GRANT SELECT ON public.career_context_items TO authenticated;
GRANT SELECT ON public.career_context_snapshots TO authenticated;
GRANT SELECT ON public.career_context_snapshot_items TO authenticated;
GRANT SELECT ON public.career_context_bridges TO authenticated;

-- IMMUTABILITY TRIGGERS AND PROTECTED ACCOUNT DELETION
CREATE OR REPLACE FUNCTION public.prevent_snapshot_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF (current_setting('app.allow_protected_deletion', true) = 'true') THEN
        IF (TG_OP = 'DELETE') THEN
            RETURN OLD;
        END IF;
    END IF;
    IF (TG_OP = 'UPDATE') THEN
        RAISE EXCEPTION 'Career Context Snapshots and Snapshot Items are immutable and cannot be updated.';
    ELSIF (TG_OP = 'DELETE' AND TG_TABLE_NAME = 'career_context_snapshot_items') THEN
        RAISE EXCEPTION 'Career Context Snapshot Items membership is immutable and cannot be deleted.';
    ELSIF (TG_OP = 'DELETE' AND TG_TABLE_NAME = 'career_context_snapshots') THEN
        RAISE EXCEPTION 'Career Context Snapshots are immutable and cannot be deleted.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER prevent_snapshot_update
    BEFORE UPDATE OR DELETE ON public.career_context_snapshots
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_snapshot_mutation();

CREATE OR REPLACE TRIGGER prevent_snapshot_item_mutation
    BEFORE UPDATE OR DELETE ON public.career_context_snapshot_items
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_snapshot_mutation();

-- Service Role Transactional Account Deletion RPC
CREATE OR REPLACE FUNCTION public.delete_user_career_context(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.allow_protected_deletion', 'true', true);

    DELETE FROM public.career_context_snapshot_items
    WHERE snapshot_id IN (SELECT id FROM public.career_context_snapshots WHERE user_id = target_user_id)
       OR item_id IN (SELECT id FROM public.career_context_items WHERE user_id = target_user_id);

    DELETE FROM public.career_context_bridges WHERE user_id = target_user_id;
    DELETE FROM public.career_context_snapshots WHERE user_id = target_user_id;
    DELETE FROM public.career_context_items WHERE user_id = target_user_id;
    DELETE FROM public.career_context_state WHERE user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.delete_user_career_context(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_career_context(UUID) TO service_role;

-- Transactional Item Decision RPC
CREATE OR REPLACE FUNCTION public.mutate_career_context_item(
    p_user_id UUID,
    p_item_id UUID,
    p_decision TEXT,
    p_new_value TEXT DEFAULT NULL,
    p_expected_context_version BIGINT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_current_ver BIGINT;
    v_raw_item RECORD;
    v_now TIMESTAMPTZ := NOW();
    v_new_id UUID;
    v_new_rev TEXT;
    v_source_hash TEXT;
    v_new_value_json JSONB;
    v_result_item RECORD;
BEGIN
    SELECT context_version INTO v_current_ver
    FROM public.career_context_state
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_current_ver IS NULL THEN
        INSERT INTO public.career_context_state (user_id, context_version, personalization_enabled, updated_at)
        VALUES (p_user_id, 1, false, v_now)
        RETURNING context_version INTO v_current_ver;
    END IF;

    IF p_expected_context_version IS NOT NULL AND p_expected_context_version <> v_current_ver THEN
        RAISE EXCEPTION 'Stale or mismatched context version: expected %, current is %', p_expected_context_version, v_current_ver;
    END IF;

    SELECT * INTO v_raw_item
    FROM public.career_context_items
    WHERE id = p_item_id AND user_id = p_user_id;

    IF v_raw_item IS NULL THEN
        RAISE EXCEPTION 'Career Context item % not found for user %', p_item_id, p_user_id;
    END IF;

    IF p_decision = 'confirm' THEN
        UPDATE public.career_context_items
        SET item_status = 'active', provenance = 'user_confirmed', user_confirmed_at = v_now, updated_at = v_now
        WHERE id = p_item_id AND user_id = p_user_id
        RETURNING * INTO v_result_item;
    ELSIF p_decision IN ('reject', 'revoke') THEN
        UPDATE public.career_context_items
        SET item_status = 'revoked', updated_at = v_now
        WHERE id = p_item_id AND user_id = p_user_id
        RETURNING * INTO v_result_item;
    ELSIF p_decision = 'dispute' THEN
        UPDATE public.career_context_items
        SET item_status = 'disputed', updated_at = v_now
        WHERE id = p_item_id AND user_id = p_user_id
        RETURNING * INTO v_result_item;
    ELSIF p_decision IN ('edit', 'replace') AND p_new_value IS NOT NULL THEN
        v_new_id := gen_random_uuid();
        v_source_hash := encode(digest(trim(p_new_value), 'sha256'), 'hex');
        v_new_rev := v_raw_item.source_revision || '_revised';

        IF v_raw_item.value->>'type' = 'string_list' THEN
            v_new_value_json := jsonb_build_object('type', 'string_list', 'values', jsonb_build_array(trim(p_new_value)));
        ELSE
            v_new_value_json := jsonb_build_object('type', 'text', 'text', trim(p_new_value));
        END IF;

        INSERT INTO public.career_context_items (
            id, user_id, item_kind, canonical_key, label, value, source_module,
            source_record_id, source_path, source_revision, source_hash, exact_excerpt,
            provenance, item_status, sensitivity, user_confirmed_at, created_at, updated_at
        ) VALUES (
            v_new_id, p_user_id, v_raw_item.item_kind, v_raw_item.canonical_key,
            v_raw_item.label || ' (Edited)', v_new_value_json, v_raw_item.source_module,
            v_raw_item.source_record_id, v_raw_item.source_path, v_new_rev, v_source_hash,
            trim(p_new_value), 'user_edited', 'active', v_raw_item.sensitivity, v_now, v_now, v_now
        ) RETURNING * INTO v_result_item;

        UPDATE public.career_context_items
        SET item_status = 'superseded', superseded_by = v_new_id, updated_at = v_now
        WHERE id = p_item_id AND user_id = p_user_id;
    ELSE
        RAISE EXCEPTION 'Invalid decision type or missing replacement value';
    END IF;

    UPDATE public.career_context_state
    SET context_version = context_version + 1, updated_at = v_now
    WHERE user_id = p_user_id
    RETURNING context_version INTO v_current_ver;

    RETURN jsonb_build_object(
        'item', to_jsonb(v_result_item),
        'contextVersion', v_current_ver
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.mutate_career_context_item(UUID, UUID, TEXT, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_career_context_item(UUID, UUID, TEXT, TEXT, BIGINT) TO service_role;

-- Transactional Create Grounding Snapshot RPC
CREATE OR REPLACE FUNCTION public.create_grounding_snapshot_tx(
    p_user_id UUID,
    p_purpose TEXT,
    p_projection JSONB,
    p_conflicts JSONB,
    p_consent JSONB,
    p_source_modules TEXT[],
    p_item_ids UUID[],
    p_client_request_id TEXT,
    p_request_hash TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_existing RECORD;
    v_current_ver BIGINT;
    v_snapshot_id UUID := gen_random_uuid();
    v_now TIMESTAMPTZ := NOW();
    v_item_id UUID;
    v_pos INT := 0;
BEGIN
    SELECT * INTO v_existing
    FROM public.career_context_snapshots
    WHERE user_id = p_user_id AND client_request_id = p_client_request_id;

    IF v_existing IS NOT NULL THEN
        IF v_existing.request_hash = p_request_hash THEN
            RETURN jsonb_build_object(
                'snapshotId', v_existing.id,
                'contextVersion', v_existing.context_version,
                'replayed', true
            );
        ELSE
            RAISE EXCEPTION 'unique_user_snapshot_client_req: client_request_id replay with mismatched request hash';
        END IF;
    END IF;

    SELECT context_version INTO v_current_ver
    FROM public.career_context_state
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_current_ver IS NULL THEN
        v_current_ver := 1;
    END IF;

    INSERT INTO public.career_context_snapshots (
        id, user_id, purpose, context_version, projection, conflicts, consent, source_modules, client_request_id, request_hash, created_at
    ) VALUES (
        v_snapshot_id, p_user_id, p_purpose, v_current_ver, p_projection, COALESCE(p_conflicts, '[]'::jsonb), p_consent, p_source_modules, p_client_request_id, p_request_hash, v_now
    );

    IF p_item_ids IS NOT NULL AND array_length(p_item_ids, 1) > 0 THEN
        FOREACH v_item_id IN ARRAY p_item_ids LOOP
            INSERT INTO public.career_context_snapshot_items (snapshot_id, item_id, position)
            VALUES (v_snapshot_id, v_item_id, v_pos);
            v_pos := v_pos + 1;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'snapshotId', v_snapshot_id,
        'contextVersion', v_current_ver,
        'replayed', false
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.create_grounding_snapshot_tx(UUID, TEXT, JSONB, JSONB, JSONB, TEXT[], UUID[], TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_grounding_snapshot_tx(UUID, TEXT, JSONB, JSONB, JSONB, TEXT[], UUID[], TEXT, TEXT) TO service_role;

-- Transactional Create Module Bridge RPC
CREATE OR REPLACE FUNCTION public.create_module_bridge_tx(
    p_user_id UUID,
    p_source_module TEXT,
    p_target_module TEXT,
    p_purpose TEXT,
    p_snapshot_id UUID,
    p_source_record_id TEXT,
    p_client_request_id TEXT,
    p_request_hash TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_existing RECORD;
    v_snap_owner UUID;
    v_bridge_id UUID := gen_random_uuid();
    v_now TIMESTAMPTZ := NOW();
BEGIN
    SELECT user_id INTO v_snap_owner
    FROM public.career_context_snapshots
    WHERE id = p_snapshot_id;

    IF v_snap_owner IS NULL OR v_snap_owner <> p_user_id THEN
        RAISE EXCEPTION 'Bridge snapshot ownership mismatch: snapshot does not belong to user.';
    END IF;

    SELECT * INTO v_existing
    FROM public.career_context_bridges
    WHERE user_id = p_user_id AND client_request_id = p_client_request_id;

    IF v_existing IS NOT NULL THEN
        IF v_existing.request_hash = p_request_hash THEN
            RETURN jsonb_build_object(
                'bridgeId', v_existing.id,
                'status', v_existing.status,
                'replayed', true
            );
        ELSE
            RAISE EXCEPTION 'unique_user_bridge_client_req: client_request_id replay with mismatched request hash';
        END IF;
    END IF;

    INSERT INTO public.career_context_bridges (
        id, user_id, source_module, target_module, purpose, snapshot_id, source_record_id, status, client_request_id, request_hash, confirmed_at, created_at, updated_at
    ) VALUES (
        v_bridge_id, p_user_id, p_source_module, p_target_module, p_purpose, p_snapshot_id, p_source_record_id, 'confirmed', p_client_request_id, p_request_hash, v_now, v_now, v_now
    );

    RETURN jsonb_build_object(
        'bridgeId', v_bridge_id,
        'status', 'confirmed',
        'replayed', false
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.create_module_bridge_tx(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_module_bridge_tx(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT) TO service_role;

-- Transactional Consume Module Bridge RPC
CREATE OR REPLACE FUNCTION public.consume_module_bridge_tx(
    p_user_id UUID,
    p_bridge_id UUID,
    p_target_session_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_bridge RECORD;
    v_snapshot RECORD;
    v_session_owner UUID;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    SELECT * INTO v_bridge
    FROM public.career_context_bridges
    WHERE id = p_bridge_id AND user_id = p_user_id
    FOR UPDATE;

    IF v_bridge IS NULL THEN
        RAISE EXCEPTION 'Bridge % not found for user %', p_bridge_id, p_user_id;
    END IF;

    IF v_bridge.status = 'cancelled' THEN
        RAISE EXCEPTION 'Bridge has been cancelled';
    ELSIF v_bridge.status = 'expired' THEN
        RAISE EXCEPTION 'Bridge has expired';
    END IF;

    IF p_target_session_id IS NOT NULL THEN
        SELECT user_id INTO v_session_owner
        FROM public.interview_sessions
        WHERE id = p_target_session_id;

        IF v_session_owner IS NOT NULL AND v_session_owner <> p_user_id THEN
            RAISE EXCEPTION 'Cross-user target session consumption denied.';
        END IF;
    END IF;

    UPDATE public.career_context_bridges
    SET status = 'consumed', target_session_id = p_target_session_id, consumed_at = v_now, updated_at = v_now
    WHERE id = p_bridge_id AND user_id = p_user_id;

    SELECT * INTO v_snapshot
    FROM public.career_context_snapshots
    WHERE id = v_bridge.snapshot_id;

    RETURN jsonb_build_object(
        'bridgeId', v_bridge.id,
        'status', 'consumed',
        'snapshotId', v_bridge.snapshot_id,
        'projection', v_snapshot.projection,
        'purpose', v_bridge.purpose
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION public.consume_module_bridge_tx(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_module_bridge_tx(UUID, UUID, UUID) TO service_role;
