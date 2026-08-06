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

export function getAppRelayConfig(): AppRelayConfig {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    'https://supabase.local';

  const supabaseServiceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  const rawOrigins = process.env.APPRELAY_ALLOWED_ORIGINS || '*';
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
