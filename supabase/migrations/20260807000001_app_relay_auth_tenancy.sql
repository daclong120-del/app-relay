-- Migration: 20260807000001_app_relay_auth_tenancy.sql
-- Description: Partner authentication (API keys), tenant isolation, and the
--              previously-missing release_ops_worker_tokens table.
--
-- Context: the public API at /api/app-relay/v1 had no authentication and no
-- tenant boundary, and token.guard.ts queried release_ops_worker_tokens which
-- was never created by any migration. This migration supplies the schema those
-- guards need so that authentication can stop falling back to a shared secret.

-- ---------------------------------------------------------------------------
-- 1. Tenants (one row per partner / internal caller)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_relay_tenants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    contact_email TEXT,
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_app_relay_tenants_slug') THEN
        ALTER TABLE app_relay_tenants ADD CONSTRAINT uq_app_relay_tenants_slug UNIQUE (slug);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_app_relay_tenants_status') THEN
        ALTER TABLE app_relay_tenants ADD CONSTRAINT ck_app_relay_tenants_status
            CHECK (status IN ('active', 'suspended', 'disabled'));
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Partner API keys
--    The raw key is NEVER stored. Only sha256(raw_key) is persisted, so a
--    database leak cannot be replayed against the API.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_relay_api_keys (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES app_relay_tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    scopes JSONB NOT NULL DEFAULT '["jobs:read","jobs:write","artifacts:read"]'::jsonb,
    status TEXT NOT NULL DEFAULT 'active',
    rate_limit_per_min INTEGER NOT NULL DEFAULT 60,
    daily_job_quota INTEGER NOT NULL DEFAULT 200,
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_app_relay_api_keys_token_hash') THEN
        ALTER TABLE app_relay_api_keys ADD CONSTRAINT uq_app_relay_api_keys_token_hash UNIQUE (token_hash);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_app_relay_api_keys_status') THEN
        ALTER TABLE app_relay_api_keys ADD CONSTRAINT ck_app_relay_api_keys_status
            CHECK (status IN ('active', 'revoked'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_app_relay_api_keys_tenant
    ON app_relay_api_keys (tenant_id) WHERE status = 'active';

-- ---------------------------------------------------------------------------
-- 3. Worker tokens (table referenced by token.guard.ts but never created)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS release_ops_worker_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    token_hash TEXT NOT NULL,
    worker_name TEXT,
    worker_id UUID,
    scopes JSONB NOT NULL DEFAULT '["*"]'::jsonb,
    status TEXT NOT NULL DEFAULT 'active',
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_release_ops_worker_tokens_hash') THEN
        ALTER TABLE release_ops_worker_tokens ADD CONSTRAINT uq_release_ops_worker_tokens_hash UNIQUE (token_hash);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_release_ops_worker_tokens_status') THEN
        ALTER TABLE release_ops_worker_tokens ADD CONSTRAINT ck_release_ops_worker_tokens_status
            CHECK (status IN ('active', 'revoked'));
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Tenant ownership on jobs and artifacts
-- ---------------------------------------------------------------------------
ALTER TABLE release_ops_jobs
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES app_relay_tenants(id);

ALTER TABLE release_ops_artifacts
    ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES app_relay_tenants(id);

-- ---------------------------------------------------------------------------
-- 5. Seed the internal tenant and backfill pre-existing rows
-- ---------------------------------------------------------------------------
INSERT INTO app_relay_tenants (name, slug, status, metadata)
VALUES ('Internal', 'internal', 'active', '{"system": true}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

UPDATE release_ops_jobs
SET tenant_id = (SELECT id FROM app_relay_tenants WHERE slug = 'internal')
WHERE tenant_id IS NULL;

UPDATE release_ops_artifacts a
SET tenant_id = COALESCE(
    (SELECT j.tenant_id FROM release_ops_jobs j WHERE j.id = a.job_id),
    (SELECT id FROM app_relay_tenants WHERE slug = 'internal')
)
WHERE a.tenant_id IS NULL;

-- ---------------------------------------------------------------------------
-- 6. Idempotency becomes per-tenant
--    The old constraint was global: two partners pulling the same package
--    collided onto a single job, so either could cancel the other's work.
-- ---------------------------------------------------------------------------
ALTER TABLE release_ops_jobs
    DROP CONSTRAINT IF EXISTS uq_release_ops_jobs_idempotency_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_release_ops_jobs_tenant_idempotency
    ON release_ops_jobs (tenant_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. Tenant-scoped query indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_release_ops_jobs_tenant_created
    ON release_ops_jobs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_release_ops_jobs_tenant_status
    ON release_ops_jobs (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_release_ops_artifacts_tenant
    ON release_ops_artifacts (tenant_id);

-- ---------------------------------------------------------------------------
-- 8. RLS — these tables hold credentials, so service_role only.
--    Deliberately NO policy for `authenticated`: a logged-in dashboard user
--    must never be able to read token hashes straight from PostgREST.
-- ---------------------------------------------------------------------------
ALTER TABLE app_relay_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_relay_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_ops_worker_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_all_app_relay_tenants ON app_relay_tenants;
CREATE POLICY service_role_all_app_relay_tenants ON app_relay_tenants
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_app_relay_api_keys ON app_relay_api_keys;
CREATE POLICY service_role_all_app_relay_api_keys ON app_relay_api_keys
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_all_worker_tokens ON release_ops_worker_tokens;
CREATE POLICY service_role_all_worker_tokens ON release_ops_worker_tokens
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 9. Key issuance helper
--    Takes a pre-computed sha256 hash so the raw key never travels to the
--    database and never lands in the Postgres statement log.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_relay_issue_api_key(
    p_tenant_slug TEXT,
    p_name TEXT,
    p_key_prefix TEXT,
    p_token_hash TEXT,
    p_scopes JSONB DEFAULT '["jobs:read","jobs:write","artifacts:read"]'::jsonb,
    p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS app_relay_api_keys
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tenant_id UUID;
    v_key app_relay_api_keys;
BEGIN
    SELECT id INTO v_tenant_id FROM app_relay_tenants WHERE slug = p_tenant_slug;
    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Unknown tenant slug: %', p_tenant_slug;
    END IF;

    INSERT INTO app_relay_api_keys (tenant_id, name, key_prefix, token_hash, scopes, expires_at)
    VALUES (v_tenant_id, p_name, p_key_prefix, p_token_hash, p_scopes, p_expires_at)
    RETURNING * INTO v_key;

    RETURN v_key;
END;
$$;
