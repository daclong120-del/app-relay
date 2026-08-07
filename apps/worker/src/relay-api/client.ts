import fetch from 'node-fetch';
import fs from 'fs';

export class RelayApiClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
  }

  private get headers() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  async sendHeartbeat(data: {
    workerId: string;
    name?: string;
    version?: string;
    capabilities?: Record<string, unknown>;
    stats?: Record<string, unknown>;
  }) {
    const res = await fetch(`${this.baseUrl}/workers/heartbeat`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Worker heartbeat failed: ${res.statusText}`);
    }
  }

  async claimJob(workerId: string) {
    const res = await fetch(`${this.baseUrl}/jobs/claim`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ workerId }),
    });

    if (res.status === 204) {
      return null;
    }

    if (!res.ok) {
      throw new Error(`Claim job failed: ${res.statusText}`);
    }

    const body = (await res.json()) as any;
    return body.data;
  }

  async sendJobHeartbeat(jobId: string, workerId: string, progress: number, currentStep?: string) {
    const res = await fetch(`${this.baseUrl}/jobs/${jobId}/heartbeat`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ workerId, progress, currentStep }),
    });

    if (!res.ok) {
      throw new Error(`Job heartbeat failed: ${res.statusText}`);
    }

    const body = (await res.json()) as any;
    return body.data; // { leaseExpiresAt, cancelRequested }
  }

  async recordEvent(jobId: string, eventType: string, message: string, data: Record<string, unknown> = {}, level = 'info') {
    await fetch(`${this.baseUrl}/jobs/${jobId}/events`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ eventType, level, message, data }),
    });
  }

  async uploadArtifact(jobId: string, zipFilePath: string, fileName: string, sha256?: string) {
    const stat = await fs.promises.stat(zipFilePath);
    const fileStream = fs.createReadStream(zipFilePath);
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/zip',
      'Content-Length': String(stat.size),
      'X-File-Name': fileName,
    };
    if (sha256) {
      headers['X-Content-SHA256'] = sha256;
    }

    const res = await fetch(`${this.baseUrl}/jobs/${jobId}/artifact`, {
      method: 'PUT',
      headers,
      body: fileStream as any,
    });

    if (!res.ok) {
      throw new Error(`Upload artifact failed: ${res.statusText}`);
    }
  }

  async completeJob(jobId: string, workerId: string, result: Record<string, unknown>) {
    const res = await fetch(`${this.baseUrl}/jobs/${jobId}/complete`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ workerId, result }),
    });

    if (!res.ok) {
      throw new Error(`Complete job failed: ${res.statusText}`);
    }
  }

  async failJob(jobId: string, workerId: string, error: { code: string; message: string; retryable?: boolean }) {
    await fetch(`${this.baseUrl}/jobs/${jobId}/fail`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ workerId, error }),
    });
  }

  async confirmCancelled(jobId: string, workerId: string, reason?: string) {
    const res = await fetch(`${this.baseUrl}/jobs/${jobId}/cancelled`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ workerId, reason }),
    });

    if (!res.ok) {
      throw new Error(`Confirm cancelled failed: ${res.statusText}`);
    }
  }
}
