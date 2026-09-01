'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ConsentRecordSchema = void 0;
const internal_1 = require('../context/internal');
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
];
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
];
exports.ConsentRecordSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'ConsentRecord');
  (0, internal_1.assertExactKeys)(record, consentKeys, requiredConsentKeys, 'ConsentRecord');
  if (record.kind !== 'ConsentRecord') {
    throw new TypeError('ConsentRecord.kind is invalid');
  }
  if (!['ACTIVE', 'EXPIRED', 'REVOKED'].includes(String(record.status))) {
    throw new TypeError('ConsentRecord.status is invalid');
  }
  const reference = (0, internal_1.asRecord)(record.reference, 'ConsentRecord.reference');
  if (reference.kind !== 'CONSENT_RECORD') {
    throw new TypeError('ConsentRecord.reference.kind is invalid');
  }
  (0, internal_1.parseNonEmptyString)(reference.reference, 'ConsentRecord.reference.reference');
  (0, internal_1.parseNonEmptyString)(reference.version, 'ConsentRecord.reference.version');
  const scope = (0, internal_1.asRecord)(record.scope, 'ConsentRecord.scope');
  if (!Array.isArray(scope.purposeIds) || scope.purposeIds.length === 0) {
    throw new TypeError('ConsentRecord.scope.purposeIds is invalid');
  }
  const provenance = (0, internal_1.asRecord)(record.provenance, 'ConsentRecord.provenance');
  (0, internal_1.parseNonEmptyString)(provenance.source, 'ConsentRecord.provenance.source');
  (0, internal_1.parseNonEmptyString)(provenance.reference, 'ConsentRecord.provenance.reference');
  (0, internal_1.parseNonEmptyString)(provenance.capturedAt, 'ConsentRecord.provenance.capturedAt');
  return record;
});
