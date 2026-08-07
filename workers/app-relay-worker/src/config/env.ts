// Environment Configuration & Runtime Options

export interface WorkerConfig {
  workerId?: string;
  workerName: string;
  gatewayUrl: string;
  workerToken: string;
  adbDeviceSerial: string;
  adbPath: string;
  emulatorPath: string;
  avdName: string;
  bootTimeoutMs: number;
  maxParallelJobs: number;
  pollIntervalMs: number;
  workerHeartbeatIntervalMs: number;
  jobHeartbeatIntervalMs: number;
  workerVersion: string;
  capability: string;
  headless: boolean;
  emulatorGpuMode: string;
  installTimeoutMs: number;
}

/**
 * Shipped as the built-in default and later published in the partner API guide,
 * so it is treated as compromised and can no longer start a worker.
 */
const COMPROMISED_TOKENS = new Set(['dev-worker-token-secret-key', 'your-production-worker-secret-token']);
const MIN_TOKEN_LENGTH = 24;

function requireWorkerToken(): string {
  const token = (process.env.WORKER_TOKEN || '').trim();

  if (!token) {
    throw new Error(
      'CONFIGURATION_ERROR: WORKER_TOKEN is not set. Generate a token, register its sha256 hash in release_ops_worker_tokens (or set RELEASE_OPS_WORKER_TOKEN on the gateway), and pass it to the worker.'
    );
  }

  if (COMPROMISED_TOKENS.has(token)) {
    throw new Error(
      'CONFIGURATION_ERROR: WORKER_TOKEN is a known-compromised placeholder value. Issue a fresh token.'
    );
  }

  if (token.length < MIN_TOKEN_LENGTH) {
    throw new Error(
      `CONFIGURATION_ERROR: WORKER_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters.`
    );
  }

  return token;
}

export function loadWorkerConfig(): WorkerConfig {
  const workerId = process.env.WORKER_ID;
  const workerName = process.env.WORKER_NAME || `worker-${Math.random().toString(36).substring(2, 7)}`;
  const gatewayUrl = (process.env.GATEWAY_URL || 'http://localhost:3000/api/release-ops/worker/v1').replace(/\/$/, '');
  const workerToken = requireWorkerToken();
  const adbDeviceSerial = process.env.ADB_DEVICE_SERIAL || 'emulator-5554';
  const adbPath = process.env.ADB_PATH || 'adb';
  const emulatorPath = process.env.EMULATOR_PATH || 'emulator';
  const avdName = process.env.AVD_NAME || 'chpay';
  const bootTimeoutMs = parseInt(process.env.EMULATOR_BOOT_TIMEOUT_MS || '180000', 10);
  const installTimeoutMs = parseInt(process.env.INSTALL_TIMEOUT_MS || '360000', 10);
  const maxParallelJobs = Math.max(1, parseInt(process.env.MAX_PARALLEL_JOBS || '1', 10));
  const pollIntervalMs = Math.max(1000, parseInt(process.env.POLL_INTERVAL_MS || '5000', 10));
  const workerHeartbeatIntervalMs = Math.max(5000, parseInt(process.env.WORKER_HEARTBEAT_INTERVAL_MS || '30000', 10));
  const jobHeartbeatIntervalMs = Math.max(3000, parseInt(process.env.JOB_HEARTBEAT_INTERVAL_MS || '10000', 10));
  const headlessEnv = (process.env.HEADLESS || '').trim().toLowerCase();
  const headless =
    headlessEnv === 'true'
      ? true
      : headlessEnv === 'false'
        ? false
        : process.env.NODE_ENV === 'production';
  // Chỉ áp dụng khi chạy có GUI (headless luôn dùng -gpu off).
  const emulatorGpuMode = process.env.EMULATOR_GPU_MODE || 'swiftshader_indirect';

  return {
    workerId,
    workerName,
    gatewayUrl,
    workerToken,
    adbDeviceSerial,
    adbPath,
    emulatorPath,
    avdName,
    bootTimeoutMs,
    installTimeoutMs,
    maxParallelJobs,
    pollIntervalMs,
    workerHeartbeatIntervalMs,
    jobHeartbeatIntervalMs,
    workerVersion: '1.0.0',
    capability: 'app_artifact_acquisition',
    headless,
    emulatorGpuMode,
  };
}

