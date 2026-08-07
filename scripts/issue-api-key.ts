/**
 * Issues a partner API key for the AppRelay public API.
 *
 * The raw key is printed exactly once and never stored — only its sha256 hash
 * reaches the database, so a database leak cannot be replayed against the API.
 *
 * Usage:
 *   npx tsx scripts/issue-api-key.ts --tenant acme --name "Acme Production"
 *   npx tsx scripts/issue-api-key.ts --tenant acme --name "CI" --scopes jobs:read
 *   npx tsx scripts/issue-api-key.ts --tenant acme --name "Trial" --expires-days 30
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and
 * SUPABASE_SERVICE_ROLE_KEY in the environment.
 */

import { createHash, randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';

const KEY_PREFIX = 'ark_live_';
const DEFAULT_SCOPES = ['jobs:read', 'jobs:write', 'artifacts:read'];

function loadDotEnv(): void {
  for (const candidate of ['.env', '.env.local']) {
    try {
      const raw = readFileSync(join(process.cwd(), candidate), 'utf-8');
      for (const line of raw.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!match) continue;
        const [, key, value] = match;
        if (!process.env[key]) {
          process.env[key] = value.replace(/^["']|["']$/g, '');
        }
      }
    } catch {
      // Optional file.
    }
  }
}

function getArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  loadDotEnv();

  const tenantSlug = getArg('tenant');
  const keyName = getArg('name');
  const tenantName = getArg('tenant-name') || tenantSlug;
  const scopes = (getArg('scopes') || DEFAULT_SCOPES.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
  const expiresDays = getArg('expires-days');

  if (!tenantSlug || !keyName) {
    console.error('Usage: npx tsx scripts/issue-api-key.ts --tenant <slug> --name <key name>');
    console.error('Optional: --tenant-name <display name> --scopes a,b --expires-days 30');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
    process.exit(1);
  }

  const db = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Create the tenant on first use so onboarding a partner is a single command.
  const { data: existingTenant } = await db
    .from('app_relay_tenants')
    .select('id, name')
    .eq('slug', tenantSlug)
    .maybeSingle();

  if (!existingTenant) {
    const { error: tenantError } = await db
      .from('app_relay_tenants')
      .insert({ slug: tenantSlug, name: tenantName, status: 'active' });

    if (tenantError) {
      console.error(`ERROR: could not create tenant '${tenantSlug}': ${tenantError.message}`);
      process.exit(1);
    }
    console.log(`Created tenant '${tenantSlug}'.`);
  }

  const rawKey = `${KEY_PREFIX}${randomBytes(24).toString('hex')}`;
  const tokenHash = createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.slice(0, KEY_PREFIX.length + 8);

  const expiresAt = expiresDays
    ? new Date(Date.now() + Number(expiresDays) * 86_400_000).toISOString()
    : null;

  const { data: key, error } = await db
    .rpc('app_relay_issue_api_key', {
      p_tenant_slug: tenantSlug,
      p_name: keyName,
      p_key_prefix: keyPrefix,
      p_token_hash: tokenHash,
      p_scopes: scopes,
      p_expires_at: expiresAt,
    })
    .single();

  if (error) {
    console.error(`ERROR: could not issue key: ${error.message}`);
    process.exit(1);
  }

  console.log('');
  console.log('API key issued. Copy it now — it is not recoverable.');
  console.log('');
  console.log(`  Tenant   : ${tenantSlug}`);
  console.log(`  Key name : ${keyName}`);
  console.log(`  Key id   : ${(key as any)?.id ?? '(unknown)'}`);
  console.log(`  Scopes   : ${scopes.join(', ')}`);
  console.log(`  Expires  : ${expiresAt || 'never'}`);
  console.log('');
  console.log(`  API KEY  : ${rawKey}`);
  console.log('');
  console.log('Test it with:');
  console.log(`  curl -H "Authorization: Bearer ${rawKey}" <base-url>/api/app-relay/v1/jobs`);
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
