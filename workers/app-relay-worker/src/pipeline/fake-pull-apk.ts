// Fake APK Acquisition Pipeline Simulator for Phase 5

import { GatewayClient } from '../api/gateway-client';

export interface FakePullApkContext {
  jobId: string;
  workerId: string;
  packageId: string;
  client: GatewayClient;
  isCancelled: () => boolean;
  stepDelayMs?: number;
}

export async function runFakePullApkPipeline(ctx: FakePullApkContext): Promise<{
  versionName: string;
  versionCode: number;
  baseSizeBytes: number;
  splitCount: number;
  screenshotCount: number;
  archiveArtifactId: string;
  archiveSha256: string;
  archiveSizeBytes: number;
}> {
  const delay = ctx.stepDelayMs || 500;

  const stages = [
    { stage: 'scraping_listing', message: `Scraping Google Play listing for ${ctx.packageId}`, progress: 10 },
    { stage: 'preparing_device', message: 'Checking ADB device preflight readiness', progress: 25 },
    { stage: 'installing_app', message: `Installing ${ctx.packageId} from Google Play`, progress: 40 },
    { stage: 'pulling_apks', message: 'Extracting base.apk and split APKs', progress: 60 },
    { stage: 'validating_apks', message: 'Validating APK integrity and manifest SHA-256', progress: 75 },
    { stage: 'packaging_zip', message: 'Creating ZIP archive artifact', progress: 85 },
  ];

  for (const item of stages) {
    if (ctx.isCancelled()) {
      throw new Error('JOB_CANCELLED: Pipeline halted because job was cancelled.');
    }

    await ctx.client.appendJobEvent(
      ctx.jobId,
      ctx.workerId,
      item.stage,
      item.message,
      'info',
      item.progress
    );

    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  if (ctx.isCancelled()) {
    throw new Error('JOB_CANCELLED: Pipeline halted because job was cancelled.');
  }

  // Simulate upload init & complete
  const fileName = `${ctx.packageId}-v100.zip`;
  const sizeBytes = 12500000;
  const checksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  await ctx.client.appendJobEvent(
    ctx.jobId,
    ctx.workerId,
    'uploading_artifact',
    'Uploading archive to private Supabase Storage',
    'info',
    95
  );

  const uploadInitRes = await ctx.client.uploadInit(ctx.jobId, ctx.workerId, fileName, sizeBytes);

  const uploadCompleteRes = await ctx.client.uploadComplete(
    ctx.jobId,
    ctx.workerId,
    uploadInitRes.storagePath,
    fileName,
    checksum,
    sizeBytes
  );

  await ctx.client.appendJobEvent(
    ctx.jobId,
    ctx.workerId,
    'cleaning_up',
    'Cleaning up device workspace and temporary files',
    'info',
    100
  );

  return {
    versionName: '1.0.0',
    versionCode: 100,
    baseSizeBytes: 8500000,
    splitCount: 3,
    screenshotCount: 4,
    archiveArtifactId: uploadCompleteRes.artifactId,
    archiveSha256: checksum,
    archiveSizeBytes: sizeBytes,
  };
}
