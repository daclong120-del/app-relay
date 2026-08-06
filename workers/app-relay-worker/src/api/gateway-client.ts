// Gateway API HTTP Client for AppRelay Worker

import { WorkerConfig } from '../config/env';

export class GatewayClient {
  constructor(private config: WorkerConfig) {}

  private async request<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const url = `${this.config.gatewayUrl}/${path.replace(/^\//, '')}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.workerToken}`,
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (err: any) {
      throw new Error(`Gateway HTTP request connection failed: ${err.message}`);
    }

    const data: any = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = data?.error?.message || `Gateway returned HTTP status ${response.status}`;
      throw new Error(errorMsg);
    }

    return data as T;
  }

  async registerWorker(metadata?: Record<string, unknown>): Promise<{ worker: any }> {
    return this.request<{ worker: any }>('workers/register', {
      workerId: this.config.workerId,
      workerName: this.config.workerName,
      maxParallelJobs: this.config.maxParallelJobs,
      metadata: {
        version: this.config.workerVersion,
        capability: this.config.capability,
        adbDeviceSerial: this.config.adbDeviceSerial,
        ...metadata,
      },
    });
  }

  async sendWorkerHeartbeat(workerId: string, status = 'active', metadata?: Record<string, unknown>): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>('workers/heartbeat', {
      workerId,
      status,
      metadata,
    });
  }

  async claimJob(workerId: string, capabilities?: string[], leaseSeconds = 300): Promise<{ job: any | null; pollAfterMs: number }> {
    return this.request<{ job: any | null; pollAfterMs: number }>('jobs/claim', {
      workerId,
      capabilities: capabilities || [this.config.capability, 'pull_apk'],
      leaseSeconds,
    });
  }

  async startJob(jobId: string, workerId: string): Promise<{ started: boolean }> {
    return this.request<{ started: boolean }>(`jobs/${jobId}/start`, {
      workerId,
    });
  }

  async sendJobHeartbeat(jobId: string, workerId: string, leaseSeconds = 300): Promise<{ renewed: boolean; isCancelled: boolean }> {
    return this.request<{ renewed: boolean; isCancelled: boolean }>(`jobs/${jobId}/heartbeat`, {
      workerId,
      leaseSeconds,
    });
  }

  async appendJobEvent(
    jobId: string,
    workerId: string,
    stage: string,
    message: string,
    level: 'info' | 'warn' | 'error' = 'info',
    progress = 0,
    metadata?: Record<string, unknown>
  ): Promise<{ recorded: boolean }> {
    return this.request<{ recorded: boolean }>(`jobs/${jobId}/events`, {
      workerId,
      stage,
      message,
      level,
      progress,
      metadata,
    });
  }

  async uploadInit(
    jobId: string,
    workerId: string,
    fileName: string,
    sizeBytes: number,
    contentType = 'application/zip'
  ): Promise<{ uploadUrl: string; storagePath: string; expiresAt: string }> {
    return this.request<{ uploadUrl: string; storagePath: string; expiresAt: string }>(`jobs/${jobId}/artifacts/upload-init`, {
      workerId,
      fileName,
      sizeBytes,
      contentType,
    });
  }

  async uploadComplete(
    jobId: string,
    workerId: string,
    storagePath: string,
    fileName: string,
    checksum: string,
    sizeBytes: number,
    artifactType = 'apk_zip',
    contentType = 'application/zip',
    metadata?: Record<string, unknown>
  ): Promise<{ artifactId: string; artifact: any }> {
    return this.request<{ artifactId: string; artifact: any }>(`jobs/${jobId}/artifacts/upload-complete`, {
      workerId,
      storagePath,
      fileName,
      checksum,
      sizeBytes,
      artifactType,
      contentType,
      metadata,
    });
  }

  async succeedJob(jobId: string, workerId: string, result: Record<string, unknown>): Promise<{ succeeded: boolean }> {
    return this.request<{ succeeded: boolean }>(`jobs/${jobId}/succeed`, {
      workerId,
      result,
    });
  }

  async failJob(jobId: string, workerId: string, errorMessage: string, canRetry = true): Promise<{ failed: boolean }> {
    return this.request<{ failed: boolean }>(`jobs/${jobId}/fail`, {
      workerId,
      errorMessage,
      canRetry,
    });
  }
}
