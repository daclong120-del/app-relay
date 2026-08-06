// Integration Test Suite for Reliability, Operations & Reconciliation (Phase 10)

import { getWorkerFleetStatusAction } from '../app/actions/release-ops-fleet.actions';
import {
  reconcileExpiredLeases,
  reconcileStaleWorkers,
} from '../lib/release-ops-reliability/reconciliation.service';
import {
  getBackoffDelayMs,
  isErrorRetryable,
} from '../lib/release-ops-reliability/retry-policy';

class MockDbClient {
  public workers: Map<string, any> = new Map();
  public jobs: Map<string, any> = new Map();
  public artifacts: Map<string, any> = new Map();

  from(tableName: string) {
    const self = this;

    if (tableName === 'release_ops_workers') {
      return {
        select() {
          return {
            eq(field: string, value: any) {
              return {
                lt(ltField: string, ltVal: any) {
                  const stale = Array.from(self.workers.values()).filter(
                    (w) => w.status === value && new Date(w.last_heartbeat) < new Date(ltVal)
                  );
                  return Promise.resolve({ data: stale, error: null });
                },
              };
            },
            order() {
              const rows = Array.from(self.workers.values());
              return Promise.resolve({ data: rows, error: null });
            },
          };
        },
        update(updateData: any) {
          return {
            in(field: string, values: any[]) {
              for (const id of values) {
                const w = self.workers.get(id);
                if (w) Object.assign(w, updateData);
              }
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    }

    if (tableName === 'release_ops_jobs') {
      return {
        select() {
          return {
            in(field: string, values: any[]) {
              return {
                lt(ltField: string, ltVal: any) {
                  const expired = Array.from(self.jobs.values()).filter(
                    (j) => values.includes(j.status) && new Date(j.lease_until) < new Date(ltVal)
                  );
                  return Promise.resolve({ data: expired, error: null });
                },
              };
            },
          };
        },
        update(updateData: any) {
          return {
            eq(field: string, value: any) {
              const job = self.jobs.get(value);
              if (job) {
                Object.assign(job, updateData);
                return Promise.resolve({ error: null });
              }
              return Promise.resolve({ error: new Error('Job not found') });
            },
          };
        },
      };
    }

    return { select: () => this, eq: () => this };
  }
}

async function runReliabilityTests() {
  console.log('--- STARTING RELIABILITY, OPERATIONS & RECONCILIATION TESTS (PHASE 10) ---');

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

  // 1. Error Retryability Classifier Tests
  assert(isErrorRetryable('APP_NOT_FOUND: Package not in store') === false, 'APP_NOT_FOUND is non-retryable');
  assert(isErrorRetryable('UNSUPPORTED_REGION: App unavailable') === false, 'UNSUPPORTED_REGION is non-retryable');
  assert(isErrorRetryable('PAYMENT_OR_APPROVAL_REQUIRED: Paid app') === false, 'PAYMENT_OR_APPROVAL_REQUIRED is non-retryable');
  assert(isErrorRetryable('PLAY_LOGIN_REQUIRED: Login needed') === false, 'PLAY_LOGIN_REQUIRED is non-retryable');

  assert(isErrorRetryable('DEVICE_UNAVAILABLE: ADB disconnected') === true, 'DEVICE_UNAVAILABLE is retryable');
  assert(isErrorRetryable('INSTALL_TIMEOUT: Timed out') === true, 'INSTALL_TIMEOUT is retryable');
  assert(isErrorRetryable('STORAGE_UPLOAD_FAILED: Network dropped') === true, 'STORAGE_UPLOAD_FAILED is retryable');

  // 2. Exponential Backoff Calculation Tests
  const delay1 = getBackoffDelayMs(1);
  const delay2 = getBackoffDelayMs(2);
  const delay3 = getBackoffDelayMs(3);

  assert(delay1 >= 5000 && delay1 <= 6000, 'Attempt 1 backoff is ~5000ms + jitter');
  assert(delay2 >= 10000 && delay2 <= 11000, 'Attempt 2 backoff is ~10000ms + jitter');
  assert(delay3 >= 20000 && delay3 <= 21000, 'Attempt 3 backoff is ~20000ms + jitter');

  // 3. Stale Worker Reconciliation Tests
  const mockDb = new MockDbClient();
  const staleHb = new Date(Date.now() - 180 * 1000).toISOString();
  mockDb.workers.set('w_stale_1', {
    id: 'w_stale_1',
    worker_name: 'Stale Worker',
    status: 'active',
    last_heartbeat: staleHb,
  });

  const staleCount = await reconcileStaleWorkers(mockDb as any, 90);
  assert(staleCount === 1, 'Identifies and reconciles stale worker');
  assert(mockDb.workers.get('w_stale_1').status === 'offline', 'Updates stale worker status to offline');

  // 4. Expired Lease Reconciliation Tests (Requeueable vs Dead Letter)
  const expiredTime = new Date(Date.now() - 1000).toISOString();

  // Retryable job with attempts remaining
  mockDb.jobs.set('job_exp_1', {
    id: 'job_exp_1',
    status: 'running',
    lease_until: expiredTime,
    attempt_count: 1,
    max_attempts: 3,
    error_message: 'INSTALL_TIMEOUT: Timed out',
  });

  // Exhausted job with max attempts reached
  mockDb.jobs.set('job_exp_2', {
    id: 'job_exp_2',
    status: 'running',
    lease_until: expiredTime,
    attempt_count: 3,
    max_attempts: 3,
    error_message: 'INSTALL_TIMEOUT: Timed out',
  });

  const leaseRes = await reconcileExpiredLeases(mockDb as any);
  assert(leaseRes.requeued === 1, 'Requeues expired job with remaining attempts');
  assert(leaseRes.deadLettered === 1, 'Dead-letters expired job with exhausted attempts');
  assert(mockDb.jobs.get('job_exp_1').status === 'queued', 'Job 1 requeued to queued status');
  assert(mockDb.jobs.get('job_exp_2').status === 'dead_letter', 'Job 2 updated to dead_letter status');

  // 5. Worker Fleet Status Action Test
  const fleetRes = await getWorkerFleetStatusAction(mockDb as any);
  assert(fleetRes.success === true && fleetRes.data!.length === 1, 'Queries worker fleet health status');

  console.log(`\nTEST SUMMARY: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runReliabilityTests().catch((err) => {
  console.error('Fatal error in reliability tests:', err);
  process.exit(1);
});
