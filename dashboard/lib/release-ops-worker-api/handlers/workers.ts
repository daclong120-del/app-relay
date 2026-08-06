// Worker Fleet API Handlers (Register & Heartbeat)

import { validateRegisterWorker, validateWorkerHeartbeat } from '../schemas';

export async function handleRegisterWorker(db: any, body: any) {
  const input = validateRegisterWorker(body);

  const { data, error } = await db.rpc('release_ops_register_worker', {
    p_worker_name: input.workerName,
    p_max_parallel_jobs: input.maxParallelJobs,
    p_metadata: input.metadata,
    p_worker_id: input.workerId || null,
  });

  if (error) {
    throw new Error(`Worker registration failed: ${error.message}`);
  }

  const worker = Array.isArray(data) ? data[0] : data;

  return {
    worker: {
      id: worker.id,
      workerName: worker.worker_name,
      status: worker.status,
      maxParallelJobs: Number(worker.max_parallel_jobs || 1),
      lastHeartbeat: worker.last_heartbeat,
      metadata: worker.metadata || {},
      createdAt: worker.created_at,
      updatedAt: worker.updated_at,
    },
  };
}

export async function handleWorkerHeartbeat(db: any, body: any) {
  const input = validateWorkerHeartbeat(body);

  const { error } = await db.rpc('release_ops_worker_heartbeat', {
    p_worker_id: input.workerId,
    p_status: input.status,
    p_metadata: input.metadata || null,
  });

  if (error) {
    throw new Error(`Worker heartbeat failed: ${error.message}`);
  }

  return { success: true };
}
