import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { pipeline } from 'stream/promises';

/** Mọi file trong `dir`, đường dẫn tương đối dùng `/`, bỏ qua dotfile. */
async function walkFiles(dir: string, prefix = ''): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      out.push(...(await walkFiles(path.join(dir, entry.name), rel)));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out.sort();
}

/** Băm theo luồng để file vài trăm MB không phải nằm trong bộ nhớ. */
async function sha256OfFile(absPath: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(fs.createReadStream(absPath), hash);
  return hash.digest('hex');
}

export class RelayApiClient {
  private baseUrl: string;
  private token: string;
  private workerId: string;

  constructor(baseUrl: string, token: string, workerId = 'unknown') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
    this.workerId = workerId;
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

  /**
   * Gửi một file của artifact, giữ nguyên đường dẫn tương đối.
   *
   * SHA-256 tính trước khi gửi để API đối chiếu — file 70MB đi qua mạng nội bộ
   * vẫn có thể hỏng, mà hỏng thì phải biết ngay chứ không phải lúc client tải.
   */
  async uploadFile(jobId: string, absPath: string, relPath: string) {
    const stat = await fs.promises.stat(absPath);
    const sha256 = await sha256OfFile(absPath);

    const res = await fetch(`${this.baseUrl}/jobs/${jobId}/files/${encodeURI(relPath)}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(stat.size),
        'X-Content-SHA256': sha256,
      },
      body: fs.createReadStream(absPath) as any,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Upload '${relPath}' thất bại: ${res.status} ${res.statusText} ${detail}`.trim());
    }

    return { relPath, sizeBytes: stat.size, sha256 };
  }

  /**
   * Gửi cả thư mục artifact rồi chốt lại.
   *
   * Worker không nén nữa: API lưu nguyên thư mục nên client lấy được từng file
   * mà không phải giải nén. Xem new_setup/artifact_storage.md.
   */
  async uploadArtifactDir(
    jobId: string,
    dir: string,
    fileName: string,
    onProgress?: (done: number, total: number, relPath: string) => void
  ) {
    const files = await walkFiles(dir);
    if (files.length === 0) {
      throw new Error(`Thư mục artifact rỗng: ${dir}`);
    }

    let totalBytes = 0;
    let done = 0;
    for (const rel of files) {
      const uploaded = await this.uploadFile(jobId, path.join(dir, rel), rel);
      totalBytes += uploaded.sizeBytes;
      done++;
      onProgress?.(done, files.length, rel);
    }

    const res = await fetch(`${this.baseUrl}/jobs/${jobId}/artifact/finalize`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ workerId: this.workerId, fileName, fileCount: files.length }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Finalize artifact thất bại: ${res.status} ${res.statusText} ${detail}`.trim());
    }

    return { fileCount: files.length, totalBytes };
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
