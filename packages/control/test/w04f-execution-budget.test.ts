// @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides this built-in at runtime.
import assert from 'node:assert/strict';
// @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides this built-in at runtime.
import test from 'node:test';
import type { CorrelationId, TenantId } from '../../contracts/src/ids/types.ts';
import {
  createExecutionBudget,
  deriveChildExecutionBudget,
  initialExecutionBudgetUsage,
  projectOptionalBudgetUsage,
  recordObservedBudgetUsage,
  toExecutionBudgetTelemetrySnapshot,
  type ExecutionBudget,
  type ExecutionBudgetExhaustionPolicy,
  type ExecutionBudgetUsage,
} from '../src/budget/index.ts';

const tenant = 'ten_01J00000000000000000000000' as TenantId;
const correlation = 'cor_01J00000000000000000000000' as CorrelationId;

function budget(
  exhaustionPolicy: ExecutionBudgetExhaustionPolicy = 'DEGRADE_OPTIONAL',
): ExecutionBudget {
  const created = createExecutionBudget({
    budgetId: 'budget:objective:launch',
    tenantId: tenant,
    rootCorrelationId: correlation,
    scope: 'OBJECTIVE',
    scopeId: 'objective:launch',
    limits: {
      maxLatencyMs: 10_000,
      maxCostMicros: 50_000,
      maxReasoningUnits: 100,
      maxToolCalls: 5,
      maxConcurrency: 4,
    },
    exhaustionPolicy,
    createdAt: '2026-09-01T08:00:00.000Z',
  });
  assert.equal(created.status, 'CREATED');
  if (created.status !== 'CREATED') throw new Error('test budget creation failed');
  return created.budget;
}

test('W04-F rejects malformed limits instead of creating an ambiguous budget', () => {
  const rejected = createExecutionBudget({
    budgetId: 'budget:invalid',
    tenantId: tenant,
    rootCorrelationId: correlation,
    scope: 'TASK',
    scopeId: 'task:invalid',
    limits: {
      maxLatencyMs: 0,
      maxCostMicros: 1,
      maxReasoningUnits: 1,
      maxToolCalls: 1,
      maxConcurrency: 1,
    },
    exhaustionPolicy: 'STOP_OPTIONAL',
    createdAt: '2026-09-01T08:00:00.000Z',
  });

  assert.deepEqual(rejected, { status: 'REJECTED', code: 'INVALID_LIMITS' });
});

test('W04-F permits the final budgeted unit then constrains the next optional unit', () => {
  const executionBudget = budget();
  const usage: ExecutionBudgetUsage = {
    ...initialExecutionBudgetUsage(),
    toolCalls: 4,
  };

  const finalCall = projectOptionalBudgetUsage(executionBudget, usage, { toolCalls: 1 });
  assert.equal(finalCall.status, 'FITS');
  if (finalCall.status !== 'FITS') return;
  assert.equal(finalCall.projectedUsage.toolCalls, 5);
  assert.equal(finalCall.assessment.state, 'DEGRADED');
  assert.deepEqual(finalCall.assessment.exhaustedDimensions, ['TOOL_CALLS']);
  assert.equal(finalCall.assessment.authorizesExecution, false);

  const nextCall = projectOptionalBudgetUsage(executionBudget, finalCall.projectedUsage, {
    toolCalls: 1,
  });
  assert.equal(nextCall.status, 'CONSTRAINED');
  if (nextCall.status !== 'CONSTRAINED') return;
  assert.equal(nextCall.action, 'DEGRADE_OPTIONAL');
  assert.deepEqual(nextCall.constrainedDimensions, ['TOOL_CALLS']);
  assert.equal(nextCall.mandatorySafetyValidationRequired, true);
  assert.equal(nextCall.canSkipMandatoryValidation, false);
  assert.equal(nextCall.authorizesExecution, false);
});

test('W04-F stop and hold policies constrain optional strategy without minting authority', () => {
  for (const policy of ['STOP_OPTIONAL', 'HOLD'] as const) {
    const executionBudget = budget(policy);
    const projected = projectOptionalBudgetUsage(executionBudget, initialExecutionBudgetUsage(), {
      costMicros: 50_001,
    });

    assert.equal(projected.status, 'CONSTRAINED');
    if (projected.status !== 'CONSTRAINED') continue;
    assert.equal(projected.action, policy);
    assert.deepEqual(projected.constrainedDimensions, ['COST_MICROS']);
    assert.equal(projected.mandatorySafetyValidationRequired, true);
    assert.equal(projected.canSkipMandatoryValidation, false);
    assert.equal(projected.authorizesExecution, false);
  }
});

test('W04-F records real overrun for telemetry while preserving mandatory validation', () => {
  const executionBudget = budget('STOP_OPTIONAL');
  const recorded = recordObservedBudgetUsage(executionBudget, initialExecutionBudgetUsage(), {
    elapsedLatencyMs: 10_500,
    costMicros: 60_000,
    reasoningUnits: 25,
    toolCalls: 2,
    activeConcurrency: 2,
  });

  assert.equal(recorded.status, 'RECORDED');
  if (recorded.status !== 'RECORDED') return;
  assert.equal(recorded.assessment.state, 'EXHAUSTED');
  assert.deepEqual(recorded.assessment.exhaustedDimensions, ['LATENCY_MS', 'COST_MICROS']);
  assert.equal(recorded.assessment.action, 'STOP_OPTIONAL');
  assert.equal(recorded.assessment.mandatorySafetyValidationRequired, true);
  assert.equal(recorded.assessment.canSkipMandatoryValidation, false);
  assert.equal(recorded.assessment.authorizesExecution, false);
});

test('W04-F derives child caps from remaining cumulative budget and inherited safety context', () => {
  const parent = budget();
  const parentUsage: ExecutionBudgetUsage = {
    elapsedLatencyMs: 2_000,
    costMicros: 10_000,
    reasoningUnits: 20,
    toolCalls: 1,
    activeConcurrency: 4,
    peakConcurrency: 4,
  };

  const child = deriveChildExecutionBudget(parent, parentUsage, {
    budgetId: 'budget:task:publish',
    scope: 'TASK',
    scopeId: 'task:publish',
    limits: {
      maxLatencyMs: 8_000,
      maxCostMicros: 40_000,
      maxReasoningUnits: 80,
      maxToolCalls: 4,
      maxConcurrency: 4,
    },
    createdAt: '2026-09-01T08:00:01.000Z',
  });

  assert.equal(child.status, 'DERIVED');
  if (child.status !== 'DERIVED') return;
  assert.equal(child.budget.tenantId, parent.tenantId);
  assert.equal(child.budget.rootCorrelationId, parent.rootCorrelationId);
  assert.equal(child.budget.exhaustionPolicy, parent.exhaustionPolicy);
  assert.equal(child.budget.safetyValidationInvariant, 'MANDATORY_NOT_SKIPPABLE');

  const tooWide = deriveChildExecutionBudget(parent, parentUsage, {
    budgetId: 'budget:task:too-wide',
    scope: 'TASK',
    scopeId: 'task:too-wide',
    limits: {
      maxLatencyMs: 8_001,
      maxCostMicros: 40_001,
      maxReasoningUnits: 81,
      maxToolCalls: 5,
      maxConcurrency: 5,
    },
    createdAt: '2026-09-01T08:00:01.000Z',
  });

  assert.equal(tooWide.status, 'REJECTED');
  if (tooWide.status !== 'REJECTED') return;
  assert.equal(tooWide.code, 'PARENT_BUDGET_INSUFFICIENT');
  assert.deepEqual(tooWide.constrainedDimensions, [
    'LATENCY_MS',
    'COST_MICROS',
    'REASONING_UNITS',
    'TOOL_CALLS',
    'CONCURRENCY',
  ]);
});

test('W04-F telemetry exposes bounded optimizer fields without private reasoning content', () => {
  const executionBudget = budget();
  const usage: ExecutionBudgetUsage = {
    elapsedLatencyMs: 2_500,
    costMicros: 12_500,
    reasoningUnits: 25,
    toolCalls: 2,
    activeConcurrency: 2,
    peakConcurrency: 3,
  };
  const snapshot = toExecutionBudgetTelemetrySnapshot(executionBudget, usage);

  assert.equal(snapshot.budgetVersion, '1.0.0');
  assert.equal(snapshot.utilization.latency, 0.25);
  assert.equal(snapshot.utilization.cost, 0.25);
  assert.equal(snapshot.utilization.reasoning, 0.25);
  assert.equal(snapshot.utilization.concurrency, 0.5);
  assert.equal(snapshot.usage.peakConcurrency, 3);
  assert.equal(snapshot.authorizesExecution, false);
  assert.equal(snapshot.mandatorySafetyValidationRequired, true);

  const serialized = JSON.stringify(snapshot).toLowerCase();
  assert.doesNotMatch(serialized, /chain[-_ ]?of[-_ ]?thought|reasoningcontent|promptcontent/);
});

test('W04-F rejects invalid usage deltas deterministically', () => {
  const executionBudget = budget();
  const rejected = projectOptionalBudgetUsage(executionBudget, initialExecutionBudgetUsage(), {
    toolCalls: -1,
  });
  assert.deepEqual(rejected, { status: 'REJECTED', code: 'INVALID_DELTA' });
});
