import fs from 'fs';
import path from 'path';
import type { Probe } from './probe.js';

const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.zing.zalo';
const PLAY_URL_2 = 'https://play.google.com/store/apps/details?id=com.facemoji.lite';

/** Selector tài liệu công bố, dùng để đối chiếu selector nào có mặt trong artifact. */
const SELECTORS = ['all', 'apk', 'apk.base', 'apk.splits', 'screenshots', 'listing', 'listing.full', 'metadata'] as const;

/**
 * Bảng selector của tài liệu là cây lồng nhau chứ không phải danh sách rời:
 * `apk` gồm cả base lẫn splits, `listing.full` gồm cả `listing` cộng `page.html`.
 * Trường `select` của mỗi file mang nhóm hẹp nhất, nên muốn biết một selector có
 * file hay không thì phải so theo quan hệ bao hàm.
 */
const CONTAINS: Record<string, string[]> = {
  all: ['apk.base', 'apk.splits', 'screenshots', 'listing', 'listing.full', 'metadata'],
  apk: ['apk.base', 'apk.splits'],
  'apk.base': ['apk.base'],
  'apk.splits': ['apk.splits'],
  screenshots: ['screenshots'],
  listing: ['listing'],
  'listing.full': ['listing', 'listing.full'],
  metadata: ['metadata'],
};

interface ArtifactFile {
  path: string;
  sizeBytes: number;
  sha256: string | null;
  select: string;
}

/** Số file mà một selector sẽ kéo về, tính từ danh sách /artifact/files. */
function countFor(files: ArtifactFile[], select: string): number {
  const group = CONTAINS[select] ?? [];
  return files.filter((f) => group.includes(f.select)).length;
}

export interface ProbeState {
  /** Job probe tự tạo — bị huỷ ở bước dọn. */
  createdJobId?: string;
  idempotencyKey?: string;
  batchId?: string;
  batchJobIds: string[];
  /** Package đã có trong bảng apps, dùng cho GET /apps/:packageId. */
  knownPackageId?: string;
  /** Job đã completed và còn artifact — điều kiện của nhóm artifact. */
  artifactJobId?: string;
  artifactPackageId?: string;
  artifactId?: string;
  files: ArtifactFile[];
  /** Selector thực sự có file trong artifact đã chọn. */
  presentSelects: string[];
  absentSelects: string[];
}

/**
 * Dò tiền đề trước khi chạy: nhóm artifact chỉ kiểm chứng được khi hệ thống đã
 * có sẵn một job `completed` còn artifact. Probe không tự dựng được điều kiện
 * này vì một job thật cần emulator chạy khoảng 60 giây.
 */
export async function discover(p: Probe, state: ProbeState): Promise<string[]> {
  const notes: string[] = [];

  const apps = await p.quiet('/apps?page=1&pageSize=5');
  state.knownPackageId = apps.body?.data?.[0]?.packageId;
  notes.push(
    state.knownPackageId
      ? `Package có sẵn trong bảng apps: \`${state.knownPackageId}\``
      : 'Bảng apps rỗng — GET /apps/:packageId chỉ kiểm chứng được nhánh 404.'
  );

  const completed = await p.quiet('/jobs?status=completed&pageSize=20');
  const jobs: any[] = completed.body?.data ?? [];
  notes.push(`Có ${jobs.length} job \`completed\` trên hệ thống lúc chạy.`);

  for (const job of jobs) {
    const files = await p.quiet(`/jobs/${job.jobId}/artifact/files`);
    const list: ArtifactFile[] = files.body?.data?.files ?? [];
    if (files.status === 200 && list.length > 0) {
      state.artifactJobId = job.jobId;
      state.artifactPackageId = job.packageId;
      state.artifactId = files.body.data.artifactId;
      state.files = list;
      state.presentSelects = SELECTORS.filter((s) => countFor(list, s) > 0);
      state.absentSelects = SELECTORS.filter((s) => countFor(list, s) === 0);
      notes.push(
        `Job dùng cho nhóm artifact: \`${job.jobId}\` (${job.packageId}) — ` +
          `artifact \`${state.artifactId}\`, ${list.length} file, ` +
          `${files.body.data.totalSizeBytes} byte, state \`${files.body.data.state}\`.`,
        `Selector có file: ${state.presentSelects.map((s) => `\`${s}\``).join(', ')}. ` +
          `Selector không có file: ${state.absentSelects.map((s) => `\`${s}\``).join(', ') || '(không có)'}.`
      );
      break;
    }
  }

  if (!state.artifactJobId) {
    notes.push('Không tìm được job completed nào còn artifact — nhóm artifact sẽ bị bỏ qua.');
  }

  return notes;
}

export async function runCases(p: Probe, state: ProbeState): Promise<void> {
  // ── 1. GET /health ──────────────────────────────────────────────────
  await p.endpoint(
    {
      id: 'P01',
      endpoint: 'GET /health',
      title: 'API còn sống, không cần token',
      docRef: '§2 System — “GET /health — không cần token”',
      purpose: 'Xác nhận đích test phản hồi và là đúng service app-relay-api, trước khi tin bất kỳ kết quả nào phía sau.',
      preconditions: ['Không gửi header Authorization', 'Không có tiền đề dữ liệu nào'],
    },
    async () => {
      const res = await p.call({
        label: 'gọi trần, không Authorization',
        condition: 'không token — đây là endpoint duy nhất cùng với link tải được miễn token',
        rule: 'HTTP 200, thân có đủ `status`, `service`, `version`; `status` phải là `ok`',
        path: '/health',
        auth: 'none',
        expectStatus: 200,
      });
      p.fields(res.response.json, ['status', 'service', 'version'], 'thân phản hồi');
      p.equals(res.response.json?.status, 'ok', 'status = "ok"');
      p.equals(res.response.json?.service, 'app-relay-api', 'service = "app-relay-api"');
    }
  );

  // ── 2. GET /system/status ───────────────────────────────────────────
  await p.endpoint(
    {
      id: 'P02',
      endpoint: 'GET /system/status',
      title: 'Trạng thái database, hàng đợi, worker + quy tắc token',
      docRef: '§1.5 Mã lỗi, §2 System',
      purpose: 'Kiểm chứng shape thống kê hệ thống và chứng minh API phân biệt “thiếu token” với “token sai”.',
      preconditions: ['Cần API_TOKEN hợp lệ cho nhánh 200', 'Hai nhánh lỗi cố tình gửi sai để xem mã trả về'],
    },
    async () => {
      const noAuth = await p.call({
        label: 'thiếu hẳn header Authorization',
        condition: 'không token',
        rule: '401 kèm `error.code = UNAUTHORIZED` — tài liệu: 401 là “thiếu header Authorization”',
        path: '/system/status',
        auth: 'none',
        expectStatus: 401,
      });
      p.equals(noAuth.response.json?.error?.code, 'UNAUTHORIZED', 'mã lỗi UNAUTHORIZED');

      const badAuth = await p.call({
        label: 'có token nhưng sai',
        condition: 'Authorization: Bearer apr_live_khong_ton_tai',
        rule: '403 kèm `error.code = FORBIDDEN` — tài liệu tách 403 khỏi 401 để client biết là “đừng thử lại”',
        path: '/system/status',
        auth: 'raw',
        rawToken: 'apr_live_khong_ton_tai',
        expectStatus: 403,
      });
      p.equals(badAuth.response.json?.error?.code, 'FORBIDDEN', 'mã lỗi FORBIDDEN');

      const ok = await p.call({
        label: 'token đúng',
        condition: 'Authorization: Bearer <API_TOKEN>',
        rule: '200, `data` có `database`, `jobs{queued,running,failed}`, `workers{online,busy,offline}`',
        path: '/system/status',
        auth: 'api',
        expectStatus: 200,
      });
      p.fields(ok.response.json?.data, ['database', 'jobs', 'workers'], 'data');
      p.fields(ok.response.json?.data?.jobs, ['queued', 'running', 'failed'], 'data.jobs');
      p.fields(ok.response.json?.data?.workers, ['online', 'busy', 'offline'], 'data.workers');
      p.equals(ok.response.json?.data?.database, 'ok', 'database = "ok"');
    }
  );

  // ── 3. GET /apps ────────────────────────────────────────────────────
  await p.endpoint(
    {
      id: 'P03',
      endpoint: 'GET /apps',
      title: 'Danh sách app đã kéo, phân trang và tìm kiếm',
      docRef: '§2 Apps — `GET /apps?page=1&pageSize=20`, `GET /apps?search=…`',
      purpose: 'Kiểm chứng danh sách trả về là mảng có phân trang, và `search` được chấp nhận như tài liệu mô tả.',
      preconditions: ['Cần API_TOKEN', 'Không đòi hỏi bảng apps có dữ liệu — mảng rỗng vẫn hợp lệ'],
    },
    async () => {
      await p.call({
        label: 'không token',
        condition: 'bỏ Authorization',
        rule: '401 — mọi endpoint trừ /health và link tải đều đòi token',
        path: '/apps',
        auth: 'none',
        expectStatus: 401,
      });

      const page = await p.call({
        label: 'phân trang page=1&pageSize=5',
        condition: 'token đúng, giới hạn 5 bản ghi',
        rule: '200, `data` là mảng, `pagination` có `page`, `pageSize`, `total`; `pageSize` phải đúng bằng giá trị đã xin',
        path: '/apps?page=1&pageSize=5',
        auth: 'api',
        expectStatus: 200,
      });
      p.check(Array.isArray(page.response.json?.data), 'data là mảng', JSON.stringify(page.response.json)?.slice(0, 160));
      p.fields(page.response.json?.pagination, ['page', 'pageSize', 'total'], 'pagination');
      p.equals(page.response.json?.pagination?.pageSize, 5, 'pagination.pageSize = 5 đúng như đã xin');
      p.check(
        (page.response.json?.data?.length ?? 0) <= 5,
        'không trả quá pageSize',
        `nhận ${page.response.json?.data?.length} bản ghi`
      );

      const search = await p.call({
        label: 'tìm kiếm search=zalo',
        condition: 'token đúng, lọc theo chuỗi',
        rule: '200 và mọi bản ghi trả về phải khớp chuỗi tìm kiếm ở packageId hoặc title',
        path: '/apps?search=zalo',
        auth: 'api',
        expectStatus: 200,
      });
      const rows: any[] = search.response.json?.data ?? [];
      const khongKhop = rows.filter(
        (a) => !`${a.packageId ?? ''} ${a.title ?? ''}`.toLowerCase().includes('zalo')
      );
      p.check(khongKhop.length === 0, 'search chỉ trả bản ghi khớp', `${khongKhop.length} bản ghi không chứa "zalo"`);
    }
  );

  // ── 4. GET /apps/:packageId ─────────────────────────────────────────
  await p.endpoint(
    {
      id: 'P04',
      endpoint: 'GET /apps/:packageId',
      title: 'Chi tiết một app, và 404 khi không có',
      docRef: '§2 Apps; §1.5 — “404: job / app / file không tồn tại”',
      purpose: 'Kiểm chứng nhánh tra cứu thành công và nhánh không tồn tại trả đúng 404 chứ không phải 200 rỗng.',
      preconditions: [
        state.knownPackageId
          ? `Bảng apps đang có \`${state.knownPackageId}\` (lấy từ GET /apps lúc dò tiền đề)`
          : 'Bảng apps rỗng — chỉ kiểm chứng được nhánh 404',
      ],
    },
    async () => {
      if (state.knownPackageId) {
        const known = await p.call({
          label: `app có thật: ${state.knownPackageId}`,
          condition: 'packageId lấy từ chính GET /apps nên chắc chắn tồn tại',
          rule: '200, `data` có `packageId` và `playUrl`, `packageId` trả về đúng cái đã hỏi',
          path: `/apps/${state.knownPackageId}`,
          auth: 'api',
          expectStatus: 200,
        });
        p.fields(known.response.json?.data, ['packageId', 'playUrl'], 'data');
        p.equals(known.response.json?.data?.packageId, state.knownPackageId, 'trả đúng app đã hỏi');
      }

      const unknown = await p.call({
        label: 'app không tồn tại',
        condition: 'packageId bịa: com.khong.ton.tai.that',
        rule: '404 kèm thân lỗi dạng `{error:{code,message}}` — không được trả 200 với data rỗng',
        path: '/apps/com.khong.ton.tai.that',
        auth: 'api',
        expectStatus: 404,
      });
      p.fields(unknown.response.json?.error, ['code', 'message'], 'error');
    }
  );

  // ── 5. POST /jobs ───────────────────────────────────────────────────
  await p.endpoint(
    {
      id: 'P05',
      endpoint: 'POST /jobs',
      title: 'Tạo job, idempotency, và từ chối URL sai',
      docRef: '§2 Jobs — “Gửi lại cùng Idempotency-Key trả 200 kèm đúng job cũ”',
      purpose: 'Kiểm chứng đường đặt hàng chính: tạo được job ở trạng thái `queued`, gửi lại không sinh job trùng, URL thiếu `?id=` bị chặn.',
      preconditions: ['Cần API_TOKEN', 'Idempotency-Key sinh theo timestamp nên mỗi lần chạy là một khoá mới'],
      sideEffects: 'Tạo 1 job thật trong hàng đợi. Bước dọn cuối sẽ huỷ.',
    },
    async () => {
      await p.call({
        label: 'không token',
        condition: 'body hợp lệ nhưng bỏ Authorization',
        rule: '401 — không được tạo job cho người gọi vô danh',
        path: '/jobs',
        method: 'POST',
        auth: 'none',
        body: JSON.stringify({ playUrl: PLAY_URL }),
        expectStatus: 401,
      });

      const key = `probe-${Date.now()}`;
      state.idempotencyKey = key;

      const created = await p.call({
        label: 'tạo job mới',
        condition: `token đúng, Idempotency-Key: ${key}, playUrl hợp lệ`,
        rule: '201, `data` có `jobId`, `packageId`, `status`, `createdAt`; `status` = `queued`; `packageId` tách đúng từ `?id=`',
        path: '/jobs',
        method: 'POST',
        auth: 'api',
        headers: { 'Idempotency-Key': key },
        body: JSON.stringify({ playUrl: PLAY_URL, includeListing: true, includeScreenshots: true }),
        expectStatus: 201,
      });
      p.fields(created.response.json?.data, ['jobId', 'packageId', 'status', 'createdAt'], 'data');
      p.equals(created.response.json?.data?.status, 'queued', 'status = "queued"');
      p.equals(created.response.json?.data?.packageId, 'com.zing.zalo', 'packageId tách đúng từ playUrl');
      state.createdJobId = created.response.json?.data?.jobId;

      const again = await p.call({
        label: 'gửi lại đúng Idempotency-Key đó',
        condition: `cùng khoá ${key}, mô phỏng client retry khi mạng lỗi`,
        rule: '200 (không phải 201) và `jobId` trùng job đã tạo — tài liệu: “không tạo job mới”',
        path: '/jobs',
        method: 'POST',
        auth: 'api',
        headers: { 'Idempotency-Key': key },
        body: JSON.stringify({ playUrl: PLAY_URL }),
        expectStatus: 200,
      });
      p.equals(again.response.json?.data?.jobId, state.createdJobId, 'trả lại đúng job cũ, không sinh job trùng');

      const bad = await p.call({
        label: 'playUrl thiếu ?id=',
        condition: 'URL Play Store nhưng không có tham số id',
        rule: '400 — tài liệu: “URL thiếu ?id=” thuộc nhóm 400, client phải sửa request',
        path: '/jobs',
        method: 'POST',
        auth: 'api',
        body: JSON.stringify({ playUrl: 'https://play.google.com/store/apps/details?khong=co-id' }),
        expectStatus: 400,
      });
      p.fields(bad.response.json?.error, ['code', 'message'], 'error');
    }
  );

  // ── 6. POST /jobs/batch ─────────────────────────────────────────────
  await p.endpoint(
    {
      id: 'P06',
      endpoint: 'POST /jobs/batch',
      title: 'Tạo nhiều job trong một lượt, có batchId chung',
      docRef: '§2 Jobs — “Mỗi job trong batch có artifact riêng”',
      purpose: 'Kiểm chứng batch trả về đúng số job đã gửi và một `batchId` để tra ngược ở GET /jobs.',
      preconditions: ['Cần API_TOKEN', 'Gửi 2 URL khác package để thấy batch tách job theo từng URL'],
      sideEffects: 'Tạo 2 job thật. Bước dọn cuối sẽ huỷ cả hai.',
    },
    async () => {
      const res = await p.call({
        label: 'batch 2 URL',
        condition: 'token đúng, includeListing/includeScreenshots = false cho nhẹ',
        rule: '201, `data` có `batchId` và `jobs`; `jobs` là mảng đúng 2 phần tử, mỗi phần tử có `jobId`, `packageId`, `status`',
        path: '/jobs/batch',
        method: 'POST',
        auth: 'api',
        body: JSON.stringify({
          urls: [PLAY_URL, PLAY_URL_2],
          includeListing: false,
          includeScreenshots: false,
        }),
        expectStatus: 201,
      });

      const data = res.response.json?.data;
      p.fields(data, ['batchId', 'jobs'], 'data');
      p.check(Array.isArray(data?.jobs), 'data.jobs là mảng');
      p.equals(data?.jobs?.length, 2, 'tạo đúng 2 job cho 2 URL');
      if (Array.isArray(data?.jobs) && data.jobs.length) {
        p.fields(data.jobs[0], ['jobId', 'packageId', 'status'], 'jobs[0]');
        const packages = data.jobs.map((j: any) => j.packageId);
        p.check(
          packages.includes('com.zing.zalo') && packages.includes('com.facemoji.lite'),
          'mỗi URL thành một job đúng package',
          packages.join(', ')
        );
      }
      state.batchId = data?.batchId;
      state.batchJobIds = (data?.jobs ?? []).map((j: any) => j.jobId);
    }
  );

  // ── 7. GET /jobs ────────────────────────────────────────────────────
  await p.endpoint(
    {
      id: 'P07',
      endpoint: 'GET /jobs',
      title: 'Danh sách job, lọc theo status / batchId / packageId',
      docRef: '§2 Jobs — “Lọc job”',
      purpose: 'Kiểm chứng mỗi bộ lọc thật sự lọc, chứ không trả về nguyên danh sách rồi bỏ qua tham số.',
      preconditions: [
        'Cần API_TOKEN',
        state.batchId ? `Dùng batchId \`${state.batchId}\` vừa tạo ở P06 để kiểm tra bộ lọc` : 'Không có batchId từ P06',
      ],
    },
    async () => {
      const page = await p.call({
        label: 'phân trang page=1&pageSize=5',
        condition: 'token đúng',
        rule: '200, `data` là mảng, `pagination` có `page`, `pageSize`, `total`',
        path: '/jobs?page=1&pageSize=5',
        auth: 'api',
        expectStatus: 200,
      });
      p.check(Array.isArray(page.response.json?.data), 'data là mảng');
      p.fields(page.response.json?.pagination, ['page', 'pageSize', 'total'], 'pagination');

      const byStatus = await p.call({
        label: 'lọc status=completed',
        condition: 'token đúng',
        rule: '200 và **mọi** bản ghi trả về phải có `status = completed`',
        path: '/jobs?status=completed&pageSize=10',
        auth: 'api',
        expectStatus: 200,
      });
      const sai = (byStatus.response.json?.data ?? []).filter((j: any) => j.status !== 'completed');
      p.check(sai.length === 0, 'lọc status trả đúng trạng thái', `${sai.length} job sai status`);

      const byPkg = await p.call({
        label: 'lọc packageId=com.zing.zalo',
        condition: 'token đúng',
        rule: '200 và mọi bản ghi phải đúng packageId đã lọc',
        path: '/jobs?packageId=com.zing.zalo&pageSize=10',
        auth: 'api',
        expectStatus: 200,
      });
      const saiPkg = (byPkg.response.json?.data ?? []).filter((j: any) => j.packageId !== 'com.zing.zalo');
      p.check(saiPkg.length === 0, 'lọc packageId trả đúng package', `${saiPkg.length} job sai package`);

      if (state.batchId) {
        const byBatch = await p.call({
          label: `lọc batchId=${state.batchId}`,
          condition: 'batchId lấy từ P06',
          rule: '200 và trả về đúng những job của batch đó — số job phải khớp với số job P06 đã tạo',
          path: `/jobs?batchId=${state.batchId}&pageSize=50`,
          auth: 'api',
          expectStatus: 200,
        });
        const ids = (byBatch.response.json?.data ?? []).map((j: any) => j.jobId);
        p.equals(ids.length, state.batchJobIds.length, `batch trả đủ ${state.batchJobIds.length} job`);
        p.check(
          state.batchJobIds.every((id) => ids.includes(id)),
          'batch trả đúng các jobId đã tạo',
          `nhận ${ids.join(', ')}`
        );
      }
    }
  );

  // ── 8. GET /jobs/:jobId ─────────────────────────────────────────────
  await p.endpoint(
    {
      id: 'P08',
      endpoint: 'GET /jobs/:jobId',
      title: 'Chi tiết job, không lộ trường nội bộ, 404 khi không có',
      docRef: '§2 Jobs; §1.3 Trạng thái job',
      purpose: 'Kiểm chứng đây là endpoint client dùng để poll: đủ trường trạng thái, và không rò rỉ locator/storage của server.',
      preconditions: [state.createdJobId ? `Dùng job \`${state.createdJobId}\` tạo ở P05` : 'Không có job từ P05'],
    },
    async () => {
      if (!state.createdJobId) throw new Error('P05 không tạo được job nên không có jobId để tra');

      const res = await p.call({
        label: 'tra job vừa tạo',
        condition: 'token đúng, jobId có thật',
        rule: '200, `data` có `jobId`, `packageId`, `status`, `progress`, `artifact`; `status` nằm trong tập tài liệu công bố',
        path: `/jobs/${state.createdJobId}`,
        auth: 'api',
        expectStatus: 200,
      });
      const data = res.response.json?.data;
      p.fields(data, ['jobId', 'packageId', 'status', 'progress', 'artifact'], 'data');
      p.check(
        ['queued', 'running', 'completed', 'failed', 'cancelling', 'cancelled'].includes(data?.status),
        'status thuộc tập trạng thái tài liệu công bố',
        String(data?.status)
      );

      // Tài liệu không công bố những trường này cho client; lộ ra là rò rỉ bố trí lưu trữ phía server.
      const leaked = ['locator', 'storage_backend', 'storageBackend', 'idempotencyKey', 'idempotency_key'].filter(
        (k) => k in (data ?? {})
      );
      p.check(leaked.length === 0, 'không lộ trường nội bộ (locator/storage_backend/idempotency_key)', `lộ: ${leaked.join(', ')}`);

      await p.call({
        label: 'job không tồn tại',
        condition: 'jobId bịa',
        rule: '404 — tài liệu xếp job không tồn tại vào nhóm “không thử lại”',
        path: '/jobs/job_khong_ton_tai_that',
        auth: 'api',
        expectStatus: 404,
      });
    }
  );

  // ── 9. GET /jobs/:jobId/events ──────────────────────────────────────
  await p.endpoint(
    {
      id: 'P09',
      endpoint: 'GET /jobs/:jobId/events',
      title: 'Timeline của job',
      docRef: '§2 Jobs — `GET /jobs/:jobId/events`',
      purpose: 'Kiểm chứng timeline trả về mảng event có shape ổn định và xếp theo thời gian.',
      preconditions: [
        state.artifactJobId
          ? `Dùng job \`${state.artifactJobId}\` đã chạy xong nên chắc chắn có event`
          : 'Không có job completed, dùng job vừa tạo (có thể chưa có event nào)',
      ],
    },
    async () => {
      const jobId = state.artifactJobId ?? state.createdJobId;
      if (!jobId) throw new Error('không có jobId nào để tra timeline');

      const res = await p.call({
        label: 'đọc timeline',
        condition: 'token đúng, jobId có thật',
        rule: '200, `data` là mảng; mỗi event có `id`, `jobId`, `eventType`, `level`, `createdAt`; `createdAt` không giảm dần',
        path: `/jobs/${jobId}/events`,
        auth: 'api',
        expectStatus: 200,
      });

      const events: any[] = res.response.json?.data ?? [];
      p.check(Array.isArray(res.response.json?.data), 'data là mảng');
      if (events.length) {
        p.fields(events[0], ['id', 'jobId', 'eventType', 'level', 'createdAt'], 'event[0]');
        p.check(
          events.every((e) => e.jobId === jobId),
          'mọi event thuộc đúng job đã hỏi'
        );
        const times = events.map((e) => Date.parse(e.createdAt));
        p.check(
          times.every((t, i) => i === 0 || t >= times[i - 1]),
          'event xếp tăng dần theo createdAt'
        );
      } else {
        p.check(true, 'job chưa phát sinh event — mảng rỗng vẫn đúng shape');
      }

      // Tài liệu §1.5 xếp "job không tồn tại" vào 404, và hai endpoint cùng nhận
      // jobId là GET /jobs/:jobId (P08) lẫn /artifact/files (P12) đều trả 404.
      // Giữ nguyên kỳ vọng 404 ở đây để lệch — nếu có — hiện ra thành FAIL kèm
      // bằng chứng, thay vì bị nới lỏng cho đẹp bảng.
      await p.call({
        label: 'job không tồn tại',
        condition: 'jobId bịa',
        rule: '404 — cùng quy tắc với P08 và P12: jobId không tồn tại thì không được trả 200',
        path: '/jobs/job_khong_ton_tai_that/events',
        auth: 'api',
        expectStatus: 404,
      });
    }
  );

  // ── 10. POST /jobs/:jobId/cancel ────────────────────────────────────
  await p.endpoint(
    {
      id: 'P10',
      endpoint: 'POST /jobs/:jobId/cancel',
      title: 'Huỷ job đang chờ, và chặn huỷ lần hai',
      docRef: '§1.3 Trạng thái job; §1.5 — “thao tác sai trạng thái” là 400',
      purpose: 'Kiểm chứng job `queued` huỷ được, và job đã kết thúc thì không huỷ lại được.',
      preconditions: ['Tự tạo một job riêng để huỷ, không đụng vào job của P05'],
      sideEffects: 'Tạo thêm 1 job rồi huỷ ngay trong chính case này.',
    },
    async () => {
      const created = await p.quiet('/jobs', { body: JSON.stringify({ playUrl: PLAY_URL }) });
      const jobId = created.body?.data?.jobId;
      if (!jobId) throw new Error('không tạo được job để huỷ');

      const res = await p.call({
        label: 'huỷ job đang queued',
        condition: `job \`${jobId}\` vừa tạo, chưa được worker nhận`,
        rule: '200 và `status` là `cancelled` (chưa chạy) hoặc `cancelling` (worker đang giữ)',
        path: `/jobs/${jobId}/cancel`,
        method: 'POST',
        auth: 'api',
        body: '{}',
        expectStatus: 200,
      });
      p.check(
        ['cancelled', 'cancelling'].includes(res.response.json?.data?.status),
        'status = cancelled hoặc cancelling',
        String(res.response.json?.data?.status)
      );

      const twice = await p.call({
        label: 'huỷ lại chính job đó',
        condition: 'job đã ở trạng thái kết thúc',
        rule: '400 hoặc 409 — tài liệu: huỷ job đã xong là “thao tác sai trạng thái”',
        path: `/jobs/${jobId}/cancel`,
        method: 'POST',
        auth: 'api',
        body: '{}',
        expectStatus: [400, 409],
      });
      p.fields(twice.response.json?.error, ['code', 'message'], 'error');

      await p.call({
        label: 'huỷ job không tồn tại',
        condition: 'jobId bịa',
        rule: '404',
        path: '/jobs/job_khong_ton_tai_that/cancel',
        method: 'POST',
        auth: 'api',
        body: '{}',
        expectStatus: 404,
      });
    }
  );

  // ── 11. POST /jobs/:jobId/retry ─────────────────────────────────────
  await p.endpoint(
    {
      id: 'P11',
      endpoint: 'POST /jobs/:jobId/retry',
      title: 'Chỉ job failed mới chạy lại được',
      docRef: '§1.3 — “Job failed gọi được retry; completed và cancelled thì không”',
      purpose: 'Kiểm chứng ràng buộc trạng thái của retry: job chưa failed phải bị từ chối bằng mã `INVALID_STATUS`.',
      preconditions: [
        state.createdJobId ? `Job \`${state.createdJobId}\` đang queued/running` : 'Không có job từ P05',
        'Probe không tự làm hỏng một job thật để lấy trạng thái failed — nhánh 200 thuộc bộ test internal',
      ],
    },
    async () => {
      if (!state.createdJobId) throw new Error('không có jobId từ P05');

      const res = await p.call({
        label: 'retry job chưa failed',
        condition: 'job đang ở queued hoặc running',
        rule: '400/409 kèm `error.code = INVALID_STATUS` — không được âm thầm reset job đang chạy',
        path: `/jobs/${state.createdJobId}/retry`,
        method: 'POST',
        auth: 'api',
        body: '{}',
        expectStatus: [400, 409],
      });
      p.equals(res.response.json?.error?.code, 'INVALID_STATUS', 'mã lỗi INVALID_STATUS');

      if (state.artifactJobId) {
        const done = await p.call({
          label: 'retry job đã completed',
          condition: `job \`${state.artifactJobId}\` đã completed`,
          rule: '400/409 — tài liệu nói completed không retry được',
          path: `/jobs/${state.artifactJobId}/retry`,
          method: 'POST',
          auth: 'api',
          body: '{}',
          expectStatus: [400, 409],
        });
        p.equals(done.response.json?.error?.code, 'INVALID_STATUS', 'completed cũng trả INVALID_STATUS');
      }
    }
  );

  // ── 12. GET /jobs/:jobId/artifact/files ─────────────────────────────
  const artifactMeta = {
    preconditions: state.artifactJobId
      ? [
          `Cần một job đã \`completed\` còn artifact — probe chọn \`${state.artifactJobId}\` ở bước dò tiền đề`,
          `Artifact \`${state.artifactId}\` có ${state.files.length} file`,
          'Probe không tự tạo được điều kiện này: một job thật cần emulator chạy khoảng 60 giây',
        ]
      : ['Không có job completed nào còn artifact trên hệ thống lúc chạy'],
  };

  if (!state.artifactJobId) {
    for (const [id, endpoint, title] of [
      ['P12', 'GET /jobs/:jobId/artifact/files', 'Liệt kê file trong artifact'],
      ['P13', 'POST /jobs/:jobId/artifact/download-url', 'Tạo link tải có thời hạn'],
      ['P14', 'GET /artifacts/:artifactId/download', 'Tải bằng link đã ký'],
    ] as const) {
      p.skip(
        {
          id,
          endpoint,
          title,
          docRef: '§2 Artifact',
          purpose: 'Cần một artifact có thật để kiểm chứng.',
          preconditions: artifactMeta.preconditions,
        },
        'không có job completed nào còn artifact'
      );
    }
    return;
  }

  await p.endpoint(
    {
      id: 'P12',
      endpoint: 'GET /jobs/:jobId/artifact/files',
      title: 'Liệt kê file trong artifact kèm selector và sha256',
      docRef: '§2 Artifact — “state là partial khi APK đã hết hạn sớm”',
      purpose: 'Kiểm chứng client xem được artifact có gì trước khi tải, và mỗi file mang sẵn `select` để chọn nhóm.',
      preconditions: artifactMeta.preconditions,
    },
    async () => {
      const res = await p.call({
        label: 'liệt kê file',
        condition: 'token đúng, job đã completed',
        rule: '200, `data` có `artifactId`, `state`, `totalSizeBytes`, `files`; mỗi file có `path`, `sizeBytes`, `sha256`, `select`; `totalSizeBytes` bằng tổng `sizeBytes`',
        path: `/jobs/${state.artifactJobId}/artifact/files`,
        auth: 'api',
        expectStatus: 200,
      });

      const data = res.response.json?.data;
      p.fields(data, ['artifactId', 'state', 'totalSizeBytes', 'files'], 'data');
      p.check(Array.isArray(data?.files), 'files là mảng');
      p.check(['available', 'partial'].includes(data?.state), 'state là available hoặc partial', String(data?.state));

      const files: ArtifactFile[] = data?.files ?? [];
      if (files.length) {
        p.fields(files[0], ['path', 'sizeBytes', 'sha256', 'select'], 'files[0]');
        const tong = files.reduce((n, f) => n + (f.sizeBytes ?? 0), 0);
        p.equals(data?.totalSizeBytes, tong, 'totalSizeBytes bằng tổng sizeBytes từng file');
        const selectLa = files.filter((f) => !SELECTORS.includes(f.select as any));
        p.check(selectLa.length === 0, 'mọi select thuộc bảng selector tài liệu công bố', selectLa.map((f) => f.select).join(', '));
        const pathXau = files.filter((f) => f.path.startsWith('/') || f.path.includes('..'));
        p.check(pathXau.length === 0, 'path luôn là đường dẫn tương đối, không có ..');
      }

      await p.call({
        label: 'job không tồn tại',
        condition: 'jobId bịa',
        rule: '404',
        path: '/jobs/job_khong_ton_tai_that/artifact/files',
        auth: 'api',
        expectStatus: 404,
      });
    }
  );

  // ── 13. POST /jobs/:jobId/artifact/download-url ─────────────────────
  await p.endpoint(
    {
      id: 'P13',
      endpoint: 'POST /jobs/:jobId/artifact/download-url',
      title: 'Ký link cho cả cục / một nhóm / đúng một file',
      docRef: '§2 Artifact — “body nhận select hoặc path, không được cả hai”; “sha256 chỉ có giá trị khi tải một file”',
      purpose: 'Kiểm chứng ba dạng body tài liệu cho phép, và hai dạng tài liệu cấm.',
      preconditions: [
        ...artifactMeta.preconditions,
        `Selector có file trong artifact này: ${state.presentSelects.join(', ')}`,
      ],
    },
    async () => {
      const all = await p.call({
        label: 'body rỗng → cả cục',
        condition: 'body `{}`, tương đương select = all',
        rule: '200, `data` có `downloadUrl`, `expiresAt`, `fileName`, `sizeBytes`, `sha256`, `fileCount`; URL phải mang `expires=` và `signature=`; `expiresAt` ở tương lai',
        path: `/jobs/${state.artifactJobId}/artifact/download-url`,
        method: 'POST',
        auth: 'api',
        body: '{}',
        expectStatus: 200,
      });
      const d = all.response.json?.data;
      p.fields(d, ['downloadUrl', 'expiresAt', 'fileName', 'sizeBytes', 'sha256', 'fileCount'], 'data');
      p.check(String(d?.downloadUrl).includes('signature='), 'downloadUrl mang chữ ký');
      p.check(String(d?.downloadUrl).includes('expires='), 'downloadUrl mang thời hạn');
      p.check(Date.parse(d?.expiresAt) > Date.now(), 'expiresAt ở tương lai', String(d?.expiresAt));
      p.equals(d?.fileCount, state.files.length, `fileCount = ${state.files.length} khớp danh sách file`);

      const select = state.presentSelects.find((s) => s !== 'all');
      if (select) {
        const dem = countFor(state.files, select);
        const grp = await p.call({
          label: `select=${select}`,
          condition: `nhóm này có ${dem} file trong artifact`,
          rule: `200 và \`fileCount\` = ${dem}, đúng số file mà nhóm \`${select}\` bao hàm theo bảng selector`,
          path: `/jobs/${state.artifactJobId}/artifact/download-url`,
          method: 'POST',
          auth: 'api',
          body: JSON.stringify({ select }),
          expectStatus: 200,
        });
        p.equals(grp.response.json?.data?.fileCount, dem, `fileCount = ${dem} đúng số file nhóm ${select}`);
      }

      const absent = state.absentSelects[0];
      if (absent) {
        await p.call({
          label: `select=${absent} (nhóm không có file)`,
          condition: 'selector hợp lệ nhưng artifact này không có file nào thuộc nhóm',
          rule: '404 — tài liệu xếp “file không tồn tại” vào 404',
          path: `/jobs/${state.artifactJobId}/artifact/download-url`,
          method: 'POST',
          auth: 'api',
          body: JSON.stringify({ select: absent }),
          expectStatus: 404,
        });
      }

      const one = state.files[0];
      const single = await p.call({
        label: `path=${one.path}`,
        condition: 'đúng một file lấy từ /artifact/files',
        rule: '200, `fileCount` = 1, `sha256` khác null và trùng sha256 file đó trong /artifact/files, `sizeBytes` khớp',
        path: `/jobs/${state.artifactJobId}/artifact/download-url`,
        method: 'POST',
        auth: 'api',
        body: JSON.stringify({ path: one.path }),
        expectStatus: 200,
      });
      p.equals(single.response.json?.data?.fileCount, 1, 'fileCount = 1');
      p.equals(single.response.json?.data?.sha256, one.sha256, 'sha256 khớp giá trị ở /artifact/files');
      p.equals(single.response.json?.data?.sizeBytes, one.sizeBytes, 'sizeBytes khớp');

      await p.call({
        label: 'vừa select vừa path',
        condition: 'body có cả hai trường',
        rule: '400 — tài liệu ghi rõ “nhận select hoặc path, không được cả hai”',
        path: `/jobs/${state.artifactJobId}/artifact/download-url`,
        method: 'POST',
        auth: 'api',
        body: JSON.stringify({ select: 'listing', path: one.path }),
        expectStatus: 400,
      });

      await p.call({
        label: 'selector không có trong bảng',
        condition: 'select = "khong_ton_tai"',
        rule: '400 — selector lạ thuộc nhóm “sửa request”, không được rơi về all rồi trả cả cục',
        path: `/jobs/${state.artifactJobId}/artifact/download-url`,
        method: 'POST',
        auth: 'api',
        body: JSON.stringify({ select: 'khong_ton_tai' }),
        expectStatus: 400,
      });

      await p.call({
        label: 'path leo thư mục',
        condition: 'path = "../../../etc/passwd"',
        rule: '400 hoặc 404 — tuyệt đối không được 2xx',
        path: `/jobs/${state.artifactJobId}/artifact/download-url`,
        method: 'POST',
        auth: 'api',
        body: JSON.stringify({ path: '../../../etc/passwd' }),
        expectStatus: [400, 404],
      });
    }
  );

  // ── 14. GET /artifacts/:artifactId/download ─────────────────────────
  await p.endpoint(
    {
      id: 'P14',
      endpoint: 'GET /artifacts/:artifactId/download',
      title: 'Tải bằng link đã ký: miễn token, chặn chữ ký sai, hỗ trợ Range',
      docRef: '§2 Artifact — “không cần Bearer token vì URL đã mang chữ ký”; §1.5 — 403 chữ ký sai, 416 Range vượt',
      purpose: 'Kiểm chứng nhánh mà đối tác chỉ cầm link cũng tải được, đồng thời link không bị sửa để lấy thứ khác.',
      preconditions: [...artifactMeta.preconditions, 'Link lấy từ P13, còn hạn 10 phút'],
    },
    async () => {
      const link = await p.quiet(`/jobs/${state.artifactJobId}/artifact/download-url`, { body: '{}' });
      const url: string = link.body?.data?.downloadUrl;
      if (!url) throw new Error('không xin được downloadUrl để kiểm chứng');

      const ok = await p.call({
        label: 'tải bằng link đã ký, KHÔNG gửi token',
        condition: 'không header Authorization — đúng kịch bản “đối tác chỉ nhận file”',
        rule: '200 và trả về file đính kèm (content-disposition attachment hoặc content-type zip)',
        url,
        auth: 'none',
        expectStatus: 200,
        saveAs: 'artifact-bundle.zip',
      });
      p.check(
        (ok.response.headers['content-disposition'] ?? '').includes('attachment') ||
          (ok.response.contentType ?? '').includes('zip'),
        'trả về file đính kèm',
        `content-type=${ok.response.contentType}, disposition=${ok.response.headers['content-disposition']}`
      );
      p.check(ok.response.bytes > 0, 'nhận được byte thật', `${ok.response.bytes} byte`);

      const u = new URL(url);
      const base = `${u.origin}${u.pathname}`;
      const expires = u.searchParams.get('expires');

      await p.call({
        label: 'chữ ký sai',
        condition: 'giữ nguyên expires, thay signature = deadbeef',
        rule: '403 — tài liệu: “403 khi tải: link hết hạn hoặc chữ ký sai”',
        url: `${base}?expires=${expires}&signature=deadbeef`,
        auth: 'none',
        expectStatus: 403,
      });

      await p.call({
        label: 'thiếu hẳn chữ ký',
        condition: 'gọi URL trần không tham số',
        rule: '400 — request thiếu tham số bắt buộc',
        url: base,
        auth: 'none',
        expectStatus: 400,
      });

      await p.call({
        label: 'chữ ký hợp lệ nhưng expires đã qua',
        condition: 'đặt expires về mốc quá khứ, giữ nguyên signature',
        rule: '403 — chữ ký phủ cả expires nên sửa hạn là hỏng chữ ký',
        url: `${base}?expires=1000000000&signature=${u.searchParams.get('signature')}`,
        auth: 'none',
        expectStatus: 403,
      });

      for (const bad of ['../../../etc/passwd', '/etc/passwd', '.uploads.jsonl']) {
        await p.call({
          label: `sửa link để lấy '${bad}'`,
          condition: 'link hợp lệ nhưng gắn thêm ?path= trỏ ra ngoài artifact',
          rule: '400 — chữ ký không phủ `path` nên guard phải tự chặn, tuyệt đối không 2xx',
          url: `${url}&path=${encodeURIComponent(bad)}`,
          auth: 'none',
          expectStatus: 400,
        });
      }

      await p.call({
        label: 'hai tham số path một lúc',
        condition: 'path=<file hợp lệ>&path=/etc/passwd',
        rule: '400 — không được lấy tham số đầu rồi bỏ qua tham số thứ hai',
        url: `${url}&path=${encodeURIComponent(state.files[0].path)}&path=${encodeURIComponent('/etc/passwd')}`,
        auth: 'none',
        expectStatus: 400,
      });

      // Range: lấy link một file để có Content-Length thật.
      const big = [...state.files].sort((a, b) => b.sizeBytes - a.sizeBytes)[0];
      const singleLink = await p.quiet(`/jobs/${state.artifactJobId}/artifact/download-url`, {
        body: JSON.stringify({ path: big.path }),
      });
      const singleUrl: string = singleLink.body?.data?.downloadUrl;

      if (singleUrl && big.sizeBytes > 1) {
        const end = Math.min(big.sizeBytes - 1, 9);
        const partial = await p.call({
          label: `Range: bytes=0-${end} trên ${big.path}`,
          condition: `file thật ${big.sizeBytes} byte, link một file nên có Content-Length`,
          rule: `206 kèm \`Content-Range: bytes 0-${end}/${big.sizeBytes}\` và đúng ${end + 1} byte thân`,
          url: singleUrl,
          auth: 'none',
          headers: { Range: `bytes=0-${end}` },
          expectStatus: 206,
        });
        p.equals(
          partial.response.headers['content-range'],
          `bytes 0-${end}/${big.sizeBytes}`,
          'Content-Range đúng khoảng và tổng kích thước'
        );
        p.equals(partial.response.bytes, end + 1, `thân đúng ${end + 1} byte`);

        await p.call({
          label: 'Range vượt kích thước file',
          condition: 'Range: bytes=99999999999-',
          rule: '416 — tài liệu: “Range vượt kích thước file” thì bỏ header Range',
          url: singleUrl,
          auth: 'none',
          headers: { Range: 'bytes=99999999999-' },
          expectStatus: 416,
        });
      }

      await p.call({
        label: 'artifactId không tồn tại',
        condition: 'thay artifactId bằng UUID bịa, giữ nguyên chữ ký',
        rule: '403 hoặc 404 — chữ ký phủ artifactId nên đổi id là hỏng chữ ký',
        url: `${u.origin}${u.pathname.replace(/artifacts\/[^/]+/, 'artifacts/00000000-0000-0000-0000-000000000000')}?${u.searchParams}`,
        auth: 'none',
        expectStatus: [403, 404],
      });
    }
  );

  // ── E1. Tải toàn bộ artifact về đĩa ─────────────────────────────────
  if (!p.target.skipDownloads) {
    await p.endpoint(
      {
        id: 'E1',
        endpoint: 'GET /artifacts/:artifactId/download (toàn bộ)',
        title: 'Tải mọi selector và mọi file lẻ, đối chiếu SHA-256',
        docRef: '§1.4 Chỉ lấy thứ mình cần',
        purpose:
          'Chứng minh dữ liệu tải về là dữ liệu thật chứ không chỉ là status code: mỗi file lẻ được băm lại và so với sha256 API công bố.',
        preconditions: [
          ...artifactMeta.preconditions,
          'Đi trọn luồng công khai: xin link đã ký rồi tải bằng link đó, không có lối tắt vào đĩa server',
        ],
      },
      async () => {
        const root = path.join(p.target.outDir, 'artifact', state.artifactPackageId ?? 'unknown');

        for (const select of SELECTORS) {
          const coFile = state.presentSelects.includes(select);
          const link = await p.quiet(`/jobs/${state.artifactJobId}/artifact/download-url`, {
            body: JSON.stringify(select === 'all' ? {} : { select }),
          });

          if (!coFile) {
            p.check(link.status === 404, `selector \`${select}\` không có file → 404`, `nhận ${link.status}`);
            continue;
          }

          const res = await p.call({
            label: `tải selector ${select}`,
            condition: `nhóm \`${select}\` có file trong artifact`,
            rule: '200 và ghi được ra đĩa với số byte > 0',
            url: link.body.data.downloadUrl,
            auth: 'none',
            expectStatus: 200,
            saveAs: `select-${select}-${link.body.data.fileName}`,
          });

          if (res.response.savedAs) {
            const from = path.join(p.target.outDir, res.response.savedAs);
            // Nhiều selector có thể cùng gói đúng một file nên trả về cùng tên;
            // gắn tên selector vào để bản tải của từng selector không đè nhau.
            const to = path.join(root, 'by-selector', `${select}--${link.body.data.fileName}`);
            fs.mkdirSync(path.dirname(to), { recursive: true });
            fs.copyFileSync(from, to);
          }
          p.check(res.response.bytes > 0, `selector \`${select}\` trả về byte thật`, `${res.response.bytes} byte`);
        }

        for (const f of state.files) {
          const link = await p.quiet(`/jobs/${state.artifactJobId}/artifact/download-url`, {
            body: JSON.stringify({ path: f.path }),
          });
          if (link.status !== 200) {
            p.check(false, `xin link cho \`${f.path}\``, `HTTP ${link.status}`);
            continue;
          }

          const res = await p.call({
            label: `tải file ${f.path}`,
            condition: `file lẻ, API công bố ${f.sizeBytes} byte, sha256 ${String(f.sha256).slice(0, 12)}…`,
            rule: '200, số byte nhận đúng bằng `sizeBytes`, băm lại đúng bằng `sha256` đã công bố',
            url: link.body.data.downloadUrl,
            auth: 'none',
            expectStatus: 200,
            saveAs: `file-${f.path.replace(/[/\\]/g, '_')}`,
          });

          p.equals(res.response.bytes, f.sizeBytes, `\`${f.path}\`: nhận đủ ${f.sizeBytes} byte`);
          if (f.sha256) p.equals(res.response.sha256, f.sha256, `\`${f.path}\`: sha256 khớp giá trị API công bố`);

          if (res.response.savedAs) {
            const from = path.join(p.target.outDir, res.response.savedAs);
            const to = path.join(root, 'files', f.path);
            fs.mkdirSync(path.dirname(to), { recursive: true });
            fs.copyFileSync(from, to);
          }
        }
      }
    );
  }

  // ── E2. Ranh giới internal ──────────────────────────────────────────
  await p.endpoint(
    {
      id: 'E2',
      endpoint: 'POST /internal/v1/* (ranh giới)',
      title: 'Token public không mở được API nội bộ',
      docRef: '§3 — “Chỉ container worker gọi, trong Docker network. Đối tác không dùng phần này.”',
      purpose:
        'API nội bộ có quyền ghi thẳng vào artifact và đóng job. Kiểm chứng rằng token phát cho đối tác không chạm được tới đó qua đường public.',
      preconditions: ['Suy ra URL internal từ BASE_URL bằng cách thay `/v1` → `/internal/v1`', 'Chỉ gửi request đọc/không phá'],
    },
    async () => {
      const internalBase = p.target.baseUrl.replace(/\/v1$/, '/internal/v1');

      const claim = await p.call({
        label: 'claim job bằng API_TOKEN public',
        condition: 'token đối tác, không phải WORKER_TOKEN',
        rule: '401/403/404 — không được 2xx. Nếu 2xx thì token đối tác đang nhận được job của hệ thống.',
        url: `${internalBase}/jobs/claim`,
        method: 'POST',
        auth: 'api',
        body: JSON.stringify({ workerId: 'probe_khong_phai_worker' }),
        expectStatus: [401, 403, 404],
      });
      p.check(claim.response.status >= 400, 'không nhận được job qua token public', `nhận ${claim.response.status}`);

      const hb = await p.call({
        label: 'heartbeat worker không token',
        condition: 'không Authorization',
        rule: '401/403/404 — không được 2xx',
        url: `${internalBase}/workers/heartbeat`,
        method: 'POST',
        auth: 'none',
        body: JSON.stringify({ workerId: 'probe_khong_phai_worker' }),
        expectStatus: [401, 403, 404],
      });
      p.check(hb.response.status >= 400, 'không đăng ký được worker giả', `nhận ${hb.response.status}`);
    }
  );
}

/** Huỷ mọi job probe đã tạo để không bỏ lại rác trong hàng đợi. */
export async function cleanup(p: Probe, state: ProbeState): Promise<string[]> {
  if (p.target.keepJobs) return ['Giữ nguyên job do probe tạo (cờ `--keep-jobs`).'];

  const ids = new Set([state.createdJobId, ...state.batchJobIds].filter(Boolean) as string[]);
  const done: string[] = [];

  for (const id of ids) {
    const res = await p.quiet(`/jobs/${id}/cancel`, { body: '{}' }).catch(() => ({ status: 0, body: null }));
    // Job đã kết thúc thì cancel trả 400 — không phải lỗi, chỉ nghĩa là không còn gì để huỷ.
    done.push(`\`${id}\` → HTTP ${res.status}`);
  }

  return done.length ? [`Đã yêu cầu huỷ ${done.length} job probe tạo ra: ${done.join(', ')}.`] : ['Probe không tạo job nào.'];
}
