# Docker trong app-relay

Tài liệu nền tảng về Docker **cho dự án này**, viết cho người chưa có nền
Docker. Đọc xong sẽ biết: dự án gồm những image nào, chúng từ đâu ra, ghép lại
chạy thế nào, dữ liệu nằm ở đâu, và dọn đĩa sao cho không mất gì.

> Đây là tài liệu **khái niệm + tra cứu**. Thao tác chi tiết nằm ở nơi khác:
> [`../deploy/README.md`](../deploy/README.md) (vận hành hằng ngày trên máy dev & VPS) ·
> [emu-gui-workflow.md](emu-gui-workflow.md) (quy trình AVD/GUI) ·
> [domain-setup.md](domain-setup.md) (mở API ra Internet) ·
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
| Tên compose project | `app-relay` | `release-ops`, `ejwqyycoycyzuxseecck` |

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

### `COMPOSE_FILE` — bỏ hẳn chuỗi `-f`

Gõ chuỗi `-f` dài mỗi lần rất dễ sai. Docker Compose đọc hai biến này từ `.env`
của thư mục project, và [bootstrap.sh](../deploy/bootstrap.sh) ghi sẵn chúng:

```bash
COMPOSE_FILE=compose.yml:compose.kvm.yaml:compose.supabase.yaml:compose.prod.yaml
COMPOSE_PROFILES=production
```

Có hai dòng đó rồi thì đứng trong `deploy/` mà gõ `docker compose ps`, `logs`,
`up -d` là **tự động** đúng bộ overlay và đúng profile. Máy không có KVM thì
`compose.kvm.yaml` bị bỏ khỏi danh sách. Job ④ của CI cũng đọc đúng hai biến này
— [không có cờ nào hardcode trong pipeline](CI-CD.md).

> **Dấu phân cách theo hệ điều hành chạy docker CLI**, không theo container:
> `;` khi gõ từ Windows, `:` khi gõ từ trong WSL/Linux. Đặt sai thì compose đi
> tìm một file tên `compose.yml;compose.kvm.yaml` rồi chết ở `stat`, và thông báo
> lỗi **không hề gợi ý gì** tới dấu phân cách.

> Thêm một file vào `COMPOSE_FILE` mà **quên đặt profile** thì service của nó
> không được kích hoạt — và `docker compose up -d --remove-orphans` sẽ coi
> container đang chạy là orphan rồi **xoá nó**. Đây là cách mất tunnel âm thầm
> hay gặp nhất ([domain-setup.md](domain-setup.md)).

**`stop_grace_period: 120s` không phải cho đẹp.** Emulator ghi userdata 12 GB
lúc tắt; mặc định Docker chờ 10 giây rồi SIGKILL — đủ để hỏng AVD.

---

## 5. Ba con đường deploy

### A. Máy dev (WSL / Docker Desktop) — build tại chỗ

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
stack. Chi tiết: [`../deploy/README.md`](../deploy/README.md) · [domain-setup.md](domain-setup.md).

> **`--no-build` là bắt buộc, không phải tuỳ chọn cho nhanh** — bỏ nó ra là mất
> phiên đăng nhập CH Play. Vì sao: [avd-seed.md §4](avd-seed.md).

### C. CI/CD — Docker Hub là đường giao hàng

Mỗi lần `push`, job `build-and-push` trong [ci.yml](../.github/workflows/ci.yml)
build **image API** và gắn 2 tag: `latest` và `<git sha>`. Job ④ `scp` thư mục
`deploy/` + `supabase/migrations/` sang VPS, rồi `docker login`, `pull`, `up -d`.

Tag `<git sha>` là đường lùi khi bản mới hỏng:

```bash
IMAGE_TAG=<sha-cũ> docker compose up -d
```

> **Chỉ image API nằm trong pipeline.** Worker image phải build và push tay từ
> máy giữ `avd-seed/`, và rollback worker không có tag `<sha>`. Vì sao và làm thế
> nào: [avd-seed.md §6](avd-seed.md).

---

## 6. Dữ liệu nằm ở đâu

**Bảng chủ** — mọi file khác trỏ về đây thay vì chép lại.

Cột đầu là **key trong compose**; tên thật trên đĩa là `app-relay_<key>` vì
compose ghép tiền tố tên project vào (§8.2). `docker volume ls` in tên thật.

| Volume (key) | Chứa | Mất thì sao |
|---|---|---|
| `worker-avd` | AVD + **phiên đăng nhập Google Play** | Container tự bung lại từ seed trong image — chỉ mất trạng thái emulator tích luỹ sau lúc chụp seed. Mất **cả image lẫn seed** mới phải đăng nhập tay qua noVNC |
| `worker-work` | APK đang xử lý | Không sao, job chạy lại |
| `api-artifacts` | ZIP chờ tải về | Mất link tải chưa dùng |
| `supabase-db` | Toàn bộ database | **Mất sạch job, app, artifact metadata** — không có seed nào dựng lại được |
| `caddy-data` | Chứng chỉ TLS | Caddy xin lại, nhưng dễ đụng rate limit của Let's Encrypt |

Hai volume cuối chỉ tồn tại khi overlay tương ứng chạy: `supabase-db` cần
`compose.supabase.yaml` (bỏ khi trỏ Supabase Cloud), `caddy-data` cần profile
`production`. Không thấy chúng trong `docker volume ls` là bình thường.

```bash
docker compose down      # AN TOÀN — volume giữ nguyên
docker compose down -v   # ⛔ XOÁ SẠCH VOLUME
```

**`-v` là cờ nguy hiểm nhất trong tài liệu này.** Không có xác nhận, không có
thùng rác, không lùi lại được.

Ba nơi khác **không** phải volume, để khỏi nhầm:

| Thứ | Nằm ở đâu | Mất khi nào |
|---|---|---|
| JDK, Android SDK, emulator, system image | **trong image** | không bao giờ — build lại là có |
| Node, code đã compile | **trong image** | không bao giờ |
| Seed AVD (bản gốc) | **trong image** — `/opt/avd-seed/` | không bao giờ |
| File compose, Caddyfile, migration | **trên đĩa máy đích**, bind-mount | `rm -rf` thư mục |
| Secret (`.env*`) | **trên đĩa máy đích**, gitignore | xoá file |

Hai hệ quả đáng nhớ:

- **Đăng nhập CH Play chỉ làm một lần.** Restart container, build lại image,
  deploy phiên bản mới — đều không mất, vì phiên nằm ở volume chứ không ở image.
  Chi tiết: [avd-seed.md](avd-seed.md).
- **File cấu hình cố ý không nằm trong image.** Sửa một dòng `Caddyfile` mà phải
  build lại 13 GB thì không ai chịu nổi.

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
docker exec -it app-relay-api-1 sh
docker exec app-relay-worker-1 adb devices

# Đĩa đang dùng bao nhiêu
docker system df
```

**Log của emulator không nằm trong `docker compose logs`.** `supervisord` ghi ra
file bên trong container:

```bash
docker exec app-relay-worker-1 bash -c 'tail -f /tmp/worker-node-stdout*.log'
```

---

## 8. Ba nhóm tên và một cạm bẫy registry

### 8.1. Image — ba phần của một tên đầy đủ

Một tên image đầy đủ có 3 phần:

```text
conghieudoan19 / app-relay-worker : latest
└─ namespace ─┘ └── tên repo ───┘  └ tag ┘
```

1. **Namespace (`username`)**:
   - Lấy theo username Docker Hub được cấu hình qua biến `$DOCKERHUB_USERNAME` trong `deploy/.env` (mặc định fallback `conghieudoan19`).
   - Khi đẩy lên registry (`docker push`), namespace **phải trùng khớp chính xác** với tài khoản đang đăng nhập (`docker login`).
   - **Fallback phải là namespace mình sở hữu.** Trước 2026-08-17 fallback là
     `apprelay` — một tài khoản **có thật trên Docker Hub nhưng không phải của
     dự án**. Thiếu `deploy/.env` là compose lặng lẽ đi tìm image của người lạ.
     Kiểm tra một namespace có tồn tại không: `curl -s -o /dev/null -w "%{http_code}\n" https://hub.docker.com/v2/users/<user>/`
     (200 = có thật, 404 = không tồn tại — `daclong120` trả 404).

2. **Tên Repository cho Image nội bộ (`app-relay-<component>`)**:
   - Luôn dùng tiền tố dự án `app-relay-` kết hợp với vai trò của thành phần (theo chuẩn `kebab-case`):
     - `app-relay-api`: Web service Express REST API.
     - `app-relay-worker`: Android Emulator + Worker automation service.

3. **Image bên thứ ba (Third-party Images) — Bắt buộc Version Pinning**:
   - **Luôn ghim phiên bản cụ thể**: `postgres:16-alpine`, `postgrest/postgrest:v12.2.3`, `nginx:1.27-alpine`, `caddy:2`.
   - **Cấm dùng `:latest` cho Database và Middleware core**: Tránh lỗi phá vỡ tương thích ngầm (breaking changes) khi môi trường tự ý kéo image mới về.
   - Ngoại lệ: `cloudflare/cloudflared:latest` (daemon tunnel tự động tương thích với Cloudflare Edge).

---

### 8.2. Project, service và container — tên service là hostname

0. **Tên Project (`name:` ở đầu `compose.yml`)** — gốc của mọi tên khác:
   - Compose dán tên project vào **mọi** thứ nó sinh ra: container
     `<project>-<service>-<n>`, volume `<project>_<volume>`, network
     `<project>_<network>`. Đặt sai một chỗ này là sai cả ba.
   - **Phải khai báo tường minh `name: app-relay`.** Bỏ trống thì compose lấy
     **tên thư mục chứa file** — ở đây là `deploy/`, nên tới 2026-08-17 mọi thứ
     đều mang tên `deploy-api-1`, `deploy_worker-avd`, `deploy_app-relay`. Hai
     cái sai: `deploy` không nói lên app nào, và bất kỳ project nào khác trên
     cùng máy Docker cũng có thư mục tên `deploy` là đụng nhau.
   - **Đổi tên project = mất volume.** Compose tìm volume theo tên đã ghép tiền
     tố; đổi `deploy` → `app-relay` là nó tạo `app-relay_worker-avd` **rỗng**
     chứ không nhận `deploy_worker-avd` cũ. Không có cảnh báo nào. Với worker
     thì không chết vì seed nằm trong image và `create-avd.sh` tự bung lại
     ([avd-seed.md](avd-seed.md)); với `supabase-db` thì là mất sạch database.

1. **Tên Service trong Compose (`services:`)**:
   - Dùng danh từ ngắn gọn, chữ thường viết liền hoặc `kebab-case`: `api`, `worker`, `db`, `rest`, `supabase`, `caddy`, `cloudflared-quick`, `cloudflared-named`.
   - **Tên Service là Hostname nội bộ (Internal DNS)**: Trong Docker network `app-relay_internal`, các container tìm thấy nhau qua tên service (ví dụ `http://api:5500`, `postgres://...@db:5432/...`, `http://rest:3000`). Không cần gán IP, không cần mở cổng ra máy chủ host.

2. **Tên Network — key mô tả vai trò, không lặp tên project**:
   - Key trong compose là `internal`, tên đầy đủ Docker sinh ra là
     `app-relay_internal`. Đặt key là `app-relay` (như trước 2026-08-17) thì ra
     `app-relay_app-relay` — tên project đã lo phần định danh rồi, key chỉ cần
     nói mạng đó **để làm gì**.

3. **Tên Container (Container Naming)**:
   - Compose tự động sinh tên container theo công thức: `<project_name>-<service_name>-<instance_number>` → `app-relay-api-1`, `app-relay-worker-1`, `app-relay-db-1`, `app-relay-rest-1`.
   - **Quy tắc: KHÔNG khai báo cứng `container_name:` trong compose file**:
     - *Tránh xung đột khi cập nhật*: Khi Docker Compose triển khai container mới trước khi huỷ container cũ (recreate / rolling update), gán cứng `container_name` sẽ gây lỗi `Conflict. The container name is already in use`.
     - *Hỗ trợ nhân bản (Scale)*: Cho phép chạy `--scale worker=2` hoặc chạy song song nhiều môi trường test mà không bị đụng tên container.

---

### 8.3. Build và tag — đường lùi khi bản mới hỏng

1. **Vị trí Dockerfile & Build Context**:
   - Dockerfile nằm đúng bên trong thư mục của từng ứng dụng (`apps/api/Dockerfile`, `apps/worker/Dockerfile`).
   - `context` luôn trỏ về gốc monorepo (`..` khi đứng trong `deploy/` hoặc `.` từ root repo) để build engine truy cập được các thư viện dùng chung (`packages/contracts`, `packages/shared`).

2. **Kiến trúc Build (Multi-stage vs Single-stage)**:
   - **`app-relay-api` — Multi-stage Build (~325 MB)**:
     - *Stage 1 (Builder)*: Cài đầy đủ `devDependencies`, biên dịch TypeScript sang `dist/`.
     - *Stage 2 (Runner)*: Chỉ sao chép `dist/` và `node_modules` production, loại bỏ toàn bộ compiler/source code. Chạy dưới user phi đặc quyền (non-root `USER nodeuser`, uid `10001`) để đảm bảo an toàn nếu container bị xâm nhập.
   - **`app-relay-worker` — Single-stage đặc thù (~13.3 GB)**:
     - Chứa trọn bộ JDK 17, Android Command-line Tools, Android SDK Platform 35, system image `google_apis;x86_64`, emulator, Xvfb, noVNC, supervisord, và nhúng snapshot seed AVD 2.5 GB (`/opt/avd-seed/avd-seed.tar.gz`).
     - Dung lượng lớn là đặc thù bắt buộc của toàn bộ SDK và image hệ điều hành Android.

3. **Chiến lược Tagging (`IMAGE_TAG`) & Cơ chế Rollback**:
   - `latest`: Đại diện cho bản build mới nhất của nhánh chính (main/master).
   - `<git-sha>` (Commit SHA): Được gắn tự động trong CI/CD pipeline cho `app-relay-api` (ví dụ `conghieudoan19/app-relay-api:7c31c2d`).
   - **Rollback tức thì**: Khi phiên bản API mới gặp lỗi trên production, chỉ cần đổi `IMAGE_TAG` về commit SHA cũ và chạy lại compose mà không cần build:
     ```bash
     IMAGE_TAG=7c31c2d docker compose up -d api
     ```

4. **Phân định rõ ràng: Build CI/CD vs Build Thủ công**:
   - **`app-relay-api`**: Tự động build và push 100% qua GitHub Actions mỗi khi push code lên nhánh chính.
   - **`app-relay-worker`**: **Tuyệt đối KHÔNG build trên CI/CD**. Vì `avd-seed/avd-seed.tar.gz` chứa session Google Play không đưa lên Git (`.gitignore`), CI chỉ có thư mục rỗng. Build worker trên CI sẽ tạo ra image không có tài khoản Google và ghi đè mất bản seed. Worker image chỉ được build thủ công trên máy có seed rồi push lên Docker Hub repo **Private**.

---

### 8.4. Docker Hub — cạm bẫy Private hay Public

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

**Trạng thái (đo 2026-08-17):** đã dọn xong. Namespace `daclong120` xác nhận
**không tồn tại** (Docker Hub API trả 404), `conghieudoan19` có thật. Trước hôm
nay máy dev còn **hai tag song song** cùng trỏ một image ID và container vẫn
chạy tag `daclong120/...`; nay hai tag `daclong120/app-relay-{api,worker}` đã bị
gỡ (chỉ untag, không mất dữ liệu vì tag `conghieudoan19/...` vẫn giữ image ID)
và container đã dựng lại theo tag đúng.

Cũng xoá `daclong120/app-relay-dashboard:latest` (1.32 GB) — repo **không có**
`apps/dashboard`, đó là image mồ côi từ một hướng đi đã bỏ.

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

## 10. Mười một cạm bẫy đã gặp thật

Đây là các cạm bẫy **đặc thù Docker**. Sự cố ứng dụng (API crash-loop, job kẹt,
emulator không boot, mất phiên Play) nằm ở [runbook.md](runbook.md).

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| Emulator chạy nhưng chậm bất thường | Thiếu `compose.kvm.yaml`, hoặc `KVM_GID` sai | `docker exec app-relay-worker-1 kvm-ok`. Lấy gid đúng: `docker run --rm --privileged alpine stat -c %g /dev/kvm` — xem dòng dưới bảng |
| `docker compose` chết ở `stat compose.yml;compose.kvm.yaml: no such file` | Dấu phân cách `COMPOSE_FILE` sai hệ điều hành | `;` khi gõ từ Windows, `:` khi gõ từ WSL/Linux — §4 |
| Trình duyệt `ERR_CONNECTION_REFUSED` mà `curl` vẫn chạy | Trình duyệt phân giải `localhost` → `::1`, cổng chỉ bind IPv4 | Gõ `127.0.0.1` thay vì `localhost` |
| `docker push` xong mới biết repo đang public | Docker Hub tự tạo repo public khi repo chưa tồn tại | Tạo repo Private thủ công trước khi push — xem §8 |
| Worker online nhưng không nhận job | `WORKER_TOKEN` ở `.env.api` và `.env.worker` lệch nhau | Sửa cho trùng tuyệt đối |
| Deploy máy mới, CH Play hỏi đăng nhập lại | Image không có seed — thường là quên `--no-build` | [avd-seed.md §7](avd-seed.md) |
| `pull access denied` lúc deploy | Repo private (bắt buộc) mà máy đích chưa `docker login` | [avd-seed.md §7](avd-seed.md) |
| Sửa code worker xong, deploy xanh mà VPS không đổi gì | CI **không** build worker image | [avd-seed.md §6](avd-seed.md) |
| Xoá một file compose khỏi repo, VPS vẫn còn | `scp` chỉ ghi đè, không xoá — khác `git reset --hard` trước đây | Xoá tay trên máy đích |
| `address already in use` cổng 5500 | Bật `compose.http.yaml` cùng lúc với Caddy | Chọn một |
| Artifact ghi lỗi `EACCES` | Volume cũ từ thời chạy root, không được chown lại | `docker compose run --rm --user root api chown -R 10001:10001 /data/artifacts` |

**Về `KVM_GID`:** đây là gid của `/dev/kvm` **trong VM chạy docker engine**,
không phải trên máy bạn đang ngồi. Docker Desktop trên Windows là 991; một distro
WSL cài docker riêng lại là số khác; Ubuntu server thường là 108 (đúng bằng mặc
định trong `compose.kvm.yaml`). Chạy `getent group kvm` trên host là hỏi nhầm
máy — nó trả về số của host chứ không phải của engine, và đặt sai thì emulator
**âm thầm** tụt về chạy phần mềm.

Danh sách đầy đủ hơn: [runbook.md](runbook.md) · [changelog.md](changelog.md).

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
