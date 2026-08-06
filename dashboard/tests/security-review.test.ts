// Integration Test Suite for Security Review & Audit Assertions (Phase 11)

import {
  assertPathTraversalSafe,
  assertShellSafe,
  assertSsrfSafe,
  redactSensitiveData,
  SecurityValidationError,
} from '../lib/release-ops-security/security-auditor';

async function runSecurityReviewTests() {
  console.log('--- STARTING SECURITY REVIEW & AUDIT TESTS (PHASE 11) ---');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] ${testName}`);
      failed++;
    }
  }

  // 1. SSRF Allowlist Assertions
  const validSsrf = assertSsrfSafe('https://play.google.com/store/apps/details?id=com.sinomedia.sec&hl=en');
  assert(validSsrf.packageId === 'com.sinomedia.sec', 'Allows valid play.google.com HTTPS URL');

  let caughtHttpSsrf = false;
  try {
    assertSsrfSafe('http://play.google.com/store/apps/details?id=com.sinomedia.sec');
  } catch (err: any) {
    if (err instanceof SecurityValidationError && err.code === 'SSRF_VIOLATION') caughtHttpSsrf = true;
  }
  assert(caughtHttpSsrf, 'Rejects insecure HTTP protocol');

  let caughtHostSsrf = false;
  try {
    assertSsrfSafe('https://malicious-store-mirror.com/store/apps/details?id=com.sinomedia.sec');
  } catch (err: any) {
    if (err instanceof SecurityValidationError && err.code === 'SSRF_VIOLATION') caughtHostSsrf = true;
  }
  assert(caughtHostSsrf, 'Rejects non-allowlisted hostname (SSRF defense)');

  // 2. Shell Injection Defense Assertions
  assert(assertShellSafe('com.sinomedia.app') === 'com.sinomedia.app', 'Allows safe package string');

  let caughtShellInjection = false;
  try {
    assertShellSafe('com.app; rm -rf /');
  } catch (err: any) {
    if (err instanceof SecurityValidationError && err.code === 'SHELL_INJECTION_RISK') caughtShellInjection = true;
  }
  assert(caughtShellInjection, 'Rejects shell operator ";" in command argument');

  let caughtPipeInjection = false;
  try {
    assertShellSafe('com.app | cat /etc/passwd');
  } catch (err: any) {
    if (err instanceof SecurityValidationError && err.code === 'SHELL_INJECTION_RISK') caughtPipeInjection = true;
  }
  assert(caughtPipeInjection, 'Rejects shell pipe "|" in command argument');

  // 3. Path Traversal Defense Assertions
  const safePath = assertPathTraversalSafe('/app/workspace', '/app/workspace/job_101/apks/base.apk');
  assert(safePath.includes('job_101'), 'Allows valid path inside workspace base directory');

  let caughtPathTraversal = false;
  try {
    assertPathTraversalSafe('/app/workspace', '/app/workspace/../../etc/passwd');
  } catch (err: any) {
    if (err instanceof SecurityValidationError && err.code === 'PATH_TRAVERSAL_RISK') caughtPathTraversal = true;
  }
  assert(caughtPathTraversal, 'Rejects path escaping workspace base directory');

  // 4. Secret & Token Redaction Assertions
  const logWithSecret = 'Authorization: Bearer secret-worker-token-xyz123 passed in header';
  const redactedLog = redactSensitiveData(logWithSecret);
  assert(!redactedLog.includes('secret-worker-token-xyz123'), 'Redacts Bearer token from log text');
  assert(redactedLog.includes('[REDACTED_TOKEN]'), 'Replaces token with [REDACTED_TOKEN] placeholder');

  console.log(`\nTEST SUMMARY: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityReviewTests().catch((err) => {
  console.error('Fatal error in security review tests:', err);
  process.exit(1);
});
