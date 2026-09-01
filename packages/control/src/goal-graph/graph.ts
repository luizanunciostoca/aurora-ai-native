import type { LifecycleState } from '../lifecycle/types.ts';
import type {
  CreateGoalGraphInput,
  CreateGoalGraphResult,
  GoalGraph,
  GoalGraphDependencyAssessment,
  GoalGraphEdge,
  GoalGraphNode,
  GoalGraphStateSnapshot,
} from './types.ts';

export const GOAL_GRAPH_LIMITS = {
  maxNodes: 256,
  maxEdges: 2048,
  maxFanIn: 64,
  maxFanOut: 64,
} as const;

const TERMINAL_STATES = new Set<LifecycleState>([
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'SUPERSEDED',
]);

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function lifecycleKey(node: GoalGraphNode): string {
  return `${node.lifecycleRef.kind}:${node.lifecycleRef.id}`;
}

function edgeKey(edge: GoalGraphEdge): string {
  return `${edge.fromNodeId}\u0000${edge.toNodeId}`;
}

function sortedNodeIds(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function buildAdjacency(nodes: readonly GoalGraphNode[], edges: readonly GoalGraphEdge[]) {
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const node of nodes) {
    incoming.set(node.nodeId, []);
    outgoing.set(node.nodeId, []);
  }
  for (const edge of edges) {
    incoming.get(edge.toNodeId)?.push(edge.fromNodeId);
    outgoing.get(edge.fromNodeId)?.push(edge.toNodeId);
  }
  for (const values of incoming.values()) values.sort((a, b) => a.localeCompare(b));
  for (const values of outgoing.values()) values.sort((a, b) => a.localeCompare(b));
  return { incoming, outgoing };
}

function deterministicTopologicalOrder(
  nodes: readonly GoalGraphNode[],
  edges: readonly GoalGraphEdge[],
): readonly string[] | undefined {
  const { incoming, outgoing } = buildAdjacency(nodes, edges);
  const indegree = new Map<string, number>();
  for (const node of nodes) indegree.set(node.nodeId, incoming.get(node.nodeId)?.length ?? 0);

  const ready = sortedNodeIds(
    nodes.filter((node) => (indegree.get(node.nodeId) ?? 0) === 0).map((node) => node.nodeId),
  );
  const order: string[] = [];

  while (ready.length > 0) {
    const nodeId = ready.shift();
    if (nodeId === undefined) break;
    order.push(nodeId);
    for (const successor of outgoing.get(nodeId) ?? []) {
      const next = (indegree.get(successor) ?? 0) - 1;
      indegree.set(successor, next);
      if (next === 0) {
        ready.push(successor);
        ready.sort((a, b) => a.localeCompare(b));
      }
    }
  }

  return order.length === nodes.length ? order : undefined;
}

export function createGoalGraph(input: CreateGoalGraphInput): CreateGoalGraphResult {
  if (!nonEmpty(input.graphId)) return { status: 'REJECTED', code: 'INVALID_GRAPH_ID' };
  if (input.nodes.length > GOAL_GRAPH_LIMITS.maxNodes) {
    return { status: 'REJECTED', code: 'NODE_LIMIT_EXCEEDED' };
  }
  if (input.edges.length > GOAL_GRAPH_LIMITS.maxEdges) {
    return { status: 'REJECTED', code: 'EDGE_LIMIT_EXCEEDED' };
  }

  const nodesById = new Map<string, GoalGraphNode>();
  const lifecycleRefs = new Set<string>();
  for (const node of input.nodes) {
    if (!nonEmpty(node.nodeId) || !nonEmpty(node.lifecycleRef.id)) {
      return { status: 'REJECTED', code: 'INVALID_NODE_ID', nodeId: node.nodeId };
    }
    if (nodesById.has(node.nodeId)) {
      return { status: 'REJECTED', code: 'DUPLICATE_NODE_ID', nodeId: node.nodeId };
    }
    const refKey = lifecycleKey(node);
    if (lifecycleRefs.has(refKey)) {
      return { status: 'REJECTED', code: 'DUPLICATE_LIFECYCLE_REF', nodeId: node.nodeId };
    }
    nodesById.set(node.nodeId, node);
    lifecycleRefs.add(refKey);
  }

  const edgeKeys = new Set<string>();
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  for (const edge of input.edges) {
    if (!nodesById.has(edge.fromNodeId) || !nodesById.has(edge.toNodeId)) {
      return { status: 'REJECTED', code: 'UNKNOWN_EDGE_NODE', edge };
    }
    if (edge.fromNodeId === edge.toNodeId) {
      return { status: 'REJECTED', code: 'SELF_EDGE', edge };
    }
    const key = edgeKey(edge);
    if (edgeKeys.has(key)) return { status: 'REJECTED', code: 'DUPLICATE_EDGE', edge };
    edgeKeys.add(key);

    const nextFanIn = (fanIn.get(edge.toNodeId) ?? 0) + 1;
    const nextFanOut = (fanOut.get(edge.fromNodeId) ?? 0) + 1;
    if (nextFanIn > GOAL_GRAPH_LIMITS.maxFanIn) {
      return { status: 'REJECTED', code: 'FAN_IN_LIMIT_EXCEEDED', nodeId: edge.toNodeId };
    }
    if (nextFanOut > GOAL_GRAPH_LIMITS.maxFanOut) {
      return { status: 'REJECTED', code: 'FAN_OUT_LIMIT_EXCEEDED', nodeId: edge.fromNodeId };
    }
    fanIn.set(edge.toNodeId, nextFanIn);
    fanOut.set(edge.fromNodeId, nextFanOut);
  }

  const nodes = [...input.nodes].sort((left, right) => left.nodeId.localeCompare(right.nodeId));
  const edges = [...input.edges].sort((left, right) => edgeKey(left).localeCompare(edgeKey(right)));
  const topologicalOrder = deterministicTopologicalOrder(nodes, edges);
  if (topologicalOrder === undefined) return { status: 'REJECTED', code: 'CYCLE_DETECTED' };

  const graph: GoalGraph = {
    graphKind: 'AURORA_GOAL_GRAPH',
    graphId: input.graphId,
    tenantId: input.tenantId,
    correlationId: input.correlationId,
    nodes,
    edges,
    topologicalOrder,
    authorizesExecution: false,
  };
  return { status: 'CREATED', graph };
}

export function predecessorNodeIds(graph: GoalGraph, nodeId: string): readonly string[] {
  return graph.edges
    .filter((edge) => edge.toNodeId === nodeId)
    .map((edge) => edge.fromNodeId)
    .sort((left, right) => left.localeCompare(right));
}

export function assessGoalGraphDependencies(
  graph: GoalGraph,
  nodeId: string,
  states: GoalGraphStateSnapshot,
): GoalGraphDependencyAssessment {
  const node = graph.nodes.find((candidate) => candidate.nodeId === nodeId);
  if (node === undefined) throw new Error(`Unknown goal graph node: ${nodeId}`);

  const ownState = states[nodeId];
  const predecessors = predecessorNodeIds(graph, nodeId);
  if (ownState !== undefined && TERMINAL_STATES.has(ownState)) {
    return {
      nodeId,
      disposition: 'TERMINAL',
      reason: 'NODE_ALREADY_TERMINAL',
      predecessorNodeIds: predecessors,
      authorizesExecution: false,
    };
  }
  if (predecessors.length === 0) {
    return {
      nodeId,
      disposition: 'READY',
      reason: 'ROOT_NODE',
      predecessorNodeIds: predecessors,
      authorizesExecution: false,
    };
  }

  const predecessorStates = predecessors.map((predecessor) => states[predecessor]);
  const hasFailed = predecessorStates.includes('FAILED');
  const hasCancelled = predecessorStates.some(
    (state) => state === 'CANCELLED' || state === 'SUPERSEDED',
  );
  const allTerminal = predecessorStates.every(
    (state) => state !== undefined && TERMINAL_STATES.has(state),
  );
  const allSucceeded = predecessorStates.every((state) => state === 'SUCCEEDED');
  const anySucceeded = predecessorStates.includes('SUCCEEDED');

  if (node.joinPolicy === 'ALL_TERMINAL') {
    return {
      nodeId,
      disposition: allTerminal ? 'READY' : 'WAITING',
      reason: allTerminal ? 'DEPENDENCIES_TERMINAL' : 'DEPENDENCIES_PENDING',
      predecessorNodeIds: predecessors,
      authorizesExecution: false,
    };
  }

  if (node.joinPolicy === 'ANY_SUCCESS') {
    if (anySucceeded) {
      return {
        nodeId,
        disposition: 'READY',
        reason: 'ANY_DEPENDENCY_SUCCEEDED',
        predecessorNodeIds: predecessors,
        authorizesExecution: false,
      };
    }
    if (!allTerminal) {
      return {
        nodeId,
        disposition: 'WAITING',
        reason: 'DEPENDENCIES_PENDING',
        predecessorNodeIds: predecessors,
        authorizesExecution: false,
      };
    }
    return {
      nodeId,
      disposition: hasFailed ? 'PROPAGATE_FAILURE' : 'PROPAGATE_CANCELLATION',
      reason: hasFailed ? 'DEPENDENCY_FAILED' : 'DEPENDENCY_CANCELLED_OR_SUPERSEDED',
      predecessorNodeIds: predecessors,
      authorizesExecution: false,
    };
  }

  if (allSucceeded) {
    return {
      nodeId,
      disposition: 'READY',
      reason: 'DEPENDENCIES_SUCCEEDED',
      predecessorNodeIds: predecessors,
      authorizesExecution: false,
    };
  }
  if (hasFailed) {
    return {
      nodeId,
      disposition: 'PROPAGATE_FAILURE',
      reason: 'DEPENDENCY_FAILED',
      predecessorNodeIds: predecessors,
      authorizesExecution: false,
    };
  }
  if (hasCancelled) {
    return {
      nodeId,
      disposition: 'PROPAGATE_CANCELLATION',
      reason: 'DEPENDENCY_CANCELLED_OR_SUPERSEDED',
      predecessorNodeIds: predecessors,
      authorizesExecution: false,
    };
  }
  return {
    nodeId,
    disposition: 'WAITING',
    reason: 'DEPENDENCIES_PENDING',
    predecessorNodeIds: predecessors,
    authorizesExecution: false,
  };
}
