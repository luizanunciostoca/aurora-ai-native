// @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides this built-in at runtime.
import assert from 'node:assert/strict';
// @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides this built-in at runtime.
import test from 'node:test';
import type { CorrelationId, TenantId } from '../../contracts/src/ids/types.ts';
import { resolvePlanningLane, type LaneResolutionInput } from '../src/lanes/index.ts';

const tenantId = 'ten_01J00000000000000000000000' as TenantId;
const correlationId = 'cor_01J00000000000000000000000' as CorrelationId;

function input(overrides: Partial<LaneResolutionInput> = {}): LaneResolutionInput {
  return {
    taskId: 'task:publish-preview',
    tenantId,
    correlationId,
    riskClass: 'LOW',
    sideEffectClass: 'READ_ONLY',
    reversibility: 'REVERSIBLE',
    complexity: 'DETERMINISTIC',
    capabilityPlanStatus: 'READY',
    approvalRequired: false,
    stepUpRequired: false,
    ...overrides,
  };
}

test('W04-E selects FAST only for bounded low-risk work and never grants execution authority', () => {
  const decision = resolvePlanningLane(input());
  assert.equal(decision.lane, 'FAST');
  assert.deepEqual(decision.reasons, ['FAST_ELIGIBLE']);
  assert.equal(decision.preferredPlanningStrategy, 'DETERMINISTIC');
  assert.equal(decision.authorizesExecution, false);
  assert.deepEqual(decision.mandatoryValidations, [
    'CURRENT_POLICY',
    'CURRENT_AUTHORITY',
    'EXECUTOR_PRECONDITIONS',
  ]);
});

test('W04-E allows template preference without turning lane selection into authority', () => {
  const decision = resolvePlanningLane(input({ complexity: 'TEMPLATE_ELIGIBLE' }));
  assert.equal(decision.lane, 'FAST');
  assert.equal(decision.preferredPlanningStrategy, 'TEMPLATE');
  assert.equal(decision.authorizesExecution, false);
});

test('W04-E escalates high-risk, destructive and irreversible work to GOVERNED', () => {
  const decision = resolvePlanningLane(
    input({
      riskClass: 'HIGH',
      sideEffectClass: 'DESTRUCTIVE',
      reversibility: 'IRREVERSIBLE',
    }),
  );
  assert.equal(decision.lane, 'GOVERNED');
  assert.deepEqual(decision.reasons, [
    'CRITICAL_OR_HIGH_RISK',
    'DESTRUCTIVE_SIDE_EFFECT',
    'IRREVERSIBLE_OR_UNKNOWN',
  ]);
  assert.equal(decision.preferredPlanningStrategy, 'GOVERNED_REASONING');
});

test('W04-E escalates approval, step-up, adaptive complexity and blocked capability plans', () => {
  const decision = resolvePlanningLane(
    input({
      capabilityPlanStatus: 'BLOCKED',
      approvalRequired: true,
      stepUpRequired: true,
      complexity: 'ADAPTIVE',
    }),
  );
  assert.equal(decision.lane, 'GOVERNED');
  assert.deepEqual(decision.reasons, [
    'CAPABILITY_PLAN_BLOCKED',
    'APPROVAL_REQUIRED',
    'STEP_UP_REQUIRED',
    'ADAPTIVE_OR_UNKNOWN_COMPLEXITY',
  ]);
});

test('W04-E explicit evidence mirrors the deterministic selection inputs', () => {
  const decision = resolvePlanningLane(
    input({ sideEffectClass: 'EXTERNAL_SIDE_EFFECT', reversibility: 'COMPENSATABLE' }),
  );
  assert.equal(decision.lane, 'FAST');
  assert.deepEqual(decision.evidence, {
    taskId: 'task:publish-preview',
    riskClass: 'LOW',
    sideEffectClass: 'EXTERNAL_SIDE_EFFECT',
    reversibility: 'COMPENSATABLE',
    complexity: 'DETERMINISTIC',
    capabilityPlanStatus: 'READY',
    approvalRequired: false,
    stepUpRequired: false,
  });
  assert.equal(decision.authorizesExecution, false);
});
