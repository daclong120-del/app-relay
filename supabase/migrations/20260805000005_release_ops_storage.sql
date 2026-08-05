-- Migration: 20260805000005_release_ops_storage.sql
-- Description: Private Storage Bucket setup & RLS policies for release-ops-artifacts

-- 1. Create Private Storage Bucket for Artifacts
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'release-ops-artifacts',
    'release-ops-artifacts',
    false,
    524288000, -- 500 MB limit per object
    ARRAY['application/zip', 'application/vnd.android.package-archive', 'application/octet-stream', 'application/json', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Storage Objects RLS Policies
-- Full access for Service Role (Worker presigned upload verification & admin download handoff)
CREATE POLICY service_role_storage_all ON storage.objects
    FOR ALL TO service_role
    USING (bucket_id = 'release-ops-artifacts')
    WITH CHECK (bucket_id = 'release-ops-artifacts');

-- Authenticated Users (Admins) read access via Presigned URLs
CREATE POLICY authenticated_storage_select ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'release-ops-artifacts');
