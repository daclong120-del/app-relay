// Repository for release_ops_artifacts

import { applyTenantFilter, TenantScope } from '../app-relay-api/context';
import { AppRelayArtifact } from '../../types/release-ops';

export class ReleaseOpsArtifactRepository {
  constructor(private db: any) {}

  async create(data: {
    tenantId: string;
    releaseId?: string | null;
    jobId?: string | null;
    appId?: string | null;
    fileName: string;
    checksum?: string | null;
    storagePath: string;
    artifactType?: string;
    contentType?: string;
    sizeBytes: number;
    expiresAt?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<AppRelayArtifact> {
    const { data: row, error } = await this.db
      .from('release_ops_artifacts')
      .insert({
        tenant_id: data.tenantId,
        release_id: data.releaseId ?? null,
        job_id: data.jobId ?? null,
        app_id: data.appId ?? null,
        file_name: data.fileName,
        checksum: data.checksum ?? null,
        storage_path: data.storagePath,
        artifact_type: data.artifactType ?? 'apk_zip',
        content_type: data.contentType ?? 'application/zip',
        size_bytes: data.sizeBytes,
        expires_at: data.expiresAt ?? null,
        metadata: data.metadata ?? {},
      })
      .select('*')
      .single();

    if (error) throw new Error(`Artifact repository insert failed: ${error.message}`);
    return this.mapRow(row);
  }

  async findById(id: string, scope: TenantScope): Promise<AppRelayArtifact | null> {
    let query = this.db.from('release_ops_artifacts').select('*').eq('id', id);
    query = applyTenantFilter(query, scope);

    const { data: row, error } = await query.maybeSingle();

    if (error || !row) return null;
    return this.mapRow(row);
  }

  async findByJobId(jobId: string, scope: TenantScope): Promise<AppRelayArtifact | null> {
    let query = this.db
      .from('release_ops_artifacts')
      .select('*')
      .eq('job_id', jobId)
      .is('deleted_at', null);
    query = applyTenantFilter(query, scope);

    const { data: row, error } = await query
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !row) return null;
    return this.mapRow(row);
  }

  async markDeleted(id: string, scope: TenantScope): Promise<boolean> {
    let query = this.db
      .from('release_ops_artifacts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    query = applyTenantFilter(query, scope);

    const { error } = await query;

    return !error;
  }

  private mapRow(row: any): AppRelayArtifact {
    return {
      id: row.id,
      tenantId: row.tenant_id ?? null,
      releaseId: row.release_id,
      jobId: row.job_id,
      appId: row.app_id,
      fileName: row.file_name,
      checksum: row.checksum,
      storagePath: row.storage_path,
      artifactType: row.artifact_type,
      contentType: row.content_type,
      sizeBytes: Number(row.size_bytes || 0),
      expiresAt: row.expires_at,
      deletedAt: row.deleted_at,
      metadata: row.metadata || {},
      createdAt: row.created_at,
    };
  }
}
