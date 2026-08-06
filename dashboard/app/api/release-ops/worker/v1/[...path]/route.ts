// Next.js App Router Catch-All Route for Release Ops Worker API v1

import { NextRequest, NextResponse } from 'next/server';
import { WorkerApiRouter } from '../../../../../../lib/release-ops-worker-api/router';

function getDbClient(): any {
  // If @supabase/supabase-js is available at runtime, create service role client
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceRoleKey) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      return createClient(supabaseUrl, serviceRoleKey);
    } catch {
      // Fallback
    }
  }

  // Minimum mock interface fallback if DB connection env variables are missing during initial setup
  return null;
}

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

  const db = getDbClient();
  const router = new WorkerApiRouter(db);
  const result = await router.dispatch('POST', pathSegments, headers, body);

  return NextResponse.json(result.body, { status: result.status });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
