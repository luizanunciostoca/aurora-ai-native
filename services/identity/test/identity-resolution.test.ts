import type { ExternalIdentityRef } from '@aurora/contracts/context';
import type {
  CorrelationId,
  IdentityId,
  ProviderExternalId,
  TenantId,
} from '@aurora/contracts/ids';
import type { ContractVersion } from '@aurora/contracts/versioning';
import type {
  IdentityResolutionRecord,
  IdentityResolutionRequest,
} from '@aurora/contracts/identity-resolution';
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

function request(
  subject: IdentityResolutionRequest['subject'],
  tenantId = tenantA,
): IdentityResolutionRequest {
  return { schemaVersion: version, tenantId, correlationId, subject };
}

export function runIdentityResolutionTests(): void {
  const canonical = new DeterministicIdentityResolver(records, now).resolve(
    request({ kind: 'IDENTITY', identityId: humanId }),
  );
  assert(canonical.status === 'RESOLVED', 'canonical identity must resolve');
  assert(canonical.evidence.authorityGranted === false, 'resolution must not grant authority');

  const externalBinding = new DeterministicIdentityResolver(records, now).resolve(
    request({ kind: 'EXTERNAL_IDENTITY', externalIdentity: external }),
  );
  assert(externalBinding.status === 'RESOLVED', 'external binding must resolve');
  assert(
    externalBinding.identity.identityId === humanId,
    'external binding must resolve to canonical identity',
  );
  assert(
    String(externalBinding.identity.identityId) !== String(external.externalId),
    'provider external ID must not become canonical IdentityId',
  );

  const unknown = 'idn_01J00000000000000000000099' as IdentityId;
  const unknownResult = new DeterministicIdentityResolver(records, now).resolve(
    request({ kind: 'IDENTITY', identityId: unknown }),
  );
  assert(unknownResult.status === 'NOT_FOUND', 'unknown identity must fail not found');

  const firstRecord = records[0];
  assert(firstRecord !== undefined, 'identity test fixture must contain first record');
  const ambiguous: readonly IdentityResolutionRecord[] = [
    firstRecord,
    { tenantId: tenantA, identityId: agentId, kind: 'AGENT', externalIdentities: [external] },
  ];
  const ambiguousResult = new DeterministicIdentityResolver(ambiguous, now).resolve(
    request({ kind: 'EXTERNAL_IDENTITY', externalIdentity: external }),
  );
  assert(ambiguousResult.status === 'AMBIGUOUS', 'ambiguous identity must fail closed');

  const crossTenant = new DeterministicIdentityResolver(records, now).resolve(
    request({ kind: 'IDENTITY', identityId: agentId }, tenantA),
  );
  assert(crossTenant.status === 'CONFLICT', 'cross-tenant identity must fail closed');
  assert(crossTenant.error.code === 'FORBIDDEN', 'cross-tenant identity must be forbidden');

  const kindMismatch = new DeterministicIdentityResolver(records, now).resolve({
    ...request({ kind: 'IDENTITY', identityId: humanId }),
    expectedKind: 'SYSTEM',
  });
  assert(kindMismatch.status === 'CONFLICT', 'identity kind mismatch must fail closed');

  const resolver = new DeterministicIdentityResolver(records, now);
  const replayInput = request({ kind: 'IDENTITY', identityId: humanId });
  assertDeepEqual(
    resolver.resolve(replayInput),
    resolver.resolve(replayInput),
    'equivalent identity resolution replay must be deterministic',
  );
}

runIdentityResolutionTests();
