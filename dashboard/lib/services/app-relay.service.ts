// AppRelay Core Application Service Layer

if (typeof window !== 'undefined') {
  throw new Error('SERVER_ONLY_MODULE: AppRelay service cannot be loaded in browser environment.');
}

import { TenantScope } from '../app-relay-api/context';
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

export interface AppRelayActor {
  /** UUID written to created_by / actor_id, or null for partner API keys. */
  id: string | null;
  /** Human-readable audit label, e.g. 'api_key:Acme Production'. */
  label: string;
}

const ANONYMOUS_ACTOR: AppRelayActor = { id: null, label: 'unknown' };

export class AppRelayService {
  constructor(
    private db: any,
    private scope: TenantScope,
    private actor: AppRelayActor = ANONYMOUS_ACTOR
  ) {}

  async createApkPullJob(input: {
    playUrl: string;
    includeListing?: boolean;
    includeScreenshots?: boolean;
  }): Promise<ReleaseOpsJobItem> {
    const { playUrl, packageId, locale } = parseAndValidatePlayUrl(input.playUrl);

    const jobRepo = new ReleaseOpsJobRepository(this.db);
    const auditRepo = new ReleaseOpsAuditRepository(this.db);

    // Idempotency is scoped to the tenant. A global key meant two partners
    // pulling the same package shared one job, so either could cancel the
    // other's work.
    const idempotencyKey = `pull_apk:${packageId}:${locale}`;
    const existing = await jobRepo.findByIdempotencyKey(idempotencyKey, this.scope.tenantId);
    if (existing && ['queued', 'claimed', 'running'].includes(existing.status)) {
      return existing;
    }

    if (existing && ['cancelled', 'failed', 'succeeded', 'dead_letter'].includes(existing.status)) {
      await jobRepo.clearIdempotencyKey(existing.id, this.scope);
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
      tenantId: this.scope.tenantId,
      jobType: 'pull_apk',
      priority: 10,
      idempotencyKey,
      payload: payload as unknown as Record<string, unknown>,
      // Never taken from the request body: a caller must not be able to declare
      // who they are.
      createdBy: this.actor.id,
    });

    await auditRepo.create({
      action: 'create_apk_pull_job',
      entityType: 'release_ops_job',
      entityId: job.id,
      actorId: this.actor.id,
      details: { packageId, playUrl, jobId: job.id, actor: this.actor.label, tenantId: this.scope.tenantId },
    });

    return job;
  }

  async getJobDetail(jobId: string): Promise<AppRelayJobDetail> {
    const jobRepo = new ReleaseOpsJobRepository(this.db);
    const eventRepo = new ReleaseOpsJobEventRepository(this.db);
    const artifactRepo = new ReleaseOpsArtifactRepository(this.db);
    const workerRepo = new ReleaseOpsWorkerRepository(this.db);

    const job = await jobRepo.findById(jobId, this.scope);
    if (!job) {
      // Also the response for a job owned by another tenant: reporting 403 here
      // would confirm that the id exists.
      throw new JobNotFoundError(jobId);
    }

    const [events, artifact, worker] = await Promise.all([
      eventRepo.findByJobId(jobId),
      artifactRepo.findByJobId(jobId, this.scope),
      job.workerId ? workerRepo.findById(job.workerId) : Promise.resolve(null),
    ]);

    return {
      job,
      events,
      artifact,
      worker,
    };
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const jobRepo = new ReleaseOpsJobRepository(this.db);

    // Ownership is checked here because release_ops_cancel_job has no tenant
    // awareness — handing it an id straight from the URL would let any caller
    // cancel any job.
    const job = await jobRepo.findById(jobId, this.scope);
    if (!job) {
      throw new JobNotFoundError(jobId);
    }

    if (['succeeded', 'failed', 'cancelled', 'expired', 'dead_letter'].includes(job.status)) {
      throw new JobStateConflictError('Job cannot be cancelled in its current state.');
    }

    if (this.db && typeof this.db.rpc === 'function') {
      const { data, error } = await this.db.rpc('release_ops_cancel_job', {
        p_job_id: jobId,
        p_cancelled_by: this.actor.id,
      });

      if (error || data !== true) {
        throw new JobStateConflictError('Job cannot be cancelled in its current state.');
      }
      return true;
    }

    return jobRepo.updateStatus(jobId, 'cancelled', this.scope);
  }

  async retryJob(jobId: string): Promise<boolean> {
    const jobRepo = new ReleaseOpsJobRepository(this.db);
    const auditRepo = new ReleaseOpsAuditRepository(this.db);

    const job = await jobRepo.findById(jobId, this.scope);
    if (!job) {
      throw new JobNotFoundError(jobId);
    }

    if (!['failed', 'dead_letter'].includes(job.status)) {
      throw new JobStateConflictError('Only failed or dead-letter jobs can be retried.');
    }

    const success = await jobRepo.updateStatus(jobId, 'queued', this.scope);
    if (success) {
      await auditRepo.create({
        action: 'retry_job',
        entityType: 'release_ops_job',
        entityId: jobId,
        actorId: this.actor.id,
        details: { previousStatus: job.status, actor: this.actor.label },
      });
    }

    return success;
  }

  async getArtifactDownloadUrl(
    jobId: string,
    expiresInSeconds: number = 900
  ): Promise<{ downloadUrl: string; expiresAt: string }> {
    const jobRepo = new ReleaseOpsJobRepository(this.db);
    const job = await jobRepo.findById(jobId, this.scope);
    if (!job) {
      throw new JobNotFoundError(jobId);
    }

    const artifactRepo = new ReleaseOpsArtifactRepository(this.db);
    const artifact = await artifactRepo.findByJobId(jobId, this.scope);

    if (!artifact) {
      throw new ArtifactNotFoundError(jobId);
    }

    if (artifact.expiresAt && new Date(artifact.expiresAt) < new Date()) {
      throw new ArtifactExpiredError('Artifact download link has expired.');
    }

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    const { data, error } = await this.db.storage
      .from('release-ops-artifacts')
      .createSignedUrl(artifact.storagePath, expiresInSeconds);

    if (error) {
      if (error.message?.includes('not found') || error.message?.includes('Object not found')) {
        // Upload has not landed yet (or the pipeline never produced a file).
        return { downloadUrl: `pending://${artifact.storagePath}`, expiresAt };
      }
      throw new Error(`Failed to generate signed download URL: ${error.message}`);
    }

    return { downloadUrl: data.signedUrl, expiresAt };
  }

  /** Deletes the active artifact belonging to `jobId`. */
  async deleteArtifactForJob(jobId: string): Promise<boolean> {
    const jobRepo = new ReleaseOpsJobRepository(this.db);
    const job = await jobRepo.findById(jobId, this.scope);
    if (!job) {
      throw new JobNotFoundError(jobId);
    }

    const artifactRepo = new ReleaseOpsArtifactRepository(this.db);
    const artifact = await artifactRepo.findByJobId(jobId, this.scope);

    if (!artifact) {
      throw new ArtifactNotFoundError(jobId);
    }

    await artifactRepo.markDeleted(artifact.id, this.scope);

    if (this.db?.storage) {
      try {
        await this.db.storage.from('release-ops-artifacts').remove([artifact.storagePath]);
      } catch {
        // Metadata is already marked deleted; storage sweep is best-effort.
      }
    }

    const auditRepo = new ReleaseOpsAuditRepository(this.db);
    await auditRepo.create({
      action: 'delete_artifact',
      entityType: 'release_ops_artifact',
      entityId: artifact.id,
      actorId: this.actor.id,
      details: { jobId, storagePath: artifact.storagePath, actor: this.actor.label },
    });

    return true;
  }
}
