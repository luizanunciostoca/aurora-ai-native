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

function fixtureRegistry(): CapabilityRegistrySnapshot {
  const result = createCapabilityRegistry('w04-h.registry.1', [
    descriptor('cap:read-input', 'binding:read-input'),
    descriptor('cap:evidence', 'binding:evidence', 'INTERNAL_STATE'),
  ]);
  if (result.status !== 'CREATED') throw new Error(`registry rejected: ${result.code}`);
  return result.registry;
}

function fixturePlan(registry: CapabilityRegistrySnapshot): CapabilityPlan {
  const plan = planCapabilities(registry, {
    tenantId,
    correlationId,
    registryVersion: registry.registryVersion,
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
  if (plan.status !== 'READY') throw new Error('capability plan unexpectedly blocked');
  return plan;
}

function fixtureBudget(maxConcurrency = 2): ExecutionBudget {
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
  if (result.status !== 'CREATED') throw new Error(`budget rejected: ${result.code}`);
  return result.budget;
}

function graphNode(nodeId: string): GoalGraphNode {
  return {
    nodeId,
    lifecycleRef: { kind: 'TASK', id: `task:${nodeId}` },
    joinPolicy: 'ALL_SUCCESS',
  };
}

function fixtureGraph(): GoalGraph {
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
  if (result.status !== 'CREATED') throw new Error(`graph rejected: ${result.code}`);
  return result.graph;
}

function fixtureTemplate(): PlanTemplate {
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
  if (result.status !== 'CREATED') throw new Error(`template rejected: ${result.code}`);
  return result.template;
}

function fixtureBindingInput(
  template: PlanTemplate,
  plan: CapabilityPlan,
  registry: CapabilityRegistrySnapshot,
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
    template,
    capabilityPlan: plan,
    registry,
    ...overrides,
  };
}

function percentile(samples: readonly number[], fraction: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1),
  );
  return sorted[index] ?? 0;
}

function measure(samples: number, operation: () => void): readonly number[] {
  const results: number[] = [];
  for (let index = 0; index < samples; index += 1) {
    const startedAt = performance.now();
    operation();
    results.push(performance.now() - startedAt);
  }
  return results;
}

test('W04-H integrates accepted W04 surfaces without authority or side effects', () => {
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
    reason: 'W04-H integrated fixture ready',
  });
  assert.equal(ready.status, 'APPLIED');
  if (ready.status !== 'APPLIED') return;

  const registry = fixtureRegistry();
  const plan = fixturePlan(registry);
  const graph = fixtureGraph();
  const budget = fixtureBudget(2);
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
  const bound = bindPlanTemplate(fixtureBindingInput(fixtureTemplate(), plan, registry));
  assert.equal(bound.status, 'BOUND');
  if (bound.status !== 'BOUND') return;

  const firstTick = planSchedulerTick({
    tenantId,
    correlationId,
    graph,
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
    graph,
    states: { 'read-input': 'SUCCEEDED', evidence: 'SUCCEEDED', join: 'READY' },
    budget,
    budgetUsage: initialExecutionBudgetUsage(),
    policy: { maxConcurrency: 2, maxDispatchPerTick: 2 },
  });
  assert.equal(joinTick.status, 'PLANNED');
  if (joinTick.status !== 'PLANNED') return;
  assert.deepEqual(joinTick.plan.dispatchNodeIds, ['join']);

  assert.equal(plan.authorizesExecution, false);
  assert.equal(graph.authorizesExecution, false);
  assert.equal(lane.authorizesExecution, false);
  assert.equal(bound.binding.authorizesExecution, false);
  assert.equal(firstTick.plan.authorizesExecution, false);
  assert.equal(firstTick.plan.durableCoordinationBoundary, 'W03_WHEN_REQUIRED');
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

  const evidenceChain = {
    objective: {
      entity: ready.record.entity,
      tenantId: ready.record.tenantId,
      correlationId: ready.record.rootCorrelationId,
      revision: ready.record.revision,
    },
    plan: {
      tenantId: plan.tenantId,
      correlationId: plan.correlationId,
      registryVersion: plan.registryVersion,
      capabilityIds: plan.selections.map((selection) => selection.capabilityId),
    },
    graph: {
      graphId: graph.graphId,
      tenantId: graph.tenantId,
      correlationId: graph.correlationId,
      topologicalOrder: graph.topologicalOrder,
    },
    lane: {
      tenantId: lane.tenantId,
      correlationId: lane.correlationId,
      lane: lane.lane,
    },
    budget: {
      budgetId: budget.budgetId,
      tenantId: budget.tenantId,
      correlationId: budget.rootCorrelationId,
      maxConcurrency: budget.limits.maxConcurrency,
    },
    template: {
      templateId: bound.binding.templateRef.templateId,
      semanticVersion: bound.binding.templateRef.semanticVersion,
      contentHash: bound.binding.templateRef.contentHash,
      provenanceRef: bound.binding.templateRef.provenanceRef,
    },
    scheduler: {
      firstDispatch: firstTick.plan.dispatchNodeIds,
      joinDispatch: joinTick.plan.dispatchNodeIds,
      durableCoordinationBoundary: firstTick.plan.durableCoordinationBoundary,
    },
  };

  for (const linked of [
    evidenceChain.objective,
    evidenceChain.plan,
    evidenceChain.graph,
    evidenceChain.lane,
    evidenceChain.budget,
  ]) {
    assert.equal(linked.tenantId, tenantId);
    assert.equal(linked.correlationId, correlationId);
  }
  const serialized = JSON.stringify(evidenceChain).toLowerCase();
  assert.doesNotMatch(
    serialized,
    /providercredential|providersecret|deviceid|androidpackage|accesstoken/,
  );
});

test('W04-H bounds concurrency and preserves deterministic fairness', () => {
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
  assert.deepEqual(
    cycle.status === 'REJECTED' ? cycle.code : null,
    'CYCLE_DETECTED',
  );

  const pressureNodes = Array.from({ length: 256 }, (_, index) =>
    graphNode(`n${String(index).padStart(3, '0')}`),
  );
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
    graphId: 'graph:w04h:overbound',
    tenantId,
    correlationId,
    nodes: [...pressureNodes, graphNode('overflow')],
    edges: [],
  });
  assert.deepEqual(
    overBound.status === 'REJECTED' ? overBound.code : null,
    'NODE_LIMIT_EXCEEDED',
  );

  const pressureStates = Object.fromEntries(
    pressureNodes.map((node) => [node.nodeId, 'READY']),
  ) as GoalGraphStateSnapshot;
  const bounded = planSchedulerTick({
    tenantId,
    correlationId,
    graph: pressure.graph,
    states: pressureStates,
    budget: fixtureBudget(8),
    budgetUsage: initialExecutionBudgetUsage(),
    policy: { maxConcurrency: 8, maxDispatchPerTick: 8 },
  });
  assert.equal(bounded.status, 'PLANNED');
  if (bounded.status !== 'PLANNED') return;
  assert.equal(bounded.plan.dispatchNodeIds.length, 8);
  assert.equal(bounded.plan.deferredReadyNodeIds.length, 248);
  assert.equal(bounded.plan.backpressureReason, 'DISPATCH_LIMIT_REACHED');

  const fairnessResult = createGoalGraph({
    graphId: 'graph:w04h:fairness',
    tenantId,
    correlationId,
    nodes: Array.from({ length: 8 }, (_, index) => graphNode(`f${index}`)),
    edges: [],
  });
  assert.equal(fairnessResult.status, 'CREATED');
  if (fairnessResult.status !== 'CREATED') return;
  const fairnessStates = Object.fromEntries(
    fairnessResult.graph.nodes.map((node) => [node.nodeId, 'READY']),
  ) as GoalGraphStateSnapshot;
  let fairness:
    | { readonly nextTopologicalIndex: number; readonly turn: number }
    | undefined;
  const observed: string[] = [];
  for (let round = 0; round < 4; round += 1) {
    const result = planSchedulerTick({
      tenantId,
      correlationId,
      graph: fairnessResult.graph,
      states: fairnessStates,
      budget: fixtureBudget(2),
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
  assert.equal(8 / 4, 2);

  const cancelled = planSchedulerTick({
    tenantId,
    correlationId,
    graph: fairnessResult.graph,
    states: fairnessStates,
    budget: fixtureBudget(2),
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

test('W04-H template hit avoids replanning and stale binding falls back', () => {
  const registry = fixtureRegistry();
  const plan = fixturePlan(registry);
  const template = fixtureTemplate();
  let replans = 0;
  const resolve = (
    input: PlanTemplateBindingInput,
  ): 'TEMPLATE_HIT' | 'FRONTIER_REPLAN' => {
    if (bindPlanTemplate(input).status === 'BOUND') return 'TEMPLATE_HIT';
    replans += 1;
    return 'FRONTIER_REPLAN';
  };

  assert.equal(resolve(fixtureBindingInput(template, plan, registry)), 'TEMPLATE_HIT');
  assert.equal(replans, 0);
  assert.equal(
    resolve(
      fixtureBindingInput(template, plan, registry, {
        expectedContentHash: `sha256:${'d'.repeat(64)}`,
      }),
    ),
    'FRONTIER_REPLAN',
  );
  assert.equal(replans, 1);
});

test('W04-H target-neutral bindings remain non-authoritative', () => {
  const registry = fixtureRegistry();
  const plan = fixturePlan(registry);
  assert.equal(plan.authorizesExecution, false);
  assert.equal('agentId' in plan, false);
  assert.equal('providerId' in plan, false);
  assert.equal('deviceId' in plan, false);
  for (const entry of registry.entries) {
    for (const binding of entry.bindings) {
      assert.equal('deviceId' in binding, false);
      assert.equal('providerAccountId' in binding, false);
      assert.equal('credential' in binding, false);
    }
  }

  const budget = fixtureBudget(2);
  const constrained = projectOptionalBudgetUsage(budget, initialExecutionBudgetUsage(), {
    costMicros: budget.limits.maxCostMicros + 1,
  });
  assert.equal(constrained.status, 'CONSTRAINED');
  if (constrained.status !== 'CONSTRAINED') return;
  assert.equal(constrained.mandatorySafetyValidationRequired, true);
  assert.equal(constrained.canSkipMandatoryValidation, false);
  assert.equal(constrained.authorizesExecution, false);
});

test('W04-H records observed p50/p95/p99 control-plane overhead', () => {
  const registry = fixtureRegistry();
  const plan = fixturePlan(registry);
  const template = fixtureTemplate();
  const graph = fixtureGraph();
  const budget = fixtureBudget(2);
  const states: GoalGraphStateSnapshot = {
    'read-input': 'READY',
    evidence: 'READY',
    join: 'READY',
  };

  const graphSamples = measure(64, () => {
    const result = createGoalGraph({
      graphId: 'graph:w04h:benchmark',
      tenantId,
      correlationId,
      nodes: Array.from({ length: 32 }, (_, index) =>
        graphNode(`b${String(index).padStart(2, '0')}`),
      ),
      edges: [],
    });
    if (result.status !== 'CREATED') throw new Error('benchmark graph rejected');
  });
  const planSamples = measure(64, () => {
    const result = planCapabilities(registry, {
      tenantId,
      correlationId,
      registryVersion: registry.registryVersion,
      nowEpochMs,
      requirements: [
        { requirementId: 'read-input', capabilityId: 'cap:read-input' },
        { requirementId: 'evidence', capabilityId: 'cap:evidence' },
      ],
    });
    if (result.status !== 'READY') throw new Error('benchmark plan blocked');
  });
  const schedulerSamples = measure(64, () => {
    const result = planSchedulerTick({
      tenantId,
      correlationId,
      graph,
      states,
      budget,
      budgetUsage: initialExecutionBudgetUsage(),
      policy: { maxConcurrency: 2, maxDispatchPerTick: 2 },
    });
    if (result.status !== 'PLANNED') throw new Error('benchmark scheduler rejected');
  });
  const templateSamples = measure(64, () => {
    if (bindPlanTemplate(fixtureBindingInput(template, plan, registry)).status !== 'BOUND') {
      throw new Error('benchmark template rejected');
    }
  });
  const budgetSamples = measure(64, () => {
    if (
      projectOptionalBudgetUsage(budget, initialExecutionBudgetUsage(), {
        costMicros: 1,
        toolCalls: 1,
      }).status === 'REJECTED'
    ) {
      throw new Error('benchmark budget rejected');
    }
  });

  const metric = (samples: readonly number[]) => ({
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    p99: percentile(samples, 0.99),
  });
  const metrics = {
    graphValidationMs: metric(graphSamples),
    capabilityPlanMs: metric(planSamples),
    schedulerMs: metric(schedulerSamples),
    templateHitMs: metric(templateSamples),
    budgetAccountingMs: metric(budgetSamples),
  };
  for (const family of Object.values(metrics)) {
    assert.ok(Number.isFinite(family.p50) && family.p50 >= 0);
    assert.ok(family.p95 >= family.p50);
    assert.ok(family.p99 >= family.p95);
  }
  // @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides process at runtime.
  process.stdout.write(`[w04h:benchmark] ${JSON.stringify(metrics)}\n`);
});
