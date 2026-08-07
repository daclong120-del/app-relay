// Dashboard operator session handling.
//
// The dashboard previously had no login at all, and the CSRF/admin guard took
// its `session` object as a function argument — meaning a caller could simply
// assert `role: 'admin'`. Sessions are now derived server-side from a signed
// Supabase access token held in an httpOnly cookie, never from caller input.

if (typeof window !== 'undefined') {
  throw new Error('SERVER_ONLY_MODULE: Session module cannot be loaded in browser environment.');
}

import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export const ACCESS_TOKEN_COOKIE = 'ar_access_token';
export const REFRESH_TOKEN_COOKIE = 'ar_refresh_token';

export interface DashboardSession {
  userId: string;
  email: string;
  role: string;
}

function getAnonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!url || !anonKey) {
    throw new Error(
      'CONFIGURATION_ERROR: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for dashboard login.'
    );
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Optional tightening: when APPRELAY_ADMIN_EMAILS is set, only those addresses
 * may use the dashboard. When it is unset, any user that exists in the Supabase
 * project is accepted — account creation is already an admin-only operation
 * there.
 */
function isAllowedOperator(email: string | undefined): boolean {
  const allowlist = (process.env.APPRELAY_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (allowlist.length === 0) return true;
  return !!email && allowlist.includes(email.toLowerCase());
}

/** Verifies the access token against Supabase. Returns null when not signed in. */
export async function getDashboardSession(): Promise<DashboardSession | null> {
  let accessToken: string | undefined;
  try {
    const cookieStore = await cookies();
    accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  } catch {
    return null;
  }

  if (!accessToken) return null;

  try {
    const supabase = getAnonClient();
    const { data, error } = await supabase.auth.getUser(accessToken);

    if (error || !data?.user) return null;
    if (!isAllowedOperator(data.user.email)) return null;

    const role =
      (data.user.app_metadata as Record<string, unknown> | undefined)?.role as string | undefined;

    return {
      userId: data.user.id,
      email: data.user.email || '',
      role: role || 'admin',
    };
  } catch {
    return null;
  }
}

export class SessionRequiredError extends Error {
  readonly statusCode = 401;
  readonly code = 'UNAUTHORIZED';

  constructor(message = 'Dashboard authentication required.') {
    super(message);
    this.name = 'SessionRequiredError';
  }
}

/** Server-side session assertion for internal routes and server actions. */
export async function requireDashboardSession(): Promise<DashboardSession> {
  const session = await getDashboardSession();
  if (!session) throw new SessionRequiredError();
  return session;
}

export async function signInOperator(
  email: string,
  password: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  let supabase;
  try {
    supabase = getAnonClient();
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Login is not configured on this server.' };
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    return { ok: false, message: 'Invalid email or password.' };
  }

  if (!isAllowedOperator(data.user?.email)) {
    return { ok: false, message: 'This account is not permitted to use the dashboard.' };
  }

  const cookieStore = await cookies();
  const secure = process.env.NODE_ENV === 'production';

  cookieStore.set(ACCESS_TOKEN_COOKIE, data.session.access_token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: data.session.expires_in ?? 3600,
  });

  cookieStore.set(REFRESH_TOKEN_COOKIE, data.session.refresh_token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return { ok: true };
}

export async function signOutOperator(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  cookieStore.delete(REFRESH_TOKEN_COOKIE);
}
