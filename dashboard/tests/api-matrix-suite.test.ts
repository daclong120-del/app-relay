// Dashboard integration runner for AppRelay API Matrix Test Suite
import { runApiMatrixSuite } from './api-matrix-suite';

runApiMatrixSuite().catch((err) => {
  console.error('❌ API Matrix test runner failed:', err);
  process.exit(1);
});
