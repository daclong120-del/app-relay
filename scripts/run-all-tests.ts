// Master Test Runner Executing All Project Test Suites (Phase 11)

import { execSync } from 'child_process';

const testSuites = [
  { name: 'Phase 4: Worker Gateway Contract Tests', path: 'dashboard/lib/release-ops-worker-api/__tests__/gateway.test.ts' },
  { name: 'Phase 5: AppRelay Worker Foundation Tests', path: 'workers/app-relay-worker/tests/fake-worker.test.ts' },
  { name: 'Phase 6: Google Play Listing Pipeline Tests', path: 'workers/app-relay-worker/tests/play-listing.test.ts' },
  { name: 'Phase 7: Android & APK Extraction Tests', path: 'workers/app-relay-worker/tests/android-pipeline.test.ts' },
  { name: 'Phase 8: Artifact & Safe Cleanup Tests', path: 'workers/app-relay-worker/tests/artifact-pipeline.test.ts' },
  { name: 'Phase 9: Dashboard Server Actions Tests', path: 'dashboard/tests/dashboard-actions.test.ts' },
  { name: 'Phase 10: Reliability & Operations Tests', path: 'dashboard/tests/reliability-operations.test.ts' },
  { name: 'Phase 11: Security Review & Audit Tests', path: 'dashboard/tests/security-review.test.ts' },
  { name: 'Phase 12: Rollout Controls & Kill Switch Tests', path: 'dashboard/tests/rollout-killswitch.test.ts' },
];

async function main() {
  console.log('================================================================');
  console.log('       RUNNING APPRELAY UNIFIED TEST SUITE MATRIX (ALL PHASES)  ');
  console.log('================================================================\n');

  let totalPassedSuites = 0;
  let totalFailedSuites = 0;

  for (const suite of testSuites) {
    console.log(`\n▶ Running ${suite.name}...`);
    try {
      execSync(`npx tsx ${suite.path}`, { stdio: 'inherit' });
      totalPassedSuites++;
    } catch {
      console.error(`❌ Suite failed: ${suite.name}`);
      totalFailedSuites++;
    }
  }

  console.log('\n================================================================');
  console.log(`MASTER TEST MATRIX SUMMARY: ${totalPassedSuites} Passed, ${totalFailedSuites} Failed.`);
  console.log('================================================================\n');

  if (totalFailedSuites > 0) {
    process.exit(1);
  }
}

main();
