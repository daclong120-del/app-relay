import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { CreateJobRequestSchema, CreateBatchJobRequestSchema, JobQuerySchema } from '@app-relay/contracts';
import { supabase } from '../../database/supabase.js';
import { requirePublicAuth } from '../../middleware/auth.js';
import { formatJobResponse, formatArtifactResponse, formatJobEventResponse } from '../../utils/formatters.js';
import { isValidPackageId } from '../../utils/validation.js';
import { signDownloadUrl } from '../../utils/signature.js';

const router = Router();

// POST /v1/jobs
router.post('/', requirePublicAuth, async (req: Request, res: Response) => {
  try {
    const body = CreateJobRequestSchema.parse(req.body);
    const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

    if (idempotencyKey) {
      const { data: existingJob } = await supabase.from('jobs').select('*').eq('idempotency_key', idempotencyKey).single();
      if (existingJob) {
        return res.status(200).json({
          data: {
            jobId: existingJob.id,
            packageId: existingJob.package_id,
            status: existingJob.status,
            createdAt: existingJob.created_at,
          },
        });
      }
    }

    const urlObj = new URL(body.playUrl);
    const packageId = urlObj.searchParams.get('id');
    if (!packageId || !isValidPackageId(packageId)) {
      return res.status(400).json({
        error: { code: 'INVALID_URL', message: 'URL must contain a valid Android packageId (?id=com.example.app)' },
      });
    }

    // Upsert app entry into DB per §7 specification
    await supabase.from('apps').upsert([
      {
        package_id: packageId,
        play_url: body.playUrl,
        updated_at: new Date().toISOString(),
      },
    ], { onConflict: 'package_id' });

    const jobId = `job_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

    const newJob = {
      id: jobId,
      package_id: packageId,
      play_url: body.playUrl,
      include_listing: body.includeListing,
      include_screenshots: body.includeScreenshots,
      options: body.options || {},
      status: 'queued',
      idempotency_key: idempotencyKey || null,
      queued_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('jobs').insert([newJob]);
    if (error) throw error;

    // Record initial event
    await supabase.from('job_events').insert([
      {
        job_id: jobId,
        event_type: 'job.queued',
        message: 'Job submitted and queued',
        data: { packageId, playUrl: body.playUrl },
      },
    ]);

    res.status(201).json({
      data: {
        jobId,
        packageId,
        status: 'queued',
        createdAt: newJob.queued_at,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: err.message } });
  }
});

// POST /v1/jobs/batch
router.post('/batch', requirePublicAuth, async (req: Request, res: Response) => {
  try {
    const body = CreateBatchJobRequestSchema.parse(req.body);
    const batchId = crypto.randomUUID();
    const jobsToInsert: any[] = [];
    const eventsToInsert: any[] = [];
    const appsToUpsertMap = new Map<string, any>();
    const createdJobs: any[] = [];

    let idx = 0;
    for (const playUrl of body.urls) {
      const urlObj = new URL(playUrl);
      const packageId = urlObj.searchParams.get('id');
      if (!packageId || !isValidPackageId(packageId)) continue;

      appsToUpsertMap.set(packageId, {
        package_id: packageId,
        play_url: playUrl,
        updated_at: new Date().toISOString(),
      });

      idx++;
      const jobId = `job_${Date.now()}_${idx}_${crypto.randomBytes(8).toString('hex')}`;
      const nowIso = new Date().toISOString();

      jobsToInsert.push({
        id: jobId,
        batch_id: batchId,
        package_id: packageId,
        play_url: playUrl,
        include_listing: body.includeListing,
        include_screenshots: body.includeScreenshots,
        options: body.options || {},
        status: 'queued',
        queued_at: nowIso,
      });

      eventsToInsert.push({
        job_id: jobId,
        event_type: 'job.queued',
        message: 'Job queued in batch',
        data: { batchId, packageId },
      });

      createdJobs.push({
        jobId,
        packageId,
        status: 'queued',
      });
    }

    if (jobsToInsert.length > 0) {
      const appsToUpsert = Array.from(appsToUpsertMap.values());
      const { error: appsErr } = await supabase.from('apps').upsert(appsToUpsert, { onConflict: 'package_id' });
      if (appsErr) throw appsErr;

      const { error: jobsErr } = await supabase.from('jobs').insert(jobsToInsert);
      if (jobsErr) throw jobsErr;

      const { error: eventsErr } = await supabase.from('job_events').insert(eventsToInsert);
      if (eventsErr) throw eventsErr;
    }

    res.status(201).json({
      data: {
        batchId,
        jobs: createdJobs,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: err.message } });
  }
});

// GET /v1/jobs
router.get('/', requirePublicAuth, async (req: Request, res: Response) => {
  try {
    const query = JobQuerySchema.parse(req.query);
    let dbQuery = supabase.from('jobs').select('*', { count: 'exact' });

    if (query.status) dbQuery = dbQuery.eq('status', query.status);
    if (query.batchId) dbQuery = dbQuery.eq('batch_id', query.batchId);
    if (query.packageId) dbQuery = dbQuery.eq('package_id', query.packageId);

    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    const { data, count, error } = await dbQuery.range(from, to).order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      data: (data || []).map(formatJobResponse),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: count || 0,
      },
    });
  } catch (err: any) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: err.message } });
  }
});

// GET /v1/jobs/:jobId
router.get('/:jobId', requirePublicAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { data: job, error } = await supabase.from('jobs').select('*').eq('id', jobId).single();

    if (error || !job) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: `Job ${jobId} not found` } });
    }

    const { data: artifact } = await supabase.from('artifacts').select('*').eq('job_id', jobId).maybeSingle();

    res.json({
      data: {
        ...formatJobResponse(job),
        artifact: formatArtifactResponse(artifact),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

// GET /v1/jobs/:jobId/events
router.get('/:jobId/events', requirePublicAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { data, error } = await supabase.from('job_events').select('*').eq('job_id', jobId).order('created_at', { ascending: true });

    if (error) throw error;

    res.json({ data: (data || []).map(formatJobEventResponse) });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

// POST /v1/jobs/:jobId/cancel
router.post('/:jobId/cancel', requirePublicAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single();

    if (!job) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
    }

    if (job.status !== 'queued' && job.status !== 'running') {
      return res.status(400).json({
        error: {
          code: 'INVALID_STATUS',
          message: `Cannot cancel job ${jobId} with status '${job.status}'`,
        },
      });
    }

    let targetStatus = job.status;
    if (job.status === 'queued') {
      targetStatus = 'cancelled';
      await supabase.from('jobs').update({ status: 'cancelled', cancel_requested_at: new Date().toISOString() }).eq('id', jobId);
    } else if (job.status === 'running') {
      targetStatus = 'cancelling';
      await supabase.from('jobs').update({ status: 'cancelling', cancel_requested_at: new Date().toISOString() }).eq('id', jobId);
    }

    await supabase.from('job_events').insert([
      {
        job_id: jobId,
        event_type: 'job.cancel_requested',
        message: 'Cancel requested by user',
      },
    ]);

    res.json({ data: { jobId, status: targetStatus } });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

// POST /v1/jobs/:jobId/retry
router.post('/:jobId/retry', requirePublicAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { data: job } = await supabase.from('jobs').select('*').eq('id', jobId).single();

    if (!job) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
    }

    if (job.status !== 'failed') {
      return res.status(400).json({
        error: {
          code: 'INVALID_STATUS',
          message: `Job ${jobId} status is '${job.status}', only failed jobs can be retried`,
        },
      });
    }

    await supabase.from('jobs').update({
      status: 'queued',
      error_code: null,
      error_message: null,
      attempt_count: 0,
      worker_id: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    }).eq('id', jobId);

    await supabase.from('job_events').insert([
      {
        job_id: jobId,
        event_type: 'job.retried',
        message: 'Job reset to queued for retry',
      },
    ]);

    res.json({ data: { jobId, status: 'queued' } });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

// POST /v1/jobs/:jobId/artifact/download-url
router.post('/:jobId/artifact/download-url', requirePublicAuth, async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const { data: artifact } = await supabase.from('artifacts').select('*').eq('job_id', jobId).single();

    if (!artifact) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Artifact not found for this job' } });
    }

    const ttlSeconds = parseInt(process.env.DOWNLOAD_URL_TTL_SECONDS || '600', 10);
    const expiresAtSec = Math.floor(Date.now() / 1000) + ttlSeconds;
    const signature = signDownloadUrl(artifact.id, expiresAtSec);

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const downloadUrl = `${baseUrl}/v1/artifacts/${artifact.id}/download?expires=${expiresAtSec}&signature=${signature}`;

    res.json({
      data: {
        downloadUrl,
        expiresAt: new Date(expiresAtSec * 1000).toISOString(),
        fileName: artifact.file_name,
        sizeBytes: artifact.size_bytes,
        sha256: artifact.sha256,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

export default router;
