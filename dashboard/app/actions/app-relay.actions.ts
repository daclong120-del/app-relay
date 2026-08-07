// Server-side AppRelay job operations used by the dashboard.
//
// NOTE: this module deliberately does NOT carry the 'use server' directive.
// Exported server actions are network-reachable endpoints, and these functions
// took their `session` object as an argument — so any caller could assert
// `role: 'admin'` and drive them with a service-role database client. They are
// ordinary server-side functions now; the HTTP surface lives at
// /api/app-relay/internal, behind a real session.

import {
  cancelJobService,
  createApkPullJobService,
  getApkPullJobDetailService,
  retryJobService,
} from '../../lib/services/release-ops.service';
import { internalScope } from '../../lib/app-relay-api/context';
import { getInternalTenantId } from '../../lib/app-relay-api/tenants';
import { getDashboardSession } from '../../lib/app-relay-auth/session';
import { getServiceRoleClient } from '../../lib/db/service-client';
import { ReleaseOpsArtifactRepository } from '../../lib/repositories/release-ops-artifact.repo';
import { ReleaseOpsJobRepository } from '../../lib/repositories/release-ops-job.repo';
import { AppRelayJobDetail, ReleaseOpsJobItem, ReleaseOpsJobStatus, ReleaseOpsJobType } from '../../types/release-ops';
import { requireAdmin, UserSessionContext, verifyCSRF } from '../../lib/guards/admin-csrf.guard';
import { AppRelayActor } from '../../lib/services/app-relay.service';

export interface CreateAppRelayJobInput {
  playUrl: string;
  locale?: string;
  includeListing?: boolean;
  includeScreenshots?: boolean;
}

export interface ActionSecurityOptions {
  session?: UserSessionContext | null;
  csrfToken?: string | null;
  db?: any;
}

export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function resolveDbClient(options?: ActionSecurityOptions, customDb?: any): any {
  if (customDb) return customDb;
  if (options?.db) return options.db;
  return getServiceRoleClient();
}

/**
 * Resolves the acting operator. An explicitly supplied session is trusted only
 * because this module is not network-reachable; otherwise the session is read
 * from the signed cookie. There is no longer an "assume admin in development"
 * branch — that granted full access to anyone who could reach the process.
 */
async function resolveSession(options?: ActionSecurityOptions): Promise<UserSessionContext> {
  if (options?.session) {
    return requireAdmin(options.session);
  }

  const session = await getDashboardSession();
  if (session) {
    return requireAdmin({ userId: session.userId, role: session.role, email: session.email });
  }

  throw new Error('UNAUTHORIZED: Admin session required.');
}

function toActor(session: UserSessionContext): AppRelayActor {
  return { id: session.userId, label: `user:${session.email || session.userId}` };
}

async function internalScopeFor(db: any) {
  return internalScope(await getInternalTenantId(db));
}

export async function createAppRelayJobAction(
  arg1: any,
  arg2?: any,
  arg3?: any
): Promise<ActionResult<ReleaseOpsJobItem>> {
  let db: any;
  let input: CreateAppRelayJobInput;
  let options: ActionSecurityOptions | undefined;

  if (arg1 && typeof arg1 === 'object' && ('from' in arg1 || 'rpc' in arg1)) {
    db = arg1;
    input = arg2;
    options = arg3;
  } else {
    input = arg1;
    options = arg2;
    db = resolveDbClient(options, arg3);
  }

  try {
    const session = await resolveSession(options);
    verifyCSRF(options?.csrfToken);

    const job = await createApkPullJobService(db, {
      playUrl: input.playUrl,
      actor: toActor(session),
      includeListing: input.includeListing ?? true,
      includeScreenshots: input.includeScreenshots ?? true,
    });

    return { success: true, data: job };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create AppRelay job.' };
  }
}

export async function getAppRelayJobsAction(
  arg1?: any,
  arg2?: any,
  arg3?: any
): Promise<ActionResult<ReleaseOpsJobItem[]>> {
  let db: any;
  let params: { jobType?: ReleaseOpsJobType; status?: ReleaseOpsJobStatus; limit?: number; offset?: number } | undefined;
  let options: ActionSecurityOptions | undefined;

  if (arg1 && typeof arg1 === 'object' && ('from' in arg1 || 'rpc' in arg1)) {
    db = arg1;
    params = arg2;
    options = arg3;
  } else {
    params = arg1;
    options = arg2;
    db = resolveDbClient(options, arg3);
  }

  try {
    await resolveSession(options);

    const repo = new ReleaseOpsJobRepository(db);
    const jobs = await repo.findAll({
      scope: await internalScopeFor(db),
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
  arg1: any,
  arg2?: any,
  arg3?: any
): Promise<ActionResult<AppRelayJobDetail>> {
  let db: any;
  let jobId: string;
  let options: ActionSecurityOptions | undefined;

  if (arg1 && typeof arg1 === 'object' && ('from' in arg1 || 'rpc' in arg1)) {
    db = arg1;
    jobId = arg2;
    options = arg3;
  } else {
    jobId = arg1;
    options = arg2;
    db = resolveDbClient(options, arg3);
  }

  try {
    const session = await resolveSession(options);

    const detail = await getApkPullJobDetailService(db, jobId, toActor(session));
    if (!detail) {
      return { success: false, error: 'NOT_FOUND: AppRelay job not found.' };
    }
    return { success: true, data: detail };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to fetch job detail.' };
  }
}

export async function cancelAppRelayJobAction(
  arg1: any,
  arg2?: any,
  arg3?: any
): Promise<ActionResult<boolean>> {
  let db: any;
  let jobId: string;
  let options: ActionSecurityOptions | undefined;

  if (arg1 && typeof arg1 === 'object' && ('from' in arg1 || 'rpc' in arg1)) {
    db = arg1;
    jobId = arg2;
    options = arg3;
  } else {
    jobId = arg1;
    options = arg2;
    db = resolveDbClient(options, arg3);
  }

  try {
    const session = await resolveSession(options);
    verifyCSRF(options?.csrfToken);

    const cancelled = await cancelJobService(db, jobId, toActor(session));
    if (!cancelled) {
      return { success: false, error: 'Job cannot be cancelled in its current state.' };
    }
    return { success: true, data: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to cancel job.' };
  }
}

export async function retryAppRelayJobAction(
  arg1: any,
  arg2?: any,
  arg3?: any
): Promise<ActionResult<boolean>> {
  let db: any;
  let jobId: string;
  let options: ActionSecurityOptions | undefined;

  if (arg1 && typeof arg1 === 'object' && ('from' in arg1 || 'rpc' in arg1)) {
    db = arg1;
    jobId = arg2;
    options = arg3;
  } else {
    jobId = arg1;
    options = arg2;
    db = resolveDbClient(options, arg3);
  }

  try {
    const session = await resolveSession(options);
    verifyCSRF(options?.csrfToken);

    const retried = await retryJobService(db, jobId, toActor(session));
    if (!retried) {
      return { success: false, error: 'Only failed or dead-letter jobs can be retried.' };
    }
    return { success: true, data: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to retry job.' };
  }
}

export async function getAppRelayDownloadUrlAction(
  arg1: any,
  arg2?: any,
  arg3?: any,
  arg4?: any
): Promise<ActionResult<{ downloadUrl: string; expiresAt: string }>> {
  let db: any;
  let jobId: string;
  let expiresInSeconds = 900;
  let options: ActionSecurityOptions | undefined;

  if (arg1 && typeof arg1 === 'object' && ('from' in arg1 || 'rpc' in arg1)) {
    db = arg1;
    jobId = arg2;
    expiresInSeconds = typeof arg3 === 'number' ? arg3 : 900;
    options = arg4;
  } else {
    jobId = arg1;
    expiresInSeconds = typeof arg2 === 'number' ? arg2 : 900;
    options = arg3;
    db = resolveDbClient(options, arg4);
  }

  try {
    await resolveSession(options);

    const artifactRepo = new ReleaseOpsArtifactRepository(db);
    const artifact = await artifactRepo.findByJobId(jobId, await internalScopeFor(db));

    if (!artifact) {
      return { success: false, error: 'NOT_FOUND: No active artifact found for this job.' };
    }

    if (artifact.expiresAt && new Date(artifact.expiresAt) < new Date()) {
      return { success: false, error: 'EXPIRED: Artifact download link has expired.' };
    }

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

    // No fabricated URL fallback: if storage cannot sign the object, say so.
    const { data, error } = await db.storage
      .from('release-ops-artifacts')
      .createSignedUrl(artifact.storagePath, expiresInSeconds);

    if (error) {
      return { success: false, error: `Failed to generate signed download URL: ${error.message}` };
    }

    return { success: true, data: { downloadUrl: data.signedUrl, expiresAt } };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to generate download URL.' };
  }
}

export async function deleteAppRelayArtifactAction(
  arg1: any,
  arg2?: any,
  arg3?: any
): Promise<ActionResult<boolean>> {
  let db: any;
  let artifactId: string;
  let options: ActionSecurityOptions | undefined;

  if (arg1 && typeof arg1 === 'object' && ('from' in arg1 || 'rpc' in arg1)) {
    db = arg1;
    artifactId = arg2;
    options = arg3;
  } else {
    artifactId = arg1;
    options = arg2;
    db = resolveDbClient(options, arg3);
  }

  try {
    await resolveSession(options);
    verifyCSRF(options?.csrfToken);

    const scope = await internalScopeFor(db);
    const artifactRepo = new ReleaseOpsArtifactRepository(db);
    const artifact = await artifactRepo.findById(artifactId, scope);

    if (!artifact) {
      return { success: false, error: 'NOT_FOUND: Artifact not found.' };
    }

    await artifactRepo.markDeleted(artifactId, scope);

    if (db?.storage) {
      try {
        await db.storage.from('release-ops-artifacts').remove([artifact.storagePath]);
      } catch {
        // Metadata is already marked deleted; storage sweep is best-effort.
      }
    }

    return { success: true, data: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete artifact.' };
  }
}
