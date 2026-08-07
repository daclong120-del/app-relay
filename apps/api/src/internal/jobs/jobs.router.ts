import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import {
  ClaimJobRequestSchema,
  JobHeartbeatRequestSchema,
  RecordEventRequestSchema,
  CompleteJobRequestSchema,
  FailJobRequestSchema,
  CancelledJobRequestSchema,
} from '@app-relay/contracts';
import { supabase } from '../../database/supabase.js';
import { requireWorkerAuth } from '../../middleware/auth.js';

const router = Router();
const ARTIFACT_DIR = process.env.ARTIFACT_DIR || path.join(process.cwd(), 'artifacts');

// POST /internal/v1/jobs/claim
router.post('/claim', requireWorkerAuth, async (req: Request, res: Response) => {
  try {
    const body = ClaimJobRequestSchema.parse(req.body);

    const { data, error } = await supabase.rpc('claim_job', {
      p_worker_id: body.workerId,
      p_lease_seconds: 120,
    });

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(204).send();
    }

    const claimedJob = data[0];
    res.json({
      data: {
        jobId: claimedJob.id,
        packageId: claimedJob.package_id,
        playUrl: claimedJob.play_url,
        includeListing: claimedJob.include_listing,
        includeScreenshots: claimedJob.include_screenshots,
        attempt: claimedJob.attempt_count,
        leaseExpiresAt: claimedJob.lease_expires_at,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

// POST /internal/v1/jobs/:jobId/heartbeat
router.post('/:jobId/heartbeat', requireWorkerAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const body = JobHeartbeatRequestSchema.parse(req.body);

    const newLease = new Date(Date.now() + 120000).toISOString();

    const { data: job, error } = await supabase.from('jobs').update({
      progress: body.progress,
      current_step: body.currentStep || null,
      lease_expires_at: newLease,
      last_heartbeat_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', jobId).eq('worker_id', body.workerId).select('cancel_requested_at').single();

    if (error) throw error;

    res.json({
      data: {
        leaseExpiresAt: newLease,
        cancelRequested: !!job?.cancel_requested_at,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: err.message } });
  }
});

// POST /internal/v1/jobs/:jobId/events
router.post('/:jobId/events', requireWorkerAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const body = RecordEventRequestSchema.parse(req.body);

    await supabase.from('job_events').insert([
      {
        job_id: jobId,
        event_type: body.eventType,
        level: body.level,
        message: body.message,
        data: body.data,
      },
    ]);

    res.json({ status: 'ok' });
  } catch (err: any) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: err.message } });
  }
});

// PUT /internal/v1/jobs/:jobId/artifact (Upload stream ZIP file)
router.put('/:jobId/artifact', requireWorkerAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const fileName = (req.headers['x-file-name'] as string) || `${jobId}.zip`;
    const sha256 = req.headers['x-content-sha256'] as string | undefined;

    const jobSubDir = path.join(ARTIFACT_DIR, jobId);
    if (!fs.existsSync(jobSubDir)) {
      fs.mkdirSync(jobSubDir, { recursive: true });
    }

    const localFilePath = path.join(jobSubDir, 'bundle.zip');
    const writeStream = fs.createWriteStream(localFilePath);
    const hash = createHash('sha256');

    let sizeBytes = 0;

    await new Promise<void>((resolve, reject) => {
      req.on('data', (chunk: Buffer) => {
        sizeBytes += chunk.length;
        hash.update(chunk);
      });
      req.pipe(writeStream);
      writeStream.on('finish', () => resolve());
      writeStream.on('error', (err) => reject(err));
      req.on('error', (err) => reject(err));
    });

    const calculatedSha256 = hash.digest('hex');

    if (sha256 && sha256.toLowerCase() !== calculatedSha256.toLowerCase()) {
      await fs.promises.rm(localFilePath, { force: true }).catch(() => {});
      return res.status(400).json({
        error: {
          code: 'SHA256_MISMATCH',
          message: `Artifact SHA256 checksum mismatch: header=${sha256}, calculated=${calculatedSha256}`,
        },
      });
    }

    const artifactTtlHours = parseInt(process.env.ARTIFACT_TTL_HOURS || '48', 10);
    const expiresAt = new Date(Date.now() + artifactTtlHours * 3600 * 1000).toISOString();

    const { error } = await supabase.from('artifacts').upsert([
      {
        job_id: jobId,
        kind: 'bundle_zip',
        state: 'available',
        file_name: fileName,
        content_type: 'application/zip',
        size_bytes: sizeBytes,
        sha256: calculatedSha256,
        storage_backend: 'api_disk',
        locator: path.join(jobId, 'bundle.zip'),
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
    ], { onConflict: 'job_id' });

    if (error) throw error;

    res.json({ status: 'ok', sizeBytes });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

// POST /internal/v1/jobs/:jobId/complete
router.post('/:jobId/complete', requireWorkerAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const body = CompleteJobRequestSchema.parse(req.body);

    const { data: job } = await supabase.from('jobs').select('package_id, play_url').eq('id', jobId).single();

    await supabase.from('jobs').update({
      status: 'completed',
      progress: 100,
      result_summary: body.result,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', jobId).eq('worker_id', body.workerId);

    if (job) {
      const appRecord: Record<string, any> = {
        package_id: job.package_id,
        play_url: job.play_url,
        version_name: body.result.versionName,
        version_code: body.result.versionCode,
        split_count: body.result.splitCount || 0,
        screenshot_count: body.result.screenshotCount || 0,
        base_apk_size_bytes: body.result.baseApkSizeBytes || 0,
        last_successful_job_id: jobId,
        last_pulled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (body.result.title !== undefined) appRecord.title = body.result.title;
      if (body.result.developer !== undefined) appRecord.developer = body.result.developer;
      if (body.result.rating !== undefined) {
        appRecord.rating = typeof body.result.rating === 'string' ? (parseFloat(body.result.rating) || null) : body.result.rating;
      }
      if (body.result.installsText !== undefined) appRecord.installs_text = body.result.installsText;
      if (body.result.description !== undefined) appRecord.description = body.result.description;
      if (body.result.listingMetadata !== undefined) appRecord.listing_metadata = body.result.listingMetadata;

      await supabase.from('apps').upsert([appRecord], { onConflict: 'package_id' });
    }

    await supabase.from('job_events').insert([
      {
        job_id: jobId,
        event_type: 'job.completed',
        message: 'Job completed successfully',
        data: body.result,
      },
    ]);

    await supabase.from('workers').update({
      status: 'online',
      current_job_id: null,
      updated_at: new Date().toISOString(),
    }).eq('id', body.workerId);

    res.json({ status: 'ok' });
  } catch (err: any) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: err.message } });
  }
});

// POST /internal/v1/jobs/:jobId/fail
router.post('/:jobId/fail', requireWorkerAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const body = FailJobRequestSchema.parse(req.body);

    const { data: existingJob } = await supabase.from('jobs').select('attempt_count, max_attempts').eq('id', jobId).single();

    const isRetryable = body.error.retryable !== false;
    const canRetry = isRetryable && !!existingJob && (existingJob.attempt_count < existingJob.max_attempts);

    if (canRetry) {
      await supabase.from('jobs').update({
        status: 'queued',
        worker_id: null,
        lease_expires_at: null,
        error_code: body.error.code,
        error_message: body.error.message,
        error_retryable: true,
        updated_at: new Date().toISOString(),
      }).eq('id', jobId).eq('worker_id', body.workerId);

      await supabase.from('job_events').insert([
        {
          job_id: jobId,
          event_type: 'job.auto_retried',
          level: 'warning',
          message: `Job attempt ${existingJob.attempt_count}/${existingJob.max_attempts} failed (${body.error.message}), reset to queued for auto-retry`,
          data: body.error,
        },
      ]);
    } else {
      await supabase.from('jobs').update({
        status: 'failed',
        error_code: body.error.code,
        error_message: body.error.message,
        error_retryable: body.error.retryable,
        updated_at: new Date().toISOString(),
      }).eq('id', jobId).eq('worker_id', body.workerId);

      await supabase.from('job_events').insert([
        {
          job_id: jobId,
          event_type: 'job.failed',
          level: 'error',
          message: body.error.message,
          data: body.error,
        },
      ]);
    }

    await supabase.from('workers').update({
      status: 'online',
      current_job_id: null,
      updated_at: new Date().toISOString(),
    }).eq('id', body.workerId);

    res.json({ status: 'ok', retried: canRetry });
  } catch (err: any) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: err.message } });
  }
});

// POST /internal/v1/jobs/:jobId/cancelled
router.post('/:jobId/cancelled', requireWorkerAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const body = CancelledJobRequestSchema.parse(req.body);

    await supabase.from('jobs').update({
      status: 'cancelled',
      cancel_reason: body.reason || 'Cancelled by worker',
      updated_at: new Date().toISOString(),
    }).eq('id', jobId).eq('worker_id', body.workerId);

    await supabase.from('job_events').insert([
      {
        job_id: jobId,
        event_type: 'job.cancelled',
        message: body.reason || 'Job confirmed cancelled by worker',
      },
    ]);

    await supabase.from('workers').update({
      status: 'online',
      current_job_id: null,
      updated_at: new Date().toISOString(),
    }).eq('id', body.workerId);

    res.json({ status: 'ok' });
  } catch (err: any) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: err.message } });
  }
});

export default router;
