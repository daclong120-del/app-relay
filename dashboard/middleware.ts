import { NextRequest, NextResponse } from 'next/server';

const ACCESS_TOKEN_COOKIE = 'ar_access_token';

/**
 * Cheap presence check that redirects signed-out browsers to /login before a
 * page renders. It deliberately does not verify the token — that happens in the
 * (main) layout and in the internal API route, which are the authoritative
 * checks. Middleware only avoids a flash of an unauthenticated page.
 */
export function middleware(request: NextRequest) {
  const hasSession = Boolean(request.cookies.get(ACCESS_TOKEN_COOKIE)?.value);

  if (hasSession) return NextResponse.next();

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Dashboard pages only. The partner API authenticates with bearer keys and
  // the internal API returns 401 JSON rather than a redirect.
  matcher: ['/dash/:path*'],
};
