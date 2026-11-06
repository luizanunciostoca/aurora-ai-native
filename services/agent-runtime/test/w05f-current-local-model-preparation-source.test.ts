// @ts-expect-error -- canonical test harness uses Node built-ins without @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- canonical test harness uses Node built-ins without @types/node.
import test from 'node:test';
import {
  CurrentLocalModelPreparationSource,
  type CurrentLocalModelRoutingRecord,
  type CurrentPublicModelContextPreparation,
} from '../src/runtime/current-local-model-preparation-source.js';
import type { SessionLocalModelBinding } from '../src/runtime/session-bound-local-model.js';
import {
  LOCAL_QWEN_MODEL_ID,
  LOCAL_QWEN_STRATEGY_ID,
  QWEN35_2B_Q4_K_M_SHA256,
} from '../src/runtime/local-inference.js';

const NOW = Date.parse('2026-11-06T15:00:00.000Z');
const binding: SessionLocalModelBinding = {
  tenantId: 'tenant:fixture',
  actorIdentityId: 'actor:fixture',
  correlationId: 'correlation:fixture',
  gatewaySessionId: 'gateway:fixture',
  connectionId: 'connection:fixture',
  gatewayGeneration: 1,
  deviceSessionId: 'device-session:fixture',
  deviceId: 'device:fixture',
  registrationVersion: 1,
  requestId: 'request:fixture',
  deadlineMs: NOW + 5_000,
};

function record(): CurrentLocalModelRoutingRecord {
  const context = {
    tenant: { tenantId: binding.tenantId },
    correlation: { correlationId: binding.correlationId },
  };
  const control = { tenantId: binding.tenantId, correlationId: binding.correlationId };
  return {
    kind: 'CURRENT_LOCAL_MODEL_ROUTING_RECORD',
    reference: 'routing:fixture',
    binding: { ...binding },
    observedAtEpochMs: NOW,
    expiresAtEpochMs: NOW + 4_000,
    // Explicit unit-only router fixture; the one-tree proof binds the real canonical router.
    routerRequest: {
      ...context,
      classification: { ...context },
      reasoning: { ...context },
      confidence: { ...context },
      lane: { ...control },
      capabilityPlan: { ...control },
      budget: { ...control },
      preferences: {},
    },
    manifest: {
      source: 'LOCAL_RUNTIME_MANIFEST_PROJECTION',
      modelId: LOCAL_QWEN_MODEL_ID,
      modelSha256: QWEN35_2B_Q4_K_M_SHA256,
      observedAtEpochMs: NOW,
      maxAgeMs: 3_000,
      authorizesExecution: false,
    },
    maxOutputTokens: 64,
  };
}

function context(): CurrentPublicModelContextPreparation {
  return {
    kind: 'CURRENT_PUBLIC_MODEL_CONTEXT_PREPARATION',
    binding: { ...binding },
    contextRef: 'context:fixture',
    observedAtEpochMs: NOW,
    expiresAtEpochMs: NOW + 3_500,
    minimizedPublicPrompt: {
      status: 'READY',
      tenantId: binding.tenantId,
      correlationId: binding.correlationId,
      purpose: 'INFORMATION_ONLY',
      authorizesExecution: false,
      canInvokeTools: false,
      prompt: 'Texto público de fixture.',
      includedSourceReferences: ['source:fixture'],
    },
  };
}

function route() {
  return {
    status: 'SELECTED',
    family: 'MODEL',
    strategyId: LOCAL_QWEN_STRATEGY_ID,
    strategyVersion: '1.0.0',
    selectedVia: 'PREFERRED',
    currentAvailability: 'CURRENT_AVAILABLE',
    tenant: { tenantId: binding.tenantId },
    correlation: { correlationId: binding.correlationId },
    authoritySemantics: 'INTELLIGENCE_ONLY_NO_AUTHORITY',
    authorizesExecution: false,
    downstreamExecutionStillRequiresCurrentValidation: true,
    evidence: {
      strategyRegistryVersion: 'registry:v1',
      capabilityPlanStatus: 'READY',
      budgetState: 'WITHIN_BUDGET',
      budgetAction: 'CONTINUE_OPTIONAL',
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function harness() {
  const state = {
    now: NOW,
    record: record() as unknown,
    route: route() as unknown,
    context: context() as unknown,
    contextCurrent: true as unknown,
    contextCalls: 0,
    routeCalls: 0,
    revalidateCalls: 0,
    wait: null as Promise<unknown> | null,
    revalidateWait: null as Promise<boolean> | null,
    request: null as Readonly<Record<string, unknown>> | null,
  };
  const controller = new AbortController();
  const source = new CurrentLocalModelPreparationSource({
    now: () => state.now,
    routing: {
      readCurrent: () => state.record as CurrentLocalModelRoutingRecord | null,
      strategies: { registryVersion: 'registry:v1', select: () => null },
      routeIntelligence(request) {
        state.routeCalls += 1;
        state.request = request;
        return state.route;
      },
    },
    context: {
      async prepareCurrent() {
        state.contextCalls += 1;
        return (
          state.wait ? await state.wait : state.context
        ) as CurrentPublicModelContextPreparation | null;
      },
      async revalidateCurrent() {
        state.revalidateCalls += 1;
        return state.revalidateWait ? await state.revalidateWait : true;
      },
      isCurrent: () => state.contextCurrent as boolean,
    },
  });
  return {
    state,
    controller,
    source,
    prepare: () => source.prepareCurrent(binding, controller.signal),
  };
}

test('missing owner dependencies abstain without calling a router or context adapter', async () => {
  const source = new CurrentLocalModelPreparationSource({ now: () => NOW });
  assert.equal(await source.prepareCurrent(binding, new AbortController().signal), null);
  assert.equal(source.isCurrent('foreign', binding, NOW), false);
});

test('private source calls current routing and context ports and returns immutable information-only preparation', async () => {
  const h = harness();
  const result = await h.prepare();
  assert.ok(result);
  if (!result) throw new Error('expected unit preparation');
  assert.equal(result.kind, 'W05_W06_SESSION_LOCAL_MODEL_PREPARATION');
  assert.equal(result.expiresAtEpochMs, NOW + 3_500);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.binding), true);
  assert.equal(Object.isFrozen(result.route), true);
  assert.equal(result.route.authorizesExecution, false);
  assert.equal(h.state.contextCalls, 1);
  assert.ok(
    h.state.routeCalls >= 3,
    'routing must be re-read after awaited context and at release',
  );
  assert.equal(h.state.request?.nowEpochMs, NOW);
  assert.equal(typeof (h.state.request?.strategies as { select?: unknown }).select, 'function');
  assert.equal(h.source.isCurrent(result.preparationRef, binding, NOW), true);
  assert.equal(
    await h.source.revalidateCurrent(result.preparationRef, binding, NOW, h.controller.signal),
    true,
  );
});

const invalidRecords: Array<[string, (value: CurrentLocalModelRoutingRecord) => unknown]> = [
  ['missing', () => null],
  ['preselected route injection', (r) => ({ ...r, route: route() })],
  ['future observation', (r) => ({ ...r, observedAtEpochMs: NOW + 1 })],
  ['stale owner window', (r) => ({ ...r, observedAtEpochMs: NOW - 20_000 })],
  ['expired owner window', (r) => ({ ...r, expiresAtEpochMs: NOW })],
  ['beyond request deadline', (r) => ({ ...r, expiresAtEpochMs: binding.deadlineMs + 1 })],
  [
    'wrong actor binding',
    (r) => ({ ...r, binding: { ...r.binding, actorIdentityId: 'actor:other' } }),
  ],
  [
    'wrong router tenant',
    (r) => ({ ...r, routerRequest: { ...r.routerRequest, tenant: { tenantId: 'tenant:other' } } }),
  ],
  [
    'caller strategy port',
    (r) => ({ ...r, routerRequest: { ...r.routerRequest, strategies: {} } }),
  ],
  ['wrong model', (r) => ({ ...r, manifest: { ...r.manifest, modelId: 'other-model' } })],
  [
    'wrong model digest',
    (r) => ({ ...r, manifest: { ...r.manifest, modelSha256: '0'.repeat(64) } }),
  ],
  ['oversized token budget', (r) => ({ ...r, maxOutputTokens: 257 })],
];
for (const [name, mutate] of invalidRecords) {
  test('invalid routing record denies before context read: ' + name, async () => {
    const h = harness();
    h.state.record = mutate(record());
    assert.equal(await h.prepare(), null);
    assert.equal(h.state.contextCalls, 0);
  });
}

test('record getters, cycles and rejected synchronous Promises are contained without access', async () => {
  let accesses = 0;
  const withGetter = { ...record() };
  Object.defineProperty(withGetter, 'manifest', {
    get() {
      accesses += 1;
      throw new Error('must not read');
    },
  });
  const cyclic: Record<string, unknown> = { ...record() };
  cyclic.routerRequest = cyclic;
  for (const value of [withGetter, cyclic, Promise.reject(new Error('synthetic source failure'))]) {
    const h = harness();
    h.state.record = value;
    assert.equal(await h.prepare(), null);
    assert.equal(h.state.contextCalls, 0);
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(accesses, 0);
});

for (const [field, value] of [
  ['family', 'DETERMINISTIC'],
  ['status', 'ABSTAINED'],
  ['authorizesExecution', true],
  ['currentAvailability', 'CURRENT_DEGRADED'],
  ['canInvokeTools', true],
] as const) {
  test('non-compatible route does not acquire context: ' + field, async () => {
    const h = harness();
    h.state.route = { ...route(), [field]: value };
    assert.equal(await h.prepare(), null);
    assert.equal(h.state.contextCalls, 0);
  });
}

test('all eleven binding fields and the exact preparation handle are isolated', async () => {
  const h = harness();
  const result = await h.prepare();
  if (!result) throw new Error('expected preparation');
  for (const [key, value] of Object.entries(binding)) {
    const foreign = { ...binding, [key]: typeof value === 'number' ? value + 1 : value + ':other' };
    assert.equal(h.source.isCurrent(result.preparationRef, foreign, NOW), false, key);
  }
  assert.equal(h.source.isCurrent(result.preparationRef + ':foreign', binding, NOW), false);
  assert.equal(h.source.isCurrent(result.preparationRef, binding, NOW), true);
});

test('routing and manifest changes without version bumps invalidate the captured preparation', async () => {
  for (const change of [
    (r: CurrentLocalModelRoutingRecord) => ({ ...r, maxOutputTokens: 65 }),
    (r: CurrentLocalModelRoutingRecord) => ({
      ...r,
      manifest: { ...r.manifest, observedAtEpochMs: NOW - 1 },
    }),
  ]) {
    const h = harness();
    const result = await h.prepare();
    if (!result) throw new Error('expected preparation');
    h.state.record = change(record());
    assert.equal(h.source.isCurrent(result.preparationRef, binding, NOW), false);
    assert.equal(result.maxOutputTokens, 64, 'capture must not alias changed source data');
  }
});

test('current strategy unavailability invalidates an otherwise unchanged owner record', async () => {
  const h = harness();
  const result = await h.prepare();
  if (!result) throw new Error('expected preparation');
  h.state.route = { ...route(), status: 'ABSTAINED' };
  assert.equal(h.source.isCurrent(result.preparationRef, binding, NOW), false);
});

test('routing revocation during awaited context denies late preparation', async () => {
  const h = harness();
  const pending = deferred<unknown>();
  h.state.wait = pending.promise;
  const running = h.prepare();
  assert.equal(h.state.contextCalls, 1);
  h.state.record = null;
  pending.resolve(context());
  assert.equal(await running, null);
});

test('cancelled pending context remains busy until settlement, cannot publish late data, then recovers', async () => {
  const h = harness();
  const pending = deferred<unknown>();
  h.state.wait = pending.promise;
  const running = h.prepare();
  h.controller.abort();
  assert.equal(await h.source.prepareCurrent(binding, new AbortController().signal), null);
  assert.equal(h.state.contextCalls, 1);
  pending.resolve(context());
  assert.equal(await running, null);
  h.state.wait = null;
  const recovered = await h.source.prepareCurrent(binding, new AbortController().signal);
  assert.ok(recovered);
  assert.equal(h.state.contextCalls, 2);
});

test('routing changes across asynchronous revalidation are checked again before release', async () => {
  const h = harness();
  const result = await h.prepare();
  if (!result) throw new Error('expected preparation');
  const pending = deferred<boolean>();
  h.state.revalidateWait = pending.promise;
  const running = h.source.revalidateCurrent(
    result.preparationRef,
    binding,
    NOW,
    h.controller.signal,
  );
  assert.equal(h.state.revalidateCalls, 1);
  h.state.record = null;
  pending.resolve(true);
  assert.equal(await running, false);
});

test('W06 foreign binding and future/expired preparation are refused', async () => {
  for (const changed of [
    { ...context(), binding: { ...binding, actorIdentityId: 'actor:other' } },
    { ...context(), observedAtEpochMs: NOW + 1 },
    { ...context(), expiresAtEpochMs: NOW },
  ]) {
    const h = harness();
    h.state.context = changed;
    assert.equal(await h.prepare(), null);
  }
});

test('invalid synchronous W06 verdict is denied without executing a then accessor', async () => {
  let reads = 0;
  const h = harness();
  const result = await h.prepare();
  if (!result) throw new Error('expected preparation');
  h.state.contextCurrent = Object.defineProperty({}, 'then', {
    get() {
      reads += 1;
      throw new Error('unexpected then');
    },
  });
  assert.equal(h.source.isCurrent(result.preparationRef, binding, NOW), false);
  const other = harness();
  const otherResult = await other.prepare();
  if (!otherResult) throw new Error('expected separate preparation');
  other.state.contextCurrent = Promise.reject(new Error('synthetic async verdict'));
  assert.equal(other.source.isCurrent(otherResult.preparationRef, binding, NOW), false);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(reads, 0);
});

test('expired manifest, clock regression and aborted source signal all deny currentness', async () => {
  for (const mutate of [
    (h: ReturnType<typeof harness>) => {
      h.state.now = NOW + 3_001;
    },
    (h: ReturnType<typeof harness>) => {
      h.state.now = NOW - 1;
    },
    (h: ReturnType<typeof harness>) => {
      h.controller.abort();
    },
  ]) {
    const h = harness();
    const result = await h.prepare();
    if (!result) throw new Error('expected preparation');
    mutate(h);
    assert.equal(h.source.isCurrent(result.preparationRef, binding, h.state.now), false);
  }
});

test('new preparation replaces the single private capture and old handles cannot be reused', async () => {
  const h = harness();
  const first = await h.prepare();
  const second = await h.prepare();
  if (!first || !second) throw new Error('expected two serial preparations');
  assert.notEqual(first.preparationRef, second.preparationRef);
  assert.equal(h.source.isCurrent(first.preparationRef, binding, NOW), false);
  assert.equal(h.source.isCurrent(second.preparationRef, binding, NOW), true);
});

test('recovery does not resurrect a preparation after observed source revocation', async () => {
  const h = harness();
  const result = await h.prepare();
  if (!result) throw new Error('expected preparation');
  h.state.route = { ...route(), status: 'ABSTAINED' };
  assert.equal(h.source.isCurrent(result.preparationRef, binding, NOW), false);
  h.state.route = route();
  assert.equal(h.source.isCurrent(result.preparationRef, binding, NOW), false);
  const fresh = await h.prepare();
  if (!fresh) throw new Error('expected fresh preparation after recovery');
  assert.notEqual(fresh.preparationRef, result.preparationRef);
  assert.equal(h.source.isCurrent(fresh.preparationRef, binding, NOW), true);
});

test('asynchronous context rejection retires the capture but a foreign handle does not', async () => {
  const h = harness();
  const result = await h.prepare();
  if (!result) throw new Error('expected preparation');
  assert.equal(
    await h.source.revalidateCurrent('foreign', binding, NOW, h.controller.signal),
    false,
  );
  assert.equal(h.source.isCurrent(result.preparationRef, binding, NOW), true);
  h.state.revalidateWait = Promise.resolve(false);
  assert.equal(
    await h.source.revalidateCurrent(result.preparationRef, binding, NOW, h.controller.signal),
    false,
  );
  h.state.revalidateWait = null;
  assert.equal(h.source.isCurrent(result.preparationRef, binding, NOW), false);
});

test('invalid signal and extra binding keys are rejected before owner reads', async () => {
  const h = harness();
  assert.equal(await h.source.prepareCurrent(binding, {} as AbortSignal), null);
  assert.equal(
    await h.source.prepareCurrent(
      { ...binding, approval: true } as SessionLocalModelBinding,
      h.controller.signal,
    ),
    null,
  );
  assert.equal(h.state.routeCalls, 0);
  assert.equal(h.state.contextCalls, 0);
});
