import type { PurposeContext } from '@aurora/contracts/purpose';
import type { ContractVersion } from '@aurora/contracts/versioning';
import { asRecord, assertExactKeys, createRuntimeSchema, parseNonEmptyString } from '../context/internal.js';

function parsePurpose(value: unknown): PurposeContext {
  const record = asRecord(value, 'PurposeContext');
  assertExactKeys(record, ['kind','purposeId','version','status','description','allowedDataClassifications'], ['kind','purposeId','version','status'], 'PurposeContext');
  if (record.kind !== 'PurposeContext') throw new TypeError('PurposeContext.kind is invalid');
  if (record.status !== 'ACTIVE' && record.status !== 'DISABLED') throw new TypeError('PurposeContext.status is invalid');
  return {
    kind: 'PurposeContext',
    purposeId: parseNonEmptyString(record.purposeId, 'purposeId'),
    version: parseNonEmptyString(record.version, 'version') as ContractVersion,
    status: record.status,
    ...(record.description === undefined ? {} : { description: parseNonEmptyString(record.description, 'description') }),
    ...(record.allowedDataClassifications === undefined ? {} : { allowedDataClassifications: record.allowedDataClassifications as PurposeContext['allowedDataClassifications'] }),
  };
}

export const PurposeContextSchema = createRuntimeSchema(parsePurpose);
