import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const reasoning = require('../dist/reasoning-level/index.js');

const tenant = { tenantId: 'ten_01K0M0M0M0M0M0M0M0M0M0M0M0' };
const correlation = { correlationId: 'cor_01K0M0M0M0M0M0M0M0M0M0M0M1' };

function classification(complexity = 'MEDIUM') {
  return {
    tenant,
    correlation,
    taskClass: 'ANALYTICAL',
    modality: 'TEXT',
    complexity,
    reversibility: 'NOT_APPLICABLE',
    riskSignals: [],
    classificationConfidence: 'HIGH',
    reasons: ['TASK_CLASS_FROM_OPERATION'],
    authoritySemantics: 'CLASSIFIER_ONLY_NO_AUTHORITY',
  };
}

function request(overrides = {}) {
  return {
    tenant,
    correlation,
    classification: classification(),
    uncertainty: 'NONE',
    ...overrides,
  };
}

function budget(overrides = {}) {
  return {
    source: 'W04_EXECUTION_BUDGET_ASSESSMENT',
    budgetId: 'bud_01K0M0M0M0M0M0M0M0M0M0M0M2',
    state: 'WITHIN_BUDGET',
    action: 'CONTINUE_OPTIONAL',
    remainingReasoningUnits: 32,
    mandatorySafetyValidationRequired: true,
    canSkipMandatoryValidation: false,
    authorizesExecution: false,
    ...overrides,
  };
}

test('W05-C publishes explicit stable L0-L5 semantics', () => {
  const expected = [
    ['L0', 0, 'DETERMINISTIC_OR_NO_REASONING'],
    ['L1', 1, 'BOUNDED_DIRECT'],
    ['L2', 2, 'STRUCTURED'],
    ['L3', 3, 'MULTI_STEP'],
    ['L4', 4, 'DEEP'],
    ['L5', 5, 'MAXIMUM_BOUNDED'],
  ];
  for (const [level, ordinal, semantic] of expected) {
    const descriptor = reasoning.describeReasoningLevel(level);
    assert.equal(descriptor.ordinal, ordinal);
    assert.equal(descriptor.semantic, semantic);
  }
});

test('fixed inputs resolve deterministically and remain non-authoritative', () => {
  const first = reasoning.resolveReasoningLevel(request());
  const second = reasoning.resolveReasoningLevel(request());
  assert.deepEqual(first, second);
  assert.equal(first.status, 'RESOLVED');
  assert.equal(first.level, 'L2');
  assert.equal(first.authorizesExecution, false);
  assert.equal(first.canSkipMandatoryValidation, false);
  assert.equal(first.mandatorySafetyValidationRequired, true);
});

test('uncertainty escalates boundedly without changing authority', () => {
  const high = reasoning.resolveReasoningLevel(request({ uncertainty: 'HIGH' }));
  assert.equal(high.status, 'RESOLVED');
  assert.equal(high.level, 'L4');
  assert.ok(high.reasons.includes('VERY_HIGH_UNCERTAINTY_ESCALATION'));
  assert.equal(high.authorizesExecution, false);

  const maximum = reasoning.resolveReasoningLevel(
    request({ classification: classification('VERY_HIGH'), uncertainty: 'UNKNOWN' }),
  );
  assert.equal(maximum.status, 'RESOLVED');
  assert.equal(maximum.level, 'L5');
});

test('W04 budget projection may degrade optional reasoning but never safety validation', () => {
  const result = reasoning.resolveReasoningLevel(
    request({
      classification: classification('HIGH'),
      budget: budget({ state: 'DEGRADED', action: 'DEGRADE_OPTIONAL', remainingReasoningUnits: 3 }),
    }),
  );
  assert.equal(result.status, 'RESOLVED');
  assert.equal(result.requestedLevel, 'L3');
  assert.equal(result.level, 'L2');
  assert.ok(result.reasons.includes('BUDGET_OPTIONAL_DEGRADATION'));
  assert.equal(result.mandatorySafetyValidationRequired, true);
  assert.equal(result.canSkipMandatoryValidation, false);
  assert.equal(result.authorizesExecution, false);
});

test('exhausted or held W04 budget does not silently choose an unsafe cheaper route', () => {
  const exhausted = reasoning.resolveReasoningLevel(
    request({ budget: budget({ state: 'EXHAUSTED', action: 'STOP_OPTIONAL', remainingReasoningUnits: 0 }) }),
  );
  assert.equal(exhausted.status, 'HELD');
  assert.ok(exhausted.reasons.includes('BUDGET_EXHAUSTED'));
  assert.equal('level' in exhausted, false);
  assert.equal(exhausted.authorizesExecution, false);

  const held = reasoning.resolveReasoningLevel(request({ budget: budget({ action: 'HOLD' }) }));
  assert.equal(held.status, 'HELD');
  assert.ok(held.reasons.includes('BUDGET_HOLD'));
});

test('budget consumer projection fails closed if W04 non-authority invariants are tampered', () => {
  assert.throws(
    () => reasoning.resolveReasoningLevel(request({ budget: budget({ authorizesExecution: true }) })),
    /invalid W04 ExecutionBudget consumer projection/,
  );
  assert.throws(
    () => reasoning.resolveReasoningLevel(request({ budget: budget({ remainingReasoningUnits: -1 }) })),
    /non-negative safe integer/,
  );
});

test('tenant and correlation mismatch fail closed', () => {
  assert.throws(
    () => reasoning.resolveReasoningLevel(request({ tenant: { tenantId: 'ten_other' } })),
    /tenant must match/,
  );
  assert.throws(
    () =>
      reasoning.resolveReasoningLevel(
        request({ correlation: { correlationId: 'cor_other' } }),
      ),
    /correlation must match/,
  );
});
