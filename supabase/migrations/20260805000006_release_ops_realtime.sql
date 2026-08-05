-- Migration: 20260805000006_release_ops_realtime.sql
-- Description: Enable Supabase Realtime publication for release_ops_jobs and release_ops_job_events

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE release_ops_jobs;
        ALTER PUBLICATION supabase_realtime ADD TABLE release_ops_job_events;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN
        NULL; -- Ignore if already added
END $$;
