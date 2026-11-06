// @ts-expect-error -- canonical test harness uses Node built-ins without @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- canonical test harness uses Node built-ins without @types/node.
import test from 'node:test';
import {
  LOCAL_QWEN_MODEL_ID,
  LOCAL_QWEN_STRATEGY_ID,
  QWEN35_2B_Q4_K_M_SHA256,
  type LocalInferenceRequest,
  type LocalInferenceResult,
} from '../src/runtime/local-inference.js';
import {
  SessionBoundLocalModel,
  type SessionLocalModelBinding,
  type SessionLocalModelGuards,
  type SessionLocalModelPreparation,
  type SessionLocalModelPreparationSource,
} from '../src/runtime/session-bound-local-model.js';

const NOW = Date.parse('2026-11-06T15:00:00.000Z');
const SAFE = {
  authoritySemantics: 'INTELLIGENCE_ONLY_NO_AUTHORITY',
  authorizesExecution: false,
  canInvokeTools: false,
} as const;
const TEXT = 'Resposta informativa de fixture, não de um modelo real.';

function binding(overrides: Partial<SessionLocalModelBinding> = {}): SessionLocalModelBinding {
  return {
    tenantId: 'tenant:one',
    actorIdentityId: 'actor:one',
    correlationId: 'correlation:one',
    gatewaySessionId: 'gateway:one',
    connectionId: 'connection:one',
    gatewayGeneration: 1,
    deviceSessionId: 'device-session:one',
    deviceId: 'device:one',
    registrationVersion: 1,
    requestId: 'request:one',
    deadlineMs: NOW + 1_000,
    ...overrides,
  };
}

function generated(): LocalInferenceResult {
  return {
    ...SAFE,
    status: 'GENERATED',
    content: TEXT,
    strategyId: LOCAL_QWEN_STRATEGY_ID,
    modelSha256: QWEN35_2B_Q4_K_M_SHA256,
  };
}

function preparation(bound: SessionLocalModelBinding): SessionLocalModelPreparation {
  return {
    kind: 'W05_W06_SESSION_LOCAL_MODEL_PREPARATION',
    binding: { ...bound },
    preparationRef: 'preparation:one',
    observedAtEpochMs: NOW,
    expiresAtEpochMs: Math.min(bound.deadlineMs, NOW + 900),
    route: {
      status: 'SELECTED',
      family: 'MODEL',
      strategyId: LOCAL_QWEN_STRATEGY_ID,
      strategyVersion: '1.0.0',
      selectedVia: 'PREFERRED',
      currentAvailability: 'CURRENT_AVAILABLE',
      evidence: {
        strategyRegistryVersion: 'fixture:v1',
        capabilityPlanStatus: 'READY',
        budgetState: 'WITHIN_BUDGET',
        budgetAction: 'CONTINUE_OPTIONAL',
      },
      tenant: { tenantId: bound.tenantId },
      correlation: { correlationId: bound.correlationId },
      authoritySemantics: 'INTELLIGENCE_ONLY_NO_AUTHORITY',
      downstreamExecutionStillRequiresCurrentValidation: true,
      authorizesExecution: false,
    },
    manifest: {
      source: 'LOCAL_RUNTIME_MANIFEST_PROJECTION',
      modelId: LOCAL_QWEN_MODEL_ID,
      modelSha256: QWEN35_2B_Q4_K_M_SHA256,
      observedAtEpochMs: NOW,
      maxAgeMs: 10_000,
      authorizesExecution: false,
    },
    minimizedPublicPrompt: {
      status: 'READY',
      authorizesExecution: false,
      canInvokeTools: false,
      purpose: 'INFORMATION_ONLY',
      prompt: 'Informação pública de fixture.',
      tenantId: bound.tenantId,
      correlationId: bound.correlationId,
      includedSourceReferences: ['source:one'],
    },
    maxOutputTokens: 64,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
async function until(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) return;
    await tick();
  }
  throw new Error('fixture failed to reach the expected checkpoint');
}

function code(result: LocalInferenceResult): string {
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.canInvokeTools, false);
  assert.equal(result.authoritySemantics, SAFE.authoritySemantics);
  return result.status === 'ABSTAINED' ? result.code : 'GENERATED';
}

function harness() {
  const state = {
    now: NOW,
    preparationCalls: 0,
    sourceChecks: 0,
    sourceSyncChecks: 0,
    sessionChecks: 0,
    clientCalls: 0,
    sourceCurrent: true,
    sessionCurrent: true,
    bound: null as SessionLocalModelBinding | null,
    requests: [] as LocalInferenceRequest[],
    releaseGuard: null as ((now: number) => boolean) | null,
  };
  const source: SessionLocalModelPreparationSource = {
    async prepareCurrent(bound) {
      state.preparationCalls += 1;
      state.bound = bound;
      return preparation(bound);
    },
    async revalidateCurrent() {
      state.sourceChecks += 1;
      return state.sourceCurrent;
    },
    isCurrent() {
      state.sourceSyncChecks += 1;
      return state.sourceCurrent;
    },
  };
  const client = {
    async infer(request: LocalInferenceRequest): Promise<LocalInferenceResult> {
      state.clientCalls += 1;
      state.requests.push(request);
      return generated();
    },
  };
  const session: SessionLocalModelGuards = {
    async revalidateCurrent() {
      state.sessionChecks += 1;
      return state.sessionCurrent;
    },
    isCurrent: () => state.sessionCurrent,
    registerReleaseGuard: (guard) => {
      state.releaseGuard = guard;
    },
  };
  const dependencies = { client, source, now: () => state.now };
  const model = new SessionBoundLocalModel(dependencies);
  const controller = new AbortController();
  const run = (input = binding()) => model.infer(input, controller.signal, session);
  return { state, source, client, session, dependencies, model, controller, run };
}

test('composes a bound PUBLIC preparation with the existing bridge and revalidates before dispatch/release', async () => {
  const h = harness();
  assert.equal(code(await h.run()), 'GENERATED');
  assert.equal(h.state.preparationCalls, 1);
  assert.equal(h.state.sourceChecks, 2);
  assert.equal(h.state.sessionChecks, 2);
  assert.equal(h.state.clientCalls, 1);
  assert.equal(Object.isFrozen(h.state.bound), true);
  assert.equal(h.state.requests[0]?.deadlineEpochMs, NOW + 900);
  assert.deepEqual(
    Object.keys(h.state.requests[0] ?? {}).sort(),
    [
      'route',
      'tenantId',
      'correlationId',
      'manifest',
      'prompt',
      'maxOutputTokens',
      'deadlineEpochMs',
      'signal',
    ].sort(),
  );
  assert.equal(JSON.stringify(h.state.requests[0]).includes('preparation:one'), false);
  assert.equal(JSON.stringify(h.state.requests[0]).includes('source:one'), false);
  assert.equal(code(await h.run(binding({ requestId: 'request:two' }))), 'GENERATED');
});

test('missing or unavailable trusted producer abstains without inference or session approval', async () => {
  const h = harness();
  const missing = new SessionBoundLocalModel({ client: h.client, now: h.dependencies.now });
  assert.equal(code(await missing.infer(binding(), h.controller.signal, h.session)), 'UNAVAILABLE');
  h.source.prepareCurrent = async () => null;
  assert.equal(code(await h.run()), 'UNAVAILABLE');
  assert.equal(h.state.clientCalls, 0);
  assert.equal(h.state.sessionChecks, 0);
});

test('rejects added approval/prompt fields and never reads a binding getter', async () => {
  const h = harness();
  for (const field of ['prompt', 'policyToken', 'consent', 'authorizesExecution']) {
    assert.equal(
      code(await h.run({ ...binding(), [field]: true } as SessionLocalModelBinding)),
      'INVALID_REQUEST',
    );
  }
  let reads = 0;
  const unsafe = {
    ...binding(),
    get actorIdentityId() {
      reads += 1;
      return 'actor:one';
    },
  };
  assert.equal(code(await h.run(unsafe)), 'INVALID_REQUEST');
  assert.equal(reads, 0);
  assert.equal(h.state.preparationCalls, 0);
});

test('contains throwing/revoked proxies and fake AbortSignals before producer access', async () => {
  const h = harness();
  const hostile = new Proxy(binding(), {
    ownKeys() {
      throw new Error('PRIVATE_SENTINEL');
    },
  });
  assert.equal(code(await h.run(hostile)), 'INVALID_REQUEST');
  const revoked = Proxy.revocable(binding(), {});
  revoked.revoke();
  assert.equal(code(await h.run(revoked.proxy)), 'INVALID_REQUEST');
  let reads = 0;
  const fakeSignal = {
    get aborted() {
      reads += 1;
      return false;
    },
  } as AbortSignal;
  assert.equal(code(await h.model.infer(binding(), fakeSignal, h.session)), 'INVALID_REQUEST');
  assert.equal(reads, 0);
  assert.equal(h.state.preparationCalls, 0);
});

test('rejects invalid generation, registration, references and deadline horizons', async () => {
  const h = harness();
  for (const patch of [
    { gatewayGeneration: 0 },
    { registrationVersion: -1 },
    { actorIdentityId: '' },
    { requestId: 'x'.repeat(129) },
    { deadlineMs: NOW + 30_001 },
    { deadlineMs: Number.NaN },
  ]) {
    assert.equal(code(await h.run(binding(patch))), 'INVALID_REQUEST');
  }
  assert.equal(code(await h.run(binding({ deadlineMs: NOW }))), 'TIMEOUT');
  assert.equal(h.state.preparationCalls, 0);
});

test('pre-aborted callers never reach the producer', async () => {
  const h = harness();
  h.controller.abort();
  assert.equal(code(await h.run()), 'CANCELLED');
  assert.equal(h.state.preparationCalls, 0);
});

test('matches every bound identity/generation/request field, not tenant alone', async () => {
  for (const field of Object.keys(binding()) as Array<keyof SessionLocalModelBinding>) {
    const h = harness();
    h.source.prepareCurrent = async (bound) => {
      const original = preparation(bound);
      const old = original.binding[field];
      return {
        ...original,
        binding: {
          ...original.binding,
          [field]: typeof old === 'number' ? old + 1 : `${old}:other`,
        },
      };
    };
    assert.equal(code(await h.run()), 'INVALID_REQUEST', field);
    assert.equal(h.state.clientCalls, 0);
  }
});

test('rejects expired, future, overlong and unbound producer leases', async () => {
  const mutations = [
    { observedAtEpochMs: NOW + 1 },
    { expiresAtEpochMs: NOW },
    { observedAtEpochMs: NOW - 10_001 },
    { expiresAtEpochMs: NOW + 10_001 },
    { expiresAtEpochMs: NOW + 1_001 },
    { preparationRef: '' },
    { maxOutputTokens: 257 },
    { maxOutputTokens: 0 },
  ];
  for (const mutation of mutations) {
    const h = harness();
    h.source.prepareCurrent = async (bound) => ({ ...preparation(bound), ...mutation });
    assert.notEqual(code(await h.run()), 'GENERATED');
    assert.equal(h.state.clientCalls, 0);
  }
});

test('denied current source policy/consent or W14 revalidation prevents dispatch', async () => {
  for (const field of ['sourceCurrent', 'sessionCurrent'] as const) {
    const h = harness();
    h.state[field] = false;
    assert.equal(code(await h.run()), 'REJECTED');
    assert.equal(h.state.clientCalls, 0);
  }
});

test('rechecks source and session after generated output and discards revoked results', async () => {
  for (const field of ['sourceCurrent', 'sessionCurrent'] as const) {
    const h = harness();
    h.client.infer = async () => {
      h.state[field] = false;
      return generated();
    };
    const result = await h.run();
    assert.equal(code(result), 'REJECTED');
    assert.equal('content' in result, false);
  }
});

test('source expiry or clock rollback during generation cannot publish text', async () => {
  for (const next of [NOW + 950, NOW - 1, Number.NaN]) {
    const h = harness();
    h.client.infer = async () => {
      h.state.now = next;
      return generated();
    };
    const result = await h.run();
    assert.notEqual(code(result), 'GENERATED');
    assert.equal('content' in result, false);
  }
});

test('the existing PUBLIC prompt bridge rejects extra fields, non-READY and cross-tenant projections', async () => {
  for (const changes of [
    { status: 'ABSTAINED' },
    { tenantId: 'tenant:other' },
    { canInvokeTools: true },
    { policyToken: 'PRIVATE_SENTINEL' },
  ]) {
    const h = harness();
    h.source.prepareCurrent = async (bound) => {
      const p = preparation(bound);
      return {
        ...p,
        minimizedPublicPrompt: { ...(p.minimizedPublicPrompt as object), ...changes },
      };
    };
    assert.equal(code(await h.run()), 'INVALID_REQUEST');
    assert.equal(h.state.clientCalls, 0);
  }
});

test('snapshots producer data before asynchronous revalidation; later mutations cannot change the prompt', async () => {
  const h = harness();
  const original = preparation(binding());
  const checkpoint = deferred<boolean>();
  h.source.prepareCurrent = async () => original;
  h.source.revalidateCurrent = async () => {
    h.state.sourceChecks += 1;
    return checkpoint.promise;
  };
  const pending = h.run();
  await until(() => h.state.sourceChecks === 1);
  (original.minimizedPublicPrompt as { prompt: string }).prompt = 'MUTATED_PAYLOAD';
  checkpoint.resolve(true);
  assert.equal(code(await pending), 'GENERATED');
  assert.equal(h.state.requests[0]?.prompt, 'Informação pública de fixture.');
});

test('does not retain aliases to the caller binding or dependency container', async () => {
  const h = harness();
  const input = binding();
  const checkpoint = deferred<SessionLocalModelPreparation | null>();
  h.source.prepareCurrent = async (bound) => {
    h.state.bound = bound;
    return checkpoint.promise;
  };
  const pending = h.run(input);
  (input as { tenantId: string }).tenantId = 'tenant:replacement';
  h.dependencies.client = {
    infer: async () => {
      throw new Error('REPLACEMENT_CLIENT_MUST_NOT_RUN');
    },
  };
  assert.equal(h.state.bound?.tenantId, 'tenant:one');
  const captured = h.state.bound;
  if (captured === null) throw new Error('expected captured binding');
  checkpoint.resolve(preparation(captured));
  assert.equal(code(await pending), 'GENERATED');
});

test('rejects sparse/cyclic/accessor/symbol-bearing producer objects without reading their contents', async () => {
  for (const mode of ['getter', 'symbol', 'sparse', 'cycle']) {
    const h = harness();
    let reads = 0;
    h.source.prepareCurrent = async (bound) => {
      const p = preparation(bound);
      if (mode === 'getter')
        Object.defineProperty(p, 'manifest', {
          get() {
            reads += 1;
            throw new Error('PRIVATE_SENTINEL');
          },
        });
      if (mode === 'symbol') Object.defineProperty(p, Symbol('private'), { value: true });
      if (mode === 'sparse')
        (
          p.minimizedPublicPrompt as { includedSourceReferences: unknown }
        ).includedSourceReferences = new Array(2);
      if (mode === 'cycle') (p.minimizedPublicPrompt as { self?: unknown }).self = p;
      return p;
    };
    const result = await h.run();
    assert.notEqual(code(result), 'GENERATED');
    assert.equal(reads, 0);
    assert.equal(h.state.clientCalls, 0);
    assert.equal(JSON.stringify(result).includes('PRIVATE_SENTINEL'), false);
  }
});

test('contains producer, revalidation, session and client exceptions with no private error leakage', async () => {
  for (const location of ['producer', 'source', 'session', 'client', 'clock']) {
    const h = harness();
    const fail = async (): Promise<never> => {
      throw new Error('PRIVATE_SENTINEL');
    };
    if (location === 'producer') h.source.prepareCurrent = fail;
    if (location === 'source') h.source.revalidateCurrent = fail;
    if (location === 'client') h.client.infer = fail;
    if (location === 'clock') h.state.now = Number.NaN;
    const result = await h.model.infer(
      binding(),
      h.controller.signal,
      location === 'session' ? { ...h.session, revalidateCurrent: fail } : h.session,
    );
    assert.notEqual(code(result), 'GENERATED');
    assert.equal(JSON.stringify(result).includes('PRIVATE_SENTINEL'), false);
  }
});

test('independent cancellation resolves while a producer stalls, keeps BUSY, and discards late preparation', async () => {
  const h = harness();
  const checkpoint = deferred<SessionLocalModelPreparation | null>();
  h.source.prepareCurrent = async () => checkpoint.promise;
  const pending = h.run();
  h.controller.abort();
  assert.equal(code(await pending), 'CANCELLED');
  assert.equal(
    code(
      await h.model.infer(
        binding({ requestId: 'request:other' }),
        new AbortController().signal,
        h.session,
      ),
    ),
    'BUSY',
  );
  checkpoint.resolve(preparation(binding()));
  await tick();
  assert.equal(h.state.clientCalls, 0);
  h.source.prepareCurrent = async (bound) => preparation(bound);
  assert.equal(
    code(
      await h.model.infer(
        binding({ requestId: 'request:recovered' }),
        new AbortController().signal,
        h.session,
      ),
    ),
    'GENERATED',
  );
});

test('deadline is independent of an uncooperative producer and BUSY is retained until settlement', async () => {
  const h = harness();
  const checkpoint = deferred<SessionLocalModelPreparation | null>();
  h.source.prepareCurrent = async () => checkpoint.promise;
  const short = binding({ deadlineMs: NOW + 30 });
  assert.equal(code(await h.run(short)), 'TIMEOUT');
  assert.equal(code(await h.run()), 'BUSY');
  checkpoint.resolve(preparation(short));
  await tick();
  assert.equal(h.state.clientCalls, 0);
});

test('cancellation bounds a stalled W14 revalidation and never starts inference', async () => {
  const h = harness();
  const checkpoint = deferred<boolean>();
  let called = false;
  const pending = h.model.infer(binding(), h.controller.signal, {
    ...h.session,
    async revalidateCurrent() {
      called = true;
      return checkpoint.promise;
    },
  });
  await until(() => called);
  h.controller.abort();
  assert.equal(code(await pending), 'CANCELLED');
  checkpoint.resolve(true);
  await tick();
  assert.equal(h.state.clientCalls, 0);
});

test('cancellation during generation delivers once, discards late output and keeps unresolved work BUSY', async () => {
  const h = harness();
  const checkpoint = deferred<LocalInferenceResult>();
  h.client.infer = async () => {
    h.state.clientCalls += 1;
    return checkpoint.promise;
  };
  const pending = h.run();
  await until(() => h.state.clientCalls === 1);
  h.controller.abort();
  const result = await pending;
  assert.equal(code(result), 'CANCELLED');
  assert.equal(
    code(await h.model.infer(binding(), new AbortController().signal, h.session)),
    'BUSY',
  );
  checkpoint.resolve(generated());
  await tick();
  assert.equal(code(result), 'CANCELLED');
  assert.equal('content' in result, false);
});

test('cleans and bounds results; rejects tools, authority, malformed output and incorrect model identity', async () => {
  const bad: unknown[] = [
    { ...generated(), authorizesExecution: true },
    { ...generated(), canInvokeTools: true },
    { ...generated(), tool_calls: [] },
    { ...generated(), modelSha256: 'wrong' },
    { ...generated(), strategyId: 'wrong' },
    { ...generated(), content: '' },
    { ...generated(), content: 'x'.repeat(32_769) },
    { ...generated(), content: '\u0000' },
    { ...SAFE, status: 'ABSTAINED', code: 'PRIVATE_SENTINEL' },
  ];
  for (const value of bad) {
    const h = harness();
    h.client.infer = async () => value as LocalInferenceResult;
    const result = await h.run();
    assert.equal(code(result), 'MALFORMED_RESPONSE');
    assert.equal('content' in result, false);
    assert.equal(JSON.stringify(result).includes('PRIVATE_SENTINEL'), false);
  }
});

test('preserves bounded-client abstention without claiming underlying teardown', async () => {
  const h = harness();
  h.client.infer = async () => ({ ...SAFE, status: 'ABSTAINED', code: 'BUSY' });
  const result = await h.run();
  assert.equal(code(result), 'BUSY');
  assert.equal('quiescent' in result, false);
  assert.equal('provesExecutionSuccess' in result, false);
});

test('source revoked while the asynchronous W14 check waits never reaches inference', async () => {
  const h = harness();
  const checkpoint = deferred<boolean>();
  let waiting = false;
  h.session.revalidateCurrent = async () => {
    waiting = true;
    return checkpoint.promise;
  };
  const pending = h.run();
  await until(() => waiting);
  h.state.sourceCurrent = false;
  checkpoint.resolve(true);
  assert.equal(code(await pending), 'REJECTED');
  assert.equal(h.state.clientCalls, 0);
});

test('a resolved asynchronous W14 observation cannot replace the final synchronous W14 check', async () => {
  const h = harness();
  h.session.revalidateCurrent = async () => true;
  h.state.sessionCurrent = false;
  assert.equal(code(await h.run()), 'REJECTED');
  assert.equal(h.state.clientCalls, 0);
});

test('the registered final source guard checks the original lease and current source after core completion', async () => {
  const h = harness();
  assert.equal(code(await h.run()), 'GENERATED');
  assert.ok(h.state.releaseGuard);
  const guard = h.state.releaseGuard as (now: number) => boolean;
  assert.equal(guard(NOW), true);
  h.state.sourceCurrent = false;
  assert.equal(guard(NOW), false);
  h.state.sourceCurrent = true;
  assert.equal(guard(NOW + 950), false);
  assert.equal(guard(NOW - 1), false);
  assert.equal(guard(Number.NaN), false);
  h.source.isCurrent = () => {
    throw new Error('PRIVATE_SENTINEL');
  };
  assert.equal(guard(NOW), false);
});

test('missing, asynchronous, false and throwing synchronous source checks fail closed before inference', async () => {
  const checks: unknown[] = [
    undefined,
    async () => true,
    () => false,
    () => {
      throw new Error('PRIVATE_SENTINEL');
    },
  ];
  for (const check of checks) {
    const h = harness();
    h.source.isCurrent = check as SessionLocalModelPreparationSource['isCurrent'];
    const result = await h.run();
    assert.notEqual(code(result), 'GENERATED');
    assert.equal(h.state.clientCalls, 0);
    assert.equal(JSON.stringify(result).includes('PRIVATE_SENTINEL'), false);
  }
});

test('malformed or accessor-bearing W14 guard objects cannot become caller approvals', async () => {
  const h = harness();
  let reads = 0;
  const invalid: unknown[] = [
    null,
    () => true,
    { ...h.session, authorizesExecution: true },
    {
      ...h.session,
      get isCurrent() {
        reads += 1;
        return () => true;
      },
    },
    { ...h.session, registerReleaseGuard: true },
  ];
  for (const guards of invalid) {
    assert.equal(
      code(await h.model.infer(binding(), h.controller.signal, guards as SessionLocalModelGuards)),
      'INVALID_REQUEST',
    );
  }
  assert.equal(reads, 0);
  assert.equal(h.state.preparationCalls, 0);
});

test('a clock rollback above the request start still invalidates the source observation', async () => {
  const h = harness();
  h.source.revalidateCurrent = async () => {
    h.state.now = NOW + 10;
    return true;
  };
  h.session.revalidateCurrent = async () => {
    h.state.now = NOW + 5;
    return true;
  };
  assert.equal(code(await h.run()), 'REJECTED');
  assert.equal(h.state.clientCalls, 0);
});

test('a signal proxy revoked after initial validation cannot throw through cleanup or leave the caller pending', async () => {
  for (const phase of ['clock', 'producer']) {
    const h = harness();
    const revocable = Proxy.revocable(h.controller.signal, {});
    let clockCalls = 0;
    const model = new SessionBoundLocalModel({
      ...h.dependencies,
      now: () => {
        clockCalls += 1;
        if (phase === 'clock') revocable.revoke();
        return NOW;
      },
    });
    if (phase === 'producer')
      h.source.prepareCurrent = async (bound) => {
        revocable.revoke();
        return preparation(bound);
      };
    const result = await model.infer(binding(), revocable.proxy, h.session);
    assert.ok(clockCalls > 0, 'the signal passed the initial native validation');
    assert.equal(code(result), 'INVALID_REQUEST');
    assert.equal('content' in result, false);
  }
});

test('invalid asynchronous synchronous-check verdicts are denied without leaking native Promise rejections', async () => {
  for (const location of ['source', 'session']) {
    const h = harness();
    const invalid = (async () => {
      throw new Error('PRIVATE_SENTINEL');
    }) as unknown as () => boolean;
    if (location === 'source') h.source.isCurrent = invalid;
    else h.session.isCurrent = invalid;
    assert.equal(code(await h.run()), 'REJECTED');
    await tick();
    assert.equal(h.state.clientCalls, 0);
  }
});

test('synchronous verdict rejection never reads an arbitrary then accessor', async () => {
  const h = harness();
  let reads = 0;
  h.source.isCurrent = (() => ({
    get then() {
      reads += 1;
      throw new Error('PRIVATE_SENTINEL');
    },
  })) as unknown as () => boolean;
  assert.equal(code(await h.run()), 'REJECTED');
  assert.equal(reads, 0);
  assert.equal(h.state.clientCalls, 0);
});
