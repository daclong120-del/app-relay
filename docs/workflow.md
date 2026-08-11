# Quy trình tổng quan — từ dựng dự án tới demo cho đối tác

Tài liệu định hướng. Trả lời câu hỏi *"toàn bộ việc này diễn ra theo thứ tự nào"*
chứ không đi vào chi tiết từng lệnh — chi tiết nằm ở
[deploy-vps.md](deploy-vps.md) và [CI-CD.md](CI-CD.md).

Viết ra vì bốn chỗ dưới đây rất dễ hiểu nhầm, và hiểu nhầm chỗ nào cũng làm mất
vài tiếng.

---

## 1. Bốn hiểu nhầm thường gặp

### 1.1. "CI/CD sẽ build trên VPS"

**Không.** Có **hai đường build khác nhau**, dùng ở hai thời điểm khác nhau:

| | Build ở đâu | Dùng khi | Mất bao lâu |
|---|---|---|---|
| `deploy/bootstrap.sh` | **trên VPS** | dựng máy lần đầu | 30–40 phút |
| GitHub Actions | **trên runner của GitHub** | mọi lần `git push` sau đó | VPS chỉ mất ~1 phút |

CI build image xong thì đẩy lên Docker Hub, rồi SSH vào VPS chỉ để
`docker compose pull` + `up -d`. **VPS không build lại.**

Lý do: image worker nặng ~9 GB (JDK + Android SDK + system image). Bắt VPS build
lại mỗi lần push thì mỗi lần deploy mất 30–40 phút và ăn hết CPU của chính máy
đang chạy emulator.

### 1.2. "Viết CI/CD xong là deploy được luôn"

**Không.** CI **không** sinh secret. Nó cần `deploy/.env`, `deploy/.env.api`,
`deploy/.env.worker` **đã có sẵn trên VPS** — mà ba file đó nằm trong
`.gitignore`, chỉ `bootstrap.sh` sinh ra.

Thứ tự bắt buộc: **chạy `bootstrap.sh` tay một lần trước → CI mới tiếp quản được.**

Job `deploy-to-vps` cũng dựa vào `COMPOSE_FILE` trong `deploy/.env` để biết máy
đích có KVM hay không, có chạy Supabase self-host hay không. Chưa bootstrap thì
biến đó không tồn tại và CI sẽ chạy sai cấu hình.

### 1.3. "Chạy `docker run` để khởi động chương trình"

**Không.** `./bootstrap.sh` lo trọn gói: kiểm tra máy → sinh secret → build 2
image → `docker compose up -d` → chờ healthy → smoke test → in `API_TOKEN`.

Từ đó về sau, mọi thao tác là `docker compose ...`, không bao giờ `docker run`.

### 1.4. "Deploy xong là cổng API mở sẵn"

**Không.** `bootstrap.sh` chỉ **kiểm tra** cổng còn trống, nó không mở firewall —
mở cổng là quyết định của người quản trị máy.

Đây là bước hay quên nhất: stack chạy hoàn hảo, `curl` **bên trong** VPS ra kết
quả, mà gọi từ ngoài thì im lặng. Phải vào **FPT Cloud console → VM → Security
Group** mở cổng, và kiểm tra `ufw status` trên host.

---

## 2. Quy trình đầy đủ

```mermaid
flowchart TD
    subgraph G1["Giai đoạn 1 — Dựng dự án (một lần)"]
        A1["Viết Dockerfile<br/>đóng gói JDK + Android SDK + emulator + Node"]
        A2["Phát triển code"]
        A3["Viết CI/CD"]
        A1 --> A2 --> A3
    end

    subgraph G2["Giai đoạn 2 — Lên VPS lần đầu (làm TAY)"]
        B1["Cài docker + git trên VPS"]
        B2["git clone"]
        B3["./bootstrap.sh<br/>sinh secret · build · up · smoke test"]
        B4["Mở cổng trên Security Group"]
        B5["SSH tunnel + noVNC<br/>ĐĂNG NHẬP CH PLAY"]
        B1 --> B2 --> B3 --> B4 --> B5
    end

    subgraph G3["Giai đoạn 3 — Về sau (TỰ ĐỘNG)"]
        C1["git push"]
        C2["Actions: test → migrate DB"]
        C3["Actions: build 2 image<br/>→ đẩy Docker Hub"]
        C4["SSH vào VPS<br/>compose pull + up -d"]
        C1 --> C2 --> C3 --> C4
    end

    A3 --> B1
    B5 --> C1

    classDef manual fill:#ffd,stroke:#a85,stroke-width:2px
    class B3,B4,B5 manual
```

Ba ô vàng là việc phải làm tay. Mọi thứ còn lại tự động.

### Giai đoạn 1 — dựng dự án

| Bước | Nội dung |
|---|---|
| 1 | Viết `apps/api/Dockerfile` và `apps/worker/Dockerfile`. Worker image gói sẵn JDK 17, Android SDK, emulator, system image `android-35;google_apis_playstore;x86_64`, Xvfb, noVNC, supervisor |
| 2 | Phát triển code |
| 3 | Viết `.github/workflows/ci.yml` |

### Giai đoạn 2 — lên VPS lần đầu, làm tay

| Bước | Lệnh / thao tác |
|---|---|
| 4 | `curl -fsSL https://get.docker.com \| sh` rồi `apt-get install -y git` |
| 5 | `git clone <repo> /root/app-relay` — repo private thì cần deploy key SSH hoặc token, xem [deploy-vps.md §2](deploy-vps.md) |
| 6 | `cd /root/app-relay/deploy && ./bootstrap.sh --http-only` |
| 7 | Mở cổng trên FPT Cloud Security Group (3000 nếu HTTP trần, hoặc 80+443 nếu dùng domain) |
| 8 | `ssh -N -L 6080:127.0.0.1:6080 root@<IP>` rồi mở noVNC, **đăng nhập Google Play** |

### Giai đoạn 3 — từ đó về sau

Chỉ còn `git push`. Pipeline làm phần còn lại: test → migrate database → build 2
image → đẩy Docker Hub → SSH vào VPS → `pull` + `up -d`.

Chi tiết 4 job và các khoảng trống đã biết: [CI-CD.md](CI-CD.md).

---

## 3. Cái gì nằm trong image, cái gì nằm ngoài

Chỗ này hay nhầm nhất khi nói "đóng gói emulator vào Docker".

| Thứ | Nằm ở đâu | Mất khi nào |
|---|---|---|
| JDK, Android SDK, emulator, system image | **trong image** | không bao giờ — build lại là có |
| Node, pnpm, code đã compile | **trong image** | không bao giờ |
| AVD `chpay` (máy ảo cụ thể) | volume `worker-avd` | `docker compose down -v` |
| **Phiên đăng nhập Google Play** | volume `worker-avd` | `docker compose down -v` |
| APK worker đang xử lý | volume `worker-work` | `down -v` |
| ZIP chờ tải về | volume `api-artifacts` | `down -v` |
| Database (Postgres self-host) | volume `supabase-db` | `down -v` |
| File compose, Caddyfile, migration | **trên đĩa VPS**, bind-mount | `rm -rf` thư mục repo |
| Secret (`.env*`) | **trên đĩa VPS**, gitignore | xoá file |

Ba hệ quả:

**a.** Đăng nhập CH Play chỉ làm **một lần**. Restart container, build lại image,
deploy phiên bản mới — đều không mất.

**b.** `docker compose down -v` xoá sạch volume: mất phiên CH Play, mất database,
mất artifact. **Không bao giờ chạy lệnh này.** `down` không có `-v` thì an toàn.

**c.** File cấu hình **không** nằm trong image là cố ý. Sửa một dòng `Caddyfile`
mà phải build lại 9 GB thì không ai chịu nổi.

---

## 4. Vì sao phải `git clone` chứ không chỉ pull image

Câu hỏi hợp lý: đã có image trên Docker Hub rồi, sao VPS còn cần code?

Vì những thứ này **cố ý không nằm trong image**, chúng được bind-mount từ đĩa VPS:

| File | Ai đọc |
|---|---|
| `deploy/compose*.yaml` | chính `docker compose` |
| `deploy/caddy/Caddyfile` | container caddy |
| `deploy/supabase-local/*.sh`, `*.sql` | container db lúc khởi tạo |
| `supabase/migrations/*.sql` | container db lúc khởi tạo |
| `deploy/bootstrap.sh` | chính bạn |

Không có repo trên VPS thì không có gì để `docker compose` đọc, và database dựng
lên sẽ rỗng — không role, không bảng.

---

## 5. Kết quả cuối cùng

Sau bước 8:

```
API         http://<IP-VPS>:3000        (chế độ --http-only)
            https://api.tenmien.com     (chế độ có domain)
API_TOKEN   apr_live_xxxxx...
```

Gọi thử:

```bash
curl http://<IP-VPS>:3000/v1/health

curl -H "Authorization: Bearer $API_TOKEN" \
  http://<IP-VPS>:3000/v1/system/status

curl -X POST -H "Authorization: Bearer $API_TOKEN" -H "Content-Type: application/json" \
  -d '{"playUrl":"https://play.google.com/store/apps/details?id=com.google.android.calculator"}' \
  http://<IP-VPS>:3000/v1/jobs
```

Đặc tả 23 endpoint: [api-design.md](api-design.md). Kịch bản dùng thật:
[api-prototype.md](api-prototype.md).

### Trước khi đưa cho đối tác dùng thật

Chế độ `--http-only` chấp nhận được để **tự kiểm tra** và demo nội bộ. Nhưng
`API_TOKEN` đi qua Internet dưới dạng chữ đọc được — ai chen được vào đường
truyền đều lấy được token và gọi API thay bạn.

Trước khi giao địa chỉ cho bên ngoài, làm [deploy-vps.md §8](deploy-vps.md):

1. Trỏ domain về IP VPS
2. Sửa ba dòng trong `deploy/.env`
3. Bỏ `compose.http.yaml` khỏi `COMPOSE_FILE`
4. `docker compose up -d` — Caddy tự xin cert Let's Encrypt
5. Đóng cổng 3000 trên firewall
6. **Đổi `API_TOKEN`** — token cũ đã đi qua HTTP trần thì coi như đã lộ

Không build lại, không mất dữ liệu, không phải đăng nhập CH Play lại.

Checklist đầy đủ trước khi mở public: [security.md §10](security.md).

---

## 6. Đọc tiếp gì

| Cần gì | File |
|---|---|
| Từng lệnh cụ thể để deploy | [deploy-vps.md](deploy-vps.md) |
| Pipeline 4 job hoạt động ra sao | [CI-CD.md](CI-CD.md) |
| Bảng đầy đủ biến môi trường | [environment.md](environment.md) |
| Hệ thống chia thành gì, vì sao | [architecture.md](architecture.md) |
| Khi có sự cố | [runbook.md](runbook.md) |
| Checklist trước khi mở public | [security.md](security.md) |
