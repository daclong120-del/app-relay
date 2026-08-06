// Release Ops Worker API Request Body Validators

export interface RegisterWorkerInput {
  workerName: string;
  maxParallelJobs?: number;
  metadata?: Record<string, unknown>;
  workerId?: string;
}

export interface WorkerHeartbeatInput {
  workerId: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface ClaimJobInput {
  workerId: string;
  capabilities?: string[];
  leaseSeconds?: number;
}

export interface StartJobInput {
  workerId: string;
}

export interface JobHeartbeatInput {
  workerId: string;
  leaseSeconds?: number;
}

export interface AppendEventInput {
  workerId: string;
  level?: 'info' | 'warn' | 'error';
  stage: string;
  message: string;
  progress?: number;
  metadata?: Record<string, unknown>;
}

export interface UploadInitInput {
  workerId: string;
  fileName: string;
  contentType?: string;
  sizeBytes: number;
}

export interface UploadCompleteInput {
  workerId: string;
  storagePath: string;
  fileName: string;
  checksum: string;
  artifactType?: string;
  contentType?: string;
  sizeBytes: number;
  metadata?: Record<string, unknown>;
}

export interface SucceedJobInput {
  workerId: string;
  result: Record<string, unknown>;
}

export interface FailJobInput {
  workerId: string;
  errorMessage: string;
  canRetry?: boolean;
}

export function validateRegisterWorker(body: any): RegisterWorkerInput {
  if (!body || typeof body !== 'object') throw new Error('Body must be a JSON object.');
  if (typeof body.workerName !== 'string' || !body.workerName.trim()) {
    throw new Error('workerName is required and must be a non-empty string.');
  }
  if (body.maxParallelJobs !== undefined && (typeof body.maxParallelJobs !== 'number' || body.maxParallelJobs < 1)) {
    throw new Error('maxParallelJobs must be a positive integer.');
  }
  return {
    workerName: body.workerName.trim(),
    maxParallelJobs: body.maxParallelJobs ?? 1,
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
    workerId: typeof body.workerId === 'string' && body.workerId.trim() ? body.workerId.trim() : undefined,
  };
}

export function validateWorkerHeartbeat(body: any): WorkerHeartbeatInput {
  if (!body || typeof body !== 'object') throw new Error('Body must be a JSON object.');
  if (typeof body.workerId !== 'string' || !body.workerId.trim()) {
    throw new Error('workerId is required.');
  }
  return {
    workerId: body.workerId.trim(),
    status: typeof body.status === 'string' ? body.status : 'active',
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : undefined,
  };
}

export function validateClaimJob(body: any): ClaimJobInput {
  if (!body || typeof body !== 'object') throw new Error('Body must be a JSON object.');
  if (typeof body.workerId !== 'string' || !body.workerId.trim()) {
    throw new Error('workerId is required.');
  }
  if (body.capabilities !== undefined && !Array.isArray(body.capabilities)) {
    throw new Error('capabilities must be an array of strings.');
  }
  return {
    workerId: body.workerId.trim(),
    capabilities: Array.isArray(body.capabilities) ? body.capabilities : undefined,
    leaseSeconds: typeof body.leaseSeconds === 'number' ? Math.max(30, Math.min(3600, body.leaseSeconds)) : 300,
  };
}

export function validateStartJob(body: any): StartJobInput {
  if (!body || typeof body !== 'object') throw new Error('Body must be a JSON object.');
  if (typeof body.workerId !== 'string' || !body.workerId.trim()) {
    throw new Error('workerId is required.');
  }
  return { workerId: body.workerId.trim() };
}

export function validateJobHeartbeat(body: any): JobHeartbeatInput {
  if (!body || typeof body !== 'object') throw new Error('Body must be a JSON object.');
  if (typeof body.workerId !== 'string' || !body.workerId.trim()) {
    throw new Error('workerId is required.');
  }
  return {
    workerId: body.workerId.trim(),
    leaseSeconds: typeof body.leaseSeconds === 'number' ? Math.max(30, Math.min(3600, body.leaseSeconds)) : 300,
  };
}

export function validateAppendEvent(body: any): AppendEventInput {
  if (!body || typeof body !== 'object') throw new Error('Body must be a JSON object.');
  if (typeof body.workerId !== 'string' || !body.workerId.trim()) throw new Error('workerId is required.');
  if (typeof body.stage !== 'string' || !body.stage.trim()) throw new Error('stage is required.');
  if (typeof body.message !== 'string' || !body.message.trim()) throw new Error('message is required.');
  if (body.message.length > 1000) throw new Error('message exceeds maximum length of 1000 characters.');

  return {
    workerId: body.workerId.trim(),
    level: ['info', 'warn', 'error'].includes(body.level) ? body.level : 'info',
    stage: body.stage.trim(),
    message: body.message.trim(),
    progress: typeof body.progress === 'number' ? Math.max(0, Math.min(100, Math.floor(body.progress))) : 0,
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
  };
}

export function validateUploadInit(body: any): UploadInitInput {
  if (!body || typeof body !== 'object') throw new Error('Body must be a JSON object.');
  if (typeof body.workerId !== 'string' || !body.workerId.trim()) throw new Error('workerId is required.');
  if (typeof body.fileName !== 'string' || !body.fileName.trim()) throw new Error('fileName is required.');
  if (typeof body.sizeBytes !== 'number' || body.sizeBytes <= 0) throw new Error('sizeBytes must be greater than 0.');

  return {
    workerId: body.workerId.trim(),
    fileName: body.fileName.trim(),
    contentType: typeof body.contentType === 'string' ? body.contentType : 'application/zip',
    sizeBytes: body.sizeBytes,
  };
}

export function validateUploadComplete(body: any): UploadCompleteInput {
  if (!body || typeof body !== 'object') throw new Error('Body must be a JSON object.');
  if (typeof body.workerId !== 'string' || !body.workerId.trim()) throw new Error('workerId is required.');
  if (typeof body.storagePath !== 'string' || !body.storagePath.trim()) throw new Error('storagePath is required.');
  if (typeof body.fileName !== 'string' || !body.fileName.trim()) throw new Error('fileName is required.');
  if (typeof body.checksum !== 'string' || !body.checksum.trim()) throw new Error('checksum is required.');
  if (typeof body.sizeBytes !== 'number' || body.sizeBytes <= 0) throw new Error('sizeBytes must be greater than 0.');

  return {
    workerId: body.workerId.trim(),
    storagePath: body.storagePath.trim(),
    fileName: body.fileName.trim(),
    checksum: body.checksum.trim(),
    artifactType: typeof body.artifactType === 'string' ? body.artifactType : 'apk_zip',
    contentType: typeof body.contentType === 'string' ? body.contentType : 'application/zip',
    sizeBytes: body.sizeBytes,
    metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
  };
}

export function validateSucceedJob(body: any): SucceedJobInput {
  if (!body || typeof body !== 'object') throw new Error('Body must be a JSON object.');
  if (typeof body.workerId !== 'string' || !body.workerId.trim()) throw new Error('workerId is required.');
  if (!body.result || typeof body.result !== 'object') throw new Error('result object is required.');

  return {
    workerId: body.workerId.trim(),
    result: body.result,
  };
}

export function validateFailJob(body: any): FailJobInput {
  if (!body || typeof body !== 'object') throw new Error('Body must be a JSON object.');
  if (typeof body.workerId !== 'string' || !body.workerId.trim()) throw new Error('workerId is required.');
  if (typeof body.errorMessage !== 'string' || !body.errorMessage.trim()) throw new Error('errorMessage is required.');

  return {
    workerId: body.workerId.trim(),
    errorMessage: body.errorMessage.trim(),
    canRetry: typeof body.canRetry === 'boolean' ? body.canRetry : true,
  };
}
