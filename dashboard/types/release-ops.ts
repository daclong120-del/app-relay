// Release Ops & AppRelay Domain Types

export type ReleaseOpsJobType =
  | 'upload'
  | 'promote'
  | 'halt'
  | 'sync_report'
  | 'batch_step'
  | 'build'
  | 'publish'
  | 'pull_apk';

export type ReleaseOpsJobStatus =
  | 'queued'
  | 'claimed'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'retrying'
  | 'dead_letter'
  | 'cancelled'
  | 'expired';

export type AppRelayErrorCode =
  | 'INVALID_URL'
  | 'INVALID_PACKAGE_ID'
  | 'APP_NOT_FOUND'
  | 'PAYMENT_REQUIRED'
  | 'REGION_RESTRICTED'
  | 'DEVICE_UNAVAILABLE'
  | 'INSTALL_FAILED'
  | 'PULL_FAILED'
  | 'STORAGE_UPLOAD_FAILED'
  | 'TIMEOUT'
  | 'UNKNOWN_ERROR';

export interface AppRelayDeviceProfile {
  sdk: number;
  abi: string;
  density: number;
  locale: string;
}

export interface PullApkJobPayloadV1 {
  schemaVersion: 1;
  playUrl: string;
  packageId: string;
  locale?: string;
  includeListing?: boolean;
  includeScreenshots?: boolean;
  sourcePolicy?: 'google_play_only';
}

export interface PullApkJobResultV1 {
  schemaVersion: 1;
  versionName: string;
  versionCode: number;
  baseSizeBytes: number;
  splitCount: number;
  screenshotCount: number;
  archiveArtifactId: string;
  archiveSha256: string;
  archiveSizeBytes: number;
  deviceProfile?: AppRelayDeviceProfile;
  warnings?: string[];
}

export interface AppRelayArtifact {
  id: string;
  releaseId?: string | null;
  jobId?: string | null;
  appId?: string | null;
  fileName: string;
  checksum?: string | null;
  storagePath: string;
  artifactType: string;
  contentType: string;
  sizeBytes: number;
  expiresAt?: string | null;
  deletedAt?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface AppRelayJobEvent {
  id: string;
  jobId: string;
  level: 'info' | 'warn' | 'error';
  stage: string;
  message: string;
  progress: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface ReleaseOpsJobItem {
  id: string;
  jobType: ReleaseOpsJobType;
  status: ReleaseOpsJobStatus;
  priority: number;
  releaseId?: string | null;
  appId?: string | null;
  workerId?: string | null;
  leaseUntil?: string | null;
  heartbeatAt?: string | null;
  attemptCount: number;
  maxAttempts: number;
  idempotencyKey?: string | null;
  payload: PullApkJobPayloadV1 | Record<string, unknown>;
  result?: PullApkJobResultV1 | Record<string, unknown>;
  errorMessage?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReleaseOpsWorkerItem {
  id: string;
  workerName: string;
  status: string;
  maxParallelJobs: number;
  lastHeartbeat?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AppRelayJobDetail {
  job: ReleaseOpsJobItem;
  events: AppRelayJobEvent[];
  artifact?: AppRelayArtifact | null;
  worker?: ReleaseOpsWorkerItem | null;
}
