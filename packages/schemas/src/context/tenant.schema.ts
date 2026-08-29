import type { TenantContext } from '../../../contracts/src/context/tenant.js';
import { TenantIdSchema } from '../ids/id.schemas.js';
import {
  asRecord,
  assertExactKeys,
  createRuntimeSchema,
} from './internal.js';

export const TenantContextSchema = createRuntimeSchema<TenantContext>(
  (value: unknown) => {
    const record = asRecord(value, 'TenantContext');
    assertExactKeys(record, ['tenantId'], ['tenantId'], 'TenantContext');
    return { tenantId: TenantIdSchema.parse(record.tenantId) };
  },
);
