// Release Ops Service Layer — AppRelay & Job Management Adapter

if (typeof window !== 'undefined') {
  throw new Error('SERVER_ONLY_MODULE: Service layer cannot be loaded in browser environment.');
}

import { AppRelayService, parseAndValidatePlayUrl } from './app-relay.service';
import {
  AppRelayJobDetail,
  ReleaseOpsJobItem,
} from '../../types/release-ops';

export { parseAndValidatePlayUrl };

export async function createApkPullJobService(
  db: any,
  input: {
    playUrl: string;
    userId?: string;
    includeListing?: boolean;
    includeScreenshots?: boolean;
  }
): Promise<ReleaseOpsJobItem> {
  const service = new AppRelayService(db);
  return service.createApkPullJob(input);
}

export async function getApkPullJobDetailService(
  db: any,
  jobId: string
): Promise<AppRelayJobDetail | null> {
  const service = new AppRelayService(db);
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
  userId?: string
): Promise<boolean> {
  const service = new AppRelayService(db);
  try {
    return await service.cancelJob(jobId, userId);
  } catch (err: any) {
    if (err.code === 'JOB_STATE_CONFLICT') return false;
    throw err;
  }
}

export async function retryJobService(
  db: any,
  jobId: string,
  userId?: string
): Promise<boolean> {
  const service = new AppRelayService(db);
  try {
    return await service.retryJob(jobId, userId);
  } catch (err: any) {
    if (err.code === 'JOB_STATE_CONFLICT') return false;
    throw err;
  }
}
