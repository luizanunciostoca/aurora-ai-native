import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const router = require('../dist/router/index.js');

const tenant = { tenantId: 'ten_01K0M0M0M0M0M0M0M0M0M0M0M0M0' };
const correlation = { correlationId: 'cor_01K0M0M0M0M0M0M0M0M0M0M0M1' };
const nowEpochMs = Date.parse('2026-09-01T22:00:00Z');

function classification(overrides = {}) {
  return {
    tenant,
    correlation,
    taskClass: 'INFORMATIONAL',
    modality: 'TEXT',
    complexity: 'TRIVIAL',
    reversibility: 'NOT_APPLICABLE',
    riskSignals: [],
    classificationConfidence: 'HIGH',
    reasons: ['TASK_CLASS_FROM_OPERATION'],
    authoritySemantics: 'CLASSIFIER_ONLY_NO_AUTHORITY',
    ...overrides,
  };
}

function reasoning(level = 'L0', overrides = {}) {
  return {
    status: 'RESOLVED',
    tenant,
    correlation,
    level,
    requestedLevel: level,
    reasons: ['TASK_NEED_FROM_COMPLEXITY'],
    mandatorySafetyValidationRequired: true,
    canSkipMandatoryValidation: false,
    authorizesExecution: false,
    ...overrides,
  };
}

function confidence(overrides = {}) {
  return {
    kind: 'CONFIDENCE_EVALUATION',
    schemaVersion: '1.0.0',
    tenant,
    correlation,
    scoreBps: 9000,
    band: 'HIGH',
    disposition: 'PROCEED_WITH_EVIDENCE',
    decomposition: {
      evidenceQualityBps: 9000,
      consistencyBps: 9000,
      coverageBps: 9000,
      freshnessBps: 9000,
      ambiguityBps: 1000,
    },
    uncertaintyReasons: [],
    calibrationInterfaceVersion: '1.0.0',
    authorizesExecution: false,
    canGrantPermission: false,
    ...overrides,
  };
}

function lane(overrides = {}) {
  return {
    source: 'W04_LANE_RESOLUTION',
    tenantId: tenant.tenantId,
    correlationId: correlation.correlationId,
    lane: 'FAST',
    mandatoryValidations: ['CURRENT_POLICY', 'CURRENT_AUTHORITY', 'EXECUTOR_PRECONDITIONS'],
    authorizesExecution: false,
    ...overrides,
  };
}

function capabilityPlan(overrides = {}) {
  return {
    source: 'W04_CAPABILITY_PLAN',
    tenantId: tenant.tenantId,
    correlationId: correlation.correlationId,
    status: 'READY',
    registryVersion: 'cap-registry:1.0.0',
    authorizesExecution: false,
    ...overrides,
  };
}

function budget(overrides = {}) {
  return {
    source: 'W04_EXECUTION_BUDGET_ASSESSMENT',
    tenantId: tenant.tenantId,
    correlationId: correlation.correlationId,
    budgetId: 'bud_01K0M0M0M0M0M0M0M0M0M0M0M2',
    state: 'WITHIN_BUDGET',
    action: 'CONTINUE_OPTIONAL',
    mandatorySafetyValidationRequired: true,
    canSkipMandatoryValidation: false,
    authorizesExecution: false,
    ...overrides,
  };
}

function strategyPort(entries = {}) {
  return {
    registryVersion: 'strategy-registry:1.0.0',
    select(criteria) {
      const entry = entries[criteria.preferredStrategyId];
      if (!entry) {
        return { status: 'NOT_SELECTED', code: 'NOT_FOUND', authorizesExecution: false };
      }
      if (entry.compatible === false) {
        return {
          status: 'NOT_SELECTED',
          code: 'NO_COMPATIBLE_AVAILABLE_STRATEGY',
          authorizesExecution: false,
        };
      }
      return {
        status: 'SELECTED',
        strategy: {
          strategyId: entry.strategyId ?? criteria.preferredStrategyId,
          semanticVersion: entry.semanticVersion ?? '1.0.0',
          kind: entry.kind,
        },
        selectedVia: entry.selectedVia ?? 'PREFERRED',
        currentAvailability: entry.currentAvailability ?? 'CURRENT_AVAILABLE',
        authorizesExecution: false,
      };
    },
  };
}

const preferences = {
  deterministic: ['strategy:deterministic'],
  model: ['strategy:model'],
  specialist: ['strategy:specialist'],
  computerUsePlanning: ['strategy:computer-use'],
  human: ['strategy:human'],
};

function request(overrides = {}) {
  return {
    tenant,
    correlation,
    classification: classification(),
    reasoning: reasoning(),
    confidence: confidence(),
    lane: lane(),
    capabilityPlan: capabilityPlan(),
    budget: budget(),
    strategies: strategyPort({
      'strategy:deterministic': { kind: 'DETERMINISTIC' },
      'strategy:model': { kind: 'MODEL' },
      'strategy:specialist': { kind: 'SPECIALIST' },
      'strategy:computer-use': { kind: 'COMPUTER_USE_PLANNING' },
      'strategy:human': { kind: 'HUMAN' },
    }),
    preferences,
    nowEpochMs,
    ...overrides,
  };
}

test('L0 selects deterministic no-AI as the lowest sufficient route', () => {
  const result = router.routeIntelligence(request());
  assert.equal(result.status, 'SELECTED');
  assert.equal(result.family, 'DETERMINISTIC');
  assert.equal(result.strategyId, 'strategy:deterministic');
  assert.ok(result.reasons.includes('DETERMINISTIC_NO_AI_PREFERRED'));
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.downstreamExecutionStillRequiresCurrentValidation, true);
});

test('risk signals prevent deterministic routing without becoming authority', () => {
  const result = router.routeIntelligence(
    request({
      classification: classification({ riskSignals: ['FINANCIAL_IMPACT'] }),
      reasoning: reasoning('L2'),
    }),
  );
  assert.equal(result.status, 'SELECTED');
  assert.equal(result.family, 'MODEL');
  assert.ok(result.reasons.includes('RISK_REQUIRES_REASONED_ROUTE'));
  assert.equal(result.authorizesExecution, false);
});

test('VERIFY and ESCALATE confidence dispositions raise the route without granting permission', () => {
  const verify = router.routeIntelligence(
    request({ confidence: confidence({ band: 'MEDIUM', disposition: 'VERIFY', scoreBps: 7000 }) }),
  );
  assert.equal(verify.status, 'SELECTED');
  assert.equal(verify.family, 'MODEL');
  assert.ok(verify.reasons.includes('CONFIDENCE_REQUIRES_VERIFICATION'));
  const escalate = router.routeIntelligence(
    request({ confidence: confidence({ band: 'LOW', disposition: 'ESCALATE', scoreBps: 4500 }) }),
  );
  assert.equal(escalate.status, 'SELECTED');
  assert.equal(escalate.family, 'SPECIALIST');
  assert.ok(escalate.reasons.includes('CONFIDENCE_REQUIRES_ESCALATION'));
  assert.equal(escalate.authorizesExecution, false);
});

test('computer-use planning is never selected on FAST lane', () => {
  const onlyComputerUse = {
    deterministic: [],
    model: [],
    specialist: [],
    computerUsePlanning: ['strategy:computer-use'],
    human: [],
  };
  const fast = router.routeIntelligence(request({ preferences: onlyComputerUse }));
  assert.equal(fast.status, 'ABSTAINED');
  assert.equal(fast.code, 'NO_COMPATIBLE_AVAILABLE_STRATEGY');
  const governed = router.routeIntelligence(
    request({
      preferences: onlyComputerUse,
      lane: lane({ lane: 'GOVERNED' }),
      reasoning: reasoning('L3'),
    }),
  );
  assert.equal(governed.status, 'SELECTED');
  assert.equal(governed.family, 'COMPUTER_USE_PLANNING');
  assert.ok(governed.reasons.includes('GOVERNED_COMPUTER_USE_ONLY'));
});

test('blocked capability, held reasoning, abstention and budget stops fail closed', () => {
  const blocked = router.routeIntelligence(
    request({ capabilityPlan: capabilityPlan({ status: 'BLOCKED' }) }),
  );
  assert.equal(blocked.status, 'ABSTAINED');
  assert.equal(blocked.code, 'CAPABILITY_PLAN_BLOCKED');
  const held = router.routeIntelligence(
    request({
      reasoning: {
        status: 'HELD',
        tenant,
        correlation,
        requestedLevel: 'L3',
        reasons: ['BUDGET_HOLD'],
        mandatorySafetyValidationRequired: true,
        canSkipMandatoryValidation: false,
        authorizesExecution: false,
      },
    }),
  );
  assert.equal(held.status, 'ABSTAINED');
  assert.equal(held.code, 'REASONING_HELD');
  assert.equal(held.recommendedEscalation, 'HUMAN');
  const abstained = router.routeIntelligence(
    request({
      confidence: confidence({ band: 'UNKNOWN', disposition: 'ABSTAIN', scoreBps: null }),
    }),
  );
  assert.equal(abstained.status, 'ABSTAINED');
  assert.equal(abstained.code, 'CONFIDENCE_ABSTAIN');
  const exhausted = router.routeIntelligence(
    request({ budget: budget({ state: 'EXHAUSTED', action: 'HOLD' }) }),
  );
  assert.equal(exhausted.status, 'ABSTAINED');
  assert.equal(exhausted.code, 'BUDGET_HOLD_OR_EXHAUSTED');
  const stopped = router.routeIntelligence(
    request({ budget: budget({ action: 'STOP_OPTIONAL' }) }),
  );
  assert.equal(stopped.status, 'ABSTAINED');
  assert.equal(stopped.code, 'OPTIONAL_INTELLIGENCE_STOPPED');
});

test('W05-E fallback/degraded results remain evidence, never execution authority', () => {
  const result = router.routeIntelligence(
    request({
      strategies: strategyPort({
        'strategy:deterministic': {
          kind: 'DETERMINISTIC',
          strategyId: 'strategy:deterministic-fallback',
          selectedVia: 'FALLBACK',
          currentAvailability: 'CURRENT_DEGRADED',
        },
      }),
      preferences: {
        deterministic: ['strategy:deterministic'],
        model: [],
        specialist: [],
        computerUsePlanning: [],
        human: [],
      },
    }),
  );
  assert.equal(result.status, 'SELECTED');
  assert.equal(result.selectedVia, 'FALLBACK');
  assert.ok(result.reasons.includes('STRATEGY_FALLBACK_USED'));
  assert.ok(result.reasons.includes('DEGRADED_STRATEGY_USED'));
  assert.equal(result.authorizesExecution, false);
});

test('tampered control/authority projections and context mismatches fail closed', () => {
  const tampered = router.routeIntelligence(request({ lane: lane({ authorizesExecution: true }) }));
  assert.equal(tampered.status, 'ABSTAINED');
  assert.equal(tampered.code, 'INVALID_CONTROL_PROJECTION');
  const crossTenant = router.routeIntelligence(
    request({ capabilityPlan: capabilityPlan({ tenantId: 'ten_other' }) }),
  );
  assert.equal(crossTenant.status, 'ABSTAINED');
  assert.equal(crossTenant.code, 'INVALID_CONTROL_PROJECTION');
});

test('L5 prefers specialist over generic model while still requiring downstream current validation', () => {
  const result = router.routeIntelligence(request({ reasoning: reasoning('L5') }));
  assert.equal(result.status, 'SELECTED');
  assert.equal(result.family, 'SPECIALIST');
  assert.equal(result.authoritySemantics, 'INTELLIGENCE_ONLY_NO_AUTHORITY');
  assert.equal(result.downstreamExecutionStillRequiresCurrentValidation, true);
  assert.equal(result.authorizesExecution, false);
});
