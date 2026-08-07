// Next.js App Router Catch-All Route for Release Ops Worker API v1

import { NextRequest, NextResponse } from 'next/server';
import { ConfigurationError } from '../../../../../../lib/config/app-relay-config';
import { getServiceRoleClient } from '../../../../../../lib/db/service-client';
import { WorkerApiRouter } from '../../../../../../lib/release-ops-worker-api/router';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  const pathSegments = resolvedParams.path || [];

  let body: any = {};
  try {
    const text = await request.text();
    if (text && text.trim()) {
      body = JSON.parse(text);
    }
  } catch {
    return NextResponse.json(
      {
        error: {
          code: 'BAD_REQUEST',
          message: 'Invalid JSON request body.',
        },
        requestId: `req_${Date.now()}`,
      },
      { status: 400 }
    );
  }

  const headers: Record<string, string | null> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  let db;
  try {
    db = getServiceRoleClient();
  } catch (err) {
    // Without a database there is no token table to authenticate against, so
    // the gateway refuses service rather than running unauthenticated.
    console.error('[worker-api] configuration error:', err instanceof ConfigurationError ? err.message : err);
    return NextResponse.json(
      {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Worker gateway is not configured.',
          retryable: true,
        },
        requestId: `req_${Date.now()}`,
      },
      { status: 503 }
    );
  }

  const router = new WorkerApiRouter(db);
  const result = await router.dispatch('POST', pathSegments, headers, body);

  return NextResponse.json(result.body, { status: result.status });
}

// The worker gateway is server-to-server only; no browser origin is permitted.
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { 'Access-Control-Allow-Methods': 'POST, OPTIONS' },
  });
}
