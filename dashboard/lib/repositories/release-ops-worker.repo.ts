// Repository for release_ops_workers

import { ReleaseOpsWorkerItem } from '../../types/release-ops';

export class ReleaseOpsWorkerRepository {
  constructor(private db: any) {}

  async findAll(): Promise<ReleaseOpsWorkerItem[]> {
    const { data: rows, error } = await this.db
      .from('release_ops_workers')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error || !rows) return [];
    return rows.map((r: any) => this.mapRow(r));
  }

  async findById(id: string): Promise<ReleaseOpsWorkerItem | null> {
    const { data: row, error } = await this.db
      .from('release_ops_workers')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !row) return null;
    return this.mapRow(row);
  }

  private mapRow(row: any): ReleaseOpsWorkerItem {
    return {
      id: row.id,
      workerName: row.worker_name,
      status: row.status,
      maxParallelJobs: Number(row.max_parallel_jobs || 1),
      lastHeartbeat: row.last_heartbeat,
      metadata: row.metadata || {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
