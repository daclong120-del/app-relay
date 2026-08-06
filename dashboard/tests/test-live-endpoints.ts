// AppRelay Live HTTP Endpoint Integration Test Suite (v1.3.1)
// Performs network HTTP calls against a live server endpoint (e.g. http://79.108.216.178:3000/api/app-relay/v1 or http://localhost:3000/api/app-relay/v1)

import { NextRequest } from 'next/server';
import { DELETE, GET, OPTIONS, POST } from '../app/api/app-relay/v1/[...path]/route';

// Parse command line arguments or environment variables
const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  if (index !== -1 && args[index + 1]) {
    return args[index + 1];
  }
  return undefined;
}

const TARGET_URL = getArg('url') || process.env.API_BASE_URL || 'http://localhost:3000/api/app-relay/v1';
const AUTH_TOKEN = getArg('token') || process.env.AUTH_TOKEN || 'test-bearer-token-123';
const IS_DIRECT_ROUTE = TARGET_URL.includes('localhost') || getArg('mode') === 'direct';

export async function runLiveEndpointsTest() {
  console.log('================================================================');
  console.log('🚀 AppRelay Live Endpoint Test Suite (v1.3.1)');
  console.log(`🌐 Target Base URL: ${TARGET_URL}`);
  console.log(`🔑 Auth Mode: ${AUTH_TOKEN ? 'Bearer Token Provided' : 'Unauthenticated'}`);
  console.log('================================================================\n');

  let totalPassed = 0;
  let totalFailed = 0;

  function assert(condition: boolean, testId: string, description: string, extraInfo?: any) {
    if (condition) {
      console.log(`  ✅ PASS [${testId}]: ${description}`);
      totalPassed++;
    } else {
      console.error(`  ❌ FAIL [${testId}]: ${description}`, extraInfo ? JSON.stringify(extraInfo) : '');
      totalFailed++;
    }
  }

  // Unified Request Dispatcher (Network fetch vs Direct Next.js handler)
  async function sendRequest(
    path: string,
    method: 'GET' | 'POST' | 'DELETE' | 'OPTIONS' = 'GET',
    body?: any,
    customHeaders?: Record<string, string>
  ): Promise<{ status: number; headers: Headers; json: () => Promise<any> }> {
    const fullUrl = `${TARGET_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${AUTH_TOKEN}`,
      ...customHeaders,
    };

    if (IS_DIRECT_ROUTE) {
      // Direct Next.js Route Handler invocation
      const req = new NextRequest(fullUrl, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const pathSegments = path.split('?')[0].split('/').filter(Boolean);
      const params = Promise.resolve({ path: pathSegments });

      let res: any;
      if (method === 'OPTIONS') res = await OPTIONS(req);
      else if (method === 'GET') res = await GET(req, { params });
      else if (method === 'POST') res = await POST(req, { params });
      else if (method === 'DELETE') res = await DELETE(req, { params });

      return {
        status: res.status,
        headers: res.headers,
        json: () => res.json(),
      };
    } else {
      // Real Network HTTP fetch
      const res = await fetch(fullUrl, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      return {
        status: res.status,
        headers: res.headers,
        json: () => res.json(),
      };
    }
  }

  // -------------------------------------------------------------------------
  // 1. CORS Preflight Checks (OPTIONS)
  // -------------------------------------------------------------------------
  console.log('📌 Suite 1: CORS Preflight Checks (OPTIONS)');
  {
    const res = await sendRequest('jobs', 'OPTIONS', undefined, { origin: 'https://partner-portal.com' });
    assert(res.status === 204, 'LIVE-CORS-001', 'OPTIONS returns HTTP 204 No Content status');
    assert(res.headers.get('Access-Control-Allow-Methods')?.includes('GET') ?? false, 'LIVE-CORS-002', 'Access-Control-Allow-Methods includes GET');
    assert(res.headers.get('Access-Control-Allow-Methods')?.includes('POST') ?? false, 'LIVE-CORS-003', 'Access-Control-Allow-Methods includes POST');
  }

  // -------------------------------------------------------------------------
  // 2. GET /health
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 2: GET /health (Health & Liveness Check)');
  {
    const res = await sendRequest('health', 'GET');
    const body = await res.json();

    assert(res.status === 200, 'LIVE-HEALTH-001', 'GET /health returns HTTP 200 OK');
    assert(body.status === 'ok', 'LIVE-HEALTH-002', 'Body contains status="ok"');
    assert(body.service === 'app-relay-api', 'LIVE-HEALTH-003', 'Body contains service="app-relay-api"');
    assert(typeof body.version === 'string', 'LIVE-HEALTH-004', 'Body contains version string');
    assert(typeof body.requestId === 'string' && body.requestId.startsWith('req_'), 'LIVE-HEALTH-005', 'Body contains valid correlation requestId');
    assert(new Date(body.timestamp).getTime() > 0, 'LIVE-HEALTH-006', 'Body contains valid ISO-8601 timestamp');
  }

  // -------------------------------------------------------------------------
  // 3. GET /overview
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 3: GET /overview (Aggregated Dashboard Metrics)');
  {
    const res = await sendRequest('overview', 'GET');
    const body = await res.json();

    assert(res.status === 200, 'LIVE-OVERVIEW-001', 'GET /overview returns HTTP 200 OK');
    assert(typeof body.totalJobs === 'number', 'LIVE-OVERVIEW-002', 'Includes totalJobs count');
    assert(typeof body.activeJobs === 'number', 'LIVE-OVERVIEW-003', 'Includes activeJobs count');
    assert(typeof body.queuedJobs === 'number', 'LIVE-OVERVIEW-004', 'Includes queuedJobs count');
    assert(typeof body.succeededJobs === 'number', 'LIVE-OVERVIEW-005', 'Includes succeededJobs count');
    assert(typeof body.failedJobs === 'number', 'LIVE-OVERVIEW-006', 'Includes failedJobs count');
    assert(typeof body.onlineWorkers === 'number', 'LIVE-OVERVIEW-007', 'Includes onlineWorkers count');
    assert(typeof body.requestId === 'string', 'LIVE-OVERVIEW-008', 'Includes correlation requestId');
  }

  // -------------------------------------------------------------------------
  // 4. GET /apps
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 4: GET /apps (App Catalog Listing)');
  {
    const res = await sendRequest('apps', 'GET');
    const body = await res.json();

    assert(res.status === 200, 'LIVE-APPS-001', 'GET /apps returns HTTP 200 OK');
    assert(Array.isArray(body.data), 'LIVE-APPS-002', 'Response data is an array');
    assert(typeof body.totalItems === 'number', 'LIVE-APPS-003', 'Response includes totalItems count');
    assert(typeof body.requestId === 'string', 'LIVE-APPS-004', 'Response contains correlation requestId');
  }

  // -------------------------------------------------------------------------
  // 5. POST /jobs (Create APK Pull Job & Validations)
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 5: POST /jobs (Single Job Submission & Input Validation)');
  let createdJobId = '';
  {
    // 5a. Positive Job Creation
    const validRes = await sendRequest('jobs', 'POST', {
      playUrl: 'https://play.google.com/store/apps/details?id=com.facemoji.lite',
      includeListing: true,
      includeScreenshots: true,
    });
    const validBody = await validRes.json();

    assert(validRes.status === 201, 'LIVE-JOB-CREATE-001', 'POST /jobs returns HTTP 201 Created for valid Google Play URL', validBody);
    assert(validBody.job?.payload?.packageId === 'com.facemoji.lite', 'LIVE-JOB-CREATE-002', 'Package ID correctly parsed');
    assert(validBody.job?.status === 'queued', 'LIVE-JOB-CREATE-003', 'Initial job status set to queued');
    assert(typeof validBody.requestId === 'string', 'LIVE-JOB-CREATE-004', 'Response contains correlation requestId');

    if (validBody.job?.id) {
      createdJobId = validBody.job.id;
    }

    // 5b. Invalid Domain Validation
    const badDomainRes = await sendRequest('jobs', 'POST', {
      playUrl: 'https://attacker.com/malicious-app',
    });
    const badDomainBody = await badDomainRes.json();

    assert(badDomainRes.status === 400, 'LIVE-JOB-CREATE-005', 'Invalid domain returns HTTP 400 Bad Request');
    assert(badDomainBody.error?.code === 'INVALID_PLAY_URL', 'LIVE-JOB-CREATE-006', 'Error code is INVALID_PLAY_URL');
    assert(badDomainBody.error?.retryable === false, 'LIVE-JOB-CREATE-007', 'Error retryable flag is false');

    // 5c. SSRF Protocol Validation
    const ssrfRes = await sendRequest('jobs', 'POST', {
      playUrl: 'file:///etc/passwd',
    });
    assert(ssrfRes.status === 400, 'LIVE-JOB-CREATE-008', 'Malicious file:// scheme blocked with HTTP 400');
  }

  // -------------------------------------------------------------------------
  // 6. POST /jobs/batch (Batch Submission)
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 6: POST /jobs/batch (Batch Job Processing)');
  {
    const batchRes = await sendRequest('jobs/batch', 'POST', {
      urls: [
        'https://play.google.com/store/apps/details?id=com.facemoji.lite',
        'https://play.google.com/store/apps/details?id=com.locket.Locket',
        'invalid-url-entry',
      ],
    });
    const batchBody = await batchRes.json();

    assert(batchRes.status === 207, 'LIVE-JOB-BATCH-001', 'POST /jobs/batch returns HTTP 207 Multi-Status');
    assert(Array.isArray(batchBody.data), 'LIVE-JOB-BATCH-002', 'Data property contains array of submitted jobs');
    assert(batchBody.totalSubmitted === 3, 'LIVE-JOB-BATCH-003', 'totalSubmitted equals input URL count');
  }

  // -------------------------------------------------------------------------
  // 7. GET /jobs (Job List & Filtering)
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 7: GET /jobs (List Jobs, Pagination & Search)');
  {
    const listRes = await sendRequest('jobs?page=1&pageSize=10', 'GET');
    const listBody = await listRes.json();

    assert(listRes.status === 200, 'LIVE-JOB-LIST-001', 'GET /jobs returns HTTP 200 OK');
    assert(Array.isArray(listBody.data), 'LIVE-JOB-LIST-002', 'Data is array');
    assert(typeof listBody.pagination?.page === 'number', 'LIVE-JOB-LIST-003', 'Pagination contains page number');
    assert(typeof listBody.pagination?.totalItems === 'number', 'LIVE-JOB-LIST-004', 'Pagination contains totalItems');

    // Search Filter
    const searchRes = await sendRequest('jobs?search=facemoji', 'GET');
    const searchBody = await searchRes.json();
    assert(searchRes.status === 200, 'LIVE-JOB-LIST-005', 'GET /jobs search filter returns HTTP 200 OK');
    assert(Array.isArray(searchBody.data), 'LIVE-JOB-LIST-006', 'Filtered search returns array');
  }

  // -------------------------------------------------------------------------
  // 8. GET /jobs/{jobId} (Job Detail)
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 8: GET /jobs/{jobId} (Job Detail & 404 Verification)');
  {
    if (createdJobId) {
      const detailRes = await sendRequest(`jobs/${createdJobId}`, 'GET');
      const detailBody = await detailRes.json();

      assert(detailRes.status === 200, 'LIVE-JOB-DETAIL-001', 'GET /jobs/{jobId} returns HTTP 200 OK for valid ID');
      assert(detailBody.job?.id === createdJobId, 'LIVE-JOB-DETAIL-002', 'Returned job ID matches requested ID');
    }

    // 404 Not Found Test
    const missingId = '00000000-0000-0000-0000-000000000000';
    const missingRes = await sendRequest(`jobs/${missingId}`, 'GET');
    const missingBody = await missingRes.json();

    assert(missingRes.status === 404, 'LIVE-JOB-DETAIL-003', 'Non-existent jobId returns HTTP 404 Not Found');
    assert(missingBody.error?.code === 'JOB_NOT_FOUND', 'LIVE-JOB-DETAIL-004', 'Error code is JOB_NOT_FOUND');
  }

  // -------------------------------------------------------------------------
  // 9. GET /jobs/{jobId}/events (Job Events Timeline)
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 9: GET /jobs/{jobId}/events (Job Timeline Events)');
  {
    const targetJobId = createdJobId || 'job_succeeded_001';
    const eventsRes = await sendRequest(`jobs/${targetJobId}/events`, 'GET');
    const eventsBody = await eventsRes.json();

    assert(eventsRes.status === 200, 'LIVE-JOB-EVENTS-001', 'GET /jobs/{jobId}/events returns HTTP 200 OK');
    assert(Array.isArray(eventsBody.data), 'LIVE-JOB-EVENTS-002', 'Events data is array');
  }

  // -------------------------------------------------------------------------
  // 10. POST /jobs/{jobId}/cancel & /retry (Actions)
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 10: POST /jobs/{jobId}/cancel & /retry (Job Actions)');
  {
    if (createdJobId) {
      // Cancel Action
      const cancelRes = await sendRequest(`jobs/${createdJobId}/cancel`, 'POST', { reason: 'Partner verification testing' });
      const cancelBody = await cancelRes.json();

      assert(cancelRes.status === 200, 'LIVE-JOB-CANCEL-001', 'POST /jobs/{jobId}/cancel returns HTTP 200 OK');
      assert(cancelBody.job?.status === 'cancelled', 'LIVE-JOB-CANCEL-002', 'Job status updated to cancelled');
    }

    // Retry Failed Job
    const failedJobId = 'job_failed_001';
    const retryRes = await sendRequest(`jobs/${failedJobId}/retry`, 'POST', { reason: 'Retrying failed job' });
    const retryBody = await retryRes.json();

    assert(retryRes.status === 200, 'LIVE-JOB-RETRY-001', 'POST /jobs/{jobId}/retry returns HTTP 200 OK');
    assert(retryBody.job?.status === 'queued', 'LIVE-JOB-RETRY-002', 'Job status re-queued upon retry');
  }

  // -------------------------------------------------------------------------
  // 11. POST /jobs/{jobId}/artifact/download-url
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 11: POST /jobs/{jobId}/artifact/download-url');
  {
    // Valid Download URL
    const validJobId = 'job_succeeded_001';
    const validArtRes = await sendRequest(`jobs/${validJobId}/artifact/download-url`, 'POST', { expiresInSeconds: 600 });
    const validArtBody = await validArtRes.json();

    assert(validArtRes.status === 200, 'LIVE-JOB-ARTIFACT-001', 'Valid job returns HTTP 200 OK with download URL');
    assert(typeof validArtBody.downloadUrl === 'string', 'LIVE-JOB-ARTIFACT-002', 'Response contains downloadUrl string');

    // Missing Artifact 404
    const missingArtJobId = 'job_no_artifact_099';
    const noArtRes = await sendRequest(`jobs/${missingArtJobId}/artifact/download-url`, 'POST', { expiresInSeconds: 600 });
    const noArtBody = await noArtRes.json();

    assert(noArtRes.status === 404, 'LIVE-JOB-ARTIFACT-003', 'Missing artifact returns HTTP 404 Not Found');
    assert(noArtBody.error?.code === 'ARTIFACT_NOT_FOUND', 'LIVE-JOB-ARTIFACT-004', 'Error code is ARTIFACT_NOT_FOUND');
  }

  // -------------------------------------------------------------------------
  // 12. DELETE /jobs/{artifactId}/artifact (Artifact Deletion)
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 12: DELETE /jobs/{artifactId}/artifact');
  {
    const targetArtId = 'art_001';
    const delRes = await sendRequest(`jobs/${targetArtId}/artifact`, 'DELETE');
    const delBody = await delRes.json();

    assert(delRes.status === 200, 'LIVE-JOB-DELETE-001', 'DELETE /jobs/{artifactId}/artifact returns HTTP 200 OK');
    assert(delBody.success === true, 'LIVE-JOB-DELETE-002', 'Response contains success=true');
    assert(delBody.artifactId === targetArtId, 'LIVE-JOB-DELETE-003', 'Response echoes artifactId');
  }

  // -------------------------------------------------------------------------
  // 13. Workers Fleet & Detail Endpoints
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 13: Workers Fleet & Detail Endpoints');
  {
    // GET /workers
    const workersRes = await sendRequest('workers', 'GET');
    const workersBody = await workersRes.json();
    assert(workersRes.status === 200, 'LIVE-WORKER-001', 'GET /workers returns HTTP 200 OK');
    assert(Array.isArray(workersBody.data), 'LIVE-WORKER-002', 'Workers data is array');

    // GET /workers/fleet-status
    const fleetRes = await sendRequest('workers/fleet-status', 'GET');
    const fleetBody = await fleetRes.json();
    assert(fleetRes.status === 200, 'LIVE-WORKER-FLEET-001', 'GET /workers/fleet-status returns HTTP 200 OK');
    assert(typeof fleetBody.totalWorkers === 'number', 'LIVE-WORKER-FLEET-002', 'Includes totalWorkers count');
    assert(typeof fleetBody.onlineWorkersCount === 'number', 'LIVE-WORKER-FLEET-003', 'Includes onlineWorkersCount');

    // Missing worker 404
    const badWorkerId = '00000000-0000-0000-0000-000000000000';
    const badWorkerRes = await sendRequest(`workers/${badWorkerId}`, 'GET');
    const badWorkerBody = await badWorkerRes.json();
    assert(badWorkerRes.status === 404, 'LIVE-WORKER-DETAIL-001', 'Missing worker returns HTTP 404 Not Found');
    assert(badWorkerBody.error?.code === 'WORKER_NOT_FOUND', 'LIVE-WORKER-DETAIL-002', 'Error code is WORKER_NOT_FOUND');
  }

  // -------------------------------------------------------------------------
  // 14. Route Router 404 Error Envelope Check
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 14: Router 404 Error Envelope Validation');
  {
    const badPathRes = await sendRequest('unmatched-path-xyz', 'GET');
    const badPathBody = await badPathRes.json();

    assert(badPathRes.status === 404, 'LIVE-ROUTE-404-001', 'Unmatched path returns HTTP 404 Not Found');
    assert(badPathBody.error?.code === 'NOT_FOUND', 'LIVE-ROUTE-404-002', 'Error code is NOT_FOUND');
    assert(typeof badPathBody.error?.requestId === 'string', 'LIVE-ROUTE-404-003', 'Error envelope contains correlation requestId');
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`📊 Live Endpoints Test Suite Results:`);
  console.log(`   Passed: ${totalPassed}`);
  console.log(`   Failed: ${totalFailed}`);
  console.log('================================================================\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runLiveEndpointsTest().catch((err) => {
    console.error('❌ Live test runner crashed:', err);
    process.exit(1);
  });
}
