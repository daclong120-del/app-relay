// Release Ops Service Layer — AppRelay & Job Management

if (typeof window !== 'undefined') {
  throw new Error('SERVER_ONLY_MODULE: Service layer cannot be loaded in browser environment.');
}

import { ReleaseOpsArtifactRepository } from '../repositories/release-ops-artifact.repo';
import { ReleaseOpsAuditRepository } from '../repositories/release-ops-audit.repo';
import { ReleaseOpsJobEventRepository } from '../repositories/release-ops-job-event.repo';
import { ReleaseOpsJobRepository } from '../repositories/release-ops-job.repo';
import { ReleaseOpsWorkerRepository } from '../repositories/release-ops-worker.repo';
import {
  AppRelayJobDetail,
  PullApkJobPayloadV1,
  ReleaseOpsJobItem,
} from '../../types/release-ops';

const PLAY_STORE_HOST = 'play.google.com';
const PLAY_STORE_PATH = '/store/apps/details';
const PACKAGE_ID_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

export function parseAndValidatePlayUrl(rawUrl: string): {
  playUrl: string;
  packageId: string;
  locale: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error('INVALID_URL: URL format is invalid.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('INVALID_URL: Protocol must be https.');
  }

  if (parsed.hostname !== PLAY_STORE_HOST) {
    throw new Error(`INVALID_URL: Hostname must be ${PLAY_STORE_HOST}.`);
  }

  if (parsed.pathname !== PLAY_STORE_PATH) {
    throw new Error(`INVALID_URL: Path must be ${PLAY_STORE_PATH}.`);
  }

  const packageId = parsed.searchParams.get('id');
  if (!packageId || !PACKAGE_ID_REGEX.test(packageId)) {
    throw new Error('INVALID_PACKAGE_ID: Android package ID parameter "id" is invalid or missing.');
  }

  const locale = parsed.searchParams.get('hl') || 'en';

  const canonicalUrl = `https://${PLAY_STORE_HOST}${PLAY_STORE_PATH}?id=${packageId}&hl=${locale}`;

  return {
    playUrl: canonicalUrl,
    packageId,
    locale,
  };
}

export async function createApkPullJobService(
  db: any,
  input: {
    playUrl: string;
    userId?: string;
    includeListing?: boolean;
    includeScreenshots?: boolean;
  }
): Promise<ReleaseOpsJobItem> {
  const { playUrl, packageId, locale } = parseAndValidatePlayUrl(input.playUrl);

  const jobRepo = new ReleaseOpsJobRepository(db);
  const auditRepo = new ReleaseOpsAuditRepository(db);

  const idempotencyKey = `pull_apk:${packageId}:${locale}`;

  const existing = await jobRepo.findByIdempotencyKey(idempotencyKey);
  if (existing && ['queued', 'claimed', 'running'].includes(existing.status)) {
    return existing;
  }

  const payload: PullApkJobPayloadV1 = {
    schemaVersion: 1,
    playUrl,
    packageId,
    locale,
    includeListing: input.includeListing ?? true,
    includeScreenshots: input.includeScreenshots ?? true,
    sourcePolicy: 'google_play_only',
  };

  const job = await jobRepo.create({
    jobType: 'pull_apk',
    priority: 10,
    idempotencyKey,
    payload: payload as unknown as Record<string, unknown>,
    createdBy: input.userId,
  });

  await auditRepo.create({
    action: 'create_apk_pull_job',
    entityType: 'release_ops_job',
    entityId: job.id,
    actorId: input.userId,
    details: { packageId, playUrl, jobId: job.id },
  });

  return job;
}

export async function getApkPullJobDetailService(
  db: any,
  jobId: string
): Promise<AppRelayJobDetail | null> {
  const jobRepo = new ReleaseOpsJobRepository(db);
  const eventRepo = new ReleaseOpsJobEventRepository(db);
  const artifactRepo = new ReleaseOpsArtifactRepository(db);
  const workerRepo = new ReleaseOpsWorkerRepository(db);

  const job = await jobRepo.findById(jobId);
  if (!job) return null;

  const [events, artifact, worker] = await Promise.all([
    eventRepo.findByJobId(jobId),
    artifactRepo.findByJobId(jobId),
    job.workerId ? workerRepo.findById(job.workerId) : Promise.resolve(null),
  ]);

  return {
    job,
    events,
    artifact,
    worker,
  };
}

export async function cancelJobService(
  db: any,
  jobId: string,
  userId?: string
): Promise<boolean> {
  const { data, error } = await db.rpc('release_ops_cancel_job', {
    p_job_id: jobId,
    p_cancelled_by: userId || null,
  });

  return !error && data === true;
}

export async function retryJobService(
  db: any,
  jobId: string,
  userId?: string
): Promise<boolean> {
  const jobRepo = new ReleaseOpsJobRepository(db);
  const auditRepo = new ReleaseOpsAuditRepository(db);

  const job = await jobRepo.findById(jobId);
  if (!job || !['failed', 'dead_letter'].includes(job.status)) {
    return false;
  }

  const success = await jobRepo.updateStatus(jobId, 'queued');
  if (success) {
    await auditRepo.create({
      action: 'retry_job',
      entityType: 'release_ops_job',
      entityId: jobId,
      actorId: userId,
      details: { previousStatus: job.status },
    });
  }

  return success;
}
