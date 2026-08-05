-- Migration: 20260805000003_release_ops_rls.sql
-- Description: Row Level Security (RLS) policies for Release Ops tables

-- Enable RLS on all tables
ALTER TABLE release_ops_play_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_ops_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_ops_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_ops_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_ops_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_ops_job_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_ops_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_ops_batch_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_ops_aso_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_ops_audits ENABLE ROW LEVEL SECURITY;

-- 1. Full access policy for Service Role (Background workers & RPCs)
CREATE POLICY service_role_all_play_accounts ON release_ops_play_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_apps ON release_ops_apps FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_releases ON release_ops_releases FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_workers ON release_ops_workers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_jobs ON release_ops_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_job_events ON release_ops_job_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_artifacts ON release_ops_artifacts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_batch_operations ON release_ops_batch_operations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_aso_metrics ON release_ops_aso_metrics FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_audits ON release_ops_audits FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Authenticated Dashboard Users Policy (Read & Operations)
CREATE POLICY authenticated_select_play_accounts ON release_ops_play_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_select_apps ON release_ops_apps FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_select_releases ON release_ops_releases FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_select_workers ON release_ops_workers FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_select_jobs ON release_ops_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_select_job_events ON release_ops_job_events FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_select_artifacts ON release_ops_artifacts FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_select_batch_operations ON release_ops_batch_operations FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_select_aso_metrics ON release_ops_aso_metrics FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_select_audits ON release_ops_audits FOR SELECT TO authenticated USING (true);

CREATE POLICY authenticated_insert_jobs ON release_ops_jobs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY authenticated_update_jobs ON release_ops_jobs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_insert_apps ON release_ops_apps FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY authenticated_update_apps ON release_ops_apps FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_insert_audits ON release_ops_audits FOR INSERT TO authenticated WITH CHECK (true);
