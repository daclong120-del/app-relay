import { createHash } from 'crypto';
import type { Harness } from './harness.js';

// Package id cố ý KHÔNG có thật: `complete` upsert vào bảng `apps`, nên dùng id
// thật sẽ ghi đè metadata của app thật bằng dữ liệu test.
const TEST_PACKAGE = 'com.apprelay.endpointtest';
const PLAY_URL = `https://play.google.com/store/apps/details?id=${TEST_PACKAGE}`;
const TEST_WORKER = 'worker_endpoint_test';

/** Trả job đang giữ về hàng đợi, giữ nguyên trạng thái queued. */
async function release(h: Harness, jobId: string): Promise<void> {
  await h.internal(`/jobs/${jobId}/fail`, {
    method: 'POST',
    body: JSON.stringify({
      workerId: TEST_WORKER,
      error: { code: 'ENDPOINT_TEST_RELEASE', message: 'trả lại hàng đợi', retryable: true },
    }),
  });
}

/**
 * Tạo một job rồi giành đúng nó bằng `claim`.
 *
 * `claim_job` luôn lấy job cũ nhất theo `priority desc, created_at asc`, nên
 * gọi claim ngay sau khi tạo sẽ nhận về job của người khác chứ không phải của
 * mình. Cách duy nhất tới lượt mình là **giành và giữ** những job đứng trước:
 * job đã sang `running` thì lượt claim sau không chọn lại nữa. Giữ xong thì
 * trả hết về hàng đợi.
 *
 * Trả `null` nếu hàng đợi quá sâu hoặc worker thật cướp mất — khi đó các test
 * phụ thuộc sẽ SKIP kèm lý do, thay vì FAIL oan.
 */
async function claimOwnJob(h: Harness, maxDrain = 20): Promise<string | null> {
  const created = await h.json('/jobs', {
    auth: 'api',
    body: JSON.stringify({ playUrl: PLAY_URL, includeListing: false, includeScreenshots: false }),
  });
  const wanted = created.body?.data?.jobId;
  if (!wanted) return null;

  const held: string[] = [];
  try {
    for (let i = 0; i < maxDrain; i++) {
      const claimed = await h.internal('/jobs/claim', {
        method: 'POST',
        body: JSON.stringify({ workerId: TEST_WORKER }),
      });

      if (claimed.status === 204) break; // hàng đợi rỗng mà vẫn chưa tới lượt mình
      const id = claimed.body?.data?.jobId;
      if (!id) break;

      if (id === wanted) return wanted;
      held.push(id);
    }
  } finally {
    for (const id of held) await release(h, id).catch(() => {});
  }

  await h.json(`/jobs/${wanted}/cancel`, { auth: 'api', body: '{}' }).catch(() => {});
  return null;
}

export async function runInternalCases(h: Harness): Promise<void> {
  console.log('\n── Internal Worker API (/internal/v1) ──');

  // 1. POST /workers/heartbeat
  await h.run('POST /workers/heartbeat', 'internal', 'đăng ký worker, chặn token public', async () => {
    const noAuth = await h.internal('/workers/heartbeat', {
      method: 'POST',
      auth: 'none',
      body: JSON.stringify({ workerId: TEST_WORKER }),
    });
    h.status(noAuth, 401, 'không token');

    // Token public không được dùng cho API nội bộ; có token nhưng sai → 403.
    const wrongToken = await h.internal('/workers/heartbeat', {
      method: 'POST',
      auth: 'api',
      body: JSON.stringify({ workerId: TEST_WORKER }),
    });
    h.status(wrongToken, 403, 'dùng nhầm API_TOKEN');

    const res = await h.internal('/workers/heartbeat', {
      method: 'POST',
      body: JSON.stringify({
        workerId: TEST_WORKER,
        name: 'Endpoint Test Worker',
        version: '1.0.0',
        capabilities: { avd: 'chpay', maxConcurrentJobs: 1 },
        stats: { emulatorReady: false },
      }),
    });
    h.status(res, 200);
  });

  // 2. POST /jobs/claim
  await h.run('POST /jobs/claim', 'internal', '200 khi có job, 204 khi hàng đợi rỗng', async () => {
    const res = await h.internal('/jobs/claim', {
      method: 'POST',
      body: JSON.stringify({ workerId: TEST_WORKER }),
    });
    h.status(res, [200, 204], 'claim');

    if (res.status === 200) {
      h.fields(
        res.body?.data,
        ['jobId', 'packageId', 'playUrl', 'includeListing', 'includeScreenshots', 'attempt', 'leaseExpiresAt'],
        'data'
      );
      // Trả lại ngay để không giữ job của hệ thống.
      await release(h, res.body.data.jobId);
    }
  });

  const jobId = await claimOwnJob(h);

  if (!jobId) {
    const reason = 'không giành được job (worker thật đang chạy — dừng worker rồi chạy lại)';
    for (const ep of [
      'POST /jobs/:jobId/heartbeat',
      'POST /jobs/:jobId/events',
      'PUT /jobs/:jobId/files/*',
      'POST /jobs/:jobId/artifact/finalize',
      'POST /jobs/:jobId/complete',
      'POST /jobs/:jobId/fail',
      'POST /jobs/:jobId/cancelled',
    ]) {
      h.skip(ep, 'internal', 'cần một job đang running', reason);
    }
    return;
  }

  // 3. POST /jobs/:jobId/heartbeat
  await h.run('POST /jobs/:jobId/heartbeat', 'internal', 'gia hạn lease + cờ huỷ', async () => {
    const res = await h.internal(`/jobs/${jobId}/heartbeat`, {
      method: 'POST',
      body: JSON.stringify({ workerId: TEST_WORKER, progress: 40, currentStep: 'pulling_apk' }),
    });
    h.status(res, 200);
    h.fields(res.body?.data, ['leaseExpiresAt', 'cancelRequested'], 'data');
    h.check(res.body?.data?.cancelRequested === false, 'chưa yêu cầu huỷ');

    const badStep = await h.internal(`/jobs/${jobId}/heartbeat`, {
      method: 'POST',
      body: JSON.stringify({ workerId: TEST_WORKER, progress: 40, currentStep: 'buoc_khong_ton_tai' }),
    });
    h.status(badStep, 400, 'currentStep ngoài danh sách');

    const badProgress = await h.internal(`/jobs/${jobId}/heartbeat`, {
      method: 'POST',
      body: JSON.stringify({ workerId: TEST_WORKER, progress: 500 }),
    });
    h.status(badProgress, 400, 'progress > 100');
  });

  // 4. POST /jobs/:jobId/events
  await h.run('POST /jobs/:jobId/events', 'internal', 'ghi timeline', async () => {
    const res = await h.internal(`/jobs/${jobId}/events`, {
      method: 'POST',
      body: JSON.stringify({
        eventType: 'endpoint.test',
        level: 'info',
        message: 'ghi từ bộ test endpoint',
        data: { source: 'test-endpoints' },
      }),
    });
    h.status(res, 200);

    // Event vừa ghi phải đọc lại được qua API public.
    const events = await h.json(`/jobs/${jobId}/events`, { auth: 'api' });
    const found = (events.body?.data ?? []).some((e: any) => e.eventType === 'endpoint.test');
    h.check(found, 'event đọc lại được qua /v1/jobs/:id/events');

    const badLevel = await h.internal(`/jobs/${jobId}/events`, {
      method: 'POST',
      body: JSON.stringify({ eventType: 'x', level: 'khong_hop_le', message: 'x' }),
    });
    h.status(badLevel, 400, 'level ngoài danh sách');
  });

  // 5. PUT /jobs/:jobId/files/*
  const fileBody = Buffer.from('noi dung gia lap cho bo test endpoint');
  const fileSha = createHash('sha256').update(fileBody).digest('hex');

  await h.run('PUT /jobs/:jobId/files/*', 'internal', 'upload + verify sha + chặn traversal', async () => {
    const res = await h.internal(`/jobs/${jobId}/files/playstore/description.md`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Content-SHA256': fileSha },
      body: fileBody,
    });
    h.status(res, 200);
    h.fields(res.body, ['status', 'path', 'sizeBytes', 'sha256'], 'thân');
    h.check(res.body?.sha256 === fileSha, 'sha256 khớp', `${res.body?.sha256} ≠ ${fileSha}`);

    const mismatch = await h.internal(`/jobs/${jobId}/files/mismatch.txt`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream', 'X-Content-SHA256': 'a'.repeat(64) },
      body: fileBody,
    });
    h.status(mismatch, 400, 'sha256 lệch');
    h.check(mismatch.body?.error?.code === 'SHA256_MISMATCH', 'mã lỗi SHA256_MISMATCH');

    // `..` viết thẳng bị chính URL parser của client gộp lại trước khi gửi, nên
    // server nhận /internal/v1/etc/passwd và Express trả 404 — request không tới
    // được handler. Dạng percent-encoded mới thực sự chạm vào guard và phải bị
    // chặn 400. Cả hai đều an toàn; điều bắt buộc là không được 2xx.
    const traversals: Array<[string, number[]]> = [
      ['../../../etc/passwd', [400, 404]],
      ['..%2F..%2F..%2Fetc%2Fpasswd', [400]],
      ['%2Fetc%2Fpasswd', [400]],
      ['.uploads.jsonl', [400]],
    ];

    for (const [p, expected] of traversals) {
      const bad = await h.internal(`/jobs/${jobId}/files/${p}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: fileBody,
      });
      h.status(bad, expected, `chặn path '${p}'`);
      h.check(bad.status >= 400, `'${p}' không được ghi thành công`, `nhận ${bad.status}`);
    }

    const noJob = await h.internal('/jobs/job_khong_ton_tai_that/files/a.txt', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: fileBody,
    });
    h.status(noJob, 404, 'job không tồn tại');
  });

  // 6. POST /jobs/:jobId/artifact/finalize
  await h.run('POST /jobs/:jobId/artifact/finalize', 'internal', 'chốt artifact, chặn worker lạ', async () => {
    const wrongOwner = await h.internal(`/jobs/${jobId}/artifact/finalize`, {
      method: 'POST',
      body: JSON.stringify({ workerId: 'worker_gia_mao', fileName: 'x', fileCount: 1 }),
    });
    h.status(wrongOwner, 409, 'worker không sở hữu job');
    h.check(wrongOwner.body?.error?.code === 'NOT_JOB_OWNER', 'mã lỗi NOT_JOB_OWNER');

    const wrongCount = await h.internal(`/jobs/${jobId}/artifact/finalize`, {
      method: 'POST',
      body: JSON.stringify({ workerId: TEST_WORKER, fileName: 'com.zing.zalo', fileCount: 99 }),
    });
    h.status(wrongCount, 400, 'số file không khớp đĩa');

    const res = await h.internal(`/jobs/${jobId}/artifact/finalize`, {
      method: 'POST',
      body: JSON.stringify({ workerId: TEST_WORKER, fileName: 'endpoint-test', fileCount: 1 }),
    });
    h.status(res, 200);
    h.fields(res.body, ['status', 'fileCount', 'sizeBytes'], 'thân');
  });

  // 7. POST /jobs/:jobId/complete
  await h.run('POST /jobs/:jobId/complete', 'internal', 'đóng job và cập nhật apps', async () => {
    const res = await h.internal(`/jobs/${jobId}/complete`, {
      method: 'POST',
      body: JSON.stringify({
        workerId: TEST_WORKER,
        result: { versionName: '0.0.0-test', versionCode: 1, splitCount: 0, screenshotCount: 0 },
      }),
    });
    h.status(res, 200);

    const job = await h.json(`/jobs/${jobId}`, { auth: 'api' });
    h.check(job.body?.data?.status === 'completed', 'job → completed', String(job.body?.data?.status));
    h.check(job.body?.data?.progress === 100, 'progress = 100', String(job.body?.data?.progress));
  });

  // 8. POST /jobs/:jobId/fail
  const failJobId = await claimOwnJob(h);
  if (failJobId) {
    await h.run('POST /jobs/:jobId/fail', 'internal', 'lỗi không retry được → failed', async () => {
      const res = await h.internal(`/jobs/${failJobId}/fail`, {
        method: 'POST',
        body: JSON.stringify({
          workerId: TEST_WORKER,
          error: { code: 'ENDPOINT_TEST', message: 'lỗi cố ý từ bộ test', retryable: false },
        }),
      });
      h.status(res, 200);

      const job = await h.json(`/jobs/${failJobId}`, { auth: 'api' });
      h.check(job.body?.data?.status === 'failed', 'job → failed', String(job.body?.data?.status));
      h.check(job.body?.data?.errorCode === 'ENDPOINT_TEST', 'giữ nguyên errorCode');

      // Job đã failed thì retry phải được chấp nhận — đây là đường hợp lệ duy nhất.
      const retry = await h.json(`/jobs/${failJobId}/retry`, { auth: 'api', body: '{}' });
      h.status(retry, 200, 'retry job failed');
      h.check(retry.body?.data?.status === 'queued', 'retry → queued');
      await h.json(`/jobs/${failJobId}/cancel`, { auth: 'api', body: '{}' });
    });
  } else {
    h.skip('POST /jobs/:jobId/fail', 'internal', 'cần job running', 'không giành được job');
  }

  // 9. POST /jobs/:jobId/cancelled
  const cancelJobId = await claimOwnJob(h);
  if (cancelJobId) {
    await h.run('POST /jobs/:jobId/cancelled', 'internal', 'worker xác nhận đã huỷ', async () => {
      await h.json(`/jobs/${cancelJobId}/cancel`, { auth: 'api', body: '{}' });

      const res = await h.internal(`/jobs/${cancelJobId}/cancelled`, {
        method: 'POST',
        body: JSON.stringify({ workerId: TEST_WORKER, reason: 'xác nhận từ bộ test endpoint' }),
      });
      h.status(res, 200);

      const job = await h.json(`/jobs/${cancelJobId}`, { auth: 'api' });
      h.check(job.body?.data?.status === 'cancelled', 'job → cancelled', String(job.body?.data?.status));
    });
  } else {
    h.skip('POST /jobs/:jobId/cancelled', 'internal', 'cần job running', 'không giành được job');
  }
}
