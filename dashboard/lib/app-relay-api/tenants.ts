// Tenant lookup helpers.

export const INTERNAL_TENANT_SLUG = 'internal';

let cachedInternalTenantId: string | null = null;

/**
 * Resolves the tenant that owns jobs created from the dashboard. Seeded by
 * migration 20260807000001; a missing row means migrations have not been
 * applied, which must surface rather than silently write NULL tenants.
 */
export async function getInternalTenantId(db: any): Promise<string> {
  if (cachedInternalTenantId) return cachedInternalTenantId;

  const { data, error } = await db
    .from('app_relay_tenants')
    .select('id')
    .eq('slug', INTERNAL_TENANT_SLUG)
    .maybeSingle();

  if (error || !data?.id) {
    throw new Error(
      `Internal tenant '${INTERNAL_TENANT_SLUG}' is missing. Apply migration 20260807000001_app_relay_auth_tenancy.sql.`
    );
  }

  cachedInternalTenantId = data.id as string;
  return cachedInternalTenantId;
}
