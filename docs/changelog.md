# Changelog

Viết cho người đọc, không copy commit message. Breaking change in đậm riêng.

Format: `Added` / `Changed` / `Fixed` / `Removed`.

---

## 2026-08-11

### Added

- **`deploy/bootstrap.sh` — dựng cả stack trên VPS trắng bằng một lệnh.** Kiểm tra máy (x86_64, `/dev/kvm`, RAM, đĩa của Docker, cổng 80/443), đối chiếu A record với IP public, sinh cả ba file `.env*` với secret `openssl rand`, build, up, chờ healthy, smoke test trong container lẫn qua HTTPS. Idempotent: chạy lại giữ nguyên secret và volume.
- Bootstrap tự ký **JWT HS256 `role=service_role`** làm `SUPABASE_SECRET_KEY`. Self-host không có khoá `sb_secret_...`, nhưng PostgREST xác thực JWT bằng `PGRST_JWT_SECRET` rồi `set role` đúng như Supabase Cloud — nên `apps/api/src/database/supabase.ts` không phải đổi dòng nào.
- `deploy/compose.prod.yaml` — overlay cho máy chạy dài ngày: xoay log `json-file` (10m × 5) cho cả 6 service, healthcheck cho `caddy`, `stop_grace_period: 120s` cho worker để emulator kịp ghi userdata 12 G xuống đĩa thay vì ăn SIGKILL sau 10 giây.
- `docs/deploy-vps.md` — đường deploy tự chứa, tách khỏi [kick-start.md](kick-start.md) (dựng để dev) và [CI-CD.md](CI-CD.md) (pull image có sẵn).
- **`docs/public-access.md` — Cloudflare Tunnel là đường ra Internet chính thức.** Quick vs named và vì sao quick **không** đưa cho đối tác được (URL đổi sau mỗi lần deploy), các bước chuyển quick→named, vì sao Caddy xuống hàng thay thế, và bẫy `/internal/*` không còn lớp chặn khi bỏ Caddy.

### Changed

- **`deploy/.env` giờ mang `COMPOSE_FILE` và `COMPOSE_PROFILES`.** Compose đọc hai biến này từ `.env` của thư mục project, nên sau bootstrap mọi lệnh vận hành chỉ còn `docker compose ps` / `logs` / `up -d` — hết chuỗi `-f compose.yml -f compose.kvm.yaml -f …` gõ sai một cái là chạy nhầm cấu hình.
- **`apps/api/Dockerfile` tách hẳn stage runner.** Trước đây runner `COPY --from=builder /app ./` — bê nguyên devDependencies, `src/`, tsconfig và cả pnpm vào image production. Giờ builder prune bằng `pnpm install --prod` rồi runner chỉ chép `node_modules` + `dist` + hai `package.json`. Chạy bằng user `app` (uid 10001) thay vì root.
- **BREAKING với volume cũ — `api` chạy non-root.** Docker chỉ gieo quyền sở hữu vào volume **mới**; volume `api-artifacts` đã tồn tại từ thời chạy root vẫn thuộc root và ghi artifact sẽ `EACCES`. Vá: `docker compose run --rm --user root api chown -R 10001:10001 /data/artifacts`. Deploy sạch không dính.
- `deploy/compose.yml` bỏ `.env` khỏi `env_file` của `api` và `worker`. Compose vốn đã tự đọc `.env` để nội suy; để nó trong `env_file` chỉ có tác dụng bơm `POSTGRES_PASSWORD` và `JWT_SECRET` vào bên trong container — riêng worker còn chạy APK của bên thứ ba.
- `deploy/caddy/Caddyfile` chặn `/internal/*` ở lớp ngoài (404). Worker gọi `http://api:5500` qua mạng Docker nên không cần đường công khai; lộ `WORKER_TOKEN` giờ không đủ để điều khiển hàng đợi job từ Internet. Thêm HSTS, `X-Content-Type-Options`, `Referrer-Policy`, bỏ header `Server`, và `flush_interval -1` để artifact hàng trăm MB stream chứ không buffer.

- **Job ④ của CI đồng bộ git trên VPS trước khi `up`.** File compose và Caddyfile **không nằm trong image** — chúng đọc từ đĩa máy đích, nên trước đây mọi thay đổi trong `deploy/` không bao giờ tới VPS dù pipeline báo xanh. Giờ `git fetch` + `reset --hard <sha>` để commit trên VPS khớp đúng commit đã build ra image. **Lệnh này xoá mọi sửa tay trên file đã track ở VPS**; `.env*` untracked nên an toàn.
- **Job ④ không còn hardcode cờ `docker compose` nào.** `-f` và `--profile` tường minh **đè** `COMPOSE_FILE`/`COMPOSE_PROFILES` trong `deploy/.env`, nên mỗi lần deploy tự động lại âm thầm làm rơi `compose.prod.yaml` (xoay log, `stop_grace_period` của worker) lẫn `compose.supabase.yaml` — mà `--remove-orphans` thì xoá luôn container thuộc overlay bị rơi. Máy đích tự khai báo chế độ, CI chỉ đồng bộ rồi `pull` + `up -d`.
- `docs/deploy-vps.md §8` và `docs/CI-CD.md §5.3` viết lại theo hướng tunnel là mặc định, Caddy là đường thay thế cho VPS có IP tĩnh và domain.

### Fixed

- **Emulator không còn ngủ giữa các job.** `screen_off_timeout` được đặt ở ba nơi với ba giá trị khác nhau và nơi ghi sau cùng thắng: `apps/worker/src/android/adb.ts` chạy mỗi job nên nó ghi đè giá trị của script boot về lại 30 phút. Worker rảnh quá 30 phút là màn hình ngủ, job kế tiếp fail ở bước tìm phần tử UI — lỗi hiện ra không liên quan gì tới màn hình. Cả hai nơi giờ dùng `2147483647` (~24,8 ngày), override chung bằng `EMULATOR_SCREEN_OFF_TIMEOUT`.
- **`adb shell settings put` giờ được kiểm chứng bằng cách đọc lại.** Nó thoát mã 0 kể cả khi lệnh bên trong thiết bị hỏng — điển hình là lúc adb chưa authorized — nên `set -e` lẫn `try/catch` đều không bắt được, lệnh trượt trong im lặng. `wait-for-emulator.sh` cũng chờ `adb get-state` = `device` trước khi gửi lệnh vào máy.
- **Job ④ chạy với `set -e`.** `appleboy/ssh-action` mặc định `script_stop: false`, nên `docker compose pull` hỏng vẫn chạy tiếp tới dòng `echo "✅ deployed successfully"` và job báo xanh.
- `.env.api.example` bổ sung 5 biến còn thiếu (`APK_TTL_HOURS`, `ARTIFACT_MIN_FREE_BYTES`, `ORPHAN_DIR_MIN_AGE_MINUTES`, `DELETE_AFTER_DOWNLOAD_GRACE_MINUTES`, `STUCK_JOB_GRACE_MINUTES`) và sửa `ARTIFACT_TTL_HOURS` từ `48` về `720` cho khớp code. Lệch này ghi trong [environment.md §6](environment.md) từ 2026-08-10.

---

## 2026-08-10

### Removed

- **BREAKING — bộ test conformance 23 endpoint bị xoá** (`tests/test-endpoints/`, 3410 dòng: harness, cases public/internal, probe, downloader, report). Hai script `pnpm test:endpoints` và `pnpm download:artifacts` trong `package.json` **vẫn còn và giờ trỏ vào thư mục không tồn tại** — chạy là lỗi ngay. Tài liệu `new_setup/api-endpoint.md §4` vẫn hứa bộ test này chạy được. Xem [plan.md](plan.md) T-01.
- Xoá file `key` ở gốc repo (legacy).

### Added

- `reapStuckJobs()` — đưa job kẹt về trạng thái kết thúc. Bịt lỗ hổng cố hữu của `claim_job()`: hàm đó cố ý bỏ qua job có `cancel_requested_at` và job đã hết `max_attempts`, nên hai loại đó nằm lại vĩnh viễn. Client poll ba trạng thái kết thúc sẽ chờ mãi, và `POST /retry` cũng từ chối vì status không phải `failed`.
- Biến `STUCK_JOB_GRACE_MINUTES` (mặc định 15) điều khiển reaper. Phải cao hơn hẳn lease 120 giây để không cướp job còn sống.
- `new_setup/architecture.md` — 5 sơ đồ Mermaid: tổng quan, sequence end-to-end, state machine, vòng đời artifact, cây selector.
- Báo cáo `tests/reports/test_execution_report.md`.

### Changed

- `POST /v1/jobs/:id/cancel` ràng update vào chính trạng thái vừa đọc (`.eq('status', job.status)`), lệch thì trả `409 STATUS_CHANGED`. Không có chốt này, worker claim đúng khe giữa `SELECT` và `UPDATE` sẽ khiến job báo `cancelled` trong khi emulator vẫn cài app và vẫn upload artifact.
- Scraper Play Store: cải thiện parse listing.
- `start-wsl-server` chuyển vào `new_setup/`.

---

## 2026-08-09

### Fixed

- **`page.html` tới nơi không còn nguyên vẹn.** CDN đứng trước API viết lại nội dung `text/html` trên đường truyền — Cloudflare bật sẵn Email Address Obfuscation, chèn `/cdn-cgi/scripts/…/email-decode.min.js` và thay địa chỉ email bằng `/cdn-cgi/l/email-protection`. Đo được: `page.html` của Zalo phình từ 1.185.094 lên 1.185.454 byte và sha256 lệch hoàn toàn. Vá bằng cách khai `.html` là `application/octet-stream` — file sinh ra để client re-parse listing gốc nên phải tới nơi từng byte.
- Bộ test không còn ghi đè app thật khi chạy.
- Quick tunnel khởi động được khi chưa có `CLOUDFLARE_TUNNEL_TOKEN`. Compose nội suy `command` của **mọi** service kể cả service không thuộc profile đang bật, nên một `${VAR:?}` trong `cloudflared-named` chặn luôn cả profile `quick`. Chuyển token sang `environment`.
- Deploy sạch chỉ áp `001_initial_schema.sql`. Compose trỏ cứng vào một file, nên thêm migration mới mà quên sửa compose thì deploy im lặng chạy với schema cũ và API chết khi đụng cột mới. Đổi sang mount cả thư mục `supabase/migrations/`.

### Added

- Cloudflare Tunnel làm phương án thay Caddy (`compose.tunnel.yaml`), hai profile `quick` và `named`. Tunnel kết nối hướng ra ngoài nên không cần IP public, không mở cổng, không đụng router — đúng thứ cần khi server nằm trên máy cá nhân, trong WSL, hoặc sau CGNAT.
- Bộ test conformance phủ toàn bộ endpoint đã tài liệu hoá *(đã bị xoá ngày 2026-08-10)*.
- Downloader thử mọi selector artifact *(đã bị xoá ngày 2026-08-10)*.

### Changed

- Gộp hướng dẫn cho người gọi vào một file API reference duy nhất.
- Ghi lại ba lỗi gặp khi deploy lên server thật.

---

## 2026-08-08

### Added

- **BREAKING — artifact chuyển từ một file ZIP sang thư mục** (migration `002_artifact_directory.sql`).

  Worker đã dựng sẵn `work/apks/<packageId>/` đúng layout trước khi nén. Lưu lại bản nén rồi mỗi lần client xin một file lại phải giải nén ngược là làm hai lần cùng một việc. Bỏ khâu nén ở giữa thì lấy một file chỉ còn là đọc file khỏi đĩa, và xoá riêng APK (98% dung lượng) chỉ là một lệnh `rm`.

  Thay đổi cho người gọi:

  | | Trước | Sau |
  |---|---|---|
  | Lưu trữ | `bundle.zip` | thư mục `/data/artifacts/{jobId}/` |
  | Lấy một phần | không được | `select` (8 nhóm) hoặc `path` |
  | sha256 | một giá trị cho cả cục | **theo từng file** — ZIP sinh tại chỗ nên mỗi lần một khác |
  | `state` | `preparing/available/expired/deleted` | thêm **`partial`** — APK đã xoá, phần nhẹ còn |
  | `kind` | `bundle_zip` | `bundle_dir` |
  | TTL | một mốc | tách đôi: `apk_expires_at` (6h) và `expires_at` (720h) |

  Artifact cũ (`kind = bundle_zip`) vẫn tải được nguyên cục, nhưng **không** cắt lẻ được — xin `select`/`path` trả `409 LEGACY_ARTIFACT`.

- Cột `jobs.delete_after_download` và tuỳ chọn `deleteAfterDownload` khi tạo job. Xoá APK ngay sau khi client tải xong trọn vẹn, giữ phần nhẹ theo `ARTIFACT_TTL_HOURS`.
- `PUT /internal/v1/jobs/:id/files/*` — worker gửi từng file, hash on-the-fly, verify `X-Content-SHA256`.
- `POST /internal/v1/jobs/:id/artifact/finalize` — chốt artifact. Trước lệnh này artifact ở `state = preparing` và không tải được, nên client không bao giờ vớ phải bản dở dang.
- Năm tác vụ dọn dẹp chạy cron mỗi giờ: `cleanupExpiredApks` → `cleanupExpiredArtifacts` → `cleanupOrphanDirs` → `evictUnderDiskPressure` → `reapStuckJobs`.
- Phanh đĩa ba lớp: `claim` trả `204` khi đĩa thấp, `PUT files/*` trả `507` khi `Content-Length` không vừa, `evictUnderDiskPressure` đuổi artifact cũ.
- Sổ sha256 nội bộ `.uploads.jsonl` — dotfile cạnh payload, bị lọc khỏi mọi danh sách file.
- Môi trường Supabase self-host (`compose.supabase.yaml`): Postgres + PostgREST + gateway, không có Auth/Storage/Realtime.
- `scripts/db-migrate.ts` — sổ `schema_migrations` kèm checksum, có dry-run.

### Removed

- `packageWorkDirToZip` khỏi pipeline worker. Worker không nén nữa; nén là việc của API và chỉ xảy ra khi client xin nhiều file.

---

## 2026-08-07

### Added

- Monorepo pnpm: `apps/api`, `apps/worker`, `packages/contracts`.
- Schema Supabase ban đầu: 5 bảng (`apps`, `workers`, `jobs`, `job_events`, `artifacts`), index, trigger `updated_at`, RLS thu hồi mọi quyền của `anon`/`authenticated`.
- Hàm `claim_job(worker_id, lease_seconds)` dùng `FOR UPDATE SKIP LOCKED` — hai worker gọi cùng lúc không lấy trùng job.
- Cơ chế lease 120 giây + heartbeat 20 giây. Worker chết thì lease hết hạn và worker khác claim lại.
- Hai mặt phẳng token, so sánh constant-time sau khi hash SHA-256.
- Link tải ký HMAC, TTL mặc định 600 giây.
- Docker Compose với overlay tách theo môi trường: `compose.kvm.yaml`, `compose.supabase.yaml`. Caddy nằm sau profile `production`.
- Image worker: JDK 17 + Android SDK + system image `android-35;google_apis_playstore;x86_64` + Xvfb/openbox/x11vnc/noVNC + supervisor.
- Hướng dẫn deploy.

### Removed

- **BREAKING — bỏ dashboard.** Bản scaffold ban đầu (`c3851ab`) có dashboard với auth và database riêng. Tái kiến trúc thành backend thuần: không giao diện, không bảng tài khoản, người gọi là hệ thống khác.

---

## Nợ chưa trả

Không phải mục changelog, nhưng ai đọc file này nên biết:

- `pnpm test:endpoints` và `pnpm download:artifacts` **đang hỏng** (xem 2026-08-10).
- `deploy/.env.api.example` thiếu 5 biến code đang đọc.
- CI test trên Node 20, image API chạy Node 22.
- `apps.artifact_size_bytes` là cột chết — không code nào ghi vào.
- `workers.status = 'draining'` khai trong schema nhưng không code nào dùng.
- `artifacts.state = 'deleted'` tương tự.

Chi tiết và thứ tự xử lý ở [plan.md](plan.md).
