// Service-role Supabase client factory.
//
// This module deliberately has no mock/in-memory fallback. The previous
// implementation silently substituted a seeded fake database whenever Supabase
// credentials were absent, so a misconfigured deployment answered API calls
// with fabricated jobs and artifacts under HTTP 200. Callers now either get a
// real client or an exception.

if (typeof window !== 'undefined') {
  throw new Error('SERVER_ONLY_MODULE: Service-role client cannot be loaded in browser environment.');
}

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ConfigurationError, requireSupabaseCredentials } from '../config/app-relay-config';

let cachedClient: SupabaseClient | null = null;

export function getServiceRoleClient(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const { url, serviceRoleKey } = requireSupabaseCredentials();

  cachedClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedClient;
}

export interface DatabaseHealth {
  reachable: boolean;
  error?: string;
}

let healthCache: { checkedAt: number; result: DatabaseHealth } | null = null;
const HEALTH_CACHE_MS = 10_000;

/**
 * Cheap connectivity probe used by /health. Cached briefly so that an
 * unauthenticated health endpoint cannot be turned into a database load
 * generator.
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const now = Date.now();
  if (healthCache && now - healthCache.checkedAt < HEALTH_CACHE_MS) {
    return healthCache.result;
  }

  let result: DatabaseHealth;
  try {
    const db = getServiceRoleClient();
    const { error } = await db
      .from('app_relay_tenants')
      .select('id', { head: true, count: 'exact' })
      .limit(1);

    result = error ? { reachable: false, error: error.message } : { reachable: true };
  } catch (err) {
    result = {
      reachable: false,
      error: err instanceof ConfigurationError ? err.message : 'Database connection failed.',
    };
  }

  healthCache = { checkedAt: now, result };
  return result;
}
