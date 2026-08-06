// APK Split Extractor Component

import { promises as fs } from 'fs';
import { basename, join } from 'path';
import { AdbClient } from './adb-client';

export interface ApkExtractionResult {
  baseApkPath: string;
  splitApkPaths: string[];
  allApkPaths: string[];
  packageInfoPath: string;
  deviceDirListingPath: string;
}

export async function pullApksFromDevice(
  serial: string,
  packageId: string,
  targetDir: string,
  adbClient: AdbClient
): Promise<ApkExtractionResult> {
  const remotePaths = await adbClient.checkPackagePath(serial, packageId);

  if (remotePaths.length === 0) {
    throw new Error(`APK_PATHS_MISSING: No APK paths returned by "pm path ${packageId}". App might not be installed.`);
  }

  const apksDir = join(targetDir, 'apks');
  await fs.mkdir(apksDir, { recursive: true });

  const allLocalApkPaths: string[] = [];
  let baseApkPath = '';
  const splitApkPaths: string[] = [];

  for (let i = 0; i < remotePaths.length; i++) {
    const remotePath = remotePaths[i];
    const fileName = basename(remotePath) || (i === 0 ? 'base.apk' : `split_${i}.apk`);

    // Prevent path traversal
    const safeFileName = fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const localPath = join(apksDir, safeFileName);

    try {
      await adbClient.pullFile(serial, remotePath, localPath);
    } catch (err: any) {
      throw new Error(`APK_PULL_FAILED: Failed to pull remote APK ${remotePath}: ${err.message}`);
    }

    allLocalApkPaths.push(localPath);
    if (safeFileName === 'base.apk' || i === 0) {
      baseApkPath = localPath;
    } else {
      splitApkPaths.push(localPath);
    }
  }

  if (!baseApkPath) {
    baseApkPath = allLocalApkPaths[0];
  }

  // Write package-info.txt
  const packageInfoPath = join(targetDir, 'package-info.txt');
  try {
    const dumpsysText = await adbClient.dumpsysPackage(serial, packageId);
    await fs.writeFile(packageInfoPath, dumpsysText, 'utf-8');
  } catch {
    await fs.writeFile(packageInfoPath, `Package ID: ${packageId}\nExtracted At: ${new Date().toISOString()}\n`, 'utf-8');
  }

  // Write device-dir.listing
  const deviceDirListingPath = join(targetDir, 'device-dir.listing');
  const listingContent = remotePaths.map((p) => `package:${p}`).join('\n');
  await fs.writeFile(deviceDirListingPath, listingContent, 'utf-8');

  return {
    baseApkPath,
    splitApkPaths,
    allApkPaths: allLocalApkPaths,
    packageInfoPath,
    deviceDirListingPath,
  };
}
