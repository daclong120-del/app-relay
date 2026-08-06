// Release Ops Worker API Scopes & Scope Enforcement Policies

export type WorkerApiScope =
  | 'release_ops:worker:register'
  | 'release_ops:worker:heartbeat'
  | 'release_ops:worker:read'
  | 'release_ops:job:claim'
  | 'release_ops:job:heartbeat'
  | 'release_ops:job:event'
  | 'release_ops:job:complete'
  | 'release_ops:job:write'
  | 'release_ops:artifact:write'
  | '*';

export const WORKER_SCOPES = {
  WORKER_REGISTER: 'release_ops:worker:register' as WorkerApiScope,
  WORKER_HEARTBEAT: 'release_ops:worker:heartbeat' as WorkerApiScope,
  WORKER_READ: 'release_ops:worker:read' as WorkerApiScope,
  JOB_CLAIM: 'release_ops:job:claim' as WorkerApiScope,
  JOB_HEARTBEAT: 'release_ops:job:heartbeat' as WorkerApiScope,
  JOB_EVENT: 'release_ops:job:event' as WorkerApiScope,
  JOB_COMPLETE: 'release_ops:job:complete' as WorkerApiScope,
  JOB_WRITE: 'release_ops:job:write' as WorkerApiScope,
  ARTIFACT_WRITE: 'release_ops:artifact:write' as WorkerApiScope,
  ALL: '*' as WorkerApiScope,
};

export function hasRequiredScope(
  assignedScopes: string[],
  requiredScope: WorkerApiScope
): boolean {
  if (!assignedScopes || assignedScopes.length === 0) return false;
  if (assignedScopes.includes('*')) return true;

  // Direct match
  if (assignedScopes.includes(requiredScope)) return true;

  // Granular scope check mappings
  if (requiredScope === 'release_ops:worker:heartbeat' && assignedScopes.includes('release_ops:worker:read')) {
    return true;
  }

  return false;
}
