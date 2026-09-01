// @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides this built-in at runtime.
import assert from 'node:assert/strict';
// @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides this built-in at runtime.
import test from 'node:test';
import type { CorrelationId, TenantId } from '../../contracts/src/ids/types.ts';
import {
  assessGoalGraphDependencies,
  createGoalGraph,
  type CreateGoalGraphInput,
  type GoalGraphNode,
} from '../src/goal-graph/index.ts';

const tenantId = 'ten_01J00000000000000000000000' as TenantId;
const correlationId = 'cor_01J00000000000000000000000' as CorrelationId;

function node(nodeId: string, joinPolicy: GoalGraphNode['joinPolicy'] = 'ALL_SUCCESS'): GoalGraphNode {
  return {
    nodeId,
    lifecycleRef: { kind: 'TASK', id: `task:${nodeId}` },
    joinPolicy,
  };
}

function create(overrides: Partial<CreateGoalGraphInput> = {}) {
  return createGoalGraph({
    graphId: 'goal-graph:release',
    tenantId,
    correlationId,
    nodes: [node('a'), node('b'), node('join')],
    edges: [
      { fromNodeId: 'a', toNodeId: 'join' },
      { fromNodeId: 'b', toNodeId: 'join' },
    ],
    ...overrides,
  });
}

test('W04-C creates a deterministic bounded DAG and stable topological order', () => {
  const result = create({
    nodes: [node('join'), node('b'), node('a')],
    edges: [
      { fromNodeId: 'b', toNodeId: 'join' },
      { fromNodeId: 'a', toNodeId: 'join' },
    ],
  });
  assert.equal(result.status, 'CREATED');
  if (result.status !== 'CREATED') return;
  assert.deepEqual(result.graph.nodes.map((entry) => entry.nodeId), ['a', 'b', 'join']);
  assert.deepEqual(result.graph.topologicalOrder, ['a', 'b', 'join']);
  assert.equal(result.graph.authorizesExecution, false);
});

test('W04-C rejects cycles, duplicate edges and unknown endpoints fail closed', () => {
  const cycle = create({
    nodes: [node('a'), node('b')],
    edges: [
      { fromNodeId: 'a', toNodeId: 'b' },
      { fromNodeId: 'b', toNodeId: 'a' },
    ],
  });
  assert.deepEqual(cycle.status === 'REJECTED' ? cycle.code : null, 'CYCLE_DETECTED');

  const duplicate = create({
    edges: [
      { fromNodeId: 'a', toNodeId: 'join' },
      { fromNodeId: 'a', toNodeId: 'join' },
    ],
  });
  assert.deepEqual(duplicate.status === 'REJECTED' ? duplicate.code : null, 'DUPLICATE_EDGE');

  const unknown = create({ edges: [{ fromNodeId: 'missing', toNodeId: 'join' }] });
  assert.deepEqual(unknown.status === 'REJECTED' ? unknown.code : null, 'UNKNOWN_EDGE_NODE');
});

test('W04-C ALL_SUCCESS join propagates failure and cancellation deterministically', () => {
  const result = create();
  assert.equal(result.status, 'CREATED');
  if (result.status !== 'CREATED') return;

  const waiting = assessGoalGraphDependencies(result.graph, 'join', { a: 'SUCCEEDED', b: 'ACTIVE' });
  assert.equal(waiting.disposition, 'WAITING');

  const failed = assessGoalGraphDependencies(result.graph, 'join', { a: 'SUCCEEDED', b: 'FAILED' });
  assert.equal(failed.disposition, 'PROPAGATE_FAILURE');
  assert.equal(failed.authorizesExecution, false);

  const cancelled = assessGoalGraphDependencies(result.graph, 'join', {
    a: 'SUCCEEDED',
    b: 'CANCELLED',
  });
  assert.equal(cancelled.disposition, 'PROPAGATE_CANCELLATION');

  const ready = assessGoalGraphDependencies(result.graph, 'join', {
    a: 'SUCCEEDED',
    b: 'SUCCEEDED',
  });
  assert.equal(ready.disposition, 'READY');
});

test('W04-C supports explicit ALL_TERMINAL and ANY_SUCCESS fan-in semantics', () => {
  const allTerminal = create({
    nodes: [node('a'), node('b'), node('join', 'ALL_TERMINAL')],
  });
  assert.equal(allTerminal.status, 'CREATED');
  if (allTerminal.status !== 'CREATED') return;
  assert.equal(
    assessGoalGraphDependencies(allTerminal.graph, 'join', { a: 'FAILED', b: 'CANCELLED' }).disposition,
    'READY',
  );

  const anySuccess = create({
    nodes: [node('a'), node('b'), node('join', 'ANY_SUCCESS')],
  });
  assert.equal(anySuccess.status, 'CREATED');
  if (anySuccess.status !== 'CREATED') return;
  assert.equal(
    assessGoalGraphDependencies(anySuccess.graph, 'join', { a: 'FAILED', b: 'SUCCEEDED' }).disposition,
    'READY',
  );
  assert.equal(
    assessGoalGraphDependencies(anySuccess.graph, 'join', { a: 'FAILED', b: 'CANCELLED' }).disposition,
    'PROPAGATE_FAILURE',
  );
});

test('W04-C terminal nodes never become dependency-ready again', () => {
  const result = create();
  assert.equal(result.status, 'CREATED');
  if (result.status !== 'CREATED') return;
  const terminal = assessGoalGraphDependencies(result.graph, 'join', {
    join: 'SUPERSEDED',
    a: 'SUCCEEDED',
    b: 'SUCCEEDED',
  });
  assert.equal(terminal.disposition, 'TERMINAL');
  assert.equal(terminal.reason, 'NODE_ALREADY_TERMINAL');
});
