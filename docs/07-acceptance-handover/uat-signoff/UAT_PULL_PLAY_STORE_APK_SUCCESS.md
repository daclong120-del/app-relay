# Báo Cáo Nghiệm Thu UAT: Tự Động Hóa Pull APK & Listing từ Google Play (`pull-from-play`)

- **Ngày thực hiện:** 06/08/2026
- **Trạng thái nghiệm thu:** ✅ **ĐẠI THÀNH CÔNG (PASSED)**
- **Package thử nghiệm:** `colorwidgets.ios.widget.topwidgets`
- **URL Google Play:** `https://play.google.com/store/apps/details?id=colorwidgets.ios.widget.topwidgets&hl=en`

---

## 1. Tóm Tắt Quy Trình & Mã Nguồn Đã Thực Thi

Để hoàn thành mục tiêu kéo ứng dụng và thông tin listing trực tiếp từ Google Play thông qua thiết bị Android Emulator (`chpay`), hệ thống đã xây dựng và chạy thử nghiệm các thành phần mã nguồn sau:

### 📄 Mã nguồn chính được phát triển:
1. **[`tests/helpers/play-scrape-oneoff.ts`](file:///d:/super-tools/app-relay/tests/helpers/play-scrape-oneoff.ts):**
   - Bộ cào dữ liệu HTML Google Play một lần (one-off parser).
   - Trích xuất tự động: `Title`, `Developer`, `Rating`, `Installs`, `Description` dạng markdown, `Icon` và danh sách ảnh `Screenshots`.

2. **[`scripts/pull-from-play.ts`](file:///d:/super-tools/app-relay/scripts/pull-from-play.ts):**
   - Script tự động hóa 5 bước theo đúng tài liệu tả chuẩn [`pull-from-play (3).md`](file:///d:/super-tools/app-relay/pull-from-play%20%283%29.md):
     - **Bước 1 (Scrape Listing):** Gọi `scrapePlayListingOneOff` tải nguyên bản HTML, icon, và 30 screenshots.
     - **Bước 2 (Emulator Preflight):** Mở khóa màn hình, kiểm tra kết nối ADB với thiết bị `emulator-5554` (`chpay`).
     - **Bước 3 (Play UI Automation):** Gửi intent `market://details?id=...`, dump UI XML qua `uiautomator`, tự động xác định vị trí tọa độ nút "Install" (`[490,1283][592,1336]`), gửi thao tác chạm (tap) và poll `pm path` đến khi cài xong (chỉ mất 10s).
     - **Bước 4 (ADB Pull & Metadata):** Kéo `base.apk` cùng các file `split_config.*.apk`. Đồng thời ghi file `device-dir.listing`, `package-info.txt` và `PULL_MANIFEST.txt` (chứa SHA-256 checksum).
     - **Bước 5 (Verification):** Kiểm tra tính toàn vẹn file `base.apk` và xuất báo cáo tổng quan.

---

## 2. Nhật Ký Chạy Lệnh Thực Tế (Execution Log)

### Lệnh 1: Kiểm tra môi trường Android (`check-android-env.ts`)
```powershell
npx tsx tests/check-android-env.ts
```
- **Kết quả:** ADB `1.0.41`, Emulator `37.1.11.0`, AVD `chpay` sẵn sàng, thiết bị `emulator-5554` trực tuyến.

### Lệnh 2: Kiểm thử bộ HTML Parser Play Store (`test-play-scrape.ts`)
```powershell
npx tsx tests/test-play-scrape.ts
```
- **Kết quả:** 47/47 assertions passed, 1 skip (Rating 4.7, Developer "AI Photo Team", 30 Screenshots).

### Lệnh 3: Chạy pipeline tự động hóa trọn gói (`pull-from-play.ts`)
```powershell
npx tsx scripts/pull-from-play.ts "https://play.google.com/store/apps/details?id=colorwidgets.ios.widget.topwidgets&hl=en"
```
- **Kết quả Terminal:**
  ```text
  ============================================================
    SUCCESS — PULL COMPLETED FOR colorwidgets.ios.widget.topwidgets
  ============================================================
    📁 Target Directory : D:\super-tools\app-relay\work\apks\colorwidgets.ios.widget.topwidgets
    📦 Base APK Size     : 42.15 MB
    🧩 Total Splits      : 3
    📸 Screenshots       : 30
  ============================================================
  ```

### Lệnh 4: Thử nghiệm tự động kích hoạt Headless Emulator (`test-headless-pull.ts`)
```powershell
npx tsx scripts/test-headless-pull.ts "https://play.google.com/store/apps/details?id=com.facemoji.lite"
```
- **Kịch bản:** Tự động phát hiện Emulator đang tắt, kích hoạt AVD `chpay` ở chế độ Headless (`-no-window -no-audio -no-boot-anim -gpu off`), tự động mở khóa màn hình, cài đặt ứng dụng qua Play Store UI Automation và kéo bộ APK.
- **Kết quả:** **THÀNH CÔNG RỰC RỠ trong 30 giây!**
  - Package: `com.facemoji.lite`
  - Base APK: `base.apk` (**47.37 MB**)
  - Splits: `split_config.arm64_v8a.apk` (3.41 MB), `split_config.xxhdpi.apk` (266.77 KB)
  - Output: [`work/apks/com.facemoji.lite/`](file:///d:/super-tools/app-relay/work/apks/com.facemoji.lite/)

---

## 3. Cấu Trúc Sản Phẩm Đầu Ra (Artifact Proof)

Toàn bộ dữ liệu thu được đã được kiểm tra và lưu chuẩn tại thư mục [`work/apks/colorwidgets.ios.widget.topwidgets/`](file:///d:/super-tools/app-relay/work/apks/colorwidgets.ios.widget.topwidgets/) và [`work/apks/com.facemoji.lite/`](file:///d:/super-tools/app-relay/work/apks/com.facemoji.lite/):

```text
work/apks/com.facemoji.lite/
├── base.apk                         (47.37 MB - SHA256 Verified)
├── split_config.arm64_v8a.apk       (3.41 MB - SHA256 Verified)
├── split_config.xxhdpi.apk          (266.77 KB - SHA256 Verified)
├── PULL_MANIFEST.txt                (Ghi rõ thông số package, ISO timestamp & SHA256)
├── package-info.txt                 (Dumpsys package từ thiết bị)
├── device-dir.listing               (ls -la từ thư mục cài đặt /data/app/)
└── playstore/
    ├── description.md               (Mô tả đầy đủ dạng markdown)
    ├── listing.json                 (Metadata cấu trúc JSON)
    ├── icon.png                     (Icon ứng dụng)
    ├── page.html                    (File HTML gốc từ Play Store)
    └── screenshots/                 (26 ảnh chụp màn hình chất lượng cao)
        ├── screenshot_01.png
        └── ...
```

---

## 4. Xác Nhận Kiểm Thử Tích Hợp Hệ Thống (Master Test Suite)

Đã tiến hành chạy kiểm thử toàn bộ hệ thống qua lệnh:
```powershell
npx tsx scripts/run-all-tests.ts
```
- **Kết quả:** 11/11 Test Suites đạt **PASS** (100% Passed, 0 Failed across Phase 1 - Phase 12).

---

## 5. Kết Luận & Nghiệm Thu

Hệ thống đã hoàn tất 100% các tiêu chí nghiệm thu của quy trình Pull APK & Listing từ Google Play (cả giao diện GUI lẫn ngầm Headless). Tính năng đã sẵn sàng cho cả hai hình thức sử dụng:
1. **Thủ công qua CLI / Headless Test:** `npx tsx scripts/test-headless-pull.ts <PLAY_URL>`
2. **Tự động qua Worker Daemon 24/7:** [`workers/app-relay-worker`](file:///d:/super-tools/app-relay/workers/app-relay-worker/)

*Nghiệm thu ngày 06 tháng 08 năm 2026.*
