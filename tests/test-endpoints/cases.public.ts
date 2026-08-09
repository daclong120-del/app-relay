import type { Harness } from './harness.js';

const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.zing.zalo';

export interface PublicState {
  /** Job vừa tạo, dùng cho các test sau. Bị huỷ ở bước dọn dẹp. */
  createdJobId?: string;
  batchJobId?: string;
  /** Job đã completed sẵn trên hệ thống — cần để test nhóm artifact. */
  completedJobId?: string;
  artifactId?: string;
}

export async function runPublicCases(h: Harness, state: PublicState): Promise<void> {
  console.log('\n── Public API (/v1) ──');

  // 1. GET /health
  await h.run('GET /health', 'public', 'không cần token', async () => {
    const res = await h.json('/health');
    h.status(res, 200);
    h.fields(res.body, ['status', 'service', 'version'], 'thân');
    h.check(res.body?.status === 'ok', 'status = ok', JSON.stringify(res.body));
  });

  // 2. GET /system/status
  await h.run('GET /system/status', 'public', 'chặn khi thiếu token + đúng shape', async () => {
    const noAuth = await h.json('/system/status');
    h.status(noAuth, 401, 'không token');

    // 401 khi thiếu credentials, 403 khi có mà sai — API phân biệt hai ca này.
    const badAuth = await h.json('/system/status', {
      headers: { Authorization: 'Bearer sai_token_hoan_toan' },
    });
    h.status(badAuth, 403, 'token sai');

    const res = await h.json('/system/status', { auth: 'api' });
    h.status(res, 200, 'có token');
    h.fields(res.body?.data, ['database', 'jobs', 'workers'], 'data');
    h.fields(res.body?.data?.jobs, ['queued', 'running', 'failed'], 'data.jobs');
    h.fields(res.body?.data?.workers, ['online', 'busy', 'offline'], 'data.workers');
  });

  // 3. GET /apps
  await h.run('GET /apps', 'public', 'phân trang + tìm kiếm', async () => {
    h.status(await h.json('/apps'), 401, 'không token');

    const res = await h.json('/apps?page=1&pageSize=5', { auth: 'api' });
    h.status(res, 200);
    h.check(Array.isArray(res.body?.data), 'data là mảng', JSON.stringify(res.body)?.slice(0, 120));
    h.fields(res.body?.pagination, ['page', 'pageSize', 'total'], 'pagination');

    const search = await h.json('/apps?search=zalo', { auth: 'api' });
    h.status(search, 200, 'search');
  });

  // 4. GET /apps/:packageId
  await h.run('GET /apps/:packageId', 'public', 'có thật → 200, không có → 404', async () => {
    const known = await h.json('/apps/com.zing.zalo', { auth: 'api' });
    h.status(known, [200, 404], 'app đã kéo');
    if (known.status === 200) {
      h.fields(known.body?.data, ['packageId', 'playUrl'], 'data');
    }

    const unknown = await h.json('/apps/com.khong.ton.tai.that', { auth: 'api' });
    h.status(unknown, 404, 'app không tồn tại');
  });

  // 5. POST /jobs
  await h.run('POST /jobs', 'public', 'tạo job, idempotency, URL sai', async () => {
    h.status(await h.json('/jobs', { body: JSON.stringify({ playUrl: PLAY_URL }) }), 401, 'không token');

    const key = `endpoint-test-${Date.now()}`;
    const res = await h.json('/jobs', {
      auth: 'api',
      headers: { 'Idempotency-Key': key },
      body: JSON.stringify({ playUrl: PLAY_URL, includeListing: true, includeScreenshots: true }),
    });
    h.status(res, 201);
    h.fields(res.body?.data, ['jobId', 'packageId', 'status', 'createdAt'], 'data');
    h.check(res.body?.data?.status === 'queued', 'status = queued', String(res.body?.data?.status));
    state.createdJobId = res.body?.data?.jobId;

    // Cùng Idempotency-Key phải trả lại đúng job cũ với 200, không tạo job mới.
    const again = await h.json('/jobs', {
      auth: 'api',
      headers: { 'Idempotency-Key': key },
      body: JSON.stringify({ playUrl: PLAY_URL }),
    });
    h.status(again, 200, 'idempotency lặp lại');
    h.check(
      again.body?.data?.jobId === state.createdJobId,
      'idempotency trả đúng job cũ',
      `${again.body?.data?.jobId} ≠ ${state.createdJobId}`
    );

    const bad = await h.json('/jobs', {
      auth: 'api',
      body: JSON.stringify({ playUrl: 'https://play.google.com/store/apps/details?khong=co-id' }),
    });
    h.status(bad, 400, 'URL không có packageId');
  });

  // 6. POST /jobs/batch
  await h.run('POST /jobs/batch', 'public', 'tạo nhiều job, có batchId', async () => {
    const res = await h.json('/jobs/batch', {
      auth: 'api',
      body: JSON.stringify({
        urls: [PLAY_URL, 'https://play.google.com/store/apps/details?id=com.facemoji.lite'],
        includeListing: false,
        includeScreenshots: false,
      }),
    });
    h.status(res, 201);
    h.fields(res.body?.data, ['batchId', 'jobs'], 'data');
    h.check(Array.isArray(res.body?.data?.jobs), 'data.jobs là mảng');
    h.check(res.body?.data?.jobs?.length === 2, 'tạo đủ 2 job', `nhận ${res.body?.data?.jobs?.length}`);
    state.batchJobId = res.body?.data?.batchId;
    for (const j of res.body?.data?.jobs ?? []) {
      state.createdJobId = state.createdJobId ?? j.jobId;
    }
  });

  // 7. GET /jobs
  await h.run('GET /jobs', 'public', 'phân trang + lọc status/batchId/packageId', async () => {
    const res = await h.json('/jobs?page=1&pageSize=5', { auth: 'api' });
    h.status(res, 200);
    h.check(Array.isArray(res.body?.data), 'data là mảng');
    h.fields(res.body?.pagination, ['page', 'pageSize', 'total'], 'pagination');

    const byStatus = await h.json('/jobs?status=completed', { auth: 'api' });
    h.status(byStatus, 200, 'lọc status');
    const wrongStatus = (byStatus.body?.data ?? []).filter((j: any) => j.status !== 'completed');
    h.check(wrongStatus.length === 0, 'lọc status trả đúng', `${wrongStatus.length} job sai status`);
    state.completedJobId = byStatus.body?.data?.[0]?.jobId;

    const byPkg = await h.json('/jobs?packageId=com.zing.zalo', { auth: 'api' });
    h.status(byPkg, 200, 'lọc packageId');

    if (state.batchJobId) {
      const byBatch = await h.json(`/jobs?batchId=${state.batchJobId}`, { auth: 'api' });
      h.status(byBatch, 200, 'lọc batchId');
      h.check((byBatch.body?.data?.length ?? 0) >= 1, 'batchId trả về job của batch');
    }
  });

  // 8. GET /jobs/:jobId
  await h.run('GET /jobs/:jobId', 'public', 'chi tiết + artifact, không lộ trường nội bộ', async () => {
    if (!state.createdJobId) throw new Error('không có jobId từ bước tạo job');

    const res = await h.json(`/jobs/${state.createdJobId}`, { auth: 'api' });
    h.status(res, 200);
    h.fields(res.body?.data, ['jobId', 'packageId', 'status', 'progress', 'artifact'], 'data');

    // Tài liệu cấm trả locator / storage_backend / idempotency_key cho client.
    const leaked = ['locator', 'storage_backend', 'storageBackend', 'idempotencyKey', 'idempotency_key']
      .filter((k) => k in (res.body?.data ?? {}));
    h.check(leaked.length === 0, 'không lộ trường nội bộ', `lộ: ${leaked.join(', ')}`);

    h.status(await h.json('/jobs/job_khong_ton_tai_that', { auth: 'api' }), 404, 'job không tồn tại');
  });

  // 9. GET /jobs/:jobId/events
  await h.run('GET /jobs/:jobId/events', 'public', 'timeline theo thứ tự thời gian', async () => {
    if (!state.createdJobId) throw new Error('không có jobId');
    const res = await h.json(`/jobs/${state.createdJobId}/events`, { auth: 'api' });
    h.status(res, 200);
    h.check(Array.isArray(res.body?.data), 'data là mảng');
    if (res.body?.data?.length) {
      h.fields(res.body.data[0], ['id', 'jobId', 'eventType', 'level', 'createdAt'], 'event[0]');
    }
  });

  // 10. POST /jobs/:jobId/cancel
  await h.run('POST /jobs/:jobId/cancel', 'public', 'queued → cancelled', async () => {
    const created = await h.json('/jobs', {
      auth: 'api',
      body: JSON.stringify({ playUrl: PLAY_URL }),
    });
    const jobId = created.body?.data?.jobId;
    if (!jobId) throw new Error('không tạo được job để huỷ');

    const res = await h.json(`/jobs/${jobId}/cancel`, { auth: 'api', body: '{}' });
    h.status(res, 200);
    h.check(
      ['cancelled', 'cancelling'].includes(res.body?.data?.status),
      'status = cancelled|cancelling',
      String(res.body?.data?.status)
    );

    // Huỷ lần hai trên job đã kết thúc phải bị từ chối.
    const twice = await h.json(`/jobs/${jobId}/cancel`, { auth: 'api', body: '{}' });
    h.status(twice, [400, 409], 'huỷ lại job đã huỷ');
  });

  // 11. POST /jobs/:jobId/retry
  await h.run('POST /jobs/:jobId/retry', 'public', 'chỉ job failed mới retry được', async () => {
    if (!state.createdJobId) throw new Error('không có jobId');
    // Job đang queued/running → phải bị từ chối, không được âm thầm reset.
    const res = await h.json(`/jobs/${state.createdJobId}/retry`, { auth: 'api', body: '{}' });
    h.status(res, [400, 409], 'retry job chưa failed');
    h.check(
      res.body?.error?.code === 'INVALID_STATUS',
      'mã lỗi INVALID_STATUS',
      JSON.stringify(res.body?.error)
    );
  });

  // 12. GET /jobs/:jobId/artifact/files
  await h.run('GET /jobs/:jobId/artifact/files', 'public', 'liệt kê file + selector', async () => {
    if (!state.completedJobId) {
      throw new Error('chưa có job completed nào trên hệ thống để kiểm tra');
    }
    const res = await h.json(`/jobs/${state.completedJobId}/artifact/files`, { auth: 'api' });
    h.status(res, 200);
    h.fields(res.body?.data, ['artifactId', 'state', 'totalSizeBytes', 'files'], 'data');
    h.check(Array.isArray(res.body?.data?.files), 'files là mảng');
    if (res.body?.data?.files?.length) {
      h.fields(res.body.data.files[0], ['path', 'sizeBytes', 'sha256', 'select'], 'files[0]');
    }
    state.artifactId = res.body?.data?.artifactId;

    h.status(
      await h.json('/jobs/job_khong_ton_tai_that/artifact/files', { auth: 'api' }),
      404,
      'job không tồn tại'
    );
  });

  // 13. POST /jobs/:jobId/artifact/download-url
  await h.run('POST /jobs/:jobId/artifact/download-url', 'public', 'ký link cho all/select/path', async () => {
    if (!state.completedJobId) throw new Error('chưa có job completed');

    const all = await h.json(`/jobs/${state.completedJobId}/artifact/download-url`, {
      auth: 'api',
      body: '{}',
    });
    h.status(all, 200, 'select mặc định');
    h.fields(all.body?.data, ['downloadUrl', 'expiresAt', 'fileName', 'sizeBytes', 'sha256'], 'data');
    h.check(String(all.body?.data?.downloadUrl).includes('signature='), 'URL có chữ ký');
    h.check(String(all.body?.data?.downloadUrl).includes('expires='), 'URL có thời hạn');

    const shots = await h.json(`/jobs/${state.completedJobId}/artifact/download-url`, {
      auth: 'api',
      body: JSON.stringify({ select: 'screenshots' }),
    });
    h.status(shots, [200, 404], 'select=screenshots');

    const single = await h.json(`/jobs/${state.completedJobId}/artifact/download-url`, {
      auth: 'api',
      body: JSON.stringify({ path: 'playstore/icon.png' }),
    });
    h.status(single, [200, 404], 'path=playstore/icon.png');
    if (single.status === 200) {
      h.check(single.body?.data?.fileCount === 1, 'fileCount = 1', String(single.body?.data?.fileCount));
      h.check(!!single.body?.data?.sha256, 'một file thì có sha256');
    }

    // Tài liệu cấm truyền đồng thời select và path.
    const both = await h.json(`/jobs/${state.completedJobId}/artifact/download-url`, {
      auth: 'api',
      body: JSON.stringify({ select: 'apk', path: 'base.apk' }),
    });
    h.status(both, 400, 'vừa select vừa path');

    const badSelect = await h.json(`/jobs/${state.completedJobId}/artifact/download-url`, {
      auth: 'api',
      body: JSON.stringify({ select: 'khong_ton_tai' }),
    });
    h.status(badSelect, 400, 'selector không hợp lệ');
  });

  // 14. GET /artifacts/:artifactId/download
  await h.run('GET /artifacts/:artifactId/download', 'public', 'chữ ký, Range, path traversal', async () => {
    if (!state.completedJobId) throw new Error('chưa có job completed');

    const link = await h.json(`/jobs/${state.completedJobId}/artifact/download-url`, {
      auth: 'api',
      body: '{}',
    });
    const url: string = link.body?.data?.downloadUrl;
    if (!url) throw new Error('không lấy được downloadUrl');

    // Không cần Bearer token vì URL đã tự mang chữ ký.
    const ok = await h.request(url);
    h.status(ok, 200, 'tải bằng link đã ký');
    h.check(
      (ok.headers.get('content-type') ?? '').includes('zip') ||
        (ok.headers.get('content-disposition') ?? '').includes('attachment'),
      'trả về file đính kèm',
      `content-type=${ok.headers.get('content-type')}`
    );

    const u = new URL(url);
    const base = `${u.origin}${u.pathname}`;
    const expires = u.searchParams.get('expires');

    h.status(await h.request(`${base}?expires=${expires}&signature=deadbeef`), 403, 'chữ ký sai');
    h.status(await h.request(base), 400, 'thiếu chữ ký');

    for (const p of ['../../../etc/passwd', '/etc/passwd', '.uploads.jsonl']) {
      const res = await h.request(`${url}&path=${encodeURIComponent(p)}`);
      h.status(res, 400, `chặn path '${p}'`);
    }

    // Tham số trùng không được âm thầm rơi về 'all' rồi trả cả bundle.
    const dup = await h.request(`${url}&path=base.apk&path=${encodeURIComponent('/etc/passwd')}`);
    h.status(dup, 400, 'hai tham số path');

    // Range: file lớn phải resume được.
    const single = await h.json(`/jobs/${state.completedJobId}/artifact/download-url`, {
      auth: 'api',
      body: JSON.stringify({ path: 'base.apk' }),
    });
    if (single.status === 200) {
      const partial = await h.request(single.body.data.downloadUrl, { headers: { Range: 'bytes=0-99' } });
      h.status(partial, 206, 'Range 0-99');
      h.check(
        partial.headers.get('content-range')?.startsWith('bytes 0-99/') ?? false,
        'có Content-Range',
        String(partial.headers.get('content-range'))
      );
      const tooFar = await h.request(single.body.data.downloadUrl, {
        headers: { Range: 'bytes=99999999999-' },
      });
      h.status(tooFar, 416, 'Range vượt kích thước');
    }
  });
}
