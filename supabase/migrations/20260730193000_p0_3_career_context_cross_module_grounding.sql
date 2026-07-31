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
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_career_context_snapshots_user_purpose ON public.career_context_snapshots (user_id, purpose);

-- 4. career_context_snapshot_items
CREATE TABLE IF NOT EXISTS public.career_context_snapshot_items (
    snapshot_id UUID NOT NULL REFERENCES public.career_context_snapshots(id) ON DELETE CASCADE,
    item_id UUID NOT NULL REFERENCES public.career_context_items(id) ON DELETE CASCADE,
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
    target_session_id TEXT,
    status TEXT NOT NULL DEFAULT 'drafted' CHECK (
        status IN ('drafted', 'confirmed', 'consumed', 'cancelled', 'expired')
    ),
    client_request_id TEXT NOT NULL,
    confirmed_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_bridge_client_req UNIQUE (user_id, client_request_id)
);

CREATE INDEX IF NOT EXISTS idx_career_context_bridges_user_client_req ON public.career_context_bridges (user_id, client_request_id);

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

-- IMMUTABILITY TRIGGERS
CREATE OR REPLACE FUNCTION public.prevent_snapshot_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        RAISE EXCEPTION 'Career Context Snapshots and Snapshot Items are immutable and cannot be updated.';
    ELSIF (TG_OP = 'DELETE' AND TG_TABLE_NAME = 'career_context_snapshot_items') THEN
        RAISE EXCEPTION 'Career Context Snapshot Items membership is immutable and cannot be deleted.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER prevent_snapshot_update
    BEFORE UPDATE ON public.career_context_snapshots
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_snapshot_mutation();

CREATE OR REPLACE TRIGGER prevent_snapshot_item_mutation
    BEFORE UPDATE OR DELETE ON public.career_context_snapshot_items
    FOR EACH ROW
    EXECUTE FUNCTION public.prevent_snapshot_mutation();

