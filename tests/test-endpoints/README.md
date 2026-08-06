# AppRelay Live HTTP Endpoint Test Suite (`tests/test-endpoints/`)

Bộ script kiểm thử tự động toàn bộ 15 REST API endpoints thực tế trên môi trường Live Server (`http://79.108.216.178:3000/api/app-relay/v1` hoặc `http://localhost:3000/api/app-relay/v1`) trước khi gửi tài liệu và bàn giao API cho đối tác integration testing.

## 📁 Cấu Trúc File

- `tests/test-endpoints/test-live-endpoints.ts`: Script kiểm thử kết nối HTTP trực tiếp qua mạng (`fetch`) hoặc gọi handler trực tiếp, kiểm tra status code, headers CORS preflight, batch job processing, pagination, 404 envelopes, và latency.

## 🚀 Cách Chạy Test

### 1. Kiểm thử trên môi trường Server thật (`79.108.216.178`)

```bash
cd dashboard
npx tsx ../tests/test-endpoints/test-live-endpoints.ts --url http://79.108.216.178:3000/api/app-relay/v1 --token <YOUR_AUTH_TOKEN>
```

### 2. Kiểm thử trên Local Dev Server (`http://localhost:3000`)

```bash
cd dashboard
npx tsx ../tests/test-endpoints/test-live-endpoints.ts --url http://localhost:3000/api/app-relay/v1
```

Hoặc qua biến môi trường:

```bash
API_BASE_URL="http://79.108.216.178:3000/api/app-relay/v1" AUTH_TOKEN="your-token" npx tsx ../tests/test-endpoints/test-live-endpoints.ts
```

## 📋 Danh Sách Suite Được Kiểm Thử

1. **CORS Preflight**: `OPTIONS /jobs` (`Access-Control-Allow-Methods/Headers`)
2. **Health Check**: `GET /health` (`status`, `service`, `version`, `requestId`, `timestamp`)
3. **Overview Metrics**: `GET /overview` (`totalJobs`, `activeJobs`, `queuedJobs`, `succeededJobs`, `failedJobs`, `onlineWorkers`)
4. **App Catalog**: `GET /apps` (App list, `totalItems`, deduplication)
5. **Single Job Creation**: `POST /jobs` (Google Play URL validation, `packageId` parsing, SSRF `file://` blocking)
6. **Batch Job Submission**: `POST /jobs/batch` (HTTP 207 Multi-Status, `totalSubmitted`)
7. **Job Listing & Search**: `GET /jobs` (Pagination, package search query filtering)
8. **Job Detail**: `GET /jobs/{jobId}` (Job record detail & 404 envelope)
9. **Event Timeline**: `GET /jobs/{jobId}/events` (Progress timeline events)
10. **Job Actions**: `POST /jobs/{jobId}/cancel` & `POST /jobs/{jobId}/retry`
11. **Artifact Download**: `POST /jobs/{jobId}/artifact/download-url` (Presigned URL & missing artifact 404)
12. **Artifact Delete**: `DELETE /jobs/{artifactId}/artifact`
13. **Workers & Fleet**: `GET /workers` & `GET /workers/fleet-status`
14. **Error Envelopes**: Verification of standard error response format (`{ error: { code, message, requestId, retryable } }`)
