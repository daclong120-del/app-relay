-- Migration: 20260805000004_release_ops_worker_rpcs.sql
-- Description: Stored Procedures (RPCs) for Worker Registration, Queue Claim, Heartbeat, Events & Completion

-- 1. Register or Update Worker
CREATE OR REPLACE FUNCTION release_ops_register_worker(
    p_worker_name TEXT,
    p_max_parallel_jobs INT DEFAULT 1,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS release_ops_workers
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_worker release_ops_workers;
BEGIN
    INSERT INTO release_ops_workers (worker_name, max_parallel_jobs, status, last_heartbeat, metadata, updated_at)
    VALUES (p_worker_name, p_max_parallel_jobs, 'active', now(), p_metadata, now())
    ON CONFLICT (id) DO UPDATE SET
        worker_name = EXCLUDED.worker_name,
        max_parallel_jobs = EXCLUDED.max_parallel_jobs,
        status = 'active',
        last_heartbeat = now(),
        metadata = release_ops_workers.metadata || EXCLUDED.metadata,
        updated_at = now()
    RETURNING * INTO v_worker;

    RETURN v_worker;
END;
$$;

-- 2. Worker Heartbeat
CREATE OR REPLACE FUNCTION release_ops_worker_heartbeat(
    p_worker_id UUID,
    p_status TEXT DEFAULT 'active',
    p_metadata JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE release_ops_workers
    SET status = p_status,
        last_heartbeat = now(),
        metadata = CASE WHEN p_metadata IS NOT NULL THEN metadata || p_metadata ELSE metadata END,
        updated_at = now()
    WHERE id = p_worker_id;
END;
$$;

-- 3. Atomic Job Claim (SKIP LOCKED)
CREATE OR REPLACE FUNCTION release_ops_claim_job(
    p_worker_id UUID,
    p_capabilities TEXT[] DEFAULT NULL,
    p_lease_seconds INT DEFAULT 300
)
RETURNS SETOF release_ops_jobs
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_job_id UUID;
BEGIN
    -- Select one eligible queued job atomically
    SELECT id INTO v_job_id
    FROM release_ops_jobs
    WHERE status = 'queued'
      AND (
        p_capabilities IS NULL 
        OR array_length(p_capabilities, 1) IS NULL
        OR job_type = ANY(p_capabilities)
        OR payload->>'capability' = ANY(p_capabilities)
      )
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_job_id IS NOT NULL THEN
        RETURN QUERY
        UPDATE release_ops_jobs
        SET status = 'claimed',
            worker_id = p_worker_id,
            lease_until = now() + (p_lease_seconds || ' seconds')::interval,
            heartbeat_at = now(),
            attempt_count = attempt_count + 1,
            updated_at = now()
        WHERE id = v_job_id
        RETURNING *;
    END IF;
END;
$$;

-- 4. Start Job Execution (claimed -> running)
CREATE OR REPLACE FUNCTION release_ops_start_job(
    p_job_id UUID,
    p_worker_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated INT;
BEGIN
    UPDATE release_ops_jobs
    SET status = 'running',
        updated_at = now()
    WHERE id = p_job_id
      AND worker_id = p_worker_id
      AND status IN ('claimed', 'running')
      AND (lease_until IS NULL OR lease_until > now());

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$;

-- 5. Job Lease Heartbeat & Cancellation Check
CREATE OR REPLACE FUNCTION release_ops_job_heartbeat(
    p_job_id UUID,
    p_worker_id UUID,
    p_lease_seconds INT DEFAULT 300
)
RETURNS TABLE(renewed BOOLEAN, is_cancelled BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_status TEXT;
BEGIN
    SELECT status INTO v_status
    FROM release_ops_jobs
    WHERE id = p_job_id AND worker_id = p_worker_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, false;
        RETURN;
    END IF;

    IF v_status = 'cancelled' THEN
        RETURN QUERY SELECT false, true;
        RETURN;
    END IF;

    UPDATE release_ops_jobs
    SET lease_until = now() + (p_lease_seconds || ' seconds')::interval,
        heartbeat_at = now(),
        updated_at = now()
    WHERE id = p_job_id AND worker_id = p_worker_id AND status IN ('claimed', 'running');

    RETURN QUERY SELECT true, false;
END;
$$;

-- 6. Append Job Progress Event
CREATE OR REPLACE FUNCTION release_ops_append_job_event(
    p_job_id UUID,
    p_worker_id UUID,
    p_level TEXT,
    p_stage TEXT,
    p_message TEXT,
    p_progress INT DEFAULT 0,
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM release_ops_jobs
        WHERE id = p_job_id AND worker_id = p_worker_id
    ) THEN
        INSERT INTO release_ops_job_events (job_id, level, stage, message, progress, metadata, created_at)
        VALUES (p_job_id, COALESCE(p_level, 'info'), p_stage, p_message, COALESCE(p_progress, 0), COALESCE(p_metadata, '{}'::jsonb), now());
        RETURN true;
    END IF;
    RETURN false;
END;
$$;

-- 7. Complete Job (Mark Succeeded)
CREATE OR REPLACE FUNCTION release_ops_complete_job(
    p_job_id UUID,
    p_worker_id UUID,
    p_result JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated INT;
BEGIN
    UPDATE release_ops_jobs
    SET status = 'succeeded',
        result = COALESCE(p_result, '{}'::jsonb),
        lease_until = NULL,
        updated_at = now()
    WHERE id = p_job_id
      AND worker_id = p_worker_id
      AND status IN ('claimed', 'running')
      AND (lease_until IS NULL OR lease_until > now());

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated > 0;
END;
$$;

-- 8. Fail Job (Retry or Dead Letter)
CREATE OR REPLACE FUNCTION release_ops_fail_job(
    p_job_id UUID,
    p_worker_id UUID,
    p_error_message TEXT,
    p_can_retry BOOLEAN DEFAULT true
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_attempt INT;
    v_max INT;
BEGIN
    SELECT attempt_count, max_attempts INTO v_attempt, v_max
    FROM release_ops_jobs
    WHERE id = p_job_id AND worker_id = p_worker_id;

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    IF p_can_retry AND v_attempt < v_max THEN
        UPDATE release_ops_jobs
        SET status = 'queued',
            worker_id = NULL,
            lease_until = NULL,
            error_message = p_error_message,
            updated_at = now()
        WHERE id = p_job_id;
    ELSE
        UPDATE release_ops_jobs
        SET status = 'dead_letter',
            lease_until = NULL,
            error_message = p_error_message,
            updated_at = now()
        WHERE id = p_job_id;
    END IF;

    RETURN true;
END;
$$;

-- 9. Cancel Job (By Admin or System)
CREATE OR REPLACE FUNCTION release_ops_cancel_job(
    p_job_id UUID,
    p_cancelled_by UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_updated INT;
BEGIN
    UPDATE release_ops_jobs
    SET status = 'cancelled',
        updated_at = now()
    WHERE id = p_job_id AND status IN ('queued', 'claimed', 'running');

    GET DIAGNOSTICS v_updated = ROW_COUNT;

    IF v_updated > 0 THEN
        INSERT INTO release_ops_audits (action, entity_type, entity_id, actor_id, details)
        VALUES ('cancel_job', 'release_ops_job', p_job_id, p_cancelled_by, jsonb_build_object('reason', 'User cancelled job'));
        RETURN true;
    END IF;

    RETURN false;
END;
$$;
