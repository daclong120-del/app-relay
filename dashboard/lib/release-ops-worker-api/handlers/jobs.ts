// Worker Job API Handlers (Claim, Start, Heartbeat, Event, Succeed, Fail)

import {
  validateAppendEvent,
  validateClaimJob,
  validateFailJob,
  validateJobHeartbeat,
  validateStartJob,
  validateSucceedJob,
} from '../schemas';

function mapJobRow(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    jobType: row.job_type,
    status: row.status,
    priority: Number(row.priority || 0),
    releaseId: row.release_id,
    appId: row.app_id,
    workerId: row.worker_id,
    leaseUntil: row.lease_until,
    heartbeatAt: row.heartbeat_at,
    attemptCount: Number(row.attempt_count || 0),
    maxAttempts: Number(row.max_attempts || 3),
    idempotencyKey: row.idempotency_key,
    payload: row.payload || {},
    result: row.result || {},
    errorMessage: row.error_message,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function handleClaimJob(db: any, body: any) {
  const input = validateClaimJob(body);

  const { data, error } = await db.rpc('release_ops_claim_job', {
    p_worker_id: input.workerId,
    p_capabilities: input.capabilities || null,
    p_lease_seconds: input.leaseSeconds,
  });

  if (error) {
    throw new Error(`Job claim failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const job = row ? mapJobRow(row) : null;

  return {
    job,
    pollAfterMs: job ? 0 : 5000,
  };
}

export async function handleStartJob(db: any, jobId: string, body: any) {
  const input = validateStartJob(body);

  const { data, error } = await db.rpc('release_ops_start_job', {
    p_job_id: jobId,
    p_worker_id: input.workerId,
  });

  if (error) {
    throw new Error(`Start job failed: ${error.message}`);
  }

  return { started: data === true };
}

export async function handleJobHeartbeat(db: any, jobId: string, body: any) {
  const input = validateJobHeartbeat(body);

  const { data, error } = await db.rpc('release_ops_job_heartbeat', {
    p_job_id: jobId,
    p_worker_id: input.workerId,
    p_lease_seconds: input.leaseSeconds,
  });

  if (error) {
    throw new Error(`Job heartbeat failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    renewed: row?.renewed ?? false,
    isCancelled: row?.is_cancelled ?? false,
  };
}

export async function handleAppendJobEvent(db: any, jobId: string, body: any) {
  const input = validateAppendEvent(body);

  const { data, error } = await db.rpc('release_ops_append_job_event', {
    p_job_id: jobId,
    p_worker_id: input.workerId,
    p_level: input.level,
    p_stage: input.stage,
    p_message: input.message,
    p_progress: input.progress,
    p_metadata: input.metadata,
  });

  if (error) {
    throw new Error(`Append job event failed: ${error.message}`);
  }

  return { recorded: data === true };
}

export async function handleSucceedJob(db: any, jobId: string, body: any) {
  const input = validateSucceedJob(body);

  // Safeguard: Check that artifact exists for this job before marking succeeded
  const { data: artifact } = await db
    .from('release_ops_artifacts')
    .select('id')
    .eq('job_id', jobId)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (!artifact && !input.result?.archiveArtifactId) {
    throw new Error('UNPROCESSABLE_ENTITY: Cannot succeed job before artifact upload is verified.');
  }

  const { data, error } = await db.rpc('release_ops_complete_job', {
    p_job_id: jobId,
    p_worker_id: input.workerId,
    p_result: input.result,
  });

  if (error) {
    throw new Error(`Complete job failed: ${error.message}`);
  }

  return { succeeded: data === true };
}

export async function handleFailJob(db: any, jobId: string, body: any) {
  const input = validateFailJob(body);

  const { data, error } = await db.rpc('release_ops_fail_job', {
    p_job_id: jobId,
    p_worker_id: input.workerId,
    p_error_message: input.errorMessage,
    p_can_retry: input.canRetry,
  });

  if (error) {
    throw new Error(`Fail job failed: ${error.message}`);
  }

  return { failed: data === true };
}
