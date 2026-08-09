import type { Config } from './config.js';

export type Outcome = 'pass' | 'fail' | 'skip';

export interface CheckResult {
  ok: boolean;
  label: string;
  detail?: string;
}

export interface TestResult {
  /** Endpoint đúng như tài liệu ghi, để đối chiếu 1-1 với api-endpoint.md. */
  endpoint: string;
  group: 'public' | 'internal';
  title: string;
  outcome: Outcome;
  durationMs: number;
  checks: CheckResult[];
  error?: string;
}

export interface HttpResult {
  status: number;
  headers: Headers;
  body: any;
  text: string;
  durationMs: number;
}

export class Harness {
  readonly results: TestResult[] = [];
  private currentChecks: CheckResult[] = [];

  constructor(private cfg: Config) {}

  // ── HTTP ────────────────────────────────────────────────────────────

  async request(
    url: string,
    init: RequestInit & { auth?: 'api' | 'worker' | 'none' } = {}
  ): Promise<HttpResult> {
    const { auth = 'none', headers, ...rest } = init;
    const h = new Headers(headers);

    if (auth === 'api') h.set('Authorization', `Bearer ${this.cfg.apiToken}`);
    if (auth === 'worker') h.set('Authorization', `Bearer ${this.cfg.workerToken}`);

    const started = Date.now();
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.cfg.timeoutMs);

    try {
      const res = await fetch(url, { ...rest, headers: h, signal: ac.signal });
      // Đọc dạng text trước rồi mới parse: thân lỗi đôi khi không phải JSON,
      // và khi đó nội dung thật vẫn cần cho báo cáo.
      const text = await res.text();
      let body: any = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = null;
      }
      return { status: res.status, headers: res.headers, body, text, durationMs: Date.now() - started };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Có `body` mà không nêu `method` thì mặc định POST — `fetch` ném lỗi khi
   * GET kèm thân, và lỗi đó lại hiện ra như thể endpoint hỏng.
   */
  private prepare(init: RequestInit & { auth?: 'api' | 'worker' | 'none' }) {
    const h = new Headers(init.headers);
    if (init.body && !h.has('Content-Type')) h.set('Content-Type', 'application/json');
    const method = init.method ?? (init.body ? 'POST' : 'GET');
    return { ...init, method, headers: h };
  }

  json(path: string, init: RequestInit & { auth?: 'api' | 'worker' | 'none' } = {}) {
    return this.request(`${this.cfg.baseUrl}${path}`, this.prepare(init));
  }

  internal(path: string, init: RequestInit & { auth?: 'api' | 'worker' | 'none' } = {}) {
    return this.request(`${this.cfg.internalUrl}${path}`, { auth: 'worker', ...this.prepare(init) });
  }

  // ── Assertions ──────────────────────────────────────────────────────

  check(ok: boolean, label: string, detail?: string): void {
    this.currentChecks.push({ ok, label, detail: ok ? undefined : detail });
  }

  status(res: HttpResult, expected: number | number[], label = 'status'): void {
    const list = Array.isArray(expected) ? expected : [expected];
    this.check(
      list.includes(res.status),
      `${label} = ${list.join('|')}`,
      `nhận ${res.status}: ${res.text.slice(0, 160)}`
    );
  }

  /** Các trường mà tài liệu hứa phải có mặt (kể cả khi giá trị là null). */
  fields(obj: any, keys: string[], label: string): void {
    if (obj === null || typeof obj !== 'object') {
      this.check(false, `${label}: có object`, `nhận ${JSON.stringify(obj)?.slice(0, 120)}`);
      return;
    }
    const missing = keys.filter((k) => !(k in obj));
    this.check(missing.length === 0, `${label}: ${keys.join(', ')}`, `thiếu ${missing.join(', ')}`);
  }

  // ── Chạy một test ───────────────────────────────────────────────────

  async run(
    endpoint: string,
    group: 'public' | 'internal',
    title: string,
    fn: () => Promise<void>
  ): Promise<TestResult> {
    this.currentChecks = [];
    const started = Date.now();
    let error: string | undefined;

    try {
      await fn();
    } catch (err: any) {
      error = err?.message ?? String(err);
    }

    const checks = this.currentChecks;
    const outcome: Outcome = error || checks.some((c) => !c.ok) ? 'fail' : 'pass';
    const result: TestResult = {
      endpoint,
      group,
      title,
      outcome,
      durationMs: Date.now() - started,
      checks,
      error,
    };

    this.results.push(result);
    const mark = outcome === 'pass' ? '✓' : '✗';
    console.log(`  ${mark} ${endpoint.padEnd(46)} ${title}`);
    if (outcome === 'fail') {
      for (const c of checks.filter((x) => !x.ok)) {
        console.log(`      · ${c.label} → ${c.detail ?? ''}`);
      }
      if (error) console.log(`      · lỗi: ${error}`);
    }
    return result;
  }

  skip(endpoint: string, group: 'public' | 'internal', title: string, reason: string): void {
    this.results.push({
      endpoint,
      group,
      title,
      outcome: 'skip',
      durationMs: 0,
      checks: [],
      error: reason,
    });
    console.log(`  – ${endpoint.padEnd(46)} ${title} (bỏ qua: ${reason})`);
  }
}
