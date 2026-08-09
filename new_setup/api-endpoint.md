# API v1 — tài liệu cho người gọi

Gồm 2 nhóm:

* **Public API** — người gọi và đối tác sử dụng. 14 endpoint.
* **Internal API** — chỉ container worker sử dụng. 9 endpoint.

Không có dashboard endpoint, không có user/auth/account endpoint, không có endpoint xoá app/job, không có endpoint upload lên Supabase, và worker không truy cập Supabase trực tiếp.

---

# Phần 1 — Dành cho đối tác

## 1.1. Chỉ cần 2 giá trị

```env
BASE_URL=https://lap-joyce-numeric-change.trycloudflare.com/v1
API_TOKEN=apr_live_8b1444e26673fa97a0adab84fcd785a871b4cea6d8f31f35
```

```bash
curl "$BASE_URL/health"
curl "$BASE_URL/jobs" -H "Authorization: Bearer $API_TOKEN"
```

Không cần cài gì, không cần VPN, không cần biết hệ thống chạy ở đâu — chỉ là HTTPS thường.

> **URL trên là tạm.** Nó đi qua Cloudflare quick tunnel và **đổi mỗi lần server khởi động lại**. Dùng để thử thì được, nhưng **đừng hardcode vào code sản phẩm**. Khi cần URL cố định sẽ có bản `https://api.<tên-miền>/v1` thay thế — lúc đó chỉ đổi `BASE_URL`, token và mọi endpoint giữ nguyên.

Người gọi không cần biết: Supabase, địa chỉ worker, Android SDK/JDK, IP server, Cloudflare hay Caddy đứng trước API, tài khoản Google Play.

## 1.2. Luồng đầy đủ

Job chạy bất đồng bộ nên không có chuyện một request là có file ngay. Bốn bước:

```bash
BASE_URL=https://lap-joyce-numeric-change.trycloudflare.com/v1
API_TOKEN=apr_live_8b1444e26673fa97a0adab84fcd785a871b4cea6d8f31f35

# 1. Đặt hàng. Idempotency-Key để gửi lại lúc mạng lỗi không tạo job trùng.
JOB=$(curl -s -X POST "$BASE_URL/jobs" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: don-hang-001" \
  -d '{"playUrl":"https://play.google.com/store/apps/details?id=com.zing.zalo"}' \
  | jq -r .data.jobId)

# 2. Chờ xong. Phải thoát ở CẢ ba trạng thái kết thúc, không chỉ completed —
#    bám mỗi 'completed' thì job failed sẽ làm vòng lặp chạy mãi.
while :; do
  S=$(curl -s "$BASE_URL/jobs/$JOB" \
        -H "Authorization: Bearer $API_TOKEN" | jq -r .data.status)
  case "$S" in
    completed)          break ;;
    failed|cancelled)   echo "job kết thúc ở trạng thái: $S" >&2; exit 1 ;;
  esac
  sleep 5
done

# 3. Xin link tải. Bỏ `select` thì lấy cả cục.
URL=$(curl -s -X POST "$BASE_URL/jobs/$JOB/artifact/download-url" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"select":"screenshots"}' | jq -r .data.downloadUrl)

# 4. Tải — link đã mang chữ ký nên không cần token nữa.
curl -O -J "$URL"
```

## 1.3. Trạng thái job

```text
queued → running → completed
                 → failed
                 → cancelling → cancelled
```

Ba trạng thái cuối là kết thúc. Job `failed` gọi được `POST /jobs/{id}/retry` để chạy lại và giữ nguyên job ID; `completed` và `cancelled` thì không.

Các bước nhỏ nằm trong `currentStep`, không phải status riêng:

```text
claiming · scraping_listing · booting_emulator · opening_play_store
installing · pulling_apk · creating_manifest · validating · uploading_artifact
```

## 1.4. Chỉ lấy thứ mình cần

Xem artifact có gì trước khi tải:

```bash
curl "$BASE_URL/jobs/$JOB/artifact/files" -H "Authorization: Bearer $API_TOKEN"
```

| `select` | Nội dung | Zalo |
| --- | --- | --- |
| bỏ trống / `all` | toàn bộ | 73 MB |
| `apk` | `base.apk` + mọi split | 68.5 MB |
| `apk.base` | chỉ `base.apk` | 65.4 MB |
| `apk.splits` | chỉ `split_config.*` | 33.6 MB |
| `screenshots` | `playstore/screenshots/*` | 1.0 MB |
| `listing.full` | listing + `page.html` | 220 KB |
| `listing` | `description.md` + `listing.json` + `icon.png` | 24 KB |
| `metadata` | `PULL_MANIFEST.txt` + `package-info.txt` + `device-dir.listing` | 10 KB |

Chênh tới **3000 lần**. Đừng tải cả cục nếu chỉ cần metadata.

Lấy đúng một file bằng `path` thay cho `select`:

```bash
curl -s -X POST "$BASE_URL/jobs/$JOB/artifact/download-url" \
  -H "Authorization: Bearer $API_TOKEN" -H "Content-Type: application/json" \
  -d '{"path":"playstore/icon.png"}'
```

Một file → trả file thô, có `Content-Length`, hỗ trợ `Range`.
Nhiều file → gói ZIP khi đang stream, không có `Content-Length`.

## 1.5. Mã lỗi

| Mã | Khi nào | Nên làm |
| --- | --- | --- |
| `401` | thiếu header `Authorization` | thêm token |
| `403` | có token nhưng sai | kiểm tra token, **đừng** thử lại |
| `403` khi tải | link hết hạn hoặc chữ ký sai | gọi lại `download-url` |
| `404` | job / app / file không tồn tại | không thử lại |
| `400` | body sai, URL thiếu `?id=`, selector lạ, **thao tác sai trạng thái** (retry job chưa failed, cancel job đã xong) | sửa request |
| `410` | file không còn — APK đã quá hạn lưu trữ | chạy job mới |
| `416` | `Range` vượt kích thước file | bỏ header `Range` |

Thân lỗi luôn cùng một dạng; phân nhánh theo `error.code`, đừng đọc `message`:

```json
{ "error": { "code": "INVALID_STATUS", "message": "..." } }
```

## 1.6. Bốn điều quyết định cách viết client

**Job chạy tuần tự trên một emulator**, mỗi job khoảng 60 giây. Gửi 20 URL là mất khoảng 20 phút, và nếu có bên khác đang gửi thì xếp hàng sau. Đừng thiết kế kiểu gọi xong chờ ngay.

**Link tải sống 10 phút.** Hết hạn thì gọi lại `download-url`, file vẫn còn.

**APK giữ 7 ngày** sau khi job xong (`APK_TTL_HOURS`, mặc định repo là 6 tiếng). Quá hạn thì listing, ảnh và metadata vẫn tra được, nhưng muốn APK phải chạy job mới.

**Tải file lớn nên dùng `Range`** để resume khi đứt mạng, thay vì tải lại 68 MB từ đầu.

## 1.7. Một token dùng chung

Phiên bản `1.0` chỉ có **một** `API_TOKEN` cho toàn hệ thống. Ai cầm nó cũng thấy và sửa được job của mọi bên khác: xem danh sách, huỷ, chạy lại, tải artifact bất kỳ. Không có giới hạn tốc độ hay hạn ngạch.

Đây là chuyện vận hành chứ không phải bị tấn công — hai bên dùng chung token thì gọi nhầm `jobId` của nhau là chuyện sẽ xảy ra.

Nếu đối tác **chỉ cần nhận file**, không bắt buộc đưa token: link tải tự mang chữ ký nên gọi được mà không cần `Authorization`. Đổi lại phải nới `DOWNLOAD_URL_TTL_SECONDS` vì mặc định 10 phút không đủ để gửi qua email.

---

# Phần 2 — Public API (14 endpoint)

Tất cả endpoint trừ `/health` và link tải đều cần:

```http
Authorization: Bearer $API_TOKEN
```

## System

| Method | Endpoint | Chức năng |
| --- | --- | --- |
| `GET` | `/health` | Kiểm tra API còn sống |
| `GET` | `/system/status` | Database, hàng đợi và số worker |

`GET /health` — không cần token:

```json
{ "status": "ok", "service": "app-relay-api", "version": "1.0.0" }
```

`GET /system/status`:

```json
{
  "data": {
    "database": "ok",
    "jobs": { "queued": 3, "running": 1, "failed": 2 },
    "workers": { "online": 1, "busy": 1, "offline": 0 }
  }
}
```

## Apps

| Method | Endpoint | Chức năng |
| --- | --- | --- |
| `GET` | `/apps` | Danh sách app đã kéo thành công |
| `GET` | `/apps/:packageId` | Chi tiết một app |

```bash
GET /apps?page=1&pageSize=20
GET /apps?search=facemoji
```

## Jobs

| Method | Endpoint | Chức năng |
| --- | --- | --- |
| `POST` | `/jobs` | Tạo một job |
| `POST` | `/jobs/batch` | Tạo nhiều job |
| `GET` | `/jobs` | Danh sách job |
| `GET` | `/jobs/:jobId` | Chi tiết job |
| `GET` | `/jobs/:jobId/events` | Timeline job |
| `POST` | `/jobs/:jobId/cancel` | Yêu cầu huỷ |
| `POST` | `/jobs/:jobId/retry` | Chạy lại job thất bại |

Tạo một job:

```bash
curl -X POST "$BASE_URL/jobs" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: request-001" \
  -d '{
    "playUrl": "https://play.google.com/store/apps/details?id=com.facemoji.lite",
    "includeListing": true,
    "includeScreenshots": true,
    "deleteAfterDownload": false
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

Gửi lại cùng `Idempotency-Key` trả `200` kèm đúng job cũ, không tạo job mới.

`deleteAfterDownload: true` thì APK bị xoá ngay sau khi tải xong trọn vẹn, phần nhẹ vẫn giữ.

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

```json
{
  "data": {
    "batchId": "01988abc-def0-7000-abcd-123456789000",
    "jobs": [
      { "jobId": "job_001", "packageId": "com.facemoji.lite", "status": "queued" },
      { "jobId": "job_002", "packageId": "com.simejikeyboard", "status": "queued" }
    ]
  }
}
```

Mỗi job trong batch có artifact **riêng**; không có ZIP gộp cho cả batch.

Lọc job:

```text
GET /jobs?status=running&page=1&pageSize=20
GET /jobs?batchId=01988abc-def0-7000-abcd-123456789000
GET /jobs?packageId=com.facemoji.lite
```

## Artifact

API lưu artifact dưới dạng **thư mục**, không phải một file ZIP. Xem `artifact_storage.md`.

| Method | Endpoint | Chức năng |
| --- | --- | --- |
| `GET` | `/jobs/:jobId/artifact/files` | Liệt kê file trong artifact |
| `POST` | `/jobs/:jobId/artifact/download-url` | Tạo link tải có thời hạn |
| `GET` | `/artifacts/:artifactId/download` | Stream file / nhóm / cả cục |

`GET /jobs/:jobId/artifact/files`:

```json
{
  "data": {
    "artifactId": "07a074d0-968f-4187-b841-d27cf6cf8e18",
    "state": "available",
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

`state` là `partial` khi APK đã hết hạn sớm; khi đó `files` không còn liệt kê APK nhưng phần nhẹ vẫn tải được.

`POST /jobs/:jobId/artifact/download-url` — body nhận `select` **hoặc** `path`, không được cả hai:

```bash
# cả cục
curl -X POST "$BASE_URL/jobs/job_001/artifact/download-url" \
  -H "Authorization: Bearer $API_TOKEN"

# một nhóm
curl -X POST "$BASE_URL/jobs/job_001/artifact/download-url" \
  -H "Authorization: Bearer $API_TOKEN" -H "Content-Type: application/json" \
  -d '{"select": "screenshots"}'

# đúng một file
curl -X POST "$BASE_URL/jobs/job_001/artifact/download-url" \
  -H "Authorization: Bearer $API_TOKEN" -H "Content-Type: application/json" \
  -d '{"path": "base.apk"}'
```

```json
{
  "data": {
    "downloadUrl": "https://…/v1/artifacts/xxx/download?select=screenshots&expires=1786000000&signature=xxx",
    "expiresAt": "2026-08-07T10:15:00.000Z",
    "fileName": "com.facemoji.lite-screenshots.zip",
    "sizeBytes": 1240000,
    "sha256": null,
    "fileCount": 6
  }
}
```

`sha256` chỉ có giá trị khi tải **một file**. Với nhóm hoặc cả cục thì ZIP sinh tại chỗ nên mỗi lần một khác — dùng `sha256` từng file trong `/artifact/files`, hoặc `PULL_MANIFEST.txt` mà worker đã ghi sẵn. Cũng vì nén khi đang stream nên bản nhiều file không có `Content-Length`.

`GET /artifacts/:artifactId/download` không cần Bearer token vì URL đã mang chữ ký và thời hạn. Chữ ký chỉ phủ `artifactId` và `expires`, **không** phủ `select`/`path`: link mặc định vốn đã cho cả cục nên sửa query chỉ lấy được ít hơn. Endpoint này hỗ trợ `Range`.

---

# Phần 3 — Internal Worker API (9 endpoint)

Chỉ container worker gọi, trong Docker network. Đối tác không dùng phần này.

```env
RELAY_API_URL=http://api:3000/internal/v1
```

```http
Authorization: Bearer $WORKER_TOKEN
```

| Method | Endpoint | Chức năng |
| --- | --- | --- |
| `POST` | `/workers/heartbeat` | Đăng ký/cập nhật worker |
| `POST` | `/jobs/claim` | Nhận một job đang chờ |
| `POST` | `/jobs/:jobId/heartbeat` | Gia hạn lease và cập nhật tiến độ |
| `POST` | `/jobs/:jobId/events` | Ghi timeline |
| `PUT` | `/jobs/:jobId/files/*` | Upload một file của artifact |
| `POST` | `/jobs/:jobId/artifact/finalize` | Chốt artifact, tính tổng |
| `POST` | `/jobs/:jobId/complete` | Báo hoàn thành |
| `POST` | `/jobs/:jobId/fail` | Báo thất bại |
| `POST` | `/jobs/:jobId/cancelled` | Xác nhận đã huỷ |

### Worker heartbeat

```json
{
  "workerId": "worker_vps_01",
  "name": "VPS Worker 01",
  "version": "1.0.0",
  "capabilities": { "avd": "chpay", "maxConcurrentJobs": 1 },
  "stats": { "emulatorReady": true, "freeDiskBytes": 53687091200 }
}
```

### Claim job

```json
{ "workerId": "worker_vps_01" }
```

Có job thì trả `200`:

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

Hàng đợi rỗng thì `204 No Content`. Đĩa server dưới ngưỡng dự phòng cũng trả `204` — job nằm yên trong `queued` thay vì chạy hết pipeline rồi chết ở bước upload.

### Job heartbeat

```json
{ "workerId": "worker_vps_01", "progress": 60, "currentStep": "pulling_apk" }
```

```json
{ "data": { "leaseExpiresAt": "2026-08-07T10:04:00.000Z", "cancelRequested": false } }
```

### Ghi event

```json
{
  "eventType": "apk.pulled",
  "level": "info",
  "message": "Pulled base APK and 4 splits",
  "data": { "splitCount": 4, "baseApkSizeBytes": 50231234 }
}
```

### Upload artifact

Worker **không** nén. Nó gửi thẳng từng file của `work/apks/<packageId>/`, giữ nguyên đường dẫn tương đối. Nén là việc của API và chỉ xảy ra khi client xin nhiều file.

```bash
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

API tính SHA-256 khi stream xuống đĩa và từ chối `400` nếu lệch với `X-Content-SHA256`. Chỉ nhận file cho job đang `running`; job đã đóng trả `409`.

Đường dẫn phải là tương đối. Bị từ chối `400`: đường dẫn tuyệt đối, thành phần `..`, và dotfile (API dùng dotfile để ghi sổ SHA-256 nội bộ).

Chốt lại sau khi gửi hết:

```bash
curl -X POST \
  "http://api:3000/internal/v1/jobs/job_001/artifact/finalize" \
  -H "Authorization: Bearer $WORKER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"workerId": "worker_vps_01", "fileName": "com.facemoji.lite", "fileCount": 18}'
```

`finalize` đối chiếu `workerId` với worker đang giữ job (`409` nếu không khớp), kiểm số file khớp đĩa (`400` nếu lệch), tính tổng dung lượng rồi đặt `state = available`. Trước khi `finalize` xong, artifact ở `state = preparing` và không tải được — nhờ vậy client không bao giờ vớ phải bản dở dang.

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

`retryable: true` và còn lượt thì job quay lại `queued` để tự chạy lại; hết lượt thì thành `failed`.

### Cancelled job

```json
{ "workerId": "worker_vps_01", "reason": "Cancelled by user request" }
```

---

# Phần 4 — Kiểm chứng

Toàn bộ 23 endpoint có bộ test đối chiếu với chính tài liệu này:

```bash
pnpm test:endpoints
```

Nó kiểm tra shape response, trường bắt buộc, quy tắc token và các ca phải bị từ chối. Báo cáo ghi ra `work/endpoint-report.md`.

Tải thử mọi thể loại artifact về đĩa:

```bash
pnpm download:artifacts
```
