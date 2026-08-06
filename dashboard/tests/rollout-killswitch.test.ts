// Integration Test Suite for Rollout Controls & Emergency Kill Switches (Phase 12)

import {
  evaluateFeatureFlags,
  isAppRelayEnabled,
  isWorkerClaimAllowed,
} from '../lib/release-ops-rollout/feature-flags';
import { triggerEmergencyKillSwitch } from '../lib/release-ops-rollout/kill-switch.service';

class MockDbClient {
  public workers: Map<string, any> = new Map();
  public audits: any[] = [];

  from(tableName: string) {
    const self = this;

    if (tableName === 'release_ops_workers') {
      return {
        select() {
          return {
            in(field: string, values: any[]) {
              const active = Array.from(self.workers.values()).filter((w) => values.includes(w.status));
              return Promise.resolve({ data: active, error: null });
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

    if (tableName === 'release_ops_audits') {
      return {
        insert(data: any) {
          return {
            select() {
              return {
                single() {
                  const record = { id: 'audit_kill_' + Date.now(), ...data };
                  self.audits.push(record);
                  return Promise.resolve({ data: record, error: null });
                },
              };
            },
          };
        },
      };
    }

    return { select: () => this, eq: () => this };
  }
}

async function runRolloutKillswitchTests() {
  console.log('--- STARTING ROLLOUT CONTROLS & KILL SWITCH TESTS (PHASE 12) ---');

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

  // 1. Feature Flag Evaluation Tests
  const flagsActive = evaluateFeatureFlags({
    NEXT_PUBLIC_ENABLE_APP_RELAY: 'true',
    ENABLE_WORKER_JOB_CLAIM: 'true',
  });

  assert(flagsActive.enableAppRelay === true, 'Evaluates enableAppRelay as true');
  assert(flagsActive.enableWorkerJobClaim === true, 'Evaluates enableWorkerJobClaim as true');

  const flagsDisabled = evaluateFeatureFlags({
    NEXT_PUBLIC_ENABLE_APP_RELAY: 'false',
    ENABLE_WORKER_JOB_CLAIM: 'false',
  });

  assert(flagsDisabled.enableAppRelay === false, 'Evaluates enableAppRelay as false when disabled');
  assert(flagsDisabled.enableWorkerJobClaim === false, 'Evaluates enableWorkerJobClaim as false when disabled');

  assert(isAppRelayEnabled({ NEXT_PUBLIC_ENABLE_APP_RELAY: 'false' }) === false, 'isAppRelayEnabled returns false when flag disabled');
  assert(isWorkerClaimAllowed({ ENABLE_WORKER_JOB_CLAIM: 'false' }) === false, 'isWorkerClaimAllowed returns false when flag disabled');

  // 2. Emergency Kill Switch Tests
  const mockDb = new MockDbClient();
  mockDb.workers.set('w_active_1', { id: 'w_active_1', status: 'active' });
  mockDb.workers.set('w_idle_2', { id: 'w_idle_2', status: 'idle' });

  const killRes = await triggerEmergencyKillSwitch(mockDb as any, 'Testing Emergency Kill Switch', 'op_admin_1');

  assert(killRes.triggered === true, 'Emergency kill switch triggered successfully');
  assert(killRes.workersUpdatedCount === 2, 'Updates 2 active/idle workers');
  assert(mockDb.workers.get('w_active_1').status === 'maintenance', 'Worker 1 status updated to maintenance');
  assert(mockDb.workers.get('w_idle_2').status === 'maintenance', 'Worker 2 status updated to maintenance');
  assert(mockDb.audits.length === 1, 'Creates emergency audit record');
  assert(mockDb.audits[0].action === 'emergency_kill_switch_triggered', 'Audit log records emergency kill switch action');

  console.log(`\nTEST SUMMARY: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runRolloutKillswitchTests().catch((err) => {
  console.error('Fatal error in rollout killswitch tests:', err);
  process.exit(1);
});
