# Seed AVD (Google Play Session)

Tài liệu tóm tắt về Seed AVD: danh sách seed, vị trí lưu trữ, và cách nhúng vào Docker image của worker.

---

## 1. Thông tin Seed

| Thuộc tính | Chi tiết |
|---|---|
| **Tên file** | `avd-seed.tar.gz` |
| **Dung lượng** | ~2.4 – 2.5 GB |
| **Nội dung** | Snapshot dữ liệu AVD đã đăng nhập Google Play (`userdata-qemu.img.qcow2`, `config.ini`,...) và khóa `adbkey`. |
| **Mục đích** | Giữ phiên đăng nhập CH Play khi deploy container worker sang máy/VPS mới mà không cần đăng nhập lại thủ công qua noVNC. |

---

## 2. Vị trí lưu trữ

| Môi trường | Đường dẫn | Ghi chú |
|---|---|---|
| **Host / Local repo** | `avd-seed/avd-seed.tar.gz` | Nằm tại thư mục gốc của repo. Bị `.gitignore` chặn (`/avd-seed/*`), chỉ commit file `avd-seed/.gitkeep`. |
| **Trong Docker image** | `/opt/avd-seed/avd-seed.tar.gz` | Nơi `Dockerfile` copy seed vào. |
| **Biến môi trường** | `AVD_SEED_PATH` | Mặc định trỏ tới `/opt/avd-seed/avd-seed.tar.gz` (xem [create-avd.sh](../apps/worker/docker/create-avd.sh)). |

---

## 3. Cách thêm Seed vào Image

### Bước 1: Tạo file seed (trên máy đã đăng nhập Google Play)
Chạy script tự động chụp snapshot AVD:
```bash
cd deploy
./capture-avd-seed.sh
# -> Sinh ra file: avd-seed/avd-seed.tar.gz
```

### Bước 2: Nhúng vào image qua Dockerfile
Trong [apps/worker/Dockerfile](../apps/worker/Dockerfile):
```dockerfile
# Copy cả thư mục avd-seed/ vào image (tránh lỗi build nếu chưa có seed)
COPY avd-seed/ /opt/avd-seed/
```

### Bước 3: Build và Push Image
Build và đẩy image lên Docker Hub (yêu cầu repository **Private** vì chứa phiên đăng nhập):
```bash
docker compose build worker
docker compose push worker
```

---

## 4. Cách sử dụng trên VPS / Máy đích

Khi deploy sang máy mới, **chỉ pull image và không build lại** (vì máy đích không có file seed trong git):
```bash
docker login
./bootstrap.sh --http-only --no-build
```

Khi container worker khởi động, [create-avd.sh](../apps/worker/docker/create-avd.sh) sẽ tự động giải nén `/opt/avd-seed/avd-seed.tar.gz` vào volume `worker-avd`.
