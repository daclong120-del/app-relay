/**
 * Kiểm chứng Public API đang chạy thật, rồi xuất toàn bộ bằng chứng ra `work/`.
 *
 * Khác bộ `test:endpoints` ở chỗ: mỗi lượt gọi đều được ghi hình đầy đủ —
 * request nguyên văn, toàn bộ header, thân phản hồi — kèm điều kiện tiên quyết
 * và quy tắc trong `new_setup/api-endpoint.md` mà nó kiểm chứng. Kết quả là một
 * báo cáo tự đứng được, đọc mà không cần mở mã nguồn.
 *
 *   pnpm probe:endpoints                          # đọc đích từ new_setup/api-endpoint.md
 *   pnpm probe:endpoints -- --base=… --token=…    # chỉ định đích khác
 *   pnpm probe:endpoints -- --no-downloads        # bỏ phần tải artifact về đĩa
 *   pnpm probe:endpoints -- --keep-jobs           # không huỷ job probe tạo ra
 */
import path from 'path';
import { loadTarget } from './target.js';
import { Probe } from './probe.js';
import { discover, runCases, cleanup, type ProbeState } from './cases.js';
import { summarize, writeReport } from './report.js';

async function main(): Promise<void> {
  const target = loadTarget();
  const probe = new Probe(target);
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  console.log('Kiểm chứng endpoint app-relay');
  console.log(`  đích   : ${target.baseUrl}   (${target.baseSource})`);
  console.log(`  token  : ${target.apiToken.slice(0, 12)}…${target.apiToken.slice(-4)}   (${target.tokenSource})`);
  console.log(`  kết quả: ${target.outDir}\n`);

  console.log('── Dò tiền đề ──');
  const state: ProbeState = { batchJobIds: [], files: [], presentSelects: [], absentSelects: [] };
  const discovery = await discover(probe, state);
  for (const n of discovery) console.log(`  · ${n.replace(/`/g, '')}`);

  console.log('\n── Kiểm chứng ──');
  await runCases(probe, state);

  console.log('\n── Dọn dẹp ──');
  const cleanupNotes = await cleanup(probe, state);
  for (const n of cleanupNotes) console.log(`  · ${n.replace(/`/g, '')}`);

  const durationMs = Date.now() - t0;
  const files = writeReport(probe, {
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs,
    discovery,
    cleanup: cleanupNotes,
  });

  const s = summarize(probe.cases);
  console.log('\n' + '='.repeat(70));
  console.log(
    `  ${s.pass} PASS · ${s.fail} FAIL · ${s.skip} SKIP  —  ` +
      `${s.checksPassed}/${s.checks} phép kiểm, ${s.calls} lượt gọi đã ghi hình`
  );
  console.log('='.repeat(70));

  console.log('\nĐã xuất:');
  for (const f of files) console.log(`  ${f}`);
  console.log(`  ${probe.rawDir}${path.sep}  (${probe.calls.filter((c) => c.response.savedAs).length} thân phản hồi)`);

  // Thoát khác 0 khi có endpoint không đạt, để dùng được trong CI.
  process.exit(s.fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Probe dừng bất thường:', err?.message ?? err);
  process.exit(2);
});
