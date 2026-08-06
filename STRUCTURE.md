# Project Directory Structure

```
app-relay/
├── .agents/
│   ├── rules/
│   │   └── rule.md
│   └── skills/
│       └── DESIGN_APPRELAY_API_SPEC_SKILL.md
├── .claude/
│   └── skills/
│       └── gitnexus/
│           ├── gitnexus-cli/
│           │   └── SKILL.md
│           ├── gitnexus-debugging/
│           │   └── SKILL.md
│           ├── gitnexus-exploring/
│           │   └── SKILL.md
│           ├── gitnexus-guide/
│           │   └── SKILL.md
│           ├── gitnexus-impact-analysis/
│           │   └── SKILL.md
│           └── gitnexus-refactoring/
│               └── SKILL.md
├── .github/
│   └── workflows/
│       └── ci.yml
├── dashboard/
│   ├── app/
│   │   ├── (main)/
│   │   │   └── dash/
│   │   │       └── release-ops/
│   │   │           └── app-relay/
│   │   │               ├── [jobId]/
│   │   │               │   └── page.tsx
│   │   │               ├── loading.tsx
│   │   │               └── page.tsx
│   │   ├── actions/
│   │   │   ├── app-relay.actions.ts
│   │   │   └── release-ops-fleet.actions.ts
│   │   └── api/
│   │       ├── cron/
│   │       │   └── release-ops/
│   │       │       └── expire-artifacts/
│   │       │           └── route.ts
│   │       └── release-ops/
│   │           └── worker/
│   │               └── v1/
│   │                   └── [...path]/
│   │                       └── route.ts
│   ├── components/
│   │   └── dashboard/
│   │       ├── release-ops/
│   │       │   ├── app-relay/
│   │       │   │   ├── AppRelayArtifactCard.tsx
│   │       │   │   ├── AppRelayForm.tsx
│   │       │   │   ├── AppRelayJobTable.tsx
│   │       │   │   ├── AppRelayTimeline.tsx
│   │       │   │   ├── ConfirmActionModal.tsx
│   │       │   │   └── WorkerDevicePanel.tsx
│   │       │   └── ReleaseOpsNavTabs.tsx
│   │       └── ui/
│   │           ├── Button.tsx
│   │           ├── DropdownSelect.tsx
│   │           ├── MetricCard.tsx
│   │           ├── Modal.tsx
│   │           ├── ProvenanceBadge.tsx
│   │           ├── Skeleton.tsx
│   │           ├── StatusBadge.tsx
│   │           └── TextInput.tsx
│   ├── lib/
│   │   ├── guards/
│   │   │   └── admin-csrf.guard.ts
│   │   ├── release-ops-reliability/
│   │   │   ├── reconciliation.service.ts
│   │   │   └── retry-policy.ts
│   │   ├── release-ops-rollout/
│   │   │   ├── feature-flags.ts
│   │   │   └── kill-switch.service.ts
│   │   ├── release-ops-security/
│   │   │   └── security-auditor.ts
│   │   ├── release-ops-worker-api/
│   │   │   ├── __tests__/
│   │   │   │   └── gateway.test.ts
│   │   │   ├── guards/
│   │   │   │   └── token.guard.ts
│   │   │   ├── handlers/
│   │   │   │   ├── artifacts.ts
│   │   │   │   ├── jobs.ts
│   │   │   │   └── workers.ts
│   │   │   ├── errors.ts
│   │   │   ├── router.ts
│   │   │   ├── schemas.ts
│   │   │   └── scopes.ts
│   │   ├── repositories/
│   │   │   ├── release-ops-artifact.repo.ts
│   │   │   ├── release-ops-audit.repo.ts
│   │   │   ├── release-ops-job-event.repo.ts
│   │   │   ├── release-ops-job.repo.ts
│   │   │   └── release-ops-worker.repo.ts
│   │   ├── schemas/
│   │   │   └── app-relay-api.schemas.ts
│   │   ├── services/
│   │   │   └── release-ops.service.ts
│   │   └── ui/
│   │       ├── provenance-map.ts
│   │       └── status-map.ts
│   ├── scripts/
│   │   └── generate-openapi.ts
│   ├── styles/
│   │   └── dashboard-tokens.css
│   ├── tests/
│   │   ├── dashboard-actions.test.ts
│   │   ├── reliability-operations.test.ts
│   │   ├── rollout-killswitch.test.ts
│   │   └── security-review.test.ts
│   ├── types/
│   │   ├── release-ops.ts
│   │   └── supabase.ts
│   ├── .env.example
│   ├── next-env.d.ts
│   ├── package-lock.json
│   ├── package.json
│   ├── tsconfig.json
│   └── tsconfig.tsbuildinfo
├── docs/
│   ├── 01-requirements/
│   │   ├── brd/
│   │   │   └── .gitkeep
│   │   ├── meeting-minutes/
│   │   │   └── .gitkeep
│   │   └── srs-prd/
│   │       ├── actor-profile/
│   │       │   └── .gitkeep
│   │       └── use-cases/
│   │           └── .gitkeep
│   ├── 02a-design-system/
│   │   ├── art-bible/
│   │   │   └── .gitkeep
│   │   ├── brand-guidelines/
│   │   │   └── .gitkeep
│   │   └── ui-style-guide/
│   │       ├── .gitkeep
│   │       └── design-creative-lutech.md
│   ├── 02b-tech-standards/
│   │   ├── architecture-baseline/
│   │   │   └── .gitkeep
│   │   ├── coding-testing-standards/
│   │   │   └── .gitkeep
│   │   ├── license-compliance/
│   │   │   └── .gitkeep
│   │   └── tech-stack-blueprint/
│   │       └── .gitkeep
│   ├── 03-macro-architecture/
│   │   ├── technical-rfc/
│   │   │   └── .gitkeep
│   │   └── ARCHITECTURE_MASTER.md
│   ├── 04-detailed-design/
│   │   ├── cdd-lld/
│   │   │   ├── ai-model-card/
│   │   │   │   └── .gitkeep
│   │   │   ├── api-spec/
│   │   │   │   ├── .gitkeep
│   │   │   │   ├── API_SPEC.md
│   │   │   │   └── openapi.yaml
│   │   │   ├── business-logic/
│   │   │   │   └── .gitkeep
│   │   │   ├── cicd-infrastructure/
│   │   │   │   └── .gitkeep
│   │   │   ├── data-models/
│   │   │   │   └── .gitkeep
│   │   │   └── functional-modules/
│   │   │       └── .gitkeep
│   │   └── ui-ux-deliverables/
│   │       ├── high-fidelity-mockups/
│   │       │   └── .gitkeep
│   │       ├── interactive-prototypes/
│   │       │   └── .gitkeep
│   │       └── wireframes/
│   │           └── .gitkeep
│   ├── 05-security-compliance/
│   │   └── .gitkeep
│   ├── 06-testing/
│   │   ├── test-cases/
│   │   │   ├── automation-scripts/
│   │   │   │   └── .gitkeep
│   │   │   └── manual-test-cases/
│   │   │       └── .gitkeep
│   │   └── test-plans/
│   │       └── .gitkeep
│   ├── 07-acceptance-handover/
│   │   ├── handover/
│   │   │   └── .gitkeep
│   │   ├── uat-signoff/
│   │   │   └── .gitkeep
│   │   └── user-guides/
│   │       └── .gitkeep
│   ├── 08-operations-and-evolution/
│   │   ├── adr/
│   │   │   └── .gitkeep
│   │   ├── as-is/
│   │   │   ├── .gitkeep
│   │   │   └── ARCHITECTURE_APP_REPLAY_V1.md
│   │   ├── change-requests/
│   │   │   └── .gitkeep
│   │   ├── to-be-v2/
│   │   │   └── .gitkeep
│   │   └── to-be-v3/
│   │       └── .gitkeep
│   ├── 09-maintenance-runbook/
│   │   ├── post-mortem/
│   │   │   └── .gitkeep
│   │   └── OPERATIONAL_RUNBOOK.md
│   ├── 10-deprecation/
│   │   └── .gitkeep
│   ├── docs.txt
│   └── README.md
├── plans/
│   ├── APPRELAY_CORRECTED_REVIEW_AND_FIX_PLAN.md
│   ├── APPRELAY_LUTECH_UI_MIGRATION_PLAN.md
│   └── IMPLEMENTATION_PLAN.md
├── scripts/
│   ├── generate-openapi.ts
│   ├── generate-tree.ts
│   └── run-all-tests.ts
├── supabase/
│   ├── migrations/
│   │   ├── 20260805000001_release_ops_schema.sql
│   │   ├── 20260805000002_release_ops_indexes_constraints.sql
│   │   ├── 20260805000003_release_ops_rls.sql
│   │   ├── 20260805000004_release_ops_worker_rpcs.sql
│   │   ├── 20260805000005_release_ops_storage.sql
│   │   ├── 20260805000006_release_ops_realtime.sql
│   │   └── 20260805000007_release_ops_fix_worker_rpc_and_scopes.sql
│   └── .env.local.example
├── tests/
├── tools/
│   └── generate-tree.js
├── workers/
│   └── app-relay-worker/
│       ├── src/
│       │   ├── adapters/
│       │   │   ├── android/
│       │   │   │   ├── adb-client.ts
│       │   │   │   ├── apk-puller.ts
│       │   │   │   ├── device-preflight.ts
│       │   │   │   ├── play-ui-automator.ts
│       │   │   │   └── safe-exec.ts
│       │   │   ├── artifact/
│       │   │   │   ├── cleanup.ts
│       │   │   │   ├── packager.ts
│       │   │   │   ├── uploader.ts
│       │   │   │   └── validator.ts
│       │   │   └── play-listing/
│       │   │       ├── client.ts
│       │   │       ├── downloader.ts
│       │   │       ├── errors.ts
│       │   │       ├── mapper.ts
│       │   │       ├── parser.ts
│       │   │       └── types.ts
│       │   ├── api/
│       │   │   └── gateway-client.ts
│       │   ├── config/
│       │   │   └── env.ts
│       │   ├── domain/
│       │   │   └── slot-manager.ts
│       │   ├── pipeline/
│       │   │   ├── apk-acquisition-pipeline.ts
│       │   │   └── fake-pull-apk.ts
│       │   ├── runtime/
│       │   │   └── worker-engine.ts
│       │   └── main.ts
│       ├── tests/
│       │   ├── fixtures/
│       │   │   ├── play-store/
│       │   │   │   ├── sample-404.html
│       │   │   │   ├── sample-no-screenshots.html
│       │   │   │   └── sample-valid.html
│       │   │   └── uiautomator/
│       │   │       ├── already-installed.xml
│       │   │       ├── install-btn.xml
│       │   │       ├── login-required.xml
│       │   │       └── unsupported-region.xml
│       │   ├── android-pipeline.test.ts
│       │   ├── artifact-pipeline.test.ts
│       │   ├── fake-worker.test.ts
│       │   └── play-listing.test.ts
│       ├── workspace/
│       ├── .env.example
│       ├── docker-compose.yml
│       ├── Dockerfile
│       ├── package.json
│       └── tsconfig.json
├── .gitignore
├── AGENTS.md
├── analysis_results(1).md
├── CLAUDE.md
└── STRUCTURE.md
```
