Thống nhất API v1 gồm 2 nhóm:

* Public API: người gọi sử dụng.
* Internal API: chỉ container worker sử dụng.

Bỏ `/overview` và `/workers/fleet-status`; thay bằng một endpoint `/system/status`. Đồng thời bổ sung endpoint tải file thật, vì `download-url` chỉ tạo link.

## 1. Public API

```env
BASE=https://api.example.com/v1
```

Tất cả endpoint trừ `/health` và link tải file dùng:

```http
Authorization: Bearer $API_TOKEN
```

### System

| Method | Endpoint         | Chức năng                       |
| ------ | ---------------- | ------------------------------- |
| `GET`  | `/health`        | Kiểm tra API còn sống           |
| `GET`  | `/system/status` | Database, hàng đợi và số worker |

`GET /health`:

```json
{
  "status": "ok",
  "service": "app-relay-api",
  "version": "1.0.0"
}
```

`GET /system/status`:

```json
{
  "data": {
    "database": "ok",
    "jobs": {
      "queued": 3,
      "running": 1,
      "failed": 2
    },
    "workers": {
      "online": 1,
      "busy": 1,
      "offline": 0
    }
  }
}
```

### Apps

| Method | Endpoint           | Chức năng                       |
| ------ | ------------------ | ------------------------------- |
| `GET`  | `/apps`            | Danh sách app đã kéo thành công |
| `GET`  | `/apps/:packageId` | Chi tiết một app                |

Hỗ trợ:

```bash
GET /apps?page=1&pageSize=20
GET /apps?search=facemoji
```

### Jobs

| Method | Endpoint              | Chức năng             |
| ------ | --------------------- | --------------------- |
| `POST` | `/jobs`               | Tạo một job           |
| `POST` | `/jobs/batch`         | Tạo nhiều job         |
| `GET`  | `/jobs`               | Danh sách job         |
| `GET`  | `/jobs/:jobId`        | Chi tiết job          |
| `GET`  | `/jobs/:jobId/events` | Timeline job          |
| `POST` | `/jobs/:jobId/cancel` | Yêu cầu hủy           |
| `POST` | `/jobs/:jobId/retry`  | Chạy lại job thất bại |

Tạo một job:

```bash
curl -X POST "$BASE/jobs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: request-001" \
  -d '{
    "playUrl": "https://play.google.com/store/apps/details?id=com.facemoji.lite",
    "includeListing": true,
    "includeScreenshots": true
  }'
```

Response `201`:

```json
{
  "data": {
    "jobId": "job_1786001234_abc",
    "packageId": "com.facemoji.lite",
    "status": "queued",
    "createdAt": "2026-08-07T10:00:00.000Z"
  }
}
```

Tạo batch:

```json
{
  "urls": [
    "https://play.google.com/store/apps/details?id=com.facemoji.lite",
    "https://play.google.com/store/apps/details?id=com.simejikeyboard"
  ],
  "includeListing": true,
  "includeScreenshots": true
}
```

Response:

```json
{
  "data": {
    "batchId": "01988abc-def0-7000-abcd-123456789000",
    "jobs": [
      {
        "jobId": "job_001",
        "packageId": "com.facemoji.lite",
        "status": "queued"
      },
      {
        "jobId": "job_002",
        "packageId": "com.simejikeyboard",
        "status": "queued"
      }
    ]
  }
}
```

Lọc job:

```text
GET /jobs?status=running&page=1&pageSize=20
GET /jobs?batchId=01988abc-def0-7000-abcd-123456789000
GET /jobs?packageId=com.facemoji.lite
```

### Artifact

API lưu artifact dưới dạng **thư mục**, không phải một file ZIP. Client lấy được cả cục, một nhóm, hoặc đúng một file. Xem `artifact_storage.md`.

| Method | Endpoint                             | Chức năng                     |
| ------ | ------------------------------------ | ----------------------------- |
| `GET`  | `/jobs/:jobId/artifact/files`        | Liệt kê file trong artifact   |
| `POST` | `/jobs/:jobId/artifact/download-url` | Tạo link tải có thời hạn      |
| `GET`  | `/artifacts/:artifactId/download`    | Stream file/nhóm/cả cục       |

`GET /jobs/:jobId/artifact/files`:

```json
{
  "data": {
    "artifactId": "07a074d0-968f-4187-b841-d27cf6cf8e18",
    "totalSizeBytes": 149191734,
    "files": [
      { "path": "base.apk", "sizeBytes": 68582418, "sha256": "1c26…", "select": "apk.base" },
      { "path": "split_config.arm64_v8a.apk", "sizeBytes": 75029958, "sha256": "f60d…", "select": "apk.splits" },
      { "path": "playstore/icon.png", "sizeBytes": 23483, "sha256": "a7c8…", "select": "listing" },
      { "path": "playstore/screenshots/screenshot_01.png", "sizeBytes": 277350, "sha256": "cbea…", "select": "screenshots" }
    ]
  }
}
```

File APK có thể đã bị xoá sớm theo TTL riêng; khi đó `files` không liệt kê nữa nhưng phần nhẹ vẫn còn.

#### Selector

| `select`   | Nội dung                                        |
| ---------- | ----------------------------------------------- |
| `all`      | toàn bộ thư mục (mặc định)                      |
| `apk`      | `base.apk` + mọi `split_config.*`               |
| `apk.base` | chỉ `base.apk`                                  |
| `apk.splits` | chỉ `split_config.*`                          |
| `screenshots` | `playstore/screenshots/*`                    |
| `listing`  | `description.md` + `listing.json` + `icon.png`  |
| `listing.full` | `listing` + `page.html`                     |
| `metadata` | `PULL_MANIFEST.txt` + `package-info.txt` + `device-dir.listing` |

Một file → trả file thô. Nhiều file → gói ZIP tại chỗ, không lưu lại trên đĩa.

Tạo link:

```bash
# cả cục — hành vi mặc định
curl -X POST "$BASE/jobs/job_001/artifact/download-url" \
  -H "Authorization: Bearer $TOKEN"

# chỉ screenshots
curl -X POST "$BASE/jobs/job_001/artifact/download-url" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"select": "screenshots"}'

# đúng một file
curl -X POST "$BASE/jobs/job_001/artifact/download-url" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"path": "base.apk"}'
```

Response:

```json
{
  "data": {
    "downloadUrl": "https://api.example.com/v1/artifacts/xxx/download?select=screenshots&expires=1786000000&signature=xxx",
    "expiresAt": "2026-08-07T10:15:00.000Z",
    "fileName": "com.facemoji.lite-screenshots.zip",
    "sizeBytes": 1240000,
    "sha256": null
  }
}
```

`sha256` chỉ có giá trị khi tải **một file**. Với nhóm hoặc cả cục thì ZIP sinh tại chỗ nên khác nhau mỗi lần — dùng `sha256` từng file trong `/artifact/files`, hoặc `PULL_MANIFEST.txt` mà worker đã ghi sẵn.

Tải cả cục hoặc theo nhóm không có `Content-Length` vì nén khi đang stream.

`GET /artifacts/:artifactId/download` không cần Bearer token vì URL đã có chữ ký và thời hạn. Chữ ký chỉ phủ `artifactId` và `expires`, **không** phủ `select`/`path`: link mặc định vốn đã cho cả cục, nên sửa query chỉ lấy được ít hơn.

Endpoint này hỗ trợ `Range` để resume khi tải file lớn đứt giữa chừng.

## 2. Internal Worker API

Worker gọi trong Docker network:

```env
RELAY_API_URL=http://api:3000/internal/v1
```

Header:

```http
Authorization: Bearer $WORKER_TOKEN
```

| Method | Endpoint                 | Chức năng                         |
| ------ | ------------------------ | --------------------------------- |
| `POST` | `/workers/heartbeat`     | Đăng ký/cập nhật worker           |
| `POST` | `/jobs/claim`            | Nhận một job đang chờ             |
| `POST` | `/jobs/:jobId/heartbeat` | Gia hạn lease và cập nhật tiến độ |
| `POST` | `/jobs/:jobId/events`    | Ghi timeline                      |
| `PUT`  | `/jobs/:jobId/files/*`   | Upload một file của artifact      |
| `POST` | `/jobs/:jobId/artifact/finalize` | Chốt artifact, tính tổng  |
| `POST` | `/jobs/:jobId/complete`  | Báo hoàn thành                    |
| `POST` | `/jobs/:jobId/fail`      | Báo thất bại                      |
| `POST` | `/jobs/:jobId/cancelled` | Xác nhận đã hủy                   |

### Worker heartbeat

```json
{
  "workerId": "worker_vps_01",
  "name": "VPS Worker 01",
  "version": "1.0.0",
  "capabilities": {
    "avd": "chpay",
    "maxConcurrentJobs": 1
  },
  "stats": {
    "emulatorReady": true,
    "freeDiskBytes": 53687091200
  }
}
```

### Claim job

Request:

```json
{
  "workerId": "worker_vps_01"
}
```

Khi có job, trả `200`:

```json
{
  "data": {
    "jobId": "job_001",
    "packageId": "com.facemoji.lite",
    "playUrl": "https://play.google.com/store/apps/details?id=com.facemoji.lite",
    "includeListing": true,
    "includeScreenshots": true,
    "attempt": 1,
    "leaseExpiresAt": "2026-08-07T10:02:00.000Z"
  }
}
```

Không có job thì trả:

```http
204 No Content
```

### Job heartbeat

```json
{
  "workerId": "worker_vps_01",
  "progress": 60,
  "currentStep": "pulling_apk"
}
```

Response cho worker biết có yêu cầu hủy không:

```json
{
  "data": {
    "leaseExpiresAt": "2026-08-07T10:04:00.000Z",
    "cancelRequested": false
  }
}
```

### Ghi event

```json
{
  "eventType": "apk.pulled",
  "level": "info",
  "message": "Pulled base APK and 4 splits",
  "data": {
    "splitCount": 4,
    "baseApkSizeBytes": 50231234
  }
}
```

### Upload artifact

Worker **không** nén nữa. Nó gửi thẳng từng file của `work/apks/<packageId>/`, giữ nguyên đường dẫn tương đối. Nén là việc của API và chỉ xảy ra khi client xin nhiều file.

```bash
# mỗi file một request, path tương đối nằm trên URL
curl -X PUT \
  "http://api:3000/internal/v1/jobs/job_001/files/base.apk" \
  -H "Authorization: Bearer $WORKER_TOKEN" \
  -H "Content-Type: application/vnd.android.package-archive" \
  -H "X-Content-SHA256: 1c261a87…" \
  --data-binary "@base.apk"

curl -X PUT \
  "http://api:3000/internal/v1/jobs/job_001/files/playstore/screenshots/screenshot_01.png" \
  -H "Authorization: Bearer $WORKER_TOKEN" \
  -H "Content-Type: image/png" \
  -H "X-Content-SHA256: cbea6ecc…" \
  --data-binary "@screenshot_01.png"
```

API tính SHA-256 khi stream xuống đĩa và từ chối `400` nếu lệch với `X-Content-SHA256`.

Chốt lại sau khi gửi hết:

```bash
curl -X POST \
  "http://api:3000/internal/v1/jobs/job_001/artifact/finalize" \
  -H "Authorization: Bearer $WORKER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"workerId": "worker_vps_01", "fileName": "com.facemoji.lite", "fileCount": 18}'
```

`finalize` kiểm số file khớp, tính `size_bytes` tổng, đặt `state = available`. Trước khi `finalize` chạy xong thì artifact ở `state = preparing` và không tải được.

Đường dẫn trong `files/*` phải là tương đối. Bị từ chối `400`: đường dẫn tuyệt đối, thành phần `..`, và dotfile (API dùng dotfile để ghi sổ SHA-256 nội bộ).

### Complete job

Chỉ gọi sau khi `finalize` thành công:

```json
{
  "workerId": "worker_vps_01",
  "result": {
    "versionName": "3.5.1",
    "versionCode": 30501,
    "splitCount": 4,
    "screenshotCount": 8,
    "baseApkSizeBytes": 50231234
  }
}
```

### Fail job

```json
{
  "workerId": "worker_vps_01",
  "error": {
    "code": "PLAY_INSTALL_TIMEOUT",
    "message": "Play Store installation timed out after 6 minutes.",
    "retryable": true
  }
}
```

## 3. Trạng thái job thống nhất

Chỉ dùng 6 trạng thái:

```text
queued
running
cancelling
completed
failed
cancelled
```

Các bước nhỏ nằm trong `currentStep`:

```text
claiming
scraping_listing
booting_emulator
opening_play_store
installing
pulling_apk
creating_manifest
validating
uploading_artifact
```

Không biến từng bước thành một status riêng.

## 4. Danh sách chính thức v1

Tổng cộng:

* 14 public endpoints.
* 9 internal endpoints.
* Không có dashboard endpoint.
* Không có user/auth/account endpoint.
* Không có endpoint xóa app/job.
* Không có endpoint upload ảnh hoặc APK lên Supabase.
* Không cho worker truy cập Supabase trực tiếp.
* Không lưu file ZIP trên đĩa; ZIP chỉ sinh khi stream.
