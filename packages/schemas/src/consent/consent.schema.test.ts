import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateConsent,
  type ConsentEvaluationRequest,
  type ConsentRecord,
} from '@aurora/contracts/consent';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';
import type { ContractVersion } from '@aurora/contracts/versioning';
import { ConsentRecordSchema } from './index.js';

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

test('active consent is satisfied', () => {
  const result = evaluateConsent(request(consent()));
  assert.equal(result.reason, 'ACTIVE_CONSENT');
});

test('missing consent never becomes implicit consent', () => {
  const result = evaluateConsent(request());
  assert.equal(result.reason, 'CONSENT_REQUIRED');
});

test('expired consent fails deterministically', () => {
  const expiredConsent = consent({
    expiresAt: '2026-08-30T00:00:00Z' as Rfc3339Timestamp,
  });
  const result = evaluateConsent(request(expiredConsent));
  assert.equal(result.reason, 'CONSENT_EXPIRED');
});

test('revoked consent fails deterministically', () => {
  const revokedConsent = consent({ status: 'REVOKED', revokedAt: now });
  const result = evaluateConsent(request(revokedConsent));
  assert.equal(result.reason, 'CONSENT_REVOKED');
});

test('wrong purpose is representable', () => {
  const result = evaluateConsent({
    ...request(consent()),
    purpose: {
      kind: 'PurposeContext',
      purposeId: 'sales.crm',
      version,
      status: 'ACTIVE',
    },
  });
  assert.equal(result.reason, 'PURPOSE_MISMATCH');
});

test('wrong jurisdiction is representable', () => {
  const result = evaluateConsent({
    ...request(consent()),
    jurisdiction: { kind: 'JurisdictionContext', jurisdiction: 'US-CA', version },
  });
  assert.equal(result.reason, 'JURISDICTION_MISMATCH');
});

test('wrong subject is rejected', () => {
  const result = evaluateConsent({
    ...request(consent()),
    subject: {
      kind: 'IDENTITY',
      identityId: 'idn_01J11111111111111111111111' as IdentityId,
    },
  });
  assert.equal(result.reason, 'SUBJECT_MISMATCH');
});

test('missing provenance is rejected by schema', () => {
  const parsed = ConsentRecordSchema.safeParse({ ...consent(), provenance: {} });
  assert.equal(parsed.success, false);
});
