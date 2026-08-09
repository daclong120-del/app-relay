import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import type { Target } from './target.js';

export interface Check {
  ok: boolean;
  label: string;
  detail?: string;
}

export interface RecordedRequest {
  method: string;
  url: string;
  /** Header đúng như đã gửi, riêng Authorization được che bớt. */
  headers: Record<string, string>;
  body: string | null;
  bodyNote?: string;
}

export interface RecordedResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  contentType: string | null;
  bytes: number;
  sha256: string | null;
  /** Thân dạng văn bản; null khi phản hồi là nhị phân. */
  text: string | null;
  json: any;
  /** Đường dẫn tương đối tới file lưu thân đầy đủ trong thư mục out. */
  savedAs: string | null;
  durationMs: number;
}

export interface RecordedCall {
  seq: number;
  caseId: string;
  label: string;
  /** Điều kiện của riêng lượt gọi này (token nào, trạng thái nào, tham số nào). */
  condition: string;
  /** Quy tắc tài liệu mà lượt gọi phải thoả — cơ sở để kết luận pass. */
  rule: string;
  expectedStatus: number[];
  request: RecordedRequest;
  response: RecordedResponse;
  ok: boolean;
  networkError?: string;
}

export interface CaseMeta {
  id: string;
  endpoint: string;
  title: string;
  docRef: string;
  purpose: string;
  preconditions: string[];
  sideEffects?: string;
}

export interface CaseResult extends CaseMeta {
  outcome: 'pass' | 'fail' | 'skip';
  durationMs: number;
  calls: RecordedCall[];
  checks: Check[];
  error?: string;
}

export interface CallSpec {
  label: string;
  condition: string;
  rule: string;
  expectStatus: number | number[];
  method?: string;
  /** Đường dẫn ghép sau baseUrl. Dùng `url` khi cần URL tuyệt đối (link đã ký). */
  path?: string;
  url?: string;
  auth?: 'api' | 'none' | 'raw';
  /** Token thô cho `auth: 'raw'` — dùng để thử token sai. */
  rawToken?: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
  /** Tên file lưu thân phản hồi; mặc định suy ra từ số thứ tự và nhãn. */
  saveAs?: string;
}

const TEXTUAL = /(json|text|xml|javascript|x-www-form-urlencoded)/i;

/**
 * Tên file cho thư mục raw/. Bỏ dấu trước rồi mới lọc ký tự: cắt thẳng sẽ biến
 * "gọi trần không Authorization" thành "g-i-tr-n-kh-ng-authorization".
 */
function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function extFor(contentType: string | null, fileName: string | null): string {
  if (fileName && path.extname(fileName)) return path.extname(fileName);
  if (!contentType) return '.bin';
  if (contentType.includes('json')) return '.json';
  if (contentType.includes('zip')) return '.zip';
  if (contentType.includes('markdown')) return '.md';
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('html')) return '.html';
  if (contentType.startsWith('text/')) return '.txt';
  return '.bin';
}

/** Che token trong header để báo cáo đọc được mà không in nguyên bí mật. */
function maskAuth(value: string): string {
  const m = /^Bearer\s+(.+)$/i.exec(value);
  if (!m) return value;
  const t = m[1];
  if (t.length <= 12) return 'Bearer ***';
  return `Bearer ${t.slice(0, 8)}…${t.slice(-4)} (${t.length} ký tự)`;
}

/** Che chữ ký trong URL đã ký — chữ ký dài, in đủ chỉ làm rối báo cáo. */
function maskUrl(url: string): string {
  return url.replace(/(signature=)([0-9a-f]{8})[0-9a-f]+/gi, '$1$2…');
}

export class Probe {
  readonly cases: CaseResult[] = [];
  readonly calls: RecordedCall[] = [];
  private seq = 0;
  private currentId = '-';
  private currentChecks: Check[] = [];
  private currentCalls: RecordedCall[] = [];
  readonly rawDir: string;

  constructor(readonly target: Target) {
    this.rawDir = path.join(target.outDir, 'raw');
    fs.mkdirSync(this.rawDir, { recursive: true });
  }

  // ── Gọi có ghi hình ────────────────────────────────────────────────

  async call(spec: CallSpec): Promise<RecordedCall> {
    const expected = Array.isArray(spec.expectStatus) ? spec.expectStatus : [spec.expectStatus];
    const url = spec.url ?? `${this.target.baseUrl}${spec.path ?? ''}`;
    const method = spec.method ?? (spec.body ? 'POST' : 'GET');

    const headers: Record<string, string> = { ...(spec.headers ?? {}) };
    if (spec.auth === 'api') headers.Authorization = `Bearer ${this.target.apiToken}`;
    if (spec.auth === 'raw') headers.Authorization = `Bearer ${spec.rawToken ?? ''}`;
    if (spec.body && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }

    const recordedHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      recordedHeaders[k] = k.toLowerCase() === 'authorization' ? maskAuth(v) : v;
    }

    this.seq += 1;
    const seq = this.seq;
    const started = Date.now();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.target.timeoutMs);

    let record: RecordedCall;

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: spec.body as any,
        signal: ac.signal,
        redirect: 'manual',
      });
      const buf = Buffer.from(await res.arrayBuffer());
      const durationMs = Date.now() - started;

      const resHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        resHeaders[k] = k.toLowerCase() === 'set-cookie' ? '(ẩn)' : v;
      });

      const contentType = res.headers.get('content-type');
      const isText = !contentType || TEXTUAL.test(contentType);
      const text = isText ? buf.toString('utf-8') : null;

      let json: any = null;
      if (text) {
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          json = null;
        }
      }

      // Mọi byte endpoint trả về đều được ghi ra đĩa, kể cả thân lỗi và file
      // nhị phân — báo cáo chỉ trích một đoạn, bản đầy đủ nằm trong raw/.
      let savedAs: string | null = null;
      if (buf.length > 0) {
        const disposition = res.headers.get('content-disposition') ?? '';
        const fileName = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)?.[1] ?? null;
        const name =
          spec.saveAs ??
          `${String(seq).padStart(3, '0')}-${this.currentId}-${slug(spec.label)}${extFor(contentType, fileName)}`;
        fs.writeFileSync(path.join(this.rawDir, name), buf);
        savedAs = `raw/${name}`;
      }

      record = {
        seq,
        caseId: this.currentId,
        label: spec.label,
        condition: spec.condition,
        rule: spec.rule,
        expectedStatus: expected,
        request: {
          method,
          url: maskUrl(url),
          headers: recordedHeaders,
          body: typeof spec.body === 'string' ? spec.body : null,
          bodyNote: Buffer.isBuffer(spec.body) ? `${spec.body.length} byte nhị phân` : undefined,
        },
        response: {
          status: res.status,
          statusText: res.statusText,
          headers: resHeaders,
          contentType,
          bytes: buf.length,
          sha256: buf.length ? createHash('sha256').update(buf).digest('hex') : null,
          text,
          json,
          savedAs,
          durationMs,
        },
        ok: expected.includes(res.status),
      };
    } catch (err: any) {
      const message = err?.name === 'AbortError' ? `quá ${this.target.timeoutMs}ms không phản hồi` : String(err?.message ?? err);
      record = {
        seq,
        caseId: this.currentId,
        label: spec.label,
        condition: spec.condition,
        rule: spec.rule,
        expectedStatus: expected,
        request: {
          method,
          url: maskUrl(url),
          headers: recordedHeaders,
          body: typeof spec.body === 'string' ? spec.body : null,
        },
        response: {
          status: 0,
          statusText: 'không nhận được phản hồi',
          headers: {},
          contentType: null,
          bytes: 0,
          sha256: null,
          text: null,
          json: null,
          savedAs: null,
          durationMs: Date.now() - started,
        },
        ok: false,
        networkError: message,
      };
    } finally {
      clearTimeout(timer);
    }

    this.calls.push(record);
    this.currentCalls.push(record);
    this.check(
      record.ok,
      `${record.label} → HTTP ${expected.join(' hoặc ')}`,
      record.networkError ?? `nhận ${record.response.status}: ${(record.response.text ?? '').slice(0, 200)}`
    );

    return record;
  }

  /**
   * Gọi để dò tiền đề (chọn job nào, artifact có file gì) — không vào báo cáo.
   * Giữ phần "các lượt gọi" chỉ còn những request thực sự đang kiểm chứng.
   */
  async quiet(pathname: string, init: { method?: string; body?: string } = {}): Promise<any> {
    const res = await fetch(`${this.target.baseUrl}${pathname}`, {
      method: init.method ?? (init.body ? 'POST' : 'GET'),
      headers: { Authorization: `Bearer ${this.target.apiToken}`, 'Content-Type': 'application/json' },
      body: init.body,
    });
    const text = await res.text();
    try {
      return { status: res.status, body: text ? JSON.parse(text) : null };
    } catch {
      return { status: res.status, body: null };
    }
  }

  // ── Khẳng định ─────────────────────────────────────────────────────

  check(ok: boolean, label: string, detail?: string): void {
    this.currentChecks.push({ ok, label, detail: ok ? undefined : detail });
  }

  equals(actual: unknown, expected: unknown, label: string): void {
    this.check(actual === expected, label, `nhận ${JSON.stringify(actual)}, mong đợi ${JSON.stringify(expected)}`);
  }

  /** Các trường tài liệu hứa phải có mặt, kể cả khi giá trị là null. */
  fields(obj: any, keys: string[], label: string): void {
    if (obj === null || typeof obj !== 'object') {
      this.check(false, `${label} có đủ trường: ${keys.join(', ')}`, `không phải object: ${JSON.stringify(obj)?.slice(0, 120)}`);
      return;
    }
    const missing = keys.filter((k) => !(k in obj));
    this.check(missing.length === 0, `${label} có đủ trường: ${keys.join(', ')}`, `thiếu ${missing.join(', ')}`);
  }

  // ── Chạy một case ──────────────────────────────────────────────────

  async endpoint(meta: CaseMeta, fn: () => Promise<void>): Promise<CaseResult> {
    this.currentId = meta.id;
    this.currentChecks = [];
    this.currentCalls = [];

    const started = Date.now();
    let error: string | undefined;
    try {
      await fn();
    } catch (err: any) {
      error = err?.message ?? String(err);
    }

    const checks = this.currentChecks;
    const result: CaseResult = {
      ...meta,
      outcome: error || checks.some((c) => !c.ok) ? 'fail' : 'pass',
      durationMs: Date.now() - started,
      calls: this.currentCalls,
      checks,
      error,
    };

    this.cases.push(result);
    this.currentId = '-';

    const mark = result.outcome === 'pass' ? '✓' : '✗';
    const passed = checks.filter((c) => c.ok).length;
    console.log(`  ${mark} ${meta.id}  ${meta.endpoint.padEnd(42)} ${passed}/${checks.length} check`);
    if (result.outcome === 'fail') {
      for (const c of checks.filter((x) => !x.ok)) console.log(`        · ${c.label} → ${c.detail ?? ''}`);
      if (error) console.log(`        · lỗi khi chạy: ${error}`);
    }
    return result;
  }

  skip(meta: CaseMeta, reason: string): void {
    this.cases.push({ ...meta, outcome: 'skip', durationMs: 0, calls: [], checks: [], error: reason });
    console.log(`  – ${meta.id}  ${meta.endpoint.padEnd(42)} bỏ qua: ${reason}`);
  }
}
