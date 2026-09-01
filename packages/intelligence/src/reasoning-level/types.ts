import type { CorrelationContext, TenantContext } from '@aurora/contracts';
import type { TaskClassification } from '../classification/types';

export const REASONING_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'] as const;
export type ReasoningLevel = (typeof REASONING_LEVELS)[number];

export type ReasoningUncertainty = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';

export type ReasoningBudgetState = 'WITHIN_BUDGET' | 'DEGRADED' | 'EXHAUSTED';
export type ReasoningBudgetAction =
  | 'CONTINUE_OPTIONAL'
  | 'DEGRADE_OPTIONAL'
  | 'STOP_OPTIONAL'
  | 'HOLD';

/**
 * Read-only consumer projection of the accepted W04 ExecutionBudgetAssessment.
 * W04 remains the source of truth; this projection carries only fields W05-C
 * needs for deterministic reasoning selection and cannot authorize execution.
 */
export interface ReasoningBudgetProjection {
  readonly source: 'W04_EXECUTION_BUDGET_ASSESSMENT';
  readonly budgetId: string;
  readonly state: ReasoningBudgetState;
  readonly action: ReasoningBudgetAction;
  readonly remainingReasoningUnits: number;
  readonly mandatorySafetyValidationRequired: true;
  readonly canSkipMandatoryValidation: false;
  readonly authorizesExecution: false;
}

export interface ReasoningLevelRequest {
  readonly tenant: TenantContext;
  readonly correlation: CorrelationContext;
  readonly classification: TaskClassification;
  readonly uncertainty: ReasoningUncertainty;
  readonly budget?: ReasoningBudgetProjection;
}

export type ReasoningLevelReason =
  | 'TASK_NEED_FROM_COMPLEXITY'
  | 'UNKNOWN_COMPLEXITY_REQUIRES_CAUTION'
  | 'UNCERTAINTY_ESCALATION'
  | 'VERY_HIGH_UNCERTAINTY_ESCALATION'
  | 'BUDGET_OPTIONAL_DEGRADATION'
  | 'BUDGET_EXHAUSTED'
  | 'BUDGET_HOLD'
  | 'BUDGET_INSUFFICIENT_FOR_MINIMUM_TASK_NEED';

export interface ReasoningLevelDescriptor {
  readonly level: ReasoningLevel;
  readonly ordinal: 0 | 1 | 2 | 3 | 4 | 5;
  readonly semantic:
    | 'DETERMINISTIC_OR_NO_REASONING'
    | 'BOUNDED_DIRECT'
    | 'STRUCTURED'
    | 'MULTI_STEP'
    | 'DEEP'
    | 'MAXIMUM_BOUNDED';
  readonly nominalReasoningUnits: number;
}

export interface ResolvedReasoningLevel {
  readonly status: 'RESOLVED';
  readonly tenant: TenantContext;
  readonly correlation: CorrelationContext;
  readonly level: ReasoningLevel;
  readonly requestedLevel: ReasoningLevel;
  readonly reasons: readonly ReasoningLevelReason[];
  readonly budgetId?: string;
  readonly mandatorySafetyValidationRequired: true;
  readonly canSkipMandatoryValidation: false;
  readonly authorizesExecution: false;
}

export interface HeldReasoningLevel {
  readonly status: 'HELD';
  readonly tenant: TenantContext;
  readonly correlation: CorrelationContext;
  readonly requestedLevel: ReasoningLevel;
  readonly reasons: readonly ReasoningLevelReason[];
  readonly budgetId?: string;
  readonly mandatorySafetyValidationRequired: true;
  readonly canSkipMandatoryValidation: false;
  readonly authorizesExecution: false;
}

export type ReasoningLevelResolution = ResolvedReasoningLevel | HeldReasoningLevel;
