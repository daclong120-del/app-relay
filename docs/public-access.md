# Mở API cho đối tác — Cloudflare Tunnel

Đường ra Internet **chính thức** của app-relay. Caddy + domain là đường thay thế, không phải mặc định — xem [§5](#5-vì-sao-không-dùng-caddy-nữa).

Chốt nguyên tắc:

- Đối tác gọi qua **Cloudflare Tunnel**. Không mở cổng, không cần IP public, Cloudflare lo TLS.
- `cloudflared` chạy như một container trong compose, nối thẳng `api:5500` qua mạng Docker nội bộ.
- Đối tác chỉ nhận đúng hai giá trị: `BASE_URL` và `API_TOKEN`. Họ không cần biết Cloudflare, Supabase, worker hay tài khoản Google Play.

---

## 1. Hai chế độ — chọn sai là hỏng việc

| | **Quick tunnel** | **Named tunnel** |
|---|---|---|
| Cần gì | không cần gì | tài khoản Cloudflare + domain + token |
| URL | `https://<ngẫu-nhiên>.trycloudflare.com` | `https://api.tenmien.com` |
| URL đổi khi restart | **có** | không |
| Profile compose | `quick` | `named` |
| Dùng khi | tự kiểm tra, demo vài tiếng | **đối tác tích hợp thật** |

> **Quick tunnel KHÔNG dùng được cho đối tác.** URL sinh ngẫu nhiên và đổi mỗi lần container khởi động lại — mà container khởi động lại sau **mỗi lần deploy**, mỗi lần VPS reboot, mỗi lần `docker compose up -d` chạm tới nó. Đưa URL đó cho đối tác thì tích hợp của họ chết lặng ở lần deploy kế tiếp, và không ai được báo.

Đối tác thật → **bắt buộc named tunnel**.

---

## 2. Cấu hình — qua `deploy/.env`, không phải chuỗi `-f`

[bootstrap.sh](../deploy/bootstrap.sh) ghi `COMPOSE_FILE` và `COMPOSE_PROFILES` vào `deploy/.env`, nên mọi lệnh vận hành chỉ là `docker compose up -d`. Job ④ của CI cũng đọc đúng hai biến này ([CI-CD.md §2④](CI-CD.md)) — **không có cờ nào hardcode trong pipeline**.

Bật tunnel = thêm một file vào `COMPOSE_FILE` và đặt đúng profile:

```env
# deploy/.env
COMPOSE_FILE=compose.yml:compose.kvm.yaml:compose.supabase.yaml:compose.prod.yaml:compose.tunnel.yaml
COMPOSE_PROFILES=named
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi...
```

> Hai service tunnel đều nằm sau profile ([compose.tunnel.yaml:29](../deploy/compose.tunnel.yaml#L29), [:42](../deploy/compose.tunnel.yaml#L42)). Thêm file vào `COMPOSE_FILE` mà **quên đặt profile** thì service không được kích hoạt, và `docker compose up -d --remove-orphans` của CI sẽ coi container tunnel đang chạy là **orphan rồi xoá nó**. Đây là cách mất tunnel âm thầm hay gặp nhất.

Áp dụng:

```bash
cd /root/app-relay/deploy
docker compose config --services      # phải thấy cloudflared-named trong danh sách
docker compose up -d
```

Lấy token: Cloudflare Dashboard → Zero Trust → Networks → Tunnels → Create a tunnel → Docker. Trong **Public Hostname** trỏ về `http://api:5500`.

---

## 3. Chuyển từ quick sang named

Làm khi chuyển từ tự test sang cho đối tác dùng thật. Không build lại, không mất dữ liệu, không đụng AVD hay phiên đăng nhập CH Play.

**1.** Tạo named tunnel trên Cloudflare Dashboard, lấy token, trỏ Public Hostname về `http://api:5500`.

**2.** Sửa `deploy/.env`:

```env
COMPOSE_PROFILES=named
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi...
```

**3.** Bỏ `compose.http.yaml` khỏi `COMPOSE_FILE`. Tunnel đi qua mạng Docker nội bộ nên `api` **không cần publish cổng nào ra host** — kể cả `127.0.0.1:5500`. Còn để overlay này là còn một đường vòng không TLS vào thẳng API.

**4.** Áp dụng rồi kiểm tra:

```bash
docker compose up -d --remove-orphans
docker compose logs cloudflared-named | tail -20
curl -fsS https://api.tenmien.com/v1/health
```

**5.** Đóng cổng đã mở trước đó ở chế độ HTTP trần (`80` hoặc `5500`) — cả `ufw` lẫn Security Group của nhà cung cấp.

**6.** Đổi `API_TOKEN`. Token cũ đã từng đi qua HTTP trần nên coi như đã lộ:

```bash
NEW_TOKEN="apr_live_$(openssl rand -hex 24)"
sed -i "s|^API_TOKEN=.*|API_TOKEN=${NEW_TOKEN}|" .env.api
docker compose up -d api
echo "$NEW_TOKEN"
```

Chỉ `API_TOKEN`. `WORKER_TOKEN` chưa bao giờ ra khỏi mạng Docker nên không cần đổi — và đổi thì phải sửa cả `.env.worker` cho trùng.

---

## 4. Vì sao không đi đường IP public

| Trở ngại | Hậu quả |
|---|---|
| WSL2 dùng NAT, IP nội bộ đổi sau mỗi lần khởi động | phải `netsh interface portproxy` lại mỗi lần reboot |
| Nhà mạng dùng CGNAT | không mở được cổng, kể cả cấu hình đúng router |
| IP nhà là IP động | cần dynamic DNS |
| Mở 443 từ máy cá nhân | toàn bộ máy nằm trong tầm quét của Internet |
| VPS chỉ có IP, chưa có domain | **Let's Encrypt không cấp cert cho IP trần** — HTTPS là bất khả |

Tunnel kết nối **hướng ra ngoài**: `cloudflared` tự quay ra Cloudflare và giữ kết nối. Không có cổng nào lắng nghe từ Internet, nên cả năm trở ngại trên biến mất.

---

## 5. Vì sao không dùng Caddy nữa

Profile `production` (Caddy) và tunnel là hai cách **thay thế nhau**, không chạy cùng — bật cả hai thì hai bên giành cổng 80/443.

| | Caddy | Cloudflare Tunnel |
|---|---|---|
| Cần IP public | có | không |
| Cần mở cổng 80/443 | có | không |
| Cần domain | có | chỉ ở chế độ named |
| TLS | tự xin Let's Encrypt | Cloudflare lo |
| Hợp với | VPS có IP tĩnh **và** domain đã trỏ | mọi trường hợp còn lại |

Còn giữ Caddy trong repo vì nó vẫn là đường đúng cho VPS có IP tĩnh và domain. Nhưng mặc định của dự án là tunnel.

---

## 6. Giới hạn phải biết trước

**File lớn qua Cloudflare.** Điều khoản dịch vụ tự phục vụ hạn chế dùng CDN chủ yếu để phát tán file lớn không phải HTML. Đối tác tải vài chục APK để thử thì không sao; hàng nghìn lượt tải 70 MB thì nên chuyển sang VPS có IP riêng.

Cách giảm tải hiệu quả nhất là bảo đối tác dùng selector đúng nhu cầu thay vì lấy cả cục:

| Cần gì | Dùng | Zalo |
|---|---|---|
| chỉ metadata | `select=listing` | 24 KB |
| chỉ ảnh | `select=screenshots` | 1.2 MB |
| chỉ APK chính | `select=apk.base` | 68.6 MB |
| tất cả | mặc định | 73 MB |

Chênh tới 3000 lần.

**Máy phải luôn bật.** Tunnel chỉ sống khi container `cloudflared` còn chạy.

**Vẫn một emulator.** Mỗi job khoảng 60 giây, hàng đợi chạy tuần tự. Hai đối tác cùng gửi 20 URL thì bên sau chờ 20 phút. Mở public không làm hệ thống nhanh hơn, chỉ làm nhiều người cùng xếp hàng.

**Một token dùng chung.** Mọi đối tác dùng chung `API_TOKEN`. Không cắt riêng được một bên, không biết bên nào gọi gì, lộ token thì phải đổi cho tất cả. Bản `1.0` cố ý không có bảng tài khoản — xem [security.md](security.md). Khi cần tách quyền thì thêm bảng `api_keys` và hạn ngạch job đang chờ theo từng key.

**`/internal/v1/*` không được ra Internet.** Đó là mặt phẳng của worker. Với Caddy thì [Caddyfile:19](../deploy/caddy/Caddyfile#L19) trả 404. Với named tunnel, Public Hostname trỏ thẳng `http://api:5500` nên **không có lớp chặn nào tương đương** — kiểm tra lại sau khi dựng:

```bash
curl -o /dev/null -w '%{http_code}\n' https://api.tenmien.com/internal/v1/jobs/next
```

Ra `200` là hở. Chặn bằng Cloudflare Access hoặc WAF rule trên đường dẫn `/internal/*`.

---

## 7. Đưa gì cho đối tác

Đúng hai dòng:

```text
URL: https://api.tenmien.com/v1
KEY: apr_live_xxxxxxxxx
```

Kèm [api-prototype.md](api-prototype.md) nếu họ cần ví dụ gọi.
