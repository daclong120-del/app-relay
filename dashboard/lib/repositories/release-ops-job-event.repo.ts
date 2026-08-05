// Repository for release_ops_job_events

import { AppRelayJobEvent } from '../../types/release-ops';

export class ReleaseOpsJobEventRepository {
  constructor(private db: any) {}

  async findByJobId(jobId: string): Promise<AppRelayJobEvent[]> {
    const { data: rows, error } = await this.db
      .from('release_ops_job_events')
      .select('*')
      .eq('job_id', jobId)
      .order('created_at', { ascending: true });

    if (error || !rows) return [];
    return rows.map((r: any) => this.mapRow(r));
  }

  async createEvent(data: {
    jobId: string;
    level?: 'info' | 'warn' | 'error';
    stage: string;
    message: string;
    progress?: number;
    metadata?: Record<string, unknown>;
  }): Promise<AppRelayJobEvent> {
    const { data: row, error } = await this.db
      .from('release_ops_job_events')
      .insert({
        job_id: data.jobId,
        level: data.level || 'info',
        stage: data.stage,
        message: data.message,
        progress: data.progress || 0,
        metadata: data.metadata || {},
      })
      .select('*')
      .single();

    if (error) throw new Error(`JobEvent insert failed: ${error.message}`);
    return this.mapRow(row);
  }

  private mapRow(row: any): AppRelayJobEvent {
    return {
      id: row.id,
      jobId: row.job_id,
      level: row.level || 'info',
      stage: row.stage,
      message: row.message,
      progress: Number(row.progress || 0),
      metadata: row.metadata || {},
      createdAt: row.created_at,
    };
  }
}
