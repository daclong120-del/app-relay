import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { requireEnv } from '../utils/env.js';

const API_TOKEN = requireEnv('API_TOKEN');
const WORKER_TOKEN = requireEnv('WORKER_TOKEN');

/**
 * Constant-time token comparison.
 *
 * Both sides are hashed first so the compared buffers are always 32 bytes —
 * this keeps the comparison constant-time regardless of the supplied token's
 * length, which a raw length check would otherwise leak.
 */
function safeCompare(a: string, b: string): boolean {
  const digestA = crypto.createHash('sha256').update(a).digest();
  const digestB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

export function requirePublicAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Bearer token' } });
  }
  const token = authHeader.substring(7);
  if (!safeCompare(token, API_TOKEN)) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Invalid API token' } });
  }
  next();
}

export function requireWorkerAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Worker token' } });
  }
  const token = authHeader.substring(7);
  if (!safeCompare(token, WORKER_TOKEN)) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Invalid Worker token' } });
  }
  next();
}
