import type { CorrelationId, TenantId } from '../../../contracts/src/ids/types.ts';
import type { LifecycleEntityRef, LifecycleState } from '../lifecycle/types.ts';

export const GOAL_GRAPH_JOIN_POLICIES = ['ALL_SUCCESS', 'ALL_TERMINAL', 'ANY_SUCCESS'] as const;
export type GoalGraphJoinPolicy = (typeof GOAL_GRAPH_JOIN_POLICIES)[number];

export interface GoalGraphNode {
  readonly nodeId: string;
  readonly lifecycleRef: LifecycleEntityRef;
  readonly joinPolicy: GoalGraphJoinPolicy;
}

export interface GoalGraphEdge {
  readonly fromNodeId: string;
  readonly toNodeId: string;
}

export interface GoalGraph {
  readonly graphKind: 'AURORA_GOAL_GRAPH';
  readonly graphId: string;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly nodes: readonly GoalGraphNode[];
  readonly edges: readonly GoalGraphEdge[];
  readonly topologicalOrder: readonly string[];
  readonly authorizesExecution: false;
}

export interface CreateGoalGraphInput {
  readonly graphId: string;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly nodes: readonly GoalGraphNode[];
  readonly edges: readonly GoalGraphEdge[];
}

export const GOAL_GRAPH_REJECTION_CODES = [
  'INVALID_GRAPH_ID',
  'INVALID_NODE_ID',
  'DUPLICATE_NODE_ID',
  'DUPLICATE_LIFECYCLE_REF',
  'UNKNOWN_EDGE_NODE',
  'SELF_EDGE',
  'DUPLICATE_EDGE',
  'CYCLE_DETECTED',
  'NODE_LIMIT_EXCEEDED',
  'EDGE_LIMIT_EXCEEDED',
  'FAN_IN_LIMIT_EXCEEDED',
  'FAN_OUT_LIMIT_EXCEEDED',
] as const;
export type GoalGraphRejectionCode = (typeof GOAL_GRAPH_REJECTION_CODES)[number];

export type CreateGoalGraphResult =
  | { readonly status: 'CREATED'; readonly graph: GoalGraph }
  | {
      readonly status: 'REJECTED';
      readonly code: GoalGraphRejectionCode;
      readonly nodeId?: string;
      readonly edge?: GoalGraphEdge;
    };

export type GoalGraphDependencyDisposition =
  | 'READY'
  | 'WAITING'
  | 'PROPAGATE_FAILURE'
  | 'PROPAGATE_CANCELLATION'
  | 'TERMINAL';

export interface GoalGraphDependencyAssessment {
  readonly nodeId: string;
  readonly disposition: GoalGraphDependencyDisposition;
  readonly reason:
    | 'ROOT_NODE'
    | 'DEPENDENCIES_SUCCEEDED'
    | 'DEPENDENCIES_TERMINAL'
    | 'ANY_DEPENDENCY_SUCCEEDED'
    | 'DEPENDENCIES_PENDING'
    | 'DEPENDENCY_FAILED'
    | 'DEPENDENCY_CANCELLED_OR_SUPERSEDED'
    | 'NODE_ALREADY_TERMINAL';
  readonly predecessorNodeIds: readonly string[];
  readonly authorizesExecution: false;
}

export type GoalGraphStateSnapshot = Readonly<Record<string, LifecycleState | undefined>>;
