import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import {
  ClaimJobRequestSchema,
  JobHeartbeatRequestSchema,
  RecordEventRequestSchema,
  CompleteJobRequestSchema,
  FailJobRequestSchema,
  CancelledJobRequestSchema,
  FinalizeArtifactRequestSchema,
} from '@app-relay/contracts';
import { supabase } from '../../database/supabase.js';
import { requireWorkerAuth } from '../../middleware/auth.js';
import { jobArtifactDir, normalizeEntryPath, resolveEntry } from '../../utils/artifact-path.js';
import { hasRoomFor, isDiskLow, listArtifactFiles, recordUpload } from '../../utils/artifact-store.js';

const router = Router();

// POST /internal/v1/jobs/claim
router.post('/claim', requireWorkerAuth, async (req: Request, res: Response) => {
  try {
    const body = ClaimJobRequestSchema.parse(req.body);

    // Đĩa thấp thì không giao job mới. Job nằm yên trong `queued` thay vì chạy
    // hết pipeline emulator rồi mới chết ở bước upload — mất trắng công.
    if (await isDiskLow()) {
      console.warn('[Claim] Đĩa dưới ngưỡng dự phòng, tạm ngừng giao job.');
      return res.status(204).send();
    }

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

// PUT /internal/v1/jobs/:jobId/files/<relative/path>
//
// Worker gửi từng file của work/apks/<packageId>/ thay vì một ZIP: API lưu
// nguyên thư mục nên client lấy được từng file mà không phải giải nén, và xoá
// riêng APK chỉ là một lệnh rm. Xem new_setup/artifact_storage.md.
router.put('/:jobId/files/*', requireWorkerAuth, async (req: Request, res: Response) => {
  let localFilePath: string | null = null;
  try {
    const { jobId } = req.params;
    const rawPath = (req.params as Record<string, string>)['0'] || '';

    const relPath = normalizeEntryPath(rawPath);
    const abs = relPath ? resolveEntry(jobId, relPath) : null;
    if (!relPath || !abs) {
      return res.status(400).json({
        error: { code: 'INVALID_PATH', message: `Đường dẫn không hợp lệ: ${rawPath}` },
      });
    }
    localFilePath = abs;

    // Chỉ nhận file cho job đang chạy. Không có chốt này thì worker ghi đè
    // được artifact của job đã giao xong, khiến nội dung trên đĩa lệch với
    // `files`/`sha256` mà DB đang công bố cho client.
    const { data: job } = await supabase.from('jobs').select('status').eq('id', jobId).maybeSingle();
    if (!job) {
      return res.status(404).json({ error: { code: 'JOB_NOT_FOUND', message: `Không có job ${jobId}` } });
    }
    if (job.status !== 'running') {
      return res.status(409).json({
        error: { code: 'JOB_NOT_RUNNING', message: `Job đang ở trạng thái '${job.status}', không nhận upload` },
      });
    }

    const declaredSha = req.headers['x-content-sha256'] as string | undefined;

    // Từ chối sớm khi đĩa không đủ, thay vì để job chết giữa chừng sau khi đã
    // tốn hết công emulator.
    const declaredSize = parseInt(String(req.headers['content-length'] ?? ''), 10);
    if (Number.isFinite(declaredSize) && !(await hasRoomFor(declaredSize))) {
      return res.status(507).json({
        error: { code: 'INSUFFICIENT_STORAGE', message: 'Đĩa API server không đủ chỗ cho file này' },
      });
    }

    await fs.promises.mkdir(path.dirname(abs), { recursive: true });

    const hash = createHash('sha256');
    let sizeBytes = 0;

    // Hash và đo ngay trên luồng đang ghi xuống đĩa, để file vài trăm MB không
    // bao giờ phải nằm trong bộ nhớ.
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sizeBytes += chunk.length;
        hash.update(chunk);
        callback(null, chunk);
      },
    });

    // pipeline() huỷ mọi stream và reject nếu worker đứt giữa chừng, thay vì
    // treo mãi chờ một sự kiện 'finish' không bao giờ đến.
    try {
      await pipeline(req, meter, fs.createWriteStream(abs));
    } catch (streamErr: any) {
      await fs.promises.rm(abs, { force: true }).catch(() => {});
      return res.status(400).json({
        error: { code: 'UPLOAD_INCOMPLETE', message: `Upload đứt giữa chừng: ${streamErr.message}` },
      });
    }

    const calculatedSha256 = hash.digest('hex');

    if (declaredSha && declaredSha.toLowerCase() !== calculatedSha256.toLowerCase()) {
      await fs.promises.rm(abs, { force: true }).catch(() => {});
      return res.status(400).json({
        error: {
          code: 'SHA256_MISMATCH',
          message: `SHA256 lệch: header=${declaredSha}, tính được=${calculatedSha256}`,
        },
      });
    }

    await recordUpload(jobId, relPath, sizeBytes, calculatedSha256);

    res.json({ status: 'ok', path: relPath, sizeBytes, sha256: calculatedSha256 });
  } catch (err: any) {
    if (localFilePath) {
      await fs.promises.rm(localFilePath, { force: true }).catch(() => {});
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

// POST /internal/v1/jobs/:jobId/artifact/finalize
//
// Chốt artifact sau khi worker gửi hết file. Trước lệnh này artifact ở
// state='preparing' và không tải được, nên client không bao giờ vớ phải bản
// dở dang.
router.post('/:jobId/artifact/finalize', requireWorkerAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const body = FinalizeArtifactRequestSchema.parse(req.body);

    // `workerId` trước đây được nhận rồi bỏ qua. Không đối chiếu thì worker
    // khác chốt được artifact của job không phải của mình.
    const { data: job } = await supabase.from('jobs').select('status, worker_id').eq('id', jobId).maybeSingle();
    if (!job) {
      return res.status(404).json({ error: { code: 'JOB_NOT_FOUND', message: `Không có job ${jobId}` } });
    }
    if (job.worker_id !== body.workerId) {
      return res.status(409).json({
        error: {
          code: 'NOT_JOB_OWNER',
          message: `Job ${jobId} đang do '${job.worker_id}' giữ, không phải '${body.workerId}'`,
        },
      });
    }
    if (job.status !== 'running') {
      return res.status(409).json({
        error: { code: 'JOB_NOT_RUNNING', message: `Job đang ở trạng thái '${job.status}', không chốt được artifact` },
      });
    }

    const dir = jobArtifactDir(jobId);
    const files = await listArtifactFiles(dir);

    if (files.length !== body.fileCount) {
      return res.status(400).json({
        error: {
          code: 'FILE_COUNT_MISMATCH',
          message: `Worker báo ${body.fileCount} file nhưng trên đĩa có ${files.length}`,
        },
      });
    }

    const totalSize = files.reduce((sum, f) => sum + f.sizeBytes, 0);

    const apkTtlHours = parseInt(process.env.APK_TTL_HOURS || '6', 10);
    const artifactTtlHours = parseInt(process.env.ARTIFACT_TTL_HOURS || '720', 10);
    const now = Date.now();

    const { error } = await supabase.from('artifacts').upsert([
      {
        job_id: jobId,
        kind: 'bundle_dir',
        state: 'available',
        file_name: body.fileName,
        size_bytes: totalSize,
        files,
        storage_backend: 'api_disk',
        locator: jobId,
        apk_expires_at: new Date(now + apkTtlHours * 3600 * 1000).toISOString(),
        expires_at: new Date(now + artifactTtlHours * 3600 * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      },
    ], { onConflict: 'job_id' });

    if (error) throw error;

    res.json({ status: 'ok', fileCount: files.length, sizeBytes: totalSize });
  } catch (err: any) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: err.message } });
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
