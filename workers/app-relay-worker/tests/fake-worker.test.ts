// Integration Test Suite for AppRelay Worker Foundation (Phase 5)

process.env.USE_FAKE_PIPELINE = 'true';

import { WorkerApiRouter } from '../../../dashboard/lib/release-ops-worker-api/router';
import { GatewayClient } from '../src/api/gateway-client';
import { loadWorkerConfig } from '../src/config/env';
import { WorkerEngine } from '../src/runtime/worker-engine';

class MockDbClient {
  public workers: Map<string, any> = new Map();
  public jobs: Map<string, any> = new Map();
  public events: any[] = [];
  public artifacts: any[] = [];

  async rpc(procedureName: string, params: any) {
    if (procedureName === 'release_ops_register_worker') {
      const id = 'w_test_foundation_1';
      const worker = {
        id,
        worker_name: params.p_worker_name,
        status: 'active',
        max_parallel_jobs: params.p_max_parallel_jobs || 1,
        last_heartbeat: new Date().toISOString(),
        metadata: params.p_metadata || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.workers.set(id, worker);
      return { data: worker, error: null };
    }

    if (procedureName === 'release_ops_worker_heartbeat') {
      const worker = this.workers.get(params.p_worker_id);
      if (worker) {
        worker.last_heartbeat = new Date().toISOString();
        worker.status = params.p_status || 'active';
      }
      return { data: null, error: null };
    }

    if (procedureName === 'release_ops_claim_job') {
      const queuedJob = Array.from(this.jobs.values()).find((j) => j.status === 'queued');
      if (!queuedJob) {
        return { data: null, error: null };
      }
      queuedJob.status = 'claimed';
      queuedJob.worker_id = params.p_worker_id;
      queuedJob.lease_until = new Date(Date.now() + (params.p_lease_seconds || 300) * 1000).toISOString();
      return { data: [queuedJob], error: null };
    }

    if (procedureName === 'release_ops_start_job') {
      const job = this.jobs.get(params.p_job_id);
      if (job && job.worker_id === params.p_worker_id) {
        job.status = 'running';
        return { data: true, error: null };
      }
      return { data: false, error: null };
    }

    if (procedureName === 'release_ops_job_heartbeat') {
      const job = this.jobs.get(params.p_job_id);
      if (job && job.worker_id === params.p_worker_id) {
        job.lease_until = new Date(Date.now() + (params.p_lease_seconds || 300) * 1000).toISOString();
        return { data: [{ renewed: true, is_cancelled: job.status === 'cancelled' }], error: null };
      }
      return { data: [{ renewed: false, is_cancelled: false }], error: null };
    }

    if (procedureName === 'release_ops_append_job_event') {
      this.events.push({
        job_id: params.p_job_id,
        worker_id: params.p_worker_id,
        level: params.p_level,
        stage: params.p_stage,
        message: params.p_message,
        progress: params.p_progress,
      });
      return { data: true, error: null };
    }

    if (procedureName === 'release_ops_complete_job') {
      const job = this.jobs.get(params.p_job_id);
      if (job && job.worker_id === params.p_worker_id) {
        job.status = 'succeeded';
        job.result = params.p_result;
        return { data: true, error: null };
      }
      return { data: false, error: null };
    }

    if (procedureName === 'release_ops_fail_job') {
      const job = this.jobs.get(params.p_job_id);
      if (job && job.worker_id === params.p_worker_id) {
        job.status = 'failed';
        job.error_message = params.p_error_message;
        return { data: true, error: null };
      }
      return { data: false, error: null };
    }

    return { data: null, error: new Error(`Unknown RPC procedure: ${procedureName}`) };
  }

  from(tableName: string) {
    const self = this;
    return {
      select() {
        return {
          eq(field: string, value: any) {
            return {
              is() {
                return {
                  limit() {
                    return {
                      maybeSingle() {
                        const found = self.artifacts.find((a) => a.job_id === value);
                        return Promise.resolve({ data: found || null, error: null });
                      },
                    };
                  },
                };
              },
              single() {
                if (tableName === 'release_ops_jobs') {
                  const found = self.jobs.get(value);
                  return Promise.resolve({ data: found || null, error: found ? null : new Error('Not found') });
                }
                return Promise.resolve({ data: null, error: null });
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
                if (tableName === 'release_ops_artifacts') {
                  const record = { id: 'art_' + Date.now(), ...data, created_at: new Date().toISOString() };
                  self.artifacts.push(record);
                  return Promise.resolve({ data: record, error: null });
                }
                return Promise.resolve({ data, error: null });
              },
            };
          },
        };
      },
    };
  }
}

class InProcessGatewayClient extends GatewayClient {
  private router: WorkerApiRouter;

  constructor(config: any, db: any) {
    super(config);
    this.router = new WorkerApiRouter(db);
  }

  // Override HTTP fetch with direct router dispatch
  private async request<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const segments = path.split('/');
    const headers = { authorization: `Bearer dev-worker-token-secret-key` };

    const res = await this.router.dispatch('POST', segments, headers, body);
    if (res.status !== 200) {
      throw new Error(res.body.error?.message || 'Gateway error');
    }
    return res.body as T;
  }
}

async function runWorkerFoundationTest() {
  console.log('--- STARTING APPRELAY WORKER FOUNDATION TESTS (PHASE 5) ---');

  const mockDb = new MockDbClient();
  const config = loadWorkerConfig();
  const mockClient = new InProcessGatewayClient(config, mockDb);
  const engine = new WorkerEngine(config, mockClient as any);

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`✗ [FAIL] ${testName}`);
      failed++;
    }
  }

  // Seed a test job in mock DB
  const testJobId = 'job_phase5_001';
  mockDb.jobs.set(testJobId, {
    id: testJobId,
    job_type: 'pull_apk',
    status: 'queued',
    priority: 10,
    payload: { packageId: 'com.sinomedia.apptest' },
  });

  // 1. Start Worker Engine
  await engine.start();
  assert(mockDb.workers.size === 1, 'Worker registered successfully with Gateway');

  // 2. Wait for claim and execution of test job
  console.log('Waiting for fake worker pipeline execution...');
  await new Promise((resolve) => setTimeout(resolve, 3500));

  const completedJob = mockDb.jobs.get(testJobId);
  assert(completedJob.status === 'succeeded', 'Fake pull_apk job executed and succeeded');
  assert(completedJob.result.versionName === '1.0.0', 'Job result contains valid version metadata');

  // 3. Verify stage events recorded
  const events = mockDb.events;
  assert(events.length >= 6, 'Multiple stage progress events streamed to Gateway');
  assert(events.some((e) => e.stage === 'scraping_listing'), 'Recorded scraping_listing event');
  assert(events.some((e) => e.stage === 'uploading_artifact'), 'Recorded uploading_artifact event');
  assert(events.some((e) => e.stage === 'cleaning_up'), 'Recorded cleaning_up event');

  // 4. Verify artifact record
  assert(mockDb.artifacts.length === 1, 'Artifact uploaded and metadata recorded in database');

  // 5. Stop Worker Engine
  await engine.stop();
  const workerRecord = Array.from(mockDb.workers.values())[0];
  assert(workerRecord.status === 'offline', 'Worker status updated to offline on graceful shutdown');

  console.log(`\nTEST SUMMARY: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runWorkerFoundationTest().catch((err) => {
  console.error('Fatal error in worker foundation test:', err);
  process.exit(1);
});
