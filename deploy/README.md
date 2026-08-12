# Vận hành AppRelay trên máy dev (Docker Desktop / Windows)

Tài liệu thao tác hằng ngày **cho máy dev này**. Phần kiến trúc và lý do thiết
kế nằm ở [`../new_setup/vps_deploy.md`](../new_setup/vps_deploy.md).

> **Deploy lên VPS thì đọc [`../docs/deploy-vps.md`](../docs/deploy-vps.md)**, không
> phải file này. Đường đó tự chứa: một lệnh `./bootstrap.sh` lo từ sinh secret,
> Postgres self-host, tới Caddy TLS. Máy dev ở đây dựng tay và dùng cloudflared,
> khác hẳn.

> **Bản trước của file này mô tả một distro WSL `Ubuntu-24.04`. Distro đó đã bị
> xoá ngày 2026-08-12.** Engine thật là **Docker Desktop** trên Windows — nó giữ
> image `app-relay-worker` và cả ba volume, gồm `deploy_worker-avd` chứa phiên
> đăng nhập CH Play. Một distro WSL cài `docker` riêng là **engine khác**, có
> image và volume riêng; đừng nhầm hai chỗ đó với nhau.

Thư mục làm việc cho mọi lệnh dưới đây (PowerShell hoặc Git Bash trên Windows):

```bash
cd d:/super-tools/app-relay/deploy
```

`deploy/.env` đã có sẵn `COMPOSE_FILE=compose.yml;compose.kvm.yaml`, nên **không
cần cờ `-f`** — cứ `docker compose ...` là đúng bộ overlay.

> **Dấu phân cách trong `COMPOSE_FILE` theo hệ điều hành chạy docker CLI**, không
> theo container: `;` khi gọi từ Windows, `:` khi gọi từ trong WSL/Linux. Đặt sai
> thì compose đi tìm một file tên `compose.yml;compose.kvm.yaml` rồi chết ở
> `stat`, thông báo lỗi không hề gợi ý gì tới dấu phân cách.

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

Dùng bản có `autoconnect=true`. Nếu mở `vnc.html` trần, noVNC dừng ở màn hình
chờ và **phải bấm nút Connect** — không bấm thì không có phiên nào được mở và
màn hình trông như chưa có emulator nào chạy.

Cổng 6080 chỉ có người nghe khi `WORKER_GUI=on`. Đang để `off` thì trang này bị
**từ chối kết nối** — đó là đúng, không phải hỏng; xem mục 6.

Desktop ảo là 1080x1920, cửa sổ emulator khoảng 413x939 nằm góc trên-trái. Thấy
khung emulator nhỏ trên nền desktop xám là đúng, không phải lỗi.

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
docker exec deploy-worker-1 bash -c 'tail -f /tmp/worker-node-stdout*.log'
docker exec deploy-worker-1 bash -c 'tail -30 /tmp/worker-node-stderr*.log'
docker exec deploy-worker-1 bash -c 'tail -30 /tmp/x11vnc-stderr*.log'
```

### Thao tác với emulator

```bash
docker exec deploy-worker-1 adb devices
docker exec deploy-worker-1 adb shell getprop sys.boot_completed   # 1 = boot xong
docker exec deploy-worker-1 kvm-ok                                 # xác nhận tăng tốc KVM

# Chụp màn hình Android ra file trên Windows
docker exec deploy-worker-1 adb exec-out screencap -p > screen.png
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

Endpoint public đầy đủ:

| Method | Path |
|---|---|
| GET | `/v1/health` (không auth) |
| GET | `/v1/system/status` |
| POST | `/v1/jobs` · `/v1/jobs/batch` |
| GET | `/v1/jobs` · `/v1/jobs/:jobId` · `/v1/jobs/:jobId/events` |
| POST | `/v1/jobs/:jobId/cancel` · `/v1/jobs/:jobId/retry` |
| POST | `/v1/jobs/:jobId/artifact/download-url` |
| GET | `/v1/apps` · `/v1/apps/:packageId` |
| GET | `/v1/artifacts/:artifactId/download` (xác thực bằng chữ ký trên URL) |

`/internal/v1/*` dành riêng cho worker, dùng `WORKER_TOKEN`, không gọi từ ngoài.

Đặc tả chi tiết: [`../new_setup/api-endpoint.md`](../new_setup/api-endpoint.md).

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
- `COMPOSE_FILE` dùng `;` khi gõ lệnh từ Windows, `:` khi gõ từ trong WSL/Linux.
  Xem cảnh báo ở đầu file.
- **`KVM_GID` là gid của `/dev/kvm` trong VM chạy docker engine, KHÔNG phải gid
  trên host.** Đây là chỗ sai kinh điển: `getent group kvm` trên Windows không có
  nghĩa gì, còn chạy nó trong một distro WSL khác sẽ ra số của distro đó. Lấy
  đúng số bằng cách hỏi thẳng engine đang dùng:

  ```bash
  docker run --rm --privileged alpine stat -c %g /dev/kvm
  ```

  Trên Docker Desktop của máy này ra **991**. Mặc định trong `compose.kvm.yaml`
  là 108 (hợp với Ubuntu server thường). Sai gid thì container không mở được
  `/dev/kvm` và emulator **âm thầm** tụt về chạy phần mềm — không có lỗi nào báo
  ra, chỉ là chậm gấp hàng chục lần.

`EMULATOR_ACCEL` không đặt trong `.env.worker`; `compose.kvm.yaml` đã set `"on"`.

---

## 5. Dữ liệu và cảnh báo xóa

| Dữ liệu | Vị trí |
|---|---|
| AVD `chpay` + phiên đăng nhập Google Play | volume `worker-avd` |
| APK worker đang xử lý | volume `worker-work` |
| ZIP chờ tải về | volume `api-artifacts` |
| Job metadata | Supabase (project `ftpimnpjjmdumfjchegl`) |
| JDK, Android SDK, system image | nằm trong worker image (~8 GB) |

```bash
# TUYỆT ĐỐI KHÔNG chạy — cờ -v xóa volume, mất AVD và phiên đăng nhập CH Play
docker compose ... down -v
```

`docker compose down` (không có `-v`) thì an toàn: volume giữ nguyên.

Đăng nhập CH Play chỉ cần làm **một lần**. Sau đó đóng trình duyệt, restart
container đều được, tài khoản vẫn còn trong `worker-avd`.

### Mang phiên đăng nhập sang máy khác (seed AVD)

Volume `worker-avd` không đi theo image, nên deploy sang máy mới mặc định là
phải đăng nhập CH Play lại. Muốn khỏi: chụp AVD đã đăng nhập thành *seed* rồi
nướng vào image.

```bash
# Trên máy ĐÃ đăng nhập. Script tự tắt emulator sạch rồi bật lại.
./capture-avd-seed.sh          # → avd-seed/avd-seed.tar.gz (~2.5 GB)

docker compose build worker    # nướng seed vào image
docker compose push worker     # registry PHẢI để private, xem cảnh báo dưới
```

Máy mới chỉ cần `docker compose pull` rồi `up -d`: `create-avd.sh` thấy seed thì
bung ra thay vì tạo AVD trắng, Play Store vào thẳng không hỏi mật khẩu.

> **TUYỆT ĐỐI KHÔNG `docker compose build` ở máy đích.** `avd-seed/` bị
> `.gitignore` chặn (2.5 GB, chứa credential Google), và máy đích chỉ nhận
> `deploy/` + `supabase/migrations/` qua `scp` — không có seed ở đó. Build ở đó
> ra image **không có seed**, `create-avd.sh` rơi về nhánh tạo AVD trắng, và bạn
> phải đăng nhập CH Play lại — không có lỗi nào báo ra, chỉ là màn hình đăng
> nhập hiện lên như máy mới tinh.
>
> Vì vậy `bootstrap.sh` trên VPS phải chạy kèm **`--no-build`**.
>
> Hệ quả: worker image **phải** build từ máy đang giữ seed, rồi `push`. Đây cũng
> là lý do job build worker đã **bị gỡ hẳn khỏi CI** — CI checkout từ git nên
> không bao giờ có file đó, và đẩy lên `latest` là ghi đè mất bản dùng thật.

| | |
|---|---|
| Không muốn dùng seed, tạo AVD trắng | `AVD_SEED_DISABLE=1` trong `.env.worker` |
| Đổi tài khoản | Đăng nhập lại qua noVNC → chạy lại `capture-avd-seed.sh` → build lại |
| Seed nằm ở đâu trong image | `/opt/avd-seed/avd-seed.tar.gz` |

**Ba điều dễ mất tiền:**

1. **Image chứa thông tin đăng nhập Google.** Ai `docker pull` được là vào được
   tài khoản. Repo Docker Hub phải private. `.gitignore` đã chặn seed khỏi git.
2. **Không chạy hai bản clone cùng lúc.** Clone giữ nguyên `android_id` và GSF
   ID → Google coi là *một* thiết bị ở hai nơi, huỷ phiên một bên rồi bắt xác
   minh lại. Seed để **chuyển máy**, không phải để nhân bản đội worker; nhiều
   worker thì mỗi con một tài khoản và một seed riêng.
3. **Không phải vĩnh viễn.** Token vẫn bị Google thử thách lại sau vài tuần đến
   vài tháng, nhanh hơn nếu đổi IP sang quốc gia khác. Giữ `WORKER_GUI=on` để
   còn đường vào noVNC xử lý tay khi bị hỏi.

Đã kiểm chứng end-to-end trên volume trắng: Android boot sau ~385s, tài khoản
và `android_id` giữ nguyên, `sdcard.img` dựng lại đúng 2.0 GB. Thư mục AVD ở máy
mới còn **4.9 GB** thay vì 15 GB như trước, nhờ bỏ `-c` và không mang sdcard
theo seed.

Kích thước seed 2.4 GB gần như toàn bộ là `userdata-qemu.img.qcow2`. Android
mã hoá partition đó (FBE) nên dữ liệu đã ngẫu nhiên — nén thêm không ăn (đo
thật: 300 MB → 310 MB, gzip làm *phình*). Đừng mất thời gian tối ưu chỗ này.

Ảnh hưởng lên kích thước image worker, đo sau khi build thật:

| | Trước | Sau |
|---|---|---|
| Phải push/pull qua registry | 2.97 GB | **5.51 GB** |
| Chiếm trên đĩa máy local | 7.95 GB | 13 GB |

Hai con số chênh nhau vì containerd giữ cả blob nén lẫn bản đã bung. Cái quyết
định thời gian `push`/`pull` là dòng trên, không phải `docker images` cột đầu.

---

## 6. Xử lý sự cố

**Emulator chết ngay khi khởi động: `Running multiple emulators with the same
AVD is an experimental feature`.** Không phải có hai emulator thật. Đây là **file
khoá còn sót** từ lần container bị kill cứng (máy sập, WSL tự tắt, `docker kill`,
watchtower restart). Kiểm tra chắc chắn không còn tiến trình nào rồi xoá khoá:

```bash
docker exec deploy-worker-1 bash -c 'pgrep -a qemu-system || echo KHONG-CO'
docker exec deploy-worker-1 bash -c 'rm -f /home/worker/.android/avd/chpay.avd/hardware-qemu.ini.lock /home/worker/.android/avd/chpay.avd/multiinstance.lock'
docker compose restart worker
```

Hai file đó được sinh lại lúc emulator chạy, xoá khi không có tiến trình nào là
an toàn. Đây là lý do `compose.prod.yaml` đặt `stop_grace_period: 120s` — dừng
sạch thì không sinh ra khoá mồ côi.

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
docker exec deploy-worker-1 bash -c 'grep -c "Got connection" /tmp/x11vnc-stderr*.log'
```

Ra `0` nghĩa là trình duyệt chưa từng kết nối — dùng URL có `autoconnect=true`.
Nếu đã có kết nối mà vẫn đen hình thì mới xét tới X/emulator.

**API `unhealthy` mãi.** Healthcheck phải trỏ `http://127.0.0.1:5500`, không được
dùng `localhost`: trong container `localhost` resolve `::1` trước, còn server chỉ
bind IPv4 `0.0.0.0`, nên probe nhận `ECONNREFUSED` vĩnh viễn và worker kẹt ở
`depends_on`.

**API crash-loop `native WebSocket not found`.** `@supabase/supabase-js` từ
2.112 trở lên cần Node 22+. `apps/api/Dockerfile` phải là `node:22-alpine`, dùng
`node:20-alpine` sẽ chết ngay lúc `createClient()`.

**Build worker fail ở bước verify `ldd`.** Emulator đóng gói sẵn Qt6, protobuf,
abseil trong `emulator/lib64` và chỉ resolve lúc chạy qua `LD_LIBRARY_PATH`, nên
`ldd` báo "not found" là bình thường. Bước verify chỉ được assert các thư viện
**hệ thống** (`libnss3`, `libasound`, `libEGL`...) qua `ldconfig -p`.

**Emulator chạy nhưng chậm bất thường.** Kiểm tra KVM:

```bash
docker exec deploy-worker-1 kvm-ok
docker exec deploy-worker-1 bash -c 'pgrep -a qemu-system' | grep -o '\-accel [a-z]*'
```

Phải ra `KVM acceleration can be used` và `-accel on`. Nếu không, kiểm tra
`KVM_GID` (mục 4 — lấy bằng `docker run --rm --privileged alpine stat -c %g
/dev/kvm`, **không** phải `getent group kvm` trên host) và chắc chắn
`compose.kvm.yaml` có trong `COMPOSE_FILE`.

**Container biến mất sau khi máy nghỉ một lúc.** Nếu engine là docker cài trong
một distro WSL (không phải Docker Desktop), WSL2 tự tắt distro khi không còn
phiên nào mở — container chết theo dù `restart: unless-stopped`. Triệu chứng:
mọi cổng đột nhiên `ERR_CONNECTION_REFUSED`, và `wsl -l -v` báo distro `Stopped`.
Docker Desktop không dính chuyện này.

**Worker online nhưng không nhận job.** So `WORKER_TOKEN` giữa `.env.api` và
`.env.worker`, rồi xem `docker exec deploy-worker-1 bash -c 'tail -50 /tmp/worker-node-stdout*.log'`.

---

## 7. Cấu hình đang chạy trên máy này

Đo ngày 2026-08-12.

```text
OS        Windows 11 Home 26100
Engine    Docker Desktop — Server 29.6.2 (linux/amd64), context desktop-linux
CPU/RAM   12 vCPU · 15.5 GB
KVM       /dev/kvm có trong VM của Docker Desktop, gid 991
AVD       chpay — android-35 google_apis_playstore x86_64, RAM 3072 MB, data 12G
Container deploy-api-1 · deploy-worker-1 (+ deploy-cloudflared-quick-1 khi cần)
Image     conghieudoan19/app-relay-worker 13.3 GB · app-relay-api 325 MB
Dữ liệu   %LOCALAPPDATA%\Docker\wsl\disk\docker_data.vhdx (~55 GB, dùng chung
          với mọi project khác trên máy)
```

Máy này còn chạy stack của project khác (`release-ops`, các image
`public.ecr.aws/supabase/*`). Xem [`../docs/docker.md` §3](../docs/docker.md) để
phân biệt image nào của project nào trước khi dọn đĩa.

> **Reset Docker Desktop ("Clean / Purge data") xoá sạch `docker_data.vhdx`** —
> mất cả worker image lẫn volume `deploy_worker-avd`, tức mất phiên đăng nhập CH
> Play. Lớp dự phòng cuối cùng là `avd-seed/avd-seed.tar.gz` trên ổ D (bị
> `.gitignore` chặn nên không có bản nào trên git). Đừng xoá thư mục đó khi dọn dẹp.

---

## 8. Distro WSL — chỉ dùng test trong trường hợp đặc biệt

**Đừng tự ý deploy lên đây mà không hỏi.**

Một distro WSL cài `docker` riêng là **engine hoàn toàn tách biệt** với Docker
Desktop: image riêng, volume riêng. Chạy stack ở đó nghĩa là phải build/pull lại
từ đầu và **không có** phiên đăng nhập CH Play trong `deploy_worker-avd` của
Docker Desktop.

Hai khác biệt phải nhớ nếu thật sự dùng tới:

| | Docker Desktop | Docker trong distro WSL |
|---|---|---|
| `COMPOSE_FILE` phân cách | `;` (gõ từ Windows) | `:` (gõ từ trong distro) |
| `KVM_GID` | 991 | số của distro đó — `getent group kvm \| cut -d: -f3` |
| Distro tự tắt khi idle | không | **có** — container chết theo |

Bản `Ubuntu-24.04` từng dùng để test đã bị xoá ngày 2026-08-12; mọi số liệu về
nó trong các bản trước của tài liệu này không còn đúng.
