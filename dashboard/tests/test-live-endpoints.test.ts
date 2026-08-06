import { runLiveEndpointsTest } from './test-live-endpoints';

runLiveEndpointsTest().catch((err) => {
  console.error('❌ Live endpoints test runner failed:', err);
  process.exit(1);
});
