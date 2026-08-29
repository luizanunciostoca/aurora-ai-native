import type { TenantId } from '../ids/types.js';

export interface TenantContext {
  readonly tenantId: TenantId;
}
