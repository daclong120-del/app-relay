import fs from 'fs';
import path from 'path';

export interface Config {
  baseUrl: string;
  internalUrl: string;
  apiToken: string;
  workerToken: string;
  outDir: string;
  timeoutMs: number;
  /** Bỏ qua nhóm internal — dùng khi chỉ muốn kiểm tra mặt public. */
  skipInternal: boolean;
}

/**
 * Đọc một biến từ file .env kiểu KEY=VALUE.
 *
 * Không dùng dotenv: file .env.api của deploy chứa cả token public lẫn worker,
 * nạp thẳng vào process.env sẽ ghi đè biến của môi trường đang chạy.
 */
function readEnvFile(file: string, key: string): string | undefined {
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      if (trimmed.slice(0, eq).trim() === key) {
        return trimmed.slice(eq + 1).trim();
      }
    }
  } catch {
    // Không có file — người chạy sẽ truyền token qua biến môi trường.
  }
  return undefined;
}

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

export function loadConfig(): Config {
  const repoRoot = path.resolve(process.cwd());
  const envApi = path.join(repoRoot, 'deploy', '.env.api');

  const baseUrl = (arg('base') || process.env.BASE_URL || 'http://127.0.0.1:3000/v1').replace(/\/$/, '');
  const internalUrl = (
    arg('internal') ||
    process.env.INTERNAL_URL ||
    baseUrl.replace(/\/v1$/, '/internal/v1')
  ).replace(/\/$/, '');

  const apiToken = arg('token') || process.env.API_TOKEN || readEnvFile(envApi, 'API_TOKEN') || '';
  const workerToken =
    arg('worker-token') || process.env.WORKER_TOKEN || readEnvFile(envApi, 'WORKER_TOKEN') || '';

  if (!apiToken) {
    throw new Error(
      'Thiếu API_TOKEN. Truyền --token=…, đặt biến môi trường API_TOKEN, hoặc chạy từ thư mục gốc repo có deploy/.env.api'
    );
  }

  return {
    baseUrl,
    internalUrl,
    apiToken,
    workerToken,
    outDir: arg('out') || process.env.OUT_DIR || path.join(repoRoot, 'work'),
    timeoutMs: parseInt(arg('timeout') || process.env.TIMEOUT_MS || '30000', 10),
    skipInternal: process.argv.includes('--no-internal') || !workerToken,
  };
}
