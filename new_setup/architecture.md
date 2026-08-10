# Kiến trúc app-relay — sơ đồ tổng quan

Monorepo pnpm: `apps/api` (Express + Supabase), `apps/worker` (Android emulator + adb),
`packages/contracts` (zod schema dùng chung cả hai phía).

---

## 1. Tổng quan hệ thống

```mermaid
flowchart LR
    Client["Client<br/>Bearer API_TOKEN"]

    subgraph VPS["VPS — docker compose"]
        Caddy["Caddy<br/>TLS 80/443"]

        subgraph API["apps/api — Express :3000"]
            Public["Public /v1<br/>health · system · apps<br/>jobs · artifacts"]
            Internal["Internal /internal/v1<br/>workers · jobs"]
            Cron["background/cleanup.ts<br/>cron 1h"]
            Disk[("ARTIFACT_DIR<br/>artifacts/&lt;jobId&gt;/")]
        end

        subgraph Worker["apps/worker — vòng lặp poll"]
            Loop["index.ts<br/>claim → pipeline → upload"]
            Adb["android/adb.ts"]
            Emu["Android Emulator<br/>AVD"]
        end
    end

    DB[("Supabase Postgres<br/>apps · workers · jobs<br/>job_events · artifacts")]
    Play["Google Play Store"]

    Client -->|"HTTPS"| Caddy --> Public
    Public --> DB
    Internal --> DB
    Internal --> Disk
    Cron --> DB
    Cron --> Disk

    Loop -->|"Bearer WORKER_TOKEN"| Internal
    Loop --> Adb --> Emu --> Play
    Loop -->|"scrape HTML"| Play

    Public -.->|"stream file / zip"| Client

    classDef store fill:#eef,stroke:#557
    class DB,Disk store
```

**Hai mặt phẳng token tách biệt** ([auth.ts](../apps/api/src/middleware/auth.ts)):
`API_TOKEN` cho `/v1`, `WORKER_TOKEN` cho `/internal/v1`, so sánh constant-time.
Riêng `GET /v1/artifacts/:id/download` **không cần token** — link đã mang
`expires` + `signature` HMAC.

---

## 2. Luồng chạy end-to-end của một job

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
    A->>A: parse ?id= → packageId
    A->>DB: upsert apps · insert jobs status=queued · job_events
    A-->>C: 201 {jobId, status:queued}

    loop mỗi POLL_INTERVAL_MS
        W->>I: POST /jobs/claim {workerId}
        I->>I: isDiskLow? → 204, giữ job trong queue
        I->>DB: rpc claim_job — FOR UPDATE SKIP LOCKED
        DB-->>I: job + lease 120s, attempt_count++
        I-->>W: 200 job | 204 rỗng
    end

    Note over W,E: pipeline — heartbeat 20s xen kẽ mọi bước
    W->>E: scrape listing 15%
    W->>E: isDeviceReady + wakeAndUnlock 25%
    W->>E: mở Play Store 35% · ensureAppInstalled 45%
    W->>E: adb pull base.apk + splits 60%
    W->>W: PULL_MANIFEST 70% · validate ZIP 80%

    loop từng file trong work/apks/[packageId]/
        W->>I: PUT /jobs/:id/files/[relPath] + X-Content-SHA256
        I->>I: chặn nếu job không running · check disk · hash on-the-fly
        I->>I: ghi đĩa + append .uploads.jsonl
    end
    W->>I: POST /jobs/:id/artifact/finalize {fileCount}
    I->>I: đối chiếu worker_id + đếm file trên đĩa
    I->>DB: upsert artifacts state=available, apk_expires_at, expires_at

    W->>I: POST /jobs/:id/complete {result}
    I->>DB: jobs=completed · upsert apps · workers=online

    C->>A: GET /v1/jobs/:id  (poll trạng thái)
    C->>A: POST /jobs/:id/artifact/download-url {select|path}
    A-->>C: signed URL + TTL
    C->>A: GET /v1/artifacts/:aid/download?...&signature
    A-->>C: stream 1 file (Range OK) hoặc ZIP nhiều file
    A->>A: on finish + có APK + deleteAfterDownload → hẹn xoá APK
```

**Heartbeat 2 tầng**: worker-level (`/workers/heartbeat`, 20s) báo emulator sống;
job-level (`/jobs/:id/heartbeat`) gia hạn lease + nhận cờ `cancelRequested` —
worker kiểm tra cờ này giữa các bước để dừng sớm.

---

## 3. State machine của job

```mermaid
stateDiagram-v2
    [*] --> queued: POST /v1/jobs

    queued --> running: claim_job — lease 120s
    queued --> cancelled: POST /cancel

    running --> completed: /complete
    running --> queued: /fail retryable — còn lượt
    running --> failed: /fail — hết max_attempts
    running --> cancelling: POST /cancel
    running --> running: lease hết hạn — worker khác claim lại

    cancelling --> cancelled: /cancelled — worker xác nhận

    running --> failed: reaper — hết lượt và im lặng quá 15 phút
    cancelling --> cancelled: reaper — worker chết trước khi xác nhận

    failed --> queued: POST /retry
    completed --> [*]
    failed --> [*]
    cancelled --> [*]
```

`reapStuckJobs()` tồn tại vì `claim_job` bỏ qua job có `cancel_requested_at`
hoặc đã hết `max_attempts` — hai loại đó sẽ nằm lại vĩnh viễn nếu không có reaper.

---

## 4. Vòng đời artifact & dọn đĩa

```mermaid
flowchart TD
    Put["PUT files/*<br/>ghi artifacts/&lt;jobId&gt;/"] --> Orphan{"có finalize?"}
    Orphan -->|không| OD["thư mục mồ côi<br/>không có dòng DB"]
    Orphan -->|có| Avail["state = available<br/>apk_expires_at 6h<br/>expires_at 720h"]

    Avail -->|"APK_TTL hết hạn"| Partial["state = partial<br/>xoá base.apk + splits<br/>giữ listing/screenshots"]
    Avail -->|"tải xong + deleteAfterDownload<br/>ân hạn 10 phút"| Partial
    Avail -->|"đĩa dưới ARTIFACT_MIN_FREE_BYTES"| Partial

    Partial -->|"expires_at hết hạn"| Exp["state = expired<br/>xoá cả thư mục"]
    Avail -->|"expires_at hết hạn"| Exp
    Partial -->|"đĩa vẫn thấp — nước cuối"| Exp
    OD -->|"nguội > 120 phút"| Gone["rm -rf"]

    subgraph CRON["startArtifactCleanupCron — mỗi 1h"]
        direction LR
        S1["cleanupExpiredApks"] --> S2["cleanupExpiredArtifacts"] --> S3["cleanupOrphanDirs"] --> S4["evictUnderDiskPressure"] --> S5["reapStuckJobs"]
    end

    classDef bad fill:#fee,stroke:#a55
    class Exp,Gone bad
```

APK chiếm ~98% dung lượng nên có TTL riêng, ngắn hơn hẳn phần còn lại —
xoá APK trước, giữ metadata để client vẫn tra được.

---

## 5. Selector — client hỏi theo ý nghĩa, không theo tên file

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

Định nghĩa ở [contracts/src/index.ts](../packages/contracts/src/index.ts) —
`selectorMatches()` dùng chung cho cả `download-url` (lọc trước, báo 404 sớm)
và `/download` (lọc lại lúc stream). Đúng 1 file khớp thì trả thô, nhiều file thì
zip stream, không có `Content-Length`.
