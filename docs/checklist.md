# Checklist — cổng chặn

Bốn cổng: trước commit → trước PR → trước deploy → sau deploy. Cộng thêm quy tắc đồng bộ tài liệu ở §5.

---

## 1. Trước commit

```bash
pnpm typecheck
pnpm test
node .gitnexus/run.cjs detect-changes --repo app-relay
```

- [ ] `pnpm typecheck` xanh
- [ ] `pnpm test` xanh (chạy `typecheck` rồi `tsx --test` cho cả ba package)
- [ ] `detect-changes` chỉ liệt kê symbol và flow **mong đợi** — có cái lạ nghĩa là chạm nhiều hơn dự định
- [ ] Đã chạy `impact` **trước khi sửa** mọi function/class/method:

  ```bash
  node .gitnexus/run.cjs impact <symbolName> --repo app-relay --direction upstream
  ```

- [ ] Kết quả `HIGH`/`CRITICAL` đã được báo cho người dùng trước khi sửa
- [ ] Không còn code chết, không còn `console.log` debug
- [ ] Import nội bộ **có đuôi `.js`** (ESM — thiếu thì typecheck qua nhưng chạy `ERR_MODULE_NOT_FOUND`)
- [ ] Không hardcode TTL / ngưỡng / timeout — đọc từ env kèm mặc định
- [ ] Không `any` mới ngoài ranh giới Supabase
- [ ] Comment mới giải thích **vì sao**, không giải thích **cái gì**
- [ ] Commit message theo `feat:` / `fix:` / `chore:`
- [ ] **Không có secret trong diff**:

  ```bash
  git diff --cached | grep -iE 'sb_secret|apr_live|worker_live|BEGIN [A-Z ]*PRIVATE KEY'
  ```

### Nếu xoá file hoặc thư mục

- [ ] Grep tên đó trong toàn repo trước khi commit:

  ```bash
  grep -rn "<tên-đã-xoá>" --exclude-dir=node_modules --exclude-dir=.git .
  ```

  Tối thiểu kiểm `package.json`, `.github/`, `docs/`, `new_setup/`.

> Đây chính là cách `tests/test-endpoints/` biến mất mà hai script trong `package.json` ở lại — xem [learn.md](learn.md).

---

## 2. Trước PR

- [ ] Đã tự đọc lại toàn bộ diff, không chỉ file mình nhớ đã sửa
- [ ] Đã cập nhật tài liệu liên quan (bảng §5)
- [ ] Breaking change đã ghi vào [changelog.md](changelog.md) và **in đậm**
- [ ] Bài học mới (nếu có) đã ghi vào [learn.md](learn.md)
- [ ] Thêm/sửa endpoint → schema zod trong `packages/contracts` đã cập nhật
- [ ] Thêm biến env → **cả ba** nơi: code, `.env.*.example`, [environment.md](environment.md)
- [ ] Đổi schema DB → migration **mới**, không sửa file cũ (checksum sẽ từ chối)
- [ ] Có test cho phần logic mới, đặt **cạnh** file nguồn (`<tên>.test.ts`)

---

## 3. Trước deploy

### Migration

- [ ] Đã chạy dry-run trên bản sao DB:

  ```bash
  SUPABASE_DB_URL='postgres://…' pnpm exec tsx scripts/db-migrate.ts
  ```

- [ ] Migration **tương thích ngược** với code đang chạy

  > CI chạy `db-migrate` **trước** `build-and-push`. Luôn có một khoảng schema mới chạy cùng code cũ. `add column if not exists` thì an toàn; `drop`/`rename` thì **không** — phải tách làm hai lần deploy.

- [ ] Đã lên kế hoạch `notify pgrst, 'reload schema'` sau khi áp (Cloud tự làm, self-host thì không)

### Cấu hình

- [ ] Biến env mới đã có trên máy đích trong `deploy/.env.*`

  > **Pipeline không đụng tới `.env` trên máy đích.** Thêm biến mà quên sửa tay là container crash lúc boot nếu biến đó đi qua `requireEnv()`.

- [ ] `WORKER_TOKEN` giống hệt nhau ở `.env.api` và `.env.worker`
- [ ] Overlay compose đúng môi trường (`-f` nào, `--profile` nào)
- [ ] Đĩa còn > `ARTIFACT_MIN_FREE_BYTES` (mặc định 10 GB)

### Rollback

- [ ] Biết commit sha đang chạy tốt hiện tại: `git log --oneline -5`
- [ ] Nếu có migration: biết cách hoàn tác **bằng migration mới**, không sửa file cũ
- [ ] Đã backup volume `worker-avd` nếu định đụng vào worker

  ```bash
  docker compose stop worker
  docker run --rm -v deploy_worker-avd:/data -v "$PWD:/backup" alpine \
    tar czf /backup/worker-avd-$(date +%F).tar.gz -C /data .
  docker compose start worker
  ```

### Không bao giờ

- [ ] **Không** `docker compose down -v` — `-v` xoá volume, mất AVD và phiên Google Play
- [ ] **Không** chạy song song Docker Desktop và Docker trong WSL

---

## 4. Sau deploy

```bash
cd /opt/app-relay/deploy
C="docker compose -f compose.yml -f compose.kvm.yaml"
T=$(grep '^API_TOKEN=' .env.api | cut -d= -f2-)
ADB=/opt/android-sdk/platform-tools/adb
```

- [ ] `curl -s http://127.0.0.1:5500/v1/health` → `{"status":"ok",…}`
- [ ] `curl -s -H "Authorization: Bearer $T" .../v1/system/status` → `"database":"ok"`
- [ ] `$C exec -T worker $ADB shell getprop sys.boot_completed` → `1`
- [ ] `$C exec -T worker $ADB shell dumpsys account | grep 'Accounts:'` → `Accounts: 1`
- [ ] `$C ps` — không container nào `restarting`
- [ ] Chạy thử một job thật, tới `completed`
- [ ] Nếu dùng quick tunnel: lấy URL mới và **báo đối tác** (URL đổi mỗi lần restart)

Bất kỳ dòng nào đỏ → quay lại [runbook.md §2](runbook.md).

---

## 5. Đồng bộ tài liệu

| Thay đổi | Phải sửa |
|---|---|
| Đổi schema DB | migration mới + [database-design.md](database-design.md) + `notify pgrst` |
| Thêm/đổi endpoint | [api-design.md](api-design.md) + schema trong `packages/contracts` |
| Thêm `error.code` mới | bảng mã lỗi trong [api-design.md §5](api-design.md) |
| Thêm biến env | code + `.env.*.example` + [environment.md §2/§3](environment.md) |
| Đổi layout artifact hoặc selector | [artifact-design.md](artifact-design.md) + `selectorMatches()` + `selectorFor()` + **changelog breaking** |
| Đổi quyết định kiến trúc | [architecture.md §7](architecture.md) — ghi cả **lý do đổi** và phương án bị loại |
| Đổi compose / profile | [environment.md §5](environment.md) + [runbook.md](runbook.md) |
| Đổi pipeline CI | [CI-CD.md](CI-CD.md) |
| Thêm chốt bảo mật | [security.md §5](security.md) |
| Xong một khối chức năng, hoặc một task trong plan | [features.md](features.md) — đổi trạng thái ✅/🟨 và bảng §5 "chưa có" |
| Gặp lỗi mất thời gian | [learn.md](learn.md), và nếu quan trọng thì thêm dòng vào [system-prompt.md](system-prompt.md) |
| Mọi thay đổi người dùng thấy được | [changelog.md](changelog.md) |

**Nguyên tắc: doc sai nguy hiểm hơn doc thiếu, vì AI tin doc.**

Bằng chứng có thật trong repo này: `new_setup/api-endpoint.md §4` hứa `pnpm test:endpoints` chạy được, trong khi bộ test đã bị xoá. Ai đọc cũng tin là có test phủ 23 endpoint.

---

## 6. Review code AI sinh ra

- [ ] **Có bịa endpoint không?** Đối chiếu với `router.get/post/put` thật, không tin tài liệu.
- [ ] **Có nuốt lỗi không?** `catch {}` trần là không được. Im lặng phải có comment giải thích vì sao an toàn.
- [ ] **Có hardcode không?** TTL, ngưỡng, timeout, đường dẫn.
- [ ] **Có bỏ qua `impact` không?** Sửa symbol mà không chạy là vi phạm quy trình.
- [ ] **Có tự cài package không?** Phải hỏi trước.
- [ ] **Có refactor ngoài phạm vi không?**
- [ ] **Có sửa migration đã commit không?** Cấm tuyệt đối.
- [ ] **Có sửa `new_setup/` không?** Đó là nguồn gốc, tài liệu sống ở `docs/`.
- [ ] **File lớn có dùng stream không?** APK 68 MB không được nằm trong bộ nhớ.
- [ ] **Read-modify-write có mang điều kiện lần đọc không?** `.eq('status', …)` / `.eq('worker_id', …)`.
- [ ] **Thao tác xoá có đủ chốt an toàn không?** Đây là vùng nguy hiểm nhất của dự án — xem §7.

---

## 7. Sửa vùng nguy hiểm — checklist riêng

Năm vùng mà bug **im lặng**: không exception, không log, chỉ là mất dữ liệu.

### Tác vụ dọn dẹp (`background/cleanup.ts`)

- [ ] Query DB lỗi → **không xoá gì cả**
- [ ] Mốc thời gian lấy theo **file mới nhất bên trong**, không phải mtime thư mục gốc
- [ ] Chỉ đụng thư mục đã nguội quá ngưỡng
- [ ] Reaper **không** đụng job `running` còn lượt
- [ ] Đã có test cho CLN-04, CLN-05, CLN-06, CLN-11 ([test-case.md](test-case.md))

### `deleteAfterDownload`

- [ ] Chỉ kích hoạt khi tập file phục vụ **thực sự chứa APK**
- [ ] `res.on('finish')`, không phải `'close'`
- [ ] `statusCode === 200`, không phải `206`
- [ ] Vẫn có ân hạn `DELETE_AFTER_DOWNLOAD_GRACE_MINUTES`

### Xử lý đường dẫn (`utils/artifact-path.ts`)

- [ ] Normalize **rồi** so sánh, không tìm chuỗi `..`
- [ ] Từ chối tuyệt đối, dotfile ở mọi tầng, null byte, `%`-encoding hỏng
- [ ] Chốt cuối: sau `path.resolve()` vẫn nằm trong thư mục artifact
- [ ] Test NEP-06 (`a/../../b` → null) và NEP-07 (`..foo.apk` → hợp lệ) đều xanh

### Escape PostgREST (`utils/postgrest.ts`)

- [ ] Escape **hai lượt đúng thứ tự**: `%`/`_` trước, `\`/`"` sau
- [ ] Giá trị luôn được bọc nháy kép bởi caller

### Xác thực (`middleware/auth.ts`, `utils/signature.ts`)

- [ ] So sánh constant-time, hash trước để độ dài không rò rỉ
- [ ] Kiểm độ dài **trước** `timingSafeEqual` (nó throw khi lệch)
- [ ] Kiểm hạn **trước** khi so chữ ký
- [ ] Không log token, không log URL đã ký

---

## 8. Kiểm định kỳ hàng tuần

Không gắn với deploy nào, chạy để phát hiện trôi:

```bash
# Index GitNexus còn khớp code?
node .gitnexus/run.cjs status --repo app-relay

# Env trong code vs example
grep -rhoE 'process\.env\.[A-Z_]+' apps/api/src | sed 's/process\.env\.//' | sort -u > /tmp/code-env
grep -oE '^[A-Z_]+' deploy/.env.api.example | sort -u > /tmp/example-env
diff /tmp/code-env /tmp/example-env

# Script trong package.json còn trỏ vào file có thật?
grep -oE '"[^"]*\.ts"' package.json

# Đĩa
df -h / | tail -1
```

- [ ] Index GitNexus `up-to-date` (không thì `analyze` rồi cập nhật số trong `CLAUDE.md`)
- [ ] Không có biến env trong code mà thiếu ở example
- [ ] Mọi script trong `package.json` trỏ vào file có thật
- [ ] Đĩa còn trên ngưỡng
- [ ] `Accounts: 1` — phiên Google Play còn sống
