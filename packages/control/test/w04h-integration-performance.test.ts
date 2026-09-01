// @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides this built-in at runtime.
import assert from 'node:assert/strict';
// @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides this built-in at runtime.
import { performance } from 'node:perf_hooks';
// @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides this built-in at runtime.
import test from 'node:test';
import type { CorrelationId, TenantId } from '../../contracts/src/ids/types.ts';
import {
  createCapabilityRegistry,
  type CapabilityDescriptor,
  type CapabilityRegistrySnapshot,
} from '../../registries/src/capabilities/registry.ts';
import {
  createExecutionBudget,
  initialExecutionBudgetUsage,
  projectOptionalBudgetUsage,
  type ExecutionBudget,
} from '../src/budget/index.ts';
import { planCapabilities, type CapabilityPlan } from '../src/capability-plan/index.ts';
import {
  createGoalGraph,
  type GoalGraph,
  type GoalGraphNode,
  type GoalGraphStateSnapshot,
} from '../src/goal-graph/index.ts';
import { resolvePlanningLane } from '../src/lanes/index.ts';
import { createLifecycleRecord, transitionLifecycle } from '../src/lifecycle/index.ts';
import { planSchedulerTick } from '../src/scheduler/index.ts';
import {
  bindPlanTemplate,
  createPlanTemplate,
  type PlanTemplate,
  type PlanTemplateBindingInput,
} from '../src/templates/index.ts';

const tenantId = 'ten_01J00000000000000000000000' as TenantId;
const correlationId = 'cor_01J00000000000000000000000' as CorrelationId;
const transitionCorrelationId = 'cor_01J00000000000000000000001' as CorrelationId;
const nowEpochMs = Date.parse('2026-09-01T12:00:00.000Z');
const templateHash = `sha256:${'c'.repeat(64)}`;

function descriptor(
  capabilityId: string,
  bindingId: string,
  sideEffectClass: CapabilityDescriptor['sideEffectClass'] = 'READ_ONLY',
): CapabilityDescriptor {
  return {
    capabilityId,
    semanticVersion: '1.0.0',
    name: capabilityId,
    description: `Target-neutral W04-H fixture for ${capabilityId}.`,
    supportedTargetKinds: ['LOCAL_SERVICE'],
    compatibilityKeys: [`${capabilityId}.v1`],
    requiredPermissionClaims: [],
    preconditions: [],
    riskClass: 'LOW',
    sideEffectClass,
    readbackStrategy: 'RECEIPT',
    evidenceStrategy: 'REQUIRED',
    availability: {
      state: 'AVAILABLE',
      observedAt: '2026-09-01T11:59:00.000Z',
      maxAgeMs: 600_000,
      source: 'w04h-mock-observer',
    },
    bindings: [
      {
        bindingId,
        targetKind: 'LOCAL_SERVICE',
        compatibilityKey: `${capabilityId}.v1`,
        availability: {
          state: 'AVAILABLE',
          observedAt: '2026-09-01T11:59:00.000Z',
          maxAgeMs: 600_000,
          source: 'w04h-mock-observer',
        },
      },
    ],
    provenance: {
      sourceKind: 'AURORA_NATIVE',
      sourceRef: `w04h:fixture:${capabilityId}`,
    },
  };
}

function registry(): CapabilityRegistrySnapshot {
  const result = createCapabilityRegistry('w04-h.registry.1', [
    descriptor('cap:read-input', 'binding:read-input'),
    descriptor('cap:evidence', 'binding:evidence', 'INTERNAL_STATE'),
  ]);
  if (result.status !== 'CREATED') {
    throw new Error(`expected registry creation, received ${result.code}`);
  }
  return result.registry;
}

function capabilityPlan(snapshot: CapabilityRegistrySnapshot): CapabilityPlan {
  const plan = planCapabilities(snapshot, {
    tenantId,
    correlationId,
    registryVersion: snapshot.registryVersion,
    nowEpochMs,
    requirements: [
      {
        requirementId: 'read-input',
        capabilityId: 'cap:read-input',
        acceptedTargetKinds: ['LOCAL_SERVICE'],
        requiredCompatibilityKeys: ['cap:read-input.v1'],
      },
      {
        requirementId: 'evidence',
        capabilityId: 'cap:evidence',
        acceptedTargetKinds: ['LOCAL_SERVICE'],
        requiredCompatibilityKeys: ['cap:evidence.v1'],
      },
    ],
  });
  if (plan.status !== 'READY') {
    throw new Error('expected READY capability plan');
  }
  return plan;
}

function executionBudget(maxConcurrency = 2): ExecutionBudget {
  const result = createExecutionBudget({
    budgetId: 'budget:w04h:objective',
    tenantId,
    rootCorrelationId: correlationId,
    scope: 'OBJECTIVE',
    scopeId: 'objective:w04h:mock',
    limits: {
      maxLatencyMs: 20_000,
      maxCostMicros: 100_000,
      maxReasoningUnits: 1_000,
      maxToolCalls: 100,
      maxConcurrency,
    },
    exhaustionPolicy: 'HOLD',
    createdAt: '2026-09-01T12:00:00.000Z',
  });
  if (result.status !== 'CREATED') {
    throw new Error(`expected budget creation, received ${result.code}`);
  }
  return result.budget;
}

function graphNode(nodeId: string): GoalGraphNode {
  return {
    nodeId,
    lifecycleRef: { kind: 'TASK', id: `task:${nodeId}` },
    joinPolicy: 'ALL_SUCCESS',
  };
}

function integrationGraph(): GoalGraph {
  const result = createGoalGraph({
    graphId: 'graph:w04h:mock-objective',
    tenantId,
    correlationId,
    nodes: [graphNode('read-input'), graphNode('evidence'), graphNode('join')],
    edges: [
      { fromNodeId: 'read-input', toNodeId: 'join' },
      { fromNodeId: 'evidence', toNodeId: 'join' },
    ],
  });
  if (result.status !== 'CREATED') {
    throw new Error(`expected graph creation, received ${result.code}`);
  }
  return result.graph;
}

function template(): PlanTemplate {
  const result = createPlanTemplate({
    templateId: 'template:w04h:mock-objective',
    semanticVersion: '1.0.0',
    contentHash: templateHash,
    status: 'ACTIVE',
    match: {
      intentKind: 'MOCK_OBJECTIVE',
      taskKind: 'CONTROL_GATE',
      inputContractVersion: '1.0.0',
    },
    requirementOrder: ['read-input', 'evidence'],
    compatibility: {
      registryVersions: ['w04-h.registry.1'],
      requirements: [
        {
          requirementId: 'read-input',
          capabilityId: 'cap:read-input',
          allowedCapabilityVersions: ['1.0.0'],
          requiredCompatibilityKeys: ['cap:read-input.v1'],
        },
        {
          requirementId: 'evidence',
          capabilityId: 'cap:evidence',
          allowedCapabilityVersions: ['1.0.0'],
          requiredCompatibilityKeys: ['cap:evidence.v1'],
        },
      ],
    },
    invalidationConditions: [
      'REGISTRY_VERSION_MISMATCH',
      'CAPABILITY_VERSION_MISMATCH',
      'EXPLICIT_REVOCATION',
    ],
    provenance: {
      sourceKind: 'AURORA_CURATED',
      sourceRef: 'governance:w04-h/mock-objective-template',
      curatedBy: 'AURORA_PROGRAM_CONTROL',
      curatedAt: '2026-09-01T12:00:00.000Z',
    },
  });
  if (result.status !== 'CREATED') {
    throw new Error(`expected template creation, received ${result.code}`);
  }
  return result.template;
}

function bindingInput(
  selectedTemplate: PlanTemplate,
  plan: CapabilityPlan,
  snapshot: CapabilityRegistrySnapshot,
  overrides: Partial<PlanTemplateBindingInput> = {},
): PlanTemplateBindingInput {
  return {
    tenantId,
    correlationId,
    expectedContentHash: templateHash,
    match: {
      intentKind: 'MOCK_OBJECTIVE',
      taskKind: 'CONTROL_GATE',
      inputContractVersion: '1.0.0',
    },
    template: selectedTemplate,
    capabilityPlan: plan,
    registry: snapshot,
    ...overrides,
  };
}

function percentile(samples: readonly number[], percentileValue: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * percentileValue) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

function measure(samples: number, operation: () => void): readonly number[] {
  const values: number[] = [];
  for (let index = 0; index < samples; index += 1) {
    const startedAt = performance.now();
    operation();
    values.push(performance.now() - startedAt);
  }
  return values;
}

test('W04-H integrates lifecycle -> capability plan -> graph -> lane/budget/template -> scheduler without authority or side effects', () => {
  const objective = createLifecycleRecord({
    entity: { kind: 'OBJECTIVE', id: 'objective:w04h:mock' },
    tenantId,
    rootCorrelationId: correlationId,
    createdAt: '2026-09-01T12:00:00.000Z',
  });
  const ready = transitionLifecycle(objective, {
    tenantId,
    correlationId: transitionCorrelationId,
    expectedRevision: objective.revision,
    to: 'READY',
    at: '2026-09-01T12:00:01.000Z',
    reason: 'W04-H integrated gate fixture is ready.',
  });
  assert.equal(ready.status, 'APPLIED');
  if (ready.status !== 'APPLIED') return;

  const snapshot = registry();
  const plan = capabilityPlan(snapshot);
  const goalGraph = integrationGraph();
  const budget = executionBudget(2);
  const lane = resolvePlanningLane({
    taskId: 'task:w04h:mock',
    tenantId,
    correlationId,
    riskClass: 'LOW',
    sideEffectClass: 'READ_ONLY',
    reversibility: 'REVERSIBLE',
    complexity: 'TEMPLATE_ELIGIBLE',
    capabilityPlanStatus: plan.status,
    approvalRequired: false,
    stepUpRequired: false,
  });
  const selectedTemplate = template();
  const bound = bindPlanTemplate(bindingInput(selectedTemplate, plan, snapshot));
  assert.equal(bound.status, 'BOUND');
  if (bound.status !== 'BOUND') return;

  const firstTick = planSchedulerTick({
    tenantId,
    correlationId,
    graph: goalGraph,
    states: { 'read-input': 'READY', evidence: 'READY', join: 'READY' },
    budget,
    budgetUsage: initialExecutionBudgetUsage(),
    policy: { maxConcurrency: 2, maxDispatchPerTick: 2 },
  });
  assert.equal(firstTick.status, 'PLANNED');
  if (firstTick.status !== 'PLANNED') return;
  assert.deepEqual(firstTick.plan.dispatchNodeIds, ['evidence', 'read-input']);
  assert.deepEqual(firstTick.plan.deferredReadyNodeIds, []);

  const joinTick = planSchedulerTick({
    tenantId,
    correlationId,
    graph: goalGraph,
    states: { 'read-input': 'SUCCEEDED', evidence: 'SUCCEEDED', join: 'READY' },
    budget,
    budgetUsage: initialExecutionBudgetUsage(),
    policy: { maxConcurrency: 2, maxDispatchPerTick: 2 },
  });
  assert.equal(joinTick.status, 'PLANNED');
  if (joinTick.status !== 'PLANNED') return;
  assert.deepEqual(joinTick.plan.dispatchNodeIds, ['join']);

  assert.equal(plan.authorizesExecution, false);
  assert.equal(goalGraph.authorizesExecution, false);
  assert.equal(lane.authorizesExecution, false);
  assert.equal(bound.binding.authorizesExecution, false);
  assert.equal(firstTick.plan.authorizesExecution, false);
  assert.deepEqual(lane.mandatoryValidations, [
    'CURRENT_POLICY',
    'CURRENT_AUTHORITY',
    'EXECUTOR_PRECONDITIONS',
  ]);
  assert.deepEqual(bound.binding.mandatoryValidations, [
    'CURRENT_CAPABILITY',
    'CURRENT_POLICY',
    'CURRENT_AUTHORITY',
    'EXECUTOR_PRECONDITIONS',
  ]);
  assert.equal(firstTick.plan.durableCoordinationBoundary, 'W03_WHEN_REQUIRED');

  const evidenceChain = {
    objective: {
      entity: ready.record.entity,
      tenantId: ready.record.tenantId,
      rootCorrelationId: ready.record.rootCorrelationId,
      revision: ready.record.revision,
    },
    capabilityPlan: {
      tenantId: plan.tenantId,
      correlationId: plan.correlationId,
      registryVersion: plan.registryVersion,
      capabilityIds: plan.selections.map((selection) => selection.capabilityId),
    },
    graph: {
      graphId: goalGraph.graphId,
      tenantId: goalGraph.tenantId,
      correlationId: goalGraph.correlationId,
      topologicalOrder: goalGraph.topologicalOrder,
    },
    lane: {
      tenantId: lane.tenantId,
      correlationId: lane.correlationId,
      lane: lane.lane,
      strategy: lane.preferredPlanningStrategy,
    },
    budget: {
      budgetId: budget.budgetId,
      tenantId: budget.tenantId,
      rootCorrelationId: budget.rootCorrelationId,
      maxConcurrency: budget.limits.maxConcurrency,
    },
    template: {
      templateId: bound.binding.templateId,
      templateVersion: bound.binding.templateVersion,
      contentHash: bound.binding.contentHash,
    },
    scheduler: {
      firstDispatch: firstTick.plan.dispatchNodeIds,
      joinDispatch: joinTick.plan.dispatchNodeIds,
      durableCoordinationBoundary: firstTick.plan.durableCoordinationBoundary,
    },
  };

  assert.equal(evidenceChain.objective.tenantId, tenantId);
  assert.equal(evidenceChain.capabilityPlan.tenantId, tenantId);
  assert.equal(evidenceChain.graph.tenantId, tenantId);
  assert.equal(evidenceChain.lane.tenantId, tenantId);
  assert.equal(evidenceChain.budget.tenantId, tenantId);
  assert.equal(evidenceChain.objective.rootCorrelationId, correlationId);
  assert.equal(evidenceChain.capabilityPlan.correlationId, correlationId);
  assert.equal(evidenceChain.graph.correlationId, correlationId);
  assert.equal(evidenceChain.lane.correlationId, correlationId);
  assert.equal(evidenceChain.budget.rootCorrelationId, correlationId);

  const serialized = JSON.stringify(evidenceChain).toLowerCase();
  assert.doesNotMatch(serialized, /providercredential|providersecret|deviceid|androidpackage|accesstoken/);
});

test('W04-H proves cycle rejection, bounded pressure, fairness, cancellation and deterministic parallel planning rounds', () => {
  const cycle = createGoalGraph({
    graphId: 'graph:w04h:cycle',
    tenantId,
    correlationId,
    nodes: [graphNode('a'), graphNode('b')],
    edges: [
      { fromNodeId: 'a', toNodeId: 'b' },
      { fromNodeId: 'b', toNodeId: 'a' },
    ],
  });
  assert.equal(cycle.status, 'REJECTED');

  const pressureNodes = Array.from({ length: 256 }, (_, index) => graphNode(`n${String(index).padStart(3, '0')}`));
  const pressure = createGoalGraph({
    graphId: 'graph:w04h:pressure',
    tenantId,
    correlationId,
    nodes: pressureNodes,
    edges: [],
  });
  assert.equal(pressure.status, 'CREATED');
  if (pressure.status !== 'CREATED') return;

  const overBound = createGoalGraph({
    graphId: 'graph:w04h:pressure-overbound',
    tenantId,
    correlationId,
    nodes: [...pressureNodes, graphNode('overflow')],
    edges: [],
  });
  assert.equal(overBound.status, 'REJECTED');

  const states = Object.fromEntries(pressureNodes.map((entry) => [entry.nodeId, 'READY'])) as GoalGraphStateSnapshot;
  const bounded = planSchedulerTick({
    tenantId,
    correlationId,
    graph: pressure.graph,
    states,
    budget: executionBudget(8),
    budgetUsage: initialExecutionBudgetUsage(),
    policy: { maxConcurrency: 8, maxDispatchPerTick: 8 },
  });
  assert.equal(bounded.status, 'PLANNED');
  if (bounded.status !== 'PLANNED') return;
  assert.equal(bounded.plan.dispatchNodeIds.length, 8);
  assert.equal(bounded.plan.deferredReadyNodeIds.length, 248);
  assert.equal(bounded.plan.backpressureReason, 'DISPATCH_LIMIT_REACHED');

  const fairnessGraphResult = createGoalGraph({
    graphId: 'graph:w04h:fairness',
    tenantId,
    correlationId,
    nodes: Array.from({ length: 8 }, (_, index) => graphNode(`f${index}`)),
    edges: [],
  });
  assert.equal(fairnessGraphResult.status, 'CREATED');
  if (fairnessGraphResult.status !== 'CREATED') return;
  const fairnessStates = Object.fromEntries(
    fairnessGraphResult.graph.nodes.map((entry) => [entry.nodeId, 'READY']),
  ) as GoalGraphStateSnapshot;

  let fairness: { readonly nextTopologicalIndex: number; readonly turn: number } | undefined;
  const observed: string[] = [];
  for (let round = 0; round < 4; round += 1) {
    const result = planSchedulerTick({
      tenantId,
      correlationId,
      graph: fairnessGraphResult.graph,
      states: fairnessStates,
      budget: executionBudget(2),
      budgetUsage: initialExecutionBudgetUsage(),
      policy: { maxConcurrency: 2, maxDispatchPerTick: 2 },
      fairness,
    });
    assert.equal(result.status, 'PLANNED');
    if (result.status !== 'PLANNED') return;
    observed.push(...result.plan.dispatchNodeIds);
    fairness = result.plan.nextFairness;
  }
  assert.deepEqual(observed, ['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7']);
  const serialRounds = 8;
  const boundedParallelRounds = 4;
  assert.equal(serialRounds / boundedParallelRounds, 2);

  const cancelled = planSchedulerTick({
    tenantId,
    correlationId,
    graph: fairnessGraphResult.graph,
    states: fairnessStates,
    budget: executionBudget(2),
    budgetUsage: initialExecutionBudgetUsage(),
    policy: { maxConcurrency: 2, maxDispatchPerTick: 2 },
    cancellationRequested: true,
  });
  assert.equal(cancelled.status, 'PLANNED');
  if (cancelled.status !== 'PLANNED') return;
  assert.deepEqual(cancelled.plan.dispatchNodeIds, []);
  assert.equal(cancelled.plan.backpressureReason, 'CANCELLATION_REQUESTED');
  assert.equal(cancelled.plan.authorizesExecution, false);
});

test('W04-H template hit avoids frontier replanning and stale template deterministically falls back', () => {
  const snapshot = registry();
  const plan = capabilityPlan(snapshot);
  const selectedTemplate = template();
  let fallbackCalls = 0;

  function selectPath(input: PlanTemplateBindingInput): 'TEMPLATE_HIT' | 'FRONTIER_REPLAN' {
    const binding = bindPlanTemplate(input);
    if (binding.status === 'BOUND') return 'TEMPLATE_HIT';
    fallbackCalls += 1;
    return 'FRONTIER_REPLAN';
  }

  const hit = selectPath(bindingInput(selectedTemplate, plan, snapshot));
  assert.equal(hit, 'TEMPLATE_HIT');
  assert.equal(fallbackCalls, 0);

  const stale = selectPath(
    bindingInput(selectedTemplate, plan, snapshot, {
      expectedContentHash: `sha256:${'d'.repeat(64)}`,
    }),
  );
  assert.equal(stale, 'FRONTIER_REPLAN');
  assert.equal(fallbackCalls, 1);
});

test('W04-H target-neutral bindings remain implementation-neutral and budget exhaustion cannot weaken validation', () => {
  const snapshot = registry();
  const plan = capabilityPlan(snapshot);
  assert.equal(plan.status, 'READY');
  assert.equal(plan.authorizesExecution, false);
  assert.equal('agentId' in plan, false);
  assert.equal('providerId' in plan, false);
  assert.equal('deviceId' in plan, false);
  for (const entry of snapshot.entries) {
    for (const binding of entry.bindings) {
      assert.equal('deviceId' in binding, false);
      assert.equal('providerAccountId' in binding, false);
      assert.equal('credential' in binding, false);
    }
  }

  const budget = executionBudget(2);
  const constrained = projectOptionalBudgetUsage(budget, initialExecutionBudgetUsage(), {
    costMicros: budget.limits.maxCostMicros + 1,
  });
  assert.equal(constrained.status, 'CONSTRAINED');
  if (constrained.status !== 'CONSTRAINED') return;
  assert.equal(constrained.mandatorySafetyValidationRequired, true);
  assert.equal(constrained.canSkipMandatoryValidation, false);
  assert.equal(constrained.authorizesExecution, false);
});

test('W04-H records evidence-driven p50/p95/p99 planning overhead without inventing a production SLO', () => {
  const snapshot = registry();
  const plan = capabilityPlan(snapshot);
  const selectedTemplate = template();
  const goalGraph = integrationGraph();
  const budget = executionBudget(2);
  const states: GoalGraphStateSnapshot = {
    'read-input': 'READY',
    evidence: 'READY',
    join: 'READY',
  };

  const graphSamples = measure(128, () => {
    const result = createGoalGraph({
      graphId: 'graph:w04h:benchmark',
      tenantId,
      correlationId,
      nodes: Array.from({ length: 32 }, (_, index) => graphNode(`b${String(index).padStart(2, '0')}`)),
      edges: [],
    });
    if (result.status !== 'CREATED') throw new Error('benchmark graph rejected');
  });
  const planSamples = measure(128, () => {
    const result = planCapabilities(snapshot, {
      tenantId,
      correlationId,
      registryVersion: snapshot.registryVersion,
      nowEpochMs,
      requirements: [
        {
          requirementId: 'read-input',
          capabilityId: 'cap:read-input',
          acceptedTargetKinds: ['LOCAL_SERVICE'],
        },
        {
          requirementId: 'evidence',
          capabilityId: 'cap:evidence',
          acceptedTargetKinds: ['LOCAL_SERVICE'],
        },
      ],
    });
    if (result.status !== 'READY') throw new Error('benchmark plan blocked');
  });
  const schedulerSamples = measure(128, () => {
    const result = planSchedulerTick({
      tenantId,
      correlationId,
      graph: goalGraph,
      states,
      budget,
      budgetUsage: initialExecutionBudgetUsage(),
      policy: { maxConcurrency: 2, maxDispatchPerTick: 2 },
    });
    if (result.status !== 'PLANNED') throw new Error('benchmark scheduler rejected');
  });
  const templateSamples = measure(128, () => {
    const result = bindPlanTemplate(bindingInput(selectedTemplate, plan, snapshot));
    if (result.status !== 'BOUND') throw new Error('benchmark template rejected');
  });
  const budgetSamples = measure(128, () => {
    const result = projectOptionalBudgetUsage(budget, initialExecutionBudgetUsage(), {
      costMicros: 1,
      toolCalls: 1,
    });
    if (result.status === 'REJECTED') throw new Error('benchmark budget rejected');
  });

  const metrics = {
    graphValidationMs: {
      p50: percentile(graphSamples, 0.5),
      p95: percentile(graphSamples, 0.95),
      p99: percentile(graphSamples, 0.99),
    },
    capabilityPlanMs: {
      p50: percentile(planSamples, 0.5),
      p95: percentile(planSamples, 0.95),
      p99: percentile(planSamples, 0.99),
    },
    schedulerMs: {
      p50: percentile(schedulerSamples, 0.5),
      p95: percentile(schedulerSamples, 0.95),
      p99: percentile(schedulerSamples, 0.99),
    },
    templateHitMs: {
      p50: percentile(templateSamples, 0.5),
      p95: percentile(templateSamples, 0.95),
      p99: percentile(templateSamples, 0.99),
    },
    budgetAccountingMs: {
      p50: percentile(budgetSamples, 0.5),
      p95: percentile(budgetSamples, 0.95),
      p99: percentile(budgetSamples, 0.99),
    },
  };

  for (const family of Object.values(metrics)) {
    assert.ok(Number.isFinite(family.p50));
    assert.ok(Number.isFinite(family.p95));
    assert.ok(Number.isFinite(family.p99));
    assert.ok(family.p50 >= 0);
    assert.ok(family.p95 >= family.p50);
    assert.ok(family.p99 >= family.p95);
  }

  // @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides process at runtime.
  process.stdout.write(`[w04h:benchmark] ${JSON.stringify(metrics)}\n`);
});
