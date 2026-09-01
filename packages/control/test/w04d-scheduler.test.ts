// @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides this built-in at runtime.
import assert from 'node:assert/strict';
// @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides this built-in at runtime.
import test from 'node:test';
import type { CorrelationId, TenantId } from '../../contracts/src/ids/types.ts';
import {
  createExecutionBudget,
  initialExecutionBudgetUsage,
  type ExecutionBudget,
  type ExecutionBudgetUsage,
} from '../src/budget/index.ts';
import {
  createGoalGraph,
  type GoalGraph,
  type GoalGraphEdge,
  type GoalGraphNode,
  type GoalGraphStateSnapshot,
} from '../src/goal-graph/index.ts';
import { planSchedulerTick, type SchedulerTickInput } from '../src/scheduler/index.ts';

const tenantId = 'ten_01J00000000000000000000000' as TenantId;
const otherTenantId = 'ten_01J00000000000000000000001' as TenantId;
const correlationId = 'cor_01J00000000000000000000000' as CorrelationId;
const otherCorrelationId = 'cor_01J00000000000000000000001' as CorrelationId;

function node(nodeId: string, joinPolicy: GoalGraphNode['joinPolicy'] = 'ALL_SUCCESS'): GoalGraphNode {
  return {
    nodeId,
    lifecycleRef: { kind: 'TASK', id: `task:${nodeId}` },
    joinPolicy,
  };
}

function graph(nodes: readonly GoalGraphNode[], edges: readonly GoalGraphEdge[] = []): GoalGraph {
  const result = createGoalGraph({
    graphId: 'graph:w04d-test',
    tenantId,
    correlationId,
    nodes,
    edges,
  });
  assert.equal(result.status, 'CREATED');
  return result.graph;
}

function budget(maxConcurrency = 4): ExecutionBudget {
  const result = createExecutionBudget({
    budgetId: 'budget:w04d-test',
    tenantId,
    rootCorrelationId: correlationId,
    scope: 'OBJECTIVE',
    scopeId: 'objective:w04d-test',
    limits: {
      maxLatencyMs: 10_000,
      maxCostMicros: 100_000,
      maxReasoningUnits: 1_000,
      maxToolCalls: 100,
      maxConcurrency,
    },
    exhaustionPolicy: 'HOLD',
    createdAt: '2026-09-01T10:20:00.000Z',
  });
  assert.equal(result.status, 'CREATED');
  return result.budget;
}

function usage(activeConcurrency = 0): ExecutionBudgetUsage {
  return {
    ...initialExecutionBudgetUsage(),
    activeConcurrency,
    peakConcurrency: activeConcurrency,
  };
}

function input(
  goalGraph: GoalGraph,
  states: GoalGraphStateSnapshot,
  overrides: Partial<SchedulerTickInput> = {},
): SchedulerTickInput {
  return {
    tenantId,
    correlationId,
    graph: goalGraph,
    states,
    budget: budget(),
    budgetUsage: usage(),
    policy: { maxConcurrency: 4, maxDispatchPerTick: 4 },
    ...overrides,
  };
}

test('W04-D dispatches only lifecycle-ready nodes whose graph dependencies are ready', () => {
  const goalGraph = graph([node('a'), node('b'), node('c')], [
    { fromNodeId: 'a', toNodeId: 'c' },
    { fromNodeId: 'b', toNodeId: 'c' },
  ]);
  const first = planSchedulerTick(
    input(goalGraph, {
      a: 'SUCCEEDED',
      b: 'READY',
      c: 'READY',
    }),
  );
  assert.equal(first.status, 'PLANNED');
  assert.deepEqual(first.plan.dispatchNodeIds, ['b']);
  assert.deepEqual(first.plan.deferredReadyNodeIds, []);
  assert.equal(first.plan.authorizesExecution, false);

  const joined = planSchedulerTick(
    input(goalGraph, {
      a: 'SUCCEEDED',
      b: 'SUCCEEDED',
      c: 'READY',
    }),
  );
  assert.equal(joined.status, 'PLANNED');
  assert.deepEqual(joined.plan.dispatchNodeIds, ['c']);
});

test('W04-D bounds dispatch by policy, tick fan-out, and current budget concurrency', () => {
  const goalGraph = graph([node('a'), node('b'), node('c'), node('d')]);
  const states = { a: 'READY', b: 'READY', c: 'READY', d: 'READY' } as const;
  const result = planSchedulerTick(
    input(goalGraph, states, {
      budget: budget(2),
      budgetUsage: usage(1),
      policy: { maxConcurrency: 3, maxDispatchPerTick: 2 },
    }),
  );
  assert.equal(result.status, 'PLANNED');
  assert.deepEqual(result.plan.dispatchNodeIds, ['a']);
  assert.deepEqual(result.plan.deferredReadyNodeIds, ['b', 'c', 'd']);
  assert.deepEqual(result.plan.capacity, {
    activeGraphNodes: 0,
    policySlots: 3,
    budgetSlots: 1,
    dispatchSlots: 1,
  });
  assert.equal(result.plan.backpressureReason, 'DISPATCH_LIMIT_REACHED');
});

test('W04-D round-robin cursor provides deterministic fairness without starvation', () => {
  const goalGraph = graph([node('a'), node('b'), node('c')]);
  const states = { a: 'READY', b: 'READY', c: 'READY' } as const;

  const first = planSchedulerTick(
    input(goalGraph, states, { policy: { maxConcurrency: 1, maxDispatchPerTick: 1 } }),
  );
  assert.equal(first.status, 'PLANNED');
  assert.deepEqual(first.plan.dispatchNodeIds, ['a']);

  const second = planSchedulerTick(
    input(goalGraph, states, {
      policy: { maxConcurrency: 1, maxDispatchPerTick: 1 },
      fairness: first.plan.nextFairness,
    }),
  );
  assert.equal(second.status, 'PLANNED');
  assert.deepEqual(second.plan.dispatchNodeIds, ['b']);

  const third = planSchedulerTick(
    input(goalGraph, states, {
      policy: { maxConcurrency: 1, maxDispatchPerTick: 1 },
      fairness: second.plan.nextFairness,
    }),
  );
  assert.equal(third.status, 'PLANNED');
  assert.deepEqual(third.plan.dispatchNodeIds, ['c']);
  assert.equal(third.plan.nextFairness.turn, 3);
});

test('W04-D applies cancellation and backpressure without creating execution authority', () => {
  const goalGraph = graph([node('a'), node('b')]);
  const states = { a: 'READY', b: 'READY' } as const;

  const cancelled = planSchedulerTick(input(goalGraph, states, { cancellationRequested: true }));
  assert.equal(cancelled.status, 'PLANNED');
  assert.deepEqual(cancelled.plan.dispatchNodeIds, []);
  assert.equal(cancelled.plan.backpressureReason, 'CANCELLATION_REQUESTED');
  assert.equal(cancelled.plan.authorizesExecution, false);
  assert.equal(cancelled.plan.durableCoordinationBoundary, 'W03_WHEN_REQUIRED');

  const budgetBlocked = planSchedulerTick(
    input(goalGraph, states, {
      budget: budget(1),
      budgetUsage: usage(1),
      policy: { maxConcurrency: 2, maxDispatchPerTick: 2 },
    }),
  );
  assert.equal(budgetBlocked.status, 'PLANNED');
  assert.deepEqual(budgetBlocked.plan.dispatchNodeIds, []);
  assert.equal(budgetBlocked.plan.backpressureReason, 'BUDGET_CONCURRENCY_EXHAUSTED');
});

test('W04-D surfaces deterministic graph failure and cancellation propagation plans', () => {
  const goalGraph = graph([node('a'), node('b'), node('c')], [
    { fromNodeId: 'a', toNodeId: 'c' },
    { fromNodeId: 'b', toNodeId: 'c' },
  ]);

  const failed = planSchedulerTick(
    input(goalGraph, {
      a: 'FAILED',
      b: 'SUCCEEDED',
      c: 'READY',
    }),
  );
  assert.equal(failed.status, 'PLANNED');
  assert.deepEqual(failed.plan.dispatchNodeIds, []);
  assert.deepEqual(failed.plan.propagations, [
    {
      nodeId: 'c',
      disposition: 'PROPAGATE_FAILURE',
      predecessorNodeIds: ['a', 'b'],
    },
  ]);

  const cancelled = planSchedulerTick(
    input(goalGraph, {
      a: 'CANCELLED',
      b: 'SUCCEEDED',
      c: 'READY',
    }),
  );
  assert.equal(cancelled.status, 'PLANNED');
  assert.deepEqual(cancelled.plan.propagations, [
    {
      nodeId: 'c',
      disposition: 'PROPAGATE_CANCELLATION',
      predecessorNodeIds: ['a', 'b'],
    },
  ]);
});

test('W04-D fails closed on tenant, correlation, policy, fairness, and usage mismatches', () => {
  const goalGraph = graph([node('a')]);
  const states = { a: 'READY' } as const;

  assert.deepEqual(planSchedulerTick(input(goalGraph, states, { tenantId: otherTenantId })), {
    status: 'REJECTED',
    code: 'TENANT_MISMATCH',
  });
  assert.deepEqual(
    planSchedulerTick(input(goalGraph, states, { correlationId: otherCorrelationId })),
    { status: 'REJECTED', code: 'CORRELATION_MISMATCH' },
  );
  assert.deepEqual(
    planSchedulerTick(
      input(goalGraph, states, { policy: { maxConcurrency: 0, maxDispatchPerTick: 1 } }),
    ),
    { status: 'REJECTED', code: 'INVALID_POLICY' },
  );
  assert.deepEqual(
    planSchedulerTick(input(goalGraph, states, { fairness: { nextTopologicalIndex: 2, turn: 0 } })),
    { status: 'REJECTED', code: 'INVALID_FAIRNESS_CURSOR' },
  );
  assert.deepEqual(
    planSchedulerTick(
      input(goalGraph, states, {
        budgetUsage: {
          ...usage(),
          activeConcurrency: -1,
        },
      }),
    ),
    { status: 'REJECTED', code: 'INVALID_BUDGET_USAGE' },
  );
});
