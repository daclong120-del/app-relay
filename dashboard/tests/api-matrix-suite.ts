// AppRelay Comprehensive Public API Test Matrix Suite (v1.3.1)
// Automated execution of API test matrix from docs/API_TEST_GUIDE_FOR_DEV.md & docs/06-testing/API_TEST_CASE_MATRIX_FOR_DEV.md

import { NextRequest } from 'next/server';
import { DELETE, GET, OPTIONS, POST } from '../app/api/app-relay/v1/[...path]/route';

const BASE_URL = 'http://localhost:3000/api/app-relay/v1';

export async function runApiMatrixSuite() {
  console.log('================================================================');
  console.log('🚀 Starting AppRelay API Matrix Automated Test Suite (v1.3.1)');
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

  // Helper for Route Parameters
  function makeParams(pathStr: string) {
    return Promise.resolve({ path: pathStr.split('/').filter(Boolean) });
  }

  // -------------------------------------------------------------------------
  // 1. CORS Preflight (OPTIONS)
  // -------------------------------------------------------------------------
  console.log('📌 Suite 1: CORS Preflight Checks');
  {
    const req = new NextRequest(`${BASE_URL}/jobs`, { method: 'OPTIONS', headers: { origin: 'https://admin.example.com' } });
    const res = await OPTIONS(req);
    assert(res.status === 204, 'CORS-001', 'OPTIONS returns 204 No Content status');
    assert(res.headers.get('Access-Control-Allow-Methods')!.includes('GET'), 'CORS-002', 'Header includes GET method');
    assert(res.headers.get('Access-Control-Allow-Methods')!.includes('POST'), 'CORS-003', 'Header includes POST method');
  }

  // -------------------------------------------------------------------------
  // 2. GET /health
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 2: GET /health (Health Check)');
  {
    const req = new NextRequest(`${BASE_URL}/health`, { method: 'GET' });
    const res = await GET(req, { params: makeParams('health') });
    const body = await res.json();

    assert(res.status === 200, 'HEALTH-001', 'GET /health returns HTTP 200 OK');
    assert(body.status === 'ok', 'HEALTH-002', 'Response contains status="ok"');
    assert(body.service === 'app-relay-api', 'HEALTH-003', 'Response contains correct service name');
    assert(typeof body.version === 'string', 'HEALTH-004', 'Response contains version string');
    assert(typeof body.requestId === 'string' && body.requestId.startsWith('req_'), 'HEALTH-005', 'Response contains valid correlation requestId');
    assert(new Date(body.timestamp).getTime() > 0, 'HEALTH-006', 'Response timestamp is valid ISO-8601');
  }

  // -------------------------------------------------------------------------
  // 3. GET /overview
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 3: GET /overview (Dashboard Aggregated Stats)');
  {
    const req = new NextRequest(`${BASE_URL}/overview`, { method: 'GET' });
    const res = await GET(req, { params: makeParams('overview') });
    const body = await res.json();

    assert(res.status === 200, 'OVERVIEW-001', 'GET /overview returns HTTP 200 OK');
    assert(typeof body.totalJobs === 'number', 'OVERVIEW-002', 'Contains totalJobs metric');
    assert(typeof body.activeJobs === 'number', 'OVERVIEW-003', 'Contains activeJobs metric');
    assert(typeof body.queuedJobs === 'number', 'OVERVIEW-004', 'Contains queuedJobs metric');
    assert(typeof body.succeededJobs === 'number', 'OVERVIEW-005', 'Contains succeededJobs metric');
    assert(typeof body.failedJobs === 'number', 'OVERVIEW-006', 'Contains failedJobs metric');
    assert(typeof body.onlineWorkers === 'number', 'OVERVIEW-007', 'Contains onlineWorkers metric');
    assert(typeof body.requestId === 'string', 'OVERVIEW-008', 'Contains correlation requestId');
  }

  // -------------------------------------------------------------------------
  // 4. GET /apps
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 4: GET /apps (App Catalog Listing)');
  {
    const req = new NextRequest(`${BASE_URL}/apps`, { method: 'GET' });
    const res = await GET(req, { params: makeParams('apps') });
    const body = await res.json();

    assert(res.status === 200, 'APPS-001', 'GET /apps returns HTTP 200 OK');
    assert(Array.isArray(body.data), 'APPS-002', 'Response data is an array');
    assert(typeof body.totalItems === 'number', 'APPS-003', 'Response includes totalItems count');
    assert(typeof body.requestId === 'string', 'APPS-004', 'Response contains correlation requestId');
  }

  // -------------------------------------------------------------------------
  // 5. POST /jobs (Create Job) & Validations
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 5: POST /jobs (Single Job Creation & Validation)');
  let createdJobId = '';
  {
    // 5a. Positive Job Creation
    const validReq = new NextRequest(`${BASE_URL}/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        playUrl: 'https://play.google.com/store/apps/details?id=com.facemoji.lite',
        includeListing: true,
        includeScreenshots: true,
      }),
    });
    const validRes = await POST(validReq, { params: makeParams('jobs') });
    const validBody = await validRes.json();

    assert(validRes.status === 201, 'JOB-CREATE-001', 'Valid Play URL creates job with HTTP 201 Created');
    assert(validBody.job?.payload?.packageId === 'com.facemoji.lite', 'JOB-CREATE-002', 'Parses packageId correctly');
    assert(validBody.job?.status === 'queued', 'JOB-CREATE-003', 'Initial job status is queued');
    assert(typeof validBody.requestId === 'string', 'JOB-CREATE-004', 'Response contains correlation requestId');

    if (validBody.job?.id) {
      createdJobId = validBody.job.id;
    }

    // 5b. Invalid Play URL (Invalid Domain)
    const badDomainReq = new NextRequest(`${BASE_URL}/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playUrl: 'https://example.com/not-play-store' }),
    });
    const badDomainRes = await POST(badDomainReq, { params: makeParams('jobs') });
    const badDomainBody = await badDomainRes.json();

    assert(badDomainRes.status === 400, 'JOB-CREATE-005', 'Invalid domain returns HTTP 400 Bad Request');
    assert(badDomainBody.error?.code === 'INVALID_PLAY_URL', 'JOB-CREATE-006', 'Error envelope contains INVALID_PLAY_URL code');
    assert(badDomainBody.error?.retryable === false, 'JOB-CREATE-007', 'Error indicates retryable=false');

    // 5c. Malicious Scheme (SSRF Prevention)
    const ssrfReq = new NextRequest(`${BASE_URL}/jobs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playUrl: 'file:///etc/passwd' }),
    });
    const ssrfRes = await POST(ssrfReq, { params: makeParams('jobs') });
    assert(ssrfRes.status === 400, 'JOB-CREATE-008', 'Malicious file:// scheme blocked with HTTP 400');
  }

  // -------------------------------------------------------------------------
  // 6. POST /jobs/batch (Batch Submission)
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 6: POST /jobs/batch (Batch Job Processing)');
  {
    const batchReq = new NextRequest(`${BASE_URL}/jobs/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        urls: [
          'https://play.google.com/store/apps/details?id=com.facemoji.lite',
          'https://play.google.com/store/apps/details?id=com.locket.Locket',
          'invalid-url-item',
        ],
      }),
    });
    const batchRes = await POST(batchReq, { params: makeParams('jobs/batch') });
    const batchBody = await batchRes.json();

    assert(batchRes.status === 207, 'JOB-BATCH-001', 'Batch processing returns HTTP 207 Multi-Status');
    assert(Array.isArray(batchBody.data), 'JOB-BATCH-002', 'Response contains array of job submission results');
    assert(batchBody.totalSubmitted === 3, 'JOB-BATCH-003', 'totalSubmitted matches requested URLs count');
  }

  // -------------------------------------------------------------------------
  // 7. GET /jobs (Job List & Filtering)
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 7: GET /jobs (Listing, Pagination & Search)');
  {
    const listReq = new NextRequest(`${BASE_URL}/jobs?page=1&pageSize=10`, { method: 'GET' });
    const listRes = await GET(listReq, { params: makeParams('jobs') });
    const listBody = await listRes.json();

    assert(listRes.status === 200, 'JOB-LIST-001', 'GET /jobs returns HTTP 200 OK');
    assert(Array.isArray(listBody.data), 'JOB-LIST-002', 'Data property is an array');
    assert(typeof listBody.pagination?.page === 'number', 'JOB-LIST-003', 'Pagination contains page number');
    assert(typeof listBody.pagination?.totalItems === 'number', 'JOB-LIST-004', 'Pagination contains totalItems');

    // Filter Search Test
    const searchReq = new NextRequest(`${BASE_URL}/jobs?search=facemoji`, { method: 'GET' });
    const searchRes = await GET(searchReq, { params: makeParams('jobs') });
    const searchBody = await searchRes.json();
    assert(searchRes.status === 200, 'JOB-LIST-005', 'GET /jobs search filter returns HTTP 200 OK');
    assert(Array.isArray(searchBody.data), 'JOB-LIST-006', 'Filtered search returns array');
  }

  // -------------------------------------------------------------------------
  // 8. GET /jobs/{jobId} (Job Detail)
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 8: GET /jobs/{jobId} (Job Detail)');
  {
    if (createdJobId) {
      const detailReq = new NextRequest(`${BASE_URL}/jobs/${createdJobId}`, { method: 'GET' });
      const detailRes = await GET(detailReq, { params: makeParams(`jobs/${createdJobId}`) });
      const detailBody = await detailRes.json();

      assert(detailRes.status === 200, 'JOB-DETAIL-001', 'GET /jobs/{jobId} returns HTTP 200 OK for valid ID', detailBody);
      assert(detailBody.job?.id === createdJobId, 'JOB-DETAIL-002', 'Returned job ID matches requested ID', detailBody);
    }

    // 404 Not Found Test
    const missingId = '00000000-0000-0000-0000-000000000000';
    const missingReq = new NextRequest(`${BASE_URL}/jobs/${missingId}`, { method: 'GET' });
    const missingRes = await GET(missingReq, { params: makeParams(`jobs/${missingId}`) });
    const missingBody = await missingRes.json();

    assert(missingRes.status === 404, 'JOB-DETAIL-003', 'Non-existent job returns HTTP 404 Not Found', missingBody);
    assert(missingBody.error?.code === 'JOB_NOT_FOUND', 'JOB-DETAIL-004', 'Error code is JOB_NOT_FOUND', missingBody);
  }

  // -------------------------------------------------------------------------
  // 9. GET /jobs/{jobId}/events (Job Events Timeline)
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 9: GET /jobs/{jobId}/events (Job Timeline Events)');
  {
    const targetJobId = createdJobId || 'job_succeeded_001';
    const eventsReq = new NextRequest(`${BASE_URL}/jobs/${targetJobId}/events`, { method: 'GET' });
    const eventsRes = await GET(eventsReq, { params: makeParams(`jobs/${targetJobId}/events`) });
    const eventsBody = await eventsRes.json();

    assert(eventsRes.status === 200, 'JOB-EVENTS-001', 'GET /jobs/{jobId}/events returns HTTP 200 OK', eventsBody);
    assert(Array.isArray(eventsBody.data), 'JOB-EVENTS-002', 'Events response data is an array', eventsBody);
  }

  // -------------------------------------------------------------------------
  // 10. POST /jobs/{jobId}/cancel & POST /jobs/{jobId}/retry
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 10: POST /jobs/{jobId}/cancel & /retry (Actions)');
  {
    if (createdJobId) {
      // Cancel
      const cancelReq = new NextRequest(`${BASE_URL}/jobs/${createdJobId}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'Testing cancellation' }),
      });
      const cancelRes = await POST(cancelReq, { params: makeParams(`jobs/${createdJobId}/cancel`) });
      const cancelBody = await cancelRes.json();

      assert(cancelRes.status === 200, 'JOB-CANCEL-001', 'POST /jobs/{jobId}/cancel returns HTTP 200 OK', cancelBody);
      assert(cancelBody.job?.status === 'cancelled', 'JOB-CANCEL-002', 'Job status updated to cancelled', cancelBody);
    }

    // Retry failed job
    const failedJobId = 'job_failed_001';
    const retryReq = new NextRequest(`${BASE_URL}/jobs/${failedJobId}/retry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'Testing retry action' }),
    });
    const retryRes = await POST(retryReq, { params: makeParams(`jobs/${failedJobId}/retry`) });
    const retryBody = await retryRes.json();

    assert(retryRes.status === 200, 'JOB-RETRY-001', 'POST /jobs/{jobId}/retry returns HTTP 200 OK', retryBody);
    assert(retryBody.job?.status === 'queued', 'JOB-RETRY-002', 'Job re-queued upon retry', retryBody);
  }

  // -------------------------------------------------------------------------
  // 11. POST /jobs/{jobId}/artifact/download-url
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 11: POST /jobs/{jobId}/artifact/download-url');
  {
    // 11a. Valid Download URL Generation
    const validJobId = 'job_succeeded_001';
    const validArtReq = new NextRequest(`${BASE_URL}/jobs/${validJobId}/artifact/download-url`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expiresInSeconds: 600 }),
    });
    const validArtRes = await POST(validArtReq, { params: makeParams(`jobs/${validJobId}/artifact/download-url`) });
    const validArtBody = await validArtRes.json();

    assert(validArtRes.status === 200, 'JOB-ARTIFACT-001', 'Valid job returns HTTP 200 OK with download URL', validArtBody);
    assert(typeof validArtBody.downloadUrl === 'string', 'JOB-ARTIFACT-002', 'Response contains downloadUrl string', validArtBody);

    // 11b. Missing Artifact (404 Not Found)
    const missingArtifactJobId = 'job_no_artifact_099';
    const noArtReq = new NextRequest(`${BASE_URL}/jobs/${missingArtifactJobId}/artifact/download-url`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expiresInSeconds: 600 }),
    });
    const noArtRes = await POST(noArtReq, { params: makeParams(`jobs/${missingArtifactJobId}/artifact/download-url`) });
    const noArtBody = await noArtRes.json();

    assert(noArtRes.status === 404, 'JOB-ARTIFACT-003', 'Job without artifact returns HTTP 404 Not Found', noArtBody);
    assert(noArtBody.error?.code === 'ARTIFACT_NOT_FOUND', 'JOB-ARTIFACT-004', 'Error code is ARTIFACT_NOT_FOUND', noArtBody);
  }

  // -------------------------------------------------------------------------
  // 12. DELETE /jobs/{artifactId}/artifact (Artifact Deletion)
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 12: DELETE /jobs/{artifactId}/artifact (Artifact Deletion)');
  {
    const targetArtId = 'art_001';
    const delReq = new NextRequest(`${BASE_URL}/jobs/${targetArtId}/artifact`, { method: 'DELETE' });
    const delRes = await DELETE(delReq, { params: makeParams(`jobs/${targetArtId}/artifact`) });
    const delBody = await delRes.json();

    assert(delRes.status === 200, 'JOB-DELETE-001', 'DELETE /jobs/{artifactId}/artifact returns HTTP 200 OK', delBody);
    assert(delBody.success === true, 'JOB-DELETE-002', 'Response contains success=true', delBody);
    assert(delBody.artifactId === targetArtId, 'JOB-DELETE-003', 'Response echoes artifactId', delBody);
  }

  // -------------------------------------------------------------------------
  // 13. Workers Fleet & Detail Endpoints
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 13: Workers Fleet & Detail Endpoints');
  {
    // GET /workers
    const workersReq = new NextRequest(`${BASE_URL}/workers`, { method: 'GET' });
    const workersRes = await GET(workersReq, { params: makeParams('workers') });
    const workersBody = await workersRes.json();

    assert(workersRes.status === 200, 'WORKER-001', 'GET /workers returns HTTP 200 OK');
    assert(Array.isArray(workersBody.data), 'WORKER-002', 'Workers data is an array');

    // GET /workers/fleet-status
    const fleetReq = new NextRequest(`${BASE_URL}/workers/fleet-status`, { method: 'GET' });
    const fleetRes = await GET(fleetReq, { params: makeParams('workers/fleet-status') });
    const fleetBody = await fleetRes.json();

    assert(fleetRes.status === 200, 'WORKER-FLEET-001', 'GET /workers/fleet-status returns HTTP 200 OK');
    assert(typeof fleetBody.totalWorkers === 'number', 'WORKER-FLEET-002', 'Includes totalWorkers metric');
    assert(typeof fleetBody.onlineWorkersCount === 'number', 'WORKER-FLEET-003', 'Includes onlineWorkersCount metric');

    // GET /workers/{workerId} (Missing Worker 404)
    const badWorkerId = '00000000-0000-0000-0000-000000000000';
    const badWorkerReq = new NextRequest(`${BASE_URL}/workers/${badWorkerId}`, { method: 'GET' });
    const badWorkerRes = await GET(badWorkerReq, { params: makeParams(`workers/${badWorkerId}`) });
    const badWorkerBody = await badWorkerRes.json();

    assert(badWorkerRes.status === 404, 'WORKER-DETAIL-001', 'Missing worker returns HTTP 404 Not Found');
    assert(badWorkerBody.error?.code === 'WORKER_NOT_FOUND', 'WORKER-DETAIL-002', 'Error code is WORKER_NOT_FOUND');
  }

  // -------------------------------------------------------------------------
  // 14. Invalid Path (404 Endpoint Not Found Envelope)
  // -------------------------------------------------------------------------
  console.log('\n📌 Suite 14: Route Router 404 Not Found Check');
  {
    const invalidReq = new NextRequest(`${BASE_URL}/non-existent-endpoint`, { method: 'GET' });
    const invalidRes = await GET(invalidReq, { params: makeParams('non-existent-endpoint') });
    const invalidBody = await invalidRes.json();

    assert(invalidRes.status === 404, 'ROUTE-404-001', 'Unmatched endpoint returns HTTP 404 Not Found');
    assert(invalidBody.error?.code === 'NOT_FOUND', 'ROUTE-404-002', 'Error code is NOT_FOUND');
    assert(typeof invalidBody.error?.requestId === 'string', 'ROUTE-404-003', 'Error envelope has correlation requestId');
  }

  // -------------------------------------------------------------------------
  // Final Results Output
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`📊 Test Matrix Suite Execution Results:`);
  console.log(`   Passed: ${totalPassed}`);
  console.log(`   Failed: ${totalFailed}`);
  console.log('================================================================\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runApiMatrixSuite().catch((err) => {
    console.error('❌ Unexpected matrix test runner crash:', err);
    process.exit(1);
  });
}
