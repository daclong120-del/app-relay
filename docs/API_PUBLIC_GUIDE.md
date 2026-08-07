# AppRelay Public API — Quick Start Guide (Public Endpoint)

> **⚠️ Tài liệu này đang được cập nhật và CHƯA dùng để phát cho đối tác.**
>
> - Token `dev-worker-token-secret-key` từng ghi ở đây **đã bị vô hiệu hoá vĩnh viễn**. Nó là token nội bộ của worker, bị lộ do tài liệu này, và giờ bị từ chối ở mọi endpoint.
> - Mỗi đối tác nhận **API key riêng** gắn với tenant của mình. Cấp key bằng:
>   `npx tsx scripts/issue-api-key.ts --tenant <slug> --name "<tên key>"`
> - Base URL cũ (`*.trycloudflare.com`) là quick tunnel tạm, đã chết. Cần domain thật trước khi phát tài liệu.
> - Ví dụ `jobId` dạng `job_1786001234_abc` bên dưới là **sai** — ID thật là UUID. Phần còn lại của tài liệu chưa được kiểm chứng lại với hệ thống thật.

## Connection

| | |
|---|---|
| **Base URL** | `https://<domain-cua-ban>/api/app-relay/v1` |
| **Auth** | `Authorization: Bearer ark_live_<api-key-cua-ban>` |
| **Content-Type** | `application/json` |

Mỗi key chỉ thấy job của chính tenant mình. Truy cập job của tenant khác trả `404`.

Scope mặc định: `jobs:read`, `jobs:write`, `artifacts:read`. Thiếu scope trả `403`.

### Setup (paste vào terminal 1 lần)

```bash
export BASE="https://<domain-cua-ban>/api/app-relay/v1"
export TOKEN="ark_live_..."   # key được cấp riêng, không chia sẻ
```

---

## Endpoints

### Health Check

```bash
curl "$BASE/health"
```

```json
{ "status": "ok", "service": "app-relay-api", "version": "1.0.0" }
```

---

### Tổng quan hệ thống

```bash
curl "$BASE/overview" -H "Authorization: Bearer $TOKEN"
```

---

### Danh sách app đã kéo

```bash
curl "$BASE/apps" -H "Authorization: Bearer $TOKEN"
```

---

### Kéo 1 app

```bash
curl -X POST "$BASE/jobs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "playUrl": "https://play.google.com/store/apps/details?id=com.facemoji.lite",
    "includeListing": true,
    "includeScreenshots": true
  }'
```

**Response** `201`:
```json
{
  "data": {
    "jobId": "job_1786001234_abc",
    "packageId": "com.facemoji.lite",
    "status": "queued"
  }
}
```

---

### Kéo nhiều app

```bash
curl -X POST "$BASE/jobs/batch" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://play.google.com/store/apps/details?id=com.facemoji.lite",
      "https://play.google.com/store/apps/details?id=com.simejikeyboard"
    ]
  }'
```

---

### Danh sách jobs

```bash
# Tất cả
curl "$BASE/jobs" -H "Authorization: Bearer $TOKEN"

# Lọc theo status + phân trang
curl "$BASE/jobs?status=running&page=1&pageSize=10" -H "Authorization: Bearer $TOKEN"
```

---

### Chi tiết 1 job

```bash
curl "$BASE/jobs/{jobId}" -H "Authorization: Bearer $TOKEN"
```

---

### Timeline sự kiện của job

```bash
curl "$BASE/jobs/{jobId}/events" -H "Authorization: Bearer $TOKEN"
```

---

### Hủy job

```bash
curl -X POST "$BASE/jobs/{jobId}/cancel" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "cancel reason" }'
```

---

### Thử lại job thất bại

```bash
curl -X POST "$BASE/jobs/{jobId}/retry" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "retry reason" }'
```

---

### Lấy link tải APK

```bash
curl -X POST "$BASE/jobs/{jobId}/artifact/download-url" \
  -H "Authorization: Bearer $TOKEN"
```

**Response** `200`:
```json
{
  "data": {
    "downloadUrl": "https://storage.example.com/artifacts/job_xxx.zip?token=...",
    "expiresAt": "2026-08-06T16:15:00.000Z"
  }
}
```

---

### Trạng thái fleet worker

```bash
curl "$BASE/workers/fleet-status" -H "Authorization: Bearer $TOKEN"
```

---

## Error Format

Tất cả lỗi trả về cùng format:

```json
{
  "error": {
    "code": "INVALID_PLAY_URL",
    "message": "The provided URL is not a valid Google Play store details link.",
    "requestId": "req_1786001500_xyz",
    "retryable": false
  }
}
```
