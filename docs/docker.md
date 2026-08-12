# Docker trong app-relay

Tài liệu nền tảng về Docker **cho dự án này**, viết cho người chưa có nền
Docker. Đọc xong sẽ biết: dự án gồm những image nào, chúng từ đâu ra, ghép lại
chạy thế nào, dữ liệu nằm ở đâu, và dọn đĩa sao cho không mất gì.

> Đây là tài liệu **khái niệm + tra cứu**. Thao tác chi tiết nằm ở nơi khác:
> [deploy-vps.md](deploy-vps.md) (dựng VPS từ máy trắng) ·
> [`../deploy/README.md`](../deploy/README.md) (vận hành hằng ngày trên WSL) ·
> [runbook.md](runbook.md) (khi hỏng) · [CI-CD.md](CI-CD.md) (build tự động).

---

## 1. Bốn khái niệm, giải thích một lần

| Khái niệm | Là gì | Ví von | Mất khi nào |
|---|---|---|---|
| **Image** | Bản đóng gói **chỉ đọc**: hệ điều hành + phần mềm + code, đã cài sẵn | Bản cài đặt `.iso` | Chỉ mất khi `docker rmi` |
| **Container** | Một lần **chạy** của image | Máy đang bật từ đĩa cài đó | `docker rm`, hoặc `down` |
| **Volume** | Vùng đĩa **ghi được**, sống lâu hơn container | Ổ cứng rời cắm vào máy | Chỉ mất khi `down -v` hoặc `volume rm` |
| **Network** | Mạng LAN ảo để các container gọi nhau bằng **tên** | Switch nội bộ | Theo container |

Ba điều suy ra từ bảng trên, quan trọng hơn định nghĩa:

- **Container không giữ dữ liệu.** Xoá container rồi tạo lại từ cùng image thì
  mọi thứ ghi bên trong biến mất — trừ những gì nằm trong volume. Đây là lý do
  AVD và phiên đăng nhập CH Play phải nằm ở volume `worker-avd`.
- **Trong cùng network, tên service là hostname.** API gọi database bằng
  `db:5432`, cloudflared gọi API bằng `api:5500`. Không cần IP, không cần
  publish cổng ra host.
- **Publish cổng ≠ mở ra Internet.** `127.0.0.1:5500:5500` nghĩa là chỉ máy chủ
  đó gọi được. `0.0.0.0:5500:5500` mới là mở ra ngoài.

Thêm một khái niệm nữa vì dự án có dùng:

**Registry** — kho image trên mạng (ở đây là Docker Hub). `push` là đẩy image
lên, `pull` là kéo về. Nhờ nó, máy build và máy chạy không cần là một.

---

## 2. Bảy image của dự án

Chỉ **7** image này thuộc app-relay. Mọi image khác trên máy là của project khác
(xem §3).

### Tự build từ repo (2)

| Image | Dockerfile | Nền | Size trên đĩa | Chứa gì |
|---|---|---|---|---|
| `app-relay-api` | [apps/api/Dockerfile](../apps/api/Dockerfile) | `node:22-alpine` | ~325 MB | Server Express đã compile. Multi-stage: build xong vứt devDependencies và source, chỉ giữ `dist/`. Chạy bằng user thường uid 10001, không phải root |
| `app-relay-worker` | [apps/worker/Dockerfile](../apps/worker/Dockerfile) | `eclipse-temurin:17-jdk-jammy` | ~13.3 GB | JDK 17 + Android SDK + system image android-35 + emulator + Xvfb/noVNC/supervisor + seed AVD 2.5 GB |

Vì sao worker to như vậy: Android SDK và system image đã ~8 GB, cộng seed AVD
2.5 GB. Đây là bản chất, không phải build sai. Đẩy qua registry thì nhẹ hơn
(~5.5 GB) vì đó là kích thước **nén**.

> **Node 22, không phải 20.** `@supabase/supabase-js` từ 2.112 cần native
> WebSocket; chạy Node 20 là API crash ngay lúc `createClient()`.

### Kéo từ registry (5)

| Image | Vai trò | Khai báo ở |
|---|---|---|
| `postgres:16-alpine` | Database | [compose.supabase.yaml](../deploy/compose.supabase.yaml) |
| `postgrest/postgrest:v12.2.3` | Sinh REST API từ schema, giả lập `/rest/v1` của Supabase | [compose.supabase.yaml](../deploy/compose.supabase.yaml) |
| `nginx:1.27-alpine` | Gateway ghép URL cho giống Supabase Cloud | [compose.supabase.yaml](../deploy/compose.supabase.yaml) |
| `caddy:2` | Reverse proxy + tự xin chứng chỉ TLS | [compose.yml](../deploy/compose.yml) — profile `production` |
| `cloudflare/cloudflared:latest` | Đường hầm ra Internet, không cần IP public | [compose.tunnel.yaml](../deploy/compose.tunnel.yaml) |

Ba image đầu là **bản tự dựng thay cho Supabase Cloud**. Khi trỏ vào Supabase
Cloud thật thì bỏ hẳn `compose.supabase.yaml`, không cần 3 image này.

---

## 3. Máy này còn image của project khác

Một máy Docker dùng chung cho mọi project. Trên máy dev hiện tại còn stack của
**release-ops** (`d:/super-tools/release-ops`): 12 image `public.ecr.aws/supabase/*`
(~8.4 GB) do Supabase CLI tự kéo về.

**Đó không phải Supabase của app-relay.** Dấu hiệu phân biệt:

| | app-relay | release-ops |
|---|---|---|
| Nguồn Supabase | 3 image tự dựng ở §2 | Supabase CLI (`public.ecr.aws/supabase/*`) |
| Có `supabase/config.toml`? | **Không** | Có |
| Tên compose project | `deploy` | `release-ops`, `ejwqyycoycyzuxseecck` |

Cách tự kiểm tra image nào của project nào:

```bash
# Container nào thuộc project nào
docker ps -a --format "{{.Names}}\t{{.Image}}\t{{.Label \"com.docker.compose.project\"}}"

# Image mà app-relay thực sự cần (đọc thẳng từ compose)
cd deploy && docker compose -f compose.yml -f compose.kvm.yaml \
  -f compose.supabase.yaml -f compose.tunnel.yaml config --images
```

> Lệnh `config --images` **không in** `caddy` và `cloudflared` nếu chưa bật
> profile của chúng. Đừng vội kết luận là thừa.

---

## 4. Sáu file compose ghép lại thế nào

Compose cho phép chồng nhiều file: file sau **đè** lên file trước. Nhờ vậy một
bản mô tả gốc dùng được cho cả máy dev lẫn VPS.

| File | Thêm gì | Khi nào dùng |
|---|---|---|
| `compose.yml` | **Bản gốc** — 3 service: caddy, api, worker | Luôn luôn |
| `compose.kvm.yaml` | Mở `/dev/kvm` cho worker | Khi máy có KVM. **Thiếu là emulator chậm gấp nhiều lần** |
| `compose.supabase.yaml` | 3 service db + rest + supabase | Khi tự dựng database. Bỏ nếu dùng Supabase Cloud |
| `compose.tunnel.yaml` | cloudflared | Khi cần ra Internet mà không có IP public |
| `compose.http.yaml` | Đổi API sang bind `0.0.0.0`, **không TLS** | Chỉ để chạy thử |
| `compose.prod.yaml` | Xoay log, healthcheck caddy, `stop_grace_period` 120s | Máy chạy dài ngày |

Ngoài ra có **profile** — service gắn profile chỉ chạy khi được gọi tên:
`caddy` thuộc `production`, `cloudflared-quick` thuộc `quick`,
`cloudflared-named` thuộc `named`.

```bash
# Dev trên WSL: gốc + KVM
docker compose -f compose.yml -f compose.kvm.yaml up -d

# Chạy đủ, ra Internet bằng quick tunnel
docker compose -f compose.yml -f compose.kvm.yaml -f compose.supabase.yaml \
  -f compose.tunnel.yaml --profile quick up -d
```

Gõ chuỗi `-f` dài mỗi lần rất dễ sai. `bootstrap.sh` ghi sẵn vào `deploy/.env`:

```bash
COMPOSE_FILE=compose.yml:compose.kvm.yaml:compose.supabase.yaml:compose.prod.yaml
COMPOSE_PROFILES=production
```

Có hai dòng đó rồi thì chỉ cần `docker compose up -d`.

**`stop_grace_period: 120s` không phải cho đẹp.** Emulator ghi userdata 12 GB
lúc tắt; mặc định Docker chờ 10 giây rồi SIGKILL — đủ để hỏng AVD.

---

## 5. Ba con đường deploy

### A. Máy dev (WSL) — build tại chỗ

```bash
cd deploy
docker compose -f compose.yml -f compose.kvm.yaml build      # worker ~30 phút lần đầu
docker compose -f compose.yml -f compose.kvm.yaml up -d
docker compose -f compose.yml -f compose.kvm.yaml ps
```

### B. VPS lần đầu — chép cấu hình rồi một lệnh

VPS **không cần git**. Chép file cấu hình từ máy dev sang:

```bash
scp -r deploy supabase/migrations root@<IP>:/root/app-relay/
```

Rồi trên VPS:

```bash
cd /root/app-relay/deploy
./bootstrap.sh --no-build              # có domain, bật TLS
./bootstrap.sh --http-only --no-build  # chưa có domain, HTTP trần
```

Script tự sinh secret, dựng Postgres, ghi `COMPOSE_FILE`, chạy migration, bật
stack. Chi tiết: [deploy-vps.md](deploy-vps.md).

> **`--no-build` không phải tuỳ chọn cho nhanh.** Bỏ nó ra thì VPS tự build
> worker image, mà máy đích không có `avd-seed/` → image không seed → mất phiên
> đăng nhập CH Play, cộng ~30 phút build. Để VPS **kéo** image có seed từ
> Docker Hub.

### C. CI/CD — Docker Hub là đường giao hàng

Mỗi lần `push`, job `build-and-push` trong [ci.yml](../.github/workflows/ci.yml)
build **image API** và gắn 2 tag: `latest` và `<git sha>`. Job ④ `scp` thư mục
`deploy/` + `supabase/migrations/` sang VPS, rồi `docker login`, `pull`, `up -d`.

Tag `<git sha>` là đường lùi khi bản mới hỏng:

```bash
IMAGE_TAG=<sha-cũ> docker compose up -d
```

> **Worker image không nằm trong pipeline.** Seed AVD 2.5 GB bị `.gitignore`
> chặn, mà CI checkout từ git nên không bao giờ có file đó. Image CI tạo ra vẫn
> chạy nhưng **mất phiên đăng nhập CH Play**, và triệu chứng chỉ là màn hình
> đăng nhập hiện lên như máy mới. Nên job build worker đã **bị gỡ khỏi CI**.
>
> Sửa code trong `apps/worker/` thì phải build và push tay từ máy giữ seed:
>
> ```bash
> docker compose build worker
> docker push <user>/app-relay-worker:latest
> ```
>
> Rollback worker cũng không có tag `<sha>` — muốn lùi được thì tự gắn tag ngày
> tháng lúc push.

---

## 6. Dữ liệu nằm ở đâu

| Volume | Chứa | Mất thì sao |
|---|---|---|
| `worker-avd` | AVD + **phiên đăng nhập Google Play** | Phải đăng nhập CH Play lại bằng tay qua noVNC |
| `worker-work` | APK đang xử lý | Không sao, job chạy lại |
| `api-artifacts` | ZIP chờ tải về | Mất link tải chưa dùng |
| `supabase-db` | Toàn bộ database | **Mất sạch job, app, artifact metadata** |
| `caddy-data` | Chứng chỉ TLS | Caddy xin lại, nhưng dễ đụng rate limit của Let's Encrypt |

```bash
docker compose down      # AN TOÀN — volume giữ nguyên
docker compose down -v   # ⛔ XOÁ SẠCH VOLUME
```

**`-v` là cờ nguy hiểm nhất trong tài liệu này.** Không có xác nhận, không có
thùng rác, không lùi lại được.

Phân biệt cái gì nằm ở đâu:

| Trong **image** (rebuild là có lại) | Trong **volume** (mất là mất thật) |
|---|---|
| JDK, Android SDK, system image | AVD đang chạy, phiên đăng nhập Google |
| Code đã compile | Database |
| Seed AVD (bản gốc) | Artifact chờ tải |

---

## 7. Lệnh hằng ngày

Đứng trong `deploy/`. Nếu `.env` đã có `COMPOSE_FILE` thì bỏ phần `-f ...`.

```bash
# Xem trạng thái — cột STATUS phải là "healthy", không chỉ "running"
docker compose ps

# Log
docker compose logs -f api
docker compose logs --tail 100 worker

# Bật / tắt / khởi động lại
docker compose up -d
docker compose stop
docker compose restart worker

# Sửa code xong
docker compose build api && docker compose up -d api

# Chui vào trong container
docker exec -it deploy-api-1 sh
docker exec deploy-worker-1 adb devices

# Đĩa đang dùng bao nhiêu
docker system df
```

**Log của emulator không nằm trong `docker compose logs`.** `supervisord` ghi ra
file bên trong container:

```bash
docker exec deploy-worker-1 bash -c 'tail -f /tmp/worker-node-stdout*.log'
```

---

## 8. Tên image, tag và registry

Một tên image đầy đủ có 3 phần:

```
conghieudoan19 / app-relay-worker : latest
└─ namespace ─┘ └── tên repo ───┘  └ tag ┘
```

- **namespace** = username Docker Hub. Đẩy lên được thì namespace **phải khớp
  tài khoản đang đăng nhập**.
- **tag** = phiên bản. `latest` chỉ là một cái tên quy ước, không tự động là
  bản mới nhất.

Compose lấy namespace từ biến môi trường:

```yaml
image: ${DOCKERHUB_USERNAME:-apprelay}/app-relay-api:${IMAGE_TAG:-latest}
```

`:-apprelay` là giá trị mặc định khi biến trống. Cần đặt `DOCKERHUB_USERNAME`
trong `deploy/.env` và trong GitHub Secrets.

```bash
docker login                                          # đăng nhập
docker tag app-relay-api:latest <user>/app-relay-api:latest
docker push <user>/app-relay-api:latest
```

> **Repo Docker Hub phải để PRIVATE.** Worker image chứa seed AVD, tức là chứa
> phiên đăng nhập Google. Ai `pull` được là vào được tài khoản đó.

### Cạm bẫy: push vào repo chưa tồn tại thì Docker Hub tự tạo nó PUBLIC

Đây là chỗ nguy hiểm nhất trong cả tài liệu này, và nó **im lặng**.

`docker push user/repo:tag` khi `repo` chưa tồn tại thì Docker Hub tự tạo repo
theo **Default privacy** của tài khoản — mặc định là *public*. Không có câu hỏi
xác nhận, không có cảnh báo; lệnh chạy trơn tru và in `Pushed` như bình thường.

Với `app-relay-api` thì chỉ là khó chịu. Với `app-relay-worker` thì đó là
**đăng phiên đăng nhập Google của bạn lên Internet**.

Kiểm tra trước khi push, và kiểm tra lại sau:

```bash
# 404 = private hoặc chưa tồn tại (an toàn để push tiếp)
# 200 = ĐANG PUBLIC — dừng lại
curl -s -o /dev/null -w "%{http_code}\n" \
  https://hub.docker.com/v2/repositories/<user>/app-relay-worker/
```

Cách chắc chắn: vào `hub.docker.com` → **Create repository** → chọn **Private**
*trước khi* push lần đầu. Và đặt Account settings → **Default privacy** →
Private để khỏi phụ thuộc vào trí nhớ.

Xoá repo public đi sau đó **không thu hồi được** thứ đã bị pull hoặc index.

**Trạng thái (đo 2026-08-12):** đã sửa. Namespace `daclong120` xác nhận **không
tồn tại** (Docker Hub API trả 404), `conghieudoan19` có thật. Image trên máy dev
đã được gắn lại tag `conghieudoan19/...` và `DOCKERHUB_USERNAME` trong
`deploy/.env` đã đổi theo. Hai tag cùng trỏ một image ID nên không tốn thêm đĩa.

---

## 9. Dọn đĩa mà không mất gì

Xếp theo thứ tự **an toàn giảm dần**:

```bash
# 1. Build cache không dùng tới — thường là món to nhất, không đụng image nào
docker builder prune

# 2. Image không có tag (rác sinh ra sau mỗi lần build lại)
docker image prune

# 3. Container đã dừng
docker container prune
```

Trước khi xoá một image cụ thể, kiểm tra có ai dùng không:

```bash
docker ps -a --filter "ancestor=<tên image>" -q | wc -l   # ra 0 mới xoá
```

⛔ **Không dùng `docker system prune -a`** trên máy này. Nó xoá **mọi** image
không có container đang chạy — kể cả worker image 13.3 GB phải build lại 30
phút, và mọi thứ của project khác trên cùng máy.

---

## 10. Sáu cạm bẫy đã gặp thật

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| API `unhealthy` mãi, worker không bao giờ start | Healthcheck dùng `localhost` → resolve `::1`, mà server chỉ bind IPv4 | Dùng `127.0.0.1` trong healthcheck |
| Emulator chạy nhưng chậm bất thường | Thiếu `compose.kvm.yaml`, hoặc `KVM_GID` sai | `docker exec deploy-worker-1 kvm-ok`. Lấy gid đúng: `docker run --rm --privileged alpine stat -c %g /dev/kvm` — xem dòng dưới bảng |
| `docker compose` chết ở `stat compose.yml;compose.kvm.yaml: no such file` | Dấu phân cách `COMPOSE_FILE` sai hệ điều hành | `;` khi gõ từ Windows, `:` khi gõ từ WSL/Linux |
| Emulator chết ngay: `Running multiple emulators with the same AVD` | File khoá mồ côi sau khi container bị kill cứng | Xác nhận `pgrep -a qemu-system` rỗng rồi xoá `chpay.avd/hardware-qemu.ini.lock` và `multiinstance.lock` |
| Trình duyệt `ERR_CONNECTION_REFUSED` mà `curl` vẫn chạy | Trình duyệt phân giải `localhost` → `::1`, cổng chỉ bind IPv4 | Gõ `127.0.0.1` thay vì `localhost` |
| `docker push` xong mới biết repo đang public | Docker Hub tự tạo repo public khi repo chưa tồn tại | Tạo repo Private thủ công trước khi push — xem §8 |
| Worker online nhưng không nhận job | `WORKER_TOKEN` ở `.env.api` và `.env.worker` lệch nhau | Sửa cho trùng tuyệt đối |
| Deploy máy mới, CH Play hỏi đăng nhập lại | Build ở máy đích (quên `--no-build`), mà `avd-seed/` bị gitignore nên máy đó không có seed | Build ở máy giữ seed rồi `push`; VPS chỉ `pull` |
| `pull access denied` lúc deploy | Repo Docker Hub để private (bắt buộc, vì worker image chứa credential Google) mà VPS chưa `docker login` | `docker login` trên VPS; job ④ đã tự làm bước này |
| Sửa code worker xong, deploy xanh mà VPS không đổi gì | CI **không** build worker image nữa | Build tay ở máy giữ seed rồi `docker push` |
| Xoá một file compose khỏi repo, VPS vẫn còn | `scp` chỉ ghi đè, không xoá — khác `git reset --hard` trước đây | Xoá tay trên máy đích |
| `address already in use` cổng 5500 | Bật `compose.http.yaml` cùng lúc với Caddy | Chọn một |
| Artifact ghi lỗi `EACCES` | Volume cũ từ thời chạy root, không được chown lại | `docker compose run --rm --user root api chown -R 10001:10001 /data/artifacts` |

**Về `KVM_GID`:** đây là gid của `/dev/kvm` **trong VM chạy docker engine**,
không phải trên máy bạn đang ngồi. Docker Desktop trên Windows là 991; một distro
WSL cài docker riêng lại là số khác; Ubuntu server thường là 108 (đúng bằng mặc
định trong `compose.kvm.yaml`). Chạy `getent group kvm` trên host là hỏi nhầm
máy — nó trả về số của host chứ không phải của engine, và đặt sai thì emulator
**âm thầm** tụt về chạy phần mềm.

Danh sách đầy đủ hơn: [runbook.md](runbook.md) · [learn.md](learn.md).

---

## 11. Tra nhanh

| Câu hỏi | Lệnh |
|---|---|
| Có những image nào? | `docker images` |
| Cái gì đang chạy? | `docker compose ps` |
| Đĩa hết bao nhiêu? | `docker system df` |
| App-relay cần image nào? | `docker compose ... config --images` |
| Container này dùng image nào? | `docker inspect <container> --format '{{.Image}}'` |
| Image này ai đang dùng? | `docker ps -a --filter "ancestor=<image>"` |
| Vì sao container chết? | `docker compose logs --tail 100 <service>` |
