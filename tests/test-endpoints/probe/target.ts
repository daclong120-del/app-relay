import fs from 'fs';
import path from 'path';

export interface Target {
  baseUrl: string;
  baseSource: string;
  apiToken: string;
  tokenSource: string;
  outDir: string;
  timeoutMs: number;
  /** Giữ lại job do probe tạo thay vì huỷ ở bước dọn. */
  keepJobs: boolean;
  /** Bỏ qua phần tải toàn bộ artifact về đĩa. */
  skipDownloads: boolean;
}

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

/**
 * Lấy đích test từ chính `new_setup/api-endpoint.md`.
 *
 * Tài liệu người gọi đã công bố `BASE_URL` và `API_TOKEN` trong khối env đầu
 * file, nên đọc thẳng từ đó thay vì chép lại vào mã nguồn: URL quick tunnel đổi
 * mỗi lần server khởi động lại, chép cứng là cầm chắc chạy nhầm đích cũ.
 */
function fromDoc(file: string): { baseUrl?: string; apiToken?: string } {
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    return {
      baseUrl: /^\s*BASE_URL\s*=\s*(\S+)\s*$/m.exec(raw)?.[1],
      apiToken: /^\s*API_TOKEN\s*=\s*(\S+)\s*$/m.exec(raw)?.[1],
    };
  } catch {
    return {};
  }
}

/** Đọc một khoá trong file .env kiểu KEY=VALUE, không nạp vào process.env. */
function fromEnvFile(file: string, key: string): string | undefined {
  try {
    for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq !== -1 && trimmed.slice(0, eq).trim() === key) return trimmed.slice(eq + 1).trim();
    }
  } catch {
    // Không có file thì rơi xuống nguồn kế tiếp.
  }
  return undefined;
}

export function loadTarget(): Target {
  const repoRoot = path.resolve(process.cwd());
  const docFile = path.join(repoRoot, 'new_setup', 'api-endpoint.md');
  const envApi = path.join(repoRoot, 'deploy', '.env.api');

  const doc = fromDoc(docFile);
  const docRel = path.relative(repoRoot, docFile).replace(/\\/g, '/');

  const basePick: Array<[string | undefined, string]> = [
    [arg('base'), 'tham số --base='],
    [process.env.BASE_URL, 'biến môi trường BASE_URL'],
    [doc.baseUrl, `khối env trong ${docRel}`],
  ];
  const tokenPick: Array<[string | undefined, string]> = [
    [arg('token'), 'tham số --token='],
    [process.env.API_TOKEN, 'biến môi trường API_TOKEN'],
    [doc.apiToken, `khối env trong ${docRel}`],
    [fromEnvFile(envApi, 'API_TOKEN'), 'deploy/.env.api'],
  ];

  const base = basePick.find(([v]) => !!v);
  const token = tokenPick.find(([v]) => !!v);

  if (!base) throw new Error(`Không xác định được BASE_URL. Truyền --base=… hoặc khai báo trong ${docRel}`);
  if (!token) throw new Error(`Không xác định được API_TOKEN. Truyền --token=… hoặc khai báo trong ${docRel}`);

  return {
    baseUrl: base[0]!.replace(/\/$/, ''),
    baseSource: base[1],
    apiToken: token[0]!,
    tokenSource: token[1],
    outDir: arg('out') || process.env.OUT_DIR || path.join(repoRoot, 'work', 'endpoint-live'),
    timeoutMs: parseInt(arg('timeout') || process.env.TIMEOUT_MS || '60000', 10),
    keepJobs: process.argv.includes('--keep-jobs'),
    skipDownloads: process.argv.includes('--no-downloads'),
  };
}
