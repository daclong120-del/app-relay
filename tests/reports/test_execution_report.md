# BÁO CÁO KẾT QUẢ KIỂM THỬ TỰ ĐỘNG (TEST EXECUTION REPORT)

- **Hệ thống / Thành phần**: `release-ops` — Tầng 6 (Gateway HTTP Server API & Services)
- **Tổng số Test Cases**: 93
- **Đạt (Pass)**: 93 / 93 (100%)
- **Lỗi (Fail)**: 0
- **Thời gian chạy**: ~244ms
- **Framework**: `node:test` + `node:assert/strict` (Node.js v22 native)

---

## 1. Suite: TokenGuard Unit Tests (14 Test Cases)

| Mã TC | Tên Kịch Bản | Input (Đầu vào Header / Scope) | Output Mong Đợi (HTTP / Status / Message) | Kết quả |
|---|---|---|---|---|
| `TC-TG-01` | Header missing | `authHeader: undefined`, scope: `job:claim` | `authorized: false`, `errorCode: "UNAUTHORIZED"` | ✅ PASS |
| `TC-TG-02` | Header rỗng | `authHeader: ""`, scope: `job:claim` | `authorized: false`, `errorCode: "UNAUTHORIZED"` | ✅ PASS |
| `TC-TG-03` | Không dùng Bearer scheme | `authHeader: "Basic abc123base64"` | `authorized: false`, `errorCode: "UNAUTHORIZED"` | ✅ PASS |
| `TC-TG-04` | Token string rỗng | `authHeader: "Bearer "` | `authorized: false`, `errorCode: "UNAUTHORIZED"` | ✅ PASS |
| `TC-TG-05` | Token hợp lệ, đủ scope | `authHeader: "Bearer valid-token"`, scope: `job:claim` | `authorized: true`, trả về `token` object đầy đủ | ✅ PASS |
| `TC-TG-06` | Token hợp lệ, thiếu scope | `authHeader: "Bearer limited-token"`, scope: `job:claim` (token chỉ có `worker:register`) | `authorized: false`, `errorCode: "FORBIDDEN_SCOPE"` | ✅ PASS |
| `TC-TG-07` | Token không tồn tại | `authHeader: "Bearer fake-token"` | `authorized: false`, `errorCode: "UNAUTHORIZED"` | ✅ PASS |
| `TC-TG-08` | Token bị thu hồi | `authHeader: "Bearer revoked-token"`, `status: "revoked"` | `authorized: false`, `errorCode: "UNAUTHORIZED"` | ✅ PASS |
| `TC-TG-09` | Token hết hạn | `authHeader: "Bearer expired-token"`, `expires_at: <quá khứ>` | `authorized: false`, `errorCode: "EXPIRED_TOKEN"` | ✅ PASS |
| `TC-TG-10` | Token không giới hạn hạn dùng | `authHeader: "Bearer token"`, `expires_at: null` | `authorized: true` | ✅ PASS |
| `TC-TG-11` | Token còn hạn tương lai | `authHeader: "Bearer token"`, `expires_at: <30 ngày tới>` | `authorized: true` | ✅ PASS |
| `TC-TG-12` | Băm token đồng nhất | `hashToken("my-secret")` | Trả về chuỗi SHA-256 hash chuẩn 64 ký tự | ✅ PASS |
| `TC-TG-13` | Băm token khác nhau | `hashToken("token-a")` vs `hashToken("token-b")` | Hai chuỗi hash khác nhau | ✅ PASS |
| `TC-TG-14` | Xử lý khoảng trắng thừa | `authHeader: "Bearer token-with-spaces "` | TrTrim chuỗi và xác thực `authorized: true` | ✅ PASS |

---

## 2. Suite: Worker Gateway API (30 Test Cases)

### Endpoint: `POST /api/release-ops/worker/v1/workers/register`
- **Scope yêu cầu**: `release_ops:worker:register`

| Mã TC | Input (Payload / Authorization) | Output Kỳ Vọng | Kết quả |
|---|---|---|---|
| `TC-WG-01` | Header Bearer Token hợp lệ, Body: `{"workerId": "w-101", "workerName": "Node-01"}` | `HTTP 200`, `{success: true, data: {workerId: "w-101", status: "active"}}` | ✅ PASS |
| `TC-WG-02` | Thiếu `workerId` trong Body | `HTTP 400`, `{error: {code: "INVALID_PAYLOAD", message: "...workerId"}}` | ✅ PASS |
| `TC-WG-03` | Thiếu `workerName` trong Body | `HTTP 400`, `{error: {code: "INVALID_PAYLOAD", message: "...workerName"}}` | ✅ PASS |
| `TC-WG-04` | Body rỗng `{}` | `HTTP 400`, `{error: {code: "INVALID_PAYLOAD"}}` | ✅ PASS |
| `TC-WG-05` | Đăng ký lại Worker đã tồn tại (Idempotence) | `HTTP 200`, cập nhật `updated_at` & `capacity` thành công | ✅ PASS |

### Endpoint: `POST /api/release-ops/worker/v1/workers/heartbeat`
- **Scope yêu cầu**: `release_ops:worker:heartbeat`

| Mã TC | Input (Payload) | Output Kỳ Vọng | Kết quả |
|---|---|---|---|
| `TC-WG-06` | Body: `{"workerId": "w-101", "status": "active"}` | `HTTP 200`, `{data: {acknowledged: true, lastHeartbeat: "..."}}` | ✅ PASS |
| `TC-WG-07` | Thiếu `workerId` | `HTTP 400`, `INVALID_PAYLOAD` | ✅ PASS |
| `TC-WG-08` | `workerId` không tồn tại trong DB | `HTTP 404`, `{error: {code: "NOT_FOUND"}}` | ✅ PASS |
| `TC-WG-09` | Trạng thái custom `{"workerId": "w-101", "status": "draining"}` | `HTTP 200`, `acknowledged: true` | ✅ PASS |

### Endpoint: `POST /api/release-ops/worker/v1/jobs/claim`
- **Scope yêu cầu**: `release_ops:job:claim`

| Mã TC | Input (Payload) | Output Kỳ Vọng | Kết quả |
|---|---|---|---|
| `TC-WG-10` | Body: `{"workerId": "w-101"}` (Có job `queued` trong DB) | `HTTP 200`, `{data: {job: {id: "job-99", status: "claimed"}}}` | ✅ PASS |
| `TC-WG-11` | Body: `{"workerId": "w-101"}` (Không còn job nào) | `HTTP 200`, `{data: {job: null}}` | ✅ PASS |
| `TC-WG-12` | Thiếu `workerId` | `HTTP 400`, `INVALID_PAYLOAD` | ✅ PASS |
| `TC-WG-13` | Claim với custom lease & job types | `HTTP 200`, gán đúng `lease_until` tăng 120s | ✅ PASS |

### Endpoint: `POST /api/release-ops/worker/v1/jobs/:id/heartbeat`
- **Scope yêu cầu**: `release_ops:job:heartbeat`

| Mã TC | Input (Payload & URL Job ID) | Output Kỳ Vọng | Kết quả |
|---|---|---|---|
| `TC-WG-14` | Job ID hợp lệ, `{"workerId": "w-101", "leaseDurationSeconds": 60}` | `HTTP 200`, `{data: {renewed: true, leaseUntil: "..."}}` | ✅ PASS |
| `TC-WG-15` | Thiếu `workerId` | `HTTP 400`, `INVALID_PAYLOAD` | ✅ PASS |
| `TC-WG-16` | Job đã hết hạn lease hoặc thuộc worker khác | `HTTP 409`, `{error: {code: "LEASE_EXPIRED"}}` | ✅ PASS |

### Endpoint: `POST /api/release-ops/worker/v1/jobs/:id/events`
- **Scope yêu cầu**: `release_ops:job:event`

| Mã TC | Input (Payload) | Output Kỳ Vọng | Kết quả |
|---|---|---|---|
| `TC-WG-17` | Body: `{"stage": "upload_aab", "message": "Uploading 33%", "progress": 33}` | `HTTP 201`, `{data: {eventId: "uuid-...", jobId: "..."}}` | ✅ PASS |
| `TC-WG-18` | Thiếu `stage` | `HTTP 400`, `INVALID_PAYLOAD` | ✅ PASS |
| `TC-WG-19` | Thiếu `message` | `HTTP 400`, `INVALID_PAYLOAD` | ✅ PASS |
| `TC-WG-20` | Đầy đủ trường nâng cao (level, progress, externalRef, metadata) | `HTTP 201`, tạo event log ghi chú vết | ✅ PASS |

### Endpoint: `POST /api/release-ops/worker/v1/jobs/:id/succeed`
- **Scope yêu cầu**: `release_ops:job:complete`

| Mã TC | Input (Payload) | Output Kỳ Vọng | Kết quả |
|---|---|---|---|
| `TC-WG-21` | Body: `{"workerId": "w-101", "result": {ok: true}}` | `HTTP 200`, `{data: {status: "succeeded"}}` | ✅ PASS |
| `TC-WG-22` | Thiếu `workerId` | `HTTP 400`, `INVALID_PAYLOAD` | ✅ PASS |
| `TC-WG-23` | Worker không sở hữu Job | `HTTP 409`, `LEASE_EXPIRED` | ✅ PASS |

### Endpoint: `POST /api/release-ops/worker/v1/jobs/:id/fail`
- **Scope yêu cầu**: `release_ops:job:complete`

| Mã TC | Input (Payload) | Output Kỳ Vọng | Kết quả |
|---|---|---|---|
| `TC-WG-24` | Body: `{"workerId": "w-101", "fatal": true, "errorMessage": "Die"}` | `HTTP 200`, `{data: {status: "dead_letter"}}` | ✅ PASS |
| `TC-WG-25` | Body: `{"workerId": "w-101", "fatal": false, "errorMessage": "Retry"}` | `HTTP 200`, `{data: {status: "retrying"}}` | ✅ PASS |
| `TC-WG-26` | Thiếu `workerId` | `HTTP 400`, `INVALID_PAYLOAD` | ✅ PASS |

### Endpoint: `GET /api/release-ops/worker/v1/artifacts/:id` & `POST /reports/sync-result`
- **Scope yêu cầu**: `artifact:read` / `report:write`

| Mã TC | Input | Output Kỳ Vọng | Kết quả |
|---|---|---|---|
| `TC-WG-27` | Artifact ID không tồn tại | `HTTP 404`, `NOT_FOUND` | ✅ PASS |
| `TC-WG-28` | Artifact ID hợp lệ | `HTTP 200`, trả về `downloadUrl`, `checksumSha256` | ✅ PASS |
| `TC-WG-29` | Sync report thiếu `appId` | `HTTP 400`, `INVALID_PAYLOAD` | ✅ PASS |
| `TC-WG-30` | Sync report hợp lệ với 3 dòng metrics | `HTTP 201`, `{data: {recordsProcessed: 3, status: "synced"}}` | ✅ PASS |

---

## 3. Suite: Control Plane API (17 Test Cases)

### Endpoint: `POST /api/release-ops/v1/apps`
| Mã TC | Input (Payload) | Output Kỳ Vọng | Kết quả |
|---|---|---|---|
| `TC-CA-01` | Body: `{"packageName": "com.app", "appName": "App Test"}` | `HTTP 201`, `{data: {package_name: "com.app"}}` | ✅ PASS |
| `TC-CA-02` | Thiếu `packageName` | `HTTP 400`, `INVALID_PAYLOAD` | ✅ PASS |
| `TC-CA-03` | Thiếu `appName` | `HTTP 400`, `INVALID_PAYLOAD` | ✅ PASS |
| `TC-CA-04` | Token chỉ có quyền đọc report (`report:read`) | `HTTP 403`, `FORBIDDEN_SCOPE` | ✅ PASS |

### Endpoint: `POST /api/release-ops/v1/releases`
| Mã TC | Input (Payload) | Output Kỳ Vọng | Kết quả |
|---|---|---|---|
| `TC-CA-05` | Body: `{"appId": "uuid-1", "versionName": "1.0", "versionCode": 1, "track": "internal"}` | `HTTP 201`, `{data: {status: "draft"}}` | ✅ PASS |
| `TC-CA-06` | Thiếu `appId` / `versionName` / `versionCode` / `track` | `HTTP 400`, `INVALID_PAYLOAD` | ✅ PASS |

### Endpoint: `POST /releases/:id/promote` & `/halt`
| Mã TC | Input (Payload) | Output Kỳ Vọng | Kết quả |
|---|---|---|---|
| `TC-CA-07` | Promote hợp lệ: `{"targetRolloutPercentage": 50, "reason": "Good"}` | `HTTP 200`, `{data: {status: "rolling_out"}}` | ✅ PASS |
| `TC-CA-08` | Halt hợp lệ: `{"reason": "ANR Spike"}` | `HTTP 200`, `{data: {status: "halted"}}` | ✅ PASS |
| `TC-CA-09` | Promote/Halt thiếu `reason` hoặc `targetRolloutPercentage` | `HTTP 400`, `INVALID_PAYLOAD` | ✅ PASS |
| `TC-CA-10` | Promote/Halt với ID release không tồn tại | `HTTP 400`, `{error: {code: "OPERATION_FAILED"}}` | ✅ PASS |

---

## 4. Suite: Report API Integration — `GET /api/release-ops/v1/reports/store-performance` (12 Test Cases)

| Mã TC | Input (Query Params / Authorization) | Output Kỳ Vọng (Kiểm định 20 Cột Báo Cáo) | Kết quả |
|---|---|---|---|
| `TC-RA-01` | Không gửi Header Authorization | `HTTP 401`, `UNAUTHORIZED` | ✅ PASS |
| `TC-RA-02` | Token không có scope `release_ops:report:read` | `HTTP 403`, `FORBIDDEN_SCOPE` | ✅ PASS |
| `TC-RA-03` | Gọi không kèm Query Params | `HTTP 200`, trả về toàn bộ mảng `data.reports` | ✅ PASS |
| `TC-RA-04` | Lọc theo `?startDate=2026-01-01&endDate=2026-08-01` | `HTTP 200`, lọc đúng dữ liệu trong khoảng thời gian | ✅ PASS |
| `TC-RA-05` | Lọc 1 App `?appIds=app-uuid-r1` | `HTTP 200`, mảng trả về 1 phần tử "Alpha App" | ✅ PASS |
| `TC-RA-06` | Lọc nhiều App `?appIds=app-uuid-r1,app-uuid-r2` | `HTTP 200`, mảng trả về 2 phần tử | ✅ PASS |
| `TC-RA-07` | Lọc theo Store `?store=LDream` | `HTTP 200`, chỉ chứa các App thuộc Store "LDream" | ✅ PASS |
| `TC-RA-08` | Khi DB rỗng / Không khớp App ID nào | `HTTP 200`, `data.reports: []` (Mảng rỗng) | ✅ PASS |
| `TC-RA-09` | **Kiểm định Cấu trúc 20 Cột JSON** | `HTTP 200`, đủ 20 key: `store`, `appName`, `pic`, `crAppYtd`, `crCompetitorMedian`, `totalVisitors`, `exploreVisitors`, `searchVisitors`, `totalAcquisitions`, `exploreAcquisitions`, `searchAcquisitions`, `crDelta`, `organicVisitors`, `organicVisitorRatio`, `organicAcquisitions`, `organicAcquisitionRatio`, `crOrganic`, `adsAcquisitions`, `crExplore`, `crSearch` | ✅ PASS |
| `TC-RA-10` | **Định dạng App có 0 lượt truy cập (Chia 0)** | `HTTP 200`, các trường `%` (`crAppYtd`, `organicVisitorRatio`, `crDelta`...) chuyển thành chữ `"N/A"` thay vì bị rác `NaN` hay crash `#DIV/0!` | ✅ PASS |
| `TC-RA-11` | Định dạng `crDelta` dương (> 0) | `crDelta` hiển thị dấu `+` đằng trước (ví dụ: `"+2.90%"`) | ✅ PASS |
| `TC-RA-12` | Định dạng `crDelta` âm (< 0) | `crDelta` hiển thị dấu `-` đằng trước (ví dụ: `"-5.00%"`) | ✅ PASS |

---

## 5. Suite: Server Routing Tests (8 Test Cases)

| Mã TC | Input (Method & URL Path) | Output Kỳ Vọng | Kết quả |
|---|---|---|---|
| `TC-SR-01` | `GET /api/unknown-path` | `HTTP 404`, `{error: {code: "NOT_FOUND"}}` | ✅ PASS |
| `TC-SR-02` | `GET /api/release-ops/worker/v1/workers/register` (Method sai) | `HTTP 404`, `NOT_FOUND` | ✅ PASS |
| `TC-SR-03` | Body JSON hỏng: `POST /workers/register` kèm `{this is invalid json` | `HTTP 400`, `INVALID_PAYLOAD`, `Malformed JSON body` | ✅ PASS |
| `TC-SR-04` | Body rỗng khi POST route bắt buộc | `HTTP 400`, `INVALID_PAYLOAD` | ✅ PASS |
| `TC-SR-05` | Trích xuất Job ID từ URL `/jobs/my-job-123/succeed` | Controller nhận đúng Job ID `"my-job-123"` | ✅ PASS |
| `TC-SR-06` | Trích xuất Release ID từ URL `/releases/rel-456/halt` | Controller nhận đúng Release ID `"rel-456"` | ✅ PASS |
| `TC-SR-07` | Trích xuất Artifact ID từ URL `/artifacts/art-789` | Controller nhận đúng Artifact ID `"art-789"` | ✅ PASS |
| `TC-SR-08` | `GET /` (Root Endpoint) | `HTTP 404`, `NOT_FOUND` | ✅ PASS |

---

## 6. Suite: ReportService Unit Tests (12 Test Cases)

| Mã TC | Scenario / Input | Output Kỳ Vọng | Kết quả |
|---|---|---|---|
| `TC-RS-01` | Format % thông thường: `25` | `"25.00%"` | ✅ PASS |
| `TC-RS-02` | Format % kèm dấu: `2.9, true` / `-1.5, true` | `"+2.90%"` / `"-1.50%"` | ✅ PASS |
| `TC-RS-03` | Format % giá trị rỗng/null: `null` / `undefined` / `NaN` | `"N/A"` | ✅ PASS |
| `TC-RS-04` | Map dữ liệu RPC & xử lý chia cho 0 | Map đúng Metadata App và định dạng N/A chuẩn | ✅ PASS |
| `TC-RS-05` | RPC trả mảng rỗng | Trả mảng rỗng `[]` ngay, không query DB bảng `apps` | ✅ PASS |
| `TC-RS-06` | Lọc theo Store không phân biệt hoa thường (`ldream` vs `LDream`) | Lọc đúng App thuộc store `LDream` | ✅ PASS |
| `TC-RS-07` | Lọc theo Store không khớp (`OtherStore`) | Trả về mảng rỗng `[]` | ✅ PASS |
| `TC-RS-08` | DB RPC ném ra Exception lỗi kết nối | Bắt exception và throw Error chứa message RPC | ✅ PASS |
| `TC-RS-09` | Query bảng Apps ném lỗi phân quyền | Throw Error chứa chi tiết lỗi bảng `release_ops_apps` | ✅ PASS |
| `TC-RS-10` | App thiếu metadata (`metadata: {}`) | Mặc định `store: "Unknown Store"`, `pic: "N/A"` | ✅ PASS |
| `TC-RS-11` | App thiếu tên (`app_name: null`) | Mặc định `appName: "Unknown App"` | ✅ PASS |
| `TC-RS-12` | Xử lý con số cực lớn (`visitors: 999999999`) | Không bị vỡ số hay tràn bộ nhớ, tính % chuẩn | ✅ PASS |
