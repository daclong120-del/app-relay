import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import pg from 'pg';

interface MigrationFile {
  filename: string;
  filepath: string;
  sql: string;
}

export function findMigrations(migrationsDir: string): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) {
    console.warn(`[db-migrate] Directory not found: ${migrationsDir}`);
    return [];
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  return files.map((filename) => {
    const filepath = path.join(migrationsDir, filename);
    const sql = fs.readFileSync(filepath, 'utf-8');
    return { filename, filepath, sql };
  });
}

export function checksum(sql: string): string {
  // Normalise line endings first: a CRLF checkout on Windows would otherwise
  // produce a different hash for a byte-identical migration.
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

const LEDGER_DDL = `
  create table if not exists public.schema_migrations (
    filename text primary key,
    checksum text not null,
    applied_at timestamptz not null default now()
  );
`;

export async function applyMigrations(dbUrl: string, migrations: MigrationFile[]): Promise<string[]> {
  // Supabase's pooler presents a certificate for the pooler host rather than the
  // project host, so verification fails on an otherwise correct connection string.
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1') ? undefined : { rejectUnauthorized: false },
  });

  await client.connect();
  const applied: string[] = [];

  try {
    await client.query(LEDGER_DDL);

    const { rows } = await client.query<{ filename: string; checksum: string }>(
      'select filename, checksum from public.schema_migrations'
    );
    const ledger = new Map(rows.map((r) => [r.filename, r.checksum]));

    for (const m of migrations) {
      const sum = checksum(m.sql);
      const recorded = ledger.get(m.filename);

      if (recorded === sum) {
        console.log(`[db-migrate] ⏭  ${m.filename} already applied, skipping.`);
        continue;
      }

      if (recorded) {
        // Editing an applied migration silently desyncs environments, so refuse
        // rather than guess whether to re-run it.
        throw new Error(
          `${m.filename} was already applied with a different checksum (recorded=${recorded.slice(0, 12)}…, ` +
            `file=${sum.slice(0, 12)}…). Add a new migration instead of editing an applied one.`
        );
      }

      console.log(`[db-migrate] ▶  Applying ${m.filename}...`);

      // One transaction per migration: a failing file leaves no partial schema
      // behind and no ledger row, so a re-run retries it cleanly.
      await client.query('begin');
      try {
        await client.query(m.sql);
        await client.query('insert into public.schema_migrations (filename, checksum) values ($1, $2)', [
          m.filename,
          sum,
        ]);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback').catch(() => {});
        throw err;
      }

      applied.push(m.filename);
      console.log(`[db-migrate] ✅ ${m.filename} applied.`);
    }
  } finally {
    await client.end().catch(() => {});
  }

  return applied;
}

export async function runMigrations() {
  const args = process.argv.slice(2);
  const shouldApply = args.includes('--apply');
  const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');

  console.log(`[db-migrate] Checking for database migrations in: ${migrationsDir}`);
  const migrations = findMigrations(migrationsDir);

  if (migrations.length === 0) {
    console.log('[db-migrate] No SQL migration files found.');
    return;
  }

  console.log(`[db-migrate] Found ${migrations.length} migration file(s):`);
  for (const m of migrations) {
    console.log(` - ${m.filename} (${m.sql.length} bytes)`);
  }

  if (!shouldApply) {
    console.log('[db-migrate] Dry-run complete. Use --apply to execute pending migrations.');
    return;
  }

  const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!dbUrl) {
    // Exiting non-zero rather than reporting success: a deploy that believes its
    // migrations ran when they did not is worse than a failed pipeline step.
    throw new Error(
      'No database connection string. Set SUPABASE_DB_URL (or DATABASE_URL / POSTGRES_URL) to apply migrations.'
    );
  }

  const applied = await applyMigrations(dbUrl, migrations);

  if (applied.length === 0) {
    console.log('[db-migrate] ✅ Database already up to date, nothing to apply.');
  } else {
    console.log(`[db-migrate] ✅ Applied ${applied.length} migration(s): ${applied.join(', ')}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('db-migrate.ts')) {
  runMigrations().catch((err) => {
    console.error('[db-migrate] Error executing migrations:', err.message ?? err);
    process.exit(1);
  });
}
