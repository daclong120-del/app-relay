# Mở API cho đối tác gọi

Chốt nguyên tắc:

* Dùng **Cloudflare Tunnel**, không mở cổng, không cần IP public.
* `cloudflared` chạy như một container trong compose, nối thẳng vào `api:3000`.
* Không dùng Caddy khi đã có tunnel — Cloudflare lo TLS.
* Đối tác vẫn chỉ cần hai giá trị: `BASE_URL` và `API_TOKEN`.

## 1. Vì sao không đi đường IP public

Khi server nằm trên máy cá nhân hoặc trong WSL, hướng "mở cổng ra Internet" tốn công gấp nhiều lần mà vẫn dễ hỏng:

| Trở ngại | Hậu quả |
| --- | --- |
| WSL2 dùng NAT, IP nội bộ đổi sau mỗi lần khởi động | phải `netsh interface portproxy` lại mỗi lần reboot |
| Nhà mạng dùng CGNAT | không mở được cổng, kể cả cấu hình đúng router |
| IP nhà là IP động | cần dynamic DNS |
| Phải mở 443 từ máy cá nhân | toàn bộ máy nằm trong tầm quét của Internet |

Tunnel kết nối **hướng ra ngoài**: `cloudflared` tự quay ra Cloudflare và giữ kết nối. Không có cổng nào lắng nghe từ Internet, nên cả bốn trở ngại trên biến mất.

## 2. Hai chế độ

| Chế độ | Cần gì | URL | Dùng khi |
| --- | --- | --- | --- |
| **Quick tunnel** | không cần gì | `https://<ngẫu-nhiên>.trycloudflare.com`, đổi mỗi lần chạy | cho đối tác thử vài tiếng |
| **Named tunnel** | tài khoản CF + domain | `https://api.tenmien.com`, cố định | đối tác tích hợp thật |

Quick tunnel không cần đăng ký, không cần token. Đổi URL mỗi lần khởi động lại nên không dùng cho tích hợp lâu dài.

## 3. Cấu hình

`deploy/compose.tunnel.yaml` thêm một service duy nhất, nằm chung network `app-relay`:

```bash
# Quick tunnel — URL tạm, in ra trong log
docker compose -f compose.yml -f compose.kvm.yaml -f compose.supabase.yaml \
  -f compose.tunnel.yaml up -d

docker compose -f compose.tunnel.yaml logs cloudflared | grep trycloudflare.com
```

```bash
# Named tunnel — đặt token vào .env rồi bật profile
echo 'CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi...' >> .env

docker compose -f compose.yml -f compose.kvm.yaml -f compose.supabase.yaml \
  -f compose.tunnel.yaml --profile named up -d
```

Token lấy ở Cloudflare Dashboard → Zero Trust → Networks → Tunnels → Create a tunnel → Docker. Trong phần Public Hostname trỏ về `http://api:3000`.

Vì `cloudflared` nằm cùng network với `api`, nó gọi thẳng `api:3000` qua mạng nội bộ Docker. **Không cần publish cổng nào ra host** — kể cả `127.0.0.1:3000`.

## 4. Không dùng Caddy nữa

Profile `production` (Caddy) và tunnel là hai cách thay thế nhau, không chạy cùng:

| | Caddy | Cloudflare Tunnel |
| --- | --- | --- |
| Cần IP public | có | không |
| Cần mở cổng 80/443 | có | không |
| TLS | Caddy tự xin Let's Encrypt | Cloudflare lo |
| Hợp với | VPS có IP tĩnh | máy cá nhân, WSL, VPS sau NAT |

Trên VPS thật có IP tĩnh thì Caddy đơn giản hơn. Mọi trường hợp còn lại dùng tunnel.

## 5. Giới hạn phải biết trước

**File lớn qua Cloudflare.** Điều khoản dịch vụ tự phục vụ của Cloudflare hạn chế dùng CDN chủ yếu để phát tán file lớn không phải HTML. Đối tác tải vài chục APK để thử thì không sao; chạy hàng nghìn lượt tải 70 MB thì nên chuyển sang VPS có IP riêng.

Cách giảm tải hiệu quả nhất là bảo đối tác dùng selector đúng nhu cầu thay vì lấy cả cục:

| Cần gì | Dùng | Zalo |
| --- | --- | --- |
| chỉ metadata | `select=listing` | 24 KB |
| chỉ ảnh | `select=screenshots` | 1.2 MB |
| chỉ APK chính | `select=apk.base` | 68.6 MB |
| tất cả | mặc định | 73 MB |

Chênh tới 3000 lần. Xem `artifact_storage.md`.

**Máy phải luôn bật.** Tunnel chỉ sống khi container `cloudflared` còn chạy. Trên WSL còn phải giữ distro khỏi bị thu hồi — xem `vps_deploy.md` §8.

**Vẫn một emulator.** Mỗi job khoảng 60 giây và hàng đợi chạy tuần tự. Hai đối tác cùng gửi 20 URL thì bên sau chờ 20 phút. Mở public không làm hệ thống chạy nhanh hơn, chỉ làm nhiều người cùng xếp hàng.

**Một token dùng chung.** Mọi đối tác dùng chung `API_TOKEN`. Không cắt riêng được một bên, không biết bên nào gọi gì, và lộ token thì phải đổi cho tất cả. Phiên bản `1.0` cố ý không có bảng tài khoản (xem `setup_supbase.md`). Khi cần tách quyền thì thêm bảng `api_keys` và hạn ngạch số job đang chờ theo từng key.

## 6. Đưa gì cho đối tác

Đúng hai dòng, như `call_endpoint.md`:

```text
URL: https://api.tenmien.com/v1
KEY: apr_live_xxxxxxxxx
```

Họ không cần biết Cloudflare, Supabase, worker, hay tài khoản Google Play.
