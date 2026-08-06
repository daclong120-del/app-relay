// Worker Token Authentication & Scope Guard

import { createHash } from 'crypto';
import { hasRequiredScope, WorkerApiScope } from '../scopes';

export interface AuthenticatedWorkerContext {
  tokenId: string;
  workerName: string;
  workerId?: string;
  scopes: string[];
}

export async function hashToken(token: string): Promise<string> {
  return createHash('sha256').update(token.trim()).digest('hex');
}

export async function authenticateWorkerToken(
  authHeader: string | null,
  requiredScope: WorkerApiScope,
  db?: any
): Promise<{ success: true; context: AuthenticatedWorkerContext } | { success: false; status: number; message: string }> {
  if (!authHeader) {
    return { success: false, status: 401, message: 'Missing Authorization header.' };
  }

  const parts = authHeader.trim().split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return { success: false, status: 401, message: 'Invalid Authorization header format. Expected "Bearer <token>".' };
  }

  const rawToken = parts[1];
  if (!rawToken) {
    return { success: false, status: 401, message: 'Empty bearer token.' };
  }

  const tokenHash = await hashToken(rawToken);

  // 1. Environment token fallback check
  const envToken = process.env.RELEASE_OPS_WORKER_TOKEN || 'dev-worker-token-secret-key';
  const envTokenHash = await hashToken(envToken);

  if (rawToken === envToken || tokenHash === envTokenHash) {
    // Environment token matched: grant all scopes
    const scopes = ['*'];
    if (!hasRequiredScope(scopes, requiredScope)) {
      return { success: false, status: 403, message: `Token lacks required scope: ${requiredScope}` };
    }
    return {
      success: true,
      context: {
        tokenId: 'env-default',
        workerName: 'system-worker',
        scopes,
      },
    };
  }

  // 2. DB token lookup fallback if db client supplied
  if (db) {
    try {
      const { data: tokenRow, error } = await db
        .from('release_ops_worker_tokens')
        .select('*')
        .eq('token_hash', tokenHash)
        .eq('status', 'active')
        .maybeSingle();

      if (!error && tokenRow) {
        if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
          return { success: false, status: 401, message: 'Worker token has expired.' };
        }

        const scopes: string[] = Array.isArray(tokenRow.scopes) ? tokenRow.scopes : ['*'];
        if (!hasRequiredScope(scopes, requiredScope)) {
          return { success: false, status: 403, message: `Token lacks required scope: ${requiredScope}` };
        }

        return {
          success: true,
          context: {
            tokenId: tokenRow.id,
            workerName: tokenRow.worker_name || 'registered-worker',
            workerId: tokenRow.worker_id || undefined,
            scopes,
          },
        };
      }
    } catch {
      // Table may not exist yet, continue to reject
    }
  }

  return { success: false, status: 401, message: 'Invalid or revoked worker authentication token.' };
}
