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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function runIdentityResolutionSchemaTests(): void {
  const request = IdentityResolutionRequestSchema.parse({
    schemaVersion: '1.0.0',
    tenantId,
    correlationId,
    subject: { kind: 'IDENTITY', identityId },
  });
  assert(request.subject.kind === 'IDENTITY', 'canonical identity request must parse');

  const malformedExternal = IdentityResolutionRequestSchema.safeParse({
    schemaVersion: '1.0.0',
    tenantId,
    correlationId,
    subject: {
      kind: 'EXTERNAL_IDENTITY',
      externalIdentity: { kind: 'EXTERNAL_IDENTITY', provider: '', externalId: 'provider-id' },
    },
  });
  assert(!malformedExternal.success, 'malformed external identity must be rejected');

  const unsupportedKind = IdentityResolutionRequestSchema.safeParse({
    schemaVersion: '1.0.0',
    tenantId,
    correlationId,
    subject: { kind: 'IDENTITY', identityId },
    expectedKind: 'OWNER',
  });
  assert(!unsupportedKind.success, 'unsupported expected identity kind must be rejected');

  const result = IdentityResolutionResultSchema.parse({
    status: 'RESOLVED',
    identity: {
      identityId,
      tenantId,
      kind: 'HUMAN',
      actor: { kind: 'HUMAN', identityId },
    },
    evidence,
  });
  assert(result.status === 'RESOLVED', 'resolved identity result must parse');
  assert(result.evidence.authorityGranted === false, 'resolution must not grant authority');

  const elevatedAuthority = IdentityResolutionResultSchema.safeParse({
    status: 'RESOLVED',
    identity: {
      identityId,
      tenantId,
      kind: 'HUMAN',
      actor: { kind: 'HUMAN', identityId },
    },
    evidence: { ...evidence, authorityGranted: true },
  });
  assert(!elevatedAuthority.success, 'authorityGranted=true must be rejected');

  const nonSingletonResult = IdentityResolutionResultSchema.safeParse({
    status: 'RESOLVED',
    identity: {
      identityId,
      tenantId,
      kind: 'HUMAN',
      actor: { kind: 'HUMAN', identityId },
    },
    evidence: { ...evidence, candidateCount: 2 },
  });
  assert(!nonSingletonResult.success, 'resolved result must have exactly one candidate');
}

runIdentityResolutionSchemaTests();
