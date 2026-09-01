import type { CorrelationId, TenantId } from '../../../contracts/src/ids/types.ts';
import type {
  CapabilityRiskClass,
  CapabilitySideEffectClass,
} from '../../../registries/src/capabilities/registry.ts';

export const PLANNING_LANES = ['FAST', 'GOVERNED'] as const;
export type PlanningLane = (typeof PLANNING_LANES)[number];

export const TASK_REVERSIBILITY = ['REVERSIBLE', 'COMPENSATABLE', 'IRREVERSIBLE', 'UNKNOWN'] as const;
export type TaskReversibility = (typeof TASK_REVERSIBILITY)[number];

export const TASK_COMPLEXITY = ['DETERMINISTIC', 'TEMPLATE_ELIGIBLE', 'ADAPTIVE', 'UNKNOWN'] as const;
export type TaskComplexity = (typeof TASK_COMPLEXITY)[number];

export interface LaneResolutionInput {
  readonly taskId: string;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly riskClass: CapabilityRiskClass;
  readonly sideEffectClass: CapabilitySideEffectClass;
  readonly reversibility: TaskReversibility;
  readonly complexity: TaskComplexity;
  readonly capabilityPlanStatus: 'READY' | 'BLOCKED';
  readonly approvalRequired: boolean;
  readonly stepUpRequired: boolean;
}

export type LaneResolutionReason =
  | 'CAPABILITY_PLAN_BLOCKED'
  | 'CRITICAL_OR_HIGH_RISK'
  | 'DESTRUCTIVE_SIDE_EFFECT'
  | 'IRREVERSIBLE_OR_UNKNOWN'
  | 'APPROVAL_REQUIRED'
  | 'STEP_UP_REQUIRED'
  | 'ADAPTIVE_OR_UNKNOWN_COMPLEXITY'
  | 'FAST_ELIGIBLE';

export interface LaneResolutionEvidence {
  readonly taskId: string;
  readonly riskClass: CapabilityRiskClass;
  readonly sideEffectClass: CapabilitySideEffectClass;
  readonly reversibility: TaskReversibility;
  readonly complexity: TaskComplexity;
  readonly capabilityPlanStatus: 'READY' | 'BLOCKED';
  readonly approvalRequired: boolean;
  readonly stepUpRequired: boolean;
}

export interface LaneResolution {
  readonly lane: PlanningLane;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly reasons: readonly LaneResolutionReason[];
  readonly evidence: LaneResolutionEvidence;
  readonly preferredPlanningStrategy: 'DETERMINISTIC' | 'TEMPLATE' | 'GOVERNED_REASONING';
  readonly mandatoryValidations: readonly [
    'CURRENT_POLICY',
    'CURRENT_AUTHORITY',
    'EXECUTOR_PRECONDITIONS',
  ];
  readonly authorizesExecution: false;
}
