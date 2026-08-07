// Worker Fleet Monitoring & Readiness (server-side helpers)
//
// See app-relay.actions.ts: the 'use server' directive was removed because an
// exported server action is a network endpoint, and these functions accepted
// their caller's `session` object as proof of admin rights.

import { ReleaseOpsWorkerRepository } from '../../lib/repositories/release-ops-worker.repo';
import { ActionResult, ActionSecurityOptions } from './app-relay.actions';
import { getDashboardSession } from '../../lib/app-relay-auth/session';
import { getServiceRoleClient } from '../../lib/db/service-client';
import { requireAdmin, UserSessionContext } from '../../lib/guards/admin-csrf.guard';

export interface WorkerFleetStatusItem {
  id: string;
  workerName: string;
  status: string;
  lastHeartbeat?: string | null;
  adbDeviceSerial?: string;
  capability?: string;
  isOnline: boolean;
  activeJobId?: string | null;
  metadata?: Record<string, unknown>;
}

function resolveDbClient(options?: ActionSecurityOptions, customDb?: any): any {
  if (customDb) return customDb;
  if (options?.db) return options.db;
  return getServiceRoleClient();
}

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

export async function getWorkerFleetStatusAction(
  arg1?: any,
  arg2?: any
): Promise<ActionResult<WorkerFleetStatusItem[]>> {
  let db: any;
  let options: ActionSecurityOptions | undefined;

  if (arg1 && typeof arg1 === 'object' && ('from' in arg1 || 'rpc' in arg1)) {
    db = arg1;
    options = arg2;
  } else {
    options = arg1;
    db = resolveDbClient(options, arg2);
  }

  try {
    await resolveSession(options);

    const repo = new ReleaseOpsWorkerRepository(db);
    const workers = await repo.findAll();

    const now = Date.now();
    const staleThresholdMs = 90 * 1000; // 90s heartbeat threshold

    const fleetStatus: WorkerFleetStatusItem[] = workers.map((w) => {
      const lastHbMs = w.lastHeartbeat ? new Date(w.lastHeartbeat).getTime() : 0;
      const isOnline = w.status === 'active' && now - lastHbMs < staleThresholdMs;

      return {
        id: w.id,
        workerName: w.workerName,
        status: isOnline ? 'online' : 'offline',
        lastHeartbeat: w.lastHeartbeat,
        adbDeviceSerial: (w.metadata as any)?.adbDeviceSerial || 'unknown',
        capability: (w.metadata as any)?.capability || 'app_artifact_acquisition',
        isOnline,
        metadata: w.metadata,
      };
    });

    return { success: true, data: fleetStatus };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to query worker fleet status.' };
  }
}
