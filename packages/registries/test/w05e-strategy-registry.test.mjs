import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createStrategyRegistry,
  evaluateStrategyAvailability,
  selectStrategy,
} from '../dist/strategies/index.js';

const observedAt = '2026-09-01T12:00:00.000Z';
const nowEpochMs = Date.parse('2026-09-01T12:00:10.000Z');

function strategy(overrides = {}) {
  return {
    strategyId: 'strategy:model-primary',
    semanticVersion: '1.0.0',
    kind: 'MODEL',
    name: 'Primary model strategy',
    description: 'Target-neutral intelligence strategy metadata.',
    compatibility: {
      modalities: ['TEXT'],
      taskClasses: ['PLANNING'],
      reasoningLevels: ['L2', 'L3'],
    },
    availability: {
      state: 'AVAILABLE',
      observedAt,
      maxAgeMs: 60_000,
      source: 'strategy-health:test',
    },
    fallbackStrategyIds: [],
    ...overrides,
  };
}

function created(entries) {
  const result = createStrategyRegistry('w05-e.1', entries);
  assert.equal(result.status, 'CREATED');
  return result.registry;
}

test('registry is deterministic and distinct from the capability registry', () => {
  const registry = created([
    strategy({ strategyId: 'strategy:z', name: 'Z' }),
    strategy({ strategyId: 'strategy:a', name: 'A' }),
  ]);
  assert.equal(registry.registryKind, 'AURORA_INTELLIGENCE_STRATEGY_REGISTRY');
  assert.deepEqual(
    registry.entries.map((entry) => entry.strategyId),
    ['strategy:a', 'strategy:z'],
  );
});

test('duplicate ids, missing fallbacks and fallback cycles fail closed', () => {
  assert.deepEqual(createStrategyRegistry('v1', [strategy(), strategy()]), {
    status: 'REJECTED',
    code: 'DUPLICATE_STRATEGY_ID',
    strategyId: 'strategy:model-primary',
  });

  const missing = createStrategyRegistry('v1', [
    strategy({ fallbackStrategyIds: ['strategy:missing'] }),
  ]);
  assert.equal(missing.status, 'REJECTED');
  assert.equal(missing.code, 'UNKNOWN_FALLBACK_STRATEGY');

  const cycle = createStrategyRegistry('v1', [
    strategy({ strategyId: 'strategy:a', fallbackStrategyIds: ['strategy:b'] }),
    strategy({ strategyId: 'strategy:b', fallbackStrategyIds: ['strategy:a'] }),
  ]);
  assert.equal(cycle.status, 'REJECTED');
  assert.equal(cycle.code, 'FALLBACK_CYCLE');
});

test('freshness is deterministic and future observations are stale', () => {
  const observation = strategy().availability;
  assert.equal(evaluateStrategyAvailability(observation, nowEpochMs), 'CURRENT_AVAILABLE');
  assert.equal(
    evaluateStrategyAvailability(observation, Date.parse('2026-09-01T12:02:00.000Z')),
    'STALE',
  );
  assert.equal(
    evaluateStrategyAvailability(observation, Date.parse('2026-09-01T11:59:59.000Z')),
    'STALE',
  );
});

test('selection follows explicit fallback order and never grants execution authority', () => {
  const registry = created([
    strategy({
      availability: { ...strategy().availability, state: 'UNAVAILABLE' },
      fallbackStrategyIds: ['strategy:deterministic'],
    }),
    strategy({
      strategyId: 'strategy:deterministic',
      kind: 'DETERMINISTIC',
      name: 'Deterministic fallback',
    }),
  ]);

  const result = selectStrategy(registry, {
    preferredStrategyId: 'strategy:model-primary',
    modality: 'TEXT',
    taskClass: 'PLANNING',
    reasoningLevel: 'L2',
    nowEpochMs,
  });

  assert.equal(result.status, 'SELECTED');
  assert.equal(result.strategy.strategyId, 'strategy:deterministic');
  assert.equal(result.selectedVia, 'FALLBACK');
  assert.equal(result.authorizesExecution, false);
});

test('incompatible or unknown strategy never becomes implicit permission', () => {
  const registry = created([strategy()]);
  const incompatible = selectStrategy(registry, {
    preferredStrategyId: 'strategy:model-primary',
    modality: 'IMAGE',
    taskClass: 'PLANNING',
    reasoningLevel: 'L2',
    nowEpochMs,
  });
  assert.deepEqual(incompatible, {
    status: 'NOT_SELECTED',
    code: 'NO_COMPATIBLE_AVAILABLE_STRATEGY',
    authorizesExecution: false,
  });

  const unknown = selectStrategy(registry, {
    preferredStrategyId: 'strategy:unknown',
    modality: 'TEXT',
    taskClass: 'PLANNING',
    reasoningLevel: 'L2',
    nowEpochMs,
  });
  assert.deepEqual(unknown, {
    status: 'NOT_SELECTED',
    code: 'NOT_FOUND',
    authorizesExecution: false,
  });
});

test('strategy descriptors expose no credential or executable target authority fields', () => {
  const descriptor = strategy();
  const keys = JSON.stringify(descriptor).toLowerCase();
  assert.equal(keys.includes('credential'), false);
  assert.equal(keys.includes('secret'), false);
  assert.equal(keys.includes('authority'), false);
  assert.equal(keys.includes('providerbinding'), false);
  assert.equal(keys.includes('executiontarget'), false);
});
