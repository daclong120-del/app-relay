// Worker Application Entrypoint

import { loadWorkerConfig } from './config/env';
import { WorkerEngine } from './runtime/worker-engine';

async function main() {
  const config = loadWorkerConfig();
  const engine = new WorkerEngine(config);

  try {
    await engine.start();
  } catch (err: any) {
    console.error(`Fatal error starting AppRelay worker: ${err.message}`);
    process.exit(1);
  }
}

main();
