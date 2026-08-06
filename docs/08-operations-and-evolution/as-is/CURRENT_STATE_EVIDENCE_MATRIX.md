# Current-State Evidence Matrix & Codebase Audit (Phase 1)

> **Document status:** Approved Evidence Base  
> **Target:** AppRelay Dual-Dashboard & Worker Gateway Infrastructure  
> **Date:** 2026-08-06  

---

## 1. Route & Endpoint Inventory

### 1.1 Public Dashboard API (`/api/app-relay/v1/*`)
Implemented in [`dashboard/app/api/app-relay/v1/[...path]/route.ts`](file:///d:/super-tools/app-relay/dashboard/app/api/app-relay/v1/%5B...path%5D/route.ts).

| HTTP Method | Path Segment | Description | Service / Repository | Status in Code |
|---|---|---|---|---|
| `GET` | `/health` | API readiness and version ping | Direct handler | Existing |
| `GET` | `/overview` | Operational metrics (job counts, online workers) | `ReleaseOpsJobRepository`, `ReleaseOpsWorkerRepository` | Existing |
| `GET` | `/jobs` | Paginated list of jobs (`page`, `pageSize`, `search`) | `ReleaseOpsJobRepository` | Existing |
| `GET` | `/jobs/:jobId` | Full detail of job, worker, artifact, events | `AppRelayService.getJobDetail` | Existing |
| `GET` | `/jobs/:jobId/events` | Append-only event timeline | `ReleaseOpsJobEventRepository` | Existing |
| `POST` | `/jobs` | Create APK pull job | `AppRelayService.createApkPullJob` | Existing |
| `POST` | `/jobs/:jobId/cancel` | Request or apply job cancellation | `AppRelayService.cancelJob` | Existing |
| `POST` | `/jobs/:jobId/retry` | Retry eligible failed job | `AppRelayService.retryJob` | Existing |
| `POST` | `/jobs/:jobId/artifact/download-url` | Generate short-lived signed download URL | `AppRelayService.getArtifactDownloadUrl` | Existing |
| `DELETE` | `/jobs/:jobId/artifact` | Delete durable artifact metadata & storage | `AppRelayService.deleteArtifact` | Existing |
| `GET` | `/workers` | List registered worker nodes | `ReleaseOpsWorkerRepository` | Existing |
| `GET` | `/workers/:workerId` | Worker readiness detail | `ReleaseOpsWorkerRepository` | Existing |
| `OPTIONS` | `/*` | CORS Preflight handling | `getCorsHeaders` | Existing |

---

### 1.2 Internal Worker Gateway API (`/api/release-ops/worker/v1/*`)
Implemented in [`dashboard/app/api/release-ops/worker/v1/[...path]/route.ts`](file:///d:/super-tools/app-relay/dashboard/app/api/release-ops/worker/v1/%5B...path%5D/route.ts) and [`dashboard/lib/release-ops-worker-api/router.ts`](file:///d:/super-tools/app-relay/dashboard/lib/release-ops-worker-api/router.ts).

| HTTP Method | Path Segment | Description | Dispatcher Target | Status in Code |
|---|---|---|---|---|
| `POST` | `/workers/register` | Worker node registration | `WorkerApiRouter.registerWorker` | Existing |
| `POST` | `/workers/heartbeat` | Worker status heartbeat | `WorkerApiRouter.workerHeartbeat` | Existing |
| `POST` | `/jobs/claim` | Atomic job reservation & lease assignment | `WorkerApiRouter.claimJob` | Existing |
| `POST` | `/jobs/:jobId/start` | Transition job to `running` | `WorkerApiRouter.startJob` | Existing |
| `POST` | `/jobs/:jobId/heartbeat` | Job lease renewal & cancel check | `WorkerApiRouter.jobHeartbeat` | Existing |
| `POST` | `/jobs/:jobId/events` | Append worker progress log event | `WorkerApiRouter.appendJobEvent` | Existing |
| `POST` | `/jobs/:jobId/artifacts/upload-init` | Request signed upload URL for APK | `WorkerApiRouter.uploadInit` | Existing |
| `POST` | `/jobs/:jobId/artifacts/upload-complete` | Register uploaded artifact metadata | `WorkerApiRouter.uploadComplete` | Existing |
| `POST` | `/jobs/:jobId/succeed` | Mark job succeeded | `WorkerApiRouter.succeedJob` | Existing |
| `POST` | `/jobs/:jobId/fail` | Mark job failed with retry option | `WorkerApiRouter.failJob` | Existing |

---

## 2. OpenAPI Generator Script Trace

| Script File | Execution Scope | Target Output | Status |
|---|---|---|---|
| [`dashboard/scripts/generate-openapi.ts`](file:///d:/super-tools/app-relay/dashboard/scripts/generate-openapi.ts) | Reads Zod schemas from `lib/schemas/app-relay-api.schemas.ts` and uses `@asteasolutions/zod-to-openapi` | [`docs/04-detailed-design/cdd-lld/api-spec/openapi.yaml`](file:///d:/super-tools/app-relay/docs/04-detailed-design/cdd-lld/api-spec/openapi.yaml) | Active Code-First Generator |
| [`scripts/generate-openapi.ts`](file:///d:/super-tools/app-relay/scripts/generate-openapi.ts) | Root wrapper invoking `npm run openapi:generate` in `dashboard/` | Same as above | Canonical Root Wrapper |

**Findings**:
- The generator currently extracts only **Public API routes** (`/overview`, `/jobs`, `/workers`, `/artifacts`).
- Worker Gateway routes (`/api/release-ops/worker/v1/*`) are excluded from `openapi.yaml`, aligning with the separation of public frontend and internal worker contracts.

---

## 3. Worker Runtime & Direct Database Audit

Audited File: [`workers/app-relay-worker/src/api/gateway-client.ts`](file:///d:/super-tools/app-relay/workers/app-relay-worker/src/api/gateway-client.ts).

- **Direct DB Dependencies**: **0** (No `@supabase/supabase-js` imports or SQL connection strings in worker package).
- **Communication Protocol**: Pure HTTP REST calls using `fetch`.
- **Authentication**: `Authorization: Bearer ${this.config.workerToken}` header.
- **Target Gateway URL**: Configured via `GATEWAY_URL` env variable.

**Conclusion**: Worker security isolation policy is **100% compliant**. Worker runtime has zero direct database credentials.

---

## 4. Environment Variables Mapping

| Variable Name | Component | Usage | Security Scope |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Dashboard / API | Public Supabase project URL | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | Dashboard API (Server-only) | Database client initialization | Secret (Server Only) |
| `APPRELAY_ALLOWED_ORIGINS` | Dashboard API | CORS domain allowlist for dual dashboards | Server Config |
| `APPRELAY_WORKER_TOKEN` | Dashboard API | Pre-shared token validator for Worker Gateway | Secret (Server Only) |
| `GATEWAY_URL` | Worker | Gateway endpoint URL | Worker Config |
| `WORKER_TOKEN` | Worker | Bearer credential for Gateway calls | Secret (Worker Node) |
| `ADB_DEVICE_SERIAL` | Worker | Hardware device identifier | Worker Config |

---

## 5. Mismatch & Refactoring Backlog for Subsequent Phases

1. **Catch-All Handler Isolation (Phase 4)**: Public routes are currently routed through a single Next.js catch-all route `[...path]/route.ts`. In Phase 4, explicit versioned handlers or sub-routers should be structured to improve maintainability and correlation tracing.
2. **Internal Namespace Alias (Phase 5)**: Canonical worker route `/api/internal/worker/v1/*` should be enabled alongside existing `/api/release-ops/worker/v1/*` for backward compatibility.
3. **Master Dashboard Proxy/SDK (Phase 7)**: Master dashboard will require a lightweight API client package generated from `openapi.public.yaml`.
