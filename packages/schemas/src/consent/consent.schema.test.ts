import {
  evaluateConsent,
  type ConsentEvaluationRequest,
  type ConsentRecord,
} from '@aurora/contracts/consent';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';
import type { ContractVersion } from '@aurora/contracts/versioning';
import { ConsentRecordSchema } from './index.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const version = '1.0.0' as ContractVersion;
const tenantId = 'ten_01J00000000000000000000000' as TenantId;
const correlationId = 'cor_01J00000000000000000000000' as CorrelationId;
const identityId = 'idn_01J00000000000000000000000' as IdentityId;
const subject = { kind: 'IDENTITY', identityId } as const;
const now = '2026-08-31T15:30:00Z' as Rfc3339Timestamp;

function consent(overrides: Partial<ConsentRecord> = {}): ConsentRecord {
  return {
    kind: 'ConsentRecord',
    schemaVersion: version,
    reference: { kind: 'CONSENT_RECORD', reference: 'consent-record-001', version },
    tenantId,
    subject,
    status: 'ACTIVE',
    grantedAt: '2026-08-01T00:00:00Z' as Rfc3339Timestamp,
    expiresAt: '2026-12-31T00:00:00Z' as Rfc3339Timestamp,
    scope: { purposeIds: ['marketing.analytics'], jurisdictions: ['BR'] },
    provenance: {
      source: 'privacy-center',
      reference: 'capture-001',
      capturedAt: '2026-08-01T00:00:00Z' as Rfc3339Timestamp,
    },
    ...overrides,
  };
}

function request(record?: ConsentRecord): ConsentEvaluationRequest {
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

const active = evaluateConsent(request(consent()));
assert(active.reason === 'ACTIVE_CONSENT', 'active consent must be satisfied');

const missing = evaluateConsent(request());
assert(missing.reason === 'CONSENT_REQUIRED', 'missing consent must never become implicit consent');

const expiredConsent = consent({
  expiresAt: '2026-08-30T00:00:00Z' as Rfc3339Timestamp,
});
const expired = evaluateConsent(request(expiredConsent));
assert(expired.reason === 'CONSENT_EXPIRED', 'expired consent must fail deterministically');

const revokedConsent = consent({ status: 'REVOKED', revokedAt: now });
const revoked = evaluateConsent(request(revokedConsent));
assert(revoked.reason === 'CONSENT_REVOKED', 'revoked consent must fail deterministically');

const wrongPurpose = evaluateConsent({
  ...request(consent()),
  purpose: {
    kind: 'PurposeContext',
    purposeId: 'sales.crm',
    version,
    status: 'ACTIVE',
  },
});
assert(wrongPurpose.reason === 'PURPOSE_MISMATCH', 'wrong purpose must be representable');

const wrongJurisdiction = evaluateConsent({
  ...request(consent()),
  jurisdiction: { kind: 'JurisdictionContext', jurisdiction: 'US-CA', version },
});
assert(
  wrongJurisdiction.reason === 'JURISDICTION_MISMATCH',
  'wrong jurisdiction must be representable',
);

const wrongSubject = evaluateConsent({
  ...request(consent()),
  subject: {
    kind: 'IDENTITY',
    identityId: 'idn_01J11111111111111111111111' as IdentityId,
  },
});
assert(wrongSubject.reason === 'SUBJECT_MISMATCH', 'wrong subject must fail closed');

const missingProvenance = ConsentRecordSchema.safeParse({ ...consent(), provenance: {} });
assert(!missingProvenance.success, 'missing provenance must be rejected by runtime schema');
