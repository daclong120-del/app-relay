/**
 * Tải mọi thể loại artifact về đĩa, đúng như một client thật sẽ làm.
 *
 * Đi qua trọn vẹn luồng công khai: xin link đã ký rồi tải bằng link đó, không
 * dùng lối tắt nào vào đĩa server. Mỗi file lẻ được đối chiếu SHA-256 với giá
 * trị API công bố.
 *
 *   pnpm download:artifacts                       # job completed mới nhất có APK
 *   pnpm download:artifacts -- --job=job_xxx      # chỉ định job
 *   pnpm download:artifacts -- --only=apk.base    # chỉ một selector
 */
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { loadConfig } from './config.js';

const SELECTORS = [
  'all',
  'apk',
  'apk.base',
  'apk.splits',
  'screenshots',
  'listing',
  'listing.full',
  'metadata',
] as const;

function arg(name: string): string | undefined {
  const p = `--${name}=`;
  return process.argv.find((a) => a.startsWith(p))?.slice(p.length);
}

const cfg = loadConfig();

async function api(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${cfg.apiToken}`);
  if (init.body) headers.set('Content-Type', 'application/json');

  // Có body mà không nêu method thì mặc định POST — fetch từ chối GET kèm thân.
  const method = init.method ?? (init.body ? 'POST' : 'GET');

  const res = await fetch(`${cfg.baseUrl}${path}`, { ...init, method, headers });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

function mb(n: number): string {
  return `${(n / 1048576).toFixed(2)} MB`;
}

/** Tải một URL đã ký xuống đĩa, trả về kích thước và sha256 thực nhận. */
async function download(url: string, dest: string): Promise<{ bytes: number; sha256: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} khi tải ${path.basename(dest)}`);

  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(dest, buf);

  return { bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
}

async function pickJob(): Promise<string> {
  const explicit = arg('job');
  if (explicit) return explicit;

  const res = await api('/jobs?status=completed&pageSize=20');
  const jobs = res.body?.data ?? [];

  // Ưu tiên job có APK thật, bỏ qua artifact do bộ test sinh ra.
  const withApk = jobs.find((j: any) => (j.resultSummary?.splitCount ?? 0) > 0);
  const chosen = withApk ?? jobs[0];
  if (!chosen) throw new Error('Không có job completed nào trên hệ thống');
  return chosen.jobId;
}

async function main(): Promise<void> {
  const jobId = await pickJob();

  const job = await api(`/jobs/${jobId}`);
  if (job.status !== 200) throw new Error(`Không đọc được job ${jobId}: HTTP ${job.status}`);
  const packageId = job.body.data.packageId;
  const version = job.body.data.resultSummary?.versionName ?? 'unknown';

  const listing = await api(`/jobs/${jobId}/artifact/files`);
  if (listing.status !== 200) throw new Error(`Không đọc được danh sách file: HTTP ${listing.status}`);
  const files: any[] = listing.body.data.files ?? [];

  const outRoot = path.join(cfg.outDir, 'downloads', packageId);
  console.log(`Job      : ${jobId}`);
  console.log(`Package  : ${packageId} ${version}`);
  console.log(`Artifact : ${listing.body.data.state}, ${files.length} file, ${mb(listing.body.data.totalSizeBytes)}`);
  console.log(`Lưu vào  : ${outRoot}\n`);

  const only = arg('only');
  const rows: string[] = [];
  let failures = 0;

  // ── Từng selector ──────────────────────────────────────────────────
  console.log('── Theo selector ──');
  for (const select of SELECTORS) {
    if (only && only !== select) continue;

    const link = await api(`/jobs/${jobId}/artifact/download-url`, {
      body: JSON.stringify(select === 'all' ? {} : { select }),
    });

    if (link.status !== 200) {
      console.log(`  ✗ ${select.padEnd(13)} HTTP ${link.status} — ${link.body?.error?.message ?? ''}`);
      rows.push(`| \`${select}\` | – | – | HTTP ${link.status}: ${link.body?.error?.code ?? ''} |`);
      failures++;
      continue;
    }

    const fileName = link.body.data.fileName;
    const dest = path.join(outRoot, 'by-selector', fileName);
    const got = await download(link.body.data.downloadUrl, dest);

    console.log(`  ✓ ${select.padEnd(13)} ${mb(got.bytes).padStart(10)}  ${fileName}`);
    rows.push(`| \`${select}\` | ${fileName} | ${mb(got.bytes)} | ok |`);
  }

  // ── Từng file lẻ, có kiểm tra sha256 ───────────────────────────────
  if (!only) {
    console.log('\n── Từng file lẻ (đối chiếu SHA-256) ──');
    for (const f of files) {
      const link = await api(`/jobs/${jobId}/artifact/download-url`, {
        body: JSON.stringify({ path: f.path }),
      });
      if (link.status !== 200) {
        console.log(`  ✗ ${f.path} — HTTP ${link.status}`);
        failures++;
        continue;
      }

      const dest = path.join(outRoot, 'files', f.path);
      const got = await download(link.body.data.downloadUrl, dest);

      const shaOk = !f.sha256 || got.sha256 === f.sha256;
      const sizeOk = got.bytes === f.sizeBytes;
      if (!shaOk || !sizeOk) failures++;

      console.log(
        `  ${shaOk && sizeOk ? '✓' : '✗'} ${f.path.padEnd(44)} ${mb(got.bytes).padStart(10)}` +
          `${shaOk ? '' : '  SHA LỆCH'}${sizeOk ? '' : '  SIZE LỆCH'}`
      );
    }
  }

  const summary = [
    `# Artifact đã tải về`,
    '',
    `- Job: \`${jobId}\``,
    `- Package: \`${packageId}\` ${version}`,
    `- Nguồn: \`${cfg.baseUrl}\``,
    `- Thời điểm: ${new Date().toISOString()}`,
    '',
    '| Selector | Tên file | Kích thước | Kết quả |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    `Từng file lẻ nằm trong \`files/\`, đã đối chiếu SHA-256 với giá trị API công bố.`,
    '',
  ].join('\n');

  fs.writeFileSync(path.join(outRoot, 'README.md'), summary, 'utf-8');

  console.log(`\n${failures === 0 ? 'Tải xong, không lỗi.' : `Có ${failures} mục lỗi.`}`);
  console.log(`Thư mục: ${outRoot}`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Lỗi:', err?.message ?? err);
  process.exit(2);
});
