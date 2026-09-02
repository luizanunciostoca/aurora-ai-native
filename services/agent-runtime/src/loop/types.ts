import type { CorrelationContext, TenantContext } from '@aurora/contracts';
import type { WorkerRecordSnapshot } from '../runtime/types.js';

export const ADAPTIVE_LOOP_PHASES = [
  'OBSERVE',
  'PLAN',
  'TOOL_PLAN',
  'WAITING_TOOL_OBSERVATION',
  'INSPECT',
  'REPAIR',
  'VALIDATE',
  'COMPLETED',
  'ABSTAINED',
  'ESCALATED',
  'CANCELLED',
  'BUDGET_EXHAUSTED',
  'FAILED',
] as const;
export type AdaptiveLoopPhase = (typeof ADAPTIVE_LOOP_PHASES)[number];

export type AdaptiveLoopTerminalPhase = Extract<
  AdaptiveLoopPhase,
  'COMPLETED' | 'ABSTAINED' | 'ESCALATED' | 'CANCELLED' | 'BUDGET_EXHAUSTED' | 'FAILED'
>;

export interface BoundedAdaptiveLoopConfig {
  readonly maxIterations: number;
  readonly maxElapsedMs: number;
  readonly maxModelCalls: number;
  readonly maxToolPlanningCalls: number;
  readonly maxRepairAttempts: number;
}

/**
 * Consumer projection of accepted W05-B route evidence. W05-G does not own
 * routing or strategy selection and cannot turn a route into execution authority.
 */
export type W05BRouteProjection =
  | {
      readonly source: 'W05_B_INTELLIGENCE_ROUTE';
      readonly status: 'SELECTED';
      readonly tenant: TenantContext;
      readonly correlation: CorrelationContext;
      readonly family: 'DETERMINISTIC' | 'MODEL' | 'SPECIALIST' | 'COMPUTER_USE_PLANNING' | 'HUMAN';
      readonly strategyId: string;
      readonly strategyVersion: string;
      readonly authorizesExecution: false;
      readonly downstreamExecutionStillRequiresCurrentValidation: true;
    }
  | {
      readonly source: 'W05_B_INTELLIGENCE_ROUTE';
      readonly status: 'ABSTAINED';
      readonly tenant: TenantContext;
      readonly correlation: CorrelationContext;
      readonly authorizesExecution: false;
      readonly downstreamExecutionStillRequiresCurrentValidation: true;
    };

/** Consumer projection of the current W04 target-neutral CapabilityPlan. */
export interface W04CapabilityPlanProjection {
  readonly source: 'W04_CAPABILITY_PLAN';
  readonly tenantId: TenantContext['tenantId'];
  readonly correlationId: CorrelationContext['correlationId'];
  readonly registryVersion: string;
  readonly status: 'READY' | 'BLOCKED';
  readonly selectedCapabilityIds: readonly string[];
  readonly authorizesExecution: false;
}

/** Consumer projection of the current W04 ExecutionBudget assessment. */
export interface W04LoopBudgetProjection {
  readonly source: 'W04_EXECUTION_BUDGET_ASSESSMENT';
  readonly tenantId: TenantContext['tenantId'];
  readonly correlationId: CorrelationContext['correlationId'];
  readonly budgetId: string;
  readonly state: 'WITHIN_BUDGET' | 'DEGRADED' | 'EXHAUSTED';
  readonly action: 'CONTINUE_OPTIONAL' | 'DEGRADE_OPTIONAL' | 'STOP_OPTIONAL' | 'HOLD';
  readonly remaining: {
    readonly latencyMs: number;
    readonly reasoningUnits: number;
    readonly toolCalls: number;
  };
  readonly mandatorySafetyValidationRequired: true;
  readonly canSkipMandatoryValidation: false;
  readonly authorizesExecution: false;
}

export interface AdaptiveLoopControlFrame {
  readonly worker: WorkerRecordSnapshot;
  readonly capabilityPlan: W04CapabilityPlanProjection;
  readonly budget: W04LoopBudgetProjection;
  readonly nowEpochMs: number;
}

export interface PlannedToolAction {
  readonly capabilityId: string;
  readonly actionType: string;
  readonly executionBoundary: 'W07_REQUIRED';
  readonly planReference: string;
}

export interface AdaptiveLoopUsage {
  readonly iterations: number;
  readonly modelCalls: number;
  readonly toolPlanningCalls: number;
  readonly repairAttempts: number;
}

export type AdaptiveLoopTerminalReason =
  | 'VALIDATION_PASSED'
  | 'ROUTE_ABSTAINED'
  | 'ROUTE_NOT_AGENT_SUITABLE'
  | 'CONTROL_FRAME_INVALID'
  | 'WORKER_OWNERSHIP_CHANGED'
  | 'CAPABILITY_PLAN_BLOCKED'
  | 'W04_BUDGET_STOP'
  | 'LOCAL_ITERATION_LIMIT'
  | 'LOCAL_ELAPSED_LIMIT'
  | 'LOCAL_MODEL_CALL_LIMIT'
  | 'LOCAL_TOOL_PLANNING_LIMIT'
  | 'LOCAL_REPAIR_LIMIT'
  | 'W04_REASONING_BUDGET_EXHAUSTED'
  | 'W04_TOOL_BUDGET_EXHAUSTED'
  | 'W04_LATENCY_BUDGET_EXHAUSTED'
  | 'CANCELLED_BY_CONTROL'
  | 'ABSTAINED_BY_STEP'
  | 'ESCALATED_BY_STEP'
  | 'FAILED_BY_STEP'
  | 'UNKNOWN_TOOL_OBSERVATION'
  | 'INVALID_EVENT';

export interface AdaptiveLoopSnapshot {
  readonly loopId: string;
  readonly tenant: TenantContext;
  readonly correlation: CorrelationContext;
  readonly workerTaskId: string;
  readonly workerGeneration: number;
  readonly phase: AdaptiveLoopPhase;
  readonly strategy: {
    readonly family: 'MODEL' | 'SPECIALIST' | 'COMPUTER_USE_PLANNING';
    readonly strategyId: string;
    readonly strategyVersion: string;
  };
  readonly capabilityRegistryVersion: string;
  readonly budgetId: string;
  readonly config: BoundedAdaptiveLoopConfig;
  readonly usage: AdaptiveLoopUsage;
  readonly startedAtEpochMs: number;
  readonly lastTransitionEpochMs: number;
  readonly lastEvidenceReference: string | null;
  readonly plannedActions: readonly PlannedToolAction[];
  readonly terminalReason: AdaptiveLoopTerminalReason | null;
  readonly authoritySemantics: 'ADAPTIVE_LOOP_PLANNING_ONLY_NO_AUTHORITY';
  readonly authorizesExecution: false;
  readonly canInvokeTools: false;
  readonly downstreamExecutionStillRequiresCurrentValidation: true;
}

export interface StartAdaptiveLoopInput {
  readonly loopId: string;
  readonly route: W05BRouteProjection;
  readonly config: BoundedAdaptiveLoopConfig;
  readonly frame: AdaptiveLoopControlFrame;
}

export type AdaptiveLoopEvent =
  | {
      readonly kind: 'OBSERVATION_READY';
      readonly evidenceReference: string;
    }
  | {
      readonly kind: 'PLAN_READY';
      readonly evidenceReference: string;
      readonly usedModel: boolean;
      readonly disposition: 'TOOL_PLAN' | 'VALIDATE' | 'ABSTAIN' | 'ESCALATE' | 'FAIL';
    }
  | {
      readonly kind: 'TOOL_PLAN_READY';
      readonly evidenceReference: string;
      readonly plannedActions: readonly PlannedToolAction[];
      readonly disposition: 'AWAIT_OBSERVATION' | 'VALIDATE' | 'ABSTAIN' | 'ESCALATE' | 'FAIL';
    }
  | {
      readonly kind: 'TOOL_OBSERVATION_READY';
      readonly evidenceReference: string;
      readonly observationStatus: 'OBSERVED' | 'UNKNOWN' | 'FAILED';
    }
  | {
      readonly kind: 'INSPECTION_READY';
      readonly evidenceReference: string;
      readonly usedModel: boolean;
      readonly disposition: 'VALIDATE' | 'REPAIR' | 'ABSTAIN' | 'ESCALATE' | 'FAIL';
    }
  | {
      readonly kind: 'REPAIR_READY';
      readonly evidenceReference: string;
      readonly usedModel: boolean;
      readonly disposition: 'TOOL_PLAN' | 'VALIDATE' | 'ABSTAIN' | 'ESCALATE' | 'FAIL';
    }
  | {
      readonly kind: 'VALIDATION_READY';
      readonly evidenceReference: string;
      readonly outcome: 'PASS' | 'REPAIR' | 'ABSTAIN' | 'ESCALATE' | 'FAIL';
    }
  | {
      readonly kind: 'CANCEL_REQUESTED';
      readonly evidenceReference: string;
    };

export type StartAdaptiveLoopResult =
  | {
      readonly status: 'STARTED';
      readonly snapshot: AdaptiveLoopSnapshot;
    }
  | {
      readonly status: 'REJECTED';
      readonly code:
        | 'INVALID_CONFIG'
        | 'INVALID_CONTROL_FRAME'
        | 'ROUTE_NOT_SELECTED'
        | 'ROUTE_NOT_AGENT_SUITABLE'
        | 'CAPABILITY_PLAN_BLOCKED'
        | 'BUDGET_NOT_AVAILABLE';
    };

export interface AdvanceAdaptiveLoopResult {
  readonly status: 'ADVANCED' | 'TERMINATED' | 'REJECTED';
  readonly code:
    | 'ADVANCED'
    | 'TERMINATED'
    | 'ALREADY_TERMINAL'
    | 'INVALID_CONTROL_FRAME'
    | 'INVALID_EVENT';
  readonly snapshot: AdaptiveLoopSnapshot;
}
