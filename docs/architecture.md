# Architecture

Monorepo pnpm: `apps/api` (Express + Supabase), `apps/worker` (Android emulator + adb), `packages/contracts` (zod schema dùng chung cả hai phía).

---

## 1. Thành phần

| Thành phần | Nhiệm vụ | Chạy ở đâu |
|---|---|---|
| `apps/api` | 14 endpoint public + 9 endpoint internal, lưu artifact lên đĩa, cron dọn dẹp | container `api`, Node 22 |
| `apps/worker` | vòng lặp poll → pipeline emulator → upload từng file | container `worker`, Node 20 + JDK 17 |
| `packages/contracts` | zod schema + `selectorMatches()`/`selectorFor()`/`isApkPath()` | thư viện, build vào cả hai image |
| Supabase Postgres | 5 bảng metadata + hàm `claim_job()` | ngoài VPS (Cloud) hoặc overlay self-host |
| Đĩa API server | `/data/artifacts/{jobId}/`, volume `api-artifacts` | container `api` |
| Caddy **hoặc** cloudflared | TLS và đường ra Internet — **loại trừ nhau** | container riêng, sau profile |

---

## 2. Tổng quan hệ thống

```mermaid
flowchart LR
    Client["Client<br/>Bearer API_TOKEN"]

    subgraph HOST["Host — docker compose"]
        Edge["caddy (profile production)<br/>hoặc cloudflared (profile quick/named)"]

        subgraph API["apps/api — Express :3000"]
            Public["Public /v1<br/>health · system · apps<br/>jobs · artifacts"]
            Internal["Internal /internal/v1<br/>workers · jobs"]
            Cron["background/cleanup.ts<br/>cron 1h"]
            Disk[("ARTIFACT_DIR<br/>artifacts/&lt;jobId&gt;/")]
        end

        subgraph Worker["apps/worker — vòng lặp poll"]
            Loop["index.ts<br/>claim → pipeline → upload"]
            Adb["android/adb.ts"]
            Emu["Android Emulator<br/>AVD chpay"]
            VNC["Xvfb → x11vnc → noVNC :6080"]
        end
    end

    DB[("Supabase Postgres<br/>apps · workers · jobs<br/>job_events · artifacts")]
    Play["Google Play Store"]

    Client -->|"HTTPS"| Edge --> Public
    Public --> DB
    Internal --> DB
    Internal --> Disk
    Cron --> DB
    Cron --> Disk

    Loop -->|"Bearer WORKER_TOKEN"| Internal
    Loop --> Adb --> Emu --> Play
    Loop -->|"scrape HTML"| Play
    Emu -.-> VNC

    Public -.->|"stream file / zip"| Client

    classDef store fill:#eef,stroke:#557
    class DB,Disk store
```

**Ba mặt phẳng xác thực** ([middleware/auth.ts](../apps/api/src/middleware/auth.ts)):

- `API_TOKEN` cho `/v1/*`
- `WORKER_TOKEN` cho `/internal/v1/*`
- Không token cho `GET /v1/health` và `GET /v1/artifacts/:id/download` — link đã mang `expires` + `signature` HMAC

Cả hai token so sánh constant-time sau khi hash SHA-256 — hash trước để độ dài token không lộ qua thời gian so sánh.

---

## 3. Luồng end-to-end của một job

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant A as API /v1
    participant DB as Supabase
    participant I as API /internal/v1
    participant W as Worker
    participant E as Emulator + Play

    C->>A: POST /v1/jobs {playUrl}
    A->>A: parse ?id= → packageId, kiểm isValidPackageId
    A->>DB: upsert apps · insert jobs status=queued · job_events
    A-->>C: 201 {jobId, status: queued}

    loop mỗi POLL_INTERVAL_MS (5s)
        W->>I: POST /jobs/claim {workerId}
        I->>I: isDiskLow? → 204, giữ job trong queue
        I->>DB: rpc claim_job — FOR UPDATE SKIP LOCKED
        DB-->>I: job + lease 120s, attempt_count++
        I-->>W: 200 job | 204 rỗng
    end

    Note over W,E: pipeline — heartbeat 20s chạy nền xen kẽ mọi bước

    W->>E: scrapePlayStoreListing 15%
    W->>E: isDeviceReady + wakeAndUnlockDevice 25%
    W->>E: mở Play Store 35% · ensureAppInstalled 45%
    W->>E: adb pull base.apk + splits 60%
    W->>W: PULL_MANIFEST 70% · validateZipArchive 80%

    loop từng file trong work/apks/{packageId}/
        W->>I: PUT /jobs/:id/files/{relPath} + X-Content-SHA256
        I->>I: chặn nếu job không running (409)
        I->>I: chặn nếu Content-Length không vừa đĩa (507)
        I->>I: hash on-the-fly, lệch thì 400 và xoá file
        I->>I: ghi đĩa + append .uploads.jsonl
    end

    W->>I: POST /jobs/:id/artifact/finalize {workerId, fileName, fileCount}
    I->>I: đối chiếu worker_id (409) + đếm file trên đĩa (400)
    I->>DB: upsert artifacts state=available, apk_expires_at, expires_at

    W->>I: POST /jobs/:id/complete {result}
    I->>DB: jobs=completed · upsert apps · workers=online

    C->>A: GET /v1/jobs/:id  (poll)
    C->>A: POST /jobs/:id/artifact/download-url {select|path}
    A-->>C: signed URL + TTL 600s
    C->>A: GET /v1/artifacts/:aid/download?…&signature
    A-->>C: 1 file → thô (Range OK) · nhiều file → ZIP stream
    A->>A: on 'finish' + có APK + deleteAfterDownload → hẹn xoá APK
```

**Heartbeat hai tầng:**

| Tầng | Endpoint | Chu kỳ | Mục đích |
|---|---|---|---|
| Worker | `/workers/heartbeat` | 20s | báo worker + emulator còn sống |
| Job | `/jobs/:id/heartbeat` | 20s nền + mỗi lần đổi bước | gia hạn lease 120s, nhận cờ `cancelRequested` |

Worker kiểm `cancelRequested` **giữa các bước** (sau scrape, sau boot, sau install, sau validate, sau upload) để dừng sớm thay vì chạy hết pipeline rồi mới biết đã bị huỷ.

---

## 4. State machine của job

```mermaid
stateDiagram-v2
    [*] --> queued: POST /v1/jobs

    queued --> running: claim_job — lease 120s, attempt++
    queued --> cancelled: POST /cancel

    running --> completed: /complete
    running --> queued: /fail retryable — còn lượt
    running --> failed: /fail — hết max_attempts
    running --> cancelling: POST /cancel
    running --> running: lease hết hạn — worker khác claim lại

    cancelling --> cancelled: /cancelled — worker xác nhận

    running --> failed: reaper — hết lượt và im lặng > STUCK_JOB_GRACE_MINUTES
    cancelling --> cancelled: reaper — worker chết trước khi xác nhận

    failed --> queued: POST /retry — reset attempt_count = 0
    completed --> [*]
    failed --> [*]
    cancelled --> [*]
```

`reapStuckJobs()` tồn tại vì `claim_job()` **cố ý** bỏ qua hai loại job:

- có `cancel_requested_at` → không claim lại được, mà `cancelling` cũng không nằm trong bộ lọc status
- `attempt_count >= max_attempts` → không claim lại được, cũng không ai đánh dấu `failed`

Hai loại đó sẽ nằm lại vĩnh viễn: client poll ba trạng thái kết thúc sẽ chờ mãi, và `POST /retry` cũng từ chối vì status không phải `failed`. Không có đường nào thoát ngoài sửa tay trong DB.

Job `running` **còn lượt** thì reaper không đụng tới — `claim_job()` sẽ tự lấy lại, cướp mất là bỏ đi một lần thử hợp lệ.

---

## 5. Vòng đời artifact và dọn đĩa

```mermaid
flowchart TD
    Put["PUT files/*<br/>ghi artifacts/&lt;jobId&gt;/"] --> Orphan{"có finalize?"}
    Orphan -->|"không"| OD["thư mục mồ côi<br/>không có dòng DB"]
    Orphan -->|"có"| Avail["state = available<br/>apk_expires_at +6h<br/>expires_at +720h"]

    Avail -->|"APK_TTL hết hạn"| Partial["state = partial<br/>xoá base.apk + splits<br/>giữ listing/screenshots"]
    Avail -->|"tải xong + deleteAfterDownload<br/>ân hạn 10 phút"| Partial
    Avail -->|"đĩa dưới ARTIFACT_MIN_FREE_BYTES"| Partial

    Partial -->|"expires_at hết hạn"| Exp["state = expired<br/>xoá cả thư mục"]
    Avail -->|"expires_at hết hạn"| Exp
    Partial -->|"đĩa vẫn thấp — nước cuối"| Exp
    OD -->|"nguội > ORPHAN_DIR_MIN_AGE_MINUTES"| Gone["rm -rf"]

    subgraph CRON["startArtifactCleanupCron — 10s sau boot, rồi mỗi 1h"]
        direction LR
        S1["cleanupExpiredApks"] --> S2["cleanupExpiredArtifacts"] --> S3["cleanupOrphanDirs"] --> S4["evictUnderDiskPressure"] --> S5["reapStuckJobs"]
    end

    classDef bad fill:#fee,stroke:#a55
    class Exp,Gone bad
```

Thứ tự năm bước không tuỳ tiện: xoá APK hết hạn trước (rẻ nhất, giải phóng nhiều nhất), rồi mới tới xoá cả thư mục, rồi dò mồ côi, rồi mới đuổi theo áp lực đĩa — để bước cuối chỉ phải làm khi bốn bước trên đã không đủ.

---

## 6. Selector — client hỏi theo ý nghĩa, không theo tên file

```mermaid
flowchart LR
    Sel["ArtifactSelector"] --> All["all — cả thư mục"]
    Sel --> Apk["apk"] --> Base["apk.base → base.apk"]
    Apk --> Split["apk.splits → split_config.*.apk"]
    Sel --> Shot["screenshots → playstore/screenshots/*"]
    Sel --> List["listing → description.md · listing.json · icon.png"]
    List --> Full["listing.full → + page.html"]
    Sel --> Meta["metadata → PULL_MANIFEST.txt · package-info.txt · device-dir.listing"]
```

Định nghĩa ở [packages/contracts/src/index.ts](../packages/contracts/src/index.ts). `selectorMatches()` dùng chung cho cả `download-url` (lọc trước, báo 404 sớm) và `/download` (lọc lại lúc stream). Đúng một file khớp thì trả thô, nhiều file thì zip stream.

---

## 7. Quyết định kiến trúc

Cột "đã loại" quan trọng nhất — nó ngăn việc đề xuất lại thứ đã bỏ.

| Quyết định | Lý do | Đã loại |
|---|---|---|
| **Artifact là thư mục, không phải ZIP** | worker đã dựng sẵn layout đúng chuẩn trước khi làm gì khác. Lưu ZIP rồi mỗi lần client xin một tấm ảnh lại phải đọc central directory và giải nén — làm ngược đúng việc worker vừa làm. Bỏ khâu nén thì lấy một file chỉ còn là đọc file | lưu ZIP dựng sẵn |
| **TTL tách đôi APK / phần nhẹ** | APK chiếm 98% dung lượng. Vì file nằm rời nên xoá 98% chỉ là một lệnh `rm`, không phải viết lại file nén. Dài hạn rẻ hơn ~50 lần | một TTL chung |
| **Chữ ký không phủ `select`/`path`** | link mặc định vốn đã cho cả thư mục, nên người sửa query chỉ lấy được **ít hơn** thứ họ đã có quyền lấy. Ký thêm không mua được gì | ký toàn bộ query string |
| **`claim_job()` + lease, không dùng message queue** | với vài worker thì bảng `jobs` + `FOR UPDATE SKIP LOCKED` là đủ, và dễ xem/dễ debug hơn hẳn | Supabase Queues / PGMQ |
| **Một `API_TOKEN` chung** | bản 1.0 cố ý không có bảng tài khoản. Đây là chuyện vận hành đã biết, không phải lỗ hổng bị bỏ sót | bảng `api_keys` + hạn ngạch |
| **Emulator chạy có cửa sổ** | phải nhìn và bấm được màn hình để đăng nhập Play lần đầu | `-no-window` |
| **Worker không cầm khoá Supabase** | worker là thành phần dễ mất kiểm soát nhất; mọi thay đổi trạng thái đi qua một chỗ | worker ghi thẳng DB |
| **Nén khi đang stream, không lưu lại** | không phải giữ hai bản của cùng dữ liệu. Đổi lại: không có `Content-Length` cho bản nhiều file | sinh sẵn ZIP để tải nhanh |
| **Sổ sha256 trong dotfile cạnh payload** | tính lại lúc finalize phải đọc lại ~150 MB chỉ để lấy con số vừa tính xong | tính lại lúc finalize |
| **`page.html` khai `application/octet-stream`** | CDN viết lại nội dung `text/html` trên đường truyền (Cloudflare Email Obfuscation) làm file phình và sha256 lệch | khai đúng `text/html` |
| **API và worker là hai image riêng** | API không cần Android SDK (~4 GB). Rebuild API không phải tải lại SDK | một image chung |

---

## 8. Nhược điểm đã biết

Ghi thẳng, không giấu:

| Nhược điểm | Hệ quả | Giảm nhẹ hiện tại |
|---|---|---|
| Một emulator, tuần tự | 20 URL ≈ 20 phút; hai đối tác cùng gửi thì bên sau chờ | `claim_job()` đã sẵn sàng cho nhiều worker, chưa thử |
| Một token chung | không tách được đối tác, không biết ai gọi gì, lộ thì đổi cho tất cả | link tải có chữ ký riêng, không cần đưa token |
| Phiên Google Play là trạng thái thủ công | mất là mọi job fail, phải đăng nhập tay qua noVNC | volume `worker-avd` giữ phiên qua `down`/`up` |
| Quick tunnel đổi URL mỗi lần restart | đối tác hardcode URL là gãy | tài liệu chỉ ghi **cách lấy** URL, không ghi URL |
| WSL tự thu hồi distro | cả stack chết mà không có dấu hiệu crash | keepalive `sleep infinity` + Task Scheduler |
| Migration không có `down` | rollback schema phải làm tay | image tag theo `github.sha` nên code rollback được |
| CI test trên Node 20, production chạy Node 22 | lỗi chỉ xuất hiện trên một trong hai runtime sẽ lọt lưới | — (nợ kỹ thuật, xem [plan.md](plan.md)) |
| Không có `Content-Length` cho ZIP | client không hiện được thanh tiến độ chính xác | `download-url` trả `sizeBytes` thô để ước lượng |
| Batch bỏ qua URL sai im lặng | client không biết URL nào bị loại | đếm `data.jobs.length` so với số URL gửi |

---

## 9. Điều GitNexus **không** thấy

Repo được index bằng GitNexus (628 nodes, 1013 edges, 18 flows). Nhưng **handler Express là closure bên trong router**, nên không có flow nào cho luồng HTTP.

18 flow hiện có đều thuộc hai nhóm:

- **Hàm nền của API**: `startArtifactCleanupCron`, `evictUnderDiskPressure`, `armDeleteAfterDownload`
- **Pipeline worker**: `startWorkerLoop`, `processJob`, `ensureAppInstalled`, `uploadArtifactDir`, `runMigrations`

Muốn hiểu một endpoint thì **đọc router**. Tìm trong graph không thấy rồi kết luận "không có" là sai.
