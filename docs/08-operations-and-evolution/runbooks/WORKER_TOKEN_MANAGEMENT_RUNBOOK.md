# Operational Runbook: AppRelay Worker Token Management & Rotation

> **Target Audience**: Release Ops Engineers, Security Administrators  
> **System**: SinoMedia Release Ops — AppRelay Internal Worker Gateway  
> **Security Policy**: Workers must access the Internal Worker Gateway (`/api/release-ops/worker/v1/*`) using scoped SHA-256 tokens. Worker processes must **never** be supplied with Supabase `service-role` keys or direct database access.

---

## 1. Overview & Scopes

AppRelay worker authenticates via a raw secret token passed in the `Authorization: Bearer <RAW_TOKEN>` HTTP header. The Worker Gateway hashes this token with SHA-256 and verifies it against the `api_tokens` repository table.

### Required Worker Scopes

| Scope | Description |
|---|---|
| `release_ops:worker:register` | Register worker instance identity and metadata |
| `release_ops:worker:heartbeat` | Send periodic worker health pings |
| `release_ops:job:claim` | Claim compatible `pull_apk` jobs from the queue |
| `release_ops:job:heartbeat` | Extend job lease duration and receive cancellation flags |
| `release_ops:job:event` | Append structured pipeline stage progress events |
| `release_ops:job:complete` | Mark jobs as `succeeded` or `failed` |
| `release_ops:artifact:write` | Request presigned storage upload URLs and confirm artifact upload |

---

## 2. Token Creation Procedure

To generate a new scoped token for an AppRelay worker node:

1. **Generate a random secret token**:
   ```bash
   openssl rand -hex 32
   # Example output: a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0
   ```

2. **Compute SHA-256 hash**:
   ```bash
   echo -n "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0" | sha256sum
   ```

3. **Insert record into `api_tokens` database table**:
   ```sql
   INSERT INTO api_tokens (
     id,
     name,
     token_hash,
     status,
     scopes,
     created_at,
     expires_at
   ) VALUES (
     gen_random_uuid(),
     'AppRelay-Worker-Node-01',
     '<SHA256_HASH_HERE>',
     'active',
     ARRAY[
       'release_ops:worker:register',
       'release_ops:worker:heartbeat',
       'release_ops:job:claim',
       'release_ops:job:heartbeat',
       'release_ops:job:event',
       'release_ops:job:complete',
       'release_ops:artifact:write'
     ],
     NOW(),
     NOW() + INTERVAL '365 days'
   );
   ```

4. **Configure Worker Environment Variable**:
   In `workers/app-relay-worker/.env`:
   ```env
   RELEASE_OPS_TOKEN=a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0
   ```

---

## 3. Zero-Downtime Token Rotation Procedure

To rotate a worker token without interrupting active jobs:

1. Generate a new secret token and insert its SHA-256 hash into `api_tokens`.
2. Update the `RELEASE_OPS_TOKEN` environment variable on the worker host/container.
3. Restart the worker process gracefully:
   ```bash
   docker compose restart app-relay-worker
   ```
4. Revoke the old token by setting `status = 'revoked'` in `api_tokens`:
   ```sql
   UPDATE api_tokens SET status = 'revoked' WHERE name = 'AppRelay-Worker-Node-01-Old';
   ```

---

## 4. Emergency Revocation Procedure

If a worker host or VPS is compromised:

1. Immediately revoke the token in PostgreSQL:
   ```sql
   UPDATE api_tokens SET status = 'revoked' WHERE token_hash = '<HASH_OF_COMPROMISED_TOKEN>';
   ```
2. Any subsequent HTTP request from the worker to the Internal Worker Gateway will immediately receive `401 Unauthorized`.
3. Check active leases for jobs claimed by that worker and reset them to `queued` if necessary:
   ```sql
   UPDATE release_ops_jobs 
   SET status = 'queued', worker_id = NULL, lease_until = NULL 
   WHERE worker_id = '<WORKER_UUID>' AND status IN ('claimed', 'running');
   ```
