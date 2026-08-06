// AppRelay Live HTTP Endpoint Test Suite (v1.3.1)
// Delegation runner pointing to dashboard/tests/test-live-endpoints.ts

import { runLiveEndpointsTest } from '../../dashboard/tests/test-live-endpoints';

runLiveEndpointsTest().catch((err) => {
  console.error('❌ Live endpoints test runner failed:', err);
  process.exit(1);
});
