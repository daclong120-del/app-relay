// Release Ops Worker API Scopes & Scope Enforcement Policies

export type WorkerApiScope =
  | 'release_ops:worker:register'
  | 'release_ops:worker:read'
  | 'release_ops:job:claim'
  | 'release_ops:job:write'
  | 'release_ops:artifact:write'
  | '*';

export const WORKER_SCOPES = {
  WORKER_REGISTER: 'release_ops:worker:register' as WorkerApiScope,
  WORKER_READ: 'release_ops:worker:read' as WorkerApiScope,
  JOB_CLAIM: 'release_ops:job:claim' as WorkerApiScope,
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
  return assignedScopes.includes(requiredScope);
}
