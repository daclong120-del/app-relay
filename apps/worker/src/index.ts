import 'dotenv/config';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { RelayApiClient } from './relay-api/client.js';
import { scrapePlayStoreListing } from './pipeline/scraper.js';
import { isDeviceReady, wakeAndUnlockDevice } from './android/adb.js';
import { ensureAppInstalled } from './pipeline/installer.js';
import { pullApkAndMetadata, validateZipArchive } from './pipeline/puller.js';

const WORKER_ID = process.env.WORKER_ID || 'worker_vps_01';
const WORKER_NAME = process.env.WORKER_NAME || 'VPS Worker 01';
const RELAY_API_URL = process.env.RELAY_API_URL || 'http://localhost:5500/internal/v1';
const WORKER_TOKEN = process.env.WORKER_TOKEN;
if (!WORKER_TOKEN) {
  throw new Error('WORKER_TOKEN environment variable is required');
}
const WORK_DIR = process.env.WORK_DIR || path.join(process.cwd(), 'work', 'apks');

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '5000', 10);
const HEARTBEAT_INTERVAL_MS = parseInt(process.env.HEARTBEAT_INTERVAL_MS || '20000', 10);

const client = new RelayApiClient(RELAY_API_URL, WORKER_TOKEN, WORKER_ID);

async function cleanWorkDirOnStartup() {
  try {
    if (existsSync(WORK_DIR)) {
      const entries = await fs.readdir(WORK_DIR, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(WORK_DIR, entry.name);
        await fs.rm(fullPath, { recursive: true, force: true }).catch(() => {});
      }
      console.log(`[Worker] Cleaned up stale items in WORK_DIR: ${WORK_DIR}`);
    } else {
      await fs.mkdir(WORK_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn(`[Worker] Initial WORK_DIR cleanup warning: ${err}`);
  }
}

let isShuttingDown = false;

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Worker] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Worker] Uncaught Exception:', err);
});

function setupGracefulShutdown() {
  const shutdownHandler = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[Worker] Received ${signal}. Gracefully shutting down worker...`);
    setTimeout(() => {
      console.log('[Worker] Force shutting down after timeout.');
      process.exit(0);
    }, 10000).unref();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdownHandler('SIGINT'));
  process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
}

async function startHeartbeatLoop() {
  while (!isShuttingDown) {
    try {
      const emulatorReady = await isDeviceReady();
      await client.sendHeartbeat({
        workerId: WORKER_ID,
        name: WORKER_NAME,
        version: '1.0.0',
        capabilities: {
          avd: process.env.ANDROID_AVD || 'chpay',
          maxConcurrentJobs: 1,
        },
        stats: {
          emulatorReady,
        },
      });
    } catch (err) {
      console.warn(`[Worker] Heartbeat error: ${err}`);
    }
    await new Promise((resolve) => setTimeout(resolve, HEARTBEAT_INTERVAL_MS));
  }
}

class JobHeartbeatController {
  private timer: NodeJS.Timeout | null = null;
  private currentProgress = 0;
  private currentStep = 'claiming';
  private cancelRequested = false;

  constructor(
    private client: RelayApiClient,
    private jobId: string,
    private workerId: string,
    private intervalMs: number = 20000
  ) {}

  start() {
    this.timer = setInterval(async () => {
      try {
        const res = await this.client.sendJobHeartbeat(
          this.jobId,
          this.workerId,
          this.currentProgress,
          this.currentStep
        );
        if (res?.cancelRequested) {
          this.cancelRequested = true;
        }
      } catch (err) {
        console.warn(`[Worker] Job heartbeat background error for ${this.jobId}: ${err}`);
      }
    }, this.intervalMs);
  }

  async update(progress: number, step: string) {
    this.currentProgress = progress;
    this.currentStep = step;
    try {
      const res = await this.client.sendJobHeartbeat(
        this.jobId,
        this.workerId,
        progress,
        step
      );
      if (res?.cancelRequested) {
        this.cancelRequested = true;
      }
    } catch (err) {
      console.warn(`[Worker] Immediate job heartbeat error for ${this.jobId}: ${err}`);
    }
  }

  isCancelRequested(): boolean {
    return this.cancelRequested;
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

async function processJob(job: any) {
  const { jobId, packageId, playUrl, includeListing, includeScreenshots } = job;
  console.log(`\n============================================================`);
  console.log(`[Worker] STARTING JOB: ${jobId} (Package: ${packageId})`);
  console.log(`============================================================`);

  const pkgWorkDir = path.join(WORK_DIR, packageId);
  await fs.mkdir(pkgWorkDir, { recursive: true });

  const heartbeatCtrl = new JobHeartbeatController(client, jobId, WORKER_ID, HEARTBEAT_INTERVAL_MS);
  heartbeatCtrl.start();

  let scrapeRes: import('./pipeline/scraper.js').ScrapeResult | undefined;

  try {
    // Step 1: Claiming
    await heartbeatCtrl.update(5, 'claiming');
    await client.recordEvent(jobId, 'job.claimed', `Job claimed by worker ${WORKER_ID}`);

    // Step 2: Scrape listing
    if (includeListing) {
      await heartbeatCtrl.update(15, 'scraping_listing');
      await client.recordEvent(jobId, 'listing.scraping', 'Scraping Play Store listing metadata');
      scrapeRes = await scrapePlayStoreListing(playUrl, pkgWorkDir, { includeScreenshots });
      await client.recordEvent(jobId, 'listing.scraped', `Scraped metadata for ${scrapeRes.title}`, {
        title: scrapeRes.title,
        developer: scrapeRes.developer,
        screenshotCount: scrapeRes.screenshotUrls.length,
      });
    }

    if (heartbeatCtrl.isCancelRequested()) {
      throw new Error('Job cancellation requested by server');
    }

    // Step 3: Booting / Checking emulator
    await heartbeatCtrl.update(25, 'booting_emulator');
    if (!(await isDeviceReady())) {
      throw new Error('No ADB device available on worker. Ensure Android Emulator is running.');
    }
    await wakeAndUnlockDevice();

    if (heartbeatCtrl.isCancelRequested()) {
      throw new Error('Job cancellation requested by server');
    }

    // Step 4: Opening Play Store
    await heartbeatCtrl.update(35, 'opening_play_store');
    await client.recordEvent(jobId, 'play.opening', `Opening Play Store for package ${packageId}`);

    // Step 5: Installing app from Play Store
    await heartbeatCtrl.update(45, 'installing');
    await client.recordEvent(jobId, 'play.installing', 'Verifying/Installing app via Play Store');
    const installedPaths = await ensureAppInstalled(packageId, pkgWorkDir);

    if (heartbeatCtrl.isCancelRequested()) {
      throw new Error('Job cancellation requested by server');
    }

    // Step 6: Pulling APKs
    await heartbeatCtrl.update(60, 'pulling_apk');
    await client.recordEvent(jobId, 'apk.pulling', 'Pulling base APK and split APKs');
    const pullRes = await pullApkAndMetadata(packageId, playUrl, installedPaths, pkgWorkDir);

    // Step 7: Creating manifest
    await heartbeatCtrl.update(70, 'creating_manifest');
    await client.recordEvent(jobId, 'manifest.created', 'Generated PULL_MANIFEST.txt and package info listing');

    // Step 8: Validating
    await heartbeatCtrl.update(80, 'validating');
    await validateZipArchive(pullRes.baseApkPath);
    await client.recordEvent(jobId, 'apk.validated', `Validated base.apk ZIP archive and AndroidManifest.xml`);
    await client.recordEvent(jobId, 'apk.pulled', `Pulled base APK and ${pullRes.splitCount} splits`, {
      baseApkSizeBytes: pullRes.baseApkSizeBytes,
      splitCount: pullRes.splitCount,
      versionName: pullRes.versionName,
      versionCode: pullRes.versionCode,
    });

    if (heartbeatCtrl.isCancelRequested()) {
      throw new Error('Job cancellation requested by server');
    }

    // Step 9: Uploading artifact directory
    //
    // Không nén nữa. API lưu nguyên thư mục nên client lấy được từng file mà
    // không phải giải nén ngược, và xoá riêng APK chỉ là một lệnh rm.
    // Xem new_setup/artifact_storage.md.
    await heartbeatCtrl.update(90, 'uploading_artifact');
    await client.recordEvent(jobId, 'artifact.uploading', 'Uploading artifact directory to API server');

    const uploadRes = await client.uploadArtifactDir(jobId, pkgWorkDir, packageId, (done, total, relPath) => {
      if (done === total || done % 5 === 0) {
        console.log(`[Upload] ${done}/${total} — ${relPath}`);
      }
    });

    await client.recordEvent(jobId, 'artifact.ready', 'Artifact directory uploaded and finalized', {
      fileCount: uploadRes.fileCount,
      totalBytes: uploadRes.totalBytes,
    });

    if (heartbeatCtrl.isCancelRequested()) {
      throw new Error('Job cancellation requested by server');
    }

    // Complete Job
    await client.completeJob(jobId, WORKER_ID, {
      versionName: pullRes.versionName,
      versionCode: pullRes.versionCode,
      splitCount: pullRes.splitCount,
      screenshotCount: scrapeRes ? scrapeRes.screenshotUrls.length : 0,
      baseApkSizeBytes: pullRes.baseApkSizeBytes,
      ...(scrapeRes ? {
        title: scrapeRes.title,
        developer: scrapeRes.developer,
        rating: scrapeRes.rating,
        installsText: scrapeRes.installs,
        description: scrapeRes.description,
        listingMetadata: {
          iconUrl: scrapeRes.iconUrl,
          screenshotUrls: scrapeRes.screenshotUrls,
          scrapedAt: new Date().toISOString(),
        },
      } : {}),
    });

    console.log(`[Worker] SUCCESS! Job ${jobId} completed.\n`);
  } catch (err: any) {
    const isCancelled = heartbeatCtrl.isCancelRequested() || err.message?.toLowerCase().includes('cancellation') || err.message?.toLowerCase().includes('cancel');
    if (isCancelled) {
      console.log(`[Worker] JOB CANCELLED: ${jobId} - ${err.message}`);
      try {
        await client.confirmCancelled(jobId, WORKER_ID, err.message || 'Job cancelled by user request');
      } catch (confirmErr) {
        console.error(`[Worker] Failed to confirm job cancellation for ${jobId}: ${confirmErr}`);
      }
    } else {
      console.error(`[Worker] JOB FAILED: ${jobId} - ${err.message}`);
      await client.failJob(jobId, WORKER_ID, {
        code: 'PIPELINE_ERROR',
        message: err.message || 'Unknown worker pipeline error',
        retryable: true,
      });
    }
  } finally {
    heartbeatCtrl.stop();
    try {
      if (existsSync(pkgWorkDir)) {
        await fs.rm(pkgWorkDir, { recursive: true, force: true }).catch(() => {});
      }
    } catch (cleanupErr) {
      console.warn(`[Worker] Cleanup warning for ${jobId}: ${cleanupErr}`);
    }
  }
}

async function startWorkerLoop() {
  console.log(`🚀 App Relay Worker (${WORKER_ID}) started.`);
  console.log(`📡 Connecting to Relay API: ${RELAY_API_URL}`);

  setupGracefulShutdown();
  await cleanWorkDirOnStartup();
  startHeartbeatLoop();

  let consecutiveErrors = 0;

  while (!isShuttingDown) {
    try {
      const job = await client.claimJob(WORKER_ID);
      consecutiveErrors = 0;
      if (job) {
        await processJob(job);
      }
    } catch (err) {
      consecutiveErrors++;
      const backoffMs = Math.min(POLL_INTERVAL_MS * Math.pow(2, consecutiveErrors - 1), 60000);
      console.warn(`[Worker] Claim loop error (attempt ${consecutiveErrors}): ${err}. Retrying in ${Math.round(backoffMs / 1000)}s`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      continue;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

startWorkerLoop();
