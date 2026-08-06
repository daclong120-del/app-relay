# SinoMedia Release Ops — AppRelay Operational Runbook

> **Target Service**: AppRelay capability under SinoMedia Release Ops  
> **Control Plane**: Next.js / Vercel + Supabase  
> **Execution Plane**: Outbound ADB Worker Container (`workers/app-relay-worker`)

---

## 1. Deployment Procedures

### 1.1 Staging Deployment
1. Apply Supabase SQL migrations:
   ```bash
   npx supabase db push
   ```
2. Generate staging worker token:
   ```bash
   openssl rand -hex 32
   ```
3. Deploy Next.js Dashboard & Worker Gateway to Vercel Staging environment.
4. Deploy AppRelay worker container:
   ```bash
   cd workers/app-relay-worker
   docker-compose up -d --build
   ```
5. Run automated test matrix:
   ```bash
   npx tsx scripts/run-all-tests.ts
   ```

### 1.2 Production Rollout
1. Perform schema migrations with backward compatibility.
2. Deploy Worker Gateway endpoints (`/api/release-ops/worker/v1/...`).
3. Deploy production AppRelay worker container tagged by immutable digest.
4. Enable feature flag `NEXT_PUBLIC_ENABLE_APP_RELAY=true` for admin role.
5. Execute single smoke test job (`pull_apk` for test package).

---

## 2. Emergency Kill Switches

In case of unexpected worker behavior or Google Play Store UI breaking changes:

### 2.1 Disable Job Submissions
Set environment variable in Vercel Dashboard:
```env
NEXT_PUBLIC_ENABLE_APP_RELAY=false
```

### 2.2 Pause Worker Queue Claim
Set environment variable in Gateway environment:
```env
ENABLE_WORKER_JOB_CLAIM=false
```

### 2.3 Immediate Worker Token Revocation
Revoke token in `release_ops_worker_tokens` table or change `RELEASE_OPS_WORKER_TOKEN` environment variable.

---

## 3. Rollback Playbook

1. **Dashboard & Gateway Rollback**: Revert Vercel deployment to previous successful deployment ID.
2. **Worker Container Rollback**: Roll back `docker-compose` to previous image digest tag:
   ```bash
   docker pull app-relay-worker:previous-digest
   docker-compose up -d
   ```
3. **Database Rollback Policy**: Do not issue `DROP TABLE` or destructive SQL rollbacks. Use forward-fixing migrations if schema adjustments are needed.

---

## 4. Incident Response Matrix

| Incident | Symptom | Action |
| --- | --- | --- |
| ADB Offline | Error `DEVICE_UNAVAILABLE` | Check USB connection or restart AVD via `adb kill-server && adb start-server` |
| Play UI Changed | Error `PLAY_UI_CHANGED` | Update `play-ui-automator.ts` selectors and deploy hotfix worker image |
| Low Disk Space | Job fails during packaging | Worker automatically rejects claims when free disk < 1GB. Run workspace cleanup script |
| Stale Lease | Jobs stuck in `running` | Automated reconciliation (`reconcileExpiredLeases`) will requeue or dead-letter jobs |

---

## 5. Operations Verification Command

Run the unified test matrix to verify all system components prior to sign-off:
```bash
npx tsx scripts/run-all-tests.ts
```
