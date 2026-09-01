import {
  evaluateCapabilityAvailability,
  findCapability,
  type CapabilityBindingDescriptor,
  type CapabilityDescriptor,
  type CapabilityRegistrySnapshot,
} from '../../../registries/src/capabilities/registry.ts';
import type {
  CapabilityPlan,
  CapabilityPlanInput,
  CapabilityPlanSelection,
  CapabilityRequirement,
} from './types.ts';

function capabilityTenantMatches(
  descriptor: CapabilityDescriptor,
  input: CapabilityPlanInput,
): boolean {
  return descriptor.tenantId === undefined || descriptor.tenantId === input.tenantId;
}

function bindingMatchesTenant(
  binding: CapabilityBindingDescriptor,
  input: CapabilityPlanInput,
): boolean {
  return binding.tenantId === undefined || binding.tenantId === input.tenantId;
}

function capabilityMatchesRequirement(
  descriptor: CapabilityDescriptor,
  requirement: CapabilityRequirement,
): boolean {
  const targetKinds = requirement.acceptedTargetKinds;
  if (
    targetKinds !== undefined &&
    !targetKinds.some((targetKind) => descriptor.supportedTargetKinds.includes(targetKind))
  ) {
    return false;
  }

  const compatibility = requirement.requiredCompatibilityKeys;
  return (
    compatibility === undefined ||
    compatibility.every((key) => descriptor.compatibilityKeys.includes(key))
  );
}

function currentEnough(
  availability: ReturnType<typeof evaluateCapabilityAvailability>,
  allowDegraded: boolean,
): boolean {
  return (
    availability === 'CURRENT_AVAILABLE' ||
    (allowDegraded && availability === 'CURRENT_DEGRADED')
  );
}

function selectRequirement(
  registry: CapabilityRegistrySnapshot,
  input: CapabilityPlanInput,
  requirement: CapabilityRequirement,
): CapabilityPlanSelection {
  const descriptor = findCapability(registry, requirement.capabilityId);
  if (descriptor === undefined) {
    return {
      requirementId: requirement.requirementId,
      capabilityId: requirement.capabilityId,
      status: 'UNSATISFIED',
      reason: 'CAPABILITY_NOT_FOUND',
      selectedBindingIds: [],
    };
  }

  if (!capabilityTenantMatches(descriptor, input)) {
    return {
      requirementId: requirement.requirementId,
      capabilityId: requirement.capabilityId,
      status: 'UNSATISFIED',
      reason: 'TENANT_MISMATCH',
      selectedBindingIds: [],
    };
  }

  if (!capabilityMatchesRequirement(descriptor, requirement)) {
    return {
      requirementId: requirement.requirementId,
      capabilityId: requirement.capabilityId,
      status: 'UNSATISFIED',
      reason: 'INCOMPATIBLE_CAPABILITY',
      selectedBindingIds: [],
    };
  }

  const currentAvailability = evaluateCapabilityAvailability(
    descriptor.availability,
    input.nowEpochMs,
  );
  if (!currentEnough(currentAvailability, requirement.allowDegraded ?? false)) {
    return {
      requirementId: requirement.requirementId,
      capabilityId: requirement.capabilityId,
      status: 'UNSATISFIED',
      reason: 'CAPABILITY_NOT_CURRENT',
      currentAvailability,
      selectedBindingIds: [],
    };
  }

  const selectedBindingIds = descriptor.bindings
    .filter((binding) => bindingMatchesTenant(binding, input))
    .filter(
      (binding) =>
        requirement.acceptedTargetKinds === undefined ||
        requirement.acceptedTargetKinds.includes(binding.targetKind),
    )
    .filter(
      (binding) =>
        requirement.requiredCompatibilityKeys === undefined ||
        requirement.requiredCompatibilityKeys.includes(binding.compatibilityKey),
    )
    .filter((binding) =>
      currentEnough(
        evaluateCapabilityAvailability(binding.availability, input.nowEpochMs),
        requirement.allowDegraded ?? false,
      ),
    )
    .map((binding) => binding.bindingId)
    .sort();

  if (selectedBindingIds.length === 0) {
    return {
      requirementId: requirement.requirementId,
      capabilityId: requirement.capabilityId,
      status: 'UNSATISFIED',
      reason: 'NO_CURRENT_BINDING',
      currentAvailability,
      selectedBindingIds,
    };
  }

  return {
    requirementId: requirement.requirementId,
    capabilityId: requirement.capabilityId,
    status: 'SELECTED',
    reason: 'SELECTED',
    currentAvailability,
    selectedBindingIds,
  };
}

export function planCapabilities(
  registry: CapabilityRegistrySnapshot,
  input: CapabilityPlanInput,
): CapabilityPlan {
  if (registry.registryVersion !== input.registryVersion) {
    return {
      planKind: 'TARGET_NEUTRAL_CAPABILITY_PLAN',
      tenantId: input.tenantId,
      correlationId: input.correlationId,
      registryVersion: input.registryVersion,
      status: 'BLOCKED',
      selections: input.requirements.map((requirement) => ({
        requirementId: requirement.requirementId,
        capabilityId: requirement.capabilityId,
        status: 'UNSATISFIED',
        reason: 'CAPABILITY_NOT_CURRENT',
        selectedBindingIds: [],
      })),
      authorizesExecution: false,
    };
  }

  const selections = input.requirements.map((requirement) =>
    selectRequirement(registry, input, requirement),
  );
  return {
    planKind: 'TARGET_NEUTRAL_CAPABILITY_PLAN',
    tenantId: input.tenantId,
    correlationId: input.correlationId,
    registryVersion: input.registryVersion,
    status: selections.every((selection) => selection.status === 'SELECTED') ? 'READY' : 'BLOCKED',
    selections,
    authorizesExecution: false,
  };
}
