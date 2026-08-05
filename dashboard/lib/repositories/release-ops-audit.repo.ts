// Repository for release_ops_audits

export class ReleaseOpsAuditRepository {
  constructor(private db: any) {}

  async create(data: {
    action: string;
    entityType: string;
    entityId?: string | null;
    actorId?: string | null;
    details?: Record<string, unknown>;
  }): Promise<boolean> {
    const { error } = await this.db
      .from('release_ops_audits')
      .insert({
        action: data.action,
        entity_type: data.entityType,
        entity_id: data.entityId ?? null,
        actor_id: data.actorId ?? null,
        details: data.details || {},
      });

    return !error;
  }
}
