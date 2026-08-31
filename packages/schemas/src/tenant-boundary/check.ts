import type {
  IdentityTenantBinding,
  TenantBoundaryCheck,
  TenantBoundaryDecision,
  TenantBoundaryReason,
} from '../../../contracts/src/tenant-boundary/types';

function sameExternalIdentity(
  left: IdentityTenantBinding['externalIdentity'] | undefined,
  right: IdentityTenantBinding['externalIdentity'] | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.provider === right.provider && left.externalId === right.externalId;
}

function outside(
  input: TenantBoundaryCheck,
  reason: TenantBoundaryReason,
): TenantBoundaryDecision {
  const actorBindings = input.bindings.filter(
    (binding) => binding.identityId === input.context.actor.identityId,
  );
  return {
    status: 'OUTSIDE_BOUNDARY',
    reason,
    correlationId: input.context.correlationId,
    evidence: {
      evaluatedTenantId: input.context.tenantId,
      actorIdentityId: input.context.actor.identityId,
      matchedBindingCount: actorBindings.filter(
        (binding) => binding.tenantId === input.context.tenantId,
      ).length,
      observedBindingTenantIds: [
        ...new Set(actorBindings.map((binding) => binding.tenantId)),
      ],
    },
  };
}

export function checkTenantBoundary(input: TenantBoundaryCheck): TenantBoundaryDecision {
  if (!input.knownTenantIds.includes(input.context.tenantId)) {
    return outside(input, 'TENANT_UNKNOWN');
  }

  const { actor, subject } = input.context;
  if (subject.kind === 'IDENTITY' && subject.identityId !== actor.identityId) {
    return outside(input, 'SUBJECT_MISMATCH');
  }
  if (subject.kind === 'EXTERNAL_IDENTITY') {
    if (actor.externalIdentity === undefined) {
      return outside(input, 'EXTERNAL_IDENTITY_MISMATCH');
    }
    if (
      actor.externalIdentity.provider !== subject.externalIdentity.provider ||
      actor.externalIdentity.externalId !== subject.externalIdentity.externalId
    ) {
      return outside(input, 'EXTERNAL_IDENTITY_MISMATCH');
    }
  }

  const actorBindings = input.bindings.filter(
    (binding) => binding.identityId === actor.identityId,
  );
  const targetBindings = actorBindings.filter(
    (binding) => binding.tenantId === input.context.tenantId,
  );

  if (targetBindings.length === 0) {
    return outside(
      input,
      actorBindings.length > 0 ? 'CROSS_TENANT_IDENTITY' : 'IDENTITY_NOT_BOUND',
    );
  }
  if (targetBindings.length !== 1) return outside(input, 'BINDING_AMBIGUOUS');

  const binding = targetBindings[0];
  if (binding === undefined) return outside(input, 'IDENTITY_NOT_BOUND');
  if (binding.identityKind !== actor.kind) return outside(input, 'BINDING_KIND_MISMATCH');
  if (actor.kind === 'SYSTEM' && binding.bindingKind !== 'SYSTEM') {
    return outside(input, 'BINDING_KIND_MISMATCH');
  }
  if (actor.kind !== 'SYSTEM' && binding.bindingKind === 'SYSTEM') {
    return outside(input, 'BINDING_KIND_MISMATCH');
  }

  const actorExternal = actor.externalIdentity;
  if (binding.bindingKind === 'EXTERNAL' || actorExternal !== undefined) {
    if (!sameExternalIdentity(binding.externalIdentity, actorExternal)) {
      return outside(input, 'EXTERNAL_IDENTITY_MISMATCH');
    }
  }

  return {
    status: 'WITHIN_BOUNDARY',
    reason: 'BOUNDARY_CONFIRMED',
    correlationId: input.context.correlationId,
    evidence: {
      evaluatedTenantId: input.context.tenantId,
      actorIdentityId: actor.identityId,
      matchedBindingCount: 1,
      observedBindingTenantIds: [input.context.tenantId],
    },
  };
}
