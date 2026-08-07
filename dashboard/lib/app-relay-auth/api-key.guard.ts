// Partner API key authentication for the public AppRelay API.
//
// There is intentionally no environment-variable fallback and no default key.
// The worker gateway used to accept a hardcoded 'dev-worker-token-secret-key',
// which was then published in the partner-facing docs; anything resembling that
// pattern is a backdoor, so keys live only in app_relay_api_keys.

import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export const APP_RELAY_SCOPES = {
  JOBS_READ: 'jobs:read',
  JOBS_WRITE: 'jobs:write',
  ARTIFACTS_READ: 'artifacts:read',
  ARTIFACTS_WRITE: 'artifacts:write',
  WORKERS_READ: 'workers:read',
} as const;

export type AppRelayScope = (typeof APP_RELAY_SCOPES)[keyof typeof APP_RELAY_SCOPES];

export const KEY_PREFIX = 'ark_live_';

export interface PartnerAuthContext {
  keyId: string;
  keyName: string;
  tenantId: string;
  tenantName: string;
  scopes: string[];
  rateLimitPerMin: number;
  dailyJobQuota: number;
}

export type PartnerAuthResult =
  | { success: true; context: PartnerAuthContext }
  | { success: false; status: 401 | 403; code: string; message: string };

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey.trim()).digest('hex');
}

/** Generates a new partner key. Only the caller ever sees the raw value. */
export function generateApiKey(): { rawKey: string; tokenHash: string; keyPrefix: string } {
  const rawKey = `${KEY_PREFIX}${randomBytes(24).toString('hex')}`;
  return {
    rawKey,
    tokenHash: hashApiKey(rawKey),
    keyPrefix: rawKey.slice(0, KEY_PREFIX.length + 8),
  };
}

function parseBearer(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2) return null;
  if (parts[0].toLowerCase() !== 'bearer') return null;
  return parts[1] || null;
}

function hasScope(granted: string[], required: AppRelayScope): boolean {
  return granted.includes('*') || granted.includes(required);
}

/**
 * Every rejection returns the same opaque message. Distinguishing "no such key"
 * from "revoked key" would let a caller enumerate which keys ever existed.
 */
const INVALID_KEY: PartnerAuthResult = {
  success: false,
  status: 401,
  code: 'UNAUTHORIZED',
  message: 'Invalid or missing API key.',
};

export async function authenticateApiKey(
  authHeader: string | null,
  requiredScope: AppRelayScope,
  db: any
): Promise<PartnerAuthResult> {
  const rawKey = parseBearer(authHeader);
  if (!rawKey) return INVALID_KEY;

  const tokenHash = hashApiKey(rawKey);

  let row: any = null;
  try {
    const { data, error } = await db
      .from('app_relay_api_keys')
      .select('id, name, tenant_id, token_hash, scopes, status, rate_limit_per_min, daily_job_quota, expires_at, revoked_at, tenant:app_relay_tenants!inner(id, name, status)')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (error) {
      // A missing table or a broken connection must not degrade into "allow".
      console.error('[app-relay-auth] API key lookup failed:', error.message);
      return INVALID_KEY;
    }
    row = data;
  } catch (err: any) {
    console.error('[app-relay-auth] API key lookup threw:', err?.message || err);
    return INVALID_KEY;
  }

  if (!row) return INVALID_KEY;

  // Constant-time confirmation of the hash we matched on.
  const storedHash = Buffer.from(String(row.token_hash), 'utf8');
  const computedHash = Buffer.from(tokenHash, 'utf8');
  if (storedHash.length !== computedHash.length || !timingSafeEqual(storedHash, computedHash)) {
    return INVALID_KEY;
  }

  if (row.status !== 'active' || row.revoked_at) return INVALID_KEY;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return INVALID_KEY;

  const tenant = Array.isArray(row.tenant) ? row.tenant[0] : row.tenant;
  if (!tenant || tenant.status !== 'active') return INVALID_KEY;

  const scopes: string[] = Array.isArray(row.scopes) ? row.scopes : [];
  if (!hasScope(scopes, requiredScope)) {
    return {
      success: false,
      status: 403,
      code: 'FORBIDDEN',
      message: `API key lacks the required scope: ${requiredScope}`,
    };
  }

  // Best-effort usage stamp; never blocks or fails the request.
  void db
    .from('app_relay_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', row.id)
    .then?.(() => undefined, () => undefined);

  return {
    success: true,
    context: {
      keyId: row.id,
      keyName: row.name,
      tenantId: row.tenant_id,
      tenantName: tenant.name,
      scopes,
      rateLimitPerMin: Number(row.rate_limit_per_min ?? 60),
      dailyJobQuota: Number(row.daily_job_quota ?? 200),
    },
  };
}
