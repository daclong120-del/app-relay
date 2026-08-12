# Learn — nhật ký bài học

Chống lặp lại sai lầm. Ghi cả thất bại — phần đó giá trị hơn phần thành công.

Mỗi mục: **vấn đề → triệu chứng → đã thử gì → cái gì hiệu quả**.

Thứ tự mới nhất trước.

---

## 2026-08-12 — `docker push` tự tạo repo và tạo nó PUBLIC

**Vấn đề**: đẩy image lên Docker Hub cho VPS pull về.

**Triệu chứng**: **không có triệu chứng nào cả.** `docker push` chạy trơn, in `Pushed` từng layer, `digest: sha256:…` như mọi lần. Chỉ khi chủ động hỏi lại API mới lộ ra:

```bash
curl -s https://hub.docker.com/v2/repositories/<user>/app-relay-api/ | jq .is_private
# false
```

**Nguyên nhân**: repo chưa tồn tại thì Docker Hub **tự tạo** theo *Default privacy* của tài khoản, mặc định là public. Không hỏi xác nhận, không cảnh báo.

**Đã thử**: kiểm tra trước bằng `curl` repo → trả `404`. Đã hiểu nhầm 404 là "private". **404 có hai nghĩa: private, hoặc chưa tồn tại** — và hai nghĩa đó dẫn tới hai kết cục hoàn toàn khác nhau khi push.

**Hiệu quả**: tạo repo Private thủ công trên web *trước* lần push đầu, và đặt Account settings → Default privacy → Private. Kiểm lại sau khi push, không chỉ trước.

**Bài học**: với image chứa credential — ở đây là seed AVD mang phiên đăng nhập Google — **"không thấy lỗi" không phải bằng chứng an toàn**. Phải có một phép kiểm khẳng định (`is_private == true`), không phải phép kiểm phủ định (không báo lỗi). Và đẩy lên registry là **không thu hồi được**: xoá repo sau đó không lấy lại thứ đã bị pull hay index.

---

## 2026-08-12 — `KVM_GID` lấy bằng `getent group kvm` là hỏi nhầm máy

**Vấn đề**: xác định `KVM_GID` cho `compose.kvm.yaml` trên máy dev Windows.

**Triệu chứng**: `.env` đang để `991` và emulator chạy tốt. Tôi "sửa" thành `993` vì `getent group kvm` trong một distro WSL trả về `993` — và suýt làm emulator tụt về chạy phần mềm. Không có lỗi nào báo ra ở cấu hình sai; chỉ chậm gấp hàng chục lần.

**Nguyên nhân**: `group_add` nhận gid theo **kernel đang chạy container**, tức là VM của docker engine — không phải máy bạn đang gõ lệnh, cũng không phải một distro WSL nào khác. Docker Desktop là **991**; distro WSL cài docker riêng ra số khác; Ubuntu server thường **108**.

**Hiệu quả**: hỏi thẳng chính engine đang dùng, không hỏi host:

```bash
docker run --rm --privileged alpine stat -c %g /dev/kvm
```

**Bài học**: khi một giá trị mô tả **môi trường bên trong container**, mọi lệnh chạy ở host đều là nguồn sai. Và giá trị đang chạy tốt là bằng chứng mạnh hơn tài liệu — trước khi "sửa" một con số, hãy hỏi vì sao nó đang đúng.

---

## 2026-08-12 — Docker Desktop và docker-trong-WSL là hai kho hoàn toàn tách biệt

**Vấn đề**: cần vận hành stack trên máy dev; tài liệu mô tả một distro WSL.

**Triệu chứng**: distro `Ubuntu-24.04` biến mất giữa phiên làm việc (`WSL_E_DISTRO_NOT_FOUND`). Quét cả C: lẫn D: không còn `ext4.vhdx` nào của nó. Kết luận vội: **mất image worker 13 GB và volume chứa phiên đăng nhập CH Play**.

**Thực tế**: không mất gì. Docker Desktop có kho riêng, và nó đang giữ đủ cả image lẫn ba volume. Distro WSL kia chỉ là **một bản sao thứ hai**, cũ hơn.

**Đã thử**: quét `ext4.vhdx` toàn ổ để tìm dữ liệu "đã mất" — vô ích, vì dữ liệu chưa bao giờ ở đó. Việc cần làm ngay từ đầu chỉ là `docker images` trên engine còn lại.

**Nguyên nhân sâu hơn**: tài liệu `deploy/README.md` mô tả distro WSL như thể đó là *máy dev*, nên khi distro mất thì suy luận "mất máy = mất dữ liệu" trông rất hợp lý.

**Bài học**: "engine nào đang chạy" là câu hỏi phải trả lời **trước** mọi thao tác docker, không phải sau khi thấy lạ. `docker context ls` và `docker info` mất một giây. Và khi nghi mất dữ liệu, **kiểm kho còn lại trước khi đi tìm xác** — kết luận mất mát sai làm hỏng phán đoán của mọi bước sau.

---

## 2026-08-12 — `COMPOSE_FILE` dùng dấu phân cách theo OS của CLI

**Vấn đề**: `docker compose` không chạy được trong WSL dù `.env` trông đúng.

**Triệu chứng**:

```text
stat /mnt/d/super-tools/app-relay/deploy/compose.yml;compose.kvm.yaml: no such file or directory
```

Thông báo lỗi có chứa cả chuỗi sai nhưng **không gợi ý gì tới dấu phân cách** — rất dễ đọc thành "thiếu file".

**Nguyên nhân**: `COMPOSE_PATH_SEPARATOR` mặc định là `;` trên Windows và `:` trên POSIX. Giá trị `compose.yml;compose.kvm.yaml` đúng khi gõ từ Windows, sai khi gõ từ trong WSL — và ngược lại.

**Hiệu quả**: đặt theo OS chạy **docker CLI**, không theo OS của container. Cần dùng cả hai đường thì đặt `COMPOSE_PATH_SEPARATOR` tường minh.

**Bài học**: file `.env` dùng chung giữa Windows và WSL có ít nhất hai giá trị phụ thuộc nền tảng — cái này và `KVM_GID`. Ghi comment ngay trong `.env`, vì lỗi sinh ra không nói gì về nguyên nhân.

---

## 2026-08-12 — MCP server chết im vì không bung dấu `~`

**Vấn đề**: cấu hình `@fangjunjie/ssh-mcp-server` trong `.mcp.json` với `--ssh-config-file ~/.ssh/config`.

**Triệu chứng**: Claude Code **không có tool nào** của server đó. Không báo lỗi ở UI, restart nhiều lần vẫn vậy. Trông y hệt "MCP chưa được duyệt".

**Đã thử**: restart nhiều lần, kiểm `.mcp.json` bằng mắt — cú pháp JSON hoàn toàn hợp lệ.

**Nguyên nhân**: gói không tự bung `~`. Trên Linux shell bung trước khi truyền, còn Windows spawn thẳng nên tiến trình nhận đúng chữ `~/.ssh/config`, không tìm thấy file, **thoát ngay lúc khởi động** — nên không kịp đăng ký tool nào.

**Hiệu quả**: đường dẫn tuyệt đối. Xác minh bằng cách tự dựng server và làm handshake JSON-RPC thay vì đoán:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}' | npx -y @fangjunjie/ssh-mcp-server --ssh-config-file "C:/Users/<user>/.ssh/config" --host <alias>
# [ERROR] SSH config file not found: ~/.ssh/config     ← trước khi sửa
# [INFO]  MCP server connection established            ← sau khi sửa
```

**Bài học**: "MCP không có tool" gần như luôn là **server chết lúc khởi động**, không phải vấn đề quyền. Chạy tay đúng lệnh trong `.mcp.json` là cách nhanh nhất thấy stderr thật. Và `~` chỉ là quy ước của shell — mọi tiến trình spawn trực tiếp đều nhận nó như một ký tự bình thường.

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

**Triệu chứng**: `wget --spider http://localhost:5500/v1/health` trong container trả `ECONNREFUSED`, nhưng `curl` từ host vào `127.0.0.1:5500` thì được.

**Nguyên nhân**: trong container, `localhost` phân giải ra `::1` (IPv6) trước. Server `app.listen(PORT, '0.0.0.0')` chỉ bind IPv4.

**Hiệu quả**: healthcheck dùng `http://127.0.0.1:5500/v1/health`.

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

> **Tái diễn 2026-08-12.** Distro tự tắt sau ~3 phút không có phiên nào mở, đúng lúc đang test — mọi cổng thành `ERR_CONNECTION_REFUSED` và trông như container hỏng. Chuyển hẳn sang **Docker Desktop** thì không còn dính, vì nó tự giữ VM sống. Dùng docker trong distro WSL mà không có tiến trình keepalive thì lỗi này **sẽ** quay lại.

---

## 2026-08-07 — Lock AVD sót lại sau SIGTERM

**Vấn đề**: sau khi distro bị thu hồi, emulator không boot lại được.

**Triệu chứng**: `wait-for-emulator.sh` quay vòng tới lúc hết giờ. `adb devices` rỗng. Emulator thoát ngay mà không báo gì rõ ràng.

**Nguyên nhân**: SIGTERM giữa chừng để lại lock: `chpay.avd/multiinstance.lock`, `chpay.avd/hardware-qemu.ini.lock`, `avd/running/pid_*.ini`. Lần sau emulator tưởng đã có instance khác nên thoát.

**Hiệu quả**: xoá đúng ba loại lock đó.

> **Không đụng `userdata-qemu.img*`** — phiên đăng nhập Google nằm trong đấy. Xoá là phải đăng nhập lại tay qua noVNC.

**Bài học**: khi một tiến trình có thể bị giết bất ngờ, biết **file lock nào an toàn để xoá** và file nào **tuyệt đối không** là kiến thức vận hành phải viết ra, không để trong đầu.

> **Tái diễn 2026-08-12**, lần này thông báo lỗi rõ hơn và đáng ghi lại vì đó là thứ người sau sẽ gõ vào google:
>
> ```text
> FATAL | Running multiple emulators with the same AVD is an experimental feature.
>         Please use -read-only flag to enable this feature.
> ```
>
> Nghe như "đang có hai emulator", nhưng `pgrep -a qemu-system` rỗng — chỉ là khoá mồ côi. Nguyên nhân lần này là `docker compose up -d` **recreate** container (kill cứng bản cũ), không phải distro bị thu hồi. Nghĩa là mọi thao tác recreate/restart đều có thể sinh ra nó, không riêng sự cố máy.
>
> Đây chính là lý do `compose.prod.yaml` đặt `stop_grace_period: 120s`. Máy dev không nạp file đó nên **dev dính thường xuyên hơn production**.

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
