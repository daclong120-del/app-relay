# Pull APK + Play listing từ CH Play (emulator)

> **Trigger:** user chỉ cần gửi URL Play Store (một hoặc nhiều).
> Ví dụ: `https://play.google.com/store/apps/details?id=com.example.app&hl=en`
>
> Agent đọc file này và chạy đủ pipeline — **không hỏi lại** cách pull, folder nào, có lấy screenshot không.

## Input → output

| Input | Output |
|---|---|
| Play URL(s) | `work/apks/<packageId>/` đầy đủ (APK + listing + screenshots) |

Package id lấy từ query `?id=` của URL.

## Target layout (bắt buộc)

```
work/apks/<packageId>/
├── base.apk                      # split base (analyzer dùng file này)
├── split_config.*.apk            # mọi split cài trên máy (abi / density / locale)
├── PULL_MANIFEST.txt             # package, play_url, pulled_at, ls + sha256
├── package-info.txt              # dumpsys package (versionName, versionCode, …)
├── device-dir.listing            # ls -la thư mục /data/app/… trên device
└── playstore/
    ├── description.md            # title, developer, rating, installs, full description
    ├── listing.json              # structured metadata
    ├── icon.png
    ├── page.html                 # raw HTML listing (debug / re-parse)
    └── screenshots/
        └── screenshot_XX.png     # toàn bộ screenshot trên listing
```

Không commit `*.apk` (đã `.gitignore`).

## Môi trường

| Thành phần | Giá trị |
|---|---|
| Emulator AVD | **`chpay`** (có Google account + Play Store) |
| adb | `$HOME/Library/Android/sdk/platform-tools/adb` (thường **không** có trên PATH) |
| emulator | `$HOME/Library/Android/sdk/emulator/emulator` |
| Account trên `chpay` | Google Play đã login (đủ để Install) |

```bash
export PATH="$HOME/Library/Android/sdk/platform-tools:$HOME/Library/Android/sdk/emulator:$PATH"
```

## Pipeline (thứ tự)

### 0. Parse URL

```
packageId = id= từ query string
playUrl   = https://play.google.com/store/apps/details?id=<packageId>&hl=en
```

Nhiều URL → lặp từng package (có thể scrape song song; install tuần tự trên 1 emulator).

### 1. Scrape Play listing (không cần device)

Với mỗi package:

1. `GET` `playUrl` (User-Agent desktop Chrome).
2. Parse `AF_initDataCallback` / `ds:5` → title, developer, rating, installs, **full description**.
3. Parse `<img data-screenshot-index="N">` → URL screenshot; tải bản lớn (`=w1080-h1920` nếu được).
4. Tải icon (`og:image`).
5. Ghi:
   - `playstore/description.md`
   - `playstore/listing.json`
   - `playstore/page.html`
   - `playstore/icon.png`
   - `playstore/screenshots/screenshot_XX.png`

Description: strip HTML (`<br>` → newline), giữ full text listing — **không** cắt ngắn.

### 2. Boot emulator `chpay`

```bash
# nếu chưa có device
emulator -avd chpay -no-snapshot-save -netdelay none -netspeed full &

# chờ boot
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 2; done

# unlock + giữ màn hình
adb shell input keyevent KEYCODE_WAKEUP
adb shell input keyevent 82          # unlock nếu keyguard
adb shell input swipe 540 1800 540 600 300
adb shell settings put system screen_off_timeout 1800000
```

### 3. Cài từ Play Store (UI automation)

Với mỗi package **chưa** `adb shell pm path <pkg>`:

```bash
adb shell am force-stop com.android.vending
adb shell am start -a android.intent.action.VIEW -d "market://details?id=<packageId>"
# chờ ~8s sheet/details load
```

- `uiautomator dump` → tìm nút **Install** (text hoặc content-desc) → `input tap` giữa bounds.
- Nếu thấy **Cancel** + % progress → đang tải, chỉ chờ.
- Dialog **Accept** / **Continue** → tap.
- Poll `pm path <packageId>` đến khi có `package:` (timeout ~6 phút / app).

Lưu ý: sheet Play đôi khi mở dạng bottom sheet — Install nằm góc app card, không phải full-page CTA. Match đúng text `Install` của app đích (không tap nhầm “Suggested for you”).

### 4. `adb pull` splits

```bash
paths=$(adb shell pm path <packageId> | tr -d '\r' | sed 's/^package://')
# mỗi path → pull về work/apks/<packageId>/
#   base.apk              → base.apk
#   split_config.*.apk    → giữ tên
```

Ghi kèm:

- `device-dir.listing` — `ls -la` thư mục chứa base trên device
- `package-info.txt` — `dumpsys package <pkg>` (phần Package header)
- `PULL_MANIFEST.txt`:

```
package=<packageId>
play_url=https://play.google.com/store/apps/details?id=<packageId>
pulled_at=<ISO local>
splits:
<ls -la *.apk>
sha256:
<shasum -a 256 *.apk>
```

### 5. Xác nhận

- `base.apk` là ZIP hợp lệ (`file` / `unzip -l` thấy `AndroidManifest.xml`).
- Có `playstore/description.md` + ≥1 screenshot (trừ app không đăng screenshot).
- In tóm tắt: package, versionName, size base, số split, số screenshot.

## Sau khi pull (tùy user)

Chỉ chạy analyze khi user yêu cầu:

```bash
pnpm aaa collect work/apks/<packageId>/base.apk
# hoặc full
pnpm aaa analyze work/apks/<packageId>/base.apk
```

`aaa` hiện chỉ cần **base.apk**; splits giữ để đủ bản cài / debug ABI.

## Checklist khi user chỉ gửi URL

- [ ] Parse `packageId` từ URL
- [ ] Tạo `work/apks/<packageId>/`
- [ ] Scrape description + icon + **toàn bộ** screenshot listing
- [ ] Boot / reuse emulator `chpay`
- [ ] Install từ Play nếu chưa có
- [ ] Pull base + mọi split
- [ ] `PULL_MANIFEST.txt` + package-info + device-dir
- [ ] Báo path + version + size — **không** tự `analyze` trừ khi được bảo

## Lỗi thường gặp

| Hiện tượng | Xử lý |
|---|---|
| `adb: no devices` | Start `emulator -avd chpay`, chờ `boot_completed=1` |
| Lock screen | `KEYCODE_WAKEUP` + swipe unlock |
| Không thấy Install | Dump UI lại; swipe sheet; đợi load; kiểm tra app đã cài (`Open` thay vì `Install`) |
| Install treo | Kiểm tra mạng emulator; mở lại market URL; tăng timeout |
| `adb` not found | Dùng full path SDK platform-tools |
| App gỡ khỏi Play / region lock | Báo user; listing scrape vẫn có thể lấy được description/screenshot |

## Phạm vi cố ý không làm

- Không implement `src/adapters/playstore.ts` trong bước pull thủ công này (scrape one-off ra folder).
- Không mirror third-party (APKPure/…) khi Play + emulator dùng được.
- Không force-stop emulator sau khi xong (lần sau reuse nhanh hơn), trừ khi user bảo tắt.
