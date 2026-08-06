// AppRelay Public API Test Suite Matrix (v1.3.1)
// Delegation runner pointing to dashboard/tests/api-matrix-suite.ts

import { runApiMatrixSuite } from '../dashboard/tests/api-matrix-suite';

runApiMatrixSuite().catch((err) => {
  console.error('❌ Matrix test suite failed:', err);
  process.exit(1);
});
