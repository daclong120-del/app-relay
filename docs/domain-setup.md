# Mở API ra Internet (Cloudflare Tunnel)

Tài liệu hướng dẫn cấu hình Cloudflare Tunnel để đưa API ra Internet an toàn mà không cần mở port hay có IP tĩnh.

---

## 1. Hai chế độ Tunnel

| Chế độ | Profile | Mục đích | Đặc điểm |
|---|---|---|---|
| **Quick Tunnel** | `quick` | Tự test nhanh, demo | Không cần tài khoản Cloudflare. URL dạng `https://<random>.trycloudflare.com`, **sẽ đổi sau mỗi lần restart**. |
| **Named Tunnel** | `named` | **Production / Đối tác** | Cần tài khoản Cloudflare + Domain + Token. URL cố định dạng `https://api.domain.com`. |

> [!WARNING]
> **Không đưa URL Quick Tunnel cho đối tác**: URL ngẫu nhiên sẽ đổi sau mỗi lần deploy hoặc reboot. Đối tác thật bắt buộc dùng **Named Tunnel**.

---

## 2. Cách cấu hình Named Tunnel

### Bước 1: Lấy Token trên Cloudflare
1. Vào **Cloudflare Dashboard** → **Zero Trust** → **Networks** → **Tunnels** → **Create a Tunnel** (chọn kiểu Docker).
2. Sao chép `token` của tunnel.
3. Trong mục **Public Hostname**, cấu hình subdomain (ví dụ `api.tenmien.com`) trỏ về:
   - **Type**: `HTTP`
   - **URL**: `api:5500`

### Bước 2: Cập nhật file cấu hình `deploy/.env`
```env
# Thêm compose.tunnel.yaml vào COMPOSE_FILE
COMPOSE_FILE=compose.yml:compose.kvm.yaml:compose.supabase.yaml:compose.prod.yaml:compose.tunnel.yaml

# Đặt profile named và token
COMPOSE_PROFILES=named
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi...
```

### Bước 3: Khởi chạy
```bash
cd deploy
docker compose up -d
```
Kiểm tra kết nối:
```bash
curl -fsS https://api.tenmien.com/v1/health
```

---

## 3. Thông tin bàn giao cho đối tác

Chỉ cần cung cấp 2 thông tin:
```text
BASE_URL: https://api.tenmien.com/v1
API_TOKEN: apr_live_xxxxxxxxx
```
*(Xác thực bằng header: `Authorization: Bearer apr_live_xxxxxxxxx`)*

---

## 4. Lưu ý an toàn

1. **Không mở cổng API ra host**: Tunnel chạy qua mạng Docker nội bộ, không cần mở port 5500 hay port 80/443 trên firewall/VPS.
2. **Chặn endpoint `/internal/*`**: Endpoint `/internal/v1/*` chỉ dành riêng cho worker nội bộ. Nên cấu hình Cloudflare WAF chặn các request từ bên ngoài vào đường dẫn `/internal/*`.
