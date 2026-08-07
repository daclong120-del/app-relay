// Public partner API for AppRelay (/api/app-relay/v1/*).
//
// Every route except /health requires a partner API key from app_relay_api_keys
// and is scoped to that key's tenant. There is no mock database behind this
// route: if Supabase is not configured the endpoint reports 503 rather than
// answering with fabricated jobs.

import { NextRequest, NextResponse } from 'next/server';
import { getAppRelayConfig, ConfigurationError } from '../../../../../lib/config/app-relay-config';
import { authenticateApiKey } from '../../../../../lib/app-relay-auth/api-key.guard';
import { handleDelete, handleGet, handlePost, requiredScopeFor } from '../../../../../lib/app-relay-api/handlers';
import { AppRelayRequestContext, partnerScope } from '../../../../../lib/app-relay-api/context';
import { checkDatabaseHealth, getServiceRoleClient } from '../../../../../lib/db/service-client';
import { AppRelayError } from '../../../../../lib/errors/app-relay-errors';

export const dynamic = 'force-dynamic';

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Partner traffic is server-to-server with a bearer token, so credentialed
 * cross-origin requests are never needed. The previous implementation reflected
 * any Origin back with Access-Control-Allow-Credentials: true.
 */
function getCorsHeaders(request: NextRequest): Record<string, string> {
  const { allowedOrigins } = getAppRelayConfig();
  const origin = request.headers.get('origin');

  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };

  if (origin && allowedOrigins.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  requestId: string,
  cors: Record<string, string>,
  retryable = false
) {
  return NextResponse.json(
    { error: { code, message, requestId, retryable } },
    { status, headers: cors }
  );
}

function mapThrown(err: unknown, requestId: string, cors: Record<string, string>) {
  if (err instanceof ConfigurationError) {
    console.error('[app-relay] configuration error:', err.message);
    return errorResponse(
      503,
      'SERVICE_UNAVAILABLE',
      'The service is not correctly configured. Contact the operator.',
      requestId,
      cors,
      true
    );
  }

  if (err instanceof AppRelayError) {
    return errorResponse(err.statusCode, err.code, err.message, requestId, cors, err.retryable);
  }

  // Internal messages can carry table names and query fragments; they are
  // logged rather than returned.
  console.error('[app-relay] unhandled error:', err);
  return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred.', requestId, cors);
}

/** Authenticates the request and builds the tenant-scoped context. */
async function authorize(
  request: NextRequest,
  method: string,
  segments: string[],
  requestId: string
): Promise<{ ok: true; ctx: AppRelayRequestContext } | { ok: false; response: NextResponse }> {
  const cors = getCorsHeaders(request);
  const scopeNeeded = requiredScopeFor(method, segments);

  if (!scopeNeeded) {
    return {
      ok: false,
      response: errorResponse(404, 'NOT_FOUND', `Endpoint NOT_FOUND: /${segments.join('/')}`, requestId, cors),
    };
  }

  const db = getServiceRoleClient();
  const auth = await authenticateApiKey(request.headers.get('authorization'), scopeNeeded, db);

  if (!auth.success) {
    const headers = auth.status === 401 ? { ...cors, 'WWW-Authenticate': 'Bearer' } : cors;
    return {
      ok: false,
      response: errorResponse(auth.status, auth.code, auth.message, requestId, headers),
    };
  }

  return {
    ok: true,
    ctx: {
      db,
      scope: partnerScope(auth.context.tenantId),
      caller: 'partner',
      // created_by expects a dashboard user UUID; a partner key is not one.
      actorId: null,
      actorLabel: `api_key:${auth.context.keyName}`,
      requestId,
    },
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request) });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const segments = (await params).path || [];
  const requestId = generateRequestId();
  const cors = getCorsHeaders(request);

  // /health is intentionally unauthenticated so uptime probes work, and
  // intentionally shallow: the database result is cached for a few seconds so
  // it cannot be used to generate load.
  if (segments.join('/') === 'health') {
    const health = await checkDatabaseHealth();
    return NextResponse.json(
      {
        status: health.reachable ? 'ok' : 'degraded',
        service: 'app-relay-api',
        version: '1.0.0',
        dependencies: { database: health.reachable ? 'ok' : 'unavailable' },
        timestamp: new Date().toISOString(),
        requestId,
      },
      { status: health.reachable ? 200 : 503, headers: cors }
    );
  }

  try {
    const auth = await authorize(request, 'GET', segments, requestId);
    if (!auth.ok) return auth.response;

    const result = await handleGet(auth.ctx, segments, request.nextUrl.searchParams);
    return NextResponse.json(result.body, { status: result.status, headers: cors });
  } catch (err) {
    return mapThrown(err, requestId, cors);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const segments = (await params).path || [];
  const requestId = generateRequestId();
  const cors = getCorsHeaders(request);

  try {
    const auth = await authorize(request, 'POST', segments, requestId);
    if (!auth.ok) return auth.response;

    let body: any = {};
    const raw = await request.text();
    if (raw && raw.trim()) {
      try {
        body = JSON.parse(raw);
      } catch {
        return errorResponse(400, 'INVALID_REQUEST', 'Request body is not valid JSON.', requestId, cors);
      }
    }

    const result = await handlePost(auth.ctx, segments, body);
    return NextResponse.json(result.body, { status: result.status, headers: cors });
  } catch (err) {
    return mapThrown(err, requestId, cors);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const segments = (await params).path || [];
  const requestId = generateRequestId();
  const cors = getCorsHeaders(request);

  try {
    const auth = await authorize(request, 'DELETE', segments, requestId);
    if (!auth.ok) return auth.response;

    const result = await handleDelete(auth.ctx, segments);
    return NextResponse.json(result.body, { status: result.status, headers: cors });
  } catch (err) {
    return mapThrown(err, requestId, cors);
  }
}
