// @ts-expect-error -- service harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- service harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { CorrelationId, TenantId } from '@aurora/contracts';
import { advanceAdaptiveLoop, startAdaptiveLoop } from '../src/loop/index.js';
import type {
  AdaptiveLoopControlFrame,
  AdaptiveLoopEvent,
  AdaptiveLoopSnapshot,
  BoundedAdaptiveLoopConfig,
  PlannedToolAction,
  W05BRouteProjection,
} from '../src/loop/index.js';
import type { WorkerRecordSnapshot } from '../src/runtime/index.js';

const tenant = { tenantId: 'ten_01K0G0G0G0G0G0G0G0G0G0G0G0G0G0' as TenantId };
const correlation = {
  correlationId: 'cor_01K0G0G0G0G0G0G0G0G0G0G0G0G0G1' as CorrelationId,
};
const otherTenant = { tenantId: 'ten_01K0G0G0G0G0G0G0G0G0G0G0G0G2' as TenantId };
const otherCorrelation = {
  correlationId: 'cor_01K0G0G0G0G0G0G0G0G0G0G0G0G0G3' as CorrelationId,
};

const config: BoundedAdaptiveLoopConfig = {
  maxIterations: 3,
  maxElapsedMs: 10_000,
  maxModelCalls: 3,
  maxToolPlanningCalls: 3,
  maxRepairAttempts: 2,
};

function worker(overrides: Partial<WorkerRecordSnapshot> = {}): WorkerRecordSnapshot {
  return {
    taskId: 'task:w05g',
    tenant,
    correlation,
    justification: 'ITERATIVE_OBSERVE_PLAN_REQUIRED',
    state: 'ACTIVE',
    generation: 1,
    ownerPresent: true,
    cancelRequested: false,
    terminalReason: null,
    lastTransitionEpochMs: 90,
    lastHeartbeatEpochMs: 95,
    authoritySemantics: 'AGENT_RUNTIME_OWNERSHIP_ONLY_NO_AUTHORITY',
    authorizesExecution: false,
    canInvokeTools: false,
    ...overrides,
  };
}

function frame(overrides: Partial<AdaptiveLoopControlFrame> = {}): AdaptiveLoopControlFrame {
  return {
    worker: worker(),
    capabilityPlan: {
      source: 'W04_CAPABILITY_PLAN',
      tenantId: tenant.tenantId,
      correlationId: correlation.correlationId,
      registryVersion: 'cap-reg:1',
      status: 'READY',
      selectedCapabilityIds: ['cap.read', 'cap.write'],
      authorizesExecution: false,
    },
    budget: {
      source: 'W04_EXECUTION_BUDGET_ASSESSMENT',
      tenantId: tenant.tenantId,
      correlationId: correlation.correlationId,
      budgetId: 'budget:w05g',
      state: 'WITHIN_BUDGET',
      action: 'CONTINUE_OPTIONAL',
      remaining: {
        latencyMs: 10_000,
        reasoningUnits: 10,
        toolCalls: 10,
      },
      mandatorySafetyValidationRequired: true,
      canSkipMandatoryValidation: false,
      authorizesExecution: false,
    },
    nowEpochMs: 100,
    ...overrides,
  };
}

function route(overrides: Partial<Extract<W05BRouteProjection, { status: 'SELECTED' }>> = {}): Extract<
  W05BRouteProjection,
  { status: 'SELECTED' }
> {
  return {
    source: 'W05_B_INTELLIGENCE_ROUTE',
    status: 'SELECTED',
    tenant,
    correlation,
    family: 'MODEL',
    strategyId: 'strategy:model',
    strategyVersion: '1.0.0',
    authorizesExecution: false,
    downstreamExecutionStillRequiresCurrentValidation: true,
    ...overrides,
  };
}

function started(
  startFrame: AdaptiveLoopControlFrame = frame(),
  startConfig: BoundedAdaptiveLoopConfig = config,
  startRoute: W05BRouteProjection = route(),
): AdaptiveLoopSnapshot {
  const result = startAdaptiveLoop({
    loopId: 'loop:w05g',
    route: startRoute,
    config: startConfig,
    frame: startFrame,
  });
  assert.equal(result.status, 'STARTED');
  if (result.status !== 'STARTED') throw new Error(`unexpected start rejection: ${result.code}`);
  return result.snapshot;
}

function at(base: AdaptiveLoopControlFrame, nowEpochMs: number): AdaptiveLoopControlFrame {
  return { ...base, nowEpochMs };
}

function action(overrides: Partial<PlannedToolAction> = {}): PlannedToolAction {
  return {
    capabilityId: 'cap.read',
    actionType: 'inspect.current-state',
    executionBoundary: 'W07_REQUIRED',
    planReference: 'plan:tool:1',
    ...overrides,
  };
}

function advance(
  snapshot: AdaptiveLoopSnapshot,
  event: AdaptiveLoopEvent,
  controlFrame: AdaptiveLoopControlFrame,
): AdaptiveLoopSnapshot {
  const result = advanceAdaptiveLoop(snapshot, event, controlFrame);
  assert.notEqual(result.status, 'REJECTED');
  return result.snapshot;
}

test('W05-G rejects invalid config, abstained routes and non-agent-suitable work', () => {
  assert.deepEqual(
    startAdaptiveLoop({ loopId: 'loop:w05g', route: route(), config: { ...config, maxIterations: 0 }, frame: frame() }),
    { status: 'REJECTED', code: 'INVALID_CONFIG' },
  );

  const abstained: W05BRouteProjection = {
    source: 'W05_B_INTELLIGENCE_ROUTE',
    status: 'ABSTAINED',
    tenant,
    correlation,
    authorizesExecution: false,
    downstreamExecutionStillRequiresCurrentValidation: true,
  };
  assert.equal(
    startAdaptiveLoop({ loopId: 'loop:w05g', route: abstained, config, frame: frame() }).status,
    'REJECTED',
  );

  const deterministic = startAdaptiveLoop({
    loopId: 'loop:w05g',
    route: route({ family: 'DETERMINISTIC' }),
    config,
    frame: frame(),
  });
  assert.deepEqual(deterministic, { status: 'REJECTED', code: 'ROUTE_NOT_AGENT_SUITABLE' });

  const specialistOnlyWorker = frame({
    worker: worker({ justification: 'SPECIALIST_COORDINATION_REQUIRED' }),
  });
  assert.deepEqual(
    startAdaptiveLoop({ loopId: 'loop:w05g', route: route({ family: 'SPECIALIST' }), config, frame: specialistOnlyWorker }),
    { status: 'REJECTED', code: 'ROUTE_NOT_AGENT_SUITABLE' },
  );
});

test('start binds tenant/correlation, worker generation and non-authority invariants', () => {
  const snapshot = started();
  assert.equal(snapshot.phase, 'OBSERVE');
  assert.equal(snapshot.workerTaskId, 'task:w05g');
  assert.equal(snapshot.workerGeneration, 1);
  assert.equal(snapshot.tenant.tenantId, tenant.tenantId);
  assert.equal(snapshot.correlation.correlationId, correlation.correlationId);
  assert.equal(snapshot.authoritySemantics, 'ADAPTIVE_LOOP_PLANNING_ONLY_NO_AUTHORITY');
  assert.equal(snapshot.authorizesExecution, false);
  assert.equal(snapshot.canInvokeTools, false);
  assert.equal(snapshot.downstreamExecutionStillRequiresCurrentValidation, true);
});

test('bounded observe-plan-tool-observe-inspect-validate happy path remains planning-only', () => {
  const control = frame();
  let snapshot = started(control);

  snapshot = advance(
    snapshot,
    { kind: 'OBSERVATION_READY', evidenceReference: 'ev:observe:1' },
    at(control, 101),
  );
  assert.equal(snapshot.phase, 'PLAN');
  assert.equal(snapshot.usage.iterations, 1);

  snapshot = advance(
    snapshot,
    {
      kind: 'PLAN_READY',
      evidenceReference: 'ev:plan:1',
      usedModel: true,
      disposition: 'TOOL_PLAN',
    },
    at(control, 102),
  );
  assert.equal(snapshot.phase, 'TOOL_PLAN');
  assert.equal(snapshot.usage.modelCalls, 1);

  snapshot = advance(
    snapshot,
    {
      kind: 'TOOL_PLAN_READY',
      evidenceReference: 'ev:tool-plan:1',
      plannedActions: [action()],
      disposition: 'AWAIT_OBSERVATION',
    },
    at(control, 103),
  );
  assert.equal(snapshot.phase, 'WAITING_TOOL_OBSERVATION');
  assert.equal(snapshot.usage.toolPlanningCalls, 1);
  assert.equal(snapshot.plannedActions[0]?.executionBoundary, 'W07_REQUIRED');
  assert.equal(snapshot.canInvokeTools, false);
  assert.equal(snapshot.authorizesExecution, false);

  snapshot = advance(
    snapshot,
    {
      kind: 'TOOL_OBSERVATION_READY',
      evidenceReference: 'ev:tool-observation:1',
      observationStatus: 'OBSERVED',
    },
    at(control, 104),
  );
  assert.equal(snapshot.phase, 'INSPECT');

  snapshot = advance(
    snapshot,
    {
      kind: 'INSPECTION_READY',
      evidenceReference: 'ev:inspect:1',
      usedModel: false,
      disposition: 'VALIDATE',
    },
    at(control, 105),
  );
  assert.equal(snapshot.phase, 'VALIDATE');

  const completed = advanceAdaptiveLoop(
    snapshot,
    { kind: 'VALIDATION_READY', evidenceReference: 'ev:validate:1', outcome: 'PASS' },
    at(control, 106),
  );
  assert.equal(completed.status, 'TERMINATED');
  assert.equal(completed.snapshot.phase, 'COMPLETED');
  assert.equal(completed.snapshot.terminalReason, 'VALIDATION_PASSED');
  assert.equal(completed.snapshot.authorizesExecution, false);
  assert.equal(completed.snapshot.canInvokeTools, false);
});

test('events outside the current phase reject without mutating the loop', () => {
  const control = frame();
  const snapshot = started(control);
  const rejected = advanceAdaptiveLoop(
    snapshot,
    {
      kind: 'PLAN_READY',
      evidenceReference: 'ev:wrong-phase',
      usedModel: true,
      disposition: 'VALIDATE',
    },
    at(control, 101),
  );
  assert.equal(rejected.status, 'REJECTED');
  assert.equal(rejected.code, 'INVALID_EVENT');
  assert.equal(rejected.snapshot.phase, 'OBSERVE');
  assert.deepEqual(rejected.snapshot.usage, snapshot.usage);
  assert.equal(rejected.snapshot.lastTransitionEpochMs, snapshot.lastTransitionEpochMs);
});

test('tool planning is fenced by current CapabilityPlan and W07 execution boundary', () => {
  const control = frame();
  let snapshot = started(control);
  snapshot = advance(
    snapshot,
    { kind: 'OBSERVATION_READY', evidenceReference: 'ev:o' },
    at(control, 101),
  );
  snapshot = advance(
    snapshot,
    { kind: 'PLAN_READY', evidenceReference: 'ev:p', usedModel: false, disposition: 'TOOL_PLAN' },
    at(control, 102),
  );

  const unknownCapability = advanceAdaptiveLoop(
    snapshot,
    {
      kind: 'TOOL_PLAN_READY',
      evidenceReference: 'ev:tp:bad-cap',
      plannedActions: [action({ capabilityId: 'cap.not-selected' })],
      disposition: 'AWAIT_OBSERVATION',
    },
    at(control, 103),
  );
  assert.equal(unknownCapability.status, 'REJECTED');
  assert.equal(unknownCapability.snapshot.phase, 'TOOL_PLAN');

  const wrongBoundary = advanceAdaptiveLoop(
    snapshot,
    {
      kind: 'TOOL_PLAN_READY',
      evidenceReference: 'ev:tp:bad-boundary',
      plannedActions: [{ ...action(), executionBoundary: 'W07_REQUIRED' as const, planReference: '' }],
      disposition: 'AWAIT_OBSERVATION',
    },
    at(control, 103),
  );
  assert.equal(wrongBoundary.status, 'REJECTED');

  const duplicate = advanceAdaptiveLoop(
    snapshot,
    {
      kind: 'TOOL_PLAN_READY',
      evidenceReference: 'ev:tp:duplicate',
      plannedActions: [action(), action()],
      disposition: 'AWAIT_OBSERVATION',
    },
    at(control, 103),
  );
  assert.equal(duplicate.status, 'REJECTED');
});

test('unknown tool observation escalates and never enters a blind repair/retry path', () => {
  const control = frame();
  let snapshot = started(control);
  snapshot = advance(snapshot, { kind: 'OBSERVATION_READY', evidenceReference: 'ev:o' }, at(control, 101));
  snapshot = advance(
    snapshot,
    { kind: 'PLAN_READY', evidenceReference: 'ev:p', usedModel: false, disposition: 'TOOL_PLAN' },
    at(control, 102),
  );
  snapshot = advance(
    snapshot,
    {
      kind: 'TOOL_PLAN_READY',
      evidenceReference: 'ev:tp',
      plannedActions: [action()],
      disposition: 'AWAIT_OBSERVATION',
    },
    at(control, 103),
  );

  const uncertain = advanceAdaptiveLoop(
    snapshot,
    {
      kind: 'TOOL_OBSERVATION_READY',
      evidenceReference: 'ev:unknown',
      observationStatus: 'UNKNOWN',
    },
    at(control, 104),
  );
  assert.equal(uncertain.status, 'TERMINATED');
  assert.equal(uncertain.snapshot.phase, 'ESCALATED');
  assert.equal(uncertain.snapshot.terminalReason, 'UNKNOWN_TOOL_OBSERVATION');
});

test('local model, iteration and repair limits terminate deterministically', () => {
  const control = frame();
  let modelLimited = started(control, { ...config, maxModelCalls: 1 });
  modelLimited = advance(
    modelLimited,
    { kind: 'OBSERVATION_READY', evidenceReference: 'ev:o' },
    at(control, 101),
  );
  modelLimited = advance(
    modelLimited,
    { kind: 'PLAN_READY', evidenceReference: 'ev:p', usedModel: true, disposition: 'VALIDATE' },
    at(control, 102),
  );
  modelLimited = advance(
    modelLimited,
    { kind: 'VALIDATION_READY', evidenceReference: 'ev:v', outcome: 'REPAIR' },
    at(control, 103),
  );
  const modelStop = advanceAdaptiveLoop(
    modelLimited,
    { kind: 'REPAIR_READY', evidenceReference: 'ev:r', usedModel: true, disposition: 'VALIDATE' },
    at(control, 104),
  );
  assert.equal(modelStop.snapshot.terminalReason, 'LOCAL_MODEL_CALL_LIMIT');

  let iterationLimited = started(control, { ...config, maxIterations: 1 });
  iterationLimited = advance(
    iterationLimited,
    { kind: 'OBSERVATION_READY', evidenceReference: 'ev:o2' },
    at(control, 101),
  );
  iterationLimited = advance(
    iterationLimited,
    { kind: 'PLAN_READY', evidenceReference: 'ev:p2', usedModel: false, disposition: 'VALIDATE' },
    at(control, 102),
  );
  const iterationStop = advanceAdaptiveLoop(
    iterationLimited,
    { kind: 'VALIDATION_READY', evidenceReference: 'ev:v2', outcome: 'REPAIR' },
    at(control, 103),
  );
  assert.equal(iterationStop.snapshot.terminalReason, 'LOCAL_ITERATION_LIMIT');

  let repairLimited = started(control, { ...config, maxIterations: 3, maxRepairAttempts: 1 });
  repairLimited = advance(
    repairLimited,
    { kind: 'OBSERVATION_READY', evidenceReference: 'ev:o3' },
    at(control, 101),
  );
  repairLimited = advance(
    repairLimited,
    { kind: 'PLAN_READY', evidenceReference: 'ev:p3', usedModel: false, disposition: 'VALIDATE' },
    at(control, 102),
  );
  repairLimited = advance(
    repairLimited,
    { kind: 'VALIDATION_READY', evidenceReference: 'ev:v3', outcome: 'REPAIR' },
    at(control, 103),
  );
  repairLimited = advance(
    repairLimited,
    { kind: 'REPAIR_READY', evidenceReference: 'ev:r3', usedModel: false, disposition: 'VALIDATE' },
    at(control, 104),
  );
  repairLimited = advance(
    repairLimited,
    { kind: 'VALIDATION_READY', evidenceReference: 'ev:v4', outcome: 'REPAIR' },
    at(control, 105),
  );
  const repairStop = advanceAdaptiveLoop(
    repairLimited,
    { kind: 'REPAIR_READY', evidenceReference: 'ev:r4', usedModel: false, disposition: 'VALIDATE' },
    at(control, 106),
  );
  assert.equal(repairStop.snapshot.terminalReason, 'LOCAL_REPAIR_LIMIT');
});

test('W04 budget projections constrain optional reasoning, tool planning and latency', () => {
  const degradedFrame = frame({
    budget: { ...frame().budget, state: 'DEGRADED', action: 'DEGRADE_OPTIONAL' },
  });
  assert.equal(startAdaptiveLoop({ loopId: 'loop:degraded', route: route(), config, frame: degradedFrame }).status, 'STARTED');

  const control = frame();
  let reasoning = started(control);
  reasoning = advance(reasoning, { kind: 'OBSERVATION_READY', evidenceReference: 'ev:o' }, at(control, 101));
  const noReasoning = advanceAdaptiveLoop(
    reasoning,
    { kind: 'PLAN_READY', evidenceReference: 'ev:p', usedModel: true, disposition: 'VALIDATE' },
    {
      ...at(control, 102),
      budget: { ...control.budget, remaining: { ...control.budget.remaining, reasoningUnits: 0 } },
    },
  );
  assert.equal(noReasoning.snapshot.terminalReason, 'W04_REASONING_BUDGET_EXHAUSTED');

  let tools = started(control);
  tools = advance(tools, { kind: 'OBSERVATION_READY', evidenceReference: 'ev:o2' }, at(control, 101));
  tools = advance(
    tools,
    { kind: 'PLAN_READY', evidenceReference: 'ev:p2', usedModel: false, disposition: 'TOOL_PLAN' },
    at(control, 102),
  );
  const toolStop = advanceAdaptiveLoop(
    tools,
    {
      kind: 'TOOL_PLAN_READY',
      evidenceReference: 'ev:tp2',
      plannedActions: [action(), action({ capabilityId: 'cap.write', actionType: 'write.preview', planReference: 'plan:tool:2' })],
      disposition: 'AWAIT_OBSERVATION',
    },
    {
      ...at(control, 103),
      budget: { ...control.budget, remaining: { ...control.budget.remaining, toolCalls: 1 } },
    },
  );
  assert.equal(toolStop.snapshot.terminalReason, 'W04_TOOL_BUDGET_EXHAUSTED');

  const latency = started(control);
  const latencyStop = advanceAdaptiveLoop(
    latency,
    { kind: 'OBSERVATION_READY', evidenceReference: 'ev:latency' },
    {
      ...at(control, 101),
      budget: { ...control.budget, remaining: { ...control.budget.remaining, latencyMs: 0 } },
    },
  );
  assert.equal(latencyStop.snapshot.terminalReason, 'W04_LATENCY_BUDGET_EXHAUSTED');
});

test('worker loss, reclaim generation changes and control cancellation fail closed', () => {
  const control = frame();
  const snapshot = started(control);

  const reclaimed = advanceAdaptiveLoop(
    snapshot,
    { kind: 'OBSERVATION_READY', evidenceReference: 'ev:stale-worker' },
    { ...at(control, 101), worker: worker({ generation: 2 }) },
  );
  assert.equal(reclaimed.snapshot.phase, 'FAILED');
  assert.equal(reclaimed.snapshot.terminalReason, 'WORKER_OWNERSHIP_CHANGED');

  const lost = advanceAdaptiveLoop(
    snapshot,
    { kind: 'OBSERVATION_READY', evidenceReference: 'ev:lost-worker' },
    { ...at(control, 101), worker: worker({ state: 'LEASE_UNCERTAIN' }) },
  );
  assert.equal(lost.snapshot.terminalReason, 'WORKER_OWNERSHIP_CHANGED');

  const cancelled = advanceAdaptiveLoop(
    snapshot,
    { kind: 'OBSERVATION_READY', evidenceReference: 'ev:cancelled-worker' },
    { ...at(control, 101), worker: worker({ cancelRequested: true }) },
  );
  assert.equal(cancelled.snapshot.phase, 'CANCELLED');
  assert.equal(cancelled.snapshot.terminalReason, 'CANCELLED_BY_CONTROL');
});

test('tenant/correlation, registry and budget identity mismatches fail closed', () => {
  const wrongStart = frame({
    worker: worker({ tenant: otherTenant }),
  });
  assert.deepEqual(
    startAdaptiveLoop({ loopId: 'loop:wrong-context', route: route(), config, frame: wrongStart }),
    { status: 'REJECTED', code: 'INVALID_CONTROL_FRAME' },
  );

  const control = frame();
  const snapshot = started(control);
  const wrongCorrelation = advanceAdaptiveLoop(
    snapshot,
    { kind: 'OBSERVATION_READY', evidenceReference: 'ev:wrong-correlation' },
    {
      ...at(control, 101),
      worker: worker({ correlation: otherCorrelation }),
    },
  );
  assert.equal(wrongCorrelation.snapshot.terminalReason, 'CONTROL_FRAME_INVALID');

  const wrongRegistry = advanceAdaptiveLoop(
    snapshot,
    { kind: 'OBSERVATION_READY', evidenceReference: 'ev:wrong-registry' },
    {
      ...at(control, 101),
      capabilityPlan: { ...control.capabilityPlan, registryVersion: 'cap-reg:2' },
    },
  );
  assert.equal(wrongRegistry.snapshot.terminalReason, 'CONTROL_FRAME_INVALID');

  const wrongBudget = advanceAdaptiveLoop(
    snapshot,
    { kind: 'OBSERVATION_READY', evidenceReference: 'ev:wrong-budget' },
    {
      ...at(control, 101),
      budget: { ...control.budget, budgetId: 'budget:other' },
    },
  );
  assert.equal(wrongBudget.snapshot.terminalReason, 'CONTROL_FRAME_INVALID');
});

test('elapsed and retrograde time are bounded without moving snapshot time backwards', () => {
  const control = frame();
  const elapsedSnapshot = started(control, { ...config, maxElapsedMs: 5 });
  const elapsed = advanceAdaptiveLoop(
    elapsedSnapshot,
    { kind: 'OBSERVATION_READY', evidenceReference: 'ev:elapsed' },
    at(control, 106),
  );
  assert.equal(elapsed.snapshot.terminalReason, 'LOCAL_ELAPSED_LIMIT');
  assert.equal(elapsed.snapshot.lastTransitionEpochMs, 106);

  const retrogradeSnapshot = started(control);
  const retrograde = advanceAdaptiveLoop(
    retrogradeSnapshot,
    { kind: 'OBSERVATION_READY', evidenceReference: 'ev:retrograde' },
    at(control, 99),
  );
  assert.equal(retrograde.snapshot.terminalReason, 'CONTROL_FRAME_INVALID');
  assert.equal(retrograde.snapshot.lastTransitionEpochMs, retrogradeSnapshot.lastTransitionEpochMs);
});

test('explicit cancellation is terminal and terminal snapshots cannot be restarted by events', () => {
  const control = frame();
  const snapshot = started(control);
  const cancelled = advanceAdaptiveLoop(
    snapshot,
    { kind: 'CANCEL_REQUESTED', evidenceReference: 'ev:cancel' },
    at(control, 101),
  );
  assert.equal(cancelled.status, 'TERMINATED');
  assert.equal(cancelled.snapshot.phase, 'CANCELLED');

  const afterTerminal = advanceAdaptiveLoop(
    cancelled.snapshot,
    { kind: 'OBSERVATION_READY', evidenceReference: 'ev:late' },
    at(control, 102),
  );
  assert.equal(afterTerminal.status, 'REJECTED');
  assert.equal(afterTerminal.code, 'ALREADY_TERMINAL');
  assert.equal(afterTerminal.snapshot.phase, 'CANCELLED');
  assert.equal(afterTerminal.snapshot.lastEvidenceReference, 'ev:cancel');
});
