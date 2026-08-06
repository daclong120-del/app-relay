// Server Actions for Worker Fleet Monitoring & Readiness

import { ReleaseOpsWorkerRepository } from '../../lib/repositories/release-ops-worker.repo';
import { ActionResult } from './app-relay.actions';

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

export async function getWorkerFleetStatusAction(
  db: any
): Promise<ActionResult<WorkerFleetStatusItem[]>> {
  try {
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
