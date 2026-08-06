// Next.js Server Actions for Release Ops AppRelay & Job Operations

import {
  cancelJobService,
  createApkPullJobService,
  getApkPullJobDetailService,
  retryJobService,
} from '../../lib/services/release-ops.service';
import { ReleaseOpsArtifactRepository } from '../../lib/repositories/release-ops-artifact.repo';
import { ReleaseOpsJobRepository } from '../../lib/repositories/release-ops-job.repo';
import { AppRelayJobDetail, ReleaseOpsJobItem, ReleaseOpsJobStatus, ReleaseOpsJobType } from '../../types/release-ops';

export interface CreateAppRelayJobInput {
  playUrl: string;
  locale?: string;
  includeListing?: boolean;
  includeScreenshots?: boolean;
}

export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function createAppRelayJobAction(
  db: any,
  input: CreateAppRelayJobInput,
  userId?: string
): Promise<ActionResult<ReleaseOpsJobItem>> {
  try {
    const job = await createApkPullJobService(db, {
      playUrl: input.playUrl,
      userId,
      includeListing: input.includeListing ?? true,
      includeScreenshots: input.includeScreenshots ?? true,
    });

    return { success: true, data: job };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create AppRelay job.' };
  }
}

export async function getAppRelayJobsAction(
  db: any,
  params?: {
    jobType?: ReleaseOpsJobType;
    status?: ReleaseOpsJobStatus;
    limit?: number;
    offset?: number;
  }
): Promise<ActionResult<ReleaseOpsJobItem[]>> {
  try {
    const repo = new ReleaseOpsJobRepository(db);
    const jobs = await repo.findAll({
      jobType: params?.jobType || 'pull_apk',
      status: params?.status,
      limit: params?.limit || 50,
      offset: params?.offset || 0,
    });

    return { success: true, data: jobs };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to query AppRelay jobs.' };
  }
}

export async function getAppRelayJobDetailAction(
  db: any,
  jobId: string
): Promise<ActionResult<AppRelayJobDetail>> {
  try {
    const detail = await getApkPullJobDetailService(db, jobId);
    if (!detail) {
      return { success: false, error: 'NOT_FOUND: AppRelay job not found.' };
    }
    return { success: true, data: detail };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch job detail.' };
  }
}

export async function cancelAppRelayJobAction(
  db: any,
  jobId: string,
  userId?: string
): Promise<ActionResult<boolean>> {
  try {
    const cancelled = await cancelJobService(db, jobId, userId);
    if (!cancelled) {
      return { success: false, error: 'Job cannot be cancelled in its current state.' };
    }
    return { success: true, data: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to cancel job.' };
  }
}

export async function retryAppRelayJobAction(
  db: any,
  jobId: string,
  userId?: string
): Promise<ActionResult<boolean>> {
  try {
    const retried = await retryJobService(db, jobId, userId);
    if (!retried) {
      return { success: false, error: 'Only failed or dead-letter jobs can be retried.' };
    }
    return { success: true, data: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to retry job.' };
  }
}

export async function getAppRelayDownloadUrlAction(
  db: any,
  jobId: string,
  expiresInSeconds = 900
): Promise<ActionResult<{ downloadUrl: string; expiresAt: string }>> {
  try {
    const artifactRepo = new ReleaseOpsArtifactRepository(db);
    const artifact = await artifactRepo.findByJobId(jobId);

    if (!artifact) {
      return { success: false, error: 'NOT_FOUND: No active artifact found for this job.' };
    }

    if (artifact.expiresAt && new Date(artifact.expiresAt) < new Date()) {
      return { success: false, error: 'EXPIRED: Artifact download link has expired.' };
    }

    let downloadUrl = '';
    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    if (db.storage) {
      const { data, error } = await db.storage
        .from('release-ops-artifacts')
        .createSignedUrl(artifact.storagePath, expiresInSeconds);

      if (error) {
        return { success: false, error: `Failed to generate signed download URL: ${error.message}` };
      }
      downloadUrl = data.signedUrl;
    } else {
      // Mock/fallback download URL
      downloadUrl = `https://supabase.local/storage/v1/object/sign/release-ops-artifacts/${artifact.storagePath}?token=signed-download-token`;
    }

    return {
      success: true,
      data: {
        downloadUrl,
        expiresAt,
      },
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to generate download URL.' };
  }
}

export async function deleteAppRelayArtifactAction(
  db: any,
  artifactId: string
): Promise<ActionResult<boolean>> {
  try {
    const artifactRepo = new ReleaseOpsArtifactRepository(db);
    const artifact = await artifactRepo.findById(artifactId);

    if (!artifact) {
      return { success: false, error: 'NOT_FOUND: Artifact not found.' };
    }

    // Mark deleted in database first
    await artifactRepo.markDeleted(artifactId);

    // Remove from storage if client available
    if (db.storage) {
      await db.storage.from('release-ops-artifacts').remove([artifact.storagePath]).catch(() => {});
    }

    return { success: true, data: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete artifact.' };
  }
}
