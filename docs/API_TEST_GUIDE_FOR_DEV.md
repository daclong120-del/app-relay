# 🚀 AppRelay Public API Quick-Start & Testing Guide (v1.3.1)

Tài liệu hướng dẫn Test nhanh các REST API của **AppRelay** dành cho Admin & Integration Tester.

> 🌐 **Base URL (VPS Deployed)**: `http://79.108.216.178:3001/api/app-relay/v1`  
> 💻 **Base URL (Local Dev)**: `http://localhost:3000/api/app-relay/v1`  
> 🔑 **Auth Header**: `Authorization: Bearer dev-worker-token-secret-key`  
> 📄 **Content-Type**: `application/json`

---

## 🔑 1. Cấu Hình Host & Key Chạy Nhanh (cURL Quick-Setup)

Đối tác / Tester copy 2 dòng sau paste vào Terminal trước khi chạy các câu lệnh cURL bên dưới:

```bash
# 1. Host VPS chính thức đang chạy
export BASE_URL="http://79.108.216.178:3001/api/app-relay/v1"

# 2. Secret Key / Bearer Token mặc định
export AUTH_TOKEN="dev-worker-token-secret-key"
```

---

## ⚡ 2. Lệnh cURL Dùng Ngay Cho Đối Tác (Copy-Paste Trực Tiếp)

Đối tác có thể copy chính xác 100% câu lệnh cURL dưới đây để chạy trực tiếp trên VPS của bạn:

### Example: Kéo App Hàng Loạt (POST `/jobs/batch`)
```bash
curl -X POST "http://79.108.216.178:3001/api/app-relay/v1/jobs/batch" \
  -H "Authorization: Bearer dev-worker-token-secret-key" \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://play.google.com/store/apps/details?id=com.facemoji.lite",
      "https://play.google.com/store/apps/details?id=com.simejikeyboard"
    ]
  }'
```

---

## 📋 2. Danh Sách Endpoint & Lệnh cURL Test Nhanh

### 1. Health Check (Không cần Auth)
```bash
curl -X GET "$BASE_URL/health"
```
**Response Mẫu (200 OK):**
```json
{
  "status": "ok",
  "service": "app-relay-api",
  "version": "1.3.1",
  "timestamp": "2026-08-06T15:15:00.000Z"
}
```

---

### 2. Thống Kê Tổng Quan (`GET /overview`)
```bash
curl -X GET "$BASE_URL/overview" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

---

### 3. Xem Danh Mục App Đã Kéo (`GET /apps`)
```bash
curl -X GET "$BASE_URL/apps" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

---

### 4. Gửi Yêu Cầu Kéo 1 App (`POST /jobs`)
```bash
curl -X POST "$BASE_URL/jobs" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "playUrl": "https://play.google.com/store/apps/details?id=com.facemoji.lite",
    "includeListing": true,
    "includeScreenshots": true
  }'
```
**Response Mẫu (201 Created):**
```json
{
  "data": {
    "jobId": "job_1786001234_abc",
    "packageId": "com.facemoji.lite",
    "status": "queued",
    "createdAt": "2026-08-06T15:15:00.000Z"
  }
}
```

---

### 5. Gửi Yêu Cầu Kéo Hàng Loạt (`POST /jobs/batch`)
```bash
curl -X POST "$BASE_URL/jobs/batch" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://play.google.com/store/apps/details?id=com.facemoji.lite",
      "https://play.google.com/store/apps/details?id=com.simejikeyboard"
    ]
  }'
```

---

### 6. Lấy Danh Sách Jobs (`GET /jobs`)
```bash
curl -X GET "$BASE_URL/jobs?status=running&limit=10" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

---

### 7. Xem Chi Tiết 1 Job (`GET /jobs/{jobId}`)
```bash
curl -X GET "$BASE_URL/jobs/job_1786001234_abc" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

---

### 8. Xem Stream Tiến Độ Timeline (`GET /jobs/{jobId}/events`)
```bash
curl -X GET "$BASE_URL/jobs/job_1786001234_abc/events" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

---

### 9. Hủy Yêu Cầu Đang Chạy (`POST /jobs/{jobId}/cancel`)
```bash
curl -X POST "$BASE_URL/jobs/job_1786001234_abc/cancel" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Cancelled by testing operator"
  }'
```

---

### 10. Thử Lại Job Thất Bại (`POST /jobs/{jobId}/retry`)
```bash
curl -X POST "$BASE_URL/jobs/job_1786001234_abc/retry" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Re-triggering failed job test"
  }'
```

---

### 11. Lấy Link Tải File ZIP APK (`POST /jobs/{jobId}/artifact/download-url`)
```bash
curl -X POST "$BASE_URL/jobs/job_1786001234_abc/artifact/download-url" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```
**Response Mẫu (200 OK):**
```json
{
  "data": {
    "jobId": "job_1786001234_abc",
    "downloadUrl": "https://<YOUR_SUPABASE_STORAGE>/release-ops/artifacts/job_1786001234_abc.zip?token=...",
    "expiresAt": "2026-08-06T16:15:00.000Z"
  }
}
```

---

### 12. Kiểm Tra Sức Khỏe Fleet Máy Ảo (`GET /workers/fleet-status`)
```bash
curl -X GET "$BASE_URL/workers/fleet-status" \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

---

## 🛑 3. Quy Chuẩn Báo Lỗi Standard Error Envelope

Tất cả các lỗi (4xx / 5xx) đều phản hồi đúng định dạng:

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
