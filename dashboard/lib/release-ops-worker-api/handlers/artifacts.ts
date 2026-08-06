// Worker Artifact Upload API Handlers (Upload Init & Upload Complete)

import { validateUploadComplete, validateUploadInit } from '../schemas';

const BUCKET_NAME = 'release-ops-artifacts';
const SIGNED_UPLOAD_TTL_SECONDS = 900; // 15 minutes

export async function handleUploadInit(db: any, jobId: string, body: any) {
  const input = validateUploadInit(body);

  // 1. Verify worker lease on job
  const { data: job, error: jobError } = await db
    .from('release_ops_jobs')
    .select('id, worker_id, status, lease_until')
    .eq('id', jobId)
    .single();

  if (jobError || !job) {
    throw new Error('NOT_FOUND: Job not found.');
  }

  if (job.worker_id !== input.workerId) {
    throw new Error('FORBIDDEN: Worker does not hold lease for this job.');
  }

  if (!['claimed', 'running'].includes(job.status)) {
    throw new Error('CONFLICT: Job is not in active running state.');
  }

  // 2. Generate server-controlled object key
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const safeFileName = input.fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const storagePath = `app-relay/${year}/${month}/${jobId}/${safeFileName}`;

  // 3. Create signed upload URL from Supabase Storage
  let uploadUrl = '';
  const expiresAt = new Date(Date.now() + SIGNED_UPLOAD_TTL_SECONDS * 1000).toISOString();

  if (db.storage) {
    const { data: storageData, error: storageError } = await db.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(storagePath);

    if (storageError) {
      throw new Error(`Storage upload init failed: ${storageError.message}`);
    }
    uploadUrl = storageData.signedUrl;
  } else {
    // Fallback for mock/test environments
    uploadUrl = `https://supabase.local/storage/v1/object/upload/sign/${BUCKET_NAME}/${storagePath}?token=mock-token`;
  }

  return {
    uploadUrl,
    storagePath,
    expiresAt,
  };
}

export async function handleUploadComplete(db: any, jobId: string, body: any) {
  const input = validateUploadComplete(body);

  // 1. Verify worker lease on job
  const { data: job, error: jobError } = await db
    .from('release_ops_jobs')
    .select('id, worker_id, app_id, release_id')
    .eq('id', jobId)
    .single();

  if (jobError || !job) {
    throw new Error('NOT_FOUND: Job not found.');
  }

  if (job.worker_id !== input.workerId) {
    throw new Error('FORBIDDEN: Worker does not hold lease for this job.');
  }

  // 2. Insert metadata record into release_ops_artifacts
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString(); // 24-hour default TTL

  const { data: artifact, error: insertError } = await db
    .from('release_ops_artifacts')
    .insert({
      job_id: jobId,
      app_id: job.app_id ?? null,
      release_id: job.release_id ?? null,
      file_name: input.fileName,
      checksum: input.checksum,
      storage_path: input.storagePath,
      artifact_type: input.artifactType || 'apk_zip',
      content_type: input.contentType || 'application/zip',
      size_bytes: input.sizeBytes,
      expires_at: expiresAt,
      metadata: input.metadata || {},
    })
    .select('*')
    .single();

  if (insertError) {
    throw new Error(`Artifact database insert failed: ${insertError.message}`);
  }

  return {
    artifactId: artifact.id,
    artifact: {
      id: artifact.id,
      jobId: artifact.job_id,
      releaseId: artifact.release_id,
      appId: artifact.app_id,
      fileName: artifact.file_name,
      checksum: artifact.checksum,
      storagePath: artifact.storage_path,
      artifactType: artifact.artifact_type,
      contentType: artifact.content_type,
      sizeBytes: Number(artifact.size_bytes || 0),
      expiresAt: artifact.expires_at,
      deletedAt: artifact.deleted_at,
      metadata: artifact.metadata || {},
      createdAt: artifact.created_at,
    },
  };
}
