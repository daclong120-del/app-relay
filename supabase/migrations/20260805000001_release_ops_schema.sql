-- Migration: 20260805000001_release_ops_schema.sql
-- Description: Core table definitions for SinoMedia Release Ops & AppRelay integration

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Google Play Developer Accounts
CREATE TABLE IF NOT EXISTS release_ops_play_accounts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_name TEXT NOT NULL,
    developer_id TEXT,
    email TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 2. App Registry
CREATE TABLE IF NOT EXISTS release_ops_apps (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    package_name TEXT NOT NULL,
    app_name TEXT NOT NULL,
    play_account_id UUID,
    target_sdk INTEGER,
    policy_readiness TEXT NOT NULL DEFAULT 'draft',
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 3. Release Lifecycle
CREATE TABLE IF NOT EXISTS release_ops_releases (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    app_id UUID NOT NULL,
    version_name TEXT NOT NULL,
    version_code INTEGER NOT NULL,
    track TEXT NOT NULL DEFAULT 'internal',
    status TEXT NOT NULL DEFAULT 'draft',
    rollout_percentage INTEGER DEFAULT 0 NOT NULL,
    release_notes TEXT,
    health_guard JSONB DEFAULT '{}'::jsonb NOT NULL,
    readiness_gate JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 4. Worker Fleet
CREATE TABLE IF NOT EXISTS release_ops_workers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    worker_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idle',
    max_parallel_jobs INTEGER DEFAULT 1 NOT NULL,
    last_heartbeat TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 5. Job Queue (Table-based)
CREATE TABLE IF NOT EXISTS release_ops_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    priority INTEGER DEFAULT 0 NOT NULL,
    release_id UUID,
    app_id UUID,
    worker_id UUID,
    lease_until TIMESTAMPTZ,
    heartbeat_at TIMESTAMPTZ,
    attempt_count INTEGER DEFAULT 0 NOT NULL,
    max_attempts INTEGER DEFAULT 3 NOT NULL,
    idempotency_key TEXT,
    payload JSONB DEFAULT '{}'::jsonb NOT NULL,
    result JSONB DEFAULT '{}'::jsonb NOT NULL,
    error_message TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 6. Job Progress Timeline (Append-Only)
CREATE TABLE IF NOT EXISTS release_ops_job_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id UUID NOT NULL,
    level TEXT NOT NULL DEFAULT 'info',
    stage TEXT NOT NULL,
    message TEXT NOT NULL,
    progress INTEGER DEFAULT 0 NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 7. Artifact Store Metadata
CREATE TABLE IF NOT EXISTS release_ops_artifacts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    release_id UUID,
    job_id UUID,
    app_id UUID,
    file_name TEXT NOT NULL,
    checksum TEXT,
    storage_path TEXT NOT NULL,
    artifact_type TEXT NOT NULL DEFAULT 'aab',
    content_type TEXT DEFAULT 'application/octet-stream' NOT NULL,
    size_bytes BIGINT DEFAULT 0 NOT NULL,
    expires_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 8. Batch Operations
CREATE TABLE IF NOT EXISTS release_ops_batch_operations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    plan_payload JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 9. ASO / Store Performance Metrics
CREATE TABLE IF NOT EXISTS release_ops_aso_metrics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    app_id UUID NOT NULL,
    report_date DATE NOT NULL,
    store TEXT NOT NULL DEFAULT 'google_play',
    total_visitors INTEGER DEFAULT 0 NOT NULL,
    explore_visitors INTEGER DEFAULT 0 NOT NULL,
    search_visitors INTEGER DEFAULT 0 NOT NULL,
    total_acquisitions INTEGER DEFAULT 0 NOT NULL,
    explore_acquisitions INTEGER DEFAULT 0 NOT NULL,
    search_acquisitions INTEGER DEFAULT 0 NOT NULL,
    cr_app DOUBLE PRECISION DEFAULT 0 NOT NULL,
    cr_explore DOUBLE PRECISION DEFAULT 0 NOT NULL,
    cr_search DOUBLE PRECISION DEFAULT 0 NOT NULL,
    cr_organic DOUBLE PRECISION DEFAULT 0 NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- 10. System Audit Log
CREATE TABLE IF NOT EXISTS release_ops_audits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    actor_id UUID,
    details JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
