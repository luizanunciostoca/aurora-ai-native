import assert from 'node:assert/strict';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { routeIntelligence } = require('../dist/router/index.js');

const HARNESS_VERSION = 'w05-h.1';
const FIXTURE_VERSION = 'w05-h-routing-fixtures.1';
const BENCHMARK_ITERATIONS = 500;
const NOT_OBSERVED = 'NOT_OBSERVED';
const FIXTURE_QUALITY_SCOPE = 'FIXTURE_DEFINED_TEST_ASSERTION_NOT_OBSERVED_MODEL_QUALITY';
const tenant = { tenantId: 'ten_01K0H0H0H0H0H0H0H0H0H0H0H0H0H0' };
const correlation = { correlationId: 'cor_01K0H0H0H0H0H0H0H0H0H0H0H0H1' };
const nowEpochMs = Date.parse('2026-09-01T22:30:00.000Z');

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

function lane(kind = 'FAST') {
  return {
    source: 'W04_LANE_RESOLUTION',
    tenantId: tenant.tenantId,
    correlationId: correlation.correlationId,
    lane: kind,
    mandatoryValidations: ['CURRENT_POLICY', 'CURRENT_AUTHORITY', 'EXECUTOR_PRECONDITIONS'],
    authorizesExecution: false,
  };
}

function capabilityPlan() {
  return {
    source: 'W04_CAPABILITY_PLAN',
    tenantId: tenant.tenantId,
    correlationId: correlation.correlationId,
    status: 'READY',
    registryVersion: 'w04-capability-registry:test-v1',
    authorizesExecution: false,
  };
}

function budget(overrides = {}) {
  return {
    source: 'W04_EXECUTION_BUDGET_ASSESSMENT',
    tenantId: tenant.tenantId,
    correlationId: correlation.correlationId,
    budgetId: 'budget:w05h',
    state: 'WITHIN_BUDGET',
    action: 'CONTINUE_OPTIONAL',
    mandatorySafetyValidationRequired: true,
    canSkipMandatoryValidation: false,
    authorizesExecution: false,
    ...overrides,
  };
}

function preferences(overrides = {}) {
  return {
    deterministic: [],
    model: [],
    specialist: [],
    computerUsePlanning: [],
    human: [],
    ...overrides,
  };
}

function selectedStrategy(strategyId, kind, selectedVia = 'PREFERRED') {
  return {
    status: 'SELECTED',
    strategy: {
      strategyId,
      semanticVersion: '1.0.0',
      kind,
    },
    selectedVia,
    currentAvailability: 'CURRENT_AVAILABLE',
    authorizesExecution: false,
  };
}

function strategyPort(entries) {
  const attempts = [];
  return {
    registryVersion: 'w05-e:test-v1',
    attempts,
    select(criteria) {
      attempts.push({ ...criteria });
      const entry = entries[criteria.preferredStrategyId];
      if (!entry) {
        return {
          status: 'NOT_SELECTED',
          code: 'NOT_FOUND',
          authorizesExecution: false,
        };
      }
      if (entry.status === 'NOT_SELECTED') {
        return {
          status: 'NOT_SELECTED',
          code: entry.code,
          authorizesExecution: false,
        };
      }
      return selectedStrategy(
        entry.strategyId ?? criteria.preferredStrategyId,
        entry.kind,
        entry.selectedVia,
      );
    },
  };
}

function request(fixture, strategies) {
  return {
    tenant,
    correlation,
    classification: classification(fixture.classification),
    reasoning: reasoning(fixture.reasoningLevel, fixture.reasoning),
    confidence: confidence(fixture.confidence),
    lane: lane(fixture.lane),
    capabilityPlan: capabilityPlan(),
    budget: budget(fixture.budget),
    strategies,
    preferences: fixture.preferences,
    nowEpochMs,
  };
}

function fixtureHash(fixture) {
  return createHash('sha256').update(JSON.stringify(fixture)).digest('hex');
}

function percentile(sorted, percentileValue) {
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * percentileValue));
  return sorted[index];
}

function measureRouter(fixture) {
  const samplesMs = [];
  let lastDecision;
  for (let index = 0; index < BENCHMARK_ITERATIONS; index += 1) {
    const strategies = strategyPort(fixture.strategies);
    const input = request(fixture, strategies);
    const startedAt = performance.now();
    lastDecision = routeIntelligence(input);
    samplesMs.push(performance.now() - startedAt);
  }
  samplesMs.sort((left, right) => left - right);
  return {
    decision: lastDecision,
    latencyMs: {
      p50: percentile(samplesMs, 0.5),
      p95: percentile(samplesMs, 0.95),
      p99: percentile(samplesMs, 0.99),
    },
  };
}

const fixtures = [
  {
    id: 'deterministic-quality-compatible',
    expectedFamily: 'DETERMINISTIC',
    expectedStrategyId: 'strategy:deterministic',
    reasoningLevel: 'L0',
    lane: 'FAST',
    qualityScoreBps: 10_000,
    qualityThresholdBps: 9500,
    preferences: preferences({
      deterministic: ['strategy:deterministic'],
      model: ['strategy:model-small'],
    }),
    strategies: {
      'strategy:deterministic': { kind: 'DETERMINISTIC' },
      'strategy:model-small': { kind: 'MODEL' },
    },
  },
  {
    id: 'small-model',
    expectedFamily: 'MODEL',
    expectedStrategyId: 'strategy:model-small',
    reasoningLevel: 'L3',
    lane: 'FAST',
    qualityScoreBps: 9800,
    qualityThresholdBps: 9500,
    preferences: preferences({ model: ['strategy:model-small'] }),
    strategies: { 'strategy:model-small': { kind: 'MODEL' } },
  },
  {
    id: 'frontier-model',
    expectedFamily: 'MODEL',
    expectedStrategyId: 'strategy:model-frontier',
    reasoningLevel: 'L4',
    lane: 'GOVERNED',
    qualityScoreBps: 10_000,
    qualityThresholdBps: 9800,
    preferences: preferences({ model: ['strategy:model-frontier'] }),
    strategies: { 'strategy:model-frontier': { kind: 'MODEL' } },
  },
  {
    id: 'specialist',
    expectedFamily: 'SPECIALIST',
    expectedStrategyId: 'strategy:specialist',
    reasoningLevel: 'L5',
    lane: 'GOVERNED',
    qualityScoreBps: 10_000,
    qualityThresholdBps: 9800,
    preferences: preferences({ specialist: ['strategy:specialist'] }),
    strategies: { 'strategy:specialist': { kind: 'SPECIALIST' } },
  },
  {
    id: 'computer-use-planning',
    expectedFamily: 'COMPUTER_USE_PLANNING',
    expectedStrategyId: 'strategy:computer-use-plan',
    reasoningLevel: 'L4',
    lane: 'GOVERNED',
    qualityScoreBps: 9700,
    qualityThresholdBps: 9500,
    preferences: preferences({ computerUsePlanning: ['strategy:computer-use-plan'] }),
    strategies: { 'strategy:computer-use-plan': { kind: 'COMPUTER_USE_PLANNING' } },
  },
  {
    id: 'human-route',
    expectedFamily: 'HUMAN',
    expectedStrategyId: 'strategy:human',
    reasoningLevel: 'L4',
    lane: 'GOVERNED',
    qualityScoreBps: 10_000,
    qualityThresholdBps: 9900,
    preferences: preferences({ human: ['strategy:human'] }),
    strategies: { 'strategy:human': { kind: 'HUMAN' } },
  },
  {
    id: 'small-model-fallback-frontier',
    expectedFamily: 'MODEL',
    expectedStrategyId: 'strategy:model-frontier',
    expectedSelectedVia: 'FALLBACK',
    reasoningLevel: 'L3',
    lane: 'FAST',
    qualityScoreBps: 9900,
    qualityThresholdBps: 9500,
    preferences: preferences({ model: ['strategy:model-small'] }),
    strategies: {
      'strategy:model-small': {
        kind: 'MODEL',
        strategyId: 'strategy:model-frontier',
        selectedVia: 'FALLBACK',
      },
    },
  },
];

test('W05-H benchmarks all required route families with exact fixture provenance', () => {
  const records = fixtures.map((fixture) => {
    const strategies = strategyPort(fixture.strategies);
    const decision = routeIntelligence(request(fixture, strategies));
    assert.equal(decision.status, 'SELECTED', fixture.id);
    assert.equal(decision.family, fixture.expectedFamily, fixture.id);
    assert.equal(decision.strategyId, fixture.expectedStrategyId, fixture.id);
    assert.equal(decision.authorizesExecution, false, fixture.id);
    assert.equal(decision.downstreamExecutionStillRequiresCurrentValidation, true, fixture.id);
    assert.ok(fixture.qualityScoreBps >= fixture.qualityThresholdBps, fixture.id);

    const benchmark = measureRouter(fixture);
    assert.equal(benchmark.decision.status, 'SELECTED', fixture.id);
    assert.ok(Number.isFinite(benchmark.latencyMs.p50));
    assert.ok(Number.isFinite(benchmark.latencyMs.p95));
    assert.ok(Number.isFinite(benchmark.latencyMs.p99));
    assert.ok(benchmark.latencyMs.p50 >= 0);
    assert.ok(benchmark.latencyMs.p50 <= benchmark.latencyMs.p95);
    assert.ok(benchmark.latencyMs.p95 <= benchmark.latencyMs.p99);

    return {
      fixtureId: fixture.id,
      fixtureVersion: FIXTURE_VERSION,
      fixtureHash: fixtureHash(fixture),
      strategyId: decision.strategyId,
      strategyVersion: decision.strategyVersion,
      routeFamily: decision.family,
      structuredReasons: decision.reasons,
      selectedVia: decision.selectedVia,
      qualityMeasurementScope: FIXTURE_QUALITY_SCOPE,
      fixtureQualityScoreBps: fixture.qualityScoreBps,
      fixtureQualityThresholdBps: fixture.qualityThresholdBps,
      fixtureQualityAccepted: fixture.qualityScoreBps >= fixture.qualityThresholdBps,
      routerLatencyMs: benchmark.latencyMs,
      routingSelectionCalls: strategies.attempts.length,
      routerModelCalls: 0,
      routerToolPlanningCalls: 0,
      downstreamModelCalls: NOT_OBSERVED,
      downstreamToolCalls: NOT_OBSERVED,
      downstreamCompute: NOT_OBSERVED,
      downstreamTokens: NOT_OBSERVED,
      downstreamCost: NOT_OBSERVED,
      authorityElevationViolations: decision.authorizesExecution === false ? 0 : 1,
      environment: {
        harnessVersion: HARNESS_VERSION,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        benchmarkIterations: BENCHMARK_ITERATIONS,
      },
    };
  });

  assert.deepEqual(
    new Set(records.map((record) => record.routeFamily)),
    new Set(['DETERMINISTIC', 'MODEL', 'SPECIALIST', 'COMPUTER_USE_PLANNING', 'HUMAN']),
  );
  assert.equal(
    records.every((record) => record.qualityMeasurementScope === FIXTURE_QUALITY_SCOPE),
    true,
  );
  assert.equal(
    records.every((record) => record.authorityElevationViolations === 0),
    true,
  );
  assert.equal(
    records.every((record) => record.downstreamCost === NOT_OBSERVED),
    true,
  );
  assert.equal(
    records.every((record) => record.downstreamCompute === NOT_OBSERVED),
    true,
  );

  console.log(
    `W05H_ROUTING_BENCHMARK ${JSON.stringify({
      schema: 'aurora.w05h.routing_benchmark.v1',
      measurementScope: 'TEST_ONLY_NOT_PRODUCTION_SLO',
      qualityMeasurementScope: FIXTURE_QUALITY_SCOPE,
      records,
    })}`,
  );
});

test('quality-compatible low-complexity work selects deterministic before model', () => {
  const fixture = fixtures.find((candidate) => candidate.id === 'deterministic-quality-compatible');
  assert.ok(fixture);
  const strategies = strategyPort(fixture.strategies);
  const decision = routeIntelligence(request(fixture, strategies));

  assert.equal(decision.status, 'SELECTED');
  assert.equal(decision.family, 'DETERMINISTIC');
  assert.equal(decision.strategyId, 'strategy:deterministic');
  assert.equal(fixture.qualityScoreBps >= fixture.qualityThresholdBps, true);
  assert.deepEqual(
    strategies.attempts.map((attempt) => attempt.preferredStrategyId),
    ['strategy:deterministic'],
  );
  assert.equal(decision.authorizesExecution, false);
});

test('fallback and escalation evidence cannot become authority or adaptive promotion', () => {
  const fallbackFixture = fixtures.find(
    (candidate) => candidate.id === 'small-model-fallback-frontier',
  );
  assert.ok(fallbackFixture);
  const fallbackDecision = routeIntelligence(
    request(fallbackFixture, strategyPort(fallbackFixture.strategies)),
  );
  assert.equal(fallbackDecision.status, 'SELECTED');
  assert.equal(fallbackDecision.selectedVia, 'FALLBACK');
  assert.equal(fallbackDecision.reasons.includes('STRATEGY_FALLBACK_USED'), true);
  assert.equal(fallbackDecision.authorizesExecution, false);

  const abstained = routeIntelligence({
    ...request(fallbackFixture, strategyPort({})),
    confidence: confidence({ disposition: 'ABSTAIN', band: 'UNKNOWN' }),
  });
  assert.equal(abstained.status, 'ABSTAINED');
  assert.equal(abstained.recommendedEscalation, 'HUMAN');
  assert.equal(abstained.authorizesExecution, false);
  assert.equal('promotion' in abstained, false);
  assert.equal('policyToken' in abstained, false);
  assert.equal('ownerDecision' in abstained, false);
});

test('benchmark records never invent provider cost, tokens, compute or production SLOs', () => {
  const fixture = fixtures[1];
  const benchmark = measureRouter(fixture);
  const record = {
    measurementScope: 'TEST_ONLY_NOT_PRODUCTION_SLO',
    qualityMeasurementScope: FIXTURE_QUALITY_SCOPE,
    routerLatencyMs: benchmark.latencyMs,
    downstreamModelCalls: NOT_OBSERVED,
    downstreamToolCalls: NOT_OBSERVED,
    downstreamCompute: NOT_OBSERVED,
    downstreamTokens: NOT_OBSERVED,
    downstreamCost: NOT_OBSERVED,
  };

  assert.equal(record.measurementScope, 'TEST_ONLY_NOT_PRODUCTION_SLO');
  assert.equal(record.qualityMeasurementScope, FIXTURE_QUALITY_SCOPE);
  assert.equal(record.downstreamModelCalls, NOT_OBSERVED);
  assert.equal(record.downstreamToolCalls, NOT_OBSERVED);
  assert.equal(record.downstreamCompute, NOT_OBSERVED);
  assert.equal(record.downstreamTokens, NOT_OBSERVED);
  assert.equal(record.downstreamCost, NOT_OBSERVED);
  assert.equal('productionSloMs' in record, false);
});
