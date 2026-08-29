import type { TenantId } from '../ids/index.js';

export interface TenantContext {
  readonly tenantId: TenantId;
}
