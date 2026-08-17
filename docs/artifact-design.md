# Cấu trúc Output (Artifact) của API

Tài liệu mô tả toàn bộ dữ liệu và file đầu ra (artifact) do hệ thống cào và đóng gói sau khi xử lý một ứng dụng từ Google Play.

---

## 1. Cây thư mục Output

Sau khi xử lý xong một job, toàn bộ output được tổ chức theo cấu trúc:

```text
<job_artifact>/
├── base.apk                       # APK chính của ứng dụng
├── split_config.arm64_v8a.apk     # Các split APK đi kèm (ABI, DPI, ngôn ngữ...)
├── split_config.xxhdpi.apk
├── PULL_MANIFEST.txt              # Danh sách file rút được kèm mã băm SHA-256
├── package-info.txt               # Thông tin package (versionName, versionCode, dump...)
├── device-dir.listing             # Danh sách file trong thư mục cài đặt trên Android
└── playstore/
    ├── description.md             # Tiêu đề, developer, rating, installs, mô tả đầy đủ
    ├── listing.json               # Dữ liệu Play Store dạng structured JSON
    ├── icon.png                   # Icon ứng dụng
    ├── page.html                  # File HTML gốc từ trang Google Play
    └── screenshots/
        ├── screenshot_01.png      # Ảnh chụp màn hình ứng dụng
        └── screenshot_02.png ...
```

---

## 2. Chi tiết các file trong Output

| Phân loại | Tên file / Đường dẫn | Định dạng | Nội dung & Mục đích |
|---|---|---|---|
| **Cài đặt (APK)** | `base.apk` | APK | File APK chính, chứa mã nguồn và tài nguyên lõi. |
| | `split_config.*.apk` | APK | Các split APK (cấu hình kiến trúc CPU, màn hình, locale). |
| **Thông tin Play Store** | `playstore/description.md` | Markdown | Thông tin tóm tắt: Tiêu đề, nhà phát triển, đánh giá, số lượt tải, mô tả chi tiết. |
| | `playstore/listing.json` | JSON | Thông tin trên dưới dạng JSON có cấu trúc để dễ lập trình. |
| | `playstore/icon.png` | PNG | Ảnh biểu tượng của app. |
| | `playstore/page.html` | HTML | Toàn bộ mã nguồn trang Play Store gốc (để parse lại nếu cần). |
| | `playstore/screenshots/*` | PNG | Bộ ảnh chụp màn hình hiển thị trên Store. |
| **Metadata kỹ thuật** | `PULL_MANIFEST.txt` | Text | Nhật ký pull: URL gốc, thời gian, kích thước và SHA-256 từng file. |
| | `package-info.txt` | Text | Trích xuất `dumpsys package` (version, quyền permissions...). |
| | `device-dir.listing` | Text | Danh sách chi tiết thư mục `/data/app/...` trên máy ảo. |

---

## 3. Các tùy chọn tải Output (`select`)

Client có thể tải toàn bộ hoặc từng phần output thông qua tham số `select` khi tạo URL tải:

| Giá trị `select` | File được trả về | Định dạng nhận |
|---|---|---|
| `all` *(mặc định)* | Toàn bộ cây thư mục | File `.zip` |
| `apk` | `base.apk` + tất cả `split_config.*.apk` | File `.zip` |
| `apk.base` | Chỉ file `base.apk` | File `.apk` thô |
| `apk.splits` | Các file `split_config.*.apk` | File `.zip` |
| `listing` | `description.md`, `listing.json`, `icon.png` | File `.zip` |
| `listing.full` | Gói `listing` + file `page.html` | File `.zip` |
| `screenshots` | Toàn bộ ảnh trong thư mục `playstore/screenshots/` | File `.zip` |
| `metadata` | `PULL_MANIFEST.txt`, `package-info.txt`, `device-dir.listing` | File `.zip` |

> **Quy tắc**: Nếu yêu cầu chỉ khớp **đúng 1 file** (hoặc dùng `path=...`), API trả về **file thô** (hỗ trợ HTTP Range). Nếu khớp **nhiều file**, API tự động nén thành **file ZIP khi stream**.

---

## 4. Thời hạn lưu trữ Output

- **File APK (`*.apk`)**: Hết hạn sau **6 giờ** (được dọn sớm để tiết kiệm dung lượng đĩa).
- **Metadata, Text & Ảnh**: Hết hạn sau **30 ngày**.
- **Link tải HMAC**: Hết hạn sau **10 phút** kể từ lúc tạo.
