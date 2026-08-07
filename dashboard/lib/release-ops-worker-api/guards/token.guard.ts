// Worker Token Authentication & Scope Guard

import { createHash, timingSafeEqual } from 'crypto';
import { hasRequiredScope, WorkerApiScope } from '../scopes';

export interface AuthenticatedWorkerContext {
  tokenId: string;
  workerName: string;
  workerId?: string;
  scopes: string[];
}

/**
 * This value shipped as the built-in default and was then published in the
 * partner-facing API guide, so it must never authenticate anything again.
 */
const COMPROMISED_TOKENS = new Set(['dev-worker-token-secret-key']);

const MIN_TOKEN_LENGTH = 24;

export async function hashToken(token: string): Promise<string> {
  return createHash('sha256').update(token.trim()).digest('hex');
}

function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

type AuthFailure = { success: false; status: number; message: string };

const INVALID_TOKEN: AuthFailure = {
  success: false,
  status: 401,
  message: 'Invalid or revoked worker authentication token.',
};

export async function authenticateWorkerToken(
  authHeader: string | null,
  requiredScope: WorkerApiScope,
  db?: any
): Promise<{ success: true; context: AuthenticatedWorkerContext } | AuthFailure> {
  if (!authHeader) {
    return { success: false, status: 401, message: 'Missing Authorization header.' };
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return { success: false, status: 401, message: 'Invalid Authorization header format. Expected "Bearer <token>".' };
  }

  const rawToken = parts[1];
  if (!rawToken) {
    return { success: false, status: 401, message: 'Empty bearer token.' };
  }

  if (COMPROMISED_TOKENS.has(rawToken)) {
    console.error('[worker-auth] Rejected a request using the publicly known default token.');
    return INVALID_TOKEN;
  }

  const tokenHash = await hashToken(rawToken);

  // 1. Environment token. Must be explicitly configured — there is no default,
  //    so an unconfigured deployment authenticates nobody instead of everyone.
  const envToken = process.env.RELEASE_OPS_WORKER_TOKEN || '';
  if (envToken && !COMPROMISED_TOKENS.has(envToken) && envToken.length >= MIN_TOKEN_LENGTH) {
    if (constantTimeEquals(rawToken, envToken)) {
      const scopes = ['*'];
      if (!hasRequiredScope(scopes, requiredScope)) {
        return { success: false, status: 403, message: `Token lacks required scope: ${requiredScope}` };
      }
      return {
        success: true,
        context: { tokenId: 'env-default', workerName: 'system-worker', scopes },
      };
    }
  } else if (envToken) {
    console.error(
      '[worker-auth] RELEASE_OPS_WORKER_TOKEN is set but rejected: it is either the known-compromised default or shorter than ' +
        `${MIN_TOKEN_LENGTH} characters.`
    );
  }

  // 2. Database-issued token.
  if (db) {
    try {
      const { data: tokenRow, error } = await db
        .from('release_ops_worker_tokens')
        .select('*')
        .eq('token_hash', tokenHash)
        .eq('status', 'active')
        .maybeSingle();

      if (error) {
        // Previously this was swallowed, which hid the fact that
        // release_ops_worker_tokens did not exist at all.
        console.error('[worker-auth] Worker token lookup failed:', error.message);
        return INVALID_TOKEN;
      }

      if (tokenRow) {
        if (tokenRow.revoked_at) return INVALID_TOKEN;
        if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
          return { success: false, status: 401, message: 'Worker token has expired.' };
        }

        const scopes: string[] = Array.isArray(tokenRow.scopes) ? tokenRow.scopes : ['*'];
        if (!hasRequiredScope(scopes, requiredScope)) {
          return { success: false, status: 403, message: `Token lacks required scope: ${requiredScope}` };
        }

        void db
          .from('release_ops_worker_tokens')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', tokenRow.id)
          .then?.(() => undefined, () => undefined);

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
    } catch (err: any) {
      console.error('[worker-auth] Worker token lookup threw:', err?.message || err);
      return INVALID_TOKEN;
    }
  }

  return INVALID_TOKEN;
}
