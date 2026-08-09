import { loadConfig } from './config.js';
import { Harness } from './harness.js';
import { runPublicCases, type PublicState } from './cases.public.js';
import { runInternalCases } from './cases.internal.js';
import { summarize, writeReport } from './report.js';

/**
 * Huỷ những job do bộ test tạo ra để không bỏ lại rác trong hàng đợi.
 * Job đã kết thúc thì `cancel` trả 400 — bỏ qua, không phải lỗi.
 */
async function cleanup(h: Harness, state: PublicState): Promise<void> {
  const ids = new Set([state.createdJobId].filter(Boolean) as string[]);

  if (state.batchJobId) {
    const batch = await h.json(`/jobs?batchId=${state.batchJobId}&pageSize=50`, { auth: 'api' });
    for (const j of batch.body?.data ?? []) ids.add(j.jobId);
  }

  for (const id of ids) {
    await h.json(`/jobs/${id}/cancel`, { auth: 'api', body: '{}' }).catch(() => {});
  }
  if (ids.size) console.log(`\nĐã dọn ${ids.size} job do bộ test tạo.`);
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const h = new Harness(cfg);
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  console.log('Bộ test endpoint app-relay');
  console.log(`  public   : ${cfg.baseUrl}`);
  console.log(`  internal : ${cfg.skipInternal ? '(bỏ qua)' : cfg.internalUrl}`);

  // Worker thật cũng poll cùng hàng đợi và sẽ cướp job của nhóm internal.
  try {
    const status = await h.json('/system/status', { auth: 'api' });
    const online = (status.body?.data?.workers?.online ?? 0) + (status.body?.data?.workers?.busy ?? 0);
    if (online > 0 && !cfg.skipInternal) {
      console.log(
        `\n  ⚠ Có ${online} worker đang hoạt động. Nhóm internal cần giành job nên có thể bị cướp.\n` +
          `    Dừng worker trước rồi chạy lại nếu thấy endpoint internal bị bỏ qua.`
      );
    }
  } catch {
    // Không lấy được trạng thái thì cứ chạy; test /system/status sẽ báo lỗi đó.
  }

  const state: PublicState = {};
  await runPublicCases(h, state);

  if (cfg.skipInternal) {
    console.log('\n── Internal Worker API ── bỏ qua (thiếu WORKER_TOKEN hoặc có cờ --no-internal)');
  } else {
    await runInternalCases(h);
  }

  await cleanup(h, state);

  const durationMs = Date.now() - t0;
  const files = writeReport(h.results, { ...cfg, startedAt, durationMs }, cfg.outDir);
  const s = summarize(h.results);

  console.log('\n' + '='.repeat(64));
  console.log(`  ${s.pass} PASS · ${s.fail} FAIL · ${s.skip} SKIP  (trên ${s.total} endpoint, ${s.checks} check)`);
  console.log('='.repeat(64));

  if (s.fail > 0) {
    console.log('\nEndpoint FAIL:');
    for (const r of h.results.filter((x) => x.outcome === 'fail')) {
      console.log(`  ✗ ${r.endpoint} — ${r.checks.find((c) => !c.ok)?.label ?? r.error}`);
    }
  }

  console.log('\nBáo cáo:');
  for (const f of files) console.log(`  ${f}`);

  // Thoát khác 0 khi có endpoint hỏng, để dùng được trong CI.
  process.exit(s.fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Bộ test dừng bất thường:', err?.message ?? err);
  process.exit(2);
});
