import type { JurisdictionContext, JurisdictionRestriction } from '@aurora/contracts/jurisdiction';
import type { ContractVersion } from '@aurora/contracts/versioning';
import { asRecord, assertExactKeys, createRuntimeSchema, parseNonEmptyString } from '../context/internal.js';

function parseJurisdictionContext(value: unknown): JurisdictionContext {
  const record = asRecord(value, 'JurisdictionContext');
  assertExactKeys(record, ['kind','jurisdiction','version'], ['kind','jurisdiction','version'], 'JurisdictionContext');
  if (record.kind !== 'JurisdictionContext') throw new TypeError('JurisdictionContext.kind is invalid');
  return { kind: 'JurisdictionContext', jurisdiction: parseNonEmptyString(record.jurisdiction, 'jurisdiction'), version: parseNonEmptyString(record.version, 'version') as ContractVersion };
}

function parseRestriction(value: unknown): JurisdictionRestriction {
  const record = asRecord(value, 'JurisdictionRestriction');
  assertExactKeys(record, ['kind','jurisdiction','effect','purposeIds','reasonReference','version'], ['kind','jurisdiction','effect','reasonReference','version'], 'JurisdictionRestriction');
  if (record.kind !== 'JurisdictionRestriction') throw new TypeError('JurisdictionRestriction.kind is invalid');
  if (record.effect !== 'ALLOW' && record.effect !== 'DENY') throw new TypeError('JurisdictionRestriction.effect is invalid');
  return {
    kind: 'JurisdictionRestriction',
    jurisdiction: parseNonEmptyString(record.jurisdiction, 'jurisdiction'),
    effect: record.effect,
    ...(record.purposeIds === undefined ? {} : { purposeIds: record.purposeIds as readonly string[] }),
    reasonReference: parseNonEmptyString(record.reasonReference, 'reasonReference'),
    version: parseNonEmptyString(record.version, 'version') as ContractVersion,
  };
}

export const JurisdictionContextSchema = createRuntimeSchema(parseJurisdictionContext);
export const JurisdictionRestrictionSchema = createRuntimeSchema(parseRestriction);
