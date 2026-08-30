import type { TenantId } from '../ids/types';

export interface TenantContext {
  readonly tenantId: TenantId;
}
