import type { CorrelationId, TenantId } from '../../../contracts/src/ids/types.ts';
import type { CapabilityPlan } from '../capability-plan/types.ts';
import type { CapabilityRegistrySnapshot } from '../../../registries/src/capabilities/registry.ts';

export const PLAN_TEMPLATE_STATUSES = ['ACTIVE', 'INVALIDATED'] as const;
export type PlanTemplateStatus = (typeof PLAN_TEMPLATE_STATUSES)[number];

export const PLAN_TEMPLATE_INVALIDATION_CONDITIONS = [
  'EXPLICIT_REVOCATION',
  'INPUT_CONTRACT_VERSION_MISMATCH',
  'REGISTRY_VERSION_MISMATCH',
  'CAPABILITY_VERSION_MISMATCH',
  'COMPATIBILITY_KEY_MISSING',
] as const;
export type PlanTemplateInvalidationCondition =
  (typeof PLAN_TEMPLATE_INVALIDATION_CONDITIONS)[number];

export interface PlanTemplateMatchCriteria {
  readonly intentKind: string;
  readonly taskKind: string;
  readonly inputContractVersion: string;
}

export interface PlanTemplateRequirementCompatibility {
  readonly requirementId: string;
  readonly capabilityId: string;
  readonly allowedCapabilityVersions: readonly string[];
  readonly requiredCompatibilityKeys: readonly string[];
}

export interface PlanTemplateCompatibility {
  readonly registryVersions: readonly string[];
  readonly requirements: readonly PlanTemplateRequirementCompatibility[];
}

export interface PlanTemplateProvenance {
  readonly sourceKind: 'AURORA_CURATED';
  readonly sourceRef: string;
  readonly curatedBy: string;
  readonly curatedAt: string;
}

export interface PlanTemplate {
  readonly templateKind: 'AURORA_CURATED_PLAN_TEMPLATE';
  readonly templateId: string;
  readonly semanticVersion: string;
  readonly contentHash: string;
  readonly status: PlanTemplateStatus;
  readonly invalidationReason?: string;
  readonly match: PlanTemplateMatchCriteria;
  readonly requirementOrder: readonly string[];
  readonly compatibility: PlanTemplateCompatibility;
  readonly invalidationConditions: readonly PlanTemplateInvalidationCondition[];
  readonly provenance: PlanTemplateProvenance;
  readonly authorizesExecution: false;
  readonly adaptivePromotion: false;
}

export interface CreatePlanTemplateInput {
  readonly templateId: string;
  readonly semanticVersion: string;
  readonly contentHash: string;
  readonly status: PlanTemplateStatus;
  readonly invalidationReason?: string;
  readonly match: PlanTemplateMatchCriteria;
  readonly requirementOrder: readonly string[];
  readonly compatibility: PlanTemplateCompatibility;
  readonly invalidationConditions: readonly PlanTemplateInvalidationCondition[];
  readonly provenance: PlanTemplateProvenance;
}

export const PLAN_TEMPLATE_REJECTION_CODES = [
  'INVALID_TEMPLATE_ID',
  'INVALID_SEMANTIC_VERSION',
  'INVALID_CONTENT_HASH',
  'INVALID_STATUS_METADATA',
  'INVALID_MATCH_CRITERIA',
  'INVALID_PROVENANCE',
  'EMPTY_REQUIREMENTS',
  'DUPLICATE_REQUIREMENT_ID',
  'INVALID_REQUIREMENT_ORDER',
  'INVALID_COMPATIBILITY',
  'INVALID_INVALIDATION_CONDITIONS',
] as const;
export type PlanTemplateRejectionCode = (typeof PLAN_TEMPLATE_REJECTION_CODES)[number];

export type CreatePlanTemplateResult =
  | { readonly status: 'CREATED'; readonly template: PlanTemplate }
  | { readonly status: 'REJECTED'; readonly code: PlanTemplateRejectionCode };

export interface PlanTemplateBindingInput {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly expectedContentHash: string;
  readonly match: PlanTemplateMatchCriteria;
  readonly template: PlanTemplate;
  readonly capabilityPlan: CapabilityPlan;
  readonly registry: CapabilityRegistrySnapshot;
}

export interface PlanBindingSelection {
  readonly requirementId: string;
  readonly capabilityId: string;
  readonly capabilityVersion: string;
  readonly selectedBindingIds: readonly string[];
}

export interface PlanBinding {
  readonly bindingKind: 'AURORA_CURATED_PLAN_BINDING';
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly templateRef: {
    readonly templateId: string;
    readonly semanticVersion: string;
    readonly contentHash: string;
    readonly provenanceRef: string;
  };
  readonly registryVersion: string;
  readonly requirementOrder: readonly string[];
  readonly selections: readonly PlanBindingSelection[];
  readonly mandatoryValidations: readonly [
    'CURRENT_CAPABILITY',
    'CURRENT_POLICY',
    'CURRENT_AUTHORITY',
    'EXECUTOR_PRECONDITIONS',
  ];
  readonly authorizesExecution: false;
  readonly adaptivePromotion: false;
}

export const PLAN_BINDING_REJECTION_CODES = [
  'TEMPLATE_INVALIDATED',
  'CONTENT_HASH_MISMATCH',
  'MATCH_CRITERIA_MISMATCH',
  'TENANT_MISMATCH',
  'CORRELATION_MISMATCH',
  'CAPABILITY_PLAN_NOT_READY',
  'REGISTRY_SNAPSHOT_MISMATCH',
  'REGISTRY_VERSION_INCOMPATIBLE',
  'REQUIREMENT_NOT_SELECTED',
  'CAPABILITY_MISMATCH',
  'CAPABILITY_NOT_FOUND',
  'CAPABILITY_VERSION_INCOMPATIBLE',
  'COMPATIBILITY_KEY_MISSING',
] as const;
export type PlanBindingRejectionCode = (typeof PLAN_BINDING_REJECTION_CODES)[number];

export type BindPlanTemplateResult =
  | { readonly status: 'BOUND'; readonly binding: PlanBinding }
  | {
      readonly status: 'REJECTED';
      readonly code: PlanBindingRejectionCode;
      readonly requirementId?: string;
      readonly capabilityId?: string;
      readonly compatibilityKey?: string;
    };
