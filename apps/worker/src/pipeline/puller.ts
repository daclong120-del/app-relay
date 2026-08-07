import { execAdb } from '../android/adb.js';
import fs from 'fs/promises';
import fsSync from 'fs';
import { createHash } from 'crypto';
import path from 'path';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function sha256File(filePath: string): string {
  const content = fsSync.readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

export interface PullResult {
  baseApkPath: string;
  pulledApkPaths: string[];
  baseApkSizeBytes: number;
  splitCount: number;
  versionName?: string;
  versionCode?: number;
}

export async function pullApkAndMetadata(
  packageId: string,
  playUrl: string,
  paths: string[],
  pkgWorkDir: string
): Promise<PullResult> {
  if (!packageId || !/^[a-zA-Z0-9._]+$/.test(packageId)) {
    throw new Error(`Invalid packageId format: ${packageId}`);
  }
  await fs.mkdir(pkgWorkDir, { recursive: true });

  const pulledApks: string[] = [];
  let baseApkPath = '';

  for (const remotePath of paths) {
    const fileBase = path.basename(remotePath);
    const localName = fileBase;

    const localPath = path.join(pkgWorkDir, localName);
    console.log(`[Puller] Pulling ${fileBase} → ${localName}`);
    await execAdb(`pull "${remotePath}" "${localPath}"`, { timeout: 600000 });
    pulledApks.push(localPath);

    if (localName === 'base.apk') {
      baseApkPath = localPath;
    }
  }

  if (!baseApkPath) {
    throw new Error('base.apk missing in pulled APK list');
  }

  // Validate base.apk is a valid ZIP containing AndroidManifest.xml
  const baseBuffer = await fs.readFile(baseApkPath);
  if (baseBuffer.length < 4 || baseBuffer.readUInt32LE(0) !== 0x04034b50) {
    throw new Error(`Validation failed: ${baseApkPath} is not a valid ZIP file`);
  }
  if (!baseBuffer.includes(Buffer.from('AndroidManifest.xml'))) {
    throw new Error(`Validation failed: ${baseApkPath} does not contain AndroidManifest.xml`);
  }

  // Device dir listing
  const deviceDir = paths[0].substring(0, paths[0].lastIndexOf('/'));
  try {
    const deviceDirListing = await execAdb(`shell ls -la "${deviceDir}"`);
    await fs.writeFile(path.join(pkgWorkDir, 'device-dir.listing'), deviceDirListing, 'utf-8');
  } catch (err) {
    console.warn(`[Puller] Failed to write device-dir.listing: ${err}`);
  }

  // Package info (dumpsys package)
  let versionName: string | undefined;
  let versionCode: number | undefined;
  try {
    const pkgInfo = await execAdb(`shell dumpsys package ${packageId}`);
    await fs.writeFile(path.join(pkgWorkDir, 'package-info.txt'), pkgInfo, 'utf-8');

    const vnMatch = pkgInfo.match(/versionName=(.*)/);
    if (vnMatch) versionName = vnMatch[1].trim();

    const vcMatch = pkgInfo.match(/versionCode=(\d+)/);
    if (vcMatch) versionCode = parseInt(vcMatch[1], 10);
  } catch (err) {
    console.warn(`[Puller] Failed to get package dumpsys info: ${err}`);
  }

  // PULL_MANIFEST.txt
  const pulledAt = new Date().toISOString();
  const manifestLines = [
    `package=${packageId}`,
    `play_url=${playUrl}`,
    `pulled_at=${pulledAt}`,
    `splits:`,
  ];

  for (const apkPath of pulledApks) {
    const name = path.basename(apkPath);
    const stat = await fs.stat(apkPath);
    manifestLines.push(`  ${name} (${formatBytes(stat.size)})`);
  }

  manifestLines.push(`sha256:`);
  for (const apkPath of pulledApks) {
    const name = path.basename(apkPath);
    const hash = sha256File(apkPath);
    manifestLines.push(`  ${hash}  ${name}`);
  }

  await fs.writeFile(path.join(pkgWorkDir, 'PULL_MANIFEST.txt'), manifestLines.join('\n'), 'utf-8');

  const baseStat = await fs.stat(baseApkPath);

  return {
    baseApkPath,
    pulledApkPaths: pulledApks,
    baseApkSizeBytes: baseStat.size,
    splitCount: Math.max(0, pulledApks.length - 1),
    versionName,
    versionCode,
  };
}

export async function validateZipArchive(filePath: string): Promise<boolean> {
  const baseBuffer = await fs.readFile(filePath);
  if (baseBuffer.length < 22) {
    throw new Error(`Validation failed: ${filePath} is too small to be a ZIP file`);
  }
  if (baseBuffer.readUInt32LE(0) !== 0x04034b50) {
    throw new Error(`Validation failed: ${filePath} is not a valid ZIP file (missing Local Header magic)`);
  }
  // Check EOCD (End of Central Directory) signature in the last 65KB
  const searchStart = Math.max(0, baseBuffer.length - 65557);
  let hasEOCD = false;
  for (let i = baseBuffer.length - 22; i >= searchStart; i--) {
    if (baseBuffer.readUInt32LE(i) === 0x06054b50) {
      hasEOCD = true;
      break;
    }
  }
  if (!hasEOCD) {
    throw new Error(`Validation failed: ${filePath} is corrupted (missing End of Central Directory record)`);
  }
  if (!baseBuffer.includes(Buffer.from('AndroidManifest.xml'))) {
    throw new Error(`Validation failed: ${filePath} does not contain AndroidManifest.xml`);
  }
  return true;
}

