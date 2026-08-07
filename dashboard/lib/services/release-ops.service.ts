// Release Ops Service Layer — AppRelay & Job Management Adapter

if (typeof window !== 'undefined') {
  throw new Error('SERVER_ONLY_MODULE: Service layer cannot be loaded in browser environment.');
}

import { internalScope } from '../app-relay-api/context';
import { getInternalTenantId } from '../app-relay-api/tenants';
import { AppRelayActor, AppRelayService, parseAndValidatePlayUrl } from './app-relay.service';
import {
  AppRelayJobDetail,
  ReleaseOpsJobItem,
} from '../../types/release-ops';

export { parseAndValidatePlayUrl };

/**
 * These helpers run on the internal (dashboard) surface, so they read across
 * tenants and stamp new work with the internal tenant.
 */
async function internalService(db: any, actor: AppRelayActor): Promise<AppRelayService> {
  const tenantId = await getInternalTenantId(db);
  return new AppRelayService(db, internalScope(tenantId), actor);
}

export async function createApkPullJobService(
  db: any,
  input: {
    playUrl: string;
    actor: AppRelayActor;
    includeListing?: boolean;
    includeScreenshots?: boolean;
  }
): Promise<ReleaseOpsJobItem> {
  const service = await internalService(db, input.actor);
  return service.createApkPullJob({
    playUrl: input.playUrl,
    includeListing: input.includeListing,
    includeScreenshots: input.includeScreenshots,
  });
}

export async function getApkPullJobDetailService(
  db: any,
  jobId: string,
  actor: AppRelayActor
): Promise<AppRelayJobDetail | null> {
  const service = await internalService(db, actor);
  try {
    return await service.getJobDetail(jobId);
  } catch (err: any) {
    if (err.code === 'JOB_NOT_FOUND') return null;
    throw err;
  }
}

export async function cancelJobService(
  db: any,
  jobId: string,
  actor: AppRelayActor
): Promise<boolean> {
  const service = await internalService(db, actor);
  try {
    return await service.cancelJob(jobId);
  } catch (err: any) {
    if (err.code === 'JOB_STATE_CONFLICT') return false;
    throw err;
  }
}

export async function retryJobService(
  db: any,
  jobId: string,
  actor: AppRelayActor
): Promise<boolean> {
  const service = await internalService(db, actor);
  try {
    return await service.retryJob(jobId);
  } catch (err: any) {
    if (err.code === 'JOB_STATE_CONFLICT') return false;
    throw err;
  }
}
