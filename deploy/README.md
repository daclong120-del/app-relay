# Vận hành AppRelay trên WSL2 Ubuntu-24.04

Tài liệu thao tác hằng ngày **cho máy WSL này**. Phần kiến trúc và lý do thiết
kế nằm ở [`../new_setup/vps_deploy.md`](../new_setup/vps_deploy.md).

> **Deploy lên VPS thì đọc [`../docs/deploy-vps.md`](../docs/deploy-vps.md)**, không
> phải file này. Đường đó tự chứa: một lệnh `./bootstrap.sh` lo từ sinh secret,
> Postgres self-host, tới Caddy TLS. Máy WSL ở đây dựng tay và dùng cloudflared,
> khác hẳn.

Thư mục làm việc cho mọi lệnh dưới đây:

```bash
cd /mnt/d/super-tools/app-relay/deploy
```

Vì stack luôn chạy kèm KVM overlay, đặt sẵn alias cho gọn:

```bash
alias dcr='docker compose -f compose.yml -f compose.kvm.yaml'
```

Các lệnh bên dưới viết đầy đủ `-f compose.yml -f compose.kvm.yaml` để copy-paste được ngay.

---

## 1. Cổng và địa chỉ

Cả hai cổng public đều bind `127.0.0.1`, không lộ ra mạng LAN. WSL2 tự forward
`127.0.0.1` của distro sang `localhost` của Windows, nên mở thẳng trên trình
duyệt Windows là được — **không cần SSH tunnel**.

| Cổng | Dịch vụ | Truy cập từ Windows | Ghi chú |
|------|---------|---------------------|---------|
| **5500** | API (express) | `http://localhost:5500` | Bind `127.0.0.1:5500` |
| **6080** | noVNC (websockify) | `http://localhost:6080/vnc.html` | Màn hình emulator |
| 5900 | x11vnc | không publish | Chỉ trong container |
| 8554 | gRPC emulator | không publish | Chỉ trong container |
| 5554 / 5555 | adb emulator | không publish | Dùng qua `docker exec ... adb` |
| 80 / 443 | Caddy | **không chạy** | Nằm trong `profiles: [production]` |

### Mở màn hình emulator

```
http://localhost:6080/vnc.html?autoconnect=true&resize=scale
```

Dùng bản có `autoconnect=true`. Nếu mở `vnc.html` trần, noVNC dừng ở màn hình
chờ và **phải bấm nút Connect** — không bấm thì không có phiên nào được mở và
màn hình trông như chưa có emulator nào chạy.

Desktop ảo là 1080x1920, cửa sổ emulator khoảng 413x939 nằm góc trên-trái. Thấy
khung emulator nhỏ trên nền desktop xám là đúng, không phải lỗi.

---

## 2. Lệnh thường dùng

```bash
# Trạng thái
docker compose -f compose.yml -f compose.kvm.yaml ps

# Khởi động / dừng (KHÔNG bao giờ thêm -v, xem mục 5)
docker compose -f compose.yml -f compose.kvm.yaml up -d
docker compose -f compose.yml -f compose.kvm.yaml stop
docker compose -f compose.yml -f compose.kvm.yaml down

# Log
docker compose -f compose.yml -f compose.kvm.yaml logs -f api
docker compose -f compose.yml -f compose.kvm.yaml logs -f worker

# Restart một service
docker compose -f compose.yml -f compose.kvm.yaml restart worker

# Build lại sau khi sửa code
docker compose -f compose.yml -f compose.kvm.yaml build api
docker compose -f compose.yml -f compose.kvm.yaml up -d api
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

# Chụp màn hình Android ra file trên WSL
docker exec deploy-worker-1 adb exec-out screencap -p > /tmp/screen.png
```

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

Hai điểm dễ sai:

- `WORKER_TOKEN` trong `.env.api` và `.env.worker` **phải trùng nhau tuyệt đối**,
  nếu lệch thì worker nhận 403 và không bao giờ nhận job.
- `KVM_GID` trên máy này là **993** (`getent group kvm | cut -d: -f3`). Mặc định
  trong `compose.kvm.yaml` là 108 — sai gid thì container không mở được `/dev/kvm`.

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
`KVM_GID` và chắc chắn có truyền `-f compose.kvm.yaml`.

**Worker online nhưng không nhận job.** So `WORKER_TOKEN` giữa `.env.api` và
`.env.worker`, rồi xem `docker exec deploy-worker-1 bash -c 'tail -50 /tmp/worker-node-stdout*.log'`.

---

## 7. Cấu hình đang chạy trên máy này

```text
OS        Ubuntu 24.04.4 LTS (WSL2, kernel 6.18.33.2-microsoft-standard-WSL2)
CPU/RAM   12 vCPU · 15 GB
KVM       /dev/kvm có sẵn, group kvm gid 993
Docker    Engine 29.1.3 + Compose v2.40.3 (native trong distro, systemd)
AVD       chpay — android-35 google_apis_playstore x86_64, RAM 3072 MB, data 12G
Container deploy-api-1 · deploy-worker-1
```
