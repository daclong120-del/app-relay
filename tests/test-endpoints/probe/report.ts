import fs from 'fs';
import path from 'path';
import type { CaseResult, Probe, RecordedCall } from './probe.js';
import type { Target } from './target.js';

export interface ReportMeta {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  /** Ghi chú từ bước dò tiền đề — điều kiện chung của cả lượt chạy. */
  discovery: string[];
  cleanup: string[];
}

const MARK: Record<string, string> = { pass: 'PASS', fail: 'FAIL', skip: 'SKIP' };

/** Thân dài thì báo cáo chỉ trích một đoạn; bản đầy đủ luôn nằm trong raw/. */
const INLINE_LIMIT = 1600;

export function summarize(cases: CaseResult[]) {
  return {
    total: cases.length,
    pass: cases.filter((c) => c.outcome === 'pass').length,
    fail: cases.filter((c) => c.outcome === 'fail').length,
    skip: cases.filter((c) => c.outcome === 'skip').length,
    checks: cases.reduce((n, c) => n + c.checks.length, 0),
    checksPassed: cases.reduce((n, c) => n + c.checks.filter((x) => x.ok).length, 0),
    calls: cases.reduce((n, c) => n + c.calls.length, 0),
  };
}

function esc(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(2)} MB`;
}

function trim(text: string): { shown: string; cut: boolean } {
  if (text.length <= INLINE_LIMIT) return { shown: text, cut: false };
  return { shown: text.slice(0, INLINE_LIMIT), cut: true };
}

/** Dựng lại request đúng như đã gửi, dạng đọc được bằng mắt. */
function requestBlock(call: RecordedCall): string[] {
  const lines = [`${call.request.method} ${call.request.url}`];
  for (const [k, v] of Object.entries(call.request.headers)) lines.push(`${k}: ${v}`);
  if (call.request.body) {
    lines.push('', call.request.body);
  } else if (call.request.bodyNote) {
    lines.push('', `(${call.request.bodyNote})`);
  } else if (call.request.method !== 'GET') {
    lines.push('', '(không có thân)');
  }
  return ['```http', ...lines, '```'];
}

function responseBlock(call: RecordedCall): string[] {
  const r = call.response;
  if (call.networkError) return ['```text', `không nhận được phản hồi: ${call.networkError}`, '```'];

  const head = [`HTTP ${r.status} ${r.statusText}`.trim()];
  for (const [k, v] of Object.entries(r.headers)) head.push(`${k}: ${v}`);

  const out = ['```http', ...head, '```'];

  if (r.text !== null && r.text.length) {
    const { shown, cut } = trim(r.json !== null ? JSON.stringify(r.json, null, 2) : r.text);
    out.push('', r.json !== null ? '```json' : '```text', shown + (cut ? '\n… (cắt bớt)' : ''), '```');
    if (cut && r.savedAs) out.push(`Thân đầy đủ: \`${r.savedAs}\``);
  } else if (r.bytes > 0) {
    out.push(
      `_Thân nhị phân ${bytes(r.bytes)}, sha256 \`${r.sha256}\`` +
        (r.savedAs ? `, đã lưu vào \`${r.savedAs}\`._` : '._')
    );
  } else {
    out.push('_Không có thân._');
  }
  return out;
}

function caseSection(c: CaseResult): string[] {
  const md: string[] = [];
  md.push(`### ${c.id} · \`${c.endpoint}\` — ${MARK[c.outcome]}`, '');
  md.push(`**${c.title}**`, '');
  md.push(`| | |`, `| --- | --- |`);
  md.push(`| Mục tiêu | ${esc(c.purpose)} |`);
  md.push(`| Tài liệu | ${esc(c.docRef)} |`);
  md.push(`| Điều kiện tiên quyết | ${c.preconditions.map(esc).join('<br>') || '(không)'} |`);
  if (c.sideEffects) md.push(`| Ảnh hưởng dữ liệu | ${esc(c.sideEffects)} |`);
  md.push(`| Số lượt gọi | ${c.calls.length} |`);
  md.push(`| Kết quả | **${MARK[c.outcome]}** — ${c.checks.filter((x) => x.ok).length}/${c.checks.length} phép kiểm, ${c.durationMs}ms |`);
  md.push('');

  if (c.outcome === 'skip') {
    md.push(`> Bỏ qua: ${c.error}`, '');
    return md;
  }

  for (const call of c.calls) {
    md.push(`#### Lượt ${call.seq} — ${call.label}`, '');
    md.push(`- **Điều kiện kèm theo**: ${call.condition}`);
    md.push(`- **Quy tắc phải thoả**: ${call.rule}`);
    md.push(
      `- **Mong đợi**: HTTP ${call.expectedStatus.join(' hoặc ')} · ` +
        `**Nhận được**: HTTP ${call.response.status} (${bytes(call.response.bytes)}, ${call.response.durationMs}ms) · ` +
        `${call.ok ? '✅ khớp' : '❌ lệch'}`
    );
    if (call.response.savedAs) md.push(`- **Thân đã lưu**: \`${call.response.savedAs}\``);
    md.push('');
    md.push('**Input — request gửi đi**', '');
    md.push(...requestBlock(call));
    md.push('');
    md.push('**Output — phản hồi nhận về**', '');
    md.push(...responseBlock(call));
    md.push('');
  }

  md.push(c.outcome === 'pass' ? '**Vì sao kết luận PASS**' : '**Các phép kiểm và kết quả**', '');
  for (const chk of c.checks) {
    md.push(`- ${chk.ok ? '✅' : '❌'} ${chk.label}${chk.ok ? '' : ` — ${chk.detail ?? '(không có chi tiết)'}`}`);
  }
  if (c.error) md.push(`- ❌ lỗi khi chạy case: ${c.error}`);
  md.push('');

  return md;
}

export function writeReport(p: Probe, meta: ReportMeta): string[] {
  const target: Target = p.target;
  const cases = p.cases;
  const s = summarize(cases);
  fs.mkdirSync(target.outDir, { recursive: true });

  const md: string[] = [];

  md.push('# Báo cáo kiểm chứng endpoint — app-relay Public API', '');
  md.push(
    'Mỗi endpoint dưới đây được ghi lại đầy đủ: điều kiện tiên quyết, request gửi đi, ' +
      'phản hồi nhận về, quy tắc trong `new_setup/api-endpoint.md` mà nó phải thoả, và các phép kiểm dẫn tới kết luận.',
    ''
  );

  md.push('## Đích test và điều kiện chung', '');
  md.push('| | |', '| --- | --- |');
  md.push(`| BASE_URL | \`${target.baseUrl}\` |`);
  md.push(`| Nguồn BASE_URL | ${target.baseSource} |`);
  md.push(`| API_TOKEN | \`${target.apiToken.slice(0, 12)}…${target.apiToken.slice(-4)}\` (${target.apiToken.length} ký tự) |`);
  md.push(`| Nguồn API_TOKEN | ${target.tokenSource} |`);
  md.push(`| Bắt đầu | ${meta.startedAt} |`);
  md.push(`| Kết thúc | ${meta.finishedAt} |`);
  md.push(`| Tổng thời gian | ${(meta.durationMs / 1000).toFixed(1)}s |`);
  md.push(`| Timeout mỗi request | ${target.timeoutMs}ms |`);
  md.push(`| Thư mục kết quả | \`${target.outDir}\` |`);
  md.push('');

  md.push('Tiền đề dò được trước khi chạy:', '');
  for (const n of meta.discovery) md.push(`- ${n}`);
  md.push('');

  md.push('## Kết quả tổng hợp', '');
  md.push(
    `**${s.pass} PASS · ${s.fail} FAIL · ${s.skip} SKIP** trên ${s.total} nhóm endpoint — ` +
      `${s.checksPassed}/${s.checks} phép kiểm đạt, qua ${s.calls} lượt gọi HTTP có ghi hình.`,
    ''
  );

  md.push('| Kết quả | Mã | Endpoint | Nội dung kiểm | Lượt gọi | Phép kiểm | Thời gian |', '| --- | --- | --- | --- | --- | --- | --- |');
  for (const c of cases) {
    const chk = c.checks.length ? `${c.checks.filter((x) => x.ok).length}/${c.checks.length}` : '–';
    md.push(
      `| ${MARK[c.outcome]} | ${c.id} | \`${c.endpoint}\` | ${esc(c.title)} | ${c.calls.length} | ${chk} | ${c.durationMs}ms |`
    );
  }
  md.push('');

  const failed = cases.filter((c) => c.outcome === 'fail');
  if (failed.length) {
    md.push('### Điểm không đạt', '');
    for (const c of failed) {
      md.push(`**${c.id} \`${c.endpoint}\`**`, '');
      for (const chk of c.checks.filter((x) => !x.ok)) md.push(`- ${esc(chk.label)} → ${esc(chk.detail ?? '')}`);
      if (c.error) md.push(`- lỗi khi chạy: ${esc(c.error)}`);
      md.push('');
    }
  }

  md.push('## Cách đọc phần chi tiết', '');
  md.push(
    '- **Điều kiện kèm theo** — token nào, trạng thái dữ liệu nào, tham số nào khiến lượt gọi đó có nghĩa.',
    '- **Quy tắc phải thoả** — câu trong tài liệu mà lượt gọi này kiểm chứng.',
    '- **Input** — request nguyên văn, chỉ che token và chữ ký.',
    '- **Output** — status, toàn bộ header, và thân phản hồi. Thân dài bị cắt trong báo cáo nhưng luôn có bản đầy đủ trong `raw/`.',
    '- **Vì sao kết luận PASS** — liệt kê mọi phép kiểm đã chạy; PASS nghĩa là tất cả đều đạt.',
    ''
  );

  md.push('## Chi tiết từng endpoint', '');
  for (const c of cases) md.push(...caseSection(c));

  md.push('## Dọn dẹp', '');
  for (const n of meta.cleanup) md.push(`- ${n}`);
  md.push('');

  md.push('## Tệp kèm theo', '');
  md.push(
    '- `REPORT.md` — bản này.',
    '- `raw/` — thân phản hồi đầy đủ của **mọi** lượt gọi, kể cả thân lỗi và file nhị phân.',
    '- `transcript.json` — toàn bộ request/response dạng máy đọc được.',
    '- `summary.json` — kết quả rút gọn, dùng cho CI.',
    '- `artifact/` — artifact tải về thật, tách theo `by-selector/` và `files/`.',
    ''
  );

  const reportPath = path.join(target.outDir, 'REPORT.md');
  const transcriptPath = path.join(target.outDir, 'transcript.json');
  const summaryPath = path.join(target.outDir, 'summary.json');

  fs.writeFileSync(reportPath, md.join('\n'), 'utf-8');
  fs.writeFileSync(
    transcriptPath,
    JSON.stringify(
      {
        target: { ...target, apiToken: `${target.apiToken.slice(0, 12)}…${target.apiToken.slice(-4)}` },
        meta,
        calls: p.calls,
      },
      null,
      2
    ),
    'utf-8'
  );
  fs.writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        baseUrl: target.baseUrl,
        startedAt: meta.startedAt,
        durationMs: meta.durationMs,
        summary: s,
        cases: cases.map((c) => ({
          id: c.id,
          endpoint: c.endpoint,
          outcome: c.outcome,
          checks: c.checks.length,
          checksPassed: c.checks.filter((x) => x.ok).length,
          calls: c.calls.length,
          durationMs: c.durationMs,
          failures: c.checks.filter((x) => !x.ok).map((x) => ({ label: x.label, detail: x.detail })),
        })),
      },
      null,
      2
    ),
    'utf-8'
  );

  return [reportPath, transcriptPath, summaryPath];
}
