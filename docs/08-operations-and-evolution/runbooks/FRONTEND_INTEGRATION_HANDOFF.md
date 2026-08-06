# Frontend Integration & Handoff Specification — AppRelay Dual-Dashboard API

> **Target Audience**: Standalone AppRelay Frontend Engineers, SinoMedia Master UI Engineers  
> **API Version**: `v1.2.0`  
> **Public API Base URL**: `/api/app-relay/v1`  
> **Generated OpenAPI Schema**: `docs/04-detailed-design/cdd-lld/api-spec/openapi.yaml`  

---

## 1. Executive Summary

AppRelay backend runs as a single deployable unit. Both frontend dashboards interact with AppRelay through the **Public API (`/api/app-relay/v1/*`)**. Neither dashboard accesses PostgreSQL database tables or Supabase service-role keys directly.

```text
┌────────────────────────────────┐       ┌────────────────────────────────┐
│   Standalone AppRelay UI       │       │    SinoMedia Master UI         │
└───────────────┬────────────────┘       └───────────────┬────────────────┘
                │                                        │
                │        (HTTP / HTTPS Requests)         │
                └───────────────────┬────────────────────┘
                                    │
                         ┌──────────▼──────────┐
                         │ Public AppRelay API │
                         │  /api/app-relay/v1  │
                         └─────────────────────┘
```

---

## 2. Using the `AppRelayApiClient` SDK

Both dashboards can import the pre-packaged TypeScript SDK `AppRelayApiClient`:

```typescript
import { AppRelayApiClient } from '@/lib/api-client/app-relay-api-client';

// Initialize client (uses NEXT_PUBLIC_APPRELAY_API_BASE_URL or default /api/app-relay/v1)
const client = new AppRelayApiClient('https://api.sinomedia.vn/api/app-relay/v1');

// 1. Fetch operational summary
const overview = await client.getOverview(userJwtToken);

// 2. Fetch paginated pull_apk jobs
const jobsResponse = await client.getJobs({ page: 1, pageSize: 25, search: 'com.example.app' }, userJwtToken);

// 3. Submit a new APK acquisition job
const newJob = await client.createJob({
  playUrl: 'https://play.google.com/store/apps/details?id=com.example.app&hl=en',
  locale: 'en',
  includeListing: true,
  includeScreenshots: true,
}, userJwtToken, csrfToken);

// 4. Request short-lived signed artifact download link
const downloadHandoff = await client.getArtifactDownloadUrl(jobId, 900, userJwtToken);
window.location.href = downloadHandoff.downloadUrl;
```

---

## 3. Embedding the SinoMedia Master UI Module

For embedding inside the SinoMedia Master Navigation, import the React Client Component:

```tsx
import { AppRelayMasterModule } from '@/components/dashboard/release-ops/master-integration/AppRelayMasterModule';

export function MasterReleaseOpsPage() {
  return (
    <div className="p-6">
      <AppRelayMasterModule 
        apiBaseUrl={process.env.NEXT_PUBLIC_APPRELAY_API_BASE_URL}
        userToken={session?.access_token}
      />
    </div>
  );
}
```

---

## 4. Error Handling & Standard Response Envelopes

Every error response from `/api/app-relay/v1/*` follows the standard format:

```json
{
  "error": {
    "code": "INVALID_PLAY_URL",
    "message": "Protocol must be https.",
    "requestId": "req_1785988000_x7y8z9",
    "retryable": false
  }
}
```

### Key Error Codes
- `INVALID_PLAY_URL`: Google Play URL format validation error (400)
- `JOB_NOT_FOUND`: Specified job UUID does not exist (404)
- `JOB_STATE_CONFLICT`: Action not permitted for current job status (409)
- `ARTIFACT_NOT_FOUND`: No active artifact exists for job (404)
- `ARTIFACT_EXPIRED`: Storage retention link has expired (410)
- `UNAUTHORIZED`: Missing or invalid Bearer JWT (401)
- `FORBIDDEN`: Admin role required (403)
