import {
  ActorRefSchema,
  CorrelationContextSchema,
  DeadlineSchema,
  PropagationContextSchema,
  TenantContextSchema,
} from './index';

const VALID_TENANT_ID = 'ten_01J00000000000000000000000';
const VALID_IDENTITY_ID = 'idn_01J00000000000000000000000';
const VALID_CORRELATION_ID = 'cor_01J00000000000000000000000';
const VALID_CAUSATION_ID = 'cau_01J00000000000000000000000';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertThrows(fn: () => unknown, message: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw, message);
}

export function runContextSchemaContractTests(): void {
  assertThrows(
    () => TenantContextSchema.parse({ tenantId: '' }),
    'empty TenantId must be rejected',
  );
  assertThrows(
    () => TenantContextSchema.parse({ tenantId: 'provider-tenant-123' }),
    'provider-specific tenant identifier must not become canonical TenantId',
  );
  assertThrows(
    () => ActorRefSchema.parse({ kind: 'HUMAN', identityId: '' }),
    'empty IdentityId must be rejected',
  );
  assertThrows(
    () =>
      ActorRefSchema.parse({
        kind: 'HUMAN',
        identityId: VALID_IDENTITY_ID,
        email: 'person@example.invalid',
      }),
    'email must not become actor identity metadata',
  );

  const actor = ActorRefSchema.parse({
    kind: 'AGENT',
    identityId: VALID_IDENTITY_ID,
    externalIdentity: {
      kind: 'EXTERNAL_IDENTITY',
      provider: 'provider-x',
      externalId: 'opaque-provider-subject',
    },
  });
  assert(actor.kind === 'AGENT', 'agent actor must preserve its canonical kind');

  const correlationInput = {
    correlationId: VALID_CORRELATION_ID,
    causation: { causationId: VALID_CAUSATION_ID },
  };
  const correlationWire = JSON.parse(JSON.stringify(correlationInput)) as unknown;
  const correlation = CorrelationContextSchema.parse(correlationWire);
  assert(
    correlation.correlationId === VALID_CORRELATION_ID,
    'correlation serialization must preserve CorrelationId',
  );

  assertThrows(
    () => DeadlineSchema.parse({ deadlineAt: '2026-02-31T12:00:00Z' }),
    'invalid calendar deadline must be rejected',
  );
  assertThrows(
    () => DeadlineSchema.parse({ deadlineAt: '2026-08-29 12:00:00' }),
    'deadline without RFC3339 offset must be rejected',
  );

  const propagation = PropagationContextSchema.parse({
    kind: 'PROPAGATION_CONTEXT',
    schemaVersion: '1.0.0',
    tenant: { tenantId: VALID_TENANT_ID },
    actor: { kind: 'SYSTEM', identityId: VALID_IDENTITY_ID },
    correlation: correlationInput,
    metadata: {
      dataClassification: 'CONFIDENTIAL',
      deadline: { deadlineAt: '2026-08-30T12:00:00-03:00' },
    },
  });

  assert(
    propagation.tenant.tenantId === VALID_TENANT_ID,
    'tenant propagation must preserve canonical TenantId',
  );
  assert(
    propagation.metadata.dataClassification === 'CONFIDENTIAL',
    'classification must survive propagation validation',
  );
}
