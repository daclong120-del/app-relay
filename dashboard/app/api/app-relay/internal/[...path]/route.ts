// Internal AppRelay API for the dashboard UI (/api/app-relay/internal/*).
//
// Same handlers as the partner surface, but authenticated with a dashboard
// operator session instead of a partner API key, and scoped to read across all
// tenants. Browser callers reach it same-origin with an httpOnly cookie, so no
// token is embedded in client code.

import { NextRequest, NextResponse } from 'next/server';
import { ConfigurationError } from '../../../../../lib/config/app-relay-config';
import { handleDelete, handleGet, handlePost } from '../../../../../lib/app-relay-api/handlers';
import { internalScope } from '../../../../../lib/app-relay-api/context';
import { getInternalTenantId } from '../../../../../lib/app-relay-api/tenants';
import { getDashboardSession } from '../../../../../lib/app-relay-auth/session';
import { checkDatabaseHealth, getServiceRoleClient } from '../../../../../lib/db/service-client';
import { AppRelayError } from '../../../../../lib/errors/app-relay-errors';

export const dynamic = 'force-dynamic';

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function errorResponse(status: number, code: string, message: string, requestId: string) {
  return NextResponse.json({ error: { code, message, requestId, retryable: false } }, { status });
}

function mapThrown(err: unknown, requestId: string) {
  if (err instanceof ConfigurationError) {
    console.error('[app-relay-internal] configuration error:', err.message);
    return errorResponse(503, 'SERVICE_UNAVAILABLE', err.message, requestId);
  }
  if (err instanceof AppRelayError) {
    return errorResponse(err.statusCode, err.code, err.message, requestId);
  }
  console.error('[app-relay-internal] unhandled error:', err);
  return errorResponse(500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred.', requestId);
}

async function buildContext(requestId: string) {
  const session = await getDashboardSession();
  if (!session) return null;

  const db = getServiceRoleClient();
  const tenantId = await getInternalTenantId(db);

  return {
    db,
    scope: internalScope(tenantId),
    caller: 'internal' as const,
    actorId: session.userId,
    actorLabel: `user:${session.email}`,
    requestId,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const segments = (await params).path || [];
  const requestId = generateRequestId();

  try {
    if (segments.join('/') === 'health') {
      const health = await checkDatabaseHealth();
      return NextResponse.json(
        {
          status: health.reachable ? 'ok' : 'degraded',
          service: 'app-relay-internal',
          dependencies: { database: health.reachable ? 'ok' : 'unavailable' },
          error: health.error,
          requestId,
        },
        { status: health.reachable ? 200 : 503 }
      );
    }

    const ctx = await buildContext(requestId);
    if (!ctx) return errorResponse(401, 'UNAUTHORIZED', 'Dashboard authentication required.', requestId);

    const result = await handleGet(ctx, segments, request.nextUrl.searchParams);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return mapThrown(err, requestId);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const segments = (await params).path || [];
  const requestId = generateRequestId();

  try {
    const ctx = await buildContext(requestId);
    if (!ctx) return errorResponse(401, 'UNAUTHORIZED', 'Dashboard authentication required.', requestId);

    let body: any = {};
    const raw = await request.text();
    if (raw && raw.trim()) {
      try {
        body = JSON.parse(raw);
      } catch {
        return errorResponse(400, 'INVALID_REQUEST', 'Request body is not valid JSON.', requestId);
      }
    }

    const result = await handlePost(ctx, segments, body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return mapThrown(err, requestId);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const segments = (await params).path || [];
  const requestId = generateRequestId();

  try {
    const ctx = await buildContext(requestId);
    if (!ctx) return errorResponse(401, 'UNAUTHORIZED', 'Dashboard authentication required.', requestId);

    const result = await handleDelete(ctx, segments);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    return mapThrown(err, requestId);
  }
}
