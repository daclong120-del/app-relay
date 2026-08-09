import fs from 'fs';
import path from 'path';
import type { TestResult } from './harness.js';

export interface ReportMeta {
  baseUrl: string;
  internalUrl: string;
  startedAt: string;
  durationMs: number;
}

const MARK: Record<string, string> = { pass: 'PASS', fail: 'FAIL', skip: 'SKIP' };

export function summarize(results: TestResult[]) {
  return {
    total: results.length,
    pass: results.filter((r) => r.outcome === 'pass').length,
    fail: results.filter((r) => r.outcome === 'fail').length,
    skip: results.filter((r) => r.outcome === 'skip').length,
    checks: results.reduce((n, r) => n + r.checks.length, 0),
  };
}

function table(results: TestResult[]): string {
  const rows = results.map((r) => {
    const checks = r.checks.length ? `${r.checks.filter((c) => c.ok).length}/${r.checks.length}` : '–';
    const note =
      r.outcome === 'fail'
        ? (r.checks.find((c) => !c.ok)?.label ?? r.error ?? '').replace(/\|/g, '\\|')
        : r.outcome === 'skip'
          ? (r.error ?? '')
          : '';
    return `| ${MARK[r.outcome]} | \`${r.endpoint}\` | ${r.title} | ${checks} | ${r.durationMs}ms | ${note} |`;
  });

  return [
    '| Kết quả | Endpoint | Kiểm tra | Check | Thời gian | Ghi chú |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

export function writeReport(results: TestResult[], meta: ReportMeta, outDir: string): string[] {
  fs.mkdirSync(outDir, { recursive: true });

  const s = summarize(results);
  const pub = results.filter((r) => r.group === 'public');
  const int = results.filter((r) => r.group === 'internal');

  const failed = results.filter((r) => r.outcome === 'fail');

  const md = [
    '# Báo cáo test endpoint',
    '',
    `- Thời điểm chạy: ${meta.startedAt}`,
    `- Public API: \`${meta.baseUrl}\``,
    `- Internal API: \`${meta.internalUrl}\``,
    `- Tổng thời gian: ${(meta.durationMs / 1000).toFixed(1)}s`,
    '',
    `**${s.pass} pass · ${s.fail} fail · ${s.skip} bỏ qua** trên ${s.total} endpoint (${s.checks} phép kiểm tra).`,
    '',
    `## Public API — ${pub.filter((r) => r.outcome === 'pass').length}/${pub.length}`,
    '',
    table(pub),
    '',
    `## Internal Worker API — ${int.filter((r) => r.outcome === 'pass').length}/${int.length}`,
    '',
    int.length ? table(int) : '_Không chạy (thiếu WORKER_TOKEN hoặc dùng cờ `--no-internal`)._',
    '',
  ];

  if (failed.length) {
    md.push('## Chi tiết endpoint FAIL', '');
    for (const r of failed) {
      md.push(`### \`${r.endpoint}\` — ${r.title}`, '');
      for (const c of r.checks.filter((x) => !x.ok)) {
        md.push(`- **${c.label}** → ${c.detail ?? '(không có chi tiết)'}`);
      }
      if (r.error) md.push(`- **lỗi khi chạy** → ${r.error}`);
      md.push('');
    }
  }

  const mdPath = path.join(outDir, 'endpoint-report.md');
  const jsonPath = path.join(outDir, 'endpoint-report.json');

  fs.writeFileSync(mdPath, md.join('\n'), 'utf-8');
  fs.writeFileSync(jsonPath, JSON.stringify({ meta, summary: s, results }, null, 2), 'utf-8');

  return [mdPath, jsonPath];
}
