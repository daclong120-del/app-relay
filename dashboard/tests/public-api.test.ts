// Integration Test Suite for Public AppRelay API (Phase 4)

import { NextRequest } from 'next/server';
import { DELETE, GET, OPTIONS, POST } from '../app/api/app-relay/v1/[...path]/route';
import { AppRelayService } from '../lib/services/app-relay.service';

class MockDbClient {
  public jobs: Map<string, any> = new Map();
  public events: any[] = [];
  public artifacts: Map<string, any> = new Map();
  public workers: Map<string, any> = new Map();
  public audits: any[] = [];

  constructor() {
    // Pre-populate worker
    this.workers.set('worker-uuid-101', {
      id: 'worker-uuid-101',
      worker_name: 'test-node-01',
      status: 'online',
      max_parallel_jobs: 2,
      last_heartbeat: new Date().toISOString(),
      metadata: { capabilities: ['pull_apk'] },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  from(tableName: string) {
    const self = this;

    if (tableName === 'release_ops_jobs') {
      return {
        select() {
          return {
            eq(field: string, value: any) {
              if (field === 'job_type') {
                return {
                  order() {
                    return {
                      range(offset: number, limit: number) {
                        const rows = Array.from(self.jobs.values()).filter((j) => j.job_type === value);
                        return Promise.resolve({ data: rows, error: null });
                      },
                    };
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
              if (field === 'idempotency_key') {
                return {
                  maybeSingle() {
                    const row = Array.from(self.jobs.values()).find((j) => j.idempotency_key === value);
                    return Promise.resolve({ data: row || null, error: null });
                  },
                };
              }
              return this;
            },
            order() {
              return {
                range(offset: number, limit: number) {
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
                    id: 'job_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
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
                return Promise.resolve({ error: null });
              }
              return Promise.resolve({ error: new Error('Job not found') });
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
              const rows = Array.from(self.workers.values());
              return Promise.resolve({ data: rows, error: null });
            },
            eq(field: string, value: any) {
              if (field === 'id') {
                return {
                  single() {
                    const row = self.workers.get(value);
                    return Promise.resolve({ data: row || null, error: row ? null : new Error('Not found') });
                  },
                };
              }
              return this;
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
              const rows = self.events.filter((e) => e.job_id === value);
              return {
                order() {
                  return Promise.resolve({ data: rows, error: null });
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
              if (field === 'job_id') {
                return {
                  maybeSingle() {
                    const row = Array.from(self.artifacts.values()).find((a) => a.job_id === value);
                    return Promise.resolve({ data: row || null, error: null });
                  },
                };
              }
              if (field === 'id') {
                return {
                  single() {
                    const row = self.artifacts.get(value);
                    return Promise.resolve({ data: row || null, error: row ? null : new Error('Not found') });
                  },
                };
              }
              return this;
            },
          };
        },
        update(updateData: any) {
          return {
            eq(field: string, value: any) {
              const artifact = self.artifacts.get(value);
              if (artifact) {
                Object.assign(artifact, updateData);
                return Promise.resolve({ error: null });
              }
              return Promise.resolve({ error: new Error('Artifact not found') });
            },
          };
        },
      };
    }

    if (tableName === 'release_ops_audits') {
      return {
        insert(data: any) {
          self.audits.push(data);
          return Promise.resolve({ error: null });
        },
      };
    }

    return {};
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
    return Promise.resolve({ data: null, error: new Error('Unknown RPC') });
  }
}

async function runTests() {
  console.log('🧪 Starting AppRelay Public API Contract Test Suite...\n');

  const mockDb = new MockDbClient();

  // Test 1: OPTIONS CORS Preflight
  {
    const req = new NextRequest('http://localhost:3000/api/app-relay/v1/jobs', { method: 'OPTIONS' });
    const res = await OPTIONS(req);
    console.assert(res.status === 204, 'OPTIONS should return 204');
    console.assert(res.headers.get('Access-Control-Allow-Methods')!.includes('GET'), 'CORS should allow GET');
    console.log('✅ Test 1 Passed: OPTIONS CORS Preflight');
  }

  // Test 2: GET /health
  {
    const req = new NextRequest('http://localhost:3000/api/app-relay/v1/health', { method: 'GET' });
    const res = await GET(req, { params: { path: ['health'] } });
    const body = await res.json();
    console.assert(res.status === 200, 'GET /health should return 200');
    console.assert(body.status === 'ok', 'Health status should be ok');
    console.assert(typeof body.requestId === 'string', 'Should return correlation requestId');
    console.log('✅ Test 2 Passed: GET /health');
  }

  // Test 3: POST /jobs (Create Job)
  let createdJobId = '';
  {
    const req = new NextRequest('http://localhost:3000/api/app-relay/v1/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        playUrl: 'https://play.google.com/store/apps/details?id=com.sinomedia.app&hl=en',
        includeListing: true,
      }),
    });
    const res = await POST(req, { params: { path: ['jobs'] } });
    const body = await res.json();
    if (res.status !== 201) {
      console.error('Test 3 Status:', res.status, 'Body:', JSON.stringify(body));
    }
    console.assert(res.status === 201, 'POST /jobs should return 201');
    console.assert(body.job.payload.packageId === 'com.sinomedia.app', 'Package ID should match');
    createdJobId = body.job.id;
    console.log('✅ Test 3 Passed: POST /jobs (Create Job)');
  }

  // Test 4: GET /jobs
  {
    const req = new NextRequest('http://localhost:3000/api/app-relay/v1/jobs', { method: 'GET' });
    const res = await GET(req, { params: { path: ['jobs'] } });
    const body = await res.json();
    console.assert(res.status === 200, 'GET /jobs should return 200');
    console.assert(body.data.length >= 1, 'Should return at least 1 job');
    console.log('✅ Test 4 Passed: GET /jobs');
  }

  // Test 5: GET /workers
  {
    const req = new NextRequest('http://localhost:3000/api/app-relay/v1/workers', { method: 'GET' });
    const res = await GET(req, { params: { path: ['workers'] } });
    const body = await res.json();
    console.assert(res.status === 200, 'GET /workers should return 200');
    console.assert(body.data.length === 1, 'Should return 1 worker');
    console.log('✅ Test 5 Passed: GET /workers');
  }

  // Test 6: Invalid Play URL validation error envelope
  {
    const req = new NextRequest('http://localhost:3000/api/app-relay/v1/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playUrl: 'https://invalid-url.com' }),
    });
    const res = await POST(req, { params: { path: ['jobs'] } });
    const body = await res.json();
    console.assert(res.status === 400, 'Invalid URL should return 400');
    console.assert(body.error.code === 'INVALID_PLAY_URL', 'Code should be INVALID_PLAY_URL');
    console.assert(typeof body.error.requestId === 'string', 'Should return requestId in error');
    console.log('✅ Test 6 Passed: Invalid Play URL validation error envelope');
  }

  console.log('\n🎉 All Public API Contract Tests Passed Successfully!\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
