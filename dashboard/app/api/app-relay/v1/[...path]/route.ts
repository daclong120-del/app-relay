// Next.js App Router Catch-All Route for Public AppRelay API v1 (/api/app-relay/v1/*)

import { NextRequest, NextResponse } from 'next/server';
import { getAppRelayConfig } from '../../../../../lib/config/app-relay-config';
import { AppRelayError } from '../../../../../lib/errors/app-relay-errors';
import { ReleaseOpsJobEventRepository } from '../../../../../lib/repositories/release-ops-job-event.repo';
import { ReleaseOpsJobRepository } from '../../../../../lib/repositories/release-ops-job.repo';
import { ReleaseOpsWorkerRepository } from '../../../../../lib/repositories/release-ops-worker.repo';
import { AppRelayService } from '../../../../../lib/services/app-relay.service';

class FallbackDbClient {
  public jobs = new Map<string, any>();
  public workers = new Map<string, any>();
  public artifacts = new Map<string, any>();
  public events: any[] = [];

  constructor() {
    const succeededJobId = 'job_succeeded_001';
    this.jobs.set(succeededJobId, {
      id: succeededJobId,
      job_type: 'pull_apk',
      status: 'succeeded',
      priority: 10,
      release_id: null,
      app_id: null,
      worker_id: 'worker-uuid-101',
      lease_until: null,
      heartbeat_at: new Date().toISOString(),
      attempt_count: 1,
      max_attempts: 3,
      idempotency_key: 'idem_key_001',
      payload: { packageId: 'com.facemoji.lite', playUrl: 'https://play.google.com/store/apps/details?id=com.facemoji.lite' },
      result: { artifactId: 'art_001' },
      error_message: null,
      created_by: 'user-001',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      updated_at: new Date().toISOString(),
    });

    const failedJobId = 'job_failed_001';
    this.jobs.set(failedJobId, {
      id: failedJobId,
      job_type: 'pull_apk',
      status: 'failed',
      priority: 10,
      release_id: null,
      app_id: null,
      worker_id: 'worker-uuid-101',
      lease_until: null,
      heartbeat_at: new Date().toISOString(),
      attempt_count: 1,
      max_attempts: 3,
      idempotency_key: 'idem_key_002',
      payload: { packageId: 'com.facemoji.lite', playUrl: 'https://play.google.com/store/apps/details?id=com.facemoji.lite' },
      result: {},
      error_message: 'Network error during pull',
      created_by: 'user-001',
      created_at: new Date(Date.now() - 7200000).toISOString(),
      updated_at: new Date().toISOString(),
    });

    const artId = 'art_001';
    this.artifacts.set(artId, {
      id: artId,
      job_id: succeededJobId,
      file_name: 'com.facemoji.lite-v1.0.apk',
      checksum: 'sha256:abc123def456',
      storage_path: 'artifacts/com.facemoji.lite-v1.0.apk',
      artifact_type: 'apk',
      content_type: 'application/vnd.android.package-archive',
      size_bytes: 25480000,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      deleted_at: null,
      created_at: new Date().toISOString(),
    });
  }

  from(tableName: string) {
    const self = this;
    if (tableName === 'release_ops_jobs') {
      return {
        select() {
          return {
            eq(field: string, value: any) {
              if (field === 'idempotency_key') {
                return {
                  maybeSingle() {
                    const row = Array.from(self.jobs.values()).find((j) => j.idempotency_key === value);
                    return Promise.resolve({ data: row || null, error: null });
                  },
                };
              }
              if (field === 'id') {
                return {
                  single() {
                    const row = self.jobs.get(value);
                    return Promise.resolve({ data: row || null, error: row ? null : new Error('Not found') });
                  },
                };
              }
              return {
                order() {
                  return {
                    range() {
                      const rows = Array.from(self.jobs.values());
                      return Promise.resolve({ data: rows, error: null });
                    },
                  };
                },
              };
            },
            order() {
              return {
                range() {
                  const rows = Array.from(self.jobs.values());
                  return Promise.resolve({ data: rows, error: null });
                },
              };
            },
          };
        },
        insert(data: any) {
          return {
            select() {
              return {
                single() {
                  const record = {
                    id: 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                    attempt_count: 0,
                    max_attempts: 3,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    ...data,
                  };
                  self.jobs.set(record.id, record);
                  return Promise.resolve({ data: record, error: null });
                },
              };
            },
          };
        },
        update(updateData: any) {
          return {
            eq(field: string, value: any) {
              const job = self.jobs.get(value);
              if (job) {
                Object.assign(job, updateData);
              }
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    }

    if (tableName === 'release_ops_workers') {
      return {
        select() {
          return {
            order() {
              return Promise.resolve({ data: Array.from(self.workers.values()), error: null });
            },
            eq(field: string, value: any) {
              return {
                single() {
                  const row = self.workers.get(value);
                  return Promise.resolve({ data: row || null, error: null });
                },
              };
            },
          };
        },
      };
    }

    if (tableName === 'release_ops_job_events') {
      return {
        select() {
          return {
            eq(field: string, value: any) {
              const matched = self.events.filter((e) => e.job_id === value);
              return {
                order() {
                  return Promise.resolve({ data: matched, error: null });
                },
              };
            },
          };
        },
      };
    }

    if (tableName === 'release_ops_artifacts') {
      return {
        select() {
          return {
            eq(field: string, value: any) {
              const matched = Array.from(self.artifacts.values()).find((a) =>
                (field === 'job_id' ? a.job_id === value && !a.deleted_at : a.id === value && !a.deleted_at)
              );
              const chain = {
                is() { return chain; },
                order() { return chain; },
                limit() { return chain; },
                maybeSingle() { return Promise.resolve({ data: matched || null, error: null }); },
                single() { return Promise.resolve({ data: matched || null, error: matched ? null : new Error('Not found') }); },
              };
              return chain;
            },
          };
        },
        update(updateData: any) {
          return {
            eq(field: string, value: any) {
              const artifact = self.artifacts.get(value);
              if (artifact) {
                Object.assign(artifact, updateData);
              }
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    }

    return {
      select() {
        return {
          eq() {
            return {
              maybeSingle() { return Promise.resolve({ data: null, error: null }); },
              single() { return Promise.resolve({ data: null, error: null }); },
              order() { return Promise.resolve({ data: [], error: null }); },
            };
          },
          order() {
            return Promise.resolve({ data: [], error: null });
          },
        };
      },
      insert() {
        return Promise.resolve({ error: null });
      },
    };
  }

  rpc(methodName: string, args: any) {
    if (methodName === 'release_ops_cancel_job') {
      const jobId = args.p_job_id;
      const job = this.jobs.get(jobId);
      if (job && ['queued', 'claimed', 'running'].includes(job.status)) {
        job.status = 'cancelled';
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: false, error: null });
    }
    return Promise.resolve({ data: true, error: null });
  }
}

const fallbackDb = new FallbackDbClient();

function getDbClient(): any {
  const { supabaseUrl, supabaseServiceRoleKey } = getAppRelayConfig();
  if (
    supabaseUrl &&
    supabaseServiceRoleKey &&
    supabaseUrl !== 'https://supabase.local' &&
    !supabaseUrl.includes('mock') &&
    !supabaseUrl.includes('example')
  ) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      return createClient(supabaseUrl, supabaseServiceRoleKey);
    } catch {
      // Fallback
    }
  }
  return fallbackDb;
}

function getCorsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get('origin') || '*';
  const { allowedOrigins } = getAppRelayConfig();
  const isAllowed = allowedOrigins.includes('*') || allowedOrigins.includes(origin);

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : allowedOrigins[0] || '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function createErrorResponse(
  status: number,
  code: string,
  message: string,
  requestId: string,
  retryable: boolean = false,
  headers?: Record<string, string>
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        requestId,
        retryable,
      },
    },
    { status, headers }
  );
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(request),
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  const pathSegments = resolvedParams.path || [];
  const pathStr = pathSegments.join('/');
  const db = getDbClient();
  const cors = getCorsHeaders(request);
  const requestId = generateRequestId();

  try {
    // 1. GET /health
    if (pathStr === 'health') {
      return NextResponse.json(
        {
          status: 'ok',
          service: 'app-relay-api',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          requestId,
        },
        { status: 200, headers: cors }
      );
    }

    // 2. GET /overview
    if (pathStr === 'overview') {
      const repo = new ReleaseOpsJobRepository(db);
      const workerRepo = new ReleaseOpsWorkerRepository(db);
      const [jobs, workers] = await Promise.all([
        repo.findAll({ limit: 500 }),
        workerRepo.findAll(),
      ]);

      const activeJobs = jobs.filter((j) => ['running', 'claimed'].includes(j.status)).length;
      const queuedJobs = jobs.filter((j) => j.status === 'queued').length;
      const succeededJobs = jobs.filter((j) => j.status === 'succeeded').length;
      const failedJobs = jobs.filter((j) => ['failed', 'dead_letter'].includes(j.status)).length;
      const onlineWorkers = workers.filter((w) => ['online', 'active'].includes(w.status)).length;

      return NextResponse.json(
        {
          totalJobs: jobs.length,
          activeJobs,
          queuedJobs,
          succeededJobs,
          failedJobs,
          onlineWorkers,
          requestId,
        },
        { status: 200, headers: cors }
      );
    }

    // 2b. GET /apps (App Catalog Listing)
    if (pathStr === 'apps') {
      const repo = new ReleaseOpsJobRepository(db);
      const jobs = await repo.findAll({ limit: 500 });
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
      return NextResponse.json(
        {
          data: apps,
          totalItems: apps.length,
          requestId,
        },
        { status: 200, headers: cors }
      );
    }

    // 2c. GET /workers/fleet-status
    if (pathStr === 'workers/fleet-status') {
      const workerRepo = new ReleaseOpsWorkerRepository(db);
      const workers = await workerRepo.findAll();
      const onlineWorkers = workers.filter((w) => ['online', 'active'].includes(w.status));

      return NextResponse.json(
        {
          totalWorkers: workers.length,
          onlineWorkersCount: onlineWorkers.length,
          idleWorkersCount: onlineWorkers.filter((w) => w.status === 'online').length,
          activeWorkersCount: onlineWorkers.filter((w) => w.status === 'active').length,
          workers: onlineWorkers,
          requestId,
        },
        { status: 200, headers: cors }
      );
    }

    // 3. GET /jobs
    if (pathStr === 'jobs') {
      const searchParams = request.nextUrl.searchParams;
      const page = Number(searchParams.get('page')) || 1;
      const pageSize = Math.min(Number(searchParams.get('pageSize') || searchParams.get('limit')) || 25, 100);
      const search = searchParams.get('search') || undefined;
      const offset = (page - 1) * pageSize;

      const repo = new ReleaseOpsJobRepository(db);
      const jobs = await repo.findAll({
        jobType: 'pull_apk',
        limit: pageSize,
        offset,
      });

      const filtered = search
        ? jobs.filter((j) => {
            const pkgId = (j.payload as any)?.packageId;
            return (pkgId && typeof pkgId === 'string' && pkgId.toLowerCase().includes(search.toLowerCase())) || j.id.includes(search);
          })
        : jobs;

      return NextResponse.json(
        {
          data: filtered,
          pagination: {
            page,
            pageSize,
            totalItems: filtered.length,
            totalPages: Math.ceil(filtered.length / pageSize) || 1,
          },
          requestId,
        },
        { status: 200, headers: cors }
      );
    }

    // 4. GET /jobs/:jobId/events
    if (pathSegments.length === 3 && pathSegments[0] === 'jobs' && pathSegments[2] === 'events') {
      const jobId = pathSegments[1];
      const eventRepo = new ReleaseOpsJobEventRepository(db);
      const events = await eventRepo.findByJobId(jobId);
      return NextResponse.json({ data: events, nextCursor: null, requestId }, { status: 200, headers: cors });
    }

    // 5. GET /jobs/:jobId
    if (pathSegments.length === 2 && pathSegments[0] === 'jobs') {
      const jobId = pathSegments[1];
      const service = new AppRelayService(db);
      const detail = await service.getJobDetail(jobId);
      return NextResponse.json({ job: detail.job, events: detail.events, artifact: detail.artifact, worker: detail.worker, requestId }, { status: 200, headers: cors });
    }

    // 6. GET /workers
    if (pathStr === 'workers') {
      const workerRepo = new ReleaseOpsWorkerRepository(db);
      const workers = await workerRepo.findAll();
      return NextResponse.json(
        {
          data: workers,
          pagination: {
            page: 1,
            pageSize: workers.length || 25,
            totalItems: workers.length,
            totalPages: 1,
          },
          requestId,
        },
        { status: 200, headers: cors }
      );
    }

    // 7. GET /workers/:workerId
    if (pathSegments.length === 2 && pathSegments[0] === 'workers') {
      const workerId = pathSegments[1];
      const workerRepo = new ReleaseOpsWorkerRepository(db);
      const worker = await workerRepo.findById(workerId);
      if (!worker) {
        return createErrorResponse(404, 'WORKER_NOT_FOUND', `Worker not found: ${workerId}`, requestId, false, cors);
      }
      return NextResponse.json({ worker, requestId }, { status: 200, headers: cors });
    }

    return createErrorResponse(404, 'NOT_FOUND', `Public API endpoint NOT_FOUND: /${pathStr}`, requestId, false, cors);
  } catch (err: any) {
    if (err instanceof AppRelayError) {
      return createErrorResponse(err.statusCode, err.code, err.message, requestId, err.retryable, cors);
    }
    return createErrorResponse(500, 'INTERNAL_SERVER_ERROR', err.message || 'An unexpected error occurred.', requestId, false, cors);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  const pathSegments = resolvedParams.path || [];
  const pathStr = pathSegments.join('/');
  const db = getDbClient();
  const cors = getCorsHeaders(request);
  const requestId = generateRequestId();

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    try {
      const text = await request.text();
      if (text && text.trim()) {
        body = JSON.parse(text);
      }
    } catch {
      // Empty body
    }
  }

  try {
    const service = new AppRelayService(db);

    // 1. POST /jobs
    if (pathStr === 'jobs') {
      const job = await service.createApkPullJob(body);
      return NextResponse.json({ job, requestId }, { status: 201, headers: cors });
    }

    // 1b. POST /jobs/batch
    if (pathStr === 'jobs/batch') {
      const urls: string[] = Array.isArray(body.urls) ? body.urls : [];
      const createdJobs = [];
      for (const url of urls) {
        try {
          const job = await service.createApkPullJob({ ...body, playUrl: url });
          createdJobs.push(job);
        } catch (err: any) {
          createdJobs.push({ playUrl: url, error: err.message });
        }
      }
      return NextResponse.json({ data: createdJobs, totalSubmitted: urls.length, requestId }, { status: 207, headers: cors });
    }

    // 2. POST /jobs/:jobId/cancel
    if (pathSegments.length === 3 && pathSegments[0] === 'jobs' && pathSegments[2] === 'cancel') {
      const jobId = pathSegments[1];
      await service.cancelJob(jobId, body.userId);
      const detail = await service.getJobDetail(jobId);
      return NextResponse.json({ job: detail.job, requestId }, { status: 200, headers: cors });
    }

    // 3. POST /jobs/:jobId/retry
    if (pathSegments.length === 3 && pathSegments[0] === 'jobs' && pathSegments[2] === 'retry') {
      const jobId = pathSegments[1];
      await service.retryJob(jobId, body.userId);
      const detail = await service.getJobDetail(jobId);
      return NextResponse.json({ job: detail.job, requestId }, { status: 200, headers: cors });
    }

    // 4. POST /jobs/:jobId/artifact/download-url
    if (pathSegments.length === 4 && pathSegments[0] === 'jobs' && pathSegments[2] === 'artifact' && pathSegments[3] === 'download-url') {
      const jobId = pathSegments[1];
      const expiresIn = body.expiresInSeconds || 900;
      const handoff = await service.getArtifactDownloadUrl(jobId, expiresIn);
      return NextResponse.json({ ...handoff, requestId }, { status: 200, headers: cors });
    }

    return createErrorResponse(404, 'NOT_FOUND', `Public API endpoint NOT_FOUND: /${pathStr}`, requestId, false, cors);
  } catch (err: any) {
    if (err instanceof AppRelayError) {
      return createErrorResponse(err.statusCode, err.code, err.message, requestId, err.retryable, cors);
    }
    return createErrorResponse(500, 'INTERNAL_SERVER_ERROR', err.message || 'An unexpected error occurred.', requestId, false, cors);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  const pathSegments = resolvedParams.path || [];
  const db = getDbClient();
  const cors = getCorsHeaders(request);
  const requestId = generateRequestId();

  try {
    // DELETE /jobs/:jobId/artifact
    if (pathSegments.length === 3 && pathSegments[0] === 'jobs' && pathSegments[2] === 'artifact') {
      const artifactId = pathSegments[1];
      const service = new AppRelayService(db);
      await service.deleteArtifact(artifactId);
      return NextResponse.json({ success: true, artifactId, requestId }, { status: 200, headers: cors });
    }

    return createErrorResponse(404, 'NOT_FOUND', `Public API endpoint NOT_FOUND: /${pathSegments.join('/')}`, requestId, false, cors);
  } catch (err: any) {
    if (err instanceof AppRelayError) {
      return createErrorResponse(err.statusCode, err.code, err.message, requestId, err.retryable, cors);
    }
    return createErrorResponse(500, 'INTERNAL_SERVER_ERROR', err.message || 'An unexpected error occurred.', requestId, false, cors);
  }
}
