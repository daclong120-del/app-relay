// Vercel Cron Protected Endpoint for Automated Artifact Expiry

import { NextRequest, NextResponse } from 'next/server';

function getDbClient(): any {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceRoleKey) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      return createClient(supabaseUrl, serviceRoleKey);
    } catch {}
  }
  return null;
}

export async function GET(request: NextRequest) {
  // 1. Authenticate CRON_SECRET
  const authHeader = request.headers.get('authorization');
  const cronHeader = request.headers.get('x-cron-secret');
  const expectedSecret = process.env.CRON_SECRET || 'dev-cron-secret-key';

  const token = authHeader?.replace(/^Bearer\s+/i, '') || cronHeader;
  if (token !== expectedSecret) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid or missing CRON_SECRET authorization.' } },
      { status: 401 }
    );
  }

  const db = getDbClient();
  if (!db) {
    return NextResponse.json(
      { error: { code: 'SERVICE_UNAVAILABLE', message: 'Database client not configured.' } },
      { status: 503 }
    );
  }

  // 2. Batch query expired artifacts
  const nowStr = new Date().toISOString();
  const { data: expiredArtifacts, error: queryError } = await db
    .from('release_ops_artifacts')
    .select('id, storage_path')
    .is('deleted_at', null)
    .lt('expires_at', nowStr)
    .limit(50);

  if (queryError || !expiredArtifacts || expiredArtifacts.length === 0) {
    return NextResponse.json({
      status: 200,
      processed: 0,
      deleted: 0,
      failed: 0,
    });
  }

  let deleted = 0;
  let failed = 0;

  for (const art of expiredArtifacts) {
    try {
      // Delete object from Storage idempotently
      if (db.storage) {
        await db.storage.from('release-ops-artifacts').remove([art.storage_path]).catch(() => {});
      }

      // Mark deleted in database
      const { error: markError } = await db
        .from('release_ops_artifacts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', art.id);

      if (!markError) {
        deleted++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return NextResponse.json({
    status: 200,
    processed: expiredArtifacts.length,
    deleted,
    failed,
  });
}
