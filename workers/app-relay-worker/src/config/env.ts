// Environment Configuration & Runtime Options

export interface WorkerConfig {
  workerName: string;
  gatewayUrl: string;
  workerToken: string;
  adbDeviceSerial: string;
  maxParallelJobs: number;
  pollIntervalMs: number;
  workerHeartbeatIntervalMs: number;
  jobHeartbeatIntervalMs: number;
  workerVersion: string;
  capability: string;
}

export function loadWorkerConfig(): WorkerConfig {
  const workerName = process.env.WORKER_NAME || `worker-${Math.random().toString(36).substring(2, 7)}`;
  const gatewayUrl = (process.env.GATEWAY_URL || 'http://localhost:3000/api/release-ops/worker/v1').replace(/\/$/, '');
  const workerToken = process.env.WORKER_TOKEN || 'dev-worker-token-secret-key';
  const adbDeviceSerial = process.env.ADB_DEVICE_SERIAL || 'emulator-5554';
  const maxParallelJobs = Math.max(1, parseInt(process.env.MAX_PARALLEL_JOBS || '1', 10));
  const pollIntervalMs = Math.max(1000, parseInt(process.env.POLL_INTERVAL_MS || '5000', 10));
  const workerHeartbeatIntervalMs = Math.max(5000, parseInt(process.env.WORKER_HEARTBEAT_INTERVAL_MS || '30000', 10));
  const jobHeartbeatIntervalMs = Math.max(3000, parseInt(process.env.JOB_HEARTBEAT_INTERVAL_MS || '10000', 10));

  return {
    workerName,
    gatewayUrl,
    workerToken,
    adbDeviceSerial,
    maxParallelJobs,
    pollIntervalMs,
    workerHeartbeatIntervalMs,
    jobHeartbeatIntervalMs,
    workerVersion: '1.0.0',
    capability: 'app_artifact_acquisition',
  };
}
