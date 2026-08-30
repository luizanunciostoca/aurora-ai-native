import type { TenantContext } from '@aurora/contracts/context';
import { TenantIdSchema } from '../ids/id.schemas';
import { asRecord, assertExactKeys, createRuntimeSchema } from './internal';

export const TenantContextSchema = createRuntimeSchema<TenantContext>((value: unknown) => {
  const record = asRecord(value, 'TenantContext');
  assertExactKeys(record, ['tenantId'], ['tenantId'], 'TenantContext');
  return { tenantId: TenantIdSchema.parse(record.tenantId) };
});
