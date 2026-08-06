// Contract Test Suite for Release Ops Worker API Gateway

import { WorkerApiRouter } from '../router';

class MockDbClient {
  public workers: Map<string, any> = new Map();
  public jobs: Map<string, any> = new Map();
  public events: any[] = [];
  public artifacts: any[] = [];

  // RPC Mock Dispatcher
  async rpc(procedureName: string, params: any) {
    if (procedureName === 'release_ops_register_worker') {
      const id = 'w_12345';
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
        return { data: [{ renewed: true, is_cancelled: false }], error: null };
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
                return Promise.resolve({ data: data, error: null });
              },
            };
          },
        };
      },
    };
  }
}

async function runTests() {
  console.log('--- STARTING WORKER GATEWAY CONTRACT TESTS ---');

  const mockDb = new MockDbClient();
  const router = new WorkerApiRouter(mockDb);
  const token = process.env.RELEASE_OPS_WORKER_TOKEN || 'dev-worker-token-secret-key';
  const headers = { authorization: `Bearer ${token}` };

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

  // 1. Missing Token Test
  const res1 = await router.dispatch('POST', ['workers', 'register'], {}, { workerName: 'w1' });
  assert(res1.status === 401 && res1.body.error.code === 'UNAUTHORIZED', 'Missing token returns 401 UNAUTHORIZED');

  // 2. Register Worker Test
  const res2 = await router.dispatch('POST', ['workers', 'register'], headers, { workerName: 'test-worker-1' });
  assert(res2.status === 200 && res2.body.worker.workerName === 'test-worker-1', 'Register worker succeeds');
  const workerId = res2.body.worker.id;

  // 3. Worker Heartbeat Test
  const res3 = await router.dispatch('POST', ['workers', 'heartbeat'], headers, { workerId });
  assert(res3.status === 200 && res3.body.success === true, 'Worker heartbeat succeeds');

  // 4. Claim Job (Empty Queue) Test
  const res4 = await router.dispatch('POST', ['jobs', 'claim'], headers, { workerId });
  assert(res4.status === 200 && res4.body.job === null && res4.body.pollAfterMs === 5000, 'Claim job on empty queue returns job: null');

  // Seed a job in Mock DB
  const testJobId = 'job_1001';
  mockDb.jobs.set(testJobId, {
    id: testJobId,
    job_type: 'pull_apk',
    status: 'queued',
    priority: 10,
    payload: { packageId: 'com.example.app' },
  });

  // 5. Claim Job (With Job in Queue) Test
  const res5 = await router.dispatch('POST', ['jobs', 'claim'], headers, { workerId, capabilities: ['pull_apk'] });
  assert(res5.status === 200 && res5.body.job.id === testJobId && res5.body.job.status === 'claimed', 'Claim job returns claimed job');

  // 6. Start Job Test
  const res6 = await router.dispatch('POST', ['jobs', testJobId, 'start'], headers, { workerId });
  assert(res6.status === 200 && res6.body.started === true, 'Start job succeeds');

  // 7. Job Heartbeat Test
  const res7 = await router.dispatch('POST', ['jobs', testJobId, 'heartbeat'], headers, { workerId });
  assert(res7.status === 200 && res7.body.renewed === true, 'Job heartbeat succeeds');

  // 8. Append Job Event Test
  const res8 = await router.dispatch('POST', ['jobs', testJobId, 'events'], headers, {
    workerId,
    stage: 'installing',
    message: 'Installing APK on AVD',
    progress: 45,
  });
  assert(res8.status === 200 && res8.body.recorded === true, 'Append job event succeeds');

  // 9. Upload Init Test
  const res9 = await router.dispatch('POST', ['jobs', testJobId, 'artifacts', 'upload-init'], headers, {
    workerId,
    fileName: 'app-release.zip',
    sizeBytes: 15400000,
  });
  assert(res9.status === 200 && res9.body.uploadUrl && res9.body.storagePath.includes(testJobId), 'Upload init returns signed URL and storage path');
  const storagePath = res9.body.storagePath;

  // 10. Upload Complete Test
  const res10 = await router.dispatch('POST', ['jobs', testJobId, 'artifacts', 'upload-complete'], headers, {
    workerId,
    storagePath,
    fileName: 'app-release.zip',
    checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    sizeBytes: 15400000,
  });
  assert(res10.status === 200 && res10.body.artifactId, 'Upload complete registers artifact in database');

  // 11. Succeed Job Test
  const res11 = await router.dispatch('POST', ['jobs', testJobId, 'succeed'], headers, {
    workerId,
    result: { schemaVersion: 1, versionName: '1.0.0', versionCode: 100 },
  });
  assert(res11.status === 200 && res11.body.succeeded === true, 'Succeed job updates status to succeeded');

  console.log(`\nTEST SUMMARY: ${passed} Passed, ${failed} Failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running contract tests:', err);
  process.exit(1);
});
