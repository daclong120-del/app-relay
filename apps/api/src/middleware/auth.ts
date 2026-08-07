import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const API_TOKEN = process.env.API_TOKEN;
if (!API_TOKEN) {
  throw new Error('API_TOKEN environment variable is required');
}

const WORKER_TOKEN = process.env.WORKER_TOKEN;
if (!WORKER_TOKEN) {
  throw new Error('WORKER_TOKEN environment variable is required');
}

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
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
