'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const consent_1 = require('@aurora/contracts/consent');
const index_1 = require('./index');
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
const version = '1.0.0';
const tenantId = 'ten_01J00000000000000000000000';
const correlationId = 'cor_01J00000000000000000000000';
const identityId = 'idn_01J00000000000000000000000';
const subject = { kind: 'IDENTITY', identityId };
const now = '2026-08-31T15:30:00Z';
function consent(overrides = {}) {
  return {
    kind: 'ConsentRecord',
    schemaVersion: version,
    reference: { kind: 'CONSENT_RECORD', reference: 'consent-record-001', version },
    tenantId,
    subject,
    status: 'ACTIVE',
    grantedAt: '2026-08-01T00:00:00Z',
    expiresAt: '2026-12-31T00:00:00Z',
    scope: { purposeIds: ['marketing.analytics'], jurisdictions: ['BR'] },
    provenance: {
      source: 'privacy-center',
      reference: 'capture-001',
      capturedAt: '2026-08-01T00:00:00Z',
    },
    ...overrides,
  };
}
function request(record) {
  return {
    schemaVersion: version,
    correlationId,
    tenantId,
    subject,
    evaluatedAt: now,
    purpose: {
      kind: 'PurposeContext',
      purposeId: 'marketing.analytics',
      version,
      status: 'ACTIVE',
    },
    jurisdiction: { kind: 'JurisdictionContext', jurisdiction: 'BR', version },
    ...(record ? { consent: record } : {}),
  };
}
const active = (0, consent_1.evaluateConsent)(request(consent()));
assert(active.reason === 'ACTIVE_CONSENT', 'active consent must be satisfied');
const missing = (0, consent_1.evaluateConsent)(request());
assert(missing.reason === 'CONSENT_REQUIRED', 'missing consent must never become implicit consent');
const expiredConsent = consent({
  expiresAt: '2026-08-30T00:00:00Z',
});
const expired = (0, consent_1.evaluateConsent)(request(expiredConsent));
assert(expired.reason === 'CONSENT_EXPIRED', 'expired consent must fail deterministically');
const revokedConsent = consent({ status: 'REVOKED', revokedAt: now });
const revoked = (0, consent_1.evaluateConsent)(request(revokedConsent));
assert(revoked.reason === 'CONSENT_REVOKED', 'revoked consent must fail deterministically');
const wrongPurpose = (0, consent_1.evaluateConsent)({
  ...request(consent()),
  purpose: {
    kind: 'PurposeContext',
    purposeId: 'sales.crm',
    version,
    status: 'ACTIVE',
  },
});
assert(wrongPurpose.reason === 'PURPOSE_MISMATCH', 'wrong purpose must be representable');
const wrongJurisdiction = (0, consent_1.evaluateConsent)({
  ...request(consent()),
  jurisdiction: { kind: 'JurisdictionContext', jurisdiction: 'US-CA', version },
});
assert(
  wrongJurisdiction.reason === 'JURISDICTION_MISMATCH',
  'wrong jurisdiction must be representable',
);
const wrongSubject = (0, consent_1.evaluateConsent)({
  ...request(consent()),
  subject: {
    kind: 'IDENTITY',
    identityId: 'idn_01J11111111111111111111111',
  },
});
assert(wrongSubject.reason === 'SUBJECT_MISMATCH', 'wrong subject must fail closed');
const missingProvenance = index_1.ConsentRecordSchema.safeParse({ ...consent(), provenance: {} });
assert(!missingProvenance.success, 'missing provenance must be rejected by runtime schema');
