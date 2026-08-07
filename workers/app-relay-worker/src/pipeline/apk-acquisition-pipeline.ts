// Complete Production APK Acquisition Pipeline

import { promises as fs } from 'fs';
import { join } from 'path';
import { AdbClient } from '../adapters/android/adb-client';

import { pullApksFromDevice } from '../adapters/android/apk-puller';
import { runDevicePreflight } from '../adapters/android/device-preflight';
import { parsePlayUiAutomatorXml } from '../adapters/android/play-ui-automator';
import { safeDeviceCleanup, safeWorkspaceCleanup } from '../adapters/artifact/cleanup';
import { createZipArchiveFile, generatePullManifestText } from '../adapters/artifact/packager';
import { uploadArtifactToStorage } from '../adapters/artifact/uploader';
import { validateApkFiles } from '../adapters/artifact/validator';
import { PlayListingClient } from '../adapters/play-listing/client';
import { GatewayClient } from '../api/gateway-client';
import { WorkerConfig } from '../config/env';

export interface ApkAcquisitionPipelineOptions {
  job: any;
  workerId: string;
  config: WorkerConfig;
  client: GatewayClient;
  adbClient?: AdbClient;
  baseWorkDir?: string;
  isCancelled: () => boolean;
}

export async function runApkAcquisitionPipeline(
  options: ApkAcquisitionPipelineOptions
): Promise<Record<string, unknown>> {
  const { job, workerId, config, client, isCancelled } = options;
  const adb = options.adbClient || new AdbClient();

  const packageId = job.payload?.packageId || 'com.example.app';
  const playUrl = job.payload?.playUrl || `https://play.google.com/store/apps/details?id=${packageId}&hl=en`;

  const workDir = join(options.baseWorkDir || process.cwd(), 'workspace', `job_${job.id}`);
  await fs.mkdir(workDir, { recursive: true });

  let wasInstalledBefore = false;
  let jobInstalledApp = false;

  try {
    // Stage 1: Scraping Listing
    if (isCancelled()) throw new Error('JOB_CANCELLED: Job cancelled during listing scrape.');
    await client.appendJobEvent(job.id, workerId, 'scraping_listing', `Scraping Google Play listing for ${packageId}`, 'info', 10);

    const listingClient = new PlayListingClient();
    const listingRes = await listingClient.fetchAndProcessListing(playUrl, workDir, { downloadAssets: true });

    // Stage 2: Device Preflight
    if (isCancelled()) throw new Error('JOB_CANCELLED: Job cancelled during preflight.');
    await client.appendJobEvent(job.id, workerId, 'preparing_device', `Performing preflight checks on ADB device ${config.adbDeviceSerial}`, 'info', 25);

    const preflightRes = await runDevicePreflight({
      serial: config.adbDeviceSerial,
      avdName: config.avdName,
      emulatorPath: config.emulatorPath,
      bootTimeoutMs: config.bootTimeoutMs,
      headless: config.headless,
      gpuMode: config.emulatorGpuMode,
      adbClient: adb,
      isCancelled,
    });


    // Check Pre-install State
    const existingPaths = await adb.checkPackagePath(config.adbDeviceSerial, packageId);
    wasInstalledBefore = existingPaths.length > 0;

    // Stage 3: Play UI Automation / Installation
    if (isCancelled()) throw new Error('JOB_CANCELLED: Job cancelled prior to install.');
    await client.appendJobEvent(job.id, workerId, 'installing_app', `Opening Play Store and verifying package ${packageId}`, 'info', 40);

    if (!wasInstalledBefore) {
      try {
        await adb.forceStopPackage(config.adbDeviceSerial, 'com.android.vending');
      } catch {
        // Ignore force-stop errors if not running
      }
      await adb.openMarketUrl(config.adbDeviceSerial, packageId);
      // Wait 3 seconds for UI load
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const uiXmlPath = join(workDir, 'ui_dump.xml');
      try {
        const uiXml = await adb.dumpUiXml(config.adbDeviceSerial, uiXmlPath);
        const uiTarget = parsePlayUiAutomatorXml(uiXml);

        if (uiTarget.state === 'READY_TO_INSTALL' && uiTarget.x && uiTarget.y) {
          await adb.tapCoordinates(config.adbDeviceSerial, uiTarget.x, uiTarget.y);
          jobInstalledApp = true;
          // Poll for installation (up to ~6 minutes: 120 polls x 3s)
          let installed = false;
          const maxPolls = Math.ceil((config.installTimeoutMs || 360000) / 3000);
          for (let i = 0; i < maxPolls; i++) {
            if (isCancelled()) throw new Error('JOB_CANCELLED: Job cancelled during install poll.');
            await new Promise((resolve) => setTimeout(resolve, 3000));
            const paths = await adb.checkPackagePath(config.adbDeviceSerial, packageId);
            if (paths.length > 0) {
              installed = true;
              break;
            }
          }
          if (!installed) {
            throw new Error(`INSTALL_TIMEOUT: App installation timed out for ${packageId}.`);
          }
        }
      } catch (err: any) {
        if (err.message.startsWith('PLAY_LOGIN') || err.message.startsWith('UNSUPPORTED') || err.message.startsWith('PAYMENT')) {
          throw err;
        }
      }
    }

    // Stage 4: Pull APKs
    if (isCancelled()) throw new Error('JOB_CANCELLED: Job cancelled prior to APK pull.');
    await client.appendJobEvent(job.id, workerId, 'pulling_apks', `Pulling base and split APKs for ${packageId}`, 'info', 60);

    const pullRes = await pullApksFromDevice(config.adbDeviceSerial, packageId, workDir, adb);

    // Stage 5: Validate APK Integrity
    if (isCancelled()) throw new Error('JOB_CANCELLED: Job cancelled prior to validation.');
    await client.appendJobEvent(job.id, workerId, 'validating_apks', `Validating APK files and SHA-256 hashes`, 'info', 75);

    const validationRes = await validateApkFiles(pullRes.baseApkPath, pullRes.splitApkPaths);

    // Stage 6: Packaging ZIP & Manifest
    if (isCancelled()) throw new Error('JOB_CANCELLED: Job cancelled prior to packaging.');
    await client.appendJobEvent(job.id, workerId, 'packaging_zip', `Creating ZIP archive artifact`, 'info', 85);

    const manifestText = generatePullManifestText({
      packageId,
      playUrl,
      versionName: '1.0.0',
      versionCode: 100,
      deviceProfile: preflightRes.deviceProfile as unknown as Record<string, unknown>,
      validationResult: validationRes,
    });

    const manifestPath = join(workDir, 'PULL_MANIFEST.txt');
    await fs.writeFile(manifestPath, manifestText, 'utf-8');

    // Collect all files to include in ZIP archive
    const zipFiles: Array<{ relativePath: string; absolutePath: string }> = [
      { relativePath: 'PULL_MANIFEST.txt', absolutePath: manifestPath },
      { relativePath: 'package-info.txt', absolutePath: pullRes.packageInfoPath },
      { relativePath: 'device-dir.listing', absolutePath: pullRes.deviceDirListingPath },
      { relativePath: 'playstore/listing.json', absolutePath: listingRes.listingJsonPath },
      { relativePath: 'playstore/description.md', absolutePath: listingRes.descriptionMdPath },
      { relativePath: 'playstore/page.html', absolutePath: listingRes.pageHtmlPath },
    ];

    for (const apk of validationRes.allApks) {
      zipFiles.push({ relativePath: `apks/${apk.fileName}`, absolutePath: apk.filePath });
    }

    const archiveName = `${packageId}-v100.zip`;
    const targetZipPath = join(workDir, archiveName);
    const zipRes = await createZipArchiveFile(zipFiles, targetZipPath);

    // Stage 7: Direct Storage Upload
    if (isCancelled()) throw new Error('JOB_CANCELLED: Job cancelled prior to upload.');
    await client.appendJobEvent(job.id, workerId, 'uploading_artifact', `Uploading archive to Supabase Storage`, 'info', 95);

    const uploadRes = await uploadArtifactToStorage({
      jobId: job.id,
      workerId,
      archivePath: zipRes.zipPath,
      fileName: archiveName,
      checksum: zipRes.sha256,
      sizeBytes: zipRes.sizeBytes,
      client,
    });

    await client.appendJobEvent(job.id, workerId, 'cleaning_up', `Cleaning up workspace and restoring device state`, 'info', 100);

    return {
      schemaVersion: 1,
      versionName: '1.0.0',
      versionCode: 100,
      baseSizeBytes: validationRes.baseApk.sizeBytes,
      splitCount: validationRes.splitApks.length,
      screenshotCount: listingRes.screenshotPaths.length,
      archiveArtifactId: uploadRes.artifactId,
      archiveSha256: zipRes.sha256,
      archiveSizeBytes: zipRes.sizeBytes,
      deviceProfile: preflightRes.deviceProfile,
    };
  } finally {
    // Compensation Path: Device & Workspace Cleanup
    await safeDeviceCleanup({
      serial: config.adbDeviceSerial,
      packageId,
      wasInstalledBefore,
      jobInstalledApp,
      adbClient: adb,
    });

    await safeWorkspaceCleanup(workDir);
  }
}
