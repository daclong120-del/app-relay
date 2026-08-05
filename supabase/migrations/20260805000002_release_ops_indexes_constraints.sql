-- Migration: 20260805000002_release_ops_indexes_constraints.sql
-- Description: Foreign keys, Check constraints, and Performance Indexes for Release Ops tables

-- 1. Foreign Key Constraints
ALTER TABLE release_ops_apps
    ADD CONSTRAINT fk_release_ops_apps_play_account
    FOREIGN KEY (play_account_id) REFERENCES release_ops_play_accounts(id) ON DELETE SET NULL;

ALTER TABLE release_ops_releases
    ADD CONSTRAINT fk_release_ops_releases_app
    FOREIGN KEY (app_id) REFERENCES release_ops_apps(id) ON DELETE CASCADE;

ALTER TABLE release_ops_jobs
    ADD CONSTRAINT fk_release_ops_jobs_release
    FOREIGN KEY (release_id) REFERENCES release_ops_releases(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_release_ops_jobs_app
    FOREIGN KEY (app_id) REFERENCES release_ops_apps(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_release_ops_jobs_worker
    FOREIGN KEY (worker_id) REFERENCES release_ops_workers(id) ON DELETE SET NULL;

ALTER TABLE release_ops_job_events
    ADD CONSTRAINT fk_release_ops_job_events_job
    FOREIGN KEY (job_id) REFERENCES release_ops_jobs(id) ON DELETE CASCADE;

ALTER TABLE release_ops_artifacts
    ADD CONSTRAINT fk_release_ops_artifacts_release
    FOREIGN KEY (release_id) REFERENCES release_ops_releases(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_release_ops_artifacts_job
    FOREIGN KEY (job_id) REFERENCES release_ops_jobs(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_release_ops_artifacts_app
    FOREIGN KEY (app_id) REFERENCES release_ops_apps(id) ON DELETE SET NULL;

ALTER TABLE release_ops_aso_metrics
    ADD CONSTRAINT fk_release_ops_aso_metrics_app
    FOREIGN KEY (app_id) REFERENCES release_ops_apps(id) ON DELETE CASCADE;

-- 2. Unique Constraints
ALTER TABLE release_ops_apps
    ADD CONSTRAINT uq_release_ops_apps_package_name UNIQUE (package_name);

ALTER TABLE release_ops_jobs
    ADD CONSTRAINT uq_release_ops_jobs_idempotency_key UNIQUE (idempotency_key);

ALTER TABLE release_ops_artifacts
    ADD CONSTRAINT uq_release_ops_artifacts_storage_path UNIQUE (storage_path);

-- 3. Check Constraints
ALTER TABLE release_ops_jobs
    ADD CONSTRAINT chk_release_ops_jobs_type
    CHECK (job_type IN ('upload', 'promote', 'halt', 'sync_report', 'batch_step', 'build', 'publish', 'pull_apk')),
    ADD CONSTRAINT chk_release_ops_jobs_status
    CHECK (status IN ('queued', 'claimed', 'running', 'succeeded', 'failed', 'retrying', 'dead_letter', 'cancelled', 'expired'));

-- 4. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_release_ops_apps_package_name
    ON release_ops_apps(package_name);

CREATE INDEX IF NOT EXISTS idx_release_ops_jobs_queue_claim
    ON release_ops_jobs(status, priority DESC, created_at ASC)
    WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_release_ops_jobs_app_id
    ON release_ops_jobs(app_id);

CREATE INDEX IF NOT EXISTS idx_release_ops_jobs_worker_id
    ON release_ops_jobs(worker_id);

CREATE INDEX IF NOT EXISTS idx_release_ops_job_events_job_id_created
    ON release_ops_job_events(job_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_release_ops_artifacts_expires_at
    ON release_ops_artifacts(expires_at)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_release_ops_aso_metrics_app_date
    ON release_ops_aso_metrics(app_id, report_date DESC);
