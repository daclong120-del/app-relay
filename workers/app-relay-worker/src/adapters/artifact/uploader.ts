// Gateway Artifact Direct Storage Upload Coordinator

import { createReadStream, promises as fs } from 'fs';
import { GatewayClient } from '../../api/gateway-client';

export interface UploadArtifactOptions {
  jobId: string;
  workerId: string;
  archivePath: string;
  fileName: string;
  checksum: string;
  sizeBytes: number;
  client: GatewayClient;
  metadata?: Record<string, unknown>;
}

export async function uploadArtifactToStorage(
  options: UploadArtifactOptions
): Promise<{ artifactId: string; storagePath: string }> {
  // 1. Upload Init
  const initRes = await options.client.uploadInit(
    options.jobId,
    options.workerId,
    options.fileName,
    options.sizeBytes
  );

  // 2. Direct Storage HTTP Upload to signed upload URL
  const fileBuffer = await fs.readFile(options.archivePath);
  let uploadResponse: Response;

  try {
    uploadResponse = await fetch(initRes.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': String(options.sizeBytes),
      },
      body: fileBuffer,
    });
  } catch (err: any) {
    throw new Error(`STORAGE_UPLOAD_FAILED: Direct storage upload network failed: ${err.message}`);
  }

  // A failed upload is always an error. The previous exemption for URLs
  // containing 'mock-token' meant a misconfigured storage backend produced a
  // job that reported success with no artifact behind it.
  if (!uploadResponse.ok) {
    throw new Error(`STORAGE_UPLOAD_FAILED: Storage upload returned status ${uploadResponse.status}`);
  }

  // 3. Upload Complete
  const completeRes = await options.client.uploadComplete(
    options.jobId,
    options.workerId,
    initRes.storagePath,
    options.fileName,
    options.checksum,
    options.sizeBytes,
    'apk_zip',
    'application/zip',
    options.metadata
  );

  return {
    artifactId: completeRes.artifactId,
    storagePath: initRes.storagePath,
  };
}
