import {
  asRecord,
  assertExactKeys,
  createRuntimeSchema,
  parseNonEmptyString,
} from '../context/internal';

const consentKeys = [
  'kind',
  'schemaVersion',
  'reference',
  'tenantId',
  'subject',
  'status',
  'grantedAt',
  'expiresAt',
  'revokedAt',
  'scope',
  'provenance',
  'classification',
] as const;

const requiredConsentKeys = [
  'kind',
  'schemaVersion',
  'reference',
  'tenantId',
  'subject',
  'status',
  'grantedAt',
  'scope',
  'provenance',
] as const;

export const ConsentRecordSchema = createRuntimeSchema<Record<string, unknown>>((value: unknown) => {
  const record = asRecord(value, 'ConsentRecord');
  assertExactKeys(record, consentKeys, requiredConsentKeys, 'ConsentRecord');

  if (record.kind !== 'ConsentRecord') {
    throw new TypeError('ConsentRecord.kind is invalid');
  }
  if (!['ACTIVE', 'EXPIRED', 'REVOKED'].includes(String(record.status))) {
    throw new TypeError('ConsentRecord.status is invalid');
  }

  const reference = asRecord(record.reference, 'ConsentRecord.reference');
  if (reference.kind !== 'CONSENT_RECORD') {
    throw new TypeError('ConsentRecord.reference.kind is invalid');
  }
  parseNonEmptyString(reference.reference, 'ConsentRecord.reference.reference');
  parseNonEmptyString(reference.version, 'ConsentRecord.reference.version');

  const scope = asRecord(record.scope, 'ConsentRecord.scope');
  if (!Array.isArray(scope.purposeIds) || scope.purposeIds.length === 0) {
    throw new TypeError('ConsentRecord.scope.purposeIds is invalid');
  }

  const provenance = asRecord(record.provenance, 'ConsentRecord.provenance');
  parseNonEmptyString(provenance.source, 'ConsentRecord.provenance.source');
  parseNonEmptyString(provenance.reference, 'ConsentRecord.provenance.reference');
  parseNonEmptyString(provenance.capturedAt, 'ConsentRecord.provenance.capturedAt');

  return record;
});
