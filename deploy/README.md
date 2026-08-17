# Vận hành AppRelay trên máy dev (Docker Desktop / Windows)

Tài liệu thao tác hằng ngày **cho máy dev này** — chỉ chứa thứ đặc thù của máy
này. Phần nền tảng và lý do thiết kế nằm ở [`../docs/docker.md`](../docs/docker.md)
(khái niệm, compose, volume) và [`../docs/architecture.md`](../docs/architecture.md).

> **Deploy lên VPS thì đọc [`../docs/deploy-vps.md`](../docs/deploy-vps.md)**, không
> phải file này. Đường đó tự chứa: một lệnh `./bootstrap.sh` lo từ sinh secret,
> Postgres self-host, tới Caddy TLS. Máy dev ở đây dựng tay và dùng cloudflared,
> khác hẳn.

> **Bản trước của file này mô tả một distro WSL `Ubuntu-24.04`. Distro đó đã bị
> xoá ngày 2026-08-12.** Engine thật là **Docker Desktop** trên Windows — nó giữ
> image `app-relay-worker` và cả ba volume, gồm `app-relay_worker-avd` chứa phiên
> đăng nhập CH Play. Một distro WSL cài `docker` riêng là **engine khác**, có
> image và volume riêng; đừng nhầm hai chỗ đó với nhau.

Thư mục làm việc cho mọi lệnh dưới đây (PowerShell hoặc Git Bash trên Windows):

```bash
cd d:/super-tools/app-relay/project/deploy
```

`deploy/.env` đã có sẵn `COMPOSE_FILE=compose.yml;compose.kvm.yaml;compose.tunnel.yaml`
và `COMPOSE_PROFILES=quick`, nên **không cần cờ `-f`** — cứ `docker compose ...`
là đúng bộ overlay. Dấu ở đây là `;` vì docker CLI gọi từ Windows; luật đầy đủ ở
[`../docs/docker.md` §4](../docs/docker.md).

> **`.env`, `.env.api`, `.env.worker` bị `.gitignore` chặn nên KHÔNG đi theo khi
> chép/dời thư mục repo.** Dời repo từ `app-relay/` sang `app-relay/project/`
> ngày 2026-08-17 làm mất cả ba; phải trích lại từ container đang chạy
> (`docker inspect <container> --format '{{range .Config.Env}}{{println .}}{{end}}'`).
> Container đã tắt hết rồi mới phát hiện thì mất luôn `API_TOKEN` và
> `WORKER_TOKEN`. Dời repo thì chép tay ba file đó trước.

---

## 1. Cổng và địa chỉ

Cả hai cổng public đều bind `127.0.0.1`, không lộ ra mạng LAN. Docker Desktop
publish thẳng ra `127.0.0.1` của Windows nên mở trên trình duyệt là được —
**không cần SSH tunnel**.

> **Gõ `127.0.0.1`, đừng gõ `localhost`.** Chrome phân giải `localhost` ra `::1`
> trước, mà cổng chỉ bind IPv4 — kết quả là `ERR_CONNECTION_REFUSED` trong khi
> `curl` (mặc định IPv4) vẫn chạy ngon, nên rất dễ tưởng container chết. Đo thật
> ngày 2026-08-12: `127.0.0.1:6080` trả 200, `[::1]:6080` không kết nối được.

| Cổng | Dịch vụ | Truy cập từ Windows | Ghi chú |
|------|---------|---------------------|---------|
| **5500** | API (express) | `http://127.0.0.1:5500` | Bind `127.0.0.1:5500` |
| **6080** | noVNC (websockify) | `http://127.0.0.1:6080/vnc.html` | Chỉ sống khi `WORKER_GUI=on` |
| 5900 | x11vnc | không publish | Chỉ trong container |
| 8554 | gRPC emulator | không publish | Chỉ trong container |
| 5554 / 5555 | adb emulator | không publish | Dùng qua `docker exec ... adb` |
| 80 / 443 | Caddy | **không chạy** | Nằm trong `profiles: [production]` |

### Mở màn hình emulator

```
http://127.0.0.1:6080/vnc.html?autoconnect=true&resize=scale
```

Dùng bản có `autoconnect=true` — mở `vnc.html` trần thì noVNC dừng ở màn hình chờ
bấm Connect. Cái nhìn thấy được và cách đăng nhập Play Store:
[`../docs/deploy-vps.md` §4](../docs/deploy-vps.md).

Khác biệt duy nhất của máy này: **không cần SSH tunnel** — Docker Desktop publish
thẳng ra `127.0.0.1` của Windows.

Cổng 6080 chỉ có người nghe khi `WORKER_GUI=on`. Đang để `off` thì trang này bị
**từ chối kết nối** — đó là đúng, không phải hỏng; xem mục 6.

---

## 2. Lệnh thường dùng

Không cần cờ `-f` — `COMPOSE_FILE` trong `deploy/.env` đã lo.

```bash
# Trạng thái
docker compose ps

# Khởi động / dừng (KHÔNG bao giờ thêm -v, xem mục 5)
docker compose up -d
docker compose stop
docker compose down

# Log
docker compose logs -f api
docker compose logs -f worker

# Restart một service
docker compose restart worker

# Build lại sau khi sửa code
docker compose build api
docker compose up -d api

# Bật / tắt màn hình emulator (sửa .env.worker rồi dựng lại worker)
./gui.sh on
./gui.sh off
```

`worker` có `depends_on: api condition: service_healthy` — nếu API không healthy
thì worker không bao giờ start.

### Log của emulator nằm ở đâu

`supervisord` không cấu hình `stdout_logfile`, nên `docker compose logs worker`
chỉ hiện dòng của supervisor. Output thật của emulator và worker Node nằm trong
file AUTO của supervisor bên trong container:

```bash
docker exec app-relay-worker-1 bash -c 'tail -f /tmp/worker-node-stdout*.log'
docker exec app-relay-worker-1 bash -c 'tail -30 /tmp/worker-node-stderr*.log'
docker exec app-relay-worker-1 bash -c 'tail -30 /tmp/x11vnc-stderr*.log'
```

### Thao tác với emulator

```bash
docker exec app-relay-worker-1 adb devices
docker exec app-relay-worker-1 adb shell getprop sys.boot_completed   # 1 = boot xong
docker exec app-relay-worker-1 kvm-ok                                 # xác nhận tăng tốc KVM

# Chụp màn hình Android ra file trên Windows
docker exec app-relay-worker-1 adb exec-out screencap -p > screen.png
```

`adb exec-out screencap` chạy được cả khi `WORKER_GUI=off` — nó đọc framebuffer
của guest qua adb, không liên quan gì tới X11. Đây là cách nhìn màn hình emulator
khi không có noVNC.

---

## 3. Gọi API

Token nằm ở `deploy/.env.api` (đã gitignore). Đứng trong `deploy/` lấy ra:

```bash
grep '^API_TOKEN=' .env.api
export API_TOKEN="apr_live_..."
```

Mọi endpoint `/v1/*` trừ `/v1/health` đều cần header
`Authorization: Bearer $API_TOKEN`.

```bash
# Health — endpoint duy nhất không cần auth
curl -s http://localhost:5500/v1/health

# Tình trạng hệ thống: database, số job, số worker online
curl -s -H "Authorization: Bearer $API_TOKEN" \
  http://localhost:5500/v1/system/status

# Tạo job — body dùng camelCase: playUrl (KHÔNG phải play_url)
curl -s -X POST http://localhost:5500/v1/jobs \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"playUrl":"https://play.google.com/store/apps/details?id=com.google.android.calculator"}'

# Thêm header Idempotency-Key để gọi lại không tạo job trùng
#   -H "Idempotency-Key: bat-ky-chuoi-nao"

# Theo dõi job
curl -s -H "Authorization: Bearer $API_TOKEN" http://localhost:5500/v1/jobs/<jobId>
curl -s -H "Authorization: Bearer $API_TOKEN" http://localhost:5500/v1/jobs/<jobId>/events

# Lấy link tải artifact (link có chữ ký, mặc định sống 600s)
curl -s -X POST -H "Authorization: Bearer $API_TOKEN" \
  http://localhost:5500/v1/jobs/<jobId>/artifact/download-url
```

`/internal/v1/*` dành riêng cho worker, dùng `WORKER_TOKEN`, không gọi từ ngoài.

Danh sách đầy đủ 23 endpoint, mã lỗi và selector:
[`../docs/api-design.md`](../docs/api-design.md). Kịch bản gọi thật:
[`../docs/api-prototype.md`](../docs/api-prototype.md).

---

## 4. File cấu hình

| File | Nội dung | Trong git? |
|---|---|---|
| `deploy/.env` | `DOCKERHUB_USERNAME`, `IMAGE_TAG`, `KVM_GID` | Không |
| `deploy/.env.api` | `API_TOKEN`, `WORKER_TOKEN`, Supabase, artifact | Không |
| `deploy/.env.worker` | `WORKER_ID`, `WORKER_TOKEN`, đường dẫn SDK, `AVD_*` | Không |

Ba điểm dễ sai:

- `WORKER_TOKEN` trong `.env.api` và `.env.worker` **phải trùng nhau tuyệt đối**,
  nếu lệch thì worker nhận 403 và không bao giờ nhận job.
- `COMPOSE_FILE` dùng `;` khi gõ lệnh từ Windows — xem đầu file.
- **`KVM_GID` trên máy này là `991`.** Đó là gid của `/dev/kvm` **trong VM của
  Docker Desktop**, không phải trên host — lấy bằng
  `docker run --rm --privileged alpine stat -c %g /dev/kvm`, tuyệt đối không phải
  `getent group kvm`. Vì sao hỏi sai máy là sai, và vì sao sai thì **im lặng**:
  [`../docs/docker.md` §10](../docs/docker.md).

`EMULATOR_ACCEL` không đặt trong `.env.worker`; `compose.kvm.yaml` đã set `"on"`.

---

## 5. Dữ liệu và cảnh báo xóa

Bảng chủ "thứ gì trong image, thứ gì trong volume, mất khi nào":
[`../docs/docker.md` §6](../docs/docker.md). Riêng máy này: job metadata nằm trên
Supabase project `ftpimnpjjmdumfjchegl`, không phải Postgres self-host.

```bash
# TUYỆT ĐỐI KHÔNG chạy — cờ -v xóa volume, mất AVD và phiên đăng nhập CH Play
docker compose ... down -v
```

`docker compose down` (không có `-v`) thì an toàn: volume giữ nguyên.

### Mang phiên đăng nhập sang máy khác (seed AVD)

**Máy này là máy giữ `avd-seed/`** — nó là nơi duy nhất build được worker image
có phiên đăng nhập CH Play. Mọi máy khác chỉ `pull`.

```bash
./capture-avd-seed.sh          # chụp seed từ AVD đã đăng nhập
docker compose build worker    # nướng seed vào image
docker compose push worker     # repo PHẢI private — image chứa credential Google
```

Toàn bộ cơ chế seed — cách chụp, vì sao `--no-build` là bắt buộc ở máy đích, vì
sao CI không build worker, bốn chế độ hỏng, và ba điều dễ mất tiền — nằm ở
[`../docs/avd-seed.md`](../docs/avd-seed.md).

> Đừng xoá `avd-seed/avd-seed.tar.gz` trên ổ D khi dọn dẹp. Nó bị `.gitignore`
> chặn nên **không có bản nào trên git**, và là lớp dự phòng cuối cùng nếu
> Docker Desktop mất volume — xem mục 7.

---

## 6. Xử lý sự cố

> Chỉ những thứ **đặc thù máy này**. Bảng sự cố đầy đủ và cây chẩn đoán:
> [`../docs/runbook.md`](../docs/runbook.md). Cạm bẫy Docker:
> [`../docs/docker.md` §10](../docs/docker.md).

**Emulator chết ngay: `Running multiple emulators with the same AVD`.** Không phải
có hai emulator thật — là **file khoá còn sót** sau lần container bị kill cứng
(máy sập, WSL tự tắt, `docker kill`, watchtower restart). Cách xoá lock an toàn,
kèm cảnh báo không được đụng `userdata-qemu.img*`:
[`../docs/runbook.md` §6](../docs/runbook.md). Đây cũng là lý do
`compose.prod.yaml` đặt `stop_grace_period: 120s` — dừng sạch thì không sinh ra
khoá mồ côi.

**Mở `127.0.0.1:6080` bị từ chối kết nối.** Hai khả năng, phân biệt bằng
`WORKER_GUI`:

| `WORKER_GUI` | Ý nghĩa |
|---|---|
| `off` | **Đúng như thiết kế** — `openbox`/`x11vnc`/`websockify` không khởi động. Port mapping vẫn còn nhưng không có ai nghe. Muốn xem màn hình thì `./gui.sh on` |
| `on` | Mới là hỏng thật — xem tiếp phần dưới |

Nếu gõ `localhost` thay vì `127.0.0.1` thì lại là chuyện khác hẳn, xem mục 1.

**Mở noVNC nhưng không thấy emulator đâu.** Gần như luôn là chưa bấm Connect.
Kiểm tra xem đã từng có phiên VNC nào chưa:

```bash
docker exec app-relay-worker-1 bash -c 'grep -c "Got connection" /tmp/x11vnc-stderr*.log'
```

Ra `0` nghĩa là trình duyệt chưa từng kết nối — dùng URL có `autoconnect=true`.
Nếu đã có kết nối mà vẫn đen hình thì mới xét tới X/emulator.

**API `unhealthy` mãi** hoặc **API crash-loop.** Ba nguyên nhân hay gặp
(healthcheck dùng `localhost` → `::1`; image chạy Node 20 mà `supabase-js` cần
Node 22; thiếu biến bắt buộc trong `.env.api`) đều ở
[`../docs/runbook.md` §4](../docs/runbook.md).

**Build worker fail ở bước verify `ldd`.** Emulator đóng gói sẵn Qt6, protobuf,
abseil trong `emulator/lib64` và chỉ resolve lúc chạy qua `LD_LIBRARY_PATH`, nên
`ldd` báo "not found" là bình thường. Bước verify chỉ được assert các thư viện
**hệ thống** (`libnss3`, `libasound`, `libEGL`...) qua `ldconfig -p`.

**Emulator chạy nhưng chậm bất thường.** Kiểm tra KVM:

```bash
docker exec app-relay-worker-1 kvm-ok
docker exec app-relay-worker-1 bash -c 'pgrep -a qemu-system' | grep -o '\-accel [a-z]*'
```

Phải ra `KVM acceleration can be used` và `-accel on`. Nếu không thì `KVM_GID`
sai (mục 4) hoặc `compose.kvm.yaml` không có trong `COMPOSE_FILE`.

**Container biến mất sau khi máy nghỉ một lúc.** Chỉ xảy ra nếu engine là docker
cài trong một distro WSL — **Docker Desktop không dính chuyện này**. Triệu chứng
và cách giữ distro sống: [`../docs/runbook.md` §3](../docs/runbook.md).

**Worker online nhưng không nhận job.** So `WORKER_TOKEN` giữa `.env.api` và
`.env.worker`, rồi xem `docker exec app-relay-worker-1 bash -c 'tail -50 /tmp/worker-node-stdout*.log'`.

---

## 7. Cấu hình đang chạy trên máy này

Đo ngày 2026-08-12.

```text
OS        Windows 11 Home 26100
Engine    Docker Desktop — Server 29.6.2 (linux/amd64), context desktop-linux
CPU/RAM   12 vCPU · 15.5 GB
KVM       /dev/kvm KHÔNG có trong VM của Docker Desktop (đo 2026-08-17) — worker
          không khởi động được, `up -d` báo "no such file or directory".
          CPU có vmx. Bật lại bằng ./enable-kvm.ps1. Khi có, gid là 991.
AVD       chpay — android-35 google_apis_playstore x86_64, RAM 3072 MB, data 12G
Container app-relay-api-1 · app-relay-worker-1 (+ app-relay-cloudflared-quick-1 khi cần)
Image     conghieudoan19/app-relay-worker 13.3 GB · app-relay-api 325 MB
Dữ liệu   %LOCALAPPDATA%\Docker\wsl\disk\docker_data.vhdx (~55 GB, dùng chung
          với mọi project khác trên máy)
```

Máy này còn chạy stack của project khác (`release-ops`, các image
`public.ecr.aws/supabase/*`). Xem [`../docs/docker.md` §3](../docs/docker.md) để
phân biệt image nào của project nào trước khi dọn đĩa.

> **Reset Docker Desktop ("Clean / Purge data") xoá sạch `docker_data.vhdx`** —
> mất cả worker image lẫn volume `app-relay_worker-avd`, tức mất phiên đăng nhập CH
> Play. Lớp dự phòng cuối cùng là `avd-seed/avd-seed.tar.gz` trên ổ D (bị
> `.gitignore` chặn nên không có bản nào trên git). Đừng xoá thư mục đó khi dọn dẹp.

---

## 8. Distro WSL — chỉ dùng test trong trường hợp đặc biệt

**Đừng tự ý deploy lên đây mà không hỏi.**

Một distro WSL cài `docker` riêng là **engine hoàn toàn tách biệt** với Docker
Desktop: image riêng, volume riêng. Chạy stack ở đó nghĩa là phải build/pull lại
từ đầu và **không có** phiên đăng nhập CH Play trong `app-relay_worker-avd` của
Docker Desktop.

Hai khác biệt phải nhớ nếu thật sự dùng tới:

| | Docker Desktop | Docker trong distro WSL |
|---|---|---|
| `COMPOSE_FILE` phân cách | `;` (gõ từ Windows) | `:` (gõ từ trong distro) |
| `KVM_GID` | 991 | số của distro đó — `getent group kvm \| cut -d: -f3` |
| Distro tự tắt khi idle | không | **có** — container chết theo |

Bản `Ubuntu-24.04` từng dùng để test đã bị xoá ngày 2026-08-12; mọi số liệu về
nó trong các bản trước của tài liệu này không còn đúng.
