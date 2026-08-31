import type { PurposeContext } from '@aurora/contracts/purpose';
import {
  asRecord,
  assertExactKeys,
  createRuntimeSchema,
  parseNonEmptyString,
} from '../context/internal';

export const PurposeContextSchema = createRuntimeSchema<PurposeContext>((value: unknown) => {
  const record = asRecord(value, 'PurposeContext');
  assertExactKeys(
    record,
    ['kind', 'purposeId', 'version', 'status', 'description', 'allowedDataClassifications'],
    ['kind', 'purposeId', 'version', 'status'],
    'PurposeContext',
  );

  if (record.kind !== 'PurposeContext') {
    throw new TypeError('PurposeContext.kind is invalid');
  }
  if (record.status !== 'ACTIVE' && record.status !== 'DISABLED') {
    throw new TypeError('PurposeContext.status is invalid');
  }
  parseNonEmptyString(record.purposeId, 'purposeId');
  parseNonEmptyString(record.version, 'version');

  return record as unknown as PurposeContext;
});
