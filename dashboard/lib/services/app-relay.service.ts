// AppRelay Core Application Service Layer

if (typeof window !== 'undefined') {
  throw new Error('SERVER_ONLY_MODULE: AppRelay service cannot be loaded in browser environment.');
}

import { getAppRelayConfig } from '../config/app-relay-config';
import {
  ArtifactExpiredError,
  ArtifactNotFoundError,
  InvalidPlayUrlError,
  JobNotFoundError,
  JobStateConflictError,
} from '../errors/app-relay-errors';
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
    throw new InvalidPlayUrlError('URL format is invalid.');
  }

  if (parsed.protocol !== 'https:') {
    throw new InvalidPlayUrlError('Protocol must be https.');
  }

  if (parsed.hostname !== PLAY_STORE_HOST) {
    throw new InvalidPlayUrlError(`Hostname must be ${PLAY_STORE_HOST}.`);
  }

  if (parsed.pathname !== PLAY_STORE_PATH) {
    throw new InvalidPlayUrlError(`Path must be ${PLAY_STORE_PATH}.`);
  }

  const packageId = parsed.searchParams.get('id');
  if (!packageId || !PACKAGE_ID_REGEX.test(packageId)) {
    throw new InvalidPlayUrlError('Android package ID parameter "id" is invalid or missing.');
  }

  const locale = parsed.searchParams.get('hl') || 'en';
  const canonicalUrl = `https://${PLAY_STORE_HOST}${PLAY_STORE_PATH}?id=${packageId}&hl=${locale}`;

  return {
    playUrl: canonicalUrl,
    packageId,
    locale,
  };
}

export class AppRelayService {
  constructor(private db: any) {}

  async createApkPullJob(input: {
    playUrl: string;
    userId?: string;
    includeListing?: boolean;
    includeScreenshots?: boolean;
  }): Promise<ReleaseOpsJobItem> {
    const { playUrl, packageId, locale } = parseAndValidatePlayUrl(input.playUrl);

    const jobRepo = new ReleaseOpsJobRepository(this.db);
    const auditRepo = new ReleaseOpsAuditRepository(this.db);

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

  async getJobDetail(jobId: string): Promise<AppRelayJobDetail> {
    const jobRepo = new ReleaseOpsJobRepository(this.db);
    const eventRepo = new ReleaseOpsJobEventRepository(this.db);
    const artifactRepo = new ReleaseOpsArtifactRepository(this.db);
    const workerRepo = new ReleaseOpsWorkerRepository(this.db);

    const job = await jobRepo.findById(jobId);
    if (!job) {
      throw new JobNotFoundError(jobId);
    }

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

  async cancelJob(jobId: string, userId?: string): Promise<boolean> {
    if (this.db && typeof this.db.rpc === 'function') {
      const { data, error } = await this.db.rpc('release_ops_cancel_job', {
        p_job_id: jobId,
        p_cancelled_by: userId || null,
      });

      if (error || data !== true) {
        throw new JobStateConflictError('Job cannot be cancelled in its current state.');
      }
      return true;
    }

    const jobRepo = new ReleaseOpsJobRepository(this.db);
    const job = await jobRepo.findById(jobId);
    if (!job || ['succeeded', 'failed', 'cancelled', 'expired'].includes(job.status)) {
      throw new JobStateConflictError('Job cannot be cancelled in its current state.');
    }

    return jobRepo.updateStatus(jobId, 'cancelled');
  }

  async retryJob(jobId: string, userId?: string): Promise<boolean> {
    const jobRepo = new ReleaseOpsJobRepository(this.db);
    const auditRepo = new ReleaseOpsAuditRepository(this.db);

    const job = await jobRepo.findById(jobId);
    if (!job || !['failed', 'dead_letter'].includes(job.status)) {
      throw new JobStateConflictError('Only failed or dead-letter jobs can be retried.');
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

  async getArtifactDownloadUrl(
    jobId: string,
    expiresInSeconds: number = 900
  ): Promise<{ downloadUrl: string; expiresAt: string }> {
    const artifactRepo = new ReleaseOpsArtifactRepository(this.db);
    const artifact = await artifactRepo.findByJobId(jobId);

    if (!artifact) {
      throw new ArtifactNotFoundError(jobId);
    }

    if (artifact.expiresAt && new Date(artifact.expiresAt) < new Date()) {
      throw new ArtifactExpiredError('Artifact download link has expired.');
    }

    let downloadUrl = '';
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    if (this.db && this.db.storage) {
      const { data, error } = await this.db.storage
        .from('release-ops-artifacts')
        .createSignedUrl(artifact.storagePath, expiresInSeconds);

      if (error) {
        throw new Error(`Failed to generate signed download URL: ${error.message}`);
      }
      downloadUrl = data.signedUrl;
    } else {
      downloadUrl = `https://supabase.local/storage/v1/object/sign/release-ops-artifacts/${artifact.storagePath}?token=signed-download-token`;
    }

    return { downloadUrl, expiresAt };
  }

  async deleteArtifact(artifactId: string, userId?: string): Promise<boolean> {
    const artifactRepo = new ReleaseOpsArtifactRepository(this.db);
    const artifact = await artifactRepo.findById(artifactId);

    if (!artifact) {
      throw new ArtifactNotFoundError(artifactId);
    }

    await artifactRepo.markDeleted(artifactId);

    if (this.db && this.db.storage) {
      await this.db.storage.from('release-ops-artifacts').remove([artifact.storagePath]).catch(() => {});
    }

    return true;
  }
}
