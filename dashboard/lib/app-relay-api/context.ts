// Request context shared by the partner and internal AppRelay API surfaces.

export interface TenantScope {
  /** Tenant stamped onto rows this request creates. */
  tenantId: string;
  /**
   * When true, reads are not filtered by tenant. Only the authenticated
   * dashboard (internal) surface sets this; partner requests never do.
   */
  readAllTenants: boolean;
}

export type CallerKind = 'partner' | 'internal';

export interface AppRelayRequestContext {
  db: any;
  scope: TenantScope;
  caller: CallerKind;
  /** api key id for partners, dashboard user id for internal callers. */
  actorId: string | null;
  /** Audit label, e.g. 'api_key:Acme Production' or 'user:ops@example.com'. */
  actorLabel: string;
  requestId: string;
}

export function partnerScope(tenantId: string): TenantScope {
  return { tenantId, readAllTenants: false };
}

export function internalScope(tenantId: string): TenantScope {
  return { tenantId, readAllTenants: true };
}

/**
 * Applies the tenant filter to a PostgREST query builder. Centralised so that
 * adding a new query cannot accidentally skip the tenant boundary.
 */
export function applyTenantFilter<T>(query: T, scope: TenantScope, column = 'tenant_id'): T {
  if (scope.readAllTenants) return query;
  return (query as any).eq(column, scope.tenantId) as T;
}
