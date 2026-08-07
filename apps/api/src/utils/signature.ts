import crypto, { createHmac } from 'crypto';

function getSecret(): string {
  const secret = process.env.DOWNLOAD_SIGNING_SECRET;
  if (!secret) {
    throw new Error('DOWNLOAD_SIGNING_SECRET environment variable is required');
  }
  return secret;
}

export function signDownloadUrl(artifactId: string, expires: number): string {
  const payload = `${artifactId}:${expires}`;
  return createHmac('sha256', getSecret()).update(payload).digest('hex');
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

