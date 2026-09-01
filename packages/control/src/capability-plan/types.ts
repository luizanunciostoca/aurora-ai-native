import type { CorrelationId, TenantId } from '../../../contracts/src/ids/types.ts';
import type {
  CapabilityCurrentAvailability,
  CapabilityTargetKind,
} from '../../../registries/src/capabilities/registry.ts';

export interface CapabilityRequirement {
  readonly requirementId: string;
  readonly capabilityId: string;
  readonly acceptedTargetKinds?: readonly CapabilityTargetKind[];
  readonly requiredCompatibilityKeys?: readonly string[];
  readonly allowDegraded?: boolean;
}

export interface CapabilityPlanInput {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly registryVersion: string;
  readonly nowEpochMs: number;
  readonly requirements: readonly CapabilityRequirement[];
}

export type CapabilityPlanSelectionReason =
  | 'SELECTED'
  | 'CAPABILITY_NOT_FOUND'
  | 'TENANT_MISMATCH'
  | 'CAPABILITY_NOT_CURRENT'
  | 'INCOMPATIBLE_CAPABILITY'
  | 'NO_CURRENT_BINDING';

export interface CapabilityPlanSelection {
  readonly requirementId: string;
  readonly capabilityId: string;
  readonly status: 'SELECTED' | 'UNSATISFIED';
  readonly reason: CapabilityPlanSelectionReason;
  readonly currentAvailability?: CapabilityCurrentAvailability;
  readonly selectedBindingIds: readonly string[];
}

export interface CapabilityPlan {
  readonly planKind: 'TARGET_NEUTRAL_CAPABILITY_PLAN';
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly registryVersion: string;
  readonly status: 'READY' | 'BLOCKED';
  readonly selections: readonly CapabilityPlanSelection[];
  readonly authorizesExecution: false;
}
