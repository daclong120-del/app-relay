# Learn — nhật ký bài học

Chống lặp lại sai lầm. Ghi cả thất bại — phần đó giá trị hơn phần thành công.

Mỗi mục: **vấn đề → triệu chứng → đã thử gì → cái gì hiệu quả**.

Thứ tự mới nhất trước.

---

## 2026-08-10 — `tests/test-endpoints/` bị xoá mà script bị bỏ lại

**Vấn đề**: commit `ef53f90` xoá 3410 dòng test conformance nhưng không xoá hai script `test:endpoints` và `download:artifacts` trong `package.json`.

**Triệu chứng**: chạy `pnpm test:endpoints` lỗi ngay. Nhưng vì `pnpm test` (script khác) vẫn xanh, và CI chỉ chạy `pnpm test`, nên **CI không phát hiện gì**.

**Bài học**: xoá code thì phải grep tên thư mục trong toàn repo trước khi commit. Ba nơi tối thiểu: `package.json`, `.github/`, `docs/` và `new_setup/`.

```bash
git rm -r <thư-mục>
grep -rn "<thư-mục>" --exclude-dir=node_modules . 
```

**Bài học nặng hơn**: tài liệu `new_setup/api-endpoint.md §4` vẫn hứa bộ test đó chạy được. **Doc sai nguy hiểm hơn doc thiếu** — người đọc tin nó và không kiểm.

---

## 2026-08-09 — CDN viết lại `page.html` trên đường truyền

**Vấn đề**: `page.html` tải qua tunnel về không khớp sha256 mà API công bố.

**Triệu chứng**: file tải "thành công" (`200`, không lỗi), nhưng byte không khớp. Zalo: 1.185.094 → **1.185.454** byte, sha256 lệch hoàn toàn.

**Đã thử**:
- Nghi worker hash sai → hash lại tại chỗ trên server: khớp.
- Nghi lỗi khi ghi đĩa → so file trên đĩa API với bản worker: khớp.
- So byte bản tải về với bản trên đĩa → **lệch**. Vậy lỗi nằm giữa API và client.
- Diff nội dung → thấy chèn `/cdn-cgi/scripts/…/email-decode.min.js` và địa chỉ email bị thay bằng `/cdn-cgi/l/email-protection`.

**Nguyên nhân**: Cloudflare bật sẵn **Email Address Obfuscation**, nó biến đổi mọi response `Content-Type: text/html`.

**Hiệu quả**: khai `.html` là `application/octet-stream`. CDN chỉ đụng vào `text/html`, nên đổi content-type là nó để yên. Đúng ý đồ luôn: `page.html` sinh ra để client re-parse listing gốc, nó phải tới nơi nguyên vẹn từng byte, và không bao giờ được render.

**Bài học tổng quát**: **CDN là một thành phần biến đổi dữ liệu, không phải ống dẫn trong suốt.** Bất cứ khi nào toàn vẹn byte quan trọng, đừng khai content-type mà CDN có quyền transform. Bug này chỉ xuất hiện qua đường public — test qua `127.0.0.1` sẽ không bao giờ thấy.

---

## 2026-08-09 — Compose nội suy `command` của cả service không thuộc profile

**Vấn đề**: bật quick tunnel (không cần token) nhưng compose từ chối chạy vì thiếu `CLOUDFLARE_TUNNEL_TOKEN` — biến của **named** tunnel.

**Nguyên nhân**: `${VAR:?}` nằm trong `command` của `cloudflared-named`. Compose nội suy biến trong `command` của **mọi** service khi parse file, kể cả service không thuộc profile đang bật.

**Hiệu quả**: chuyển token sang `environment: TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN:-}` với giá trị mặc định rỗng. Comment giải thích lý do được ghi thẳng vào `compose.tunnel.yaml`.

**Bài học**: profile chỉ quyết định service nào **chạy**, không quyết định phần nào của file được **parse**. Đừng đặt biến bắt buộc trong `command` của service có profile.

---

## 2026-08-09 — Deploy sạch chỉ áp migration `001`

**Vấn đề**: deploy mới lên máy trắng, API chết khi đụng cột `delete_after_download`.

**Nguyên nhân**: `compose.supabase.yaml` mount **trỏ cứng vào `001_initial_schema.sql`**. Thêm `002` mà quên sửa compose thì deploy sạch im lặng chạy với schema cũ.

**Hiệu quả**: mount cả thư mục `../supabase/migrations:/migrations:ro` và dùng script `01-migrations.sh` lặp qua mọi file theo thứ tự tên.

**Bài học**: cấu hình liệt kê từng file sẽ **lệch âm thầm** khi thêm file mới. Trỏ vào thư mục và duyệt, đừng liệt kê.

---

## 2026-08-09 — Test ghi đè app thật

**Vấn đề**: chạy bộ test làm hỏng dữ liệu app thật trong DB.

**Hiệu quả**: test dùng `packageId` riêng, không đụng dữ liệu thật.

**Bài học**: test viết vào DB dùng chung phải có namespace riêng, hoặc DB riêng. `POST /v1/jobs` upsert vào `apps` ngay lúc tạo job — không có bước nào phân biệt "job thật" và "job test".

---

## 2026-08-08 — Tính lại sha256 lúc finalize là lãng phí

**Vấn đề**: `finalize` cần sha256 của mọi file để ghi vào `artifacts.files`. Bản đầu đọc lại toàn bộ thư mục và băm lại.

**Triệu chứng**: finalize mất vài giây với artifact ~150 MB, dù mọi giá trị **vừa được tính xong** lúc ghi xuống đĩa.

**Hiệu quả**: `PUT files/*` nối một dòng JSON vào `.uploads.jsonl` sau mỗi upload thành công. `finalize` chỉ đọc sổ.

Ba chi tiết đi kèm:
- Tên bắt đầu bằng dấu chấm → `listArtifactFiles()` bỏ qua → không lọt vào `/artifact/files` lẫn vào ZIP.
- Cùng lý do, **upload dotfile bị cấm** — worker không được ghi đè sổ của API.
- Upload lại cùng path thì bản sau thắng; dòng hỏng thì bỏ qua (thiếu sha256 chỉ mất thông tin, không sai dữ liệu).

**Bài học**: khi thấy mình tính lại thứ vừa tính, hỏi "lúc đó lưu lại được không". Ghi thêm một dòng rẻ hơn đọc lại 150 MB rất nhiều.

---

## 2026-08-08 — mtime thư mục cha không đổi khi ghi vào thư mục con

**Vấn đề**: bản đầu của `cleanupOrphanDirs()` lấy `stat(dir).mtimeMs` để biết thư mục đã "nguội" chưa.

**Triệu chứng tiềm tàng** (bắt được khi review, chưa kịp gây hại): upload đang chạy ghi vào `playstore/screenshots/` **không** làm đổi mtime của thư mục gốc. Sau 120 phút, một upload dài vẫn trông như thư mục cũ và **bị xoá giữa chừng**.

**Hiệu quả**: lấy mốc mới nhất giữa mtime thư mục gốc và mtime của **mọi file bên trong**.

**Bài học**: mtime thư mục chỉ đổi khi entry **trực tiếp** trong nó thay đổi. Đừng dùng nó làm dấu hiệu "có hoạt động" cho cả cây con.

---

## 2026-08-08 — Query DB lỗi mà vẫn chạy tiếp là xoá sạch

**Vấn đề**: `cleanupOrphanDirs()` đối chiếu thư mục trên đĩa với `artifacts.job_id`. Nếu query lỗi, `rows` rỗng.

**Triệu chứng tiềm tàng**: rỗng nghĩa là **không thư mục nào có dòng DB**, tức là tất cả đều mồ côi → xoá sạch mọi artifact hợp lệ.

**Hiệu quả**: query lỗi thì `return` ngay, không xoá gì cả.

**Bài học**: với tác vụ **xoá**, "không có dữ liệu" và "không đọc được dữ liệu" là hai chuyện hoàn toàn khác nhau. Mặc định an toàn phải là **không làm gì**.

---

## 2026-08-08 — `close` phát cả khi client tụt mạng

**Vấn đề**: `deleteAfterDownload` bản đầu gắn vào `res.on('close')`.

**Triệu chứng tiềm tàng**: `close` phát cả khi client mất kết nối ở 95%. Xoá lúc đó là mất trắng công emulator và phải chạy lại job.

**Hiệu quả**: ba điều kiện phải đủ cả:
1. `res.on('finish')`, không phải `close`
2. `res.statusCode === 200`, không phải `206` — tải dở bằng `Range` chưa phải là đã nhận đủ
3. tập file được phục vụ phải **thực sự chứa APK** — client xin `select=listing` (22 KB) không được làm bay 140 MB

Hệ quả có ý thức: client tải hoàn toàn bằng `Range` sẽ **không bao giờ** kích hoạt xoá. Chọn hướng an toàn, để TTL lo phần còn lại.

**Bài học**: `close` là "kết nối đóng", `finish` là "đã ghi xong response". Với hành động **không hoàn tác được**, luôn chọn tín hiệu chặt hơn.

---

## 2026-08-08 — Race giữa `cancel` và `claim`

**Vấn đề**: `POST /cancel` đọc job rồi update thành `cancelling`.

**Triệu chứng tiềm tàng**: worker claim job đúng khe giữa `SELECT` và `UPDATE` → update ghi đè lên trạng thái worker vừa đặt. Job báo `cancelled` nhưng emulator **vẫn cài app và vẫn upload artifact**.

**Hiệu quả**: ràng `.eq('status', job.status)` vào chính trạng thái vừa đọc. Không trúng dòng nào thì đọc lại và trả `409 STATUS_CHANGED` để client quyết định — thay vì báo huỷ thành công một job không hề bị huỷ.

**Bài học**: mọi `read-modify-write` trên trạng thái phải mang theo điều kiện của lần đọc. Đây là optimistic locking, và nó rẻ: một `.eq()`.

---

## 2026-08-07 — healthcheck `localhost` giải ra `::1`

**Vấn đề**: container `api` không bao giờ chuyển `healthy`, kéo theo `worker` treo vĩnh viễn ở `depends_on: service_healthy`.

**Triệu chứng**: `wget --spider http://localhost:3000/v1/health` trong container trả `ECONNREFUSED`, nhưng `curl` từ host vào `127.0.0.1:3000` thì được.

**Nguyên nhân**: trong container, `localhost` phân giải ra `::1` (IPv6) trước. Server `app.listen(PORT, '0.0.0.0')` chỉ bind IPv4.

**Hiệu quả**: healthcheck dùng `http://127.0.0.1:3000/v1/health`.

**Bài học**: `localhost` không phải `127.0.0.1`. Trong healthcheck và script nội bộ, **luôn ghi địa chỉ IP tường minh**. Và triệu chứng "worker treo ở depends_on" hầu như luôn là healthcheck của service phụ thuộc, không phải lỗi của worker.

---

## 2026-08-07 — `corepack enable` kéo về pnpm 11

**Vấn đề**: Dockerfile dùng `corepack enable` để cài pnpm.

**Triệu chứng**: build hỏng — pnpm 11 cần builtin `node:sqlite`, không có trên Node 20.

**Nguyên nhân**: `corepack enable` resolve dist-tag `latest`, và `latest` đã nhảy lên 11.

**Hiệu quả**: `npm install -g "pnpm@9.15.9"` với `ARG PNPM_VERSION`. Con số này còn phải khớp `lockfileVersion 9.0` của `pnpm-lock.yaml`.

**Bài học**: `latest` trong Dockerfile là bom hẹn giờ — build hôm nay xanh, build tháng sau đỏ mà không đổi một dòng code. Pin mọi version, kể cả version của package manager.

---

## 2026-08-07 — `supabase-js` cần native WebSocket

**Vấn đề**: API crash-loop ngay lúc boot sau khi nâng `@supabase/supabase-js`.

**Triệu chứng**: `Node.js detected but native WebSocket not found` ném ra ngay tại `createClient()`.

**Nguyên nhân**: từ 2.112, thư viện với tay vào WebSocket global lúc tạo client. Node 20 không có.

**Hiệu quả**: image API đổi sang `node:22-alpine`.

**Nợ để lại**: CI vẫn `setup-node: 20`. Nghĩa là **CI test trên runtime khác production**. Xem [plan.md](plan.md) T-06.

**Bài học**: lỗi ném ra lúc **tạo client** chứ không phải lúc **gọi API** rất dễ bị nhầm thành lỗi cấu hình. Đọc thẳng thông điệp thay vì đi kiểm biến môi trường.

---

## 2026-08-07 — WSL2 tự thu hồi distro

**Vấn đề**: cả stack chết sau vài giờ không dùng.

**Triệu chứng** — điều làm mất nhiều thời gian nhất là **mọi thứ trông sạch**:

```text
RestartCount=0   OOMKilled=false   NRestarts=0
```

Không container nào crash. Trong journal: `systemd[1]: Reached target poweroff.target`.

**Đã thử**: kiểm OOM, kiểm `restart policy`, kiểm log container — tất cả bình thường.

**Nguyên nhân**: WSL2 thu hồi distro khi không còn tiến trình nào từ phía Windows giữ nó sống. systemd nhận lệnh tắt máy **thật**, Docker daemon tắt theo.

**Hiệu quả**: tiến trình keepalive trên Windows:

```powershell
Start-Process -FilePath "wsl.exe" `
  -ArgumentList '-d','Ubuntu-24.04','-u','root','--','sleep','infinity' `
  -WindowStyle Hidden
```

Dùng WSL làm server thật thì đăng ký vào Task Scheduler chạy lúc boot.

**Bài học**: `RestartCount=0` cộng với container đã dừng không phải là "bình thường" — đó là dấu hiệu **cả máy** bị tắt, không phải container chết. Nhìn ra ngoài Docker.

---

## 2026-08-07 — Lock AVD sót lại sau SIGTERM

**Vấn đề**: sau khi distro bị thu hồi, emulator không boot lại được.

**Triệu chứng**: `wait-for-emulator.sh` quay vòng tới lúc hết giờ. `adb devices` rỗng. Emulator thoát ngay mà không báo gì rõ ràng.

**Nguyên nhân**: SIGTERM giữa chừng để lại lock: `chpay.avd/multiinstance.lock`, `chpay.avd/hardware-qemu.ini.lock`, `avd/running/pid_*.ini`. Lần sau emulator tưởng đã có instance khác nên thoát.

**Hiệu quả**: xoá đúng ba loại lock đó.

> **Không đụng `userdata-qemu.img*`** — phiên đăng nhập Google nằm trong đấy. Xoá là phải đăng nhập lại tay qua noVNC.

**Bài học**: khi một tiến trình có thể bị giết bất ngờ, biết **file lock nào an toàn để xoá** và file nào **tuyệt đối không** là kiến thức vận hành phải viết ra, không để trong đầu.

---

## 2026-08-07 — `git clone` HTTPS repo private treo vô hạn

**Vấn đề**: script deploy đứng im, không lỗi, không timeout.

**Nguyên nhân**: git chờ nhập mật khẩu trên stdin. Trong script tự động thì không ai nhập.

**Hiệu quả**:

```bash
git clone git@github.com:<owner>/<repo>.git .              # SSH deploy key
GIT_TERMINAL_PROMPT=0 git clone https://<token>@github…    # hoặc fail ngay
```

**Bài học**: mọi lệnh có thể hỏi tương tác phải bị tắt tương tác trong script. Treo im lặng tốn nhiều thời gian hơn lỗi ồn ào.

---

## 2026-08-07 — `pnpm/action-setup` với `packageManager`

**Vấn đề**: CI đỏ ngay bước setup.

**Triệu chứng**: `Multiple versions of pnpm specified`.

**Nguyên nhân**: truyền cả input `version` cho action **và** có `packageManager` trong `package.json`.

**Hiệu quả**: bỏ input `version`, để action đọc `packageManager`. Lý do được comment thẳng vào `ci.yml`.

**Bài học**: khi có hai nguồn khai báo cùng một thứ, chọn một và ghi lý do ngay tại chỗ — nếu không, người sau sẽ "sửa" bằng cách thêm lại.

---

## Mẫu ghi mục mới

```markdown
## YYYY-MM-DD — Tiêu đề ngắn, mô tả triệu chứng chứ không mô tả cách sửa

**Vấn đề**: chuyện gì đang xảy ra.

**Triệu chứng**: dấu hiệu quan sát được — log, mã lỗi, hành vi. Đây là thứ
người sau sẽ google, nên viết đúng chữ họ sẽ gõ.

**Đã thử**: những hướng KHÔNG hiệu quả. Phần này giá trị nhất.

**Nguyên nhân**: cơ chế thật sự.

**Hiệu quả**: cách sửa, kèm code hoặc lệnh.

**Bài học**: nguyên tắc rút ra, áp dụng được cho chỗ khác.
```

Và: nếu bài học đủ quan trọng, chép một dòng vào bảng "đã thử và hỏng" của [system-prompt.md](system-prompt.md).
