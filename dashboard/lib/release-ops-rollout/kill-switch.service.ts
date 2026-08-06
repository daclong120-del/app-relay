// Emergency Kill Switch Manager

export interface KillSwitchResult {
  triggered: boolean;
  reason: string;
  workersUpdatedCount: number;
  auditId?: string;
}

export async function triggerEmergencyKillSwitch(
  db: any,
  reason: string,
  actorId?: string
): Promise<KillSwitchResult> {
  const sanitizedReason = reason?.trim() || 'Emergency Kill Switch triggered by operator.';

  let workersUpdatedCount = 0;

  // 1. Set all active/idle workers to maintenance
  const { data: workers, error: queryError } = await db
    .from('release_ops_workers')
    .select('id')
    .in('status', ['active', 'idle']);

  if (!queryError && workers && workers.length > 0) {
    const ids = workers.map((w: any) => w.id);
    const { error: updateError } = await db
      .from('release_ops_workers')
      .update({ status: 'maintenance', updated_at: new Date().toISOString() })
      .in('id', ids);

    if (!updateError) {
      workersUpdatedCount = ids.length;
    }
  }

  // 2. Record Emergency Audit Log
  const { data: audit, error: auditError } = await db
    .from('release_ops_audits')
    .insert({
      action: 'emergency_kill_switch_triggered',
      entity_type: 'release_ops_system',
      actor_id: actorId || null,
      details: {
        reason: sanitizedReason,
        workersUpdatedCount,
        triggeredAt: new Date().toISOString(),
      },
    })
    .select('id')
    .single();

  return {
    triggered: true,
    reason: sanitizedReason,
    workersUpdatedCount,
    auditId: audit?.id,
  };
}
