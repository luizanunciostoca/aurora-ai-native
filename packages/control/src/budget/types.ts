import type { CorrelationId, TenantId } from '../../../contracts/src/ids/types.ts';

export const EXECUTION_BUDGET_DIMENSIONS = [
  'LATENCY_MS',
  'COST_MICROS',
  'REASONING_UNITS',
  'TOOL_CALLS',
  'CONCURRENCY',
] as const;

export type ExecutionBudgetDimension = (typeof EXECUTION_BUDGET_DIMENSIONS)[number];
export type ExecutionBudgetScope = 'OBJECTIVE' | 'GOAL' | 'TASK';
export type ExecutionBudgetExhaustionPolicy = 'DEGRADE_OPTIONAL' | 'STOP_OPTIONAL' | 'HOLD';
export type ExecutionBudgetState = 'WITHIN_BUDGET' | 'DEGRADED' | 'EXHAUSTED';
export type ExecutionBudgetAction =
  'CONTINUE_OPTIONAL' | 'DEGRADE_OPTIONAL' | 'STOP_OPTIONAL' | 'HOLD';

export interface ExecutionBudgetLimits {
  readonly maxLatencyMs: number;
  readonly maxCostMicros: number;
  readonly maxReasoningUnits: number;
  readonly maxToolCalls: number;
  readonly maxConcurrency: number;
}

export interface ExecutionBudgetUsage {
  readonly elapsedLatencyMs: number;
  readonly costMicros: number;
  readonly reasoningUnits: number;
  readonly toolCalls: number;
  readonly activeConcurrency: number;
  readonly peakConcurrency: number;
}

export interface ExecutionBudgetUsageDelta {
  readonly elapsedLatencyMs?: number;
  readonly costMicros?: number;
  readonly reasoningUnits?: number;
  readonly toolCalls?: number;
  readonly activeConcurrency?: number;
}

export interface ExecutionBudget {
  readonly budgetKind: 'AURORA_EXECUTION_BUDGET';
  readonly budgetVersion: '1.0.0';
  readonly budgetId: string;
  readonly tenantId: TenantId;
  readonly rootCorrelationId: CorrelationId;
  readonly scope: ExecutionBudgetScope;
  readonly scopeId: string;
  readonly limits: ExecutionBudgetLimits;
  readonly exhaustionPolicy: ExecutionBudgetExhaustionPolicy;
  readonly createdAt: string;
  readonly safetyValidationInvariant: 'MANDATORY_NOT_SKIPPABLE';
}

export interface CreateExecutionBudgetInput {
  readonly budgetId: string;
  readonly tenantId: TenantId;
  readonly rootCorrelationId: CorrelationId;
  readonly scope: ExecutionBudgetScope;
  readonly scopeId: string;
  readonly limits: ExecutionBudgetLimits;
  readonly exhaustionPolicy: ExecutionBudgetExhaustionPolicy;
  readonly createdAt: string;
}

export interface ExecutionBudgetRemaining {
  readonly latencyMs: number;
  readonly costMicros: number;
  readonly reasoningUnits: number;
  readonly toolCalls: number;
  readonly concurrencySlots: number;
}

export interface ExecutionBudgetUtilization {
  readonly latency: number;
  readonly cost: number;
  readonly reasoning: number;
  readonly toolCalls: number;
  readonly concurrency: number;
}

export interface ExecutionBudgetAssessment {
  readonly budgetId: string;
  readonly state: ExecutionBudgetState;
  readonly action: ExecutionBudgetAction;
  readonly exhaustedDimensions: readonly ExecutionBudgetDimension[];
  readonly remaining: ExecutionBudgetRemaining;
  readonly utilization: ExecutionBudgetUtilization;
  readonly mandatorySafetyValidationRequired: true;
  readonly canSkipMandatoryValidation: false;
  readonly authorizesExecution: false;
}

export interface ExecutionBudgetTelemetrySnapshot extends ExecutionBudgetAssessment {
  readonly budgetVersion: '1.0.0';
  readonly tenantId: TenantId;
  readonly rootCorrelationId: CorrelationId;
  readonly scope: ExecutionBudgetScope;
  readonly scopeId: string;
  readonly limits: ExecutionBudgetLimits;
  readonly usage: ExecutionBudgetUsage;
  readonly exhaustionPolicy: ExecutionBudgetExhaustionPolicy;
}

export interface ChildBudgetRequest {
  readonly budgetId: string;
  readonly scope: Exclude<ExecutionBudgetScope, 'OBJECTIVE'>;
  readonly scopeId: string;
  readonly limits: ExecutionBudgetLimits;
  readonly exhaustionPolicy?: ExecutionBudgetExhaustionPolicy;
  readonly createdAt: string;
}

export type ExecutionBudgetCreateResult =
  | { readonly status: 'CREATED'; readonly budget: ExecutionBudget }
  | {
      readonly status: 'REJECTED';
      readonly code: 'INVALID_IDENTITY' | 'INVALID_TIMESTAMP' | 'INVALID_LIMITS';
    };

export type ChildBudgetDerivationResult =
  | { readonly status: 'DERIVED'; readonly budget: ExecutionBudget }
  | {
      readonly status: 'REJECTED';
      readonly code: 'INVALID_REQUEST' | 'PARENT_BUDGET_INSUFFICIENT';
      readonly constrainedDimensions: readonly ExecutionBudgetDimension[];
    };

export type BudgetProjectionResult =
  | {
      readonly status: 'FITS';
      readonly projectedUsage: ExecutionBudgetUsage;
      readonly assessment: ExecutionBudgetAssessment;
    }
  | {
      readonly status: 'CONSTRAINED';
      readonly action: Exclude<ExecutionBudgetAction, 'CONTINUE_OPTIONAL'>;
      readonly projectedUsage: ExecutionBudgetUsage;
      readonly constrainedDimensions: readonly ExecutionBudgetDimension[];
      readonly mandatorySafetyValidationRequired: true;
      readonly canSkipMandatoryValidation: false;
      readonly authorizesExecution: false;
    }
  | {
      readonly status: 'REJECTED';
      readonly code: 'INVALID_USAGE' | 'INVALID_DELTA';
    };

export type BudgetUsageRecordResult =
  | {
      readonly status: 'RECORDED';
      readonly usage: ExecutionBudgetUsage;
      readonly assessment: ExecutionBudgetAssessment;
    }
  | {
      readonly status: 'REJECTED';
      readonly code: 'INVALID_USAGE' | 'INVALID_DELTA';
    };
