import { isValidExecutionBudgetUsage } from '../budget/budget.ts';
import { assessGoalGraphDependencies } from '../goal-graph/graph.ts';
import type { GoalGraph } from '../goal-graph/types.ts';
import type {
  SchedulerBackpressureReason,
  SchedulerCapacity,
  SchedulerFairnessCursor,
  SchedulerPlan,
  SchedulerPolicy,
  SchedulerPropagation,
  SchedulerTickInput,
  SchedulerTickResult,
} from './types.ts';

const MAX_SCHEDULER_CONCURRENCY = 256;

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function validPolicy(policy: SchedulerPolicy): boolean {
  return (
    isPositiveSafeInteger(policy.maxConcurrency) &&
    policy.maxConcurrency <= MAX_SCHEDULER_CONCURRENCY &&
    isPositiveSafeInteger(policy.maxDispatchPerTick) &&
    policy.maxDispatchPerTick <= policy.maxConcurrency
  );
}

function initialFairness(): SchedulerFairnessCursor {
  return { nextTopologicalIndex: 0, turn: 0 };
}

function validFairness(fairness: SchedulerFairnessCursor, graph: GoalGraph): boolean {
  const indexValid =
    graph.topologicalOrder.length === 0
      ? fairness.nextTopologicalIndex === 0
      : fairness.nextTopologicalIndex >= 0 &&
        fairness.nextTopologicalIndex < graph.topologicalOrder.length;
  return indexValid && Number.isSafeInteger(fairness.turn) && fairness.turn >= 0;
}

function rotateTopologicalOrder(graph: GoalGraph, startIndex: number): readonly string[] {
  if (graph.topologicalOrder.length === 0) return [];
  return [
    ...graph.topologicalOrder.slice(startIndex),
    ...graph.topologicalOrder.slice(0, startIndex),
  ];
}

function countActiveGraphNodes(input: SchedulerTickInput): number {
  return input.graph.nodes.reduce(
    (count, node) => count + (input.states[node.nodeId] === 'ACTIVE' ? 1 : 0),
    0,
  );
}

function calculateCapacity(input: SchedulerTickInput): SchedulerCapacity {
  const activeGraphNodes = countActiveGraphNodes(input);
  const policySlots = Math.max(0, input.policy.maxConcurrency - activeGraphNodes);
  const budgetSlots = Math.max(
    0,
    input.budget.limits.maxConcurrency - input.budgetUsage.activeConcurrency,
  );
  return {
    activeGraphNodes,
    policySlots,
    budgetSlots,
    dispatchSlots: Math.min(policySlots, budgetSlots, input.policy.maxDispatchPerTick),
  };
}

function dependencyReadyNodeIds(input: SchedulerTickInput): readonly string[] {
  const ready = new Set<string>();
  for (const node of input.graph.nodes) {
    if (input.states[node.nodeId] !== 'READY') continue;
    const assessment = assessGoalGraphDependencies(input.graph, node.nodeId, input.states);
    if (assessment.disposition === 'READY') ready.add(node.nodeId);
  }
  return [...ready];
}

function propagationPlans(input: SchedulerTickInput): readonly SchedulerPropagation[] {
  const propagations: SchedulerPropagation[] = [];
  for (const node of input.graph.nodes) {
    const assessment = assessGoalGraphDependencies(input.graph, node.nodeId, input.states);
    if (
      assessment.disposition !== 'PROPAGATE_FAILURE' &&
      assessment.disposition !== 'PROPAGATE_CANCELLATION'
    ) {
      continue;
    }
    propagations.push({
      nodeId: node.nodeId,
      disposition: assessment.disposition,
      predecessorNodeIds: assessment.predecessorNodeIds,
    });
  }
  return propagations.sort((left, right) => left.nodeId.localeCompare(right.nodeId));
}

function nextFairnessCursor(
  graph: GoalGraph,
  current: SchedulerFairnessCursor,
  dispatched: readonly string[],
): SchedulerFairnessCursor {
  const nextTurn = current.turn + 1;
  if (graph.topologicalOrder.length === 0 || dispatched.length === 0) {
    return { nextTopologicalIndex: current.nextTopologicalIndex, turn: nextTurn };
  }
  const lastNodeId = dispatched[dispatched.length - 1];
  const lastIndex = graph.topologicalOrder.indexOf(lastNodeId);
  return {
    nextTopologicalIndex: (lastIndex + 1) % graph.topologicalOrder.length,
    turn: nextTurn,
  };
}

function backpressureReason(
  input: SchedulerTickInput,
  capacity: SchedulerCapacity,
  readyCount: number,
  dispatchCount: number,
): SchedulerBackpressureReason {
  if (input.cancellationRequested === true) return 'CANCELLATION_REQUESTED';
  if (readyCount === 0) return 'NO_DEPENDENCY_READY_NODES';
  if (capacity.policySlots === 0) return 'POLICY_CONCURRENCY_EXHAUSTED';
  if (capacity.budgetSlots === 0) return 'BUDGET_CONCURRENCY_EXHAUSTED';
  if (dispatchCount < readyCount) return 'DISPATCH_LIMIT_REACHED';
  return 'NONE';
}

export function planSchedulerTick(input: SchedulerTickInput): SchedulerTickResult {
  if (input.graph.tenantId !== input.tenantId) {
    return { status: 'REJECTED', code: 'TENANT_MISMATCH' };
  }
  if (input.graph.correlationId !== input.correlationId) {
    return { status: 'REJECTED', code: 'CORRELATION_MISMATCH' };
  }
  if (input.budget.tenantId !== input.tenantId) {
    return { status: 'REJECTED', code: 'BUDGET_TENANT_MISMATCH' };
  }
  if (input.budget.rootCorrelationId !== input.correlationId) {
    return { status: 'REJECTED', code: 'BUDGET_CORRELATION_MISMATCH' };
  }
  if (!validPolicy(input.policy)) {
    return { status: 'REJECTED', code: 'INVALID_POLICY' };
  }
  if (!isValidExecutionBudgetUsage(input.budgetUsage)) {
    return { status: 'REJECTED', code: 'INVALID_BUDGET_USAGE' };
  }

  const fairness = input.fairness ?? initialFairness();
  if (!validFairness(fairness, input.graph)) {
    return { status: 'REJECTED', code: 'INVALID_FAIRNESS_CURSOR' };
  }

  const capacity = calculateCapacity(input);
  const readySet = new Set(dependencyReadyNodeIds(input));
  const fairOrder = rotateTopologicalOrder(input.graph, fairness.nextTopologicalIndex).filter(
    (nodeId) => readySet.has(nodeId),
  );
  const dispatchNodeIds =
    input.cancellationRequested === true ? [] : fairOrder.slice(0, capacity.dispatchSlots);
  const dispatched = new Set(dispatchNodeIds);
  const deferredReadyNodeIds = fairOrder.filter((nodeId) => !dispatched.has(nodeId));
  const propagations = propagationPlans(input);

  const plan: SchedulerPlan = {
    planKind: 'AURORA_BOUNDED_SCHEDULER_PLAN',
    tenantId: input.tenantId,
    correlationId: input.correlationId,
    graphId: input.graph.graphId,
    dispatchNodeIds,
    deferredReadyNodeIds,
    propagations,
    capacity,
    backpressureReason: backpressureReason(
      input,
      capacity,
      fairOrder.length,
      dispatchNodeIds.length,
    ),
    nextFairness: nextFairnessCursor(input.graph, fairness, dispatchNodeIds),
    durableCoordinationBoundary: 'W03_WHEN_REQUIRED',
    authorizesExecution: false,
  };
  return { status: 'PLANNED', plan };
}
