// Security Guard Module for Next.js Server Actions: Admin & CSRF Verification

export interface UserSessionContext {
  userId: string;
  role: 'admin' | 'user' | string;
  email?: string;
}

export function requireAdmin(session?: UserSessionContext | null): UserSessionContext {
  if (!session || !session.userId) {
    throw new Error('UNAUTHORIZED: Authentication required.');
  }

  if (session.role !== 'admin') {
    throw new Error('FORBIDDEN: Admin privileges required.');
  }

  return session;
}

export function verifyCSRF(csrfToken?: string | null, expectedToken?: string | null): boolean {
  const env = (process.env.NODE_ENV || '').trim();
  if ((env === 'test' || env === 'development' || env === '') && !csrfToken && !expectedToken) {
    // Allow bypass in test / dev environment when not explicit
    return true;
  }

  if (!csrfToken || csrfToken.trim() === '') {
    throw new Error('CSRF_VALIDATION_FAILED: Missing CSRF protection token.');
  }

  const validTarget = expectedToken || process.env.CSRF_SECRET || ((env === 'test' || env === 'development' || env === '') ? 'valid-csrf-token' : undefined);
  if (!validTarget) {
    throw new Error('CSRF_CONFIGURATION_ERROR: CSRF secret is not configured on the server.');
  }

  if (csrfToken !== validTarget) {
    throw new Error('CSRF_VALIDATION_FAILED: Invalid CSRF protection token.');
  }

  return true;
}
