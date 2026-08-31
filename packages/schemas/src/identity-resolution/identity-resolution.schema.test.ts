import assert from 'node:assert/strict';
import test from 'node:test';
import {
  IdentityResolutionRequestSchema,
  IdentityResolutionResultSchema,
} from './identity-resolution.schema';

const tenantId = 'ten_01J00000000000000000000000';
const correlationId = 'cor_01J00000000000000000000000';
const identityId = 'idn_01J00000000000000000000000';

const evidence = {
  method: 'CANONICAL_ID',
  tenantId,
  correlationId,
  resolvedAt: '2026-08-31T15:30:00.000Z',
  normalizedReference: `identity:${identityId}`,
  candidateCount: 1,
  authorityGranted: false,
};

test('accepts canonical identity resolution request', () => {
  const parsed = IdentityResolutionRequestSchema.parse({
    schemaVersion: '1.0.0',
    tenantId,
    correlationId,
    subject: { kind: 'IDENTITY', identityId },
  });
  assert.equal(parsed.subject.kind, 'IDENTITY');
});

test('rejects malformed external identity reference', () => {
  const parsed = IdentityResolutionRequestSchema.safeParse({
    schemaVersion: '1.0.0',
    tenantId,
    correlationId,
    subject: {
      kind: 'EXTERNAL_IDENTITY',
      externalIdentity: { kind: 'EXTERNAL_IDENTITY', provider: '', externalId: 'provider-id' },
    },
  });
  assert.equal(parsed.success, false);
});

test('rejects unsupported expected identity kind', () => {
  const parsed = IdentityResolutionRequestSchema.safeParse({
    schemaVersion: '1.0.0',
    tenantId,
    correlationId,
    subject: { kind: 'IDENTITY', identityId },
    expectedKind: 'OWNER',
  });
  assert.equal(parsed.success, false);
});

test('accepts resolved identity result with no authority', () => {
  const parsed = IdentityResolutionResultSchema.parse({
    status: 'RESOLVED',
    identity: {
      identityId,
      tenantId,
      kind: 'HUMAN',
      actor: { kind: 'HUMAN', identityId },
    },
    evidence,
  });
  assert.equal(parsed.status, 'RESOLVED');
  assert.equal(parsed.evidence.authorityGranted, false);
});

test('rejects any result claiming identity resolution grants authority', () => {
  const parsed = IdentityResolutionResultSchema.safeParse({
    status: 'RESOLVED',
    identity: {
      identityId,
      tenantId,
      kind: 'HUMAN',
      actor: { kind: 'HUMAN', identityId },
    },
    evidence: { ...evidence, authorityGranted: true },
  });
  assert.equal(parsed.success, false);
});

test('rejects resolved result with non-singleton candidate count', () => {
  const parsed = IdentityResolutionResultSchema.safeParse({
    status: 'RESOLVED',
    identity: {
      identityId,
      tenantId,
      kind: 'HUMAN',
      actor: { kind: 'HUMAN', identityId },
    },
    evidence: { ...evidence, candidateCount: 2 },
  });
  assert.equal(parsed.success, false);
});
