// AppRelay Centralized Configuration Abstraction

if (typeof window !== 'undefined') {
  throw new Error('SERVER_ONLY_MODULE: Configuration module cannot be loaded in browser environment.');
}

export interface AppRelayConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  allowedOrigins: string[];
  artifactRetentionHours: number;
  workerLeaseSeconds: number;
  maxEventBytes: number;
  jwtIssuer?: string;
  jwtAudience?: string;
}

/**
 * Values that used to be accepted as if they were a real backend. They are
 * placeholders from docker-compose defaults and example env files; treating any
 * of them as configured is what let the API serve seeded mock data under a
 * 200 OK. They are rejected outright now.
 */
const PLACEHOLDER_MARKERS = ['supabase.local', 'mock', 'example', 'changeme', 'your_', 'your-'];

function isPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  return PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker));
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export function getAppRelayConfig(): AppRelayConfig {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    '';

  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  // No wildcard default: an unset origin list means "same-origin only", not
  // "every site on the internet may call this with credentials".
  const rawOrigins = process.env.APPRELAY_ALLOWED_ORIGINS || '';
  const allowedOrigins = rawOrigins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const artifactRetentionHours = Number(process.env.RELEASE_OPS_APK_RETENTION_HOURS || 24);
  const workerLeaseSeconds = Number(process.env.RELEASE_OPS_WORKER_LEASE_SECONDS || 300);
  const maxEventBytes = Number(process.env.RELEASE_OPS_MAX_EVENT_BYTES || 65536);

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    allowedOrigins,
    artifactRetentionHours,
    workerLeaseSeconds,
    maxEventBytes,
    jwtIssuer: process.env.APPRELAY_JWT_ISSUER,
    jwtAudience: process.env.APPRELAY_JWT_AUDIENCE,
  };
}

/**
 * Throws unless a genuine Supabase project is configured. Callers that need a
 * database must go through this so a misconfigured deployment fails loudly
 * instead of silently degrading to fabricated data.
 */
export function requireSupabaseCredentials(): { url: string; serviceRoleKey: string } {
  const { supabaseUrl, supabaseServiceRoleKey } = getAppRelayConfig();

  if (!supabaseUrl || isPlaceholder(supabaseUrl)) {
    throw new ConfigurationError(
      'SUPABASE_URL is missing or is a placeholder value. Set NEXT_PUBLIC_SUPABASE_URL to a real Supabase project URL.'
    );
  }

  if (!supabaseServiceRoleKey || isPlaceholder(supabaseServiceRoleKey)) {
    throw new ConfigurationError(
      'SUPABASE_SERVICE_ROLE_KEY is missing or is a placeholder value. Set it to the real service role key.'
    );
  }

  return { url: supabaseUrl, serviceRoleKey: supabaseServiceRoleKey };
}
