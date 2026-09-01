import type { CorrelationId, TenantId } from '../../../contracts/src/ids/types.ts';
import type { ExecutionBudget, ExecutionBudgetUsage } from '../budget/types.ts';
import type { GoalGraph, GoalGraphStateSnapshot } from '../goal-graph/types.ts';

export interface SchedulerPolicy {
  readonly maxConcurrency: number;
  readonly maxDispatchPerTick: number;
}

export interface SchedulerFairnessCursor {
  readonly nextTopologicalIndex: number;
  readonly turn: number;
}

export interface SchedulerTickInput {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly graph: GoalGraph;
  readonly states: GoalGraphStateSnapshot;
  readonly budget: ExecutionBudget;
  readonly budgetUsage: ExecutionBudgetUsage;
  readonly policy: SchedulerPolicy;
  readonly fairness?: SchedulerFairnessCursor;
  readonly cancellationRequested?: boolean;
}

export interface SchedulerCapacity {
  readonly activeGraphNodes: number;
  readonly policySlots: number;
  readonly budgetSlots: number;
  readonly dispatchSlots: number;
}

export interface SchedulerPropagation {
  readonly nodeId: string;
  readonly disposition: 'PROPAGATE_FAILURE' | 'PROPAGATE_CANCELLATION';
  readonly predecessorNodeIds: readonly string[];
}

export type SchedulerBackpressureReason =
  | 'NONE'
  | 'CANCELLATION_REQUESTED'
  | 'NO_DEPENDENCY_READY_NODES'
  | 'POLICY_CONCURRENCY_EXHAUSTED'
  | 'BUDGET_CONCURRENCY_EXHAUSTED'
  | 'DISPATCH_LIMIT_REACHED';

export interface SchedulerPlan {
  readonly planKind: 'AURORA_BOUNDED_SCHEDULER_PLAN';
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly graphId: string;
  readonly dispatchNodeIds: readonly string[];
  readonly deferredReadyNodeIds: readonly string[];
  readonly propagations: readonly SchedulerPropagation[];
  readonly capacity: SchedulerCapacity;
  readonly backpressureReason: SchedulerBackpressureReason;
  readonly nextFairness: SchedulerFairnessCursor;
  readonly durableCoordinationBoundary: 'W03_WHEN_REQUIRED';
  readonly authorizesExecution: false;
}

export const SCHEDULER_REJECTION_CODES = [
  'TENANT_MISMATCH',
  'CORRELATION_MISMATCH',
  'BUDGET_TENANT_MISMATCH',
  'BUDGET_CORRELATION_MISMATCH',
  'INVALID_POLICY',
  'INVALID_FAIRNESS_CURSOR',
  'INVALID_BUDGET_USAGE',
] as const;
export type SchedulerRejectionCode = (typeof SCHEDULER_REJECTION_CODES)[number];

export type SchedulerTickResult =
  | { readonly status: 'PLANNED'; readonly plan: SchedulerPlan }
  | { readonly status: 'REJECTED'; readonly code: SchedulerRejectionCode };
