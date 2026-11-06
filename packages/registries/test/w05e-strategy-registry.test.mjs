import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLocalQwenStrategyDescriptor,
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

const localNow = Date.parse('2026-10-28T12:00:05.000Z');
const verifiedHealthFixture = {
  source: 'W05F_VERIFIED_LOCAL_MODEL_HEALTH',
  state: 'AVAILABLE',
  observedAt: '2026-10-28T12:00:01.000Z',
  maxAgeMs: 10_000,
  modelIntegrityVerified: true,
  endpointIdentityVerified: true,
  authorizesExecution: false,
};
const localSelection = {
  preferredStrategyId: 'aurora.local.qwen35.2b',
  modality: 'CODE',
  taskClass: 'GENERATIVE',
  reasoningLevel: 'L2',
  nowEpochMs: localNow,
};

test('local Qwen descriptor remains unselectable with no attested W05-F health projection', () => {
  const descriptor = createLocalQwenStrategyDescriptor({ nowEpochMs: localNow });
  assert.equal(descriptor.kind, 'MODEL');
  assert.equal(descriptor.availability.state, 'UNKNOWN');
  const result = selectStrategy(created([descriptor]), localSelection);
  assert.deepEqual(result, {
    status: 'NOT_SELECTED',
    code: 'NO_COMPATIBLE_AVAILABLE_STRATEGY',
    authorizesExecution: false,
  });
});

test('current verified health makes only compatible local informational CODE tasks selectable', () => {
  const descriptor = createLocalQwenStrategyDescriptor({
    nowEpochMs: localNow,
    health: verifiedHealthFixture,
  });
  assert.equal(descriptor.availability.source, 'W05F_VERIFIED_LOCAL_MODEL_HEALTH');
  assert.equal(descriptor.semanticVersion, '1');
  const registry = created([descriptor]);
  const selected = selectStrategy(registry, localSelection);
  assert.equal(selected.status, 'SELECTED');
  assert.equal(selected.strategy.strategyId, 'aurora.local.qwen35.2b');
  assert.equal(selected.authorizesExecution, false);

  for (const rejected of [
    { ...localSelection, modality: 'IMAGE' },
    { ...localSelection, taskClass: 'EXECUTION_REQUEST' },
    { ...localSelection, reasoningLevel: 'L5' },
  ]) {
    assert.equal(selectStrategy(registry, rejected).status, 'NOT_SELECTED');
  }
});

test('local Qwen refuses forged, future or stale health metadata without creating availability', () => {
  const badHealth = [
    { ...verifiedHealthFixture, modelIntegrityVerified: false },
    { ...verifiedHealthFixture, endpointIdentityVerified: false },
    { ...verifiedHealthFixture, source: 'W05F_SELF_REPORTED' },
    { ...verifiedHealthFixture, authorizesExecution: true },
    { ...verifiedHealthFixture, maxAgeMs: 100_000 },
    { ...verifiedHealthFixture, observedAt: '2026-10-28T12:00:06.000Z' },
    { ...verifiedHealthFixture, observedAt: '2026-10-28T11:59:00.000Z' },
  ];
  for (const health of badHealth) {
    const descriptor = createLocalQwenStrategyDescriptor({ nowEpochMs: localNow, health });
    assert.equal(descriptor.availability.state, 'UNKNOWN');
    assert.equal(selectStrategy(created([descriptor]), localSelection).status, 'NOT_SELECTED');
  }
});

test('unavailable Qwen takes only an explicit registered fallback without tool authority', () => {
  const descriptor = createLocalQwenStrategyDescriptor({
    nowEpochMs: localNow,
    health: { ...verifiedHealthFixture, state: 'UNAVAILABLE' },
    fallbackStrategyIds: ['strategy:deterministic'],
  });
  const registry = created([
    descriptor,
    strategy({
      strategyId: 'strategy:deterministic',
      kind: 'DETERMINISTIC',
      name: 'Registered no-AI fallback',
      compatibility: { modalities: ['CODE'], taskClasses: ['GENERATIVE'], reasoningLevels: ['L2'] },
      availability: { ...strategy().availability, observedAt: '2026-10-28T12:00:00.000Z' },
    }),
  ]);
  const result = selectStrategy(registry, localSelection);
  assert.equal(result.status, 'SELECTED');
  assert.equal(result.selectedVia, 'FALLBACK');
  assert.equal(result.strategy.strategyId, 'strategy:deterministic');
  assert.equal(result.authorizesExecution, false);
});

function expectUnknownLocal(descriptor) {
  assert.equal(descriptor.availability.state, 'UNKNOWN');
  assert.equal(descriptor.availability.source, 'W05F_LOCAL_MODEL_NOT_VERIFIED');
  assert.deepEqual(descriptor.fallbackStrategyIds, []);
  assert.equal(selectStrategy(created([descriptor]), localSelection).status, 'NOT_SELECTED');
  assert.equal(JSON.stringify(descriptor).includes('private-health-marker'), false);
}

test('local Qwen rejects data accessors without invoking them or exposing their errors', () => {
  let getterReads = 0;
  const getter = () => {
    getterReads += 1;
    throw new Error('private-health-marker');
  };
  const inputs = ['nowEpochMs', 'health', 'fallbackStrategyIds'].map((field) =>
    Object.defineProperty(
      { nowEpochMs: localNow, health: verifiedHealthFixture, fallbackStrategyIds: [] },
      field,
      { get: getter },
    ),
  );
  for (const field of Object.keys(verifiedHealthFixture)) {
    inputs.push({
      nowEpochMs: localNow,
      health: Object.defineProperty({ ...verifiedHealthFixture }, field, { get: getter }),
    });
  }
  for (const input of inputs) {
    let descriptor;
    assert.doesNotThrow(() => {
      descriptor = createLocalQwenStrategyDescriptor(input);
    });
    expectUnknownLocal(descriptor);
  }
  assert.equal(getterReads, 0);
});

test('local Qwen contains revoked proxies and failing data-property reflection', () => {
  const revoke = (value) => {
    const proxy = Proxy.revocable(value, {});
    proxy.revoke();
    return proxy.proxy;
  };
  const reflectionFailure = (value) =>
    new Proxy(value, {
      getOwnPropertyDescriptor() {
        throw new Error('private-health-marker');
      },
    });
  const base = { nowEpochMs: localNow, health: verifiedHealthFixture };
  for (const input of [
    revoke(base),
    reflectionFailure(base),
    { ...base, health: revoke(verifiedHealthFixture) },
    { ...base, health: reflectionFailure(verifiedHealthFixture) },
    { ...base, fallbackStrategyIds: revoke(['strategy:explicit']) },
    { ...base, fallbackStrategyIds: reflectionFailure(['strategy:explicit']) },
  ]) {
    let descriptor;
    assert.doesNotThrow(() => {
      descriptor = createLocalQwenStrategyDescriptor(input);
    });
    expectUnknownLocal(descriptor);
  }
});

test('local Qwen validates observation types before Date.parse can coerce them', () => {
  let coercions = 0;
  const observedAtObject = {
    toString() {
      coercions += 1;
      return verifiedHealthFixture.observedAt;
    },
  };
  for (const observedAtValue of [observedAtObject, Symbol('private-health-marker'), null]) {
    let descriptor;
    assert.doesNotThrow(() => {
      descriptor = createLocalQwenStrategyDescriptor({
        nowEpochMs: localNow,
        health: { ...verifiedHealthFixture, observedAt: observedAtValue },
      });
    });
    expectUnknownLocal(descriptor);
  }
  assert.equal(coercions, 0);
});

test('local Qwen rejects malformed fallback data without retaining selectable health', () => {
  let getterReads = 0;
  const accessorIds = Object.defineProperty([], '0', {
    get() {
      getterReads += 1;
      throw new Error('private-health-marker');
    },
  });
  const sparseIds = ['strategy:explicit'];
  sparseIds.length = 3;
  sparseIds[2] = 'strategy:other';
  for (const fallbackStrategyIds of [
    accessorIds,
    sparseIds,
    [null],
    'strategy:not-an-array',
    { length: 1, 0: 'strategy:not-an-array' },
  ]) {
    let descriptor;
    assert.doesNotThrow(() => {
      descriptor = createLocalQwenStrategyDescriptor({
        nowEpochMs: localNow,
        health: verifiedHealthFixture,
        fallbackStrategyIds,
      });
    });
    expectUnknownLocal(descriptor);
  }
  assert.equal(getterReads, 0);
});

test('local Qwen snapshots fallback order without invoking supplied iterators or methods', () => {
  let accessorReads = 0;
  const originalIds = ['strategy:z-first', 'strategy:a-second'];
  for (const key of [Symbol.iterator, 'map', 'some', 'entries']) {
    Object.defineProperty(originalIds, key, {
      get() {
        accessorReads += 1;
        throw new Error('private-health-marker');
      },
    });
  }
  const descriptor = createLocalQwenStrategyDescriptor({
    nowEpochMs: localNow,
    health: { ...verifiedHealthFixture, state: 'UNAVAILABLE' },
    fallbackStrategyIds: originalIds,
  });
  assert.notStrictEqual(descriptor.fallbackStrategyIds, originalIds);
  assert.deepEqual(descriptor.fallbackStrategyIds, ['strategy:z-first', 'strategy:a-second']);
  originalIds[0] = 'strategy:mutated-after-snapshot';
  assert.deepEqual(descriptor.fallbackStrategyIds, ['strategy:z-first', 'strategy:a-second']);
  const fallbacks = ['strategy:z-first', 'strategy:a-second'].map((strategyId) =>
    strategy({
      strategyId,
      kind: 'DETERMINISTIC',
      compatibility: { modalities: ['CODE'], taskClasses: ['GENERATIVE'], reasoningLevels: ['L2'] },
      availability: { ...strategy().availability, observedAt: verifiedHealthFixture.observedAt },
    }),
  );
  const result = selectStrategy(created([descriptor, ...fallbacks]), localSelection);
  assert.equal(result.status, 'SELECTED');
  assert.equal(result.strategy.strategyId, 'strategy:z-first');
  assert.equal(result.selectedVia, 'FALLBACK');
  assert.equal(result.authorizesExecution, false);
  assert.equal(accessorReads, 0);
});

test('local Qwen leaves fallback registration, duplicate and cycle decisions to the registry', () => {
  for (const [fallbackStrategyIds, expected] of [
    [['strategy:missing'], 'UNKNOWN_FALLBACK_STRATEGY'],
    [['strategy:duplicate', 'strategy:duplicate'], 'INVALID_STRATEGY'],
    [['aurora.local.qwen35.2b'], 'INVALID_STRATEGY'],
    [[''], 'INVALID_STRATEGY'],
  ]) {
    const descriptor = createLocalQwenStrategyDescriptor({
      nowEpochMs: localNow,
      health: verifiedHealthFixture,
      fallbackStrategyIds,
    });
    const result = createStrategyRegistry('w05-e:unchanged-policy', [descriptor]);
    assert.equal(result.status, 'REJECTED');
    assert.equal(result.code, expected);
  }
});

test('local Qwen ignores unconsumed metadata and captures consumed health only once', () => {
  let unusedReads = 0;
  let stateReads = 0;
  const health = new Proxy(
    Object.defineProperty({ ...verifiedHealthFixture }, 'debugMetadata', {
      get() {
        unusedReads += 1;
        throw new Error('private-health-marker');
      },
    }),
    {
      getOwnPropertyDescriptor(target, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        if (key === 'state') {
          stateReads += 1;
          return { ...descriptor, value: stateReads === 1 ? 'AVAILABLE' : 'UNAVAILABLE' };
        }
        return descriptor;
      },
    },
  );
  const input = Object.defineProperty({ nowEpochMs: localNow, health }, 'debugMetadata', {
    get() {
      unusedReads += 1;
      throw new Error('private-health-marker');
    },
  });
  const descriptor = createLocalQwenStrategyDescriptor(input);
  assert.equal(descriptor.availability.state, 'AVAILABLE');
  assert.equal(selectStrategy(created([descriptor]), localSelection).status, 'SELECTED');
  assert.equal(stateReads, 1);
  assert.equal(unusedReads, 0);
  assert.equal(JSON.stringify(descriptor).includes('private-health-marker'), false);
});

test('mutating one unverified Qwen observation cannot promote another descriptor without health', () => {
  const first = createLocalQwenStrategyDescriptor({ nowEpochMs: localNow });
  const before = { ...first.availability };
  try {
    Object.assign(first.availability, {
      state: 'AVAILABLE',
      observedAt: verifiedHealthFixture.observedAt,
      maxAgeMs: 10_000,
      source: 'test-only-descriptor-mutation',
    });
    const next = createLocalQwenStrategyDescriptor({ nowEpochMs: localNow });
    expectUnknownLocal(next);
    assert.notStrictEqual(next.availability, first.availability);
  } finally {
    Object.assign(first.availability, before);
  }
});
