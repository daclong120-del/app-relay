# AppRelay Frontend API — Tài Liệu Thiết Kế (v1.0.0)

> **Auto-generated source**: File này được viết dựa trên [`openapi.yaml`](./openapi.yaml) được sinh tự động từ TypeScript Zod Schemas.  
> **Base URL**: `/api/release-ops/app-relay/v1`

---

## 🔐 Xác Thực (Security)

| Scheme | Loại | Mô tả |
|---|---|---|
| `supabaseBearer` | Bearer JWT | Supabase access token dành cho Release Ops Admin |
| `csrfToken` | API Key (header: `X-CSRF-Token`) | Bắt buộc với mọi thao tác ghi dữ liệu (POST/DELETE) |

Các endpoint chỉ yêu cầu `supabaseBearer` (đọc dữ liệu). Endpoint ghi dữ liệu yêu cầu cả hai: `supabaseBearer` + `csrfToken`.

---

## 📋 Danh Sách Endpoints

| Method | Path | Tags | Bảo mật |
|---|---|---|---|
| `GET` | `/overview` | Overview | Bearer |
| `GET` | `/jobs` | Jobs | Bearer |
| `POST` | `/jobs` | Jobs | Bearer + CSRF |
| `GET` | `/jobs/{jobId}` | Jobs | Bearer |
| `GET` | `/jobs/{jobId}/events` | Events | Bearer |
| `POST` | `/jobs/{jobId}/cancel` | Jobs | Bearer + CSRF |
| `POST` | `/jobs/{jobId}/retry` | Jobs | Bearer + CSRF |
| `POST` | `/jobs/{jobId}/artifact/download-url` | Artifacts | Bearer |
| `DELETE` | `/jobs/{jobId}/artifact` | Artifacts | Bearer + CSRF |
| `GET` | `/workers` | Workers | Bearer |
| `GET` | `/workers/{workerId}` | Workers | Bearer |

---

## 🔵 Overview

### `GET /overview`
Lấy chỉ số vận hành tổng quan của AppRelay.

**Response `200 OK`** — `OverviewResponse`:
```json
{
  "totalJobs": 1250,
  "activeJobs": 4,
  "succeededJobs": 1180,
  "failedJobs": 66,
  "onlineWorkers": 2
}
```

**Responses**: `200` `401` `403` `500`

---

## 🟢 Jobs

### `GET /jobs`
Lấy danh sách job `pull_apk` có phân trang và tìm kiếm.

**Query Parameters**:
| Tên | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `page` | `number` | Không | Trang hiện tại |
| `pageSize` | `number` | Không | Số lượng kết quả mỗi trang |
| `search` | `string` | Không | Tìm kiếm theo `packageId` hoặc `jobId` |

**Response `200 OK`** — `JobListResponse`:
```json
{
  "data": [
    {
      "id": "8b6bbfd8-62da-4c36-a49b-4e99f778f587",
      "jobType": "pull_apk",
      "status": "succeeded",
      "priority": 100,
      "packageId": "com.example.app",
      "releaseId": null,
      "appId": null,
      "workerId": null,
      "attemptCount": 1,
      "maxAttempts": 3,
      "errorMessage": null,
      "createdBy": null,
      "createdAt": "2026-08-06T09:00:00Z",
      "updatedAt": "2026-08-06T09:05:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 25,
    "totalItems": 100,
    "totalPages": 4
  }
}
```

**Responses**: `200` `400` `401` `403` `500`

---

### `POST /jobs`
Tạo một job thu thập APK từ Google Play URL. Trả về ngay, công việc xử lý diễn ra bất đồng bộ.

**Security**: `supabaseBearer` + `csrfToken`

**Request Body** — `CreateJobRequest`:
```json
{
  "playUrl": "https://play.google.com/store/apps/details?id=com.example.app&hl=en",
  "locale": "en",
  "includeListing": true,
  "includeScreenshots": true
}
```

| Field | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `playUrl` | `string (uri)` | **Có** | URL trang chi tiết Google Play Store chính thức |
| `locale` | `string` | Không | Mã ngôn ngữ, ví dụ `en`, `vi` |
| `includeListing` | `boolean` | Không | Lấy thông tin listing (default: `true`) |
| `includeScreenshots` | `boolean` | Không | Lấy ảnh chụp màn hình (default: `true`) |

**Response `202 Accepted`** — `JobResponse`:
```json
{
  "job": {
    "id": "8b6bbfd8-62da-4c36-a49b-4e99f778f587",
    "jobType": "pull_apk",
    "status": "queued",
    ...
  }
}
```

**Responses**: `202` `400` `401` `403` `409` `422`

---

### `GET /jobs/{jobId}`
Lấy thông tin chi tiết đầy đủ của một job theo `jobId`.

**Path Parameters**:
| Tên | Kiểu | Bắt buộc |
|---|---|---|
| `jobId` | `string (uuid)` | **Có** |

**Response `200 OK`** — `JobResponse`:
```json
{
  "job": {
    "id": "8b6bbfd8-62da-4c36-a49b-4e99f778f587",
    "jobType": "pull_apk",
    "status": "running",
    "priority": 100,
    "packageId": "com.example.app",
    "workerId": "worker-uuid-here",
    "attemptCount": 1,
    "maxAttempts": 3,
    "errorMessage": null,
    "createdAt": "2026-08-06T09:00:00Z",
    "updatedAt": "2026-08-06T09:02:00Z"
  }
}
```

**Responses**: `200` `404` `500`

---

### `POST /jobs/{jobId}/cancel`
Hủy hoặc yêu cầu hủy job đang xếp hàng / đang chạy.

**Security**: `supabaseBearer` + `csrfToken`

**Path Parameters**: `jobId` (uuid, bắt buộc)

**Request Body** — `ActionReasonRequest` *(optional)*:
```json
{
  "reason": "Lý do hủy job (tùy chọn, tối đa 500 ký tự)"
}
```

**Response `202 Accepted`** — `JobResponse` (job đã cập nhật trạng thái `cancelled`)

**Responses**: `202` `400` `404` `409`

---

### `POST /jobs/{jobId}/retry`
Xếp hàng lại một job đã thất bại (`failed`) hoặc `dead_letter`.

**Security**: `supabaseBearer` + `csrfToken`

**Path Parameters**: `jobId` (uuid, bắt buộc)

**Request Body** — `ActionReasonRequest` *(optional)*:
```json
{
  "reason": "Lý do thử lại (tùy chọn, tối đa 500 ký tự)"
}
```

**Response `202 Accepted`** — `JobResponse` (job đã được xếp hàng lại)

**Responses**: `202` `400` `404` `409`

---

## 🟡 Events

### `GET /jobs/{jobId}/events`
Lấy nhật ký tiến độ (append-only events) của job theo cursor pagination.

**Path Parameters**: `jobId` (uuid, bắt buộc)

**Response `200 OK`** — `EventListResponse`:
```json
{
  "data": [
    {
      "id": "event-uuid-1",
      "jobId": "8b6bbfd8-62da-4c36-a49b-4e99f778f587",
      "level": "info",
      "stage": "pull_apk",
      "message": "Đang tải APK về thiết bị...",
      "progress": 45,
      "metadata": {},
      "createdAt": "2026-08-06T09:02:00Z"
    }
  ],
  "nextCursor": null
}
```

**Responses**: `200` `404` `500`

---

## 🟠 Artifacts

### `POST /jobs/{jobId}/artifact/download-url`
Tạo đường dẫn tải xuống ngắn hạn (signed URL) cho artifact của job.

**Path Parameters**: `jobId` (uuid, bắt buộc)

**Response `200 OK`** — `DownloadUrlResponse`:
```json
{
  "downloadUrl": "https://storage.supabase.co/v1/object/sign/release-ops-artifacts/...",
  "expiresAt": "2026-08-06T09:30:00Z"
}
```

**Responses**: `200` `404` `410` (Gone — artifact đã hết hạn/bị xóa)

---

### `DELETE /jobs/{jobId}/artifact`
Xóa file artifact khỏi hệ thống lưu trữ.

**Security**: `supabaseBearer` + `csrfToken`

**Path Parameters**: `jobId` (uuid, bắt buộc)

**Request Body** — `ActionReasonRequest` *(optional)*:
```json
{
  "reason": "Lý do xóa artifact (tùy chọn)"
}
```

**Response `200 OK`** — `ArtifactDeleteResponse`:
```json
{
  "success": true,
  "artifactId": "artifact-uuid-here"
}
```

**Responses**: `200` `404`

---

## 🔴 Workers

### `GET /workers`
Lấy danh sách các Worker node có khả năng `app_artifact_acquisition`.

**Response `200 OK`** — `WorkerListResponse`:
```json
{
  "data": [
    {
      "id": "worker-uuid-1",
      "workerName": "adb-node-01",
      "status": "online",
      "maxParallelJobs": 2,
      "lastHeartbeat": "2026-08-06T09:40:00Z",
      "metadata": {},
      "createdAt": "2026-08-01T00:00:00Z",
      "updatedAt": "2026-08-06T09:40:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 25,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

**Responses**: `200` `500`

---

### `GET /workers/{workerId}`
Lấy thông tin chi tiết của một Worker theo ID.

**Path Parameters**: `workerId` (uuid, bắt buộc)

**Response `200 OK`** — `WorkerResponse`:
```json
{
  "worker": {
    "id": "worker-uuid-1",
    "workerName": "adb-node-01",
    "status": "online",
    "maxParallelJobs": 2,
    "lastHeartbeat": "2026-08-06T09:40:00Z",
    "createdAt": "2026-08-01T00:00:00Z",
    "updatedAt": "2026-08-06T09:40:00Z"
  }
}
```

**Responses**: `200` `404`

---

## 📐 Schemas

### `Job` (Required fields)
| Field | Kiểu | Mô tả |
|---|---|---|
| `id` | `string (uuid)` | ID của job |
| `jobType` | `"pull_apk"` | Loại job |
| `status` | `JobStatus` | Trạng thái hiện tại |
| `priority` | `integer` | Độ ưu tiên xử lý |
| `packageId` | `string` | Package ID ứng dụng Android |
| `releaseId` | `string\|null` | ID release (nếu có) |
| `appId` | `string\|null` | ID ứng dụng nội bộ |
| `workerId` | `string (uuid)\|null` | Worker đang xử lý |
| `attemptCount` | `integer` | Số lần đã thử |
| `maxAttempts` | `integer` | Số lần thử tối đa |
| `errorMessage` | `string\|null` | Thông báo lỗi (nếu có) |
| `createdBy` | `string (uuid)\|null` | UUID người tạo |
| `createdAt` | `string (date-time)` | Thời điểm tạo |
| `updatedAt` | `string (date-time)` | Thời điểm cập nhật |

### `JobEvent` (Required fields)
| Field | Kiểu | Mô tả |
|---|---|---|
| `id` | `string (uuid)` | ID sự kiện |
| `jobId` | `string (uuid)` | ID job gốc |
| `level` | `"info"\|"warn"\|"error"` | Mức độ |
| `stage` | `JobStage` | Giai đoạn trong pipeline |
| `message` | `string` | Nội dung nhật ký |
| `progress` | `number (0–100)` | % tiến trình |
| `metadata` | `object` | Dữ liệu bổ sung tùy ý |
| `createdAt` | `string (date-time)` | Thời điểm ghi nhận |

### `Artifact` (Required fields)
| Field | Kiểu | Mô tả |
|---|---|---|
| `id` | `string (uuid)` | ID artifact |
| `jobId` | `string (uuid)` | Job tạo ra artifact |
| `fileName` | `string` | Tên tệp |
| `checksum` | `string\|null` | Hash checksum |
| `storagePath` | `string` | Đường dẫn nội bộ trên Storage |
| `artifactType` | `string` | Loại artifact |
| `contentType` | `string` | MIME type |
| `sizeBytes` | `integer` | Kích thước file (bytes) |
| `expiresAt` | `string (date-time)\|null` | Hạn lưu trữ |
| `deletedAt` | `string (date-time)\|null` | Thời điểm xóa |
| `createdAt` | `string (date-time)` | Thời điểm tạo |

### `Worker` (Required fields)
| Field | Kiểu | Mô tả |
|---|---|---|
| `id` | `string (uuid)` | ID worker |
| `workerName` | `string` | Tên định danh worker |
| `status` | `WorkerStatus` | Trạng thái hoạt động |
| `maxParallelJobs` | `integer` | Số job xử lý song song tối đa |
| `lastHeartbeat` | `string (date-time)\|null` | Lần ping cuối |
| `metadata` | `object` | Metadata bổ sung |
| `createdAt` | `string (date-time)` | Thời điểm đăng ký |
| `updatedAt` | `string (date-time)` | Thời điểm cập nhật |

### `ErrorResponse`
```json
{
  "error": {
    "code": "INVALID_JOB_STATE",
    "message": "The requested action is not allowed for the current job state.",
    "requestId": "85f89d7c-ad76-490f-b8ec-08d5af6fbca1",
    "retryable": false
  }
}
```

---

## 🗂 Enums

### `JobStatus`
| Giá trị | Ý nghĩa |
|---|---|
| `queued` | Đang xếp hàng chờ Worker nhận |
| `claimed` | Đã được Worker tiếp nhận |
| `running` | Đang thực thi trên Worker |
| `succeeded` | Hoàn thành thành công |
| `failed` | Thất bại (có thể retry) |
| `retrying` | Đang thử lại |
| `dead_letter` | Thất bại vĩnh viễn (hết số lần retry) |
| `cancelled` | Đã bị hủy |
| `expired` | Đã hết hạn |

### `JobStage`
Pipeline xử lý tuần tự theo thứ tự:

`validate_url` → `acquire_listing` → `pull_apk` → `verify_apk` → `upload_storage` → `complete`

### `WorkerStatus`
| Giá trị | Ý nghĩa |
|---|---|
| `online` | Sẵn sàng nhận job |
| `busy` | Đang xử lý job |
| `offline` | Không kết nối |
| `degraded` | Hoạt động không ổn định |
