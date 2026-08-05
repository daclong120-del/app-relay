// Repository for release_ops_jobs

import { ReleaseOpsJobItem, ReleaseOpsJobStatus, ReleaseOpsJobType } from '../../types/release-ops';

export class ReleaseOpsJobRepository {
  constructor(private db: any) {}

  async findAll(params?: {
    jobType?: ReleaseOpsJobType;
    status?: ReleaseOpsJobStatus;
    limit?: number;
    offset?: number;
  }): Promise<ReleaseOpsJobItem[]> {
    let query = this.db.from('release_ops_jobs').select('*');

    if (params?.jobType) {
      query = query.eq('job_type', params.jobType);
    }
    if (params?.status) {
      query = query.eq('status', params.status);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(params?.offset || 0, (params?.offset || 0) + (params?.limit || 50) - 1);

    const { data: rows, error } = await query;
    if (error || !rows) return [];

    return rows.map((r: any) => this.mapRow(r));
  }

  async findById(id: string): Promise<ReleaseOpsJobItem | null> {
    const { data: row, error } = await this.db
      .from('release_ops_jobs')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !row) return null;
    return this.mapRow(row);
  }

  async findByIdempotencyKey(key: string): Promise<ReleaseOpsJobItem | null> {
    const { data: row, error } = await this.db
      .from('release_ops_jobs')
      .select('*')
      .eq('idempotency_key', key)
      .maybeSingle();

    if (error || !row) return null;
    return this.mapRow(row);
  }

  async create(data: {
    jobType: ReleaseOpsJobType;
    priority?: number;
    releaseId?: string | null;
    appId?: string | null;
    idempotencyKey?: string | null;
    payload: Record<string, unknown>;
    createdBy?: string | null;
  }): Promise<ReleaseOpsJobItem> {
    const { data: row, error } = await this.db
      .from('release_ops_jobs')
      .insert({
        job_type: data.jobType,
        status: 'queued',
        priority: data.priority || 0,
        release_id: data.releaseId ?? null,
        app_id: data.appId ?? null,
        idempotency_key: data.idempotencyKey ?? null,
        payload: data.payload,
        created_by: data.createdBy ?? null,
      })
      .select('*')
      .single();

    if (error) throw new Error(`Job insert failed: ${error.message}`);
    return this.mapRow(row);
  }

  async updateStatus(
    id: string,
    status: ReleaseOpsJobStatus,
    errorMessage?: string
  ): Promise<boolean> {
    const updateData: Record<string, any> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (errorMessage !== undefined) {
      updateData.error_message = errorMessage;
    }

    const { error } = await this.db
      .from('release_ops_jobs')
      .update(updateData)
      .eq('id', id);

    return !error;
  }

  private mapRow(row: any): ReleaseOpsJobItem {
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
}
