// Security Enforcement & Audit Assertions Module

import { isAbsolute, resolve, relative } from 'path';

const ALLOWED_STORE_HOST = 'play.google.com';
const DANGEROUS_SHELL_CHARS_REGEX = /[;&|`$><\r\n]/;

export class SecurityValidationError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'SecurityValidationError';
  }
}

export function assertSsrfSafe(rawUrl: string): { url: string; packageId: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new SecurityValidationError('SSRF_VIOLATION', 'Invalid URL format.');
  }

  if (parsed.protocol !== 'https:') {
    throw new SecurityValidationError('SSRF_VIOLATION', `Disallowed protocol "${parsed.protocol}". Must be https.`);
  }

  if (parsed.hostname !== ALLOWED_STORE_HOST) {
    throw new SecurityValidationError('SSRF_VIOLATION', `Disallowed domain "${parsed.hostname}". Allowed domain: ${ALLOWED_STORE_HOST}`);
  }

  const packageId = parsed.searchParams.get('id');
  if (!packageId || !/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(packageId)) {
    throw new SecurityValidationError('INVALID_PACKAGE_ID', 'Invalid or missing package ID in Play Store URL.');
  }

  return {
    url: parsed.toString(),
    packageId,
  };
}

export function assertShellSafe(arg: string): string {
  if (typeof arg !== 'string') {
    throw new SecurityValidationError('SHELL_INJECTION_RISK', 'Command argument must be a string.');
  }

  if (DANGEROUS_SHELL_CHARS_REGEX.test(arg)) {
    throw new SecurityValidationError('SHELL_INJECTION_RISK', `Argument contains dangerous shell operators: "${arg}"`);
  }

  return arg;
}

export function assertPathTraversalSafe(baseDir: string, targetPath: string): string {
  const resolvedBase = resolve(baseDir);
  const resolvedTarget = resolve(targetPath);

  const rel = relative(resolvedBase, resolvedTarget);

  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new SecurityValidationError('PATH_TRAVERSAL_RISK', `Target path "${targetPath}" escapes base directory "${baseDir}".`);
  }

  return resolvedTarget;
}

export function redactSensitiveData(text: string): string {
  if (!text) return '';

  return text
    .replace(/Bearer\s+[A-Za-z0-9_.~+/-]+=*/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/(token|secret|password|key)=["']?[^"'\s&]+["']?/gi, '$1=[REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]');
}
