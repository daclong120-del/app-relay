// Worker Engine Lifecycle & Loop Coordinator

import { GatewayClient } from '../api/gateway-client';
import { WorkerConfig } from '../config/env';
import { DeviceSlotManager } from '../domain/slot-manager';
import { runFakePullApkPipeline } from '../pipeline/fake-pull-apk';

export class WorkerEngine {
  private client: GatewayClient;
  private slotManager: DeviceSlotManager;
  private workerId: string | null = null;
  private isRunning = false;
  private isShuttingDown = false;
  private workerHeartbeatTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(private config: WorkerConfig, customClient?: GatewayClient) {
    this.client = customClient || new GatewayClient(config);
    this.slotManager = new DeviceSlotManager(config.maxParallelJobs);
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log(`[WorkerEngine] Starting worker "${this.config.workerName}" (version ${this.config.workerVersion})`);

    // 1. Register with Worker Gateway
    try {
      const regRes = await this.client.registerWorker();
      this.workerId = regRes.worker.id;
      console.log(`[WorkerEngine] Registered successfully with Worker ID: ${this.workerId}`);
    } catch (err: any) {
      console.error(`[WorkerEngine] Initial registration failed: ${err.message}`);
      throw err;
    }

    // 2. Start Background Worker Heartbeat Loop
    this.startWorkerHeartbeatLoop();

    // 3. Start Job Polling Loop
    this.startJobPollingLoop();

    // 4. Setup Process Shutdown Signal Hooks
    this.setupShutdownHooks();
  }

  private startWorkerHeartbeatLoop(): void {
    this.workerHeartbeatTimer = setInterval(async () => {
      if (!this.workerId || this.isShuttingDown) return;
      try {
        await this.client.sendWorkerHeartbeat(this.workerId, 'active', {
          availableSlots: this.slotManager.getAvailableSlots(),
        });
      } catch (err: any) {
        console.warn(`[WorkerEngine] Worker heartbeat failed: ${err.message}`);
      }
    }, this.config.workerHeartbeatIntervalMs);
  }

  private startJobPollingLoop(): void {
    const poll = async () => {
      if (!this.isRunning || this.isShuttingDown) return;

      if (this.slotManager.hasAvailableSlot() && this.workerId) {
        try {
          // Add 0-1000ms jitter to polling interval
          const claimRes = await this.client.claimJob(this.workerId);

          if (claimRes.job) {
            console.log(`[WorkerEngine] Claimed job ${claimRes.job.id} (${claimRes.job.jobType})`);
            // Execute job asynchronously to keep loop responsive
            this.executeJob(claimRes.job).catch((err) => {
              console.error(`[WorkerEngine] Job execution error: ${err.message}`);
            });
          }
        } catch (err: any) {
          console.warn(`[WorkerEngine] Claim job poll failed: ${err.message}`);
        }
      }

      if (this.isRunning && !this.isShuttingDown) {
        const jitter = Math.floor(Math.random() * 1000);
        this.pollTimer = setTimeout(poll, this.config.pollIntervalMs + jitter);
      }
    };

    poll();
  }

  async executeJob(job: any): Promise<void> {
    if (!this.workerId) return;
    if (!this.slotManager.tryAcquireSlot(job.id)) {
      console.warn(`[WorkerEngine] Cannot execute job ${job.id}: No available device slot.`);
      return;
    }

    let isCancelled = false;
    let jobHeartbeatTimer: NodeJS.Timeout | null = null;

    try {
      // 1. Mark job started
      await this.client.startJob(job.id, this.workerId);

      // 2. Start Job Heartbeat & Cancellation Monitor Timer
      jobHeartbeatTimer = setInterval(async () => {
        if (!this.workerId) return;
        try {
          const res = await this.client.sendJobHeartbeat(job.id, this.workerId);
          if (res.isCancelled) {
            isCancelled = true;
            console.log(`[WorkerEngine] Job ${job.id} received cancellation signal.`);
          }
        } catch (err: any) {
          console.warn(`[WorkerEngine] Job heartbeat check failed: ${err.message}`);
        }
      }, this.config.jobHeartbeatIntervalMs);

      // 3. Dispatch according to jobType
      const packageId = job.payload?.packageId || 'com.example.app';
      console.log(`[WorkerEngine] Running pipeline for package ${packageId}...`);

      const result = await runFakePullApkPipeline({
        jobId: job.id,
        workerId: this.workerId,
        packageId,
        client: this.client,
        isCancelled: () => isCancelled,
        stepDelayMs: 300,
      });

      // 4. Complete job
      await this.client.succeedJob(job.id, this.workerId, result);
      console.log(`[WorkerEngine] Job ${job.id} completed successfully.`);
    } catch (err: any) {
      console.error(`[WorkerEngine] Job ${job.id} failed: ${err.message}`);
      if (this.workerId) {
        await this.client.failJob(job.id, this.workerId, err.message, !err.message.includes('JOB_CANCELLED')).catch(() => {});
      }
    } finally {
      if (jobHeartbeatTimer) clearInterval(jobHeartbeatTimer);
      this.slotManager.releaseSlot(job.id);
    }
  }

  async stop(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    this.isRunning = false;

    console.log('[WorkerEngine] Gracefully stopping worker engine...');

    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.workerHeartbeatTimer) clearInterval(this.workerHeartbeatTimer);

    if (this.workerId) {
      try {
        await this.client.sendWorkerHeartbeat(this.workerId, 'offline');
        console.log('[WorkerEngine] Worker set to offline state.');
      } catch {}
    }
  }

  private setupShutdownHooks(): void {
    const shutdown = async () => {
      await this.stop();
      process.exit(0);
    };

    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }
}
