# ADR-APPRELAY-DEPLOYABLE-MODULE: Independent Deployment Boundary for AppRelay Capability

> **Status:** Accepted  
> **Date:** 2026-08-06  
> **Deciders:** SinoMedia Core Architecture Team & AppRelay Engineering  
> **Supercedes:** Monolithic backend ownership assumption ("Master owns the entire AppRelay backend")  

---

## 1. Context and Problem Statement

AppRelay was originally conceived as a Release Ops module embedded directly inside the SinoMedia Master backend. However, operating Android APK extraction workers, managing background job lifecycle queues, and maintaining real-time worker heartbeats introduce distinct deployment, runtime, and infrastructure dynamics compared to traditional web dashboards.

We need to support two frontend usage scenarios:
1. **SinoMedia Master Dashboard**: AppRelay integrated as a Release Ops module in the main SinoMedia UI.
2. **Standalone AppRelay Dashboard**: An operational dashboard running independently for dedicated operators.

Having two separate backend implementations (one in Master, one in Standalone) would cause code duplication, inconsistent job lifecycle management, and security risks.

---

## 2. Decision Outcome

We decide that **AppRelay will remain a Release Ops capability of SinoMedia Master at the product level, but will become an independently deployable backend unit at the deployment level**.

Specifically:
- **One AppRelay backend deployment**: Single source of truth for business logic, background execution, and state management.
- **One data ownership boundary**: AppRelay owns its database tables (`release_ops_jobs`, `release_ops_job_events`, `release_ops_workers`, `release_ops_artifacts`) and migration scripts.
- **One Public API**: `/api/app-relay/v1/*` consumed by both the Standalone AppRelay dashboard and the Master dashboard.
- **One Internal Worker Gateway**: `/api/release-ops/worker/v1/*` (alias `/api/internal/worker/v1/*`) consumed exclusively by AppRelay workers over authenticated HTTP REST calls.
- **Two interchangeable frontend clients**: Standalone UI and Master UI module.

---

## 3. Supported Deployment Profiles

### Profile A — Standalone AppRelay
```text
[ Standalone Dashboard ] ──> [ Public API /api/app-relay/v1 ] ──> [ AppRelay Backend & Data ]
                                                                       ▲
                                    [ Worker Gateway ] ───────────────┘
                                          ▲
                                    [ Worker Fleet ]
```
Used when operating AppRelay independently without launching the Master UI.

### Profile B — Master-Integrated AppRelay
```text
[ Master Dashboard / Release Ops ] ──> [ Public API /api/app-relay/v1 ] ──> [ AppRelay Backend & Data ]
```
Used in normal SinoMedia production. Master UI consumes the public API as an authorized client via standard Bearer tokens. Master backend code never queries AppRelay tables directly.

### Profile C — Dual-Dashboard Coexistence
Both Standalone and Master UI run simultaneously against the single AppRelay backend. Used during transition, testing, or operational support.

---

## 4. API Namespaces and Contract Policy

1. **Public API Namespace**: `/api/app-relay/v1/*` (optional alias `/api/release-ops/app-relay/v1/*`).
   - Serves both dashboards.
   - Auth: `Authorization: Bearer <Supabase access token>`.
   - Contract source: Design guided by `API_SPEC.md`; machine-readable `openapi.public.yaml` is generated post-implementation.

2. **Internal Worker Gateway Namespace**: `/api/release-ops/worker/v1/*` (canonical internal alias `/api/internal/worker/v1/*`).
   - Serves AppRelay workers only.
   - Auth: Scoped Worker Bearer token (`APPRELAY_WORKER_TOKEN`).
   - Contract source: Separated from public frontend API; machine-readable `openapi.internal.yaml`.

---

## 5. Data & Security Ownership Rules

1. **Database Infrastructure**:
   - Initial production deployment uses a **shared Supabase project** with Master for operational simplicity.
   - AppRelay maintains **strict logical schema and table ownership**.
   - Master backend modules MUST NOT bypass the AppRelay API to query or mutate `release_ops_*` tables directly.

2. **Credential Isolation**:
   - Neither Standalone UI nor Master UI receive Supabase `service_role` keys for AppRelay tables.
   - AppRelay Workers MUST NOT receive Supabase database connection strings or `service_role` keys. All worker operations occur strictly over HTTP through the Worker Gateway.

---

## 6. Consequences

### Positive
- Prevents business logic duplication across multiple dashboards.
- Isolates heavy worker background job processing from the main web application.
- Enhances security by enforcing API-level authentication and eliminating direct DB credentials from workers and UI clients.
- Enables future independent deployment to dedicated Supabase or containerized backend clusters without breaking frontend contracts.

### Negative / Trade-offs
- Requires CORS allowlist management for multi-origin dashboard access.
- Requires maintenance of token validation middleware and proper correlation tracing.
