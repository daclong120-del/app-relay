// Shared request handlers for the AppRelay API.
//
// The partner surface (/api/app-relay/v1) and the internal dashboard surface
// (/api/app-relay/internal) execute the same logic and differ only in how the
// caller is authenticated and which TenantScope they receive. Keeping one
// implementation means a tenant check can't be present on one surface and
// missing on the other.

import { AppRelayScope, APP_RELAY_SCOPES } from '../app-relay-auth/api-key.guard';
import { AppRelayError } from '../errors/app-relay-errors';
import { ReleaseOpsJobEventRepository } from '../repositories/release-ops-job-event.repo';
import { ReleaseOpsJobRepository } from '../repositories/release-ops-job.repo';
import { ReleaseOpsWorkerRepository } from '../repositories/release-ops-worker.repo';
import { AppRelayService } from '../services/app-relay.service';
import { AppRelayRequestContext } from './context';

export interface HandlerResult {
  status: number;
  body: any;
}

/** A single request may not enqueue an unbounded amount of device work. */
export const MAX_BATCH_URLS = 50;

function errorBody(code: string, message: string, requestId: string, retryable = false) {
  return { error: { code, message, requestId, retryable } };
}

function notFound(pathStr: string, requestId: string): HandlerResult {
  return {
    status: 404,
    body: errorBody('NOT_FOUND', `Endpoint NOT_FOUND: /${pathStr}`, requestId),
  };
}

/**
 * Maps a route to the scope a partner key must hold. Returning null means the
 * route is not part of the partner surface at all (internal-only).
 */
export function requiredScopeFor(method: string, segments: string[]): AppRelayScope | null {
  const path = segments.join('/');
  const m = method.toUpperCase();

  if (m === 'GET') {
    if (path === 'overview' || path === 'apps' || path === 'jobs') return APP_RELAY_SCOPES.JOBS_READ;
    if (path === 'workers/fleet-status') return APP_RELAY_SCOPES.WORKERS_READ;
    if (segments.length === 3 && segments[0] === 'jobs' && segments[2] === 'events') {
      return APP_RELAY_SCOPES.JOBS_READ;
    }
    if (segments.length === 2 && segments[0] === 'jobs') return APP_RELAY_SCOPES.JOBS_READ;
    // /workers and /workers/:id expose fleet inventory and metadata; they stay
    // on the internal surface only.
    return null;
  }

  if (m === 'POST') {
    if (path === 'jobs' || path === 'jobs/batch') return APP_RELAY_SCOPES.JOBS_WRITE;
    if (segments.length === 3 && segments[0] === 'jobs' && ['cancel', 'retry'].includes(segments[2])) {
      return APP_RELAY_SCOPES.JOBS_WRITE;
    }
    if (
      segments.length === 4 &&
      segments[0] === 'jobs' &&
      segments[2] === 'artifact' &&
      segments[3] === 'download-url'
    ) {
      return APP_RELAY_SCOPES.ARTIFACTS_READ;
    }
    return null;
  }

  if (m === 'DELETE') {
    if (segments.length === 3 && segments[0] === 'jobs' && segments[2] === 'artifact') {
      return APP_RELAY_SCOPES.ARTIFACTS_WRITE;
    }
    return null;
  }

  return null;
}

export async function handleGet(
  ctx: AppRelayRequestContext,
  segments: string[],
  searchParams: URLSearchParams
): Promise<HandlerResult> {
  const { db, scope, requestId } = ctx;
  const path = segments.join('/');

  if (path === 'overview') {
    const repo = new ReleaseOpsJobRepository(db);
    const workerRepo = new ReleaseOpsWorkerRepository(db);
    const [jobs, workers] = await Promise.all([
      repo.findAll({ scope, limit: 500 }),
      workerRepo.findAll(),
    ]);

    const onlineWorkers = workers.filter((w) => ['online', 'active', 'idle'].includes(w.status)).length;

    return {
      status: 200,
      body: {
        totalJobs: jobs.length,
        activeJobs: jobs.filter((j) => ['running', 'claimed'].includes(j.status)).length,
        queuedJobs: jobs.filter((j) => j.status === 'queued').length,
        succeededJobs: jobs.filter((j) => j.status === 'succeeded').length,
        failedJobs: jobs.filter((j) => ['failed', 'dead_letter'].includes(j.status)).length,
        onlineWorkers,
        requestId,
      },
    };
  }

  if (path === 'apps') {
    const repo = new ReleaseOpsJobRepository(db);
    const jobs = await repo.findAll({ scope, limit: 500 });
    const appMap = new Map<string, any>();

    for (const j of jobs) {
      const pkgId = (j.payload as any)?.packageId;
      if (pkgId && !appMap.has(pkgId)) {
        appMap.set(pkgId, {
          packageId: pkgId,
          lastPulledAt: j.createdAt,
          status: j.status,
          playUrl: (j.payload as any)?.playUrl,
        });
      }
    }

    const apps = Array.from(appMap.values());
    return { status: 200, body: { data: apps, totalItems: apps.length, requestId } };
  }

  if (path === 'workers/fleet-status') {
    const workerRepo = new ReleaseOpsWorkerRepository(db);
    const workers = await workerRepo.findAll();
    const active = workers.filter((w) => w.status === 'active');
    const idle = workers.filter((w) => w.status === 'idle');

    const body: Record<string, unknown> = {
      totalWorkers: workers.length,
      onlineWorkersCount: active.length + idle.length,
      idleWorkersCount: idle.length,
      activeWorkersCount: active.length,
      requestId,
    };

    // Worker rows carry hostnames, capabilities and other infrastructure
    // detail, so partners get counts only.
    if (ctx.caller === 'internal') {
      body.workers = [...active, ...idle];
    }

    return { status: 200, body };
  }

  if (path === 'jobs') {
    const page = Number(searchParams.get('page')) || 1;
    const pageSize = Math.min(Number(searchParams.get('pageSize') || searchParams.get('limit')) || 25, 100);
    const search = searchParams.get('search') || undefined;
    const offset = (page - 1) * pageSize;
    const statusParam = searchParams.get('status') as any;

    const repo = new ReleaseOpsJobRepository(db);
    const jobs = await repo.findAll({
      scope,
      jobType: 'pull_apk',
      status: statusParam || undefined,
      limit: pageSize,
      offset,
    });

    const filtered = search
      ? jobs.filter((j) => {
          const pkgId = (j.payload as any)?.packageId;
          return (
            (pkgId && typeof pkgId === 'string' && pkgId.toLowerCase().includes(search.toLowerCase())) ||
            j.id.includes(search)
          );
        })
      : jobs;

    return {
      status: 200,
      body: {
        data: filtered,
        pagination: {
          page,
          pageSize,
          totalItems: filtered.length,
          totalPages: Math.ceil(filtered.length / pageSize) || 1,
        },
        requestId,
      },
    };
  }

  if (segments.length === 3 && segments[0] === 'jobs' && segments[2] === 'events') {
    const jobId = segments[1];

    // release_ops_job_events has no tenant column, so ownership is established
    // through the parent job before any event is returned.
    const jobRepo = new ReleaseOpsJobRepository(db);
    const job = await jobRepo.findById(jobId, scope);
    if (!job) {
      return { status: 404, body: errorBody('JOB_NOT_FOUND', `AppRelay job not found: ${jobId}`, requestId) };
    }

    const eventRepo = new ReleaseOpsJobEventRepository(db);
    const events = await eventRepo.findByJobId(jobId);
    return { status: 200, body: { data: events, nextCursor: null, requestId } };
  }

  if (segments.length === 2 && segments[0] === 'jobs') {
    const service = new AppRelayService(db, scope, { id: ctx.actorId, label: ctx.actorLabel });
    const detail = await service.getJobDetail(segments[1]);
    return {
      status: 200,
      body: {
        job: detail.job,
        events: detail.events,
        artifact: detail.artifact,
        worker: ctx.caller === 'internal' ? detail.worker : undefined,
        requestId,
      },
    };
  }

  if (ctx.caller === 'internal') {
    if (path === 'workers') {
      const workerRepo = new ReleaseOpsWorkerRepository(db);
      const workers = await workerRepo.findAll();
      return {
        status: 200,
        body: {
          data: workers,
          pagination: { page: 1, pageSize: workers.length || 25, totalItems: workers.length, totalPages: 1 },
          requestId,
        },
      };
    }

    if (segments.length === 2 && segments[0] === 'workers') {
      const workerRepo = new ReleaseOpsWorkerRepository(db);
      const worker = await workerRepo.findById(segments[1]);
      if (!worker) {
        return { status: 404, body: errorBody('WORKER_NOT_FOUND', `Worker not found: ${segments[1]}`, requestId) };
      }
      return { status: 200, body: { worker, requestId } };
    }
  }

  return notFound(path, requestId);
}

export async function handlePost(
  ctx: AppRelayRequestContext,
  segments: string[],
  body: any
): Promise<HandlerResult> {
  const { db, scope, requestId } = ctx;
  const path = segments.join('/');
  const service = new AppRelayService(db, scope, { id: ctx.actorId, label: ctx.actorLabel });

  if (path === 'jobs') {
    const job = await service.createApkPullJob({
      playUrl: body?.playUrl,
      includeListing: body?.includeListing,
      includeScreenshots: body?.includeScreenshots,
    });

    return {
      status: 201,
      body: {
        data: {
          jobId: job.id,
          packageId: (job.payload as any)?.packageId || job.appId || '',
          status: job.status,
          createdAt: job.createdAt,
        },
        job,
        requestId,
      },
    };
  }

  if (path === 'jobs/batch') {
    const urls: unknown = body?.urls;
    if (!Array.isArray(urls)) {
      return {
        status: 400,
        body: errorBody('INVALID_REQUEST', 'Field "urls" must be an array of Google Play URLs.', requestId),
      };
    }

    if (urls.length > MAX_BATCH_URLS) {
      return {
        status: 400,
        body: errorBody(
          'BATCH_TOO_LARGE',
          `A batch may contain at most ${MAX_BATCH_URLS} URLs; received ${urls.length}.`,
          requestId
        ),
      };
    }

    const results = [];
    for (const url of urls) {
      try {
        const job = await service.createApkPullJob({
          playUrl: String(url),
          includeListing: body?.includeListing,
          includeScreenshots: body?.includeScreenshots,
        });
        results.push({ playUrl: url, status: 'accepted', jobId: job.id, job });
      } catch (err: any) {
        results.push({
          playUrl: url,
          status: 'rejected',
          error: {
            code: err instanceof AppRelayError ? err.code : 'INTERNAL_ERROR',
            message: err?.message || 'Job creation failed.',
          },
        });
      }
    }

    return {
      status: 207,
      body: {
        data: results,
        totalSubmitted: urls.length,
        acceptedCount: results.filter((r) => r.status === 'accepted').length,
        rejectedCount: results.filter((r) => r.status === 'rejected').length,
        requestId,
      },
    };
  }

  if (segments.length === 3 && segments[0] === 'jobs' && segments[2] === 'cancel') {
    await service.cancelJob(segments[1]);
    const detail = await service.getJobDetail(segments[1]);
    return { status: 200, body: { job: detail.job, requestId } };
  }

  if (segments.length === 3 && segments[0] === 'jobs' && segments[2] === 'retry') {
    await service.retryJob(segments[1]);
    const detail = await service.getJobDetail(segments[1]);
    return { status: 200, body: { job: detail.job, requestId } };
  }

  if (
    segments.length === 4 &&
    segments[0] === 'jobs' &&
    segments[2] === 'artifact' &&
    segments[3] === 'download-url'
  ) {
    const jobId = segments[1];
    const requested = Number(body?.expiresInSeconds);
    const expiresIn = Number.isFinite(requested) ? Math.min(Math.max(requested, 60), 3600) : 900;
    const handoff = await service.getArtifactDownloadUrl(jobId, expiresIn);
    return { status: 200, body: { data: { jobId, ...handoff }, ...handoff, requestId } };
  }

  return notFound(path, requestId);
}

export async function handleDelete(
  ctx: AppRelayRequestContext,
  segments: string[]
): Promise<HandlerResult> {
  const { db, scope, requestId } = ctx;

  if (segments.length === 3 && segments[0] === 'jobs' && segments[2] === 'artifact') {
    const jobId = segments[1];
    const service = new AppRelayService(db, scope, { id: ctx.actorId, label: ctx.actorLabel });
    // The previous implementation passed this path segment straight through as
    // an artifact id, so the documented jobId form never matched anything.
    await service.deleteArtifactForJob(jobId);
    return { status: 200, body: { success: true, jobId, requestId } };
  }

  return notFound(segments.join('/'), requestId);
}
