# Rule — code trông như thế nào

Khác [system-prompt.md](system-prompt.md): file kia là cách AI **cư xử**, file này là cách code **trông**.

Mọi quy tắc dưới đây rút từ code đang có, không phải quy ước mới nghĩ ra.

---

## 1. Naming

| Loại | Quy ước | Ví dụ |
|---|---|---|
| Hàm, biến | `camelCase` | `listArtifactFiles`, `minFreeBytes` |
| Type, interface, class | `PascalCase` | `ArtifactFile`, `RelayApiClient` |
| Zod schema | `PascalCase` + hậu tố `Schema` | `CreateJobRequestSchema` |
| Type suy ra từ schema | cùng tên, bỏ `Schema` | `type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>` |
| Hằng module | `SCREAMING_SNAKE` | `ARTIFACT_DIR`, `LEDGER`, `PACKAGE_ID_REGEX` |
| Cột DB | `snake_case` | `delete_after_download` |
| Trường JSON API | `camelCase` | `deleteAfterDownload` |
| Event type | `dot.case`, `<danh từ>.<động từ quá khứ>` | `apk.pulled`, `job.claimed`, `artifact.ready` |
| `error.code` | `SCREAMING_SNAKE` | `NOTHING_SELECTED`, `SHA256_MISMATCH` |
| File router | `<tài nguyên>.router.ts` | `jobs.router.ts` |
| File test | `<tên>.test.ts` cạnh nguồn | `api.test.ts` |
| Migration | `NNN_mô_tả.sql` | `002_artifact_directory.sql` |

### Ranh giới snake_case ↔ camelCase

DB dùng `snake_case`, API trả `camelCase`. Chỗ chuyển đổi là **duy nhất một chỗ**: [utils/formatters.ts](../apps/api/src/utils/formatters.ts).

```ts
// Đúng — router trả qua formatter
res.json({ data: (data || []).map(formatJobResponse) });

// Sai — tự map trong router, rải rác quy tắc đổi tên
res.json({ data: rows.map(r => ({ jobId: r.id, packageId: r.package_id })) });
```

Formatter còn làm việc thứ hai: **lọc trường nội bộ**. `formatArtifactResponse()` cố ý không trả `locator` và `storage_backend`. Thêm cột mới vào bảng thì phải quyết định có đưa vào formatter hay không — mặc định là **không**.

---

## 2. Cấu trúc một file

Thứ tự import:

```ts
// 1. builtin Node
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

// 2. thư viện ngoài
import { Router, Request, Response } from 'express';
import archiver from 'archiver';

// 3. package trong workspace
import { selectorMatches, isApkPath } from '@app-relay/contracts';

// 4. nội bộ — đường dẫn tương đối, LUÔN có đuôi .js
import { supabase } from '../../database/supabase.js';
import { jobArtifactDir } from '../../utils/artifact-path.js';
```

**Đuôi `.js` là bắt buộc** kể cả khi nguồn là `.ts`. Đây là ESM: thiếu đuôi thì typecheck vẫn qua nhưng chạy sẽ `ERR_MODULE_NOT_FOUND`.

Router: một `const router = Router()`, các route theo thứ tự CRUD (`POST` tạo → `GET` danh sách → `GET` chi tiết → hành động), `export default router` ở cuối.

Mỗi route có comment một dòng ghi method + path trước nó:

```ts
// POST /v1/jobs/:jobId/retry
router.post('/:jobId/retry', requirePublicAuth, async (req, res) => {
```

---

## 3. Xử lý lỗi

### Trong router: trả, không throw

```ts
router.post('/…', requirePublicAuth, async (req, res) => {
  try {
    const body = SomeSchema.parse(req.body);
    // …
    res.json({ data: … });
  } catch (err: any) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: err.message } });
  }
});
```

Mọi handler bọc `try/catch`. Không có error middleware chung — cố ý, để mỗi endpoint tự chọn mã lỗi mặc định của nó (`400` cho endpoint nhận body, `500` cho endpoint chỉ đọc).

### Thân lỗi luôn cùng một dạng

```ts
{ error: { code: 'SCREAMING_SNAKE', message: 'câu người đọc được' } }
```

`code` là hợp đồng — client phân nhánh theo nó. `message` không phải hợp đồng, đổi lúc nào cũng được.

### Fail fast lúc boot

```ts
const API_TOKEN = requireEnv('API_TOKEN');   // throw ngay lúc nạp module
```

Cấu hình sai thì container chết khi boot, không chạy ngầm với fallback không an toàn. Đây là **ngoại lệ duy nhất** cho luật "không side effect lúc import".

### Nuốt lỗi phải có lý do ghi thành văn

```ts
// Đúng — nói rõ vì sao im lặng là an toàn
await fs.promises.rm(abs, { force: true }).catch(() => {});   // đã bị xoá bởi lượt quét trước

// Đúng — chọn hướng an toàn khi không đo được
} catch {
  // Không đo được thì coi như còn chỗ: thà nhận job rồi hỏng ở bước ghi
  // còn hơn đứng im vĩnh viễn vì một lỗi đo đạc.
  return Number.MAX_SAFE_INTEGER;
}

// Sai — nuốt trần
} catch {}
```

### Tác vụ nền không được làm sập tiến trình

Mọi hàm trong `background/cleanup.ts` bọc `try/catch` ở cấp ngoài cùng và chỉ log. Một lỗi khi dọn artifact không được kéo cả API xuống.

Và: **query DB lỗi thì không xoá gì cả.** Chạy tiếp sẽ thấy mọi thư mục như mồ côi và xoá sạch artifact hợp lệ.

---

## 4. Comment

**Giải thích vì sao, không giải thích cái gì.** Repo này đang làm rất tốt điểm đó — giữ nguyên chuẩn.

```ts
// Đúng — ghi lại lý do và cả bằng chứng
// Cố ý KHÔNG khai là text/html.
//
// CDN đứng trước API viết lại nội dung text/html trên đường truyền:
// Cloudflare bật sẵn Email Address Obfuscation… Đo được: page.html của Zalo
// phình từ 1.185.094 lên 1.185.454 byte và sha256 lệch hoàn toàn.
'.html': 'application/octet-stream',

// Sai — kể lại đúng thứ code đã nói
// Đặt content type cho html
'.html': 'application/octet-stream',
```

Ba loại comment **bắt buộc**:

1. **Lựa chọn phản trực giác** — `127.0.0.1` thay vì `localhost`, `finish` thay vì `close`, `200` thay vì `206`.
2. **Chốt an toàn** — vì sao `.eq('status', job.status)` phải có, vì sao query lỗi thì không xoá.
3. **Phương án đã loại** — vì sao không tính lại sha256 lúc finalize, vì sao không ký `select`/`path`.

Comment tiếng Việt hay tiếng Anh đều được, nhưng **nhất quán trong một file**.

---

## 5. Cấm

| Cấm | Ngoại lệ |
|---|---|
| `any` | ranh giới Supabase (`data: any[]`) — client không sinh type. Không lan ra ngoài router |
| `console.log` trong đường chạy production của API | log có prefix của tác vụ nền (`[Cleanup]`, `[Reaper]`) và của worker (`[Worker]`, `[Upload]`) |
| Số ma thuật | mọi TTL, ngưỡng, timeout đọc từ env kèm mặc định |
| Ternary lồng nhau | |
| Side effect lúc import | `requireEnv()` — cố ý fail fast |
| Sửa migration đã commit | không có; checksum sẽ từ chối |
| Import chéo `api` ↔ `worker` | không có; chỉ qua HTTP |
| `contracts` import từ `apps/` | không có; nó là tầng đáy |
| Đọc `process.env` trong `contracts` | không có |
| Bỏ đuôi `.js` khi import | không có |

### Số ma thuật — đúng và sai

```ts
// Đúng
const apkTtlHours = parseInt(process.env.APK_TTL_HOURS || '6', 10);

// Sai
const apkExpiry = Date.now() + 6 * 3600 * 1000;
```

Hằng số **không** phải cấu hình thì đặt tên và để cạnh chỗ dùng:

```ts
const LEDGER = '.uploads.jsonl';
const cutoff = now - 60000;   // worker im lặng > 60s coi như offline
```

---

## 6. Validate ở biên

Mọi đầu vào từ ngoài đi qua zod schema trong `packages/contracts`:

```ts
const body = CreateJobRequestSchema.parse(req.body);
const query = JobQuerySchema.parse(req.query);
```

Ba loại đầu vào **không** dùng zod mà có hàm chuyên biệt, vì cần logic bảo mật riêng:

| Đầu vào | Hàm | Chống gì |
|---|---|---|
| `packageId` | `isValidPackageId()` | command injection qua `adb shell` |
| đường dẫn trong artifact | `normalizeEntryPath()` + `resolveEntry()` | path traversal, dotfile, `%`-encoding hỏng |
| giá trị trong filter PostgREST `.or()` | `escapePostgrestValue()` | tiêm thêm nhánh OR |

Ba hàm đó là **chốt bảo mật**, không phải tiện ích. Sửa chúng thì phải chạy `impact` và đọc kỹ comment bên trong.

---

## 7. Xử lý file lớn — luôn dùng stream

APK 68 MB không bao giờ được nằm trong bộ nhớ.

```ts
// Đúng — hash và đo ngay trên luồng đang ghi xuống đĩa
const meter = new Transform({
  transform(chunk, _enc, cb) { sizeBytes += chunk.length; hash.update(chunk); cb(null, chunk); },
});
await pipeline(req, meter, fs.createWriteStream(abs));

// Sai
const buf = await streamToBuffer(req);
```

Dùng `pipeline()` từ `stream/promises`, không tự nối `.pipe()`: nó huỷ mọi stream và reject nếu một đầu đứt, thay vì treo mãi chờ sự kiện `finish` không bao giờ đến.

Ghi file hỏng giữa chừng thì **xoá file** trước khi trả lỗi. Để lại file dở dang sẽ làm `fileCount` lúc finalize lệch.

---

## 8. Truy vấn database

### Ràng điều kiện vào trạng thái vừa đọc

```ts
// Đúng — lệch trạng thái thì update không trúng dòng nào, trả 409
const { data: updated } = await supabase
  .from('jobs')
  .update({ status: targetStatus, … })
  .eq('id', jobId)
  .eq('status', job.status)      // ← chốt
  .select('status');

if (!updated || updated.length === 0) {
  // đọc lại rồi để client quyết định
}
```

Thiếu `.eq('status', …)` thì worker claim đúng khe giữa `SELECT` và `UPDATE` sẽ bị ghi đè — job báo `cancelled` nhưng emulator vẫn cài app và vẫn upload artifact.

Cùng nguyên tắc: mọi update do worker gọi đều ràng `.eq('worker_id', body.workerId)`.

### `single()` vs `maybeSingle()`

- `single()` — không có dòng là **lỗi**. Dùng khi thiếu là bất thường.
- `maybeSingle()` — không có dòng là **hợp lệ**, trả `null`. Dùng khi thiếu là chuyện bình thường (job chưa có artifact).

### Không viết SQL thô trong router

Nghiệp vụ cần nguyên tử thì viết thành function Postgres (`claim_job()`) và gọi qua `supabase.rpc()`.

---

## 9. Khi nào tách hàm, khi nào tách file

**Tách hàm** khi:

- Logic lặp lại ở hai chỗ trở lên → `armDeleteAfterDownload()` dùng cho cả nhánh một file và nhánh ZIP.
- Cần comment dài giải thích một khối → tách ra và đặt comment lên hàm.
- Cần test riêng → `selectorMatches()`, `normalizeEntryPath()`, `parseRange()` đều là hàm thuần vì thế.

**Tách file** khi:

- Nhóm hàm có cùng một mối quan tâm → `artifact-path.ts` (đường dẫn) tách khỏi `artifact-store.ts` (nội dung).
- Cần dùng ở cả `api` và `worker` → đưa vào `packages/contracts`, nhưng chỉ khi nó **thuần**: không đọc đĩa, không gọi DB, không đọc env.

**Không tách** khi hàm chỉ dùng một lần và ngắn hơn cái tên của nó.

---

## 10. Test

Đặt cạnh file nguồn: `src/api.test.ts`, không phải `tests/api.test.ts`.

Dùng `node:test` chạy qua `tsx --test`. `pnpm test` ở mỗi package chạy `typecheck` trước rồi mới test — typecheck hỏng thì không tốn thời gian chạy test.

Ưu tiên test hàm thuần: `selectorMatches`, `selectorFor`, `isApkPath`, `normalizeEntryPath`, `parseRange`, `escapePostgrestValue`, `verifyDownloadUrlSignature`. Chúng không cần server, không cần DB, chạy trong mili giây, và là nơi bug gây hậu quả nặng nhất.

Xem [test-case.md](test-case.md).

---

## 11. Commit và branch

Theo đúng lịch sử đang có:

```text
feat:  tính năng mới
fix:   sửa lỗi
chore: hạ tầng, tài liệu, cấu hình
```

Một dòng tóm tắt, thân commit giải thích **vì sao** nếu không hiển nhiên.

Breaking change ghi rõ trong thân commit và trong [changelog.md](changelog.md).

Branch: `main` là nhánh chính, cũng là nhánh deploy. Nhánh làm việc đặt theo `<loại>/<mô-tả-ngắn>`.

---

## 12. Trước khi commit

```bash
pnpm typecheck
pnpm test
node .gitnexus/run.cjs detect-changes --repo app-relay
```

Sửa symbol thì **trước đó** đã phải chạy:

```bash
node .gitnexus/run.cjs impact <symbolName> --repo app-relay --direction upstream
```

Danh sách đầy đủ ở [checklist.md](checklist.md).
