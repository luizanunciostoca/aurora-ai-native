import { checkTenantBoundary } from './check';
import { TenantBoundaryCheckSchema } from './tenant-boundary.schema';

const TENANT_A = 'ten_01J00000000000000000000000';
const TENANT_B = 'ten_01J00000000000000000000001';
const IDENTITY_A = 'idn_01J00000000000000000000000';
const IDENTITY_B = 'idn_01J00000000000000000000001';
const CORRELATION = 'cor_01J00000000000000000000000';

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

function baseCheck() {
  return {
    context: {
      tenantId: TENANT_A,
      actor: { kind: 'HUMAN', identityId: IDENTITY_A },
      subject: { kind: 'IDENTITY', identityId: IDENTITY_A },
      correlationId: CORRELATION,
    },
    knownTenantIds: [TENANT_A, TENANT_B],
    bindings: [
      {
        tenantId: TENANT_A,
        identityId: IDENTITY_A,
        identityKind: 'HUMAN',
        bindingKind: 'MEMBER',
      },
    ],
  };
}

export function runTenantBoundaryTests(): void {
  const valid = TenantBoundaryCheckSchema.parse(baseCheck());
  const validDecision = checkTenantBoundary(valid);
  assert(validDecision.status === 'WITHIN_BOUNDARY', 'valid tenant binding must pass');
  assert(validDecision.correlationId === CORRELATION, 'correlation must be preserved');
  assert(
    validDecision.evidence.matchedBindingCount === 1,
    'matched binding evidence must be recorded',
  );

  const unknownTenant = baseCheck();
  unknownTenant.context.tenantId = 'ten_01J00000000000000000000009';
  const unknownDecision = checkTenantBoundary(TenantBoundaryCheckSchema.parse(unknownTenant));
  assert(unknownDecision.reason === 'TENANT_UNKNOWN', 'unknown tenant must fail closed');

  const crossTenant = baseCheck();
  crossTenant.bindings = [
    {
      tenantId: TENANT_B,
      identityId: IDENTITY_A,
      identityKind: 'HUMAN',
      bindingKind: 'MEMBER',
    },
  ];
  const crossDecision = checkTenantBoundary(TenantBoundaryCheckSchema.parse(crossTenant));
  assert(
    crossDecision.reason === 'CROSS_TENANT_IDENTITY',
    'cross-tenant identity must fail closed',
  );

  const mismatchedSubject = baseCheck();
  mismatchedSubject.context.subject.identityId = IDENTITY_B;
  const subjectDecision = checkTenantBoundary(TenantBoundaryCheckSchema.parse(mismatchedSubject));
  assert(subjectDecision.reason === 'SUBJECT_MISMATCH', 'mismatched subject must fail closed');

  assertThrows(() => {
    TenantBoundaryCheckSchema.parse({
      ...baseCheck(),
      context: { ...baseCheck().context, tenantId: '' },
    });
  }, 'malformed tenant must be rejected');

  const withoutTenant = baseCheck() as Record<string, unknown>;
  const contextWithoutTenant = {
    ...(withoutTenant.context as Record<string, unknown>),
  };
  delete contextWithoutTenant.tenantId;
  withoutTenant.context = contextWithoutTenant;
  assertThrows(
    () => TenantBoundaryCheckSchema.parse(withoutTenant),
    'missing tenant must be rejected',
  );

  const externalWrongTenant = {
    context: {
      tenantId: TENANT_A,
      actor: {
        kind: 'HUMAN',
        identityId: IDENTITY_A,
        externalIdentity: {
          kind: 'EXTERNAL_IDENTITY',
          provider: 'provider-x',
          externalId: 'external-123',
        },
      },
      subject: {
        kind: 'EXTERNAL_IDENTITY',
        externalIdentity: {
          kind: 'EXTERNAL_IDENTITY',
          provider: 'provider-x',
          externalId: 'external-123',
        },
      },
      correlationId: CORRELATION,
    },
    knownTenantIds: [TENANT_A, TENANT_B],
    bindings: [
      {
        tenantId: TENANT_B,
        identityId: IDENTITY_A,
        identityKind: 'HUMAN',
        bindingKind: 'EXTERNAL',
        externalIdentity: {
          kind: 'EXTERNAL_IDENTITY',
          provider: 'provider-x',
          externalId: 'external-123',
        },
      },
    ],
  };
  const externalDecision = checkTenantBoundary(
    TenantBoundaryCheckSchema.parse(externalWrongTenant),
  );
  assert(
    externalDecision.reason === 'CROSS_TENANT_IDENTITY',
    'external identity mapped to wrong tenant must fail closed',
  );
}

runTenantBoundaryTests();
