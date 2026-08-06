# AppRelay API Test Case Matrix for Developer — v1.3.1

> **Mục đích:** Danh sách kiểm thử nghiệm thu cho toàn bộ API được mô tả trong `API_TEST_GUIDE_FOR_DEV(1).md` và `API_SPEC(3).md`.
>
> **Phạm vi thực tế:** 15 Public API + 11 Internal Worker Gateway API, kèm kiểm thử auth, tenant/project isolation, CORS, state machine, lease fencing, artifact, concurrency, reliability và network exposure.
>
> **Lưu ý trung thực:** Đây là test design dựa trên hai tài liệu đã cung cấp; chưa đối chiếu route/schema/code chạy thật. Những điểm tài liệu không định nghĩa được ghi `TBD-CONTRACT`, không được tester hoặc developer tự đoán rồi coi là đạt.

---

## 1. Quy ước nghiệm thu

### 1.1 Mức ưu tiên

| Mức | Ý nghĩa | Release gate |
|---|---|---|
| **P0** | Auth bypass, lộ dữ liệu tenant, sai lease, sai state, mất/hỏng artifact, endpoint chính không hoạt động | Bắt buộc PASS 100% |
| **P1** | Validation, lỗi nghiệp vụ, CORS, alias, phân trang, retry/cancel, worker lifecycle | Bắt buộc PASS; chỉ waive khi có phê duyệt rõ |
| **P2** | Khả năng chịu tải, quan sát vận hành, tương thích và hardening nâng cao | Có thể lên lịch riêng nhưng phải ghi nhận |

### 1.2 Baseline HTTP để kiểm thử

API Spec chỉ chốt error envelope, chưa chốt đầy đủ status code cho từng lỗi. Để kết quả test không nhập nhằng, team phải xác nhận bảng dưới trước khi chạy. Nếu implementation dùng mã khác, cập nhật contract trước, không sửa expected tùy tiện sau khi test fail.

| Tình huống | Expected baseline |
|---|---|
| Request thành công GET/POST action | `200` |
| Tạo job thành công | `201` |
| JSON sai cú pháp / field sai | `400` hoặc `422` — **TBD-CONTRACT chọn đúng một** |
| Thiếu/sai/hết hạn token | `401` |
| Đúng danh tính nhưng thiếu quyền, sai tenant/project, origin bị cấm | `403` |
| Resource không tồn tại hoặc được che để chống enumeration | `404` |
| State conflict, duplicate, stale lease | `409` |
| Content-Type không hỗ trợ | `415` |
| Payload quá lớn | `413` |
| Rate limit | `429` |
| Dependency tạm lỗi | `503` hoặc mã đã chốt; `retryable=true` |
| Lỗi server không dự kiến | `500`; không lộ stack trace/secrets |

### 1.3 Assertion chung cho mọi response

- Mọi response phải có `Content-Type` đúng; JSON hợp lệ và khớp schema.
- Mọi lỗi `4xx/5xx` phải có đúng `{ error: { code, message, requestId, retryable } }`.
- `requestId` phải khác rỗng, có thể correlation với log, không chứa dữ liệu nhạy cảm.
- Không lỗi nào được lộ stack trace, SQL, tên bảng/bucket nội bộ, token, cookie, đường dẫn máy chủ hoặc signed URL ngoài trường hợp endpoint download thành công.
- Các timestamp phải là ISO-8601 UTC hợp lệ; quan hệ thời gian phải logic.
- ID phải đúng format và ổn định; không chấp nhận ID rỗng hoặc thay đổi giữa các lần GET.
- Response không được chứa dữ liệu của tenant/project khác.
- Method không hỗ trợ phải trả `405` và không tạo side effect.

---

## 2. Test data và fixtures bắt buộc

| Fixture | Mô tả |
|---|---|
| `JWT_A_OPERATOR` | Token hợp lệ, tenant A, project A1, quyền operator |
| `JWT_A_READONLY` | Token hợp lệ, tenant A, chỉ có quyền đọc |
| `JWT_B_OPERATOR` | Token hợp lệ, tenant B |
| `JWT_NO_TENANT` | Token hợp lệ chữ ký nhưng thiếu `app_metadata.tenant_id` |
| `JWT_EXPIRED`, `JWT_BAD_AUD`, `JWT_BAD_ISS`, `JWT_BAD_SIG` | Token âm tính tương ứng |
| `WORKER_TOKEN_FULL` | Worker token có đầy đủ scope cần thiết |
| `WORKER_TOKEN_LIMITED` | Worker token thiếu scope đang test |
| `WORKER_TOKEN_REVOKED` | Token đã revoke |
| `WORKER_A`, `WORKER_B` | Hai worker khác nhau để test claim/fencing |
| `JOB_QUEUED` | Job tenant A ở `queued` |
| `JOB_CLAIMED` | Job tenant A ở `claimed`, leaseVersion hiện hành |
| `JOB_RUNNING` | Job tenant A ở `running` |
| `JOB_CANCELLING`, `JOB_CANCELLED` | Job ở hai state hủy |
| `JOB_FAILED_RETRYABLE` | Job lỗi còn lượt retry |
| `JOB_FAILED_EXHAUSTED` | Job lỗi hết lượt retry |
| `JOB_SUCCEEDED_ARTIFACT` | Job thành công, artifact hợp lệ tồn tại |
| `JOB_SUCCEEDED_NO_ARTIFACT` | Job thành công nhưng artifact bị thiếu để test inconsistency |
| `JOB_TENANT_B` | Job thuộc tenant B |
| `ARTIFACT_VALID`, `ARTIFACT_CORRUPT` | ZIP/manifest hợp lệ và cố ý sai checksum |

---

## 3. Cross-cutting Public API tests

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| PUB-GEN-001 | P0 | Gọi mọi protected endpoint không có `Authorization` | `401`; error envelope; không side effect |
| PUB-GEN-002 | P0 | Header `Bearer` rỗng, sai scheme, hai header Authorization | Bị từ chối nhất quán; không auth ambiguity |
| PUB-GEN-003 | P0 | JWT sai chữ ký | `401` |
| PUB-GEN-004 | P0 | JWT hết hạn hoặc `nbf` chưa tới | `401` |
| PUB-GEN-005 | P0 | JWT sai `iss` | `401` |
| PUB-GEN-006 | P0 | JWT sai `aud` | `401` |
| PUB-GEN-007 | P0 | JWT thiếu `sub` hoặc `tenant_id` | Bị từ chối; không fallback sang tenant mặc định |
| PUB-GEN-008 | P0 | Tenant A đọc/mutate resource tenant B bằng ID biết trước | `403/404`; không lộ tồn tại hoặc dữ liệu |
| PUB-GEN-009 | P0 | User tenant A truyền `projectId` thuộc tenant B | Bị từ chối; không query/mutate chéo tenant |
| PUB-GEN-010 | P0 | User read-only gọi POST/DELETE | `403`; không side effect |
| PUB-GEN-011 | P1 | Token hợp lệ có whitespace/case header thông thường | Xử lý theo chuẩn HTTP, không false negative |
| PUB-GEN-012 | P1 | Body JSON sai cú pháp | Validation error chuẩn; không `500` |
| PUB-GEN-013 | P1 | `Content-Type` thiếu/sai với endpoint có body | `415` hoặc contract đã chốt |
| PUB-GEN-014 | P1 | Body có field lạ | Reject hoặc strip theo schema đã chốt; không mass assignment |
| PUB-GEN-015 | P1 | Body/query chứa `__proto__`, `$where`, SQL/meta characters | Không injection, không prototype pollution, không `500` |
| PUB-GEN-016 | P1 | Path chứa encoded slash, double encoding, `..`, null byte | Không bypass router/auth; trả `400/404` |
| PUB-GEN-017 | P1 | Gọi method không hỗ trợ trên mỗi path | `405`; `Allow` đúng nếu có |
| PUB-GEN-018 | P1 | Gọi canonical base `/api/app-relay/v1` | Hoạt động đúng |
| PUB-GEN-019 | P1 | Gọi alias `/api/release-ops/app-relay/v1` | Cùng contract, auth, status và tenant scope |
| PUB-GEN-020 | P1 | So sánh canonical và alias với cùng request | Không lệch schema/side effect |
| PUB-GEN-021 | P1 | Request có `X-Request-Id` hợp lệ | Hành vi correlation theo contract; không cho spoof log ngoài kiểm soát |
| PUB-GEN-022 | P1 | Response lỗi liên tiếp | Mỗi lỗi có requestId hợp lệ, không trùng bất thường |
| PUB-GEN-023 | P1 | Dependency DB/Storage timeout | Lỗi chuẩn, `retryable` đúng, không partial write |
| PUB-GEN-024 | P1 | Handler ném exception không dự kiến | `500` sanitized; log có correlation |
| PUB-GEN-025 | P2 | Payload sát/vượt giới hạn | Sát giới hạn xử lý; vượt trả `413` |
| PUB-GEN-026 | P2 | Burst vượt rate limit | `429`, có retry guidance nếu contract quy định; không crash |
| PUB-GEN-027 | P2 | Gửi request trùng đồng thời | Không duplicate side effect ngoài semantics endpoint |

### CORS

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| CORS-001 | P0 | Có `Origin` nằm trong allowlist | `Access-Control-Allow-Origin` phản chiếu đúng origin; credentials `true` |
| CORS-002 | P0 | Có `Origin` không nằm trong allowlist | `403`; không có `Access-Control-Allow-Origin` |
| CORS-003 | P0 | Origin gần giống allowlist: subdomain giả, suffix/prefix, đổi scheme/port | Bị từ chối; match exact đã canonicalize đúng |
| CORS-004 | P1 | Không có `Origin` (cURL/M2M) + token hợp lệ | Bỏ qua CORS, tiếp tục auth và xử lý |
| CORS-005 | P1 | Không có `Origin` + không token | `401`, không phải CORS error |
| CORS-006 | P1 | Preflight allowlisted với method/header hợp lệ | Thành công; allow-methods/headers đúng |
| CORS-007 | P1 | Preflight allowlisted với method/header không được phép | Bị từ chối |
| CORS-008 | P1 | Preflight từ origin bị cấm | `403`; không ACAO |
| CORS-009 | P1 | Response có `Vary: Origin, Access-Control-Request-Method, Access-Control-Request-Headers` | Đúng đầy đủ, tránh cache poisoning |
| CORS-010 | P1 | `Origin: null`, nhiều Origin, origin có CRLF | Bị từ chối an toàn |
| CORS-011 | P2 | Cache preflight giữa hai origin khác nhau | Không reuse header của origin A cho B |

### Browser Session / CSRF và Bearer M2M

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| AUTHFLOW-001 | P0 | Server Action có session cookie hợp lệ + CSRF hợp lệ gọi submit/cancel/retry/delete | Được phép đúng quyền và tenant scope |
| AUTHFLOW-002 | P0 | Session cookie hợp lệ nhưng thiếu CSRF trên mutation | Bị từ chối; không side effect |
| AUTHFLOW-003 | P0 | Session cookie hợp lệ nhưng CSRF sai/hết hạn/khác session | Bị từ chối; không side effect |
| AUTHFLOW-004 | P0 | Bearer JWT hợp lệ từ M2M, không CSRF | Được xử lý; không áp CSRF nhầm vào stateless REST |
| AUTHFLOW-005 | P1 | Chỉ có session cookie gọi trực tiếp Public REST route | Hành vi đúng contract đã chốt; không ngầm bypass CSRF |
| AUTHFLOW-006 | P0 | Cùng request có Bearer tenant A và cookie session tenant B | Không auth ambiguity/confused deputy; reject hoặc precedence đã chốt |
| AUTHFLOW-007 | P0 | Cross-site request dùng cookie nhưng không CSRF/Origin hợp lệ | Không thực hiện mutation |

---

## 4. Public API endpoint test cases

### 4.1 `GET /health`

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| HEALTH-001 | P0 | Gọi không auth | `200`; `status=ok`, đúng service/version, timestamp hợp lệ |
| HEALTH-002 | P1 | Gọi có token hỏng | Health vẫn theo chính sách unauthenticated; không vô tình áp auth |
| HEALTH-003 | P1 | Gọi qua canonical và alias | Cả hai hoạt động nhất quán nếu alias áp dụng toàn namespace |
| HEALTH-004 | P1 | Dùng POST/PUT/DELETE | `405`; không side effect |
| HEALTH-005 | P1 | Nhiều lần liên tiếp | Timestamp tiến về trước; schema ổn định |
| HEALTH-006 | P1 | DB/Storage/worker down | Ý nghĩa `status=ok` phải đúng contract: liveness hay readiness — `TBD-CONTRACT` |
| HEALTH-007 | P2 | Burst health check | Không rò tài nguyên; latency trong SLO |
| HEALTH-008 | P1 | Kiểm tra response | Không lộ hostname, env vars, dependency secrets |

### 4.2 `GET /overview`

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| OVERVIEW-001 | P0 | Tenant có jobs/workers ở nhiều state | `200`; tổng và breakdown đúng dữ liệu DB |
| OVERVIEW-002 | P0 | Tenant A và B có dữ liệu | Chỉ aggregate tenant/project được phép |
| OVERVIEW-003 | P1 | Tenant rỗng | `200`; count bằng 0, không null/âm |
| OVERVIEW-004 | P1 | Có `projectId` hợp lệ | Chỉ aggregate project đó |
| OVERVIEW-005 | P0 | `projectId` tenant khác/không được phép | `403/404`; không lộ số liệu |
| OVERVIEW-006 | P1 | `projectId` sai format/trùng query param | Validation error nhất quán |
| OVERVIEW-007 | P1 | Job thay đổi state trong lúc aggregate | Kết quả snapshot nhất quán; tổng không mâu thuẫn breakdown |
| OVERVIEW-008 | P1 | Repo job thành công, repo worker lỗi hoặc ngược lại | Không trả số liệu nửa đúng mà không báo; error chuẩn |
| OVERVIEW-009 | P2 | Dataset lớn | Latency/SLO và query plan đạt yêu cầu; không full scan ngoài dự kiến |

### 4.3 `GET /apps`

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| APPS-001 | P0 | Tenant có app catalog | Trả đúng app tenant/project, schema hợp lệ |
| APPS-002 | P0 | Tenant A cố xem app tenant B | Không lộ dữ liệu |
| APPS-003 | P1 | Catalog rỗng | `200`, danh sách rỗng |
| APPS-004 | P1 | Nhiều bản ghi cùng package qua nhiều job | Dedup/sort theo contract — `TBD-CONTRACT` |
| APPS-005 | P1 | Pagination mặc định | Limit/cursor/page và metadata đúng — `TBD-CONTRACT` |
| APPS-006 | P1 | Limit min/max/0/âm/quá max/chữ | Validate và clamp/reject nhất quán |
| APPS-007 | P1 | Filter/search package/name chứa Unicode | Kết quả đúng; không injection |
| APPS-008 | P1 | App thiếu listing/screenshots tùy chọn | Schema vẫn hợp lệ; field optional/null đúng contract |
| APPS-009 | P1 | Record có URL ảnh ngoài domain kỳ vọng | Không biến thành server-side fetch gây SSRF |
| APPS-010 | P2 | Dataset lớn, đi hết pagination | Không trùng/mất item giữa các trang trong điều kiện ổn định |

### 4.4 `POST /jobs`

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| JOB-CREATE-001 | P0 | `playUrl` Google Play details hợp lệ, hai flag hợp lệ | `201`; job `queued`; packageId parse đúng; persisted đúng tenant/project |
| JOB-CREATE-002 | P0 | Chỉ truyền field bắt buộc | Tạo job; defaults của flags đúng contract — `TBD-CONTRACT` |
| JOB-CREATE-003 | P1 | URL có query phổ biến `id`, `hl`, `gl` | Parse đúng packageId, canonicalize hợp lý |
| JOB-CREATE-004 | P1 | URL có thứ tự query khác nhau | Vẫn parse đúng |
| JOB-CREATE-005 | P0 | Thiếu/null/rỗng `playUrl` | Validation error; không tạo job |
| JOB-CREATE-006 | P0 | URL không phải Google Play details | `INVALID_PLAY_URL`; `retryable=false` |
| JOB-CREATE-007 | P0 | Host giả `play.google.com.attacker.tld` | Reject; không SSRF |
| JOB-CREATE-008 | P0 | Scheme `http`, `file`, `ftp`, `javascript`, IP literal, localhost | Reject theo allowlist; không outbound request |
| JOB-CREATE-009 | P0 | URL có userinfo/redirect/encoding để qua mặt host check | Reject an toàn |
| JOB-CREATE-010 | P1 | Thiếu `id`, nhiều `id`, packageId rỗng/sai format/quá dài | Validation error |
| JOB-CREATE-011 | P1 | `includeListing/includeScreenshots` là string/number/null | Reject type sai; không truthy coercion |
| JOB-CREATE-012 | P1 | Field lạ như `tenantId`, `status`, `workerId` | Không mass assignment; tenant/status do server quyết định |
| JOB-CREATE-013 | P0 | `projectId` hợp lệ trong tenant | Tạo đúng project |
| JOB-CREATE-014 | P0 | `projectId` tenant khác | `403/404`; không tạo job |
| JOB-CREATE-015 | P1 | Cùng URL gửi tuần tự hai lần | Duplicate/dedup behavior đúng contract — `TBD-CONTRACT` |
| JOB-CREATE-016 | P0 | Cùng URL gửi đồng thời N lần | Không tạo duplicate ngoài chính sách; không race |
| JOB-CREATE-017 | P1 | DB insert lỗi | Error chuẩn; không trả jobId giả |
| JOB-CREATE-018 | P1 | Queue publish lỗi sau DB insert | Transaction/outbox nhất quán; không job bị kẹt âm thầm |
| JOB-CREATE-019 | P1 | Response `201` | `jobId`, `packageId`, `status`, `createdAt` đúng và GET được ngay |
| JOB-CREATE-020 | P2 | Payload URL/strings sát giới hạn | Boundary đúng; không ReDoS/latency bất thường |

### 4.5 `POST /jobs/batch`

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| JOB-BATCH-001 | P0 | Danh sách nhiều URL hợp lệ | Tạo đúng số job, đúng thứ tự/mapping và tenant |
| JOB-BATCH-002 | P1 | Batch chỉ một URL | Thành công nhất quán với create single |
| JOB-BATCH-003 | P0 | Thiếu/null/không phải array `urls` | Validation error; không tạo job |
| JOB-BATCH-004 | P1 | `urls=[]` | Reject; không tạo job |
| JOB-BATCH-005 | P1 | Batch đúng max size | Thành công |
| JOB-BATCH-006 | P1 | Batch vượt max size | Reject toàn request với lỗi rõ — max size `TBD-CONTRACT` |
| JOB-BATCH-007 | P0 | Một URL invalid giữa các URL valid | Atomic hay partial success phải theo contract — `TBD-CONTRACT`; không kết quả mơ hồ |
| JOB-BATCH-008 | P1 | URL trùng trong cùng batch | Dedup/reject behavior rõ và nhất quán — `TBD-CONTRACT` |
| JOB-BATCH-009 | P1 | URL đã có job active từ trước | Duplicate behavior đúng contract |
| JOB-BATCH-010 | P0 | `projectId` tenant khác | Không job nào được tạo |
| JOB-BATCH-011 | P1 | Một DB insert lỗi giữa transaction | Rollback hoặc trả partial schema đã chốt; không orphan/mất mapping |
| JOB-BATCH-012 | P1 | Queue publish lỗi một phần | Không silent partial enqueue |
| JOB-BATCH-013 | P0 | Hai request batch giống nhau chạy đồng thời | Không duplicate ngoài policy; không deadlock |
| JOB-BATCH-014 | P1 | Response | Mỗi input liên kết đúng jobId/packageId/status hoặc lỗi item-level theo contract |
| JOB-BATCH-015 | P2 | Batch max size | Latency/memory trong SLO; không block event loop quá mức |

### 4.6 `GET /jobs`

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| JOB-LIST-001 | P0 | Không filter | Chỉ trả jobs trong scope, sort mặc định ổn định |
| JOB-LIST-002 | P1 | `status` lần lượt: queued/claimed/running/cancelling/cancelled/succeeded/failed/dead_letter | Chỉ đúng state |
| JOB-LIST-003 | P1 | Status invalid, sai case, nhiều status | Validate theo contract; không `500` |
| JOB-LIST-004 | P1 | `limit=1`, default, max | Đúng số item và pagination metadata |
| JOB-LIST-005 | P1 | Limit 0/âm/chữ/quá max/trùng param | Reject hoặc clamp đúng contract |
| JOB-LIST-006 | P1 | Cursor/page hợp lệ | Trang tiếp theo đúng, không trùng/mất khi dataset ổn định |
| JOB-LIST-007 | P1 | Cursor giả/sai scope/hết hạn | Validation error; không lộ dữ liệu tenant khác |
| JOB-LIST-008 | P0 | Filter `projectId` tenant khác | Không lộ jobs |
| JOB-LIST-009 | P1 | Tenant/project không có job | `200`, list rỗng |
| JOB-LIST-010 | P1 | Job được thêm/chuyển state giữa hai trang | Semantics pagination nhất quán, được tài liệu hóa |
| JOB-LIST-011 | P1 | Query unknown/injection payload | Không injection; reject/ignore theo schema |
| JOB-LIST-012 | P1 | Item response | Không lộ worker token, internal storage path hoặc secret |
| JOB-LIST-013 | P2 | Dataset lớn + filter phổ biến | Latency và index/query plan đạt SLO |

### 4.7 `GET /jobs/{jobId}`

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| JOB-GET-001 | P0 | ID hợp lệ cùng tenant | `200`; dữ liệu/state/timestamps đúng DB |
| JOB-GET-002 | P1 | Job ở mỗi lifecycle state | Schema hợp lệ cho mọi state; field conditional đúng |
| JOB-GET-003 | P1 | ID không tồn tại | `404`, error envelope |
| JOB-GET-004 | P1 | ID rỗng/sai format/quá dài/encoded | `400/404`; không `500` |
| JOB-GET-005 | P0 | ID thuộc tenant khác | `404/403`; không lộ metadata |
| JOB-GET-006 | P0 | Job đúng tenant nhưng project không được phép | Bị từ chối |
| JOB-GET-007 | P1 | Repeated GET | Không thay đổi state hoặc timestamps do tác dụng phụ |
| JOB-GET-008 | P1 | Job succeeded | Artifact metadata đúng, không trả raw internal path/token |
| JOB-GET-009 | P1 | Job failed/dead_letter | Error detail sanitized nhưng đủ vận hành |
| JOB-GET-010 | P1 | Kiểm tra `createdAt/startedAt/completedAt` | Thứ tự thời gian hợp lý, null đúng state |

### 4.8 `GET /jobs/{jobId}/events`

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| JOB-EVENTS-001 | P0 | Job có full pipeline events | Trả đúng events, thứ tự xác định, không mất bước |
| JOB-EVENTS-002 | P1 | Job chưa có event | `200`, list rỗng |
| JOB-EVENTS-003 | P1 | Job không tồn tại/sai ID | `404` hoặc validation error chuẩn |
| JOB-EVENTS-004 | P0 | Job tenant khác | Không lộ timeline/message/workerId |
| JOB-EVENTS-005 | P1 | Pagination default/min/max/invalid | Đúng contract; không trùng/mất item |
| JOB-EVENTS-006 | P1 | Nhiều events có cùng timestamp | Tie-break ổn định bằng sequence/ID |
| JOB-EVENTS-007 | P1 | Event message chứa Unicode/ký tự control | JSON hợp lệ; UI-safe; không log injection |
| JOB-EVENTS-008 | P0 | Event payload từng chứa token/path/PII | Response đã redaction đúng |
| JOB-EVENTS-009 | P1 | Worker append event đồng thời với GET | Không trả object nửa ghi; pagination semantics rõ |
| JOB-EVENTS-010 | P2 | Rất nhiều events | Latency/payload size trong giới hạn; pagination bắt buộc |

### 4.9 `POST /jobs/{jobId}/cancel`

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| JOB-CANCEL-001 | P0 | Cancel job `queued` | Chuyển thẳng `cancelled`; không worker claim sau đó |
| JOB-CANCEL-002 | P0 | Cancel job `running` | `running -> cancelling`; set `cancel_requested_at` |
| JOB-CANCEL-003 | P0 | Heartbeat kế tiếp của worker sau cancel | Trả `cancelRequested=true` trong chu kỳ <=10s theo spec |
| JOB-CANCEL-004 | P0 | Worker xác nhận cleanup | `cancelling -> cancelled`; tài nguyên tạm được dọn |
| JOB-CANCEL-005 | P1 | Cancel job `claimed` | Transition phải chốt — `TBD-CONTRACT`; không để job treo |
| JOB-CANCEL-006 | P1 | Cancel job đã `cancelled` | Idempotent hoặc `409` theo contract; không đổi timestamp sai |
| JOB-CANCEL-007 | P1 | Cancel `succeeded`, `failed`, `dead_letter` | `409` invalid state; không sửa terminal state |
| JOB-CANCEL-008 | P1 | Thiếu reason/null/rỗng/quá dài/sai type | Validation theo `ActionReasonRequestSchema` |
| JOB-CANCEL-009 | P0 | Job tenant/project khác | Bị từ chối; không set cancel flag |
| JOB-CANCEL-010 | P0 | Hai cancel đồng thời | Một transition hợp lệ; không double event/side effect |
| JOB-CANCEL-011 | P0 | Cancel đua với worker `succeed`/`fail` | Chỉ một terminal outcome theo atomic state transition |
| JOB-CANCEL-012 | P1 | DB lỗi giữa set state và audit event | Không có state/audit lệch không kiểm soát |

### 4.10 `POST /jobs/{jobId}/retry`

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| JOB-RETRY-001 | P0 | Retry `failed` còn attempt | Tạo/requeue đúng semantics, status `queued`, tăng attempt đúng một |
| JOB-RETRY-002 | P0 | Retry `failed` đã hết max attempt | `409` hoặc chuyển `dead_letter` đúng contract; không enqueue |
| JOB-RETRY-003 | P1 | Retry `dead_letter` | Cho phép hay cấm phải chốt — `TBD-CONTRACT` |
| JOB-RETRY-004 | P1 | Retry `queued/claimed/running/cancelling/cancelled/succeeded` | `409`; không thay đổi |
| JOB-RETRY-005 | P1 | Reason invalid boundary | Validation đúng schema |
| JOB-RETRY-006 | P0 | Job tenant/project khác | Bị từ chối; không enqueue |
| JOB-RETRY-007 | P0 | Hai retry đồng thời | Chỉ một retry/attempt mới |
| JOB-RETRY-008 | P1 | Queue lỗi sau update DB | Không trạng thái giả queued nhưng không có khả năng chạy |
| JOB-RETRY-009 | P1 | Retry thành công | Lease cũ không còn hiệu lực; worker cũ không mutate được |
| JOB-RETRY-010 | P1 | Audit/events | Ghi actor, reason, attempt, timestamp đúng; không lộ secret |

### 4.11 `POST /jobs/{jobId}/artifact/download-url`

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| ART-DL-001 | P0 | Job succeeded có artifact | `200`; signed URL và expiresAt hợp lệ |
| ART-DL-002 | P0 | Dùng URL trước expiry | Tải đúng file của đúng job; checksum/size đúng |
| ART-DL-003 | P0 | Dùng URL sau expiry | Storage từ chối |
| ART-DL-004 | P0 | Job tenant/project khác | Không cấp URL; không lộ bucket/key |
| ART-DL-005 | P1 | Job không tồn tại/sai ID | Lỗi chuẩn |
| ART-DL-006 | P1 | Job chưa terminal hoặc failed/cancelled | Không cấp URL; state error đúng |
| ART-DL-007 | P0 | Metadata có nhưng object storage thiếu | Không trả URL chết như success; error retryable đúng |
| ART-DL-008 | P0 | Artifact checksum/status chưa verified | Không cho tải như artifact hoàn tất |
| ART-DL-009 | P1 | Gọi nhiều lần | Mỗi URL hợp lệ theo TTL; không kéo dài vô hạn ngoài policy |
| ART-DL-010 | P1 | URL response/log/error | Token query không bị log hoặc xuất hiện nơi khác |
| ART-DL-011 | P0 | Sửa object key/jobId trong signed URL | Chữ ký không hợp lệ; không tải artifact khác |
| ART-DL-012 | P2 | Nhiều request ký URL đồng thời | Không vượt rate/cost; đúng tenant và TTL |

### 4.12 `DELETE /jobs/{jobId}/artifact` — thiếu trong Quick-Start Guide

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| ART-DEL-001 | P0 | Xóa artifact tồn tại, đúng tenant/quyền | Thành công; object và metadata theo semantics đã chốt |
| ART-DEL-002 | P0 | User read-only xóa | `403`; artifact còn nguyên |
| ART-DEL-003 | P0 | Artifact tenant/project khác | Bị từ chối; artifact còn nguyên |
| ART-DEL-004 | P1 | Job/artifact không tồn tại | `404` hoặc idempotent success theo contract — `TBD-CONTRACT` |
| ART-DEL-005 | P1 | Xóa lần hai | Idempotency đúng contract |
| ART-DEL-006 | P0 | Signed URL được cấp trước khi xóa | Quyết định revoke/đợi expiry phải chốt và test — `TBD-CONTRACT` |
| ART-DEL-007 | P0 | Storage xóa thành công, DB update lỗi | Có reconciliation/rollback; không trạng thái mồ côi âm thầm |
| ART-DEL-008 | P0 | DB update thành công, storage xóa lỗi | Error/retry job dọn dẹp; không báo success giả |
| ART-DEL-009 | P0 | Delete đua với download-url | Kết quả atomic/được định nghĩa; không cấp link mới sau delete |
| ART-DEL-010 | P1 | Audit | Ghi actor/job/artifact/time; không ghi signed token |

### 4.13 `GET /workers` — thiếu trong Quick-Start Guide

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| WORKERS-001 | P0 | List workers đúng scope | Trả workers được phép; không token/secret |
| WORKERS-002 | P0 | Tenant/project khác | Không lộ worker IDs, host/device metadata |
| WORKERS-003 | P1 | Không có worker | `200`, list rỗng |
| WORKERS-004 | P1 | Filter status online/offline/busy/stale | Kết quả đúng — enum/threshold `TBD-CONTRACT` |
| WORKERS-005 | P1 | Pagination boundary/invalid | Xử lý nhất quán |
| WORKERS-006 | P1 | Worker heartbeat đồng thời list | `lastSeenAt/status` nhất quán theo snapshot |
| WORKERS-007 | P0 | Response field review | Không lộ IP nội bộ, token hash, ADB endpoint nếu không cần |
| WORKERS-008 | P2 | Nhiều worker | Latency/query plan đạt SLO |

### 4.14 `GET /workers/fleet-status`

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| FLEET-001 | P0 | Fleet có online/busy/offline/stale | Aggregate đúng worker records |
| FLEET-002 | P0 | Scope tenant/project | Không aggregate chéo scope |
| FLEET-003 | P1 | Fleet rỗng | `200`; counts 0; trạng thái tổng thể đúng contract |
| FLEET-004 | P1 | Worker đúng sát heartbeat threshold | Boundary online/stale nhất quán |
| FLEET-005 | P1 | Worker heartbeat trong lúc aggregate | Tổng và breakdown không mâu thuẫn |
| FLEET-006 | P1 | Repo timeout | Error chuẩn, không trả health giả |
| FLEET-007 | P1 | So với `GET /workers` cùng thời điểm | Counts khớp trong sai số snapshot cho phép |
| FLEET-008 | P2 | Poll liên tục từ hai dashboard | Không tạo tải DB bất hợp lý; cache đúng tenant/origin |

### 4.15 `GET /workers/{workerId}` — thiếu trong Quick-Start Guide

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| WORKER-GET-001 | P0 | ID hợp lệ đúng scope | `200`; status/device/lastSeen đúng |
| WORKER-GET-002 | P1 | ID không tồn tại/sai format | `404`/validation chuẩn |
| WORKER-GET-003 | P0 | Worker tenant/project khác | Không lộ metadata |
| WORKER-GET-004 | P0 | Response fields | Không token, token hash, secret, raw credential |
| WORKER-GET-005 | P1 | Worker offline/stale | Status và timestamps đúng threshold |
| WORKER-GET-006 | P1 | Worker có active job | Chỉ trả dữ liệu job mà caller được phép xem |
| WORKER-GET-007 | P1 | Repeated GET | Không side effect/update heartbeat |
| WORKER-GET-008 | P1 | Heartbeat cập nhật đồng thời | Không object nửa cũ nửa mới gây schema/state mâu thuẫn |

---

## 5. Internal Worker Gateway cross-cutting tests

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| WG-GEN-001 | P0 | Dashboard Supabase JWT gọi Worker Gateway | `401/403`; không được coi là worker token |
| WG-GEN-002 | P0 | Worker token gọi Public API | Bị từ chối nếu không phải đúng auth flow |
| WG-GEN-003 | P0 | Thiếu/sai/hết hạn/revoked worker token | `401`; không side effect |
| WG-GEN-004 | P0 | Token đúng nhưng thiếu scope endpoint | `403`; không side effect |
| WG-GEN-005 | P0 | Scope tên gần giống/wildcard không được cấp | Không bypass scope matching |
| WG-GEN-006 | P0 | Worker A khai `workerId` của B trong body | Bị từ chối; token bound identity được ưu tiên |
| WG-GEN-007 | P1 | Canonical `/api/release-ops/worker/v1` | Hoạt động đúng |
| WG-GEN-008 | P1 | Alias `/api/internal/worker/v1` | Cùng contract/auth/scope |
| WG-GEN-009 | P0 | Worker Gateway qua public internet/443 | Chính sách exposure phải xác nhận; dashboard không truy cập được |
| WG-GEN-010 | P1 | Error response | Envelope chuẩn, requestId correlation, không lộ token/lease internals quá mức |
| WG-GEN-011 | P1 | Replayed mutation request | Idempotency/409 đúng endpoint; không duplicate event/artifact/terminal transition |
| WG-GEN-012 | P2 | Rate limit/noisy worker | Cô lập worker lỗi, không làm fleet mất dịch vụ |

---

## 6. Internal Worker Gateway endpoint test cases

### 6.1 `POST /workers/register`

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| WG-REG-001 | P0 | Token đúng scope + payload hợp lệ | Worker được register đúng identity/capabilities |
| WG-REG-002 | P0 | Thiếu scope register | `403`; không tạo record |
| WG-REG-003 | P1 | Thiếu/invalid workerId, hostname, version, capabilities | Validation error; schema exact `TBD-CONTRACT` |
| WG-REG-004 | P0 | Token identity khác body workerId | Reject |
| WG-REG-005 | P1 | Register lại cùng worker | Upsert/idempotent behavior đúng contract |
| WG-REG-006 | P0 | Hai register cùng worker đồng thời | Một logical worker, không duplicate |
| WG-REG-007 | P1 | Hai worker dùng cùng device/hostname | Conflict/policy rõ; không hijack record |
| WG-REG-008 | P1 | Unsupported worker version | Reject/quarantine theo compatibility policy — `TBD-CONTRACT` |
| WG-REG-009 | P1 | Field chứa control chars/quá dài | Reject; không log injection |
| WG-REG-010 | P1 | DB lỗi | Không trả register success giả |

### 6.2 `POST /workers/heartbeat`

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| WG-WHB-001 | P0 | Worker registered heartbeat hợp lệ | Update lastSeen/status đúng |
| WG-WHB-002 | P0 | Worker chưa register | Reject hoặc yêu cầu register theo contract |
| WG-WHB-003 | P0 | Body workerId khác token | Reject |
| WG-WHB-004 | P1 | Heartbeat lặp/reordered | Không làm lastSeen lùi hoặc corrupt state |
| WG-WHB-005 | P1 | Clock worker lệch lớn | Server time là nguồn tin cậy |
| WG-WHB-006 | P1 | Payload metrics invalid/NaN/âm/quá lớn | Validation error |
| WG-WHB-007 | P1 | Worker revoked sau lần trước | Heartbeat bị từ chối, không revive |
| WG-WHB-008 | P2 | Heartbeat đúng tần suất từ fleet lớn | Không lock contention/DB overload |

### 6.3 `POST /workers/device-status`

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| WG-DEV-001 | P0 | Report device online/ready hợp lệ | Persist đúng worker/device |
| WG-DEV-002 | P1 | Các state supported lần lượt | Mapping đúng enum — `TBD-CONTRACT` |
| WG-DEV-003 | P0 | Worker báo device thuộc worker khác | Reject |
| WG-DEV-004 | P1 | Invalid ADB port/serial/status/metrics | Validation error |
| WG-DEV-005 | P1 | Report cũ đến sau report mới | Không rollback device state do stale timestamp/sequence |
| WG-DEV-006 | P1 | Report duplicate | Idempotent; không duplicate device record/event |
| WG-DEV-007 | P0 | Payload cố chèn remote ADB host/public IP | Không tạo kết nối server-side hoặc mở exposure |
| WG-DEV-008 | P2 | Nhiều device updates đồng thời | Không mất update ngoài semantics đã chốt |

### 6.4 `POST /jobs/claim`

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| WG-CLAIM-001 | P0 | Có queued job phù hợp | Atomic claim; trả job, `leaseVersion` integer tăng đơn điệu, `leaseExpiresAt` |
| WG-CLAIM-002 | P0 | Không có job | Response no-job đúng contract; không lỗi giả |
| WG-CLAIM-003 | P0 | Hai worker claim một job cùng lúc | Chỉ một worker thắng |
| WG-CLAIM-004 | P0 | Một worker gửi nhiều claim đồng thời | Không vượt concurrency/capacity policy |
| WG-CLAIM-005 | P0 | Worker/token thiếu scope | Không claim |
| WG-CLAIM-006 | P0 | Worker offline/unhealthy/kill-switch | Không được giao job |
| WG-CLAIM-007 | P0 | Tenant/project/capability mismatch | Không claim job không phù hợp |
| WG-CLAIM-008 | P1 | Job queued đã cancel đồng thời | Không claim job cancelled; atomic winner đúng |
| WG-CLAIM-009 | P0 | Lease cũ hết hạn và job requeue/reclaim | Worker mới nhận `leaseVersion` lớn hơn tuyệt đối |
| WG-CLAIM-010 | P0 | Nhiều vòng reclaim | Version không reset, không reuse, không giảm |
| WG-CLAIM-011 | P1 | DB transaction conflict | Retry an toàn, không double claim |
| WG-CLAIM-012 | P1 | Response | Không chứa Supabase service-role credential hoặc secret |
| WG-CLAIM-013 | P2 | N worker tranh M job | Mỗi job tối đa một active lease; không starvation nghiêm trọng |
| WG-CLAIM-014 | P2 | Queue lớn | Claim latency/query lock trong SLO |

### 6.5 `POST /jobs/{jobId}/start`

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| WG-START-001 | P0 | Đúng workerId + current leaseVersion, job claimed | `claimed -> running`; startedAt đúng |
| WG-START-002 | P0 | Sai workerId | `409 STALE_JOB_LEASE` hoặc auth-bound conflict |
| WG-START-003 | P0 | LeaseVersion cũ/mới giả/thiếu/sai type | `409` hoặc validation; không start |
| WG-START-004 | P0 | Lease đã hết hạn | Reject; job có thể requeue/reclaim |
| WG-START-005 | P1 | Start lặp cùng lease | Idempotent hoặc conflict đúng contract; không double event |
| WG-START-006 | P1 | Start từ state không phải claimed | `409`; không state jump |
| WG-START-007 | P0 | Start đua với cancel | Chỉ transition hợp lệ thắng; không running sau cancelled |
| WG-START-008 | P1 | DB lỗi | Không trả success khi state chưa đổi |

### 6.6 `POST /jobs/{jobId}/heartbeat`

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| WG-JHB-001 | P0 | Running + đúng lease | Gia hạn lease theo contract; version không giảm |
| WG-JHB-002 | P0 | Sai workerId | `409 STALE_JOB_LEASE` |
| WG-JHB-003 | P0 | Stale leaseVersion | `409 STALE_JOB_LEASE`, `retryable=false` |
| WG-JHB-004 | P0 | Lease hết hạn | Reject; không resurrect lease |
| WG-JHB-005 | P0 | Job `cancelling` | `cancelRequested=true` |
| WG-JHB-006 | P0 | Job không cancel | `cancelRequested=false` |
| WG-JHB-007 | P0 | Terminal job | Reject/conflict; không gia hạn |
| WG-JHB-008 | P1 | Heartbeat duplicate/out-of-order | Không làm leaseExpiresAt lùi hoặc corrupt progress |
| WG-JHB-009 | P1 | Progress <0, >100, giảm lùi, NaN | Validate theo monotonic progress policy |
| WG-JHB-010 | P1 | Stage không khớp progress range | Reject/normalize theo contract — `TBD-CONTRACT` |
| WG-JHB-011 | P0 | Cancel được yêu cầu ngay sau heartbeat | Heartbeat kế trong <=10s phải thấy signal |
| WG-JHB-012 | P2 | Heartbeat flood | Rate/control hợp lý nhưng không gây false lease expiry |

### 6.7 `POST /jobs/{jobId}/events`

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| WG-EVT-001 | P0 | Đúng lease + event hợp lệ | Append đúng job/sequence/timestamp |
| WG-EVT-002 | P0 | Sai worker hoặc stale lease | `409`; không append |
| WG-EVT-003 | P0 | Job terminal | Reject trừ event terminal được contract cho phép |
| WG-EVT-004 | P1 | Event duplicate/replay cùng eventId | Idempotent; không duplicate timeline |
| WG-EVT-005 | P1 | Events đồng thời | Sequence/order ổn định |
| WG-EVT-006 | P1 | Stage/progress invalid | Validation error |
| WG-EVT-007 | P0 | Message chứa token/JWT/signed URL | Redact trước persist/response/log |
| WG-EVT-008 | P1 | Payload quá dài/nested sâu/control chars | Reject an toàn; không log injection |
| WG-EVT-009 | P1 | DB lỗi | Worker nhận lỗi retryable đúng; retry không duplicate |
| WG-EVT-010 | P1 | GET public events sau append | Event hiển thị đúng scope và schema |

### 6.8 `POST /jobs/{jobId}/artifacts/upload-init`

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| WG-UPINIT-001 | P0 | Running + đúng lease + metadata hợp lệ | Cấp upload target scoped đúng job/object/TTL |
| WG-UPINIT-002 | P0 | Stale lease/sai worker | `409`; không cấp URL |
| WG-UPINIT-003 | P0 | Job không ở stage/state cho upload | `409` |
| WG-UPINIT-004 | P1 | Filename/key traversal (`../`, absolute, encoded slash) | Reject; server tự quyết object key |
| WG-UPINIT-005 | P1 | Invalid size: âm/0/quá max/overflow/string | Validation error |
| WG-UPINIT-006 | P1 | Invalid SHA-256/content type | Validation error |
| WG-UPINIT-007 | P0 | Worker cố chọn bucket/tenant/job khác | Bỏ qua/reject; không cross-scope upload |
| WG-UPINIT-008 | P1 | Init lặp cùng artifact metadata | Idempotency/policy rõ; không orphan URLs vô hạn |
| WG-UPINIT-009 | P0 | Cancel xảy ra trước init | Không cấp target mới |
| WG-UPINIT-010 | P1 | Storage signer lỗi | Error chuẩn, retryable đúng, không metadata complete |
| WG-UPINIT-011 | P0 | Upload URL bị sửa key/content constraints | Storage từ chối |
| WG-UPINIT-012 | P2 | URL quá hạn | Upload bị từ chối; worker phải init lại với current lease |

### 6.9 `POST /jobs/{jobId}/artifacts/upload-complete`

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| WG-UPDONE-001 | P0 | Object tồn tại, size/hash đúng, current lease | Mark artifact verified/complete |
| WG-UPDONE-002 | P0 | Object không tồn tại | Reject; không complete |
| WG-UPDONE-003 | P0 | Size mismatch | Reject; artifact không downloadable |
| WG-UPDONE-004 | P0 | SHA-256 mismatch/corrupt ZIP | Reject; quarantine/delete theo policy |
| WG-UPDONE-005 | P0 | Stale lease sau worker B reclaim | `409 STALE_JOB_LEASE`; worker A không finalize |
| WG-UPDONE-006 | P0 | Sai worker | Reject |
| WG-UPDONE-007 | P0 | Job cancelling/cancelled | Không finalize thành công ngoài policy |
| WG-UPDONE-008 | P1 | Complete gọi trước init | Reject |
| WG-UPDONE-009 | P1 | Complete gọi hai lần cùng metadata | Idempotent; không duplicate artifact |
| WG-UPDONE-010 | P0 | Hai artifacts cạnh tranh cho cùng job | Chỉ artifact đúng policy được active |
| WG-UPDONE-011 | P0 | Metadata trỏ object tenant/job khác | Reject |
| WG-UPDONE-012 | P1 | Storage HEAD timeout | Không complete giả; retryable đúng |
| WG-UPDONE-013 | P0 | DB complete lỗi sau verify | Retry/reconciliation không duplicate và không public sớm |
| WG-UPDONE-014 | P1 | Public download sau complete | Chỉ khả dụng sau verified commit |

### 6.10 `POST /jobs/{jobId}/succeed`

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| WG-SUCCEED-001 | P0 | Running + current lease + verified artifact | `running -> succeeded`; completedAt; progress 100 |
| WG-SUCCEED-002 | P0 | Không có artifact/chưa verified | Reject nếu artifact bắt buộc |
| WG-SUCCEED-003 | P0 | Stale lease/sai worker | `409`; không terminal transition |
| WG-SUCCEED-004 | P0 | Job cancelling/cancelled | Không chuyển succeeded |
| WG-SUCCEED-005 | P1 | Job failed/dead_letter/queued/claimed | `409` |
| WG-SUCCEED-006 | P1 | Gọi lại sau succeeded | Idempotent hoặc conflict; không double event |
| WG-SUCCEED-007 | P0 | Succeed đua với fail | Chính xác một terminal state |
| WG-SUCCEED-008 | P0 | Succeed đua với cancel | Atomic winner theo policy; không state mâu thuẫn |
| WG-SUCCEED-009 | P1 | DB/audit lỗi | Transaction nhất quán |
| WG-SUCCEED-010 | P1 | Public overview/detail/apps sau success | Dữ liệu phản ánh đúng, artifact download được |

### 6.11 `POST /jobs/{jobId}/fail`

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| WG-FAIL-001 | P0 | Running + current lease + lỗi hợp lệ | Chuyển `failed`; lưu error classification sanitized |
| WG-FAIL-002 | P0 | Stale lease/sai worker | `409`; không fail job của lease mới |
| WG-FAIL-003 | P0 | Lỗi retryable + còn attempt | Requeue/backoff theo policy, attempt đúng |
| WG-FAIL-004 | P0 | Lỗi non-retryable | Không auto retry |
| WG-FAIL-005 | P0 | Hết max attempts | Chuyển `dead_letter` |
| WG-FAIL-006 | P1 | Error code/message thiếu, sai type, quá dài | Validation/redaction đúng |
| WG-FAIL-007 | P0 | Message chứa token/command/path nội bộ | Redact trước persist/API/log |
| WG-FAIL-008 | P1 | Fail terminal/non-running job | `409` hoặc idempotent đúng contract |
| WG-FAIL-009 | P0 | Fail đua với cancel/succeed | Chỉ một terminal outcome |
| WG-FAIL-010 | P1 | Public detail/events/overview sau fail | State/count/error đúng và không lộ secret |

---

## 7. State machine, lease và concurrency scenarios bắt buộc

| ID | P | Scenario | Expected |
|---|---:|---|---|
| STATE-001 | P0 | Happy path `queued -> claimed -> running -> succeeded` | Chỉ transition hợp lệ; timestamps/events/progress đúng |
| STATE-002 | P0 | Cancel sớm `queued -> cancelled` | Không claim/start được nữa |
| STATE-003 | P0 | Cancel realtime `running -> cancelling -> cancelled` | Worker thấy signal <=10s, cleanup, không artifact public |
| STATE-004 | P0 | Lease timeout `claimed -> queued -> claimed` bởi worker khác | leaseVersion tăng; worker cũ bị fence |
| STATE-005 | P0 | Fatal path `running -> failed` | Error/audit đúng |
| STATE-006 | P0 | Retry `failed -> queued`, sau đó success | Attempt tăng; lease mới; history không mất |
| STATE-007 | P0 | Retry exhausted `failed -> dead_letter` | Không claim lại tự động |
| STATE-008 | P0 | Thử mọi transition không có trong diagram | `409`; không side effect |
| STATE-009 | P0 | Worker A lease v1; hết hạn; B lease v2; A gọi start/events/upload/succeed/fail | Tất cả request A bị `STALE_JOB_LEASE` |
| STATE-010 | P0 | Worker gửi leaseVersion `0`, âm, decimal, string, overflow BIGINT | Reject; không coercion |
| STATE-011 | P0 | Hai transactions terminal đồng thời | Một và chỉ một kết quả commit |
| STATE-012 | P0 | Cancel và lease expiry cùng lúc | Job không bị vừa cancelled vừa reclaimed |
| STATE-013 | P0 | Retry và cancel cùng lúc trên failed job | Kết quả deterministic/atomic theo policy |
| STATE-014 | P0 | Delete artifact và retry/re-run cùng lúc | Không gắn artifact cũ vào attempt mới |
| STATE-015 | P1 | Process restart giữa mỗi bước state transition | Recovery không mất/nhân đôi transition |
| STATE-016 | P1 | DB commit thành công nhưng response mất | Client retry không duplicate side effect |
| STATE-017 | P1 | Request đến trễ/out-of-order | Không làm state/progress/time quay ngược |
| STATE-018 | P2 | Property/state-machine test chuỗi action ngẫu nhiên | Không reach state bất hợp lệ; invariant luôn giữ |

### Invariants phải assert ở mọi test state

- Một job có tối đa một active lease owner.
- `leaseVersion` là BIGINT nguyên dương, chỉ tăng, không reset hoặc tái sử dụng.
- Terminal state không quay lại state khác trừ flow retry được định nghĩa rõ.
- `succeeded` chỉ khi artifact bắt buộc đã verified.
- `cancelled` không được claim/start/succeed/fail/upload tiếp.
- `completedAt >= startedAt >= createdAt`; lease expiry dùng server clock.
- Progress không ngoài `0..100`; `succeeded=100`; mapping stage không mâu thuẫn.
- Mọi mutation có audit/event đúng actor, requestId và không chứa secret.

---

## 8. Network, reverse proxy và deployment security tests

| ID | P | Tình huống | Expected |
|---|---:|---|---|
| NET-001 | P0 | Từ host ngoài truy cập port 3000 | Không kết nối được |
| NET-002 | P0 | Từ host ngoài truy cập 5037, 5554, 5555, 63059 TCP/UDP phù hợp | Không kết nối được |
| NET-003 | P0 | Trên server kiểm tra bind addresses | Các port nội bộ chỉ bind `127.0.0.1` |
| NET-004 | P0 | HTTPS 443 | TLS hợp lệ; reverse proxy forward đúng; HTTP headers an toàn |
| NET-005 | P1 | HTTP 80 | Redirect HTTPS hoặc policy đã chốt; không phục vụ API plaintext nhạy cảm |
| NET-006 | P0 | Spoof `X-Forwarded-For/Host/Proto` trực tiếp | Chỉ trust proxy đã cấu hình; không bypass auth/rate/CORS/generate URL sai |
| NET-007 | P1 | Host header lạ | Reject hoặc canonical host; không host-header injection |
| NET-008 | P1 | Request body lớn/chậm tại proxy | Bị chặn theo limit/timeout; app không kiệt tài nguyên |
| NET-009 | P1 | Kiểm tra firewall sau reboot/deploy | Rule vẫn tồn tại |
| NET-010 | P0 | Log reverse proxy/app | Không log Authorization, cookie, worker token, signed URL query |

---

## 9. End-to-end acceptance scenarios

| ID | P | Scenario | Expected |
|---|---:|---|---|
| E2E-001 | P0 | Operator tạo single job, worker claim/start/events/upload/succeed, operator xem/tải | Toàn flow thành công; checksum đúng; scope đúng |
| E2E-002 | P0 | Operator tạo batch nhiều app, nhiều worker xử lý song song | Không trùng claim; mỗi input có kết quả đúng |
| E2E-003 | P0 | Operator cancel job running | Signal <=10s; worker dừng ADB/UIAutomator, uninstall/cleanup, state cancelled |
| E2E-004 | P0 | Worker chết sau claim, worker khác reclaim | leaseVersion tăng; worker cũ không finalize |
| E2E-005 | P0 | Pipeline lỗi retryable rồi thành công | Backoff/attempt/history/artifact đúng |
| E2E-006 | P0 | Pipeline lỗi đến max attempt | `dead_letter`; không retry vô hạn |
| E2E-007 | P0 | Tenant A và B chạy song song cùng packageId | Dữ liệu/job/event/artifact tuyệt đối cô lập |
| E2E-008 | P0 | Artifact corrupt | Không succeed/download; lỗi và cleanup đúng |
| E2E-009 | P1 | Restart backend/worker ở từng phase quan trọng | Recovery idempotent, không duplicate/mất job |
| E2E-010 | P1 | Storage/DB tạm unavailable rồi hồi phục | Retryability đúng; không inconsistent state |
| E2E-011 | P1 | Hai dashboard cùng thao tác một job | Conflict/state cập nhật đúng; không lost update |
| E2E-012 | P2 | Soak test nhiều giờ với claim/heartbeat/events/artifact | Không leak memory/disk/connection; queue không tích tụ bất thường |

---

## 10. Các điểm contract còn thiếu phải khóa trước khi ký PASS

Những mục này không phải tranh luận lại kiến trúc; đây là thông tin bắt buộc để tester biết chính xác expected result:

1. Request/response schema chi tiết cho các endpoint hiện chưa được tài liệu hóa đầy đủ; các response mẫu không thay thế schema.
2. Status code chính xác cho validation, not-found, invalid-state, duplicate, no-job và delete idempotency.
3. Tất cả query fields: `projectId`, pagination, sort, filters và giới hạn min/max.
4. `projectId` bắt buộc ở endpoint nào; lấy từ đâu khi cURL hiện tại không truyền.
5. Duplicate semantics và idempotency key cho single/batch create và action POST.
6. Batch là all-or-nothing hay partial success; response item-level nếu partial.
7. Defaults của `includeListing` và `includeScreenshots`.
8. Allowed lifecycle transitions cho `claimed + cancel`, retry từ `dead_letter`, manual retry `cancelled`.
9. Artifact bắt buộc trước `succeed` hay không; max size, content type, filename và TTL upload/download.
10. Pagination/event ordering, cursor consistency và retention.
11. Worker register/heartbeat/device payload schemas, compatibility policy và stale threshold.
12. Lease duration, heartbeat renewal semantics và xử lý server clock.
13. Rate limits, maximum body/batch/event size, API latency SLO.
14. CORS allow-methods/allow-headers/max-age và liệu alias có áp dụng mọi endpoint hay không.
15. Health là liveness hay readiness; dependency down thì response nào.

Không được đánh dấu toàn bộ matrix PASS nếu các mục liên quan vẫn là `TBD-CONTRACT`.

---

## 11. Sai lệch giữa hai tài liệu cần dev xác nhận

| ID | Sai lệch/thiếu | Ảnh hưởng test |
|---|---|---|
| DOC-001 | Quick-Start có 12 endpoint, API Spec có 15 Public API | Guide thiếu DELETE artifact, GET workers, GET worker detail |
| DOC-002 | Spec nói mọi query/mutation có `projectId`, nhưng các cURL không truyền | Không biết test request hợp lệ thực tế |
| DOC-003 | Spec nêu Browser Session + CSRF và Bearer flow, mapping endpoint ghi `supabaseBearer / Session` nhưng Quick-Start chỉ test Bearer | Cần tách test REST M2M và Server Action/session; không tự gửi cookie trực tiếp nếu route không hỗ trợ |
| DOC-004 | CORS chỉ mô tả origin, chưa định nghĩa allow-methods/headers/max-age | Preflight expected chưa khóa đủ |
| DOC-005 | Spec chỉ nêu một error code mẫu `STALE_JOB_LEASE` và guide nêu `INVALID_PLAY_URL` | Không thể assert code cho các lỗi khác nếu chưa có registry |
| DOC-006 | Document Status nói reconciled/pass 120 tests nhưng tài liệu không chứa schema/status đầy đủ | Pass hiện tại không chứng minh toàn bộ contract trong matrix này |

---

## 12. Release gate và cách giao bằng chứng

### Release gate tối thiểu

- **100% P0 PASS**, không waive lỗi auth, tenant isolation, lease fencing, state race hoặc artifact integrity.
- **100% P1 PASS** hoặc có waiver ghi owner, lý do, rủi ro và hạn sửa.
- Không còn `TBD-CONTRACT` ảnh hưởng P0/P1.
- Chạy test trên canonical path và alias path.
- Chạy ít nhất: unit/contract, integration DB+Storage, concurrency, E2E và external network scan.
- Không dùng production token hoặc dữ liệu thật trong log/evidence.

### Evidence cho mỗi test case

| Trường | Bắt buộc |
|---|---|
| Test Case ID | Ví dụ `WG-CLAIM-003` |
| Environment/build | Commit SHA, app version, migration version |
| Preconditions/fixtures | Tenant, project, job state, worker/lease |
| Actual request | Method/path/header đã redact/body |
| Actual response | Status/body/header/latency |
| DB/Storage assertion | Trạng thái trước/sau, object/hash nếu liên quan |
| Log correlation | `requestId`, log đã redact |
| Result | PASS/FAIL/BLOCKED |
| Defect | Link bug, severity, owner |

### Mẫu báo bug

```text
Title: [P0][WG-CLAIM-003] Two workers claimed the same job
Build/Commit:
Environment:
Precondition:
Steps:
Expected:
Actual:
Request IDs:
DB/Storage evidence:
Security/data impact:
Reproducibility:
Attachments:
```

---

## 13. Checklist gửi dev

- [ ] Dev xác nhận 15 Public + 11 Worker Gateway endpoint là scope chính thức.
- [ ] Dev bổ sung ba Public endpoint bị thiếu vào Quick-Start Guide.
- [ ] Dev khóa toàn bộ mục `TBD-CONTRACT` ở Mục 10.
- [ ] Tester chuẩn bị đủ fixtures hai tenant, hai project, hai worker và mọi job state.
- [ ] Automation map từng test ID vào test code; không chỉ chạy cURL happy path.
- [ ] Security/concurrency tests chạy trên môi trường gần production.
- [ ] Network scan chạy từ máy ngoài VPS, không chỉ localhost.
- [ ] Lưu requestId và bằng chứng DB/Storage cho mọi P0.
- [ ] Chỉ ký release khi đạt gate ở Mục 12.
