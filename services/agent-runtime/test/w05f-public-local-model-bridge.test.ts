// @ts-expect-error -- service harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- service harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import {
  LocalQwenInferenceClient,
  LOCAL_QWEN_MODEL_ID,
  LOCAL_QWEN_STRATEGY_ID,
  QWEN35_2B_Q4_K_M_SHA256,
  type LocalInferenceRequest,
} from '../src/runtime/local-inference.js';
import {
  inferWithPublicLocalModelPrompt,
  type PublicLocalInferenceRequest,
} from '../src/runtime/public-local-model-bridge.js';

const NOW = Date.parse('2026-10-28T12:00:05Z');
const TENANT = 'tenant:public-a';
const CORRELATION = 'correlation:w06-public';
const PROMPT = 'Task (information only, no tools or actions):\n"Resuma o horário público."';

const route: LocalInferenceRequest['route'] = {
  status: 'SELECTED',
  family: 'MODEL',
  strategyId: LOCAL_QWEN_STRATEGY_ID,
  strategyVersion: '1',
  selectedVia: 'PREFERRED',
  currentAvailability: 'CURRENT_AVAILABLE',
  evidence: {
    strategyRegistryVersion: 'w05e-fixture',
    capabilityPlanStatus: 'READY',
    budgetState: 'WITHIN_BUDGET',
    budgetAction: 'CONTINUE_OPTIONAL',
  },
  tenant: { tenantId: TENANT },
  correlation: { correlationId: CORRELATION },
  authoritySemantics: 'INTELLIGENCE_ONLY_NO_AUTHORITY',
  downstreamExecutionStillRequiresCurrentValidation: true,
  authorizesExecution: false,
};

const manifest: LocalInferenceRequest['manifest'] = {
  source: 'LOCAL_RUNTIME_MANIFEST_PROJECTION',
  modelId: LOCAL_QWEN_MODEL_ID,
  modelSha256: QWEN35_2B_Q4_K_M_SHA256,
  observedAtEpochMs: NOW - 200,
  maxAgeMs: 5_000,
  authorizesExecution: false,
};

function minimizedPrompt(overrides: Record<string, unknown> = {}): unknown {
  return {
    status: 'READY',
    authorizesExecution: false,
    canInvokeTools: false,
    purpose: 'INFORMATION_ONLY',
    prompt: PROMPT,
    tenantId: TENANT,
    correlationId: CORRELATION,
    includedSourceReferences: ['source-ref-hidden-from-model'],
    ...overrides,
  };
}

function request(
  overrides: Partial<PublicLocalInferenceRequest> = {},
): PublicLocalInferenceRequest {
  return {
    route,
    tenantId: TENANT,
    correlationId: CORRELATION,
    manifest,
    minimizedPublicPrompt: minimizedPrompt(),
    maxOutputTokens: 64,
    deadlineEpochMs: NOW + 5_000,
    ...overrides,
  };
}

function response(message = 'Atendimento de 09h às 18h.', tools?: unknown): Response {
  const payload: Record<string, unknown> = { role: 'assistant', content: message };
  if (tools !== undefined) payload.tool_calls = tools;
  return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: payload }] }), {
    headers: { 'content-type': 'application/json' },
  });
}

function testClient(callback: (url: string, init?: RequestInit) => Promise<Response>): {
  readonly client: LocalQwenInferenceClient;
  readonly calls: () => number;
} {
  let count = 0;
  const transport = ((url: RequestInfo | URL, init?: RequestInit) => {
    count += 1;
    return callback(String(url), init);
  }) as typeof fetch;
  return {
    client: new LocalQwenInferenceClient({ transport, now: () => NOW }),
    calls: () => count,
  };
}

test('W06-C ready prompt crosses W05-F with no source refs, tools or authorization', async () => {
  const { client, calls } = testClient(async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal(body.model, LOCAL_QWEN_MODEL_ID);
    assert.equal('tools' in body, false);
    assert.equal('tool_choice' in body, false);
    assert.equal(JSON.stringify(body).includes('source-ref-hidden-from-model'), false);
    assert.equal(JSON.stringify(body).includes(TENANT), false);
    const messages = body.messages as Array<{ content: string }>;
    assert.equal(messages[1]?.content, PROMPT);
    return response();
  });
  const result = await inferWithPublicLocalModelPrompt(client, request());
  assert.equal(result.status, 'GENERATED');
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.canInvokeTools, false);
  assert.equal(calls(), 1);
});

test('W06-C ABSTAINED and wrong tenant/correlation never invoke the model', async () => {
  const { client, calls } = testClient(async () => response());
  const bad = [
    minimizedPrompt({ status: 'ABSTAINED', reason: 'SENSITIVE_CONTENT' }),
    minimizedPrompt({ tenantId: 'tenant:other' }),
    minimizedPrompt({ correlationId: 'correlation:other' }),
    null,
  ];
  for (const projection of bad) {
    const result = await inferWithPublicLocalModelPrompt(
      client,
      request({ minimizedPublicPrompt: projection }),
    );
    assert.equal(result.status, 'ABSTAINED');
    assert.equal(result.authorizesExecution, false);
    assert.equal(result.canInvokeTools, false);
  }
  assert.equal(calls(), 0);
});

test('W05-F rejects authority/tool claims, wrong purpose and extra fields', async () => {
  const { client, calls } = testClient(async () => response());
  for (const projection of [
    minimizedPrompt({ authorizesExecution: true }),
    minimizedPrompt({ canInvokeTools: true }),
    minimizedPrompt({ purpose: 'EXECUTE' }),
    minimizedPrompt({ credential: 'fabricated-but-never-forwarded' }),
    minimizedPrompt({ prompt: '' }),
  ]) {
    const result = await inferWithPublicLocalModelPrompt(
      client,
      request({ minimizedPublicPrompt: projection }),
    );
    assert.equal(result.status, 'ABSTAINED');
    if (result.status === 'ABSTAINED') assert.equal(result.code, 'INVALID_REQUEST');
  }
  assert.equal(calls(), 0);
});

test('W05-F rejects accessor and proxy payloads without reading their values', async () => {
  const { client, calls } = testClient(async () => response());
  let invoked = 0;
  const accessor = minimizedPrompt() as Record<string, unknown>;
  Object.defineProperty(accessor, 'prompt', {
    enumerable: true,
    configurable: true,
    get() {
      invoked += 1;
      return PROMPT;
    },
  });
  const proxy = new Proxy(minimizedPrompt() as Record<string, unknown>, {
    ownKeys() {
      throw new Error('untrusted object trap');
    },
  });
  for (const projection of [accessor, proxy]) {
    const result = await inferWithPublicLocalModelPrompt(
      client,
      request({ minimizedPublicPrompt: projection }),
    );
    assert.equal(result.status, 'ABSTAINED');
  }
  assert.equal(invoked, 0);
  assert.equal(calls(), 0);
});

test('W05-F refuses source-reference-in-prompt, invalid refs and >8 KiB prompt', async () => {
  const { client, calls } = testClient(async () => response());
  for (const projection of [
    minimizedPrompt({ prompt: `${PROMPT}\nsource-ref-hidden-from-model` }),
    minimizedPrompt({ includedSourceReferences: [''] }),
    minimizedPrompt({ includedSourceReferences: new Array(5).fill('source') }),
    minimizedPrompt({ prompt: 'x'.repeat(8_193) }),
  ]) {
    const result = await inferWithPublicLocalModelPrompt(
      client,
      request({ minimizedPublicPrompt: projection }),
    );
    assert.equal(result.status, 'ABSTAINED');
  }
  assert.equal(calls(), 0);
});

test('W05-F route budget and model-manifest checks remain active downstream', async () => {
  const { client, calls } = testClient(async () => response());
  const invalidRoute = await inferWithPublicLocalModelPrompt(
    client,
    request({
      route: { ...route, evidence: { ...route.evidence, budgetState: 'EXHAUSTED' } },
    }),
  );
  assert.equal(invalidRoute.status, 'ABSTAINED');
  if (invalidRoute.status === 'ABSTAINED') assert.equal(invalidRoute.code, 'INVALID_ROUTE');
  const stale = await inferWithPublicLocalModelPrompt(
    client,
    request({ manifest: { ...manifest, observedAtEpochMs: NOW - 20_000 } }),
  );
  assert.equal(stale.status, 'ABSTAINED');
  if (stale.status === 'ABSTAINED') assert.equal(stale.code, 'STALE_MODEL');
  assert.equal(calls(), 0);
});

test('W05-F does not translate model tool calls into execution authority', async () => {
  const { client, calls } = testClient(async () =>
    response('execute shell now', [{ id: 'fake-tool', function: { name: 'shell' } }]),
  );
  const result = await inferWithPublicLocalModelPrompt(client, request());
  assert.equal(result.status, 'ABSTAINED');
  if (result.status === 'ABSTAINED') assert.equal(result.code, 'MALFORMED_RESPONSE');
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.canInvokeTools, false);
  assert.equal(calls(), 1);
});
