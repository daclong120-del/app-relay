import crypto, { createHmac } from 'crypto';
import { requireEnv } from './env.js';

const SIGNING_SECRET = requireEnv('DOWNLOAD_SIGNING_SECRET');

export function signDownloadUrl(artifactId: string, expires: number): string {
  const payload = `${artifactId}:${expires}`;
  return createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex');
}

export function verifyDownloadUrlSignature(artifactId: string, expires: number, signature: string): boolean {
  if (Date.now() > expires * 1000) {
    return false;
  }
  const expected = signDownloadUrl(artifactId, expires);
  const expectedBuf = Buffer.from(expected);
  const sigBuf = Buffer.from(signature);
  if (expectedBuf.length !== sigBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, sigBuf);
}
