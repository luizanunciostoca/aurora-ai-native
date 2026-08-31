import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExternalIdentityRef } from '@aurora/contracts/context';
import type { CorrelationId, IdentityId, ProviderExternalId, TenantId } from '@aurora/contracts/ids';
import type { ContractVersion } from '@aurora/contracts/versioning';
import type { IdentityResolutionRecord, IdentityResolutionRequest } from '@aurora/contracts/identity-resolution';
import { DeterministicIdentityResolver } from '../src/index';

const version = '1.0.0' as ContractVersion;
const correlationId = 'cor_01J00000000000000000000000' as CorrelationId;
const tenantA = 'ten_01J00000000000000000000000' as TenantId;
const tenantB = 'ten_01J00000000000000000000001' as TenantId;
const humanId = 'idn_01J00000000000000000000000' as IdentityId;
const agentId = 'idn_01J00000000000000000000001' as IdentityId;
const external: ExternalIdentityRef = {
  kind: 'EXTERNAL_IDENTITY',
  provider: 'meta',
  externalId: '17841400000000000' as ProviderExternalId,
};
const now = () => '2026-08-31T15:30:00.000Z';

const records: readonly IdentityResolutionRecord[] = [
  { tenantId: tenantA, identityId: humanId, kind: 'HUMAN', externalIdentities: [external] },
  { tenantId: tenantB, identityId: agentId, kind: 'AGENT' },
];

function request(subject: IdentityResolutionRequest['subject'], tenantId = tenantA): IdentityResolutionRequest {
  return { schemaVersion: version, tenantId, correlationId, subject };
}

test('canonical identity resolves without authority', () => {
  const result = new DeterministicIdentityResolver(records, now).resolve(
    request({ kind: 'IDENTITY', identityId: humanId }),
  );
  assert.equal(result.status, 'RESOLVED');
  assert.equal(result.evidence.authorityGranted, false);
});

test('external binding resolves to canonical identity', () => {
  const result = new DeterministicIdentityResolver(records, now).resolve(
    request({ kind: 'EXTERNAL_IDENTITY', externalIdentity: external }),
  );
  assert.equal(result.status, 'RESOLVED');
  if (result.status === 'RESOLVED') {
    assert.equal(result.identity.identityId, humanId);
    assert.notEqual(String(result.identity.identityId), String(external.externalId));
  }
});

test('unknown identity fails not found', () => {
  const unknown = 'idn_01J00000000000000000000099' as IdentityId;
  const result = new DeterministicIdentityResolver(records, now).resolve(
    request({ kind: 'IDENTITY', identityId: unknown }),
  );
  assert.equal(result.status, 'NOT_FOUND');
});

test('ambiguous external binding fails closed', () => {
  const ambiguous: readonly IdentityResolutionRecord[] = [
    records[0]!,
    { tenantId: tenantA, identityId: agentId, kind: 'AGENT', externalIdentities: [external] },
  ];
  const result = new DeterministicIdentityResolver(ambiguous, now).resolve(
    request({ kind: 'EXTERNAL_IDENTITY', externalIdentity: external }),
  );
  assert.equal(result.status, 'AMBIGUOUS');
});

test('cross-tenant misuse fails closed', () => {
  const result = new DeterministicIdentityResolver(records, now).resolve(
    request({ kind: 'IDENTITY', identityId: agentId }, tenantA),
  );
  assert.equal(result.status, 'CONFLICT');
  if (result.status !== 'RESOLVED') assert.equal(result.error.code, 'FORBIDDEN');
});

test('expected identity kind mismatch fails closed', () => {
  const result = new DeterministicIdentityResolver(records, now).resolve({
    ...request({ kind: 'IDENTITY', identityId: humanId }),
    expectedKind: 'SYSTEM',
  });
  assert.equal(result.status, 'CONFLICT');
});

test('replay with equal records, request and clock is deterministic', () => {
  const resolver = new DeterministicIdentityResolver(records, now);
  const input = request({ kind: 'IDENTITY', identityId: humanId });
  assert.deepEqual(resolver.resolve(input), resolver.resolve(input));
});
