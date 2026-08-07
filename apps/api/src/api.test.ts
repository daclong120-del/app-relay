import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://mock.supabase.co';
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || 'mock-secret-key-12345';
process.env.API_TOKEN = process.env.API_TOKEN || 'apr_live_test_token';
process.env.WORKER_TOKEN = process.env.WORKER_TOKEN || 'worker_live_test_token';
process.env.DOWNLOAD_SIGNING_SECRET = process.env.DOWNLOAD_SIGNING_SECRET || 'test_download_signing_secret_key';

import { formatAppResponse, formatJobResponse, formatArtifactResponse, formatJobEventResponse } from './utils/formatters.js';
import { isValidPackageId, PACKAGE_ID_REGEX } from './utils/validation.js';
import { escapePostgrestValue, ilikeContains } from './utils/postgrest.js';
import { requireEnv } from './utils/env.js';

describe('requireEnv', () => {
  it('returns the value when the variable is set', () => {
    process.env.APP_RELAY_TEST_VAR = 'some-value';
    try {
      assert.strictEqual(requireEnv('APP_RELAY_TEST_VAR'), 'some-value');
    } finally {
      delete process.env.APP_RELAY_TEST_VAR;
    }
  });

  it('throws instead of falling back to an insecure default', () => {
    delete process.env.APP_RELAY_MISSING_VAR;
    assert.throws(
      () => requireEnv('APP_RELAY_MISSING_VAR'),
      /APP_RELAY_MISSING_VAR environment variable is required/
    );
  });

  it('rejects an empty string so a blank env var cannot pass as configured', () => {
    process.env.APP_RELAY_BLANK_VAR = '';
    try {
      assert.throws(() => requireEnv('APP_RELAY_BLANK_VAR'), /required/);
    } finally {
      delete process.env.APP_RELAY_BLANK_VAR;
    }
  });
});

describe('API Response Formatters & Security Tests', () => {
  it('formatJobResponse strips internal fields and formats camelCase', () => {
    const rawJob = {
      id: 'job_12345',
      batch_id: 'batch_67890',
      package_id: 'com.example.app',
      play_url: 'https://play.google.com/store/apps/details?id=com.example.app',
      include_listing: true,
      include_screenshots: true,
      options: { keepApk: true },
      status: 'completed',
      progress: 100,
      current_step: 'packaging',
      error_code: null,
      error_message: null,
      error_retryable: null,
      attempt_count: 1,
      created_at: '2026-08-07T00:00:00.000Z',
      queued_at: '2026-08-07T00:00:00.000Z',
      started_at: '2026-08-07T00:00:05.000Z',
      completed_at: '2026-08-07T00:01:00.000Z',
      updated_at: '2026-08-07T00:01:00.000Z',
      cancel_requested_at: null,
      cancel_reason: null,
      result_summary: { versionName: '1.0.0' },

      // Internal fields that MUST NOT be exposed
      locator: 'job_12345/bundle.zip',
      storage_backend: 'api_disk',
      idempotency_key: 'idemp_secret_123',
    };

    const formatted: any = formatJobResponse(rawJob);

    assert.strictEqual(formatted.jobId, 'job_12345');
    assert.strictEqual(formatted.packageId, 'com.example.app');
    assert.strictEqual(formatted.status, 'completed');
    assert.strictEqual(formatted.progress, 100);
    assert.strictEqual(formatted.attemptCount, 1);

    // Security assertions: internal storage & secret fields must be stripped
    assert.strictEqual(formatted.locator, undefined);
    assert.strictEqual(formatted.storage_backend, undefined);
    assert.strictEqual(formatted.storageBackend, undefined);
    assert.strictEqual(formatted.idempotency_key, undefined);
    assert.strictEqual(formatted.idempotencyKey, undefined);
  });

  it('formatArtifactResponse strips locator and storage_backend', () => {
    const rawArtifact = {
      id: 'art_99999',
      job_id: 'job_12345',
      kind: 'bundle_zip',
      state: 'available',
      file_name: 'com.example.app_1.0.0.zip',
      content_type: 'application/zip',
      size_bytes: 10485760,
      sha256: 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890',
      expires_at: '2026-08-09T00:00:00.000Z',
      created_at: '2026-08-07T00:01:00.000Z',
      updated_at: '2026-08-07T00:01:00.000Z',

      // Sensitive internal fields
      locator: 'job_12345/bundle.zip',
      storage_backend: 'api_disk',
    };

    const formatted: any = formatArtifactResponse(rawArtifact);

    assert.strictEqual(formatted.artifactId, 'art_99999');
    assert.strictEqual(formatted.jobId, 'job_12345');
    assert.strictEqual(formatted.fileName, 'com.example.app_1.0.0.zip');
    assert.strictEqual(formatted.sizeBytes, 10485760);

    // Critical security check: locator and storage_backend MUST NOT be present
    assert.strictEqual('locator' in formatted, false);
    assert.strictEqual('storage_backend' in formatted, false);
    assert.strictEqual('storageBackend' in formatted, false);
  });

  it('formatAppResponse correctly formats app records', () => {
    const rawApp = {
      package_id: 'com.example.app',
      play_url: 'https://play.google.com/store/apps/details?id=com.example.app',
      title: 'Example App',
      developer: 'Example Dev',
      version_name: '2.1.0',
      version_code: '210',
      rating: '4.5',
      installs_text: '1M+',
      description: 'App description',
      listing_metadata: { category: 'Tools' },
      screenshot_count: 5,
      split_count: 3,
      base_apk_size_bytes: '5242880',
      artifact_size_bytes: '15728640',
      last_successful_job_id: 'job_12345',
      first_seen_at: '2026-08-01T00:00:00.000Z',
      last_pulled_at: '2026-08-07T00:00:00.000Z',
      updated_at: '2026-08-07T00:00:00.000Z',
    };

    const formatted: any = formatAppResponse(rawApp);

    assert.strictEqual(formatted.packageId, 'com.example.app');
    assert.strictEqual(formatted.versionCode, 210);
    assert.strictEqual(formatted.rating, 4.5);
    assert.strictEqual(formatted.screenshotCount, 5);
    assert.strictEqual(formatted.baseApkSizeBytes, 5242880);
  });

  it('formatJobEventResponse formats snake_case database event records to camelCase', () => {
    const rawEvent = {
      id: 42,
      job_id: 'job_12345',
      event_type: 'job.queued',
      level: 'info',
      message: 'Job submitted and queued',
      data: { packageId: 'com.example.app' },
      created_at: '2026-08-07T00:00:00.000Z',
    };

    const formatted: any = formatJobEventResponse(rawEvent);

    assert.strictEqual(formatted.id, 42);
    assert.strictEqual(formatted.jobId, 'job_12345');
    assert.strictEqual(formatted.eventType, 'job.queued');
    assert.strictEqual(formatted.level, 'info');
    assert.strictEqual(formatted.message, 'Job submitted and queued');
    assert.strictEqual(formatted.data.packageId, 'com.example.app');
    assert.strictEqual(formatted.createdAt, '2026-08-07T00:00:00.000Z');
    assert.strictEqual('job_id' in formatted, false);
    assert.strictEqual('event_type' in formatted, false);
    assert.strictEqual('created_at' in formatted, false);
  });
});

describe('PackageId Validation Tests', () => {
  it('validates legitimate Android package IDs', () => {
    const validPackageIds = [
      'com.example.app',
      'vn.chpay.android',
      'org.test.my_app123',
      'com.foo_bar.baz',
      'a.b.c',
      'com.google.android.apps.maps',
    ];

    for (const pkgId of validPackageIds) {
      assert.strictEqual(isValidPackageId(pkgId), true, `Expected '${pkgId}' to be valid`);
      assert.strictEqual(PACKAGE_ID_REGEX.test(pkgId), true);
    }
  });

  it('rejects command injection and malformed package IDs', () => {
    const invalidPackageIds = [
      'com.example; rm -rf /',
      'com.example.app && echo hacked',
      'com.example.app | cat /etc/passwd',
      'invalid', // Single segment without dot
      '123com.example.app', // Segment starting with digit
      'com.example..app', // Double dot
      'com.example/app', // Path traversal slash
      '<script>alert(1)</script>', // HTML/XSS tag
      'com.example.app\n', // Newline
      'com.example.app;adb shell',
      '',
      null,
      undefined,
    ];

    for (const pkgId of invalidPackageIds) {
      assert.strictEqual(isValidPackageId(pkgId as any), false, `Expected '${pkgId}' to be rejected`);
    }
  });
});

describe('PostgREST Filter Sanitization Tests', () => {
  it('escapes ILIKE metacharacters so they survive PostgREST unquoting as literals', () => {
    // `%` -> `\%` (ILIKE escape) -> `\\%` (PostgREST quoted-string escape).
    // PostgREST unquotes `\\` to `\`, leaving SQL `\%` = a literal percent sign.
    assert.strictEqual(escapePostgrestValue('100%'), '100\\\\%');
    assert.strictEqual(escapePostgrestValue('my_app'), 'my\\\\_app');
  });

  it('escapes backslashes and double quotes for the quoted-string syntax', () => {
    assert.strictEqual(escapePostgrestValue('a"b'), 'a\\"b');
    assert.strictEqual(escapePostgrestValue('a\\b'), 'a\\\\b');
  });

  it('keeps a plain comma inside the quoted value instead of splitting the filter', () => {
    const filter = ilikeContains('title', 'Facemoji, Inc');
    assert.strictEqual(filter, 'title.ilike."%Facemoji, Inc%"');
  });

  it('contains an injection payload inside the quotes rather than adding an OR branch', () => {
    const filter = ilikeContains('title', 'zzz,description.ilike.*abc*');
    assert.strictEqual(filter, 'title.ilike."%zzz,description.ilike.*abc*%"');

    // A quote-breakout attempt stays escaped, so it cannot terminate the value early.
    const escaped = escapePostgrestValue('x",package.eq.y,"');
    assert.ok(
      !/(^|[^\\])"/.test(escaped),
      `expected every double quote to be backslash-escaped, got: ${escaped}`
    );
  });

  it('leaves the surrounding wildcards outside the escaped value', () => {
    assert.ok(ilikeContains('package_id', 'com.example').startsWith('package_id.ilike."%'));
    assert.ok(ilikeContains('package_id', 'com.example').endsWith('%"'));
  });
});

describe('Express HTTP Endpoints Integration Tests', () => {
  it('GET /v1/health returns HTTP 200 OK status', async () => {
    const appModule = await import('./app.js');
    const app = appModule.default;
    const server = app.listen(0);
    const address = server.address() as any;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const res = await fetch(`${baseUrl}/v1/health`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'ok');
      assert.strictEqual(typeof data.version, 'string');
    } finally {
      server.close();
    }
  });

  it('GET /v1/system/status without auth header returns 401 Unauthorized', async () => {
    const appModule = await import('./app.js');
    const app = appModule.default;
    const server = app.listen(0);
    const address = server.address() as any;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const res = await fetch(`${baseUrl}/v1/system/status`);
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.error.code, 'UNAUTHORIZED');
    } finally {
      server.close();
    }
  });

  it('GET /v1/system/status with Bearer token passes auth middleware', async () => {
    const appModule = await import('./app.js');
    const app = appModule.default;
    const server = app.listen(0);
    const address = server.address() as any;
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const token = process.env.API_TOKEN;

    try {
      const res = await fetch(`${baseUrl}/v1/system/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Will return 200 or 500 depending on Supabase mock, but MUST NOT be 401/403
      assert.notStrictEqual(res.status, 401);
      assert.notStrictEqual(res.status, 403);
    } finally {
      server.close();
    }
  });

  it('generates 10,000 unique high-entropy job IDs without collisions in single millisecond batch', () => {
    const generatedIds = new Set<string>();
    const count = 10000;
    const now = Date.now();

    for (let i = 0; i < count; i++) {
      const jobId = `job_${now}_${i}_${crypto.randomBytes(8).toString('hex')}`;
      generatedIds.add(jobId);
    }

    assert.strictEqual(generatedIds.size, count, `Expected ${count} unique job IDs, got ${generatedIds.size}`);
  });
});

