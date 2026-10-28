// @ts-expect-error -- service harness intentionally uses Node 22 built-ins without @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- service harness intentionally uses Node 22 built-ins without @types/node.
import { randomBytes } from 'node:crypto';
// @ts-expect-error -- service harness intentionally uses Node 22 built-ins without @types/node.
import test from 'node:test';

import {
  KeyedLocalQwenInferenceClient,
  type EphemeralLocalModelCredential,
} from '../src/runtime/keyed-local-inference.js';
import {
  LOCAL_QWEN_CHAT_ENDPOINT,
  LOCAL_QWEN_MODEL_ID,
  LOCAL_QWEN_STRATEGY_ID,
  QWEN35_2B_Q4_K_M_SHA256,
  type LocalInferenceRequest,
  type LocalInferenceResult,
  type SelectedModelRouteProjection,
} from '../src/runtime/local-inference.js';

const NOW = Date.parse('2026-10-28T11:58:00.000Z');
const TEST_ONLY_BEARER: string = randomBytes(40).toString('base64url');
const ROUTE: SelectedModelRouteProjection = {
  status: 'SELECTED',
  family: 'MODEL',
  strategyId: LOCAL_QWEN_STRATEGY_ID,
  strategyVersion: '1',
  selectedVia: 'PREFERRED',
  currentAvailability: 'CURRENT_AVAILABLE',
  evidence: {
    strategyRegistryVersion: 'keyed:lab:fixture',
    capabilityPlanStatus: 'READY',
    budgetState: 'WITHIN_BUDGET',
    budgetAction: 'CONTINUE_OPTIONAL',
  },
  tenant: { tenantId: 'test-keyed-tenant' },
  correlation: { correlationId: 'test-keyed-correlation' },
  authoritySemantics: 'INTELLIGENCE_ONLY_NO_AUTHORITY',
  downstreamExecutionStillRequiresCurrentValidation: true,
  authorizesExecution: false,
};

function request(overrides: Partial<LocalInferenceRequest> = {}): LocalInferenceRequest {
  return {
    route: ROUTE,
    tenantId: ROUTE.tenant.tenantId,
    correlationId: ROUTE.correlation.correlationId,
    manifest: {
      source: 'LOCAL_RUNTIME_MANIFEST_PROJECTION',
      modelId: LOCAL_QWEN_MODEL_ID,
      modelSha256: QWEN35_2B_Q4_K_M_SHA256,
      observedAtEpochMs: NOW - 200,
      maxAgeMs: 10_000,
      authorizesExecution: false,
    },
    prompt: 'Responda apenas OK, sem ferramentas.',
    maxOutputTokens: 24,
    deadlineEpochMs: NOW + 10_000,
    ...overrides,
  };
}

function key(
  overrides: Partial<EphemeralLocalModelCredential> = {},
): EphemeralLocalModelCredential {
  return {
    kind: 'LOCAL_MODEL_EPHEMERAL_BEARER',
    bearerToken: TEST_ONLY_BEARER,
    observedAtEpochMs: NOW - 500,
    expiresAtEpochMs: NOW + 20_000,
    authorizesExecution: false,
    canInvokeTools: false,
    ...overrides,
  };
}

function completion(body: string | object = 'OK', status = 200): Response {
  const value =
    typeof body === 'string'
      ? { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: body } }] }
      : body;
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function fakeFetch(
  implementation: (url: string, init?: RequestInit) => Promise<Response>,
): typeof fetch {
  return ((url: RequestInfo | URL, init?: RequestInit) =>
    implementation(String(url), init)) as typeof fetch;
}

function expectInformational(result: LocalInferenceResult): void {
  assert.equal(result.authoritySemantics, 'INTELLIGENCE_ONLY_NO_AUTHORITY');
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.canInvokeTools, false);
}

test('W05-F keyed client carries a fresh transient secret only in the loopback Authorization header', async () => {
  let called = 0;
  const instance = new KeyedLocalQwenInferenceClient({
    now: () => NOW,
    credentialSource: { readCurrent: async () => key() },
    transport: fakeFetch(async (url, init) => {
      called += 1;
      assert.equal(url, LOCAL_QWEN_CHAT_ENDPOINT);
      assert.equal(init?.method, 'POST');
      assert.equal(init?.redirect, 'error');
      assert.equal(init?.credentials, 'omit');
      assert.equal(init?.cache, 'no-store');
      assert.equal(init?.referrerPolicy, 'no-referrer');
      const headers = new Headers(init?.headers);
      assert.equal(headers.get('authorization'), `Bearer ${TEST_ONLY_BEARER}`);
      assert.equal(headers.get('content-type'), 'application/json');
      assert.equal(headers.has('cookie'), false);
      const sent = String(init?.body);
      assert.equal(sent.includes(TEST_ONLY_BEARER), false);
      assert.equal(sent.includes('credentialSource'), false);
      assert.equal(sent.includes('test-keyed-tenant'), false);
      assert.equal(sent.includes('test-keyed-correlation'), false);
      assert.equal(sent.includes('"tools"'), false);
      return completion();
    }),
  });
  const result = await instance.infer(request());
  assert.equal(called, 1);
  assert.equal(result.status, 'GENERATED');
  if (result.status === 'GENERATED') assert.equal(result.content, 'OK');
  assert.equal(JSON.stringify(result).includes(TEST_ONLY_BEARER), false);
  expectInformational(result);
});

test('W05-F refuses any network call without a credential source or when source returns null', async () => {
  assert.throws(() => new KeyedLocalQwenInferenceClient({} as never), /LOCAL_KEY_SOURCE_REQUIRED/);
  let requests = 0;
  const instance = new KeyedLocalQwenInferenceClient({
    now: () => NOW,
    credentialSource: { readCurrent: async () => null },
    transport: fakeFetch(async () => {
      requests += 1;
      return completion();
    }),
  });
  const result = await instance.infer(request());
  assert.equal(result.status, 'ABSTAINED');
  if (result.status === 'ABSTAINED') assert.equal(result.code, 'UNAVAILABLE');
  expectInformational(result);
  assert.equal(requests, 0);
});

test('W05-F rejects short, stale, expired, future, excessive, malformed or authority-bearing key leases', async () => {
  let networkCalls = 0;
  const invalid: unknown[] = [
    key({ bearerToken: 'too-short' }),
    key({ bearerToken: 'x'.repeat(129) }),
    key({ bearerToken: TEST_ONLY_BEARER + '!' }),
    key({ observedAtEpochMs: NOW + 1 }),
    key({ observedAtEpochMs: NOW - 10_001 }),
    key({ expiresAtEpochMs: NOW }),
    key({ expiresAtEpochMs: NOW + 120_001 }),
    key({ authorizesExecution: true as false }),
    key({ canInvokeTools: true as false }),
    { ...key(), modelHost: 'attacker.invalid' },
    {
      ...key(),
      get bearerToken() {
        throw new Error('secret accessor');
      },
    },
    Object.create({ ...key() }),
    { ...key(), kind: 'PERMISSION_TOKEN' },
  ];
  for (const candidate of invalid) {
    const instance = new KeyedLocalQwenInferenceClient({
      now: () => NOW,
      credentialSource: { readCurrent: async () => candidate as EphemeralLocalModelCredential },
      transport: fakeFetch(async () => {
        networkCalls += 1;
        return completion();
      }),
    });
    const result = await instance.infer(request());
    assert.equal(result.status, 'ABSTAINED');
    if (result.status === 'ABSTAINED') assert.equal(result.code, 'UNAVAILABLE');
    expectInformational(result);
  }
  assert.equal(networkCalls, 0);
});

test('W05-F catches credential-source errors without leaking their contents', async () => {
  let networkCalls = 0;
  const instance = new KeyedLocalQwenInferenceClient({
    now: () => NOW,
    credentialSource: {
      readCurrent: async () => {
        throw new Error(TEST_ONLY_BEARER);
      },
    },
    transport: fakeFetch(async () => {
      networkCalls += 1;
      return completion();
    }),
  });
  const result = await instance.infer(request());
  assert.equal(result.status, 'ABSTAINED');
  assert.equal(JSON.stringify(result).includes(TEST_ONLY_BEARER), false);
  assert.equal(networkCalls, 0);
  expectInformational(result);
});

test('W05-F refuses route and model SHA drift before reading a secret', async () => {
  let reads = 0;
  let networkCalls = 0;
  const instance = new KeyedLocalQwenInferenceClient({
    now: () => NOW,
    credentialSource: {
      readCurrent: async () => {
        reads += 1;
        return key();
      },
    },
    transport: fakeFetch(async () => {
      networkCalls += 1;
      return completion();
    }),
  });
  for (const invalid of [
    request({ tenantId: 'another-tenant' }),
    request({ manifest: { ...request().manifest, modelSha256: 'invalid' } }),
    request({ route: { ...ROUTE, evidence: { ...ROUTE.evidence, budgetState: 'EXHAUSTED' } } }),
  ]) {
    const result = await instance.infer(invalid);
    assert.equal(result.status, 'ABSTAINED');
  }
  assert.equal(reads, 0);
  assert.equal(networkCalls, 0);
});

test('W05-F passes back a 401 as rejection, never retries or escalates authority', async () => {
  let networkCalls = 0;
  const instance = new KeyedLocalQwenInferenceClient({
    now: () => NOW,
    credentialSource: { readCurrent: async () => key() },
    transport: fakeFetch(async () => {
      networkCalls += 1;
      return completion({ error: { code: 401 } }, 401);
    }),
  });
  const result = await instance.infer(request());
  assert.equal(result.status, 'ABSTAINED');
  if (result.status === 'ABSTAINED') assert.equal(result.code, 'REJECTED');
  assert.equal(networkCalls, 1);
  expectInformational(result);
});

test('W05-F rejects tool-call payloads even after valid bearer authentication', async () => {
  const instance = new KeyedLocalQwenInferenceClient({
    now: () => NOW,
    credentialSource: { readCurrent: async () => key() },
    transport: fakeFetch(async () =>
      completion({
        choices: [
          {
            finish_reason: 'stop',
            message: { role: 'assistant', content: 'run it', tool_calls: [{ name: 'exec' }] },
          },
        ],
      }),
    ),
  });
  const result = await instance.infer(request());
  assert.equal(result.status, 'ABSTAINED');
  if (result.status === 'ABSTAINED') assert.equal(result.code, 'MALFORMED_RESPONSE');
  expectInformational(result);
});

test('W05-F does not send a request after cancellation while credential source is pending', async () => {
  let provide: ((value: EphemeralLocalModelCredential) => void) | undefined;
  let networkCalls = 0;
  const instance = new KeyedLocalQwenInferenceClient({
    now: () => NOW,
    credentialSource: {
      readCurrent: () =>
        new Promise((resolve) => {
          provide = resolve;
        }),
    },
    transport: fakeFetch(async () => {
      networkCalls += 1;
      return completion();
    }),
  });
  const controller = new AbortController();
  const pending = instance.infer(request({ signal: controller.signal }));
  for (let i = 0; i < 50 && provide === undefined; i += 1) await Promise.resolve();
  assert.equal(typeof provide, 'function');
  controller.abort();
  provide?.(key());
  const result = await pending;
  assert.equal(result.status, 'ABSTAINED');
  if (result.status === 'ABSTAINED') assert.equal(result.code, 'CANCELLED');
  assert.equal(networkCalls, 0);
});

test('W05-F cancellation terminates a request even if the credential source never resolves', async () => {
  let sourceWasCalled = false;
  let networkCalls = 0;
  const instance = new KeyedLocalQwenInferenceClient({
    now: () => NOW,
    credentialSource: {
      readCurrent: () => {
        sourceWasCalled = true;
        return new Promise(() => undefined);
      },
    },
    transport: fakeFetch(async () => {
      networkCalls += 1;
      return completion();
    }),
  });
  const controller = new AbortController();
  const pending = instance.infer(request({ signal: controller.signal }));
  for (let i = 0; i < 50 && !sourceWasCalled; i += 1) await Promise.resolve();
  assert.equal(sourceWasCalled, true);
  controller.abort();
  const result = await Promise.race([
    pending,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('cancellation exceeded bounded test time')), 500);
    }),
  ]);
  assert.equal(result.status, 'ABSTAINED');
  if (result.status === 'ABSTAINED') assert.equal(result.code, 'CANCELLED');
  assert.equal(networkCalls, 0);
});
