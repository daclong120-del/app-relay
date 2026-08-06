---
name: design-apprelay-api-spec
description: Design implementation-ready API_SPEC.md documents for AppRelay changes before coding, then reconcile the finished implementation before generating the actual OpenAPI contract. Use when a user requests a new AppRelay feature, endpoint, architecture improvement, integration, compatibility change, or asks to convert requirements into a near-implementation API design. Inspect current evidence, distinguish existing behavior from proposed behavior, and never present a design-time openapi.yaml as if it came from working code.
---

# Design AppRelay API Spec

## Purpose

Turn a product or architecture change into an implementation-ready `API_SPEC.md` without confusing target design with current behavior. Preserve a code-first final contract: implement the approved spec first, then generate `openapi.yaml` from the completed route and schema code for frontend integration.

Read the embedded `API_SPEC.md` template at the end of this file completely before creating or revising `API_SPEC.md`.

## Select the mode

Use **Design mode** by default when the requirement is new or implementation is incomplete. Produce or revise `API_SPEC.md`; do not generate a supposedly actual `openapi.yaml`.

Use **Reconcile mode** only when the user says implementation is complete or asks to validate the code against an approved `API_SPEC.md`. Inspect the working code, resolve mismatches, run the project's established OpenAPI generator, lint the result, and report whether it is safe to hand to frontend.

If completion is uncertain, treat the work as Design mode and label it honestly.

## Design mode workflow

### 1. Establish current evidence

Inspect the available requirement, architecture documents, existing `API_SPEC.md`, route registrations, request and response schemas, authorization middleware, services, database migrations, background jobs, tests, and any generated OpenAPI artifact.

Record evidence by file path and code symbol. Never infer that a target architecture document proves an endpoint already exists. If the codebase is unavailable, state that limitation and mark unverifiable facts `TBD` rather than inventing them.

For AppRelay, preserve these boundaries unless the user explicitly approves an architecture change:

- AppRelay is a module of the master Release Ops system.
- The master owns authentication, Supabase access, queue and job state, artifacts, and the Worker Gateway.
- Dashboard clients use only the public AppRelay API namespace.
- Worker execution endpoints remain internal and are never offered to dashboard frontend.
- Workers do not receive a Supabase service-role credential.

### 2. Normalize the requirement

State the user outcome, actors, preconditions, affected resources, success criteria, non-goals, and operational constraints. Classify the proposed change as additive, backward-compatible change, breaking change, or internal-only change.

Ask only questions whose answers materially change security, compatibility, data ownership, or the HTTP contract. Continue with clearly labeled assumptions for non-blocking gaps.

### 3. Model the target API

Define the smallest endpoint and event surface that satisfies the requirement. For every operation, specify:

- lifecycle label: `Existing`, `Changed`, `New`, or `Removed`;
- implementation status: normally `Proposed` in Design mode;
- method, canonical path, purpose, actor, and authorization rule;
- path, query, header, and body inputs with validation rules;
- success response, error responses, and examples;
- idempotency, concurrency, pagination, filtering, ordering, and retry behavior where relevant;
- asynchronous job, webhook, polling, or realtime semantics where relevant;
- compatibility, migration, and deprecation effects.

Use stable resource-oriented paths. Do not expose internal Worker Gateway routes through the public dashboard contract.

### 4. Map design to implementation

For each new or changed operation, name the intended route module, validation schema, authorization policy, service or use case, repository or persistence change, job or worker change, and tests. Mark an item `TBD` if the exact location depends on a repository decision that has not been made.

Include enough schema detail that an implementer does not have to redesign the API while coding. Do not include speculative endpoints that are unrelated to the stated requirement.

### 5. Write `API_SPEC.md`

Follow the reference template. Put a prominent document status near the top:

- `Proposed` while under design;
- `Approved for implementation` after explicit approval;
- `Implemented, pending reconciliation` only when code exists but has not passed reconciliation;
- `Reconciled with implementation` only after Reconcile mode succeeds.

Maintain separate current-state evidence and target-state contract sections. Include an endpoint change matrix so reviewers can see exactly what exists and what will change.

### 6. Run the design quality gate

Before handing off `API_SPEC.md`, verify:

- every requirement maps to at least one contract behavior or is explicitly a non-goal;
- every proposed endpoint maps to an implementation location and acceptance test;
- authorization and tenant or project boundaries are explicit;
- request, response, and error schemas are internally consistent;
- public dashboard APIs and internal worker APIs are separated;
- breaking changes include migration or versioning treatment;
- unresolved items are visible and do not masquerade as decisions;
- the document never claims proposed behavior is already deployed.

End Design mode with the next action: approve the spec, implement it, then reconcile it against code.

## Reconcile mode workflow

### 1. Prove implementation status

Inspect actual route registration, runtime validation schemas, middleware, service behavior, persistence, jobs, and contract tests. Treat executable code and passing tests as evidence; do not accept the design document alone.

### 2. Compare code with the approved spec

Create a mismatch table covering paths, methods, auth, parameters, schemas, status codes, errors, and asynchronous behavior. Classify each mismatch as code defect, intentional design change, documentation drift, or unresolved.

Do not silently edit the spec to legitimize an accidental implementation difference. Require an explicit decision for breaking or security-sensitive drift.

### 3. Generate the actual OpenAPI artifact

Use the repository's existing code-first generator and canonical route or schema sources. Do not hand-author `openapi.yaml` from `API_SPEC.md` and call it actual.

If no generator exists, identify the framework and schema source, then propose the smallest reproducible generation setup. Do not add dependencies or change the build without authorization.

Run the project tests, the generation command, and an OpenAPI validator or linter. Confirm that the generated file is reproducible and contains only the intended public frontend contract. Exclude internal worker endpoints unless a separate internal spec was explicitly requested.

### 4. Complete the frontend handoff

Mark `API_SPEC.md` as `Reconciled with implementation` only after mismatches are resolved and validation passes. The frontend handoff source of truth is the generated, validated `openapi.yaml`; `API_SPEC.md` remains the decision and implementation context.

Create an integration plan such as `APPRELAY_API_CONTRACT_AND_FRONTEND_INTEGRATION_PLAN.md` only at this end stage when the user requests it. Base that plan on the reconciled code and generated OpenAPI artifact, not on proposals.

Report the generator command, validation result, spec version or commit identity if available, known limitations, and breaking changes alongside the frontend handoff.

## Invocation examples

- `Use $design-apprelay-api-spec in Design mode. Add artifact re-download with authorization and audit history. Inspect the current AppRelay code and write API_SPEC.md only.`
- `Use $design-apprelay-api-spec in Reconcile mode. Implementation is complete; compare it with API_SPEC.md, generate openapi.yaml from code, validate it, and list frontend-facing breaking changes.`

## Embedded API_SPEC.md template

# API_SPEC.md template

Use this structure for a new document and preserve equivalent useful sections when revising an existing one. Remove instructional text from the finished artifact. Write concrete values wherever evidence exists; use `TBD` only for visible unresolved decisions.

## 1. Document control

- Title
- Status: `Proposed`, `Approved for implementation`, `Implemented, pending reconciliation`, or `Reconciled with implementation`
- Owner
- Reviewers
- Last updated
- Requirement or decision references
- Target API namespace and version

Add this warning while the status is `Proposed` or `Approved for implementation`:

> This document describes the target contract. It does not prove that the API is implemented. The frontend contract becomes authoritative only after code reconciliation and generation of a validated OpenAPI artifact.

## 2. Executive summary

Describe the user outcome, why the change is needed, and the smallest API change that provides it.

## 3. Scope

### In scope

List the behaviors being designed.

### Non-goals

List adjacent behaviors intentionally excluded.

### Assumptions and unresolved decisions

For each assumption or `TBD`, include owner, impact, and resolution gate.

## 4. Current-state evidence

| Area | Evidence path or symbol | Verified behavior | Confidence |
|---|---|---|---|
| Route | | | |
| Schema | | | |
| Auth | | | |
| Service | | | |
| Persistence/job | | | |
| Test/OpenAPI | | | |

Separate observed implementation from intended architecture.

## 5. Requirement-to-contract traceability

| Requirement | Contract behavior | Operation/event | Acceptance evidence |
|---|---|---|---|
| | | | |

## 6. Change classification

- Change type: additive, compatible, breaking, or internal-only
- Compatibility rationale
- Versioning decision
- Migration or deprecation plan

## 7. Endpoint change matrix

| Lifecycle | Status | Method | Path | Actor | Auth policy | Summary |
|---|---|---|---|---|---|---|
| New/Changed/Existing/Removed | Proposed | | | | | |

Do not mix internal Worker Gateway operations into the dashboard frontend contract. If internal changes are required, place them in a separate clearly labeled subsection.

## 8. Operation contracts

Create one subsection per new or changed operation.

### `[METHOD] /canonical/path`

- Lifecycle and implementation status
- Purpose
- Actor and authorization
- Preconditions
- Idempotency and concurrency behavior
- Rate or usage limits, if applicable

#### Request

- Path parameters
- Query parameters
- Required headers
- Body schema, constraints, defaults, and example

#### Success responses

List each status code, response headers, body schema, and example.

#### Error responses

| Status | Stable error code | Condition | Retryable | Response schema |
|---|---|---|---|---|
| | | | | |

#### Side effects and observability

Describe database writes, emitted jobs or events, audit records, logs, metrics, and correlation identifiers.

## 9. Shared schemas and enums

Define field names, types, requiredness, nullability, formats, ranges, enum values, and forward-compatibility behavior. Use one canonical error envelope.

## 10. Async and state model

If applicable, define job states, allowed transitions, polling or realtime behavior, retry semantics, cancellation, timeouts, and terminal results.

## 11. Security and data ownership

Document authentication, authorization, tenant or project isolation, credential boundaries, sensitive data handling, retention, and audit requirements.

## 12. Implementation mapping

| Operation/change | Route | Runtime schema | Auth | Service/use case | Persistence/job | Tests |
|---|---|---|---|---|---|---|
| | | | | | | |

Use intended locations for proposed work and actual paths during reconciliation.

## 13. Test and acceptance plan

Cover success cases, validation failures, unauthorized and forbidden access, cross-tenant isolation, idempotency, concurrency, async transitions, compatibility, and contract tests.

## 14. Rollout and rollback

Document feature flags, migrations, deployment order, backward compatibility window, monitoring, rollback conditions, and recovery steps.

## 15. OpenAPI generation and frontend handoff

During Design mode, record the planned schema source, generator, output path, and validation command without claiming the artifact exists.

During Reconcile mode, record:

- actual generation command;
- generated file path;
- validator or linter command and result;
- resolved mismatch summary;
- frontend base URL and public namespace;
- breaking changes and migration notes;
- client generation instructions, if the frontend uses generated clients.

## 16. Decision log

| Date | Decision | Rationale | Approver | Contract impact |
|---|---|---|---|---|
| | | | | |

## 17. Final gates

### Design approval gate

- Requirements traced
- Contract complete
- Security reviewed
- Compatibility decided
- Implementation mapping complete
- Unresolved blockers visible

### Reconciliation and frontend handoff gate

- Implementation matches approved decisions
- Tests pass
- OpenAPI generated from actual code
- OpenAPI validation passes
- Internal endpoints excluded from public spec
- Frontend migration notes complete

