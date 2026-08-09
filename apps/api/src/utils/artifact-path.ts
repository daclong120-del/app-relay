import path from 'path';

export const ARTIFACT_DIR = process.env.ARTIFACT_DIR || path.join(process.cwd(), 'artifacts');

/**
 * Thư mục artifact của một job.
 *
 * jobId đi thẳng từ URL nên phải chặn ở đây: một `jobId` kiểu `../../etc` sẽ
 * trỏ ra ngoài ARTIFACT_DIR.
 */
export function jobArtifactDir(jobId: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(jobId)) {
    throw new Error(`Invalid jobId: ${jobId}`);
  }
  return path.join(ARTIFACT_DIR, jobId);
}

/**
 * Chuẩn hoá một đường dẫn tương đối bên trong artifact về dạng dùng `/`.
 *
 * Trả `null` nếu đường dẫn thoát ra khỏi thư mục artifact. Kiểm bằng cách
 * normalize rồi so sánh, chứ không chỉ tìm chuỗi `..`: `a/../../b` không chứa
 * `..` ở đầu nhưng vẫn thoát ra ngoài, còn `..foo.apk` chứa `..` mà hoàn toàn
 * hợp lệ.
 */
export function normalizeEntryPath(rawPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    // Chuỗi %-encoding hỏng — từ chối thay vì đoán ý.
    return null;
  }

  decoded = decoded.replace(/\\/g, '/');
  if (!decoded || decoded.includes('\0')) {
    return null;
  }

  // Từ chối hẳn đường dẫn tuyệt đối. Cắt dấu `/` đầu rồi coi như tương đối thì
  // vẫn nằm trong thư mục artifact, nhưng im lặng diễn giải lại yêu cầu của
  // client là kiểu dễ dãi che giấu lỗi — báo sai ngay vẫn hơn.
  if (decoded.startsWith('/')) {
    return null;
  }

  const normalized = path.posix.normalize(decoded);
  if (normalized === '.' || normalized.startsWith('../') || normalized === '..' || path.posix.isAbsolute(normalized)) {
    return null;
  }

  // Dotfile bị loại: API tự ghi metadata cạnh payload, client không được đụng.
  if (normalized.split('/').some((seg) => seg.startsWith('.'))) {
    return null;
  }

  return normalized;
}

/** Đường dẫn tuyệt đối của một file trong artifact, hoặc `null` nếu không hợp lệ. */
export function resolveEntry(jobId: string, rawPath: string): string | null {
  const rel = normalizeEntryPath(rawPath);
  if (!rel) return null;

  const dir = jobArtifactDir(jobId);
  const abs = path.resolve(dir, rel);

  // Chốt chặn cuối: sau khi resolve vẫn phải nằm trong thư mục artifact.
  if (abs !== dir && !abs.startsWith(dir + path.sep)) {
    return null;
  }
  return abs;
}

const CONTENT_TYPES: Record<string, string> = {
  '.apk': 'application/vnd.android.package-archive',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json',

  // Cố ý KHÔNG khai là text/html.
  //
  // CDN đứng trước API viết lại nội dung text/html trên đường truyền:
  // Cloudflare bật sẵn Email Address Obfuscation, nó chèn
  // /cdn-cgi/scripts/…/email-decode.min.js và thay địa chỉ email bằng
  // /cdn-cgi/l/email-protection. Đo được: page.html của Zalo phình từ
  // 1.185.094 lên 1.185.454 byte và sha256 lệch hoàn toàn.
  //
  // page.html sinh ra để client re-parse listing gốc, nên nó phải tới nơi
  // nguyên vẹn từng byte. Khai là octet-stream thì CDN để yên.
  '.html': 'application/octet-stream',

  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.listing': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.zip': 'application/zip',
};

export function contentTypeFor(p: string): string {
  return CONTENT_TYPES[path.extname(p).toLowerCase()] || 'application/octet-stream';
}
