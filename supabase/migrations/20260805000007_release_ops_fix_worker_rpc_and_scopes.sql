-- Migration: 20260805000007_release_ops_fix_worker_rpc_and_scopes.sql
-- Description: Fix release_ops_register_worker RPC ON CONFLICT resolution and add UNIQUE constraint on worker_name

-- 1. Ensure UNIQUE constraint on worker_name for stable identity resolution when p_worker_id is not supplied
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'release_ops_workers_worker_name_key'
    ) THEN
        ALTER TABLE release_ops_workers ADD CONSTRAINT release_ops_workers_worker_name_key UNIQUE (worker_name);
    END IF;
END $$;

-- 2. Fixed Register or Update Worker Procedure
CREATE OR REPLACE FUNCTION release_ops_register_worker(
    p_worker_name TEXT,
    p_max_parallel_jobs INT DEFAULT 1,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_worker_id UUID DEFAULT NULL
)
RETURNS release_ops_workers
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_worker release_ops_workers;
BEGIN
    IF p_worker_id IS NOT NULL THEN
        INSERT INTO release_ops_workers (id, worker_name, max_parallel_jobs, status, last_heartbeat, metadata, updated_at)
        VALUES (p_worker_id, p_worker_name, p_max_parallel_jobs, 'active', now(), p_metadata, now())
        ON CONFLICT (id) DO UPDATE SET
            worker_name = EXCLUDED.worker_name,
            max_parallel_jobs = EXCLUDED.max_parallel_jobs,
            status = 'active',
            last_heartbeat = now(),
            metadata = release_ops_workers.metadata || EXCLUDED.metadata,
            updated_at = now()
        RETURNING * INTO v_worker;
    ELSE
        INSERT INTO release_ops_workers (worker_name, max_parallel_jobs, status, last_heartbeat, metadata, updated_at)
        VALUES (p_worker_name, p_max_parallel_jobs, 'active', now(), p_metadata, now())
        ON CONFLICT (worker_name) DO UPDATE SET
            max_parallel_jobs = EXCLUDED.max_parallel_jobs,
            status = 'active',
            last_heartbeat = now(),
            metadata = release_ops_workers.metadata || EXCLUDED.metadata,
            updated_at = now()
        RETURNING * INTO v_worker;
    END IF;

    RETURN v_worker;
END;
$$;
