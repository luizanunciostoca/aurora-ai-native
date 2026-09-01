import type { TenantId } from '@aurora/contracts/ids';

export const CAPABILITY_TARGET_KINDS = [
  'PROVIDER',
  'DEVICE',
  'WORKFLOW',
  'LOCAL_SERVICE',
  'GATEWAY',
] as const;
export type CapabilityTargetKind = (typeof CAPABILITY_TARGET_KINDS)[number];

export const CAPABILITY_AVAILABILITY_STATES = [
  'AVAILABLE',
  'DEGRADED',
  'UNAVAILABLE',
  'UNKNOWN',
] as const;
export type CapabilityAvailabilityState = (typeof CAPABILITY_AVAILABILITY_STATES)[number];
export type CapabilityCurrentAvailability =
  'CURRENT_AVAILABLE' | 'CURRENT_DEGRADED' | 'UNAVAILABLE' | 'UNKNOWN' | 'STALE';

export type CapabilityRiskClass = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type CapabilitySideEffectClass =
  'READ_ONLY' | 'INTERNAL_STATE' | 'LOCAL_SIDE_EFFECT' | 'EXTERNAL_SIDE_EFFECT' | 'DESTRUCTIVE';
export type CapabilityReadbackStrategy = 'NONE' | 'RECEIPT' | 'STATE_COMPARE' | 'RECONCILE';
export type CapabilityEvidenceStrategy = 'REQUIRED' | 'OPTIONAL' | 'NOT_APPLICABLE';

export interface CapabilityAvailabilityObservation {
  readonly state: CapabilityAvailabilityState;
  readonly observedAt: string;
  readonly maxAgeMs: number;
  readonly source: string;
}

export interface CapabilityBindingDescriptor {
  readonly bindingId: string;
  readonly targetKind: CapabilityTargetKind;
  readonly compatibilityKey: string;
  readonly tenantId?: TenantId;
  readonly availability: CapabilityAvailabilityObservation;
}

export interface CapabilityProvenance {
  readonly sourceKind: 'AURORA_NATIVE' | 'LEGACY_SEED' | 'TOCA_REFERENCE';
  readonly sourceRef: string;
  readonly adjudicationId?: string;
}

export interface CapabilityDescriptor {
  readonly capabilityId: string;
  readonly semanticVersion: string;
  readonly name: string;
  readonly description: string;
  readonly tenantId?: TenantId;
  readonly supportedTargetKinds: readonly CapabilityTargetKind[];
  readonly compatibilityKeys: readonly string[];
  readonly requiredPermissionClaims: readonly string[];
  readonly preconditions: readonly string[];
  readonly riskClass: CapabilityRiskClass;
  readonly sideEffectClass: CapabilitySideEffectClass;
  readonly readbackStrategy: CapabilityReadbackStrategy;
  readonly evidenceStrategy: CapabilityEvidenceStrategy;
  readonly availability: CapabilityAvailabilityObservation;
  readonly bindings: readonly CapabilityBindingDescriptor[];
  readonly provenance: CapabilityProvenance;
}

export interface CapabilityRegistrySnapshot {
  readonly registryKind: 'AURORA_CANONICAL_CAPABILITY_REGISTRY';
  readonly registryVersion: string;
  readonly entries: readonly CapabilityDescriptor[];
}

export type CapabilityRegistryCreateResult =
  | { readonly status: 'CREATED'; readonly registry: CapabilityRegistrySnapshot }
  | {
      readonly status: 'REJECTED';
      readonly code: 'INVALID_REGISTRY_VERSION' | 'INVALID_CAPABILITY' | 'DUPLICATE_CAPABILITY_ID';
      readonly capabilityId?: string;
    };

export interface CapabilityPlanningAssessment {
  readonly capabilityId: string;
  readonly currentAvailability: CapabilityCurrentAvailability;
  readonly authorizesExecution: false;
}

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function validObservation(observation: CapabilityAvailabilityObservation): boolean {
  return (
    nonEmpty(observation.source) &&
    Number.isFinite(observation.maxAgeMs) &&
    observation.maxAgeMs >= 0 &&
    Number.isFinite(Date.parse(observation.observedAt))
  );
}

function validCapability(descriptor: CapabilityDescriptor): boolean {
  return (
    nonEmpty(descriptor.capabilityId) &&
    nonEmpty(descriptor.semanticVersion) &&
    nonEmpty(descriptor.name) &&
    nonEmpty(descriptor.description) &&
    descriptor.supportedTargetKinds.length > 0 &&
    validObservation(descriptor.availability) &&
    descriptor.bindings.every(
      (binding) =>
        nonEmpty(binding.bindingId) &&
        nonEmpty(binding.compatibilityKey) &&
        descriptor.supportedTargetKinds.includes(binding.targetKind) &&
        validObservation(binding.availability),
    )
  );
}

export function createCapabilityRegistry(
  registryVersion: string,
  entries: readonly CapabilityDescriptor[],
): CapabilityRegistryCreateResult {
  if (!nonEmpty(registryVersion)) return { status: 'REJECTED', code: 'INVALID_REGISTRY_VERSION' };

  const seen = new Set<string>();
  for (const entry of entries) {
    if (!validCapability(entry)) {
      return { status: 'REJECTED', code: 'INVALID_CAPABILITY', capabilityId: entry.capabilityId };
    }
    if (seen.has(entry.capabilityId)) {
      return {
        status: 'REJECTED',
        code: 'DUPLICATE_CAPABILITY_ID',
        capabilityId: entry.capabilityId,
      };
    }
    seen.add(entry.capabilityId);
  }

  return {
    status: 'CREATED',
    registry: {
      registryKind: 'AURORA_CANONICAL_CAPABILITY_REGISTRY',
      registryVersion,
      entries: [...entries].sort((left, right) =>
        left.capabilityId.localeCompare(right.capabilityId),
      ),
    },
  };
}

export function findCapability(
  registry: CapabilityRegistrySnapshot,
  capabilityId: string,
): CapabilityDescriptor | undefined {
  return registry.entries.find((entry) => entry.capabilityId === capabilityId);
}

export function evaluateCapabilityAvailability(
  observation: CapabilityAvailabilityObservation,
  nowEpochMs: number,
): CapabilityCurrentAvailability {
  const observedAt = Date.parse(observation.observedAt);
  if (!Number.isFinite(observedAt) || !Number.isFinite(nowEpochMs)) return 'UNKNOWN';
  if (nowEpochMs - observedAt > observation.maxAgeMs) return 'STALE';

  switch (observation.state) {
    case 'AVAILABLE':
      return 'CURRENT_AVAILABLE';
    case 'DEGRADED':
      return 'CURRENT_DEGRADED';
    case 'UNAVAILABLE':
      return 'UNAVAILABLE';
    case 'UNKNOWN':
      return 'UNKNOWN';
  }
}

export function assessCapabilityForPlanning(
  descriptor: CapabilityDescriptor,
  nowEpochMs: number,
): CapabilityPlanningAssessment {
  return {
    capabilityId: descriptor.capabilityId,
    currentAvailability: evaluateCapabilityAvailability(descriptor.availability, nowEpochMs),
    authorizesExecution: false,
  };
}
