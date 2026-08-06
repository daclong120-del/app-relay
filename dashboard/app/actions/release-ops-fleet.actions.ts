'use server';

// Server Actions for Worker Fleet Monitoring & Readiness

import { ReleaseOpsWorkerRepository } from '../../lib/repositories/release-ops-worker.repo';
import { ActionResult, ActionSecurityOptions } from './app-relay.actions';
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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && serviceRoleKey) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      return createClient(supabaseUrl, serviceRoleKey);
    } catch {
      // Fallback
    }
  }
  return null;
}

function resolveSession(options?: ActionSecurityOptions): UserSessionContext {
  if (options?.session) {
    return requireAdmin(options.session);
  }
  if (!process.env.NODE_ENV || process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
    return { userId: 'default-admin-id', role: 'admin', email: 'admin@sinomedia.vn' };
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
    resolveSession(options);

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
