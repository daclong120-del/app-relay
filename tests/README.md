# AppRelay API Matrix Automated Test Suite

Tập hợp các test case tự động hóa cho bộ API của AppRelay v1.3.1 theo chuẩn `API_TEST_GUIDE_FOR_DEV.md` và `API_TEST_CASE_MATRIX_FOR_DEV.md`.

## 📁 Cấu Trúc Đơn Vị Kiểm Thử

- `tests/api-matrix-suite.ts`: Test suite chính chứa 14+ kịch bản test covering toàn bộ REST API endpoints, CORS preflight, error envelopes, batch operations, pagination, search filter và fleet metrics.
- `tests/helpers/mock-api-db.ts`: Driver mock database in-memory cho các bảng `release_ops_jobs`, `release_ops_workers`, `release_ops_job_events`, `release_ops_artifacts`, `release_ops_audits`.

## 🚀 Cách Chạy Test Suite

Chạy lệnh sau từ thư mục `dashboard`:

```bash
cd dashboard
npx tsx ../tests/api-matrix-suite.ts
```

Hoặc kiểm tra TypeScript compilation:

```bash
cd dashboard
npm run type-check
```

## 📋 Bảng Phân Vùng Endpoint Được Cover

| Group ID | Endpoint | Coverage Details |
|---|---|---|
| Suite 1 | `OPTIONS /*` | CORS preflight headers (`ACAO`, `ACAM`, `ACAH`) |
| Suite 2 | `GET /health` | Liveness/Readiness, format ISO timestamp, correlation `requestId` |
| Suite 3 | `GET /overview` | Aggregate stats breakdown (total, active, queued, succeeded, failed, online workers) |
| Suite 4 | `GET /apps` | App catalog deduplication & timestamp mapping |
| Suite 5 | `POST /jobs` | Create single APK pull job, URL package validation, SSRF scheme blocking |
| Suite 6 | `POST /jobs/batch` | HTTP 207 Multi-Status batch processing |
| Suite 7 | `GET /jobs` | Job list, pagination parameters, package search filters |
| Suite 8 | `GET /jobs/{jobId}` | Detailed job retrieval & 404 `JOB_NOT_FOUND` envelope |
| Suite 9 | `GET /jobs/{jobId}/events` | Job execution progress timeline events |
| Suite 10 | `POST /jobs/{jobId}/cancel` & `/retry` | Cancellation and retry lifecycle state transitions |
| Suite 11 | `POST /jobs/{jobId}/artifact/download-url` | Download URL generation & missing artifact error envelope |
| Suite 12 | `DELETE /jobs/{artifactId}/artifact` | Artifact deletion response payload |
| Suite 13 | `GET /workers` & `/workers/fleet-status` | Worker list & fleet status metrics |
| Suite 14 | Router 404 | Catch-all router error envelope (`NOT_FOUND`) |
