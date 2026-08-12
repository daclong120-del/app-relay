# Changelog

Viết cho người đọc, không copy commit message. Breaking change in đậm riêng.

Format: `Added` / `Changed` / `Fixed` / `Removed`.

---

## 2026-08-12

### Added

- **`docs/features.md` — kiểm kê "đang có gì".** Bộ tài liệu trước đây trả lời được *làm cái gì* ([requirements.md](requirements.md)), *chia thành gì* ([architecture.md](architecture.md)) và *còn thiếu gì* ([plan.md](plan.md)), nhưng không file nào trả lời **"dự án này đã có cục nào chạy được rồi?"** — muốn biết phải tự ghép từ code với năm sáu file khác nhau. File mới liệt kê 13 khối chức năng đối chiếu thẳng với code, mỗi khối một trạng thái ✅ chạy thật / 🟨 có nhưng chưa đủ / ⬜ chưa làm, kèm bảng kiểm thử đang phủ tới đâu và **bảng "chưa có" nói thẳng** (gồm cả những thứ cố ý không làm: dashboard, tài khoản người dùng). Ba khối đang 🟨: dọn dẹp tự động (ba chốt chống xoá nhầm chưa có test), container emulator (`KVM_GID` sai thì tụt về chạy phần mềm không báo lỗi), CI/CD (không build được worker image).
- `docs/checklist.md §5` thêm một dòng vào bảng đồng bộ: xong một khối chức năng hoặc một task trong plan thì phải cập nhật trạng thái ở [features.md](features.md). Thiếu dòng này thì file kiểm kê sẽ cũ đi im lặng — đúng loại "doc sai" mà §5 dựng ra để chặn.
- **`.mcp.json` — MCP `ssh` để thao tác VPS `hieu-server` ngay trong phiên làm việc.** Bốn tool `execute-command` / `upload` / `download` / `list-servers`, chặn hai lớp: whitelist regex cho lệnh được chạy, blacklist cho lệnh cấm tuyệt đối (`rm`, `compose down`, `--volumes`, mọi chuỗi chứa `TOKEN`/`SECRET`/`PASSWORD`). **`compose build` và `docker build` nằm trong blacklist** — build trên VPS là đúng cái làm mất seed CH Play, chặn ở tầng này thì không ai lỡ tay được.
- **`docs/docker.md §8` — cạm bẫy Docker Hub tự tạo repo PUBLIC.** `docker push` vào repo chưa tồn tại thì Hub tự tạo theo *Default privacy* của tài khoản, mặc định public, **không hỏi và không cảnh báo**. Với worker image (chứa seed đăng nhập Google) đây là rò rỉ tài khoản. Kèm lệnh kiểm `is_private` và lưu ý `404` có hai nghĩa: private *hoặc* chưa tồn tại.
- **`docs/deploy-vps.md §1` — hồ sơ máy đích thật (`hieu-server`).** 2 vCPU / 3.9 GB / KVM gid 108, còn chạy chung với `app-relay-dashboard`, `crawler-worker`, `watchtower`. Kèm bảng bốn tham số phải sửa sau bootstrap (`AVD_RAM_MB` 3072→2048, `WORKER_GUI` on→off, `EMULATOR_BOOT_TIMEOUT` 600→1800, `AVD_SDCARD_SIZE` 2G→512M) và cảnh báo `watchtower` restart worker sẽ để lại khoá AVD mồ côi.
- `docs/learn.md` — 5 mục mới: repo public im lặng, `KVM_GID` hỏi nhầm máy, hai engine Docker tách biệt, `COMPOSE_FILE` phân cách theo OS, MCP chết vì không bung `~`.

### Changed

- **`deploy/README.md` viết lại cho Docker Desktop.** Distro WSL `Ubuntu-24.04` mà tài liệu này mô tả **đã bị xoá ngày 2026-08-12**, trong khi engine thật giữ image và cả ba volume là Docker Desktop. Bản cũ khiến người đọc (và AI) tin rằng mất distro là mất phiên đăng nhập CH Play — không đúng. Mục 8 giữ lại phần WSL nhưng hạ xuống "chỉ dùng test trong trường hợp đặc biệt".
- `DOCKERHUB_USERNAME` trong `deploy/.env`: `daclong120` → `conghieudoan19`. Namespace cũ **không tồn tại** trên Docker Hub (API trả 404) nên mọi `docker push` đều bị từ chối — đây là lý do worker image mang seed chưa bao giờ lên được registry.
- **BREAKING — VPS không còn cần git.** Deploy chuyển hẳn sang Docker Hub. Job ④ của CI thay `git fetch` + `reset --hard <sha>` bằng `appleboy/scp-action`: chép `deploy/` và `supabase/migrations/` thẳng từ runner sang máy đích, rồi `docker login` → `compose pull` → `up -d`. VPS chỉ cần `docker` và `ssh` — bỏ được deploy key, token đọc repo, và điều kiện "thư mục deploy phải là git clone".
- **`scp` chỉ ghi đè, không xoá.** Khác `reset --hard` trước đây: file đã xoá khỏi repo vẫn nằm lại trên VPS. Đổi tên hay bỏ một file compose thì phải xoá tay ở máy đích.
- **Job ④ `docker login` trước khi pull.** Worker image chứa seed đăng nhập Google nên repo Docker Hub bắt buộc private; không login thì `compose pull` fail với `pull access denied` — thông báo rất dễ đọc nhầm thành "image không tồn tại". Thêm `DOCKERHUB_TOKEN` vào danh sách secret job ④.
- Job ④ thêm `chmod +x ./*.sh` — `scp` không giữ bit thực thi, thiếu dòng này thì `./gui.sh` trên VPS báo `Permission denied`.
- **`bootstrap.sh` trên VPS phải chạy kèm `--no-build`.** Máy đích không có `avd-seed/`, tự build worker sẽ ra image mất phiên đăng nhập CH Play, cộng ~30 phút. Tài liệu đã đổi; **default của script vẫn là build** — chưa đụng tới.
- `deploy/gui.sh` bỏ gợi ý `git pull`, đổi sang `docker compose pull worker`.

### Fixed

- **Cách lấy `KVM_GID` trong tài liệu đã sai.** `deploy/README.md` và `docs/docker.md §10` đều bảo dùng `getent group kvm` **trên host** — đó là hỏi nhầm máy. `group_add` nhận gid theo kernel chạy container, tức VM của docker engine: Docker Desktop là **991**, distro WSL ra số khác, Ubuntu server thường 108. Lấy đúng bằng `docker run --rm --privileged alpine stat -c %g /dev/kvm`. Đặt sai thì emulator **âm thầm** tụt về chạy phần mềm, không có lỗi nào báo ra.
- **`localhost` trong trình duyệt không phải `127.0.0.1`.** `deploy/README.md §1` trước đây ghi `http://localhost:5500`. Chrome phân giải `localhost` ra `::1` trước, mà cổng chỉ bind IPv4 → `ERR_CONNECTION_REFUSED`, trong khi `curl` (mặc định IPv4) vẫn chạy — rất dễ tưởng container chết. Cùng gốc với lỗi healthcheck ngày 2026-08-07 nhưng biểu hiện ở phía host. Tài liệu đổi hết sang `127.0.0.1`.
- **Dấu phân cách `COMPOSE_FILE` phụ thuộc OS chạy docker CLI** (`;` Windows, `:` Linux) — chưa từng được ghi ở đâu. Đặt sai thì compose chết ở `stat compose.yml;compose.kvm.yaml: no such file`, thông báo không gợi ý gì tới nguyên nhân. Đã ghi vào đầu `deploy/README.md`, mục 4, và bảng cạm bẫy `docs/docker.md §10`.
- `deploy/README.md §6` bổ sung ba sự cố gặp thật mà tài liệu chưa có: khoá AVD mồ côi sau `up -d --recreate` (`Running multiple emulators with the same AVD`), cổng 6080 bị từ chối khi `WORKER_GUI=off` (đúng thiết kế, không phải hỏng), và container biến mất khi distro WSL tự tắt lúc idle.

### Removed

- **Job CI build worker image.** `apps/worker/Dockerfile` có `COPY avd-seed/ /opt/avd-seed/`, mà `avd-seed/avd-seed.tar.gz` (~2.5 GB, chứa phiên đăng nhập Google Play) bị `.gitignore` chặn — CI checkout từ git nên thư mục luôn rỗng, image tạo ra mất seed, và đẩy lên `latest` là ghi đè mất bản dùng thật. **Hệ quả: sửa code trong `apps/worker/` thì pipeline không đưa lên VPS**, phải `docker compose build worker && docker push` tay từ máy giữ seed. Worker cũng không còn tag `<sha>` để rollback.

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
