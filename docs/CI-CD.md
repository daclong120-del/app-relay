# CI/CD

Ghi lại pipeline **đang chạy** tại [.github/workflows/ci.yml](../.github/workflows/ci.yml), không phải pipeline mong muốn.

---

## 1. Sơ đồ

```mermaid
flowchart LR
    PR["Pull request<br/>→ main / master"] --> T
    PU["Push<br/>→ main / master"] --> T

    T["① test-and-verify<br/>ubuntu-latest"]

    T -->|"chỉ khi push"| M["② db-migrate"]
    M --> B["③ build-and-push"]
    B --> D["④ deploy-to-vps"]

    T -.->|"PR dừng ở đây"| STOP["không deploy"]

    subgraph S1[" "]
        T1["checkout"] --> T2["pnpm/action-setup<br/>KHÔNG truyền version"] --> T3["setup-node 20<br/>cache pnpm"] --> T4["pnpm install --frozen-lockfile"] --> T5["pnpm build"] --> T6["pnpm test"]
    end

    subgraph S2[" "]
        M1["tsx scripts/db-migrate.ts --apply"]
    end

    subgraph S3[" "]
        B1["buildx"] --> B2["login Docker Hub"] --> B3["api → :latest + :sha"]
        B4["worker: KHÔNG build ở CI<br/>(seed bị gitignore)"]
    end

    subgraph S4[" "]
        D1["scp deploy/ + migrations<br/>→ VPS"] --> D2["ssh: docker login"] --> D3["compose pull<br/>(COMPOSE_FILE từ .env)"] --> D4["compose up -d<br/>--remove-orphans"] --> D5["docker image prune -f"]
    end

    T -.- S1
    M -.- S2
    B -.- S3
    D -.- S4

    classDef stop fill:#eee,stroke:#999
    class STOP stop
```

---

## 2. Bốn job

### ① `test-and-verify`

Chạy trên **mọi** push và PR. Là job duy nhất PR chạy.

```yaml
- uses: pnpm/action-setup@v4        # không có input `version`
- uses: actions/setup-node@v4
  with: { node-version: 20, cache: 'pnpm' }
- run: pnpm install --frozen-lockfile
- run: pnpm build
- run: pnpm test
```

> `pnpm/action-setup` **cố ý không truyền `version`**. Version lấy từ `packageManager` trong `package.json` gốc. Truyền cả hai thì action fail với "Multiple versions of pnpm specified".

`pnpm test` chạy `--recursive`, tức là ba package đều chạy `typecheck` rồi `tsx --test src/**/*.test.ts`. Xem [test-case.md](test-case.md).

### ② `db-migrate`

`needs: test-and-verify`, `if: github.event_name == 'push'`.

```bash
pnpm exec tsx scripts/db-migrate.ts --apply
```

Secret: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_URL`.

Script giữ sổ `public.schema_migrations` kèm checksum: migration đã áp mà nội dung file đổi thì **từ chối chạy**, không âm thầm bỏ qua.

> Job này **không** gọi `notify pgrst, 'reload schema'`. Với Supabase Cloud thì không sao (tự reload). Với self-host thì phải làm tay — xem [runbook.md](runbook.md).

### ③ `build-and-push`

`needs: db-migrate`, chỉ khi push. **Chỉ build image API.**

```text
<user>/app-relay-api:latest      <user>/app-relay-api:<github.sha>
```

Tag `github.sha` là **toàn bộ cơ chế rollback** của dự án. Không có nó thì `latest` là đường một chiều.

Secret: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`.

#### Vì sao CI không build worker image

[apps/worker/Dockerfile](../apps/worker/Dockerfile) có `COPY avd-seed/ /opt/avd-seed/`, mà `avd-seed/avd-seed.tar.gz` (~2.5 GB, chứa phiên đăng nhập Google Play) bị `.gitignore` chặn. CI checkout từ git nên thư mục đó **luôn rỗng**.

Image CI tạo ra vẫn chạy, nhưng [create-avd.sh](../apps/worker/docker/create-avd.sh) không thấy seed sẽ rơi xuống nhánh tạo AVD trắng — mất sạch phiên đăng nhập. Đẩy bản đó lên tag `latest` là **ghi đè mất bản có seed**.

Nên worker image chỉ build và push từ máy đang giữ `avd-seed/`:

```bash
docker compose build worker
docker push <user>/app-relay-worker:latest
```

> **Hệ quả phải nhớ:** sửa code trong `apps/worker/` thì pipeline **không** đưa thay đổi đó lên VPS. Phải build tay và push. Đây là đánh đổi có chủ đích để giữ seed.

Chi tiết vòng đời seed: [docker.md](docker.md).

### ④ `deploy-to-vps`

`needs: build-and-push`, chỉ khi push. SSH vào VPS rồi chạy:

```bash
set -e

Job gồm **hai bước**. Bước ① chép file cấu hình, bước ② kéo image và dựng lại.

```yaml
# ①  appleboy/scp-action
source: "deploy/,supabase/migrations/"
target: $VPS_DEPLOY_PATH        # mặc định /root/app-relay
overwrite: true
```

```bash
# ②  appleboy/ssh-action
set -e
cd $VPS_DEPLOY_PATH
if [ -d "deploy" ]; then cd deploy; fi

test -f .env || exit 1          # VPS phải bootstrap trước
chmod +x ./*.sh

echo "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USERNAME" --password-stdin
docker compose pull
docker compose up -d --remove-orphans
docker image prune -f
```

Secret: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_SSH_PORT` (mặc định 22), `VPS_DEPLOY_PATH`, `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`.

**Hai điều kiện tiên quyết trên VPS** — thiếu cái nào job này cũng vô nghĩa hoặc fail:

1. `deploy/.env` đã được [bootstrap.sh](../deploy/bootstrap.sh) sinh ra, chứa `COMPOSE_FILE` và `COMPOSE_PROFILES`. Job fail sớm với thông báo rõ nếu không có.
2. `deploy/.env.api`, `deploy/.env.worker` tồn tại — pipeline không tạo chúng.

VPS **không cần git**, không cần deploy key, không cần bản clone của repo. Chỉ cần `docker` và `ssh`.

#### Tại sao `set -e`

`appleboy/ssh-action` mặc định `script_stop: false`, tức là **không dừng khi một lệnh fail**. Không có `set -e` thì `docker compose pull` hỏng vẫn chạy tiếp tới `echo "✅ deployed successfully"` và job báo xanh.

#### Tại sao vẫn phải chép file sang, dù image đã ở Docker Hub

Câu hỏi hợp lý: đã kéo image từ registry thì VPS còn cần file gì nữa?

Vì những thứ này **cố ý không nằm trong image**, `docker compose` đọc thẳng từ đĩa VPS lúc `up`:

| File | Ai đọc |
|---|---|
| `deploy/compose*.yaml` | chính `docker compose` |
| `deploy/caddy/Caddyfile` | container caddy |
| `deploy/supabase-local/*.sh`, `*.sql` | container db lúc khởi tạo |
| `supabase/migrations/*.sql` | container db lúc khởi tạo |

Trước đây việc đồng bộ này do `git fetch` + `reset --hard <sha>` trên VPS đảm nhiệm. Bỏ git thì `scp` thay vào chỗ đó.

> **Khác biệt phải biết:** `scp` chỉ **ghi đè**, không xoá. File đã bị xoá khỏi repo sẽ **vẫn nằm lại** trên VPS, khác với `reset --hard` trước đây. Đổi tên hay xoá một file compose thì phải xoá tay trên máy đích.

> `.env`, `.env.api`, `.env.worker` đều gitignore nên không có trong workspace của runner → `scp` không đụng tới. Secret trên VPS an toàn.

> `scp` không giữ bit thực thi, nên bước ② có `chmod +x ./*.sh`. Thiếu dòng đó thì lần sau gõ `./gui.sh` trên VPS sẽ ra `Permission denied`.

#### Tại sao phải `docker login` trên VPS

Worker image chứa seed đăng nhập Google, nên repo Docker Hub **bắt buộc private**. Không login thì `docker compose pull` fail với `pull access denied` — thông báo này rất dễ đọc nhầm thành "image không tồn tại".

#### Tại sao không còn `-f` lẫn `--profile`

Chuỗi file compose lấy từ `COMPOSE_FILE` trong `deploy/.env`, do `bootstrap.sh` sinh:

```text
compose.yml:compose.supabase.yaml:compose.prod.yaml
compose.yml:compose.kvm.yaml:compose.supabase.yaml:compose.prod.yaml   # máy có /dev/kvm
```

Việc dò `/dev/kvm` thuộc về `bootstrap.sh` — nó chạy trên chính máy đích nên nó mới biết máy có KVM, có chạy Supabase self-host hay không. CI không cần đoán.

Trước đây CI truyền `-f compose.yml` tường minh, mà **`-f` đè `COMPOSE_FILE`**. Hệ quả là mỗi lần deploy tự động lại âm thầm làm rơi hai overlay:

| Rơi mất | Hậu quả |
|---|---|
| `compose.prod.yaml` | mất xoay log (`max-size: 10m`) → vài tuần là đầy đĩa; mất `stop_grace_period: 120s` → emulator bị SIGKILL sau 10s, **hỏng AVD** |
| `compose.supabase.yaml` | `--remove-orphans` **xoá** container `db`/`rest` do bootstrap dựng |

`--profile production` cũng bỏ, cùng lý do: [bootstrap.sh:237](../deploy/bootstrap.sh#L237) cố ý để `COMPOSE_PROFILES` **rỗng** ở chế độ `--http-only` để Caddy không khởi động. Cờ tường minh trong CI sẽ dựng Caddy dậy bất chấp và giành cổng 80/443.

Cả ba đã sửa.

> Quy tắc chung cho job ④: **không cờ nào của `docker compose` được hardcode trong CI.** Máy đích tự mô tả nó qua `deploy/.env`; CI chỉ chép file cấu hình sang rồi gọi `pull` + `up -d`.

---

## 3. Secret cần có

| Secret | Job | Không có thì |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | ② | |
| `SUPABASE_PROJECT_REF` | ② | |
| `SUPABASE_DB_URL` | ② | migrate fail → chặn ③④ |
| `DOCKERHUB_USERNAME` | ③④ | login fail → chặn ④ |
| `DOCKERHUB_TOKEN` | ③④ | ④ `pull access denied` vì repo private |
| `VPS_HOST` | ④ | |
| `VPS_USER` | ④ | |
| `VPS_SSH_KEY` | ④ | ssh fail |
| `VPS_SSH_PORT` | ④ | mặc định 22 |
| `VPS_DEPLOY_PATH` | ④ | mặc định `/root/app-relay` |

Secret **không** đi vào image — chúng chỉ tồn tại trong runner. Biến ứng dụng (`API_TOKEN`, `SUPABASE_SECRET_KEY`…) nằm trong `deploy/.env.*` **trên máy đích**, pipeline không đụng tới.

Hệ quả: **thêm biến env mới thì phải sửa tay trên VPS**, pipeline không tự làm. Đây là bước dễ quên nhất khi deploy — nằm trong [checklist.md](checklist.md).

---

## 4. Rollback

### Code

```bash
cd /opt/app-relay/deploy
IMAGE_TAG=<sha-cũ> DOCKERHUB_USERNAME=<user> docker compose --profile production up -d
```

Không cần `-f` — `COMPOSE_FILE` trong `deploy/.env` lo phần đó.

Cố định thì ghi `IMAGE_TAG=<sha>` vào `deploy/.env`. Bỏ dòng đó ra là quay về `latest`.

> `deploy/.env` không có trong workspace của runner nên `scp` của job ④ **không đè** dòng ghim này. Ghim xong mà quên gỡ thì mọi push sau đó vẫn build image mới, deploy vẫn báo xanh, còn VPS thì đứng yên ở SHA cũ.

> **Rollback chỉ áp dụng cho API.** Worker không có tag `<sha>` vì CI không build nó. Muốn lùi worker thì phải build lại từ máy giữ seed, hoặc tự gắn tag phiên bản lúc push:
> `docker push <user>/app-relay-worker:2026-08-11`

### Schema

**Không có rollback tự động.** Migration không có `down`. Chi tiết ở [runbook.md §10](runbook.md).

Ràng buộc quan trọng: `db-migrate` chạy **trước** `build-and-push`, nên luôn có một khoảng schema mới chạy cùng code cũ. **Mọi migration phải tương thích ngược.** Hiện đúng — migration của dự án toàn `add column if not exists` — nhưng đó là ràng buộc thiết kế, không phải may mắn.

---

## 5. Bốn khoảng trống

Ghi rõ thay vì để người sau tự phát hiện.

### 5.1. Không có branch protection

Push thẳng lên `main` chạy hết bốn job và deploy lên VPS. Không có review bắt buộc, không có status check chặn merge.

Cần thì bật trong Settings → Branches: yêu cầu PR, yêu cầu `test-and-verify` xanh, cấm push trực tiếp.

### 5.2. Migration chạy trước image

Xem §4. Chưa gãy vì migration hiện toàn là `add column`, nhưng `drop column` hay `rename` sẽ làm production 500 trong vài phút giữa job ② và job ④.

### 5.3. Máy đích tự khai báo nó chạy chế độ nào

Job ④ **không** hardcode profile nữa. Nó đọc `COMPOSE_PROFILES` từ `deploy/.env` trên chính máy đích, nên cùng một pipeline deploy được cả ba chế độ:

| `COMPOSE_PROFILES` | Đường ra Internet |
|---|---|
| `named` | Cloudflare Tunnel, URL cố định — **mặc định cho đối tác**, xem [public-access.md](public-access.md) |
| `quick` | Cloudflare quick tunnel, URL đổi mỗi lần restart — chỉ để tự test |
| `production` | Caddy + Let's Encrypt, cần IP tĩnh và domain |
| *(rỗng)* | HTTP trần qua `compose.http.yaml`, chỉ để tự test |

Đổi lại: **pipeline không kiểm chứng được máy đích đang ở chế độ nào.** Ai sửa tay `deploy/.env` sai một chữ thì lần deploy kế tiếp lặng lẽ đổi đường ra Internet, và CI vẫn báo xanh. `deploy/.env` untracked nên git cũng không giữ lịch sử của nó.

Chốt chặn duy nhất hiện có là đọc lại sau khi deploy:

```bash
ssh <vps> 'cd /root/app-relay/deploy && docker compose config --services'
```

> Bẫy hay gặp: thêm `compose.tunnel.yaml` vào `COMPOSE_FILE` nhưng **quên đặt `COMPOSE_PROFILES`**. Service tunnel nằm sau profile nên không được kích hoạt, và `up -d --remove-orphans` của job ④ coi container tunnel đang chạy là orphan rồi **xoá nó**. Đối tác mất đường vào, không ai được báo.

### 5.4. CI test Node 20, production chạy Node 22

| Nơi | Node |
|---|---|
| `setup-node` trong CI | **20** |
| `apps/api/Dockerfile` | **22** (`node:22-alpine`) |
| `apps/worker/Dockerfile` | 20 (nodesource) |
| `package.json` `engines` | `>=18` |

API image phải là Node 22 vì `@supabase/supabase-js >= 2.112` cần native WebSocket và crash trên Node 20 — comment trong Dockerfile ghi rõ.

Nghĩa là **CI đang test API trên runtime khác với production**. Lỗi chỉ xuất hiện trên một trong hai sẽ lọt lưới.

Cách sửa đúng: nâng `setup-node` lên 22, **không** hạ Dockerfile xuống 20. Nằm trong [plan.md](plan.md).

---

## 6. Thứ chưa có trong pipeline

| Chưa có | Ảnh hưởng | Ưu tiên |
|---|---|---|
| `pnpm audit` / Dependabot | CVE không ai biết | cao |
| Smoke test sau deploy | container crash-loop ngay sau `up -d` vẫn báo "✅ deployed successfully" | cao |
| Đo coverage | không biết phần nào chưa test | trung bình |
| Lint (ESLint/Prettier) | chỉ có `tsc --noEmit` | trung bình |
| Cache Docker layer | job ③ build lại SDK mỗi lần | trung bình |
| Duyệt tay trước khi deploy | mọi push lên main là deploy thẳng | thấp |
| Quét secret (gitleaks) | dựa hoàn toàn vào `.gitignore` | cao |

### Smoke test — đề xuất cụ thể

Thêm vào cuối job ④, ngay trước dòng `echo "✅"`:

```bash
sleep 15
curl -fsS http://127.0.0.1:5500/v1/health || { echo "health check FAILED"; exit 1; }
```

Không có nó thì `deploy-to-vps` báo thành công kể cả khi container crash-loop ngay sau `up -d` — vì `docker compose up -d` trả về ngay khi container **khởi động**, không chờ nó **healthy**.

---

## 7. Chạy pipeline tại chỗ

Trước khi push, chạy đúng thứ CI sẽ chạy:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

Ba lệnh này là toàn bộ job ①. Xanh ở máy thì gần như chắc chắn xanh trên CI — khác biệt còn lại chỉ là Node version (§5.4).

Thử migration mà không đụng production:

```bash
# Không có --apply là dry run
SUPABASE_DB_URL='postgres://…' pnpm exec tsx scripts/db-migrate.ts
```

Thử build image:

```bash
docker build -f apps/api/Dockerfile -t app-relay-api:test .
docker build -f apps/worker/Dockerfile -t app-relay-worker:test .   # ~30 phút
```
