# AppRelay Dual-Dashboard API & Worker Gateway — Specification (v1.2.0)

> **Document Status**: **Approved for implementation**  
> **Architecture Target**: SinoMedia Release Ops & Standalone AppRelay Dual-Dashboard Integration  
> **Public API Base URL**: `/api/app-relay/v1` (alias `/api/release-ops/app-relay/v1`)  
> **Internal Worker Gateway Base URL**: `/api/release-ops/worker/v1` (alias `/api/internal/worker/v1`)  

---

## 1. Overview & Dual-Dashboard Architecture

AppRelay is a **self-contained, independently deployable capability** that serves two distinct frontend clients over a single unified Public API:

1. **Standalone AppRelay Dashboard**: Independent React/Next.js dashboard dedicated to APK acquisition operations.
2. **SinoMedia Master Dashboard**: Embedded Release Ops module inside the main SinoMedia platform.

Both dashboards invoke the **Public API (`/api/app-relay/v1/*`)**. The AppRelay Worker fleet communicates exclusively through the **Internal Worker Gateway (`/api/release-ops/worker/v1/*`)**. Workers **never** access Supabase or database tables directly.

```text
  [ Standalone AppRelay UI ]       [ Master Dashboard Module ]
              │                                │
              └───────────────┬────────────────┘
                              │
                    (Public API: /api/app-relay/v1)
                              │
                    ┌─────────▼─────────┐
                    │ AppRelay Backend  │
                    └─────────▲─────────┘
                              │
               (Worker Gateway: /api/release-ops/worker/v1)
                              │
                     [ AppRelay Worker ]
```

---

## 2. Actors & Authorization Matrix

| Actor | Public API Access | Internal Gateway Access | Auth Mechanism | Allowed Actions |
|---|---|---|---|---|
| **Standalone Operator** | Yes (`/api/app-relay/v1/*`) | No | Supabase Bearer JWT (`iss`, `aud`, `sub`, `exp`) + CSRF | Query overview/jobs/workers, Submit jobs, Cancel/Retry, Download artifacts, Delete artifacts |
| **Master Operator** | Yes (`/api/app-relay/v1/*`) | No | Supabase Bearer JWT (`iss`, `aud`, `sub`, `exp`) + CSRF | Query overview/jobs/workers, Submit jobs, Cancel/Retry, Download artifacts, Delete artifacts |
| **AppRelay Worker** | No | Yes (`/api/release-ops/worker/v1/*`) | Scoped Worker Token (`Authorization: Bearer <token>`) | Register, Heartbeat, Atomic Claim, Append Events, Request Signed Upload, Complete/Fail Jobs |

---

## 3. CORS Policy & Allowed Origins

The Public API enforces strict CORS headers based on the environment configuration `APPRELAY_ALLOWED_ORIGINS`:

```text
Access-Control-Allow-Origin: <Request Origin if in APPRELAY_ALLOWED_ORIGINS allowlist, else primary origin>
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-CSRF-Token
Access-Control-Allow-Credentials: true
```

---

## 4. Public API Implementation Mapping (`/api/app-relay/v1`)

| Method | Path | Change Status | Security | Route Handler File | Zod Schema | Service / Repo | Test File |
|---|---|---|---|---|---|---|---|
| `GET` | `/health` | `Existing` | None | `app/api/app-relay/v1/[...path]/route.ts` | — | Direct handler | `dashboard/tests/public-api.test.ts` |
| `GET` | `/overview` | `Changed` | `supabaseBearer` | `app/api/app-relay/v1/[...path]/route.ts` | `OverviewResponseSchema` | `ReleaseOpsJobRepo`, `ReleaseOpsWorkerRepo` | `dashboard/tests/public-api.test.ts` |
| `GET` | `/jobs` | `Changed` | `supabaseBearer` | `app/api/app-relay/v1/[...path]/route.ts` | `JobListResponseSchema` | `ReleaseOpsJobRepo` | `dashboard/tests/public-api.test.ts` |
| `POST` | `/jobs` | `Changed` | `supabaseBearer` + CSRF | `app/api/app-relay/v1/[...path]/route.ts` | `CreateJobRequestSchema` | `AppRelayService.createApkPullJob` | `dashboard/tests/public-api.test.ts` |
| `GET` | `/jobs/{jobId}` | `Changed` | `supabaseBearer` | `app/api/app-relay/v1/[...path]/route.ts` | `JobResponseSchema` | `AppRelayService.getJobDetail` | `dashboard/tests/public-api.test.ts` |
| `GET` | `/jobs/{jobId}/events` | `Existing` | `supabaseBearer` | `app/api/app-relay/v1/[...path]/route.ts` | `EventListResponseSchema` | `ReleaseOpsJobEventRepo` | `dashboard/tests/public-api.test.ts` |
| `POST` | `/jobs/{jobId}/cancel` | `Changed` | `supabaseBearer` + CSRF | `app/api/app-relay/v1/[...path]/route.ts` | `ActionReasonRequestSchema` | `AppRelayService.cancelJob` | `dashboard/tests/public-api.test.ts` |
| `POST` | `/jobs/{jobId}/retry` | `Changed` | `supabaseBearer` + CSRF | `app/api/app-relay/v1/[...path]/route.ts` | `ActionReasonRequestSchema` | `AppRelayService.retryJob` | `dashboard/tests/public-api.test.ts` |
| `POST` | `/jobs/{jobId}/artifact/download-url` | `Changed` | `supabaseBearer` | `app/api/app-relay/v1/[...path]/route.ts` | `DownloadUrlResponseSchema` | `AppRelayService.getArtifactDownloadUrl` | `dashboard/tests/public-api.test.ts` |
| `DELETE` | `/jobs/{jobId}/artifact` | `Changed` | `supabaseBearer` + CSRF | `app/api/app-relay/v1/[...path]/route.ts` | `ArtifactDeleteResponseSchema` | `AppRelayService.deleteArtifact` | `dashboard/tests/public-api.test.ts` |
| `GET` | `/workers` | `Existing` | `supabaseBearer` | `app/api/app-relay/v1/[...path]/route.ts` | `WorkerListResponseSchema` | `ReleaseOpsWorkerRepo` | `dashboard/tests/public-api.test.ts` |
| `GET` | `/workers/{workerId}` | `Existing` | `supabaseBearer` | `app/api/app-relay/v1/[...path]/route.ts` | `WorkerResponseSchema` | `ReleaseOpsWorkerRepo` | `dashboard/tests/public-api.test.ts` |

---

## 5. Internal Worker Gateway Implementation Mapping (`/api/release-ops/worker/v1`)

| Method | Path | Scope Required | Route Handler File | Dispatcher Target | Test File |
|---|---|---|---|---|---|
| `POST` | `/workers/register` | `release_ops:worker:register` | `app/api/release-ops/worker/v1/[...path]/route.ts` | `WorkerApiRouter.registerWorker` | `workers/tests/fake-worker.test.ts` |
| `POST` | `/workers/heartbeat` | `release_ops:worker:heartbeat` | `app/api/release-ops/worker/v1/[...path]/route.ts` | `WorkerApiRouter.workerHeartbeat` | `workers/tests/fake-worker.test.ts` |
| `POST` | `/jobs/claim` | `release_ops:job:claim` | `app/api/release-ops/worker/v1/[...path]/route.ts` | `WorkerApiRouter.claimJob` | `workers/tests/fake-worker.test.ts` |
| `POST` | `/jobs/{jobId}/start` | `release_ops:job:heartbeat` | `app/api/release-ops/worker/v1/[...path]/route.ts` | `WorkerApiRouter.startJob` | `workers/tests/fake-worker.test.ts` |
| `POST` | `/jobs/{jobId}/heartbeat` | `release_ops:job:heartbeat` | `app/api/release-ops/worker/v1/[...path]/route.ts` | `WorkerApiRouter.jobHeartbeat` | `workers/tests/fake-worker.test.ts` |
| `POST` | `/jobs/{jobId}/events` | `release_ops:job:event` | `app/api/release-ops/worker/v1/[...path]/route.ts` | `WorkerApiRouter.appendJobEvent` | `workers/tests/fake-worker.test.ts` |
| `POST` | `/jobs/{jobId}/artifacts/upload-init` | `release_ops:artifact:write` | `app/api/release-ops/worker/v1/[...path]/route.ts` | `WorkerApiRouter.uploadInit` | `workers/tests/artifact-pipeline.test.ts` |
| `POST` | `/jobs/{jobId}/artifacts/upload-complete` | `release_ops:artifact:write` | `app/api/release-ops/worker/v1/[...path]/route.ts` | `WorkerApiRouter.uploadComplete` | `workers/tests/artifact-pipeline.test.ts` |
| `POST` | `/jobs/{jobId}/succeed` | `release_ops:job:complete` | `app/api/release-ops/worker/v1/[...path]/route.ts` | `WorkerApiRouter.succeedJob` | `workers/tests/fake-worker.test.ts` |
| `POST` | `/jobs/{jobId}/fail` | `release_ops:job:complete` | `app/api/release-ops/worker/v1/[...path]/route.ts` | `WorkerApiRouter.failJob` | `workers/tests/fake-worker.test.ts` |

---

## 6. Error Handling & Standard Envelopes

All API errors return a standard JSON envelope with explicit error code, message, correlation `requestId`, and `retryable` indicator:

```json
{
  "error": {
    "code": "INVALID_PLAY_URL",
    "message": "The provided URL is not a valid Google Play store details link.",
    "requestId": "req_1785987600_a1b2c3d",
    "retryable": false
  }
}
```

---

## 7. Status State Machine & Pipeline Stages

### Job Lifecycle State Machine
`queued` $\rightarrow$ `claimed` $\rightarrow$ `running` $\rightarrow$ `succeeded` / `failed` / `cancelled` / `dead_letter` / `expired`

### Worker Progress Pipeline Stages
1. `claimed` (1-3%)
2. `scraping_listing` (4-20%)
3. `preparing_device` (21-30%)
4. `installing` (31-55%)
5. `pulling_apks` (56-72%)
6. `validating` (73-80%)
7. `packaging` (81-88%)
8. `uploading_artifact` (89-96%)
9. `cleaning` (97-99%)
10. `completed` (100%)

---

## 8. Acceptance Test Plan

1. **Public API Contract Test**: Execute `dashboard/tests/public-api.test.ts` to verify all public endpoints return standardized response envelopes.
2. **Worker Gateway Contract Test**: Execute `workers/tests/fake-worker.test.ts` to verify atomic claim, lease heartbeat, event logging, and job completion.
3. **Artifact Pipeline Test**: Execute `workers/tests/artifact-pipeline.test.ts` to verify signed upload handoff and checksum validation.
4. **Master Integration Smoke Test**: Execute `dashboard/tests/master-integration.test.ts` to verify Master UI compatibility.
5. **OpenAPI Schema Reconciliation**: Run `npm run openapi:generate` in `dashboard/` and ensure generated `openapi.yaml` matches implementation schemas.
