import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { ArtifactSelectorSchema, isApkPath, selectorMatches } from '@app-relay/contracts';
import { supabase } from '../../database/supabase.js';
import { verifyDownloadUrlSignature } from '../../utils/signature.js';
import { contentTypeFor, jobArtifactDir, resolveEntry } from '../../utils/artifact-path.js';
import { listArtifactFiles } from '../../utils/artifact-store.js';
import { scheduleDeleteAfterDownload } from '../../background/cleanup.js';

const router = Router();

/** `bytes=0-499` → {start, end}, hoặc null nếu không parse được / vượt kích thước. */
function parseRange(header: string | undefined, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;

  const [, rawStart, rawEnd] = m;
  let start: number;
  let end: number;

  if (rawStart === '') {
    // `bytes=-500` = 500 byte cuối.
    const suffix = parseInt(rawEnd, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = parseInt(rawStart, 10);
    end = rawEnd === '' ? size - 1 : parseInt(rawEnd, 10);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
}

function streamSingleFile(req: Request, res: Response, absPath: string, relPath: string, size: number): void {
  res.setHeader('Content-Type', contentTypeFor(relPath));
  res.setHeader('Content-Disposition', `attachment; filename="${path.basename(relPath)}"`);
  res.setHeader('Accept-Ranges', 'bytes');

  const range = parseRange(req.headers.range, size);

  if (req.headers.range && !range) {
    res.setHeader('Content-Range', `bytes */${size}`);
    return void res.status(416).end();
  }

  let stream: fs.ReadStream;
  if (range) {
    res.status(206);
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    res.setHeader('Content-Length', String(range.end - range.start + 1));
    stream = fs.createReadStream(absPath, { start: range.start, end: range.end });
  } else {
    res.setHeader('Content-Length', String(size));
    stream = fs.createReadStream(absPath);
  }

  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

/**
 * Hẹn xoá APK sau khi client đã nhận trọn vẹn — chỉ khi lượt tải này thực sự
 * chứa APK.
 *
 * Gắn vào mọi lượt tải là sai: client xin `select=listing` (22 KB) cũng sẽ làm
 * bay 140 MB APK mà họ chưa hề nhận.
 *
 * `expectedBytes` chỉ có với một file; khi gói ZIP thì không biết trước kích
 * thước nên chỉ dựa vào response kết thúc bình thường.
 */
function armDeleteAfterDownload(
  res: Response,
  jobId: string,
  servedPaths: string[],
  expectedBytes?: number
): void {
  if (!servedPaths.some(isApkPath)) return;

  res.on('finish', () => {
    // 'finish' chứ không phải 'close': 'close' phát cả khi client tụt mạng ở
    // 95%, xoá lúc đó là mất trắng công emulator.
    // 200 chứ không phải 206: tải dở bằng Range chưa phải là đã nhận đủ.
    if (res.statusCode !== 200 || res.destroyed) return;
    if (expectedBytes !== undefined && Number(res.getHeader('Content-Length')) !== expectedBytes) return;

    scheduleDeleteAfterDownload(jobId).catch(() => {});
  });
}

function streamZip(res: Response, dir: string, entries: { path: string }[], zipName: string): void {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
  // Không có Content-Length: nén khi đang stream nên chưa biết kích thước cuối.

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', () => res.destroy());
  archive.pipe(res);

  for (const e of entries) {
    archive.file(path.join(dir, e.path), { name: e.path });
  }
  archive.finalize();
}

// GET /v1/artifacts/:artifactId/download[?select=…|?path=…]
//
// Không cần Bearer token: URL đã mang chữ ký và thời hạn. Chữ ký chỉ phủ
// artifactId + expires, không phủ select/path — link mặc định vốn đã cho cả
// thư mục, nên sửa query chỉ lấy được ít hơn.
router.get('/:artifactId/download', async (req: Request, res: Response) => {
  try {
    const { artifactId } = req.params;
    const expires = parseInt(String(req.query.expires ?? ''), 10);
    const signature = String(req.query.signature ?? '');

    if (!Number.isFinite(expires) || !signature) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Thiếu tham số `expires` hoặc `signature`' },
      });
    }

    if (!verifyDownloadUrlSignature(artifactId, expires, signature)) {
      return res.status(403).json({
        error: { code: 'INVALID_SIGNATURE', message: 'Link tải không hợp lệ hoặc đã hết hạn' },
      });
    }

    const { data: artifact } = await supabase.from('artifacts').select('*').eq('id', artifactId).maybeSingle();

    if (!artifact) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy artifact' } });
    }

    if (artifact.state !== 'available' && artifact.state !== 'partial') {
      return res.status(410).json({
        error: { code: 'ARTIFACT_GONE', message: `Artifact đang ở trạng thái '${artifact.state}', không tải được` },
      });
    }

    // Artifact cũ lưu dạng một file ZIP — vẫn phục vụ được, chỉ không cắt lẻ.
    if (artifact.kind === 'bundle_zip') {
      const legacy = resolveEntry(artifact.job_id, 'bundle.zip');
      if (!legacy || !fs.existsSync(legacy)) {
        return res.status(410).json({
          error: { code: 'ARTIFACT_GONE', message: 'File artifact không còn trên server' },
        });
      }
      const stat = await fs.promises.stat(legacy);
      return streamSingleFile(req, res, legacy, artifact.file_name || 'bundle.zip', stat.size);
    }

    const dir = jobArtifactDir(artifact.job_id);

    // `?path=a&path=b` khiến Express trả về mảng. Bỏ qua kiểu này thì request
    // rơi xuống nhánh mặc định và client nhận nguyên cả bundle thay vì báo lỗi
    // — im lặng đưa nhiều hơn thứ được hỏi là hành vi tệ nhất có thể.
    if (Array.isArray(req.query.path) || Array.isArray(req.query.select)) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Chỉ được truyền một `path` và một `select`' },
      });
    }

    if (req.query.path !== undefined && req.query.select !== undefined) {
      return res.status(400).json({
        error: { code: 'BAD_REQUEST', message: 'Chỉ được truyền một trong hai: `select` hoặc `path`' },
      });
    }

    const rawPath = typeof req.query.path === 'string' ? req.query.path : undefined;

    // ── Một file cụ thể ────────────────────────────────────────────────
    if (rawPath) {
      const abs = resolveEntry(artifact.job_id, rawPath);
      if (!abs) {
        return res.status(400).json({ error: { code: 'INVALID_PATH', message: `Đường dẫn không hợp lệ: ${rawPath}` } });
      }
      if (!fs.existsSync(abs)) {
        return res.status(410).json({
          error: { code: 'FILE_GONE', message: `'${rawPath}' không còn trên server (có thể APK đã hết hạn sớm)` },
        });
      }

      const stat = await fs.promises.stat(abs);
      const relPath = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');

      armDeleteAfterDownload(res, artifact.job_id, [relPath], stat.size);

      return streamSingleFile(req, res, abs, relPath, stat.size);
    }

    // ── Cả cục hoặc một nhóm ───────────────────────────────────────────
    const parsed = ArtifactSelectorSchema.safeParse(req.query.select ?? 'all');
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: 'INVALID_SELECT', message: `Selector không hợp lệ: ${String(req.query.select)}` },
      });
    }
    const select = parsed.data;

    const files = await listArtifactFiles(dir);
    const picked = files.filter((f) => selectorMatches(f.path, select));

    if (picked.length === 0) {
      return res.status(410).json({
        error: {
          code: 'NOTHING_TO_SERVE',
          message: `Không còn file nào khớp '${select}' (APK có thể đã hết hạn sớm)`,
        },
      });
    }

    // Đúng một file thì trả thô, không bọc ZIP cho một entry.
    if (picked.length === 1) {
      const only = picked[0];
      const abs = path.join(dir, only.path);
      armDeleteAfterDownload(res, artifact.job_id, [only.path], only.sizeBytes);
      return streamSingleFile(req, res, abs, only.path, only.sizeBytes);
    }

    const base = artifact.file_name || artifact.job_id;
    const zipName = select === 'all' ? `${base}.zip` : `${base}-${select}.zip`;

    armDeleteAfterDownload(res, artifact.job_id, picked.map((f) => f.path));

    return streamZip(res, dir, picked, zipName);
  } catch (err: any) {
    if (res.headersSent) {
      return res.destroy();
    }
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

export default router;
