import assert from 'node:assert/strict';
import test from 'node:test';
import { IdentityResolutionRequestSchema } from './identity-resolution.schema';

test('accepts canonical identity resolution request', () => {
  const parsed = IdentityResolutionRequestSchema.parse({
    schemaVersion: '1.0.0',
    tenantId: 'ten_01J00000000000000000000000',
    correlationId: 'cor_01J00000000000000000000000',
    subject: { kind: 'IDENTITY', identityId: 'idn_01J00000000000000000000000' },
  });
  assert.equal(parsed.subject.kind, 'IDENTITY');
});

test('rejects malformed external identity reference', () => {
  const parsed = IdentityResolutionRequestSchema.safeParse({
    schemaVersion: '1.0.0',
    tenantId: 'ten_01J00000000000000000000000',
    correlationId: 'cor_01J00000000000000000000000',
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
    tenantId: 'ten_01J00000000000000000000000',
    correlationId: 'cor_01J00000000000000000000000',
    subject: { kind: 'IDENTITY', identityId: 'idn_01J00000000000000000000000' },
    expectedKind: 'OWNER',
  });
  assert.equal(parsed.success, false);
});
