// System Reconciliation Routines for Stale Workers & Expired Job Leases

import { isErrorRetryable } from './retry-policy';

export interface ReconciliationResult {
  staleWorkersReconciled: number;
  expiredLeasesRequeued: number;
  expiredLeasesDeadLettered: number;
}

export async function reconcileStaleWorkers(
  db: any,
  staleThresholdSeconds = 90
): Promise<number> {
  const cutoff = new Date(Date.now() - staleThresholdSeconds * 1000).toISOString();

  const { data: staleRows, error } = await db
    .from('release_ops_workers')
    .select('id')
    .eq('status', 'active')
    .lt('last_heartbeat', cutoff);

  if (error || !staleRows || staleRows.length === 0) return 0;

  const ids = staleRows.map((r: any) => r.id);

  const { error: updateError } = await db
    .from('release_ops_workers')
    .update({ status: 'offline', updated_at: new Date().toISOString() })
    .in('id', ids);

  return updateError ? 0 : ids.length;
}

export async function reconcileExpiredLeases(db: any): Promise<{
  requeued: number;
  deadLettered: number;
}> {
  const nowStr = new Date().toISOString();

  const { data: expiredJobs, error } = await db
    .from('release_ops_jobs')
    .select('id, status, attempt_count, max_attempts, error_message')
    .in('status', ['claimed', 'running'])
    .lt('lease_until', nowStr);

  if (error || !expiredJobs || expiredJobs.length === 0) {
    return { requeued: 0, deadLettered: 0 };
  }

  let requeued = 0;
  let deadLettered = 0;

  for (const job of expiredJobs) {
    const errorMsg = job.error_message || 'LEASE_EXPIRED: Worker failed to heartbeat before lease expiration.';
    const canRetry = job.attempt_count < job.max_attempts && (job.error_message ? isErrorRetryable(job.error_message) : true);

    if (canRetry) {
      const { error: updateErr } = await db
        .from('release_ops_jobs')
        .update({
          status: 'queued',
          worker_id: null,
          lease_until: null,
          error_message: errorMsg,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      if (!updateErr) requeued++;
    } else {
      const { error: updateErr } = await db
        .from('release_ops_jobs')
        .update({
          status: 'dead_letter',
          lease_until: null,
          error_message: errorMsg,
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id);

      if (!updateErr) deadLettered++;
    }
  }

  return { requeued, deadLettered };
}
