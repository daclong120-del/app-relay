// Artifact Integrity & APK Validation Module

import { createHash } from 'crypto';
import { createReadStream, promises as fs } from 'fs';

export interface ApkValidationInfo {
  filePath: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
}

export interface ArtifactValidationResult {
  baseApk: ApkValidationInfo;
  splitApks: ApkValidationInfo[];
  allApks: ApkValidationInfo[];
  totalSizeBytes: number;
}

export async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) => reject(err));
  });
}

export async function validateApkFiles(
  baseApkPath: string,
  splitApkPaths: string[] = []
): Promise<ArtifactValidationResult> {
  // 1. Check Base APK File
  const baseStat = await fs.stat(baseApkPath).catch(() => {
    throw new Error(`APK_VALIDATION_FAILED: Base APK not found at ${baseApkPath}`);
  });

  if (baseStat.size === 0) {
    throw new Error(`APK_VALIDATION_FAILED: Base APK file is empty (0 bytes).`);
  }

  // 2. Validate ZIP Header Magic Bytes on Base APK ([0x50, 0x4B, 0x03, 0x04])
  const handle = await fs.open(baseApkPath, 'r');
  const buffer = Buffer.alloc(4);
  await handle.read(buffer, 0, 4, 0);
  await handle.close();

  if (
    buffer[0] !== 0x50 ||
    buffer[1] !== 0x4b ||
    (buffer[2] !== 0x03 && buffer[2] !== 0x05 && buffer[2] !== 0x07)
  ) {
    throw new Error(`APK_VALIDATION_FAILED: Base APK file has invalid ZIP header.`);
  }

  const baseSha256 = await computeFileSha256(baseApkPath);
  const baseInfo: ApkValidationInfo = {
    filePath: baseApkPath,
    fileName: 'base.apk',
    sizeBytes: baseStat.size,
    sha256: baseSha256,
  };

  // 3. Check Split APK Files
  const splitInfos: ApkValidationInfo[] = [];
  for (const splitPath of splitApkPaths) {
    const stat = await fs.stat(splitPath).catch(() => {
      throw new Error(`APK_VALIDATION_FAILED: Split APK not found at ${splitPath}`);
    });
    if (stat.size === 0) {
      throw new Error(`APK_VALIDATION_FAILED: Split APK file ${splitPath} is empty (0 bytes).`);
    }
    const sha256 = await computeFileSha256(splitPath);
    splitInfos.push({
      filePath: splitPath,
      fileName: splitPath.split(/[/\\]/).pop() || 'split.apk',
      sizeBytes: stat.size,
      sha256,
    });
  }

  const allApks = [baseInfo, ...splitInfos];
  const totalSizeBytes = allApks.reduce((acc, curr) => acc + curr.sizeBytes, 0);

  return {
    baseApk: baseInfo,
    splitApks: splitInfos,
    allApks,
    totalSizeBytes,
  };
}
