import fs from 'fs';
import path from 'path';
import { isApkPath, selectorFor } from '@app-relay/contracts';
import { ARTIFACT_DIR, contentTypeFor, jobArtifactDir } from './artifact-path.js';

export interface ArtifactFile {
  path: string;
  sizeBytes: number;
  sha256: string | null;
  contentType: string;
  select: string;
}

/**
 * Sổ ghi SHA-256 của từng file, do `PUT files/*` nối thêm sau mỗi upload thành công.
 *
 * Không tính lại lúc finalize: làm vậy phải đọc lại toàn bộ ~150MB chỉ để lấy
 * con số vừa tính xong khi ghi xuống đĩa. Tên bắt đầu bằng dấu chấm nên
 * `listArtifactFiles` bỏ qua và nó không lọt vào ZIP giao cho client.
 */
const LEDGER = '.uploads.jsonl';

export async function recordUpload(jobId: string, relPath: string, sizeBytes: number, sha256: string): Promise<void> {
  const dir = jobArtifactDir(jobId);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.appendFile(
    path.join(dir, LEDGER),
    JSON.stringify({ path: relPath, sizeBytes, sha256 }) + '\n',
    'utf-8'
  );
}

async function readLedger(dir: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const raw = await fs.promises.readFile(path.join(dir, LEDGER), 'utf-8');
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line) as { path: string; sha256: string };
        // Upload lại cùng một path thì bản sau thắng.
        map.set(rec.path, rec.sha256);
      } catch {
        // Dòng hỏng thì bỏ qua: thiếu sha256 chỉ mất thông tin, không sai dữ liệu.
      }
    }
  } catch {
    // Chưa có sổ — artifact cũ hoặc chưa upload file nào.
  }
  return map;
}

/** Liệt kê mọi file trong thư mục artifact, bỏ qua dotfile. */
export async function listArtifactFiles(dir: string): Promise<ArtifactFile[]> {
  const shas = await readLedger(dir);
  const out: ArtifactFile[] = [];

  async function walk(current: string, prefix: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        await walk(path.join(current, entry.name), rel);
      } else if (entry.isFile()) {
        const stat = await fs.promises.stat(path.join(current, entry.name));
        out.push({
          path: rel,
          sizeBytes: stat.size,
          sha256: shas.get(rel) ?? null,
          contentType: contentTypeFor(rel),
          select: selectorFor(rel),
        });
      }
    }
  }

  await walk(dir, '');
  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

/** Xoá file APK, giữ nguyên phần nhẹ. Trả về số byte giải phóng được. */
export async function deleteApkFiles(jobId: string): Promise<number> {
  const dir = jobArtifactDir(jobId);
  const files = await listArtifactFiles(dir);
  let freed = 0;

  for (const f of files) {
    if (!isApkPath(f.path)) continue;
    try {
      await fs.promises.rm(path.join(dir, f.path), { force: true });
      freed += f.sizeBytes;
    } catch {
      // Đã bị xoá bởi lượt quét trước — không phải lỗi.
    }
  }
  return freed;
}

export async function deleteArtifactDir(jobId: string): Promise<void> {
  await fs.promises.rm(jobArtifactDir(jobId), { recursive: true, force: true }).catch(() => {});
}

export interface ArtifactDirInfo {
  jobId: string;
  mtimeMs: number;
  sizeBytes: number;
}

/**
 * Mọi thư mục artifact đang nằm trên đĩa, kèm thời điểm sửa đổi gần nhất.
 *
 * Dùng để dò thư mục mồ côi: `PUT files/*` ghi xuống đĩa nhưng chỉ `finalize`
 * mới tạo dòng trong bảng `artifacts`. Job chết giữa chừng lúc upload để lại
 * thư mục không có dòng DB nào, mà cleanup lại quét theo DB — nên nếu không dò
 * trực tiếp trên đĩa thì nó nằm đó vĩnh viễn.
 */
export async function listArtifactDirs(): Promise<ArtifactDirInfo[]> {
  const out: ArtifactDirInfo[] = [];
  let entries: fs.Dirent[];

  try {
    entries = await fs.promises.readdir(ARTIFACT_DIR, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

    const dir = path.join(ARTIFACT_DIR, entry.name);
    try {
      const stat = await fs.promises.stat(dir);
      const files = await listArtifactFiles(dir);

      // mtime của thư mục gốc không đổi khi ghi vào thư mục con, nên lấy mốc
      // mới nhất giữa nó và mọi file bên trong — nếu không, một upload đang dở
      // sẽ bị coi là cũ và bị xoá mất.
      let newest = stat.mtimeMs;
      let total = 0;
      for (const f of files) {
        total += f.sizeBytes;
        const fstat = await fs.promises.stat(path.join(dir, f.path)).catch(() => null);
        if (fstat && fstat.mtimeMs > newest) newest = fstat.mtimeMs;
      }

      out.push({ jobId: entry.name, mtimeMs: newest, sizeBytes: total });
    } catch {
      // Thư mục biến mất giữa chừng — bỏ qua.
    }
  }
  return out;
}

/** Số byte trống còn lại trên phân vùng chứa ARTIFACT_DIR. */
export async function freeBytes(): Promise<number> {
  try {
    await fs.promises.mkdir(ARTIFACT_DIR, { recursive: true });
    const stats = await fs.promises.statfs(ARTIFACT_DIR);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    // Không đo được thì coi như còn chỗ: thà nhận job rồi hỏng ở bước ghi còn
    // hơn đứng im vĩnh viễn vì một lỗi đo đạc.
    return Number.MAX_SAFE_INTEGER;
  }
}

export function minFreeBytes(): number {
  return parseInt(process.env.ARTIFACT_MIN_FREE_BYTES || '10737418240', 10);
}

/** Còn đủ chỗ cho `incomingBytes` mà vẫn giữ được ngưỡng dự phòng không. */
export async function hasRoomFor(incomingBytes: number): Promise<boolean> {
  const free = await freeBytes();
  return free - incomingBytes >= minFreeBytes();
}

/** Đĩa đã xuống dưới ngưỡng dự phòng chưa. */
export async function isDiskLow(): Promise<boolean> {
  return (await freeBytes()) < minFreeBytes();
}
