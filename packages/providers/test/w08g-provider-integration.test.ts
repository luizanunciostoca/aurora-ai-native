// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { ContractVersion } from '@aurora/contracts/versioning';

import type { ProviderBindingRecord } from '../src/bindings/index.js';
import type { SecretReferenceRecord } from '../src/credentials/index.js';
import {
  createSafeProviderMock,
  executeSafeProviderReadIntegration,
  executeSafeProviderWriteIntegration,
  type ProviderCapabilitySupportBinding,
  type W04CapabilityPlanProjection,
} from '../src/integration/index.js';
import type { ProviderWriteIntegrationRequest } from '../src/integration/types.js';
import type { W07ProviderExecutionProof } from '../src/write/index.js';

interface NestedTestContext {
  test(name: string, fn: () => Promise<void>): Promise<void>;
}

const VERSION = '1.0.0' as ContractVersion;
const NOW = '2026-09-03T08:00:00Z' as Rfc3339Timestamp;
const CREDENTIAL = ['fixture', 'transient', 'w08g', 'credential'].join('-');
const TENANT_ID = 'ten_01JTESTW08GTENANT0000000000';
const CORRELATION_ID = 'cor_01JTESTW08GCORRELATION00000';
const PROVIDER_BINDING_REFERENCE = 'provider-binding-fixture-meta-act-123';
const W04_BINDING_ID = 'cap-binding-fixture-meta-ads';

function binding(overrides: Partial<ProviderBindingRecord> = {}): ProviderBindingRecord {
  return {
    kind: 'ProviderBindingRecord',
    schemaVersion: VERSION,
    bindingReference: PROVIDER_BINDING_REFERENCE,
    tenant: { tenantId: TENANT_ID as ProviderBindingRecord['tenant']['tenantId'] },
    provider: 'META',
    accountReference: 'fixture_act_123' as ProviderBindingRecord['accountReference'],
    targetType: 'AD',
    targetReference: 'fixture_ad_456' as NonNullable<ProviderBindingRecord['targetReference']>,
    state: 'ACTIVE',
    verificationState: 'VERIFIED',
    bindingVersion: 7,
    updatedAt: NOW,
    authorizesExecution: false,
    ...overrides,
  };
}

function secretReference(overrides: Partial<SecretReferenceRecord> = {}): SecretReferenceRecord {
  return {
    kind: 'SecretReferenceRecord',
    schemaVersion: VERSION,
    secretReference: 'secretref/fixture/meta/act-123',
    tenant: { tenantId: TENANT_ID as SecretReferenceRecord['tenant']['tenantId'] },
    provider: 'META',
    accountReference: 'fixture_act_123' as SecretReferenceRecord['accountReference'],
    bindingReference: PROVIDER_BINDING_REFERENCE,
    state: 'ACTIVE',
    credentialVersion: 3,
    updatedAt: NOW,
    authorizesExecution: false,
    ...overrides,
  };
}

function actionIntent(overrides: Record<string, unknown> = {}): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: VERSION,
    actionIntentId: 'actint_01JTESTW08GWRITE00000000',
    capability: { capability: 'META_ADS', actionType: 'UPDATE_AD' },
    executionTarget: {
      schemaVersion: VERSION,
      kind: 'PROVIDER',
      provider: 'META',
      accountReference: 'fixture_act_123',
      targetType: 'AD',
      targetReference: 'fixture_ad_456',
    },
    tenant: { tenantId: TENANT_ID },
    actor: { actorId: 'usr_01JTESTW08GACTOR000000000', actorType: 'USER' },
    requestOrigin: { actorId: 'usr_01JTESTW08GACTOR000000000', actorType: 'USER' },
    correlation: { correlationId: CORRELATION_ID },
    resolvedParameters: { status: 'PAUSED' },
    idempotency: { mode: 'REQUIRED', key: 'idem:w08g:fixture:1' },
    preconditions: [],
    expectedState: { stateType: 'AD_STATUS', value: { status: 'PAUSED' } },
    deadlineAt: '2026-09-03T09:00:00Z',
    authority: { kind: 'POLICY_TOKEN', policyTokenId: 'ptok_01JTESTW08GTOKEN000000000' },
    dataClassification: 'INTERNAL',
    ...overrides,
  } as unknown as ActionIntent;
}

function proof(
  intent: ActionIntent,
  overrides: Partial<W07ProviderExecutionProof> = {},
): W07ProviderExecutionProof {
  return {
    kind: 'W07_PROVIDER_EXECUTION_PROOF',
    actionIntentId: intent.actionIntentId,
    currentAuthorityValidated: true,
    executionEligible: true,
    validatedAt: NOW,
    authorizesExecution: false,
    ...overrides,
  };
}

function capabilityPlan(
  overrides: Partial<W04CapabilityPlanProjection> = {},
): W04CapabilityPlanProjection {
  return {
    planKind: 'TARGET_NEUTRAL_CAPABILITY_PLAN',
    tenantId: TENANT_ID as W04CapabilityPlanProjection['tenantId'],
    correlationId: CORRELATION_ID,
    registryVersion: 'fixture-registry-v1',
    status: 'READY',
    selections: [
      {
        requirementId: 'req-meta-ads',
        capabilityId: 'META_ADS',
        status: 'SELECTED',
        reason: 'SELECTED',
        selectedBindingIds: [W04_BINDING_ID],
      },
    ],
    authorizesExecution: false,
    ...overrides,
  };
}

function supportBinding(
  overrides: Partial<ProviderCapabilitySupportBinding> = {},
): ProviderCapabilitySupportBinding {
  return {
    kind: 'ProviderCapabilitySupportBinding',
    supportBindingId: 'provider-support-fixture-meta-ads',
    tenantId: TENANT_ID as ProviderCapabilitySupportBinding['tenantId'],
    provider: 'META',
    providerBindingReference: PROVIDER_BINDING_REFERENCE,
    providerBindingVersion: 7,
    w04BindingId: W04_BINDING_ID,
    capabilityId: 'META_ADS',
    supportedActionTypes: ['UPDATE_AD'],
    supportedReadOperations: ['LIST_ADS'],
    state: 'ACTIVE',
    authorizesExecution: false,
    ...overrides,
  };
}

function healthObservation(state = 'HEALTHY'): unknown {
  return {
    provider: 'META',
    accountReference: 'fixture_act_123',
    bindingReference: PROVIDER_BINDING_REFERENCE,
    observedAt: NOW,
    sourceEndpoint: 'mock/health',
    state,
  };
}

function writeRequest(
  intent: ActionIntent,
  overrides: Partial<ProviderWriteIntegrationRequest> = {},
): ProviderWriteIntegrationRequest {
  return {
    actionIntent: intent,
    executionProof: proof(intent),
    binding: binding(),
    secretReference: secretReference(),
    capabilityPlan: capabilityPlan(),
    supportBinding: supportBinding(),
    environment: 'STAGING',
    now: NOW,
    safeMode: 'PAUSED',
    healthObservation: healthObservation(),
    maxObservationAgeMs: 60_000,
    ...overrides,
  };
}

test('W08-G composes W04 selection and W07 proof through one safe write plus readback', async () => {
  const intent = actionIntent();
  const mock = createSafeProviderMock({
    transientCredential: CREDENTIAL,
    writeResult: {
      ok: true,
      providerReference: 'fixture-provider-op-1',
      providerRevision: '7',
      requiresReadback: true,
    },
    readbackResult: {
      ok: true,
      status: 'OBSERVED',
      observedAt: NOW,
      providerReference: 'fixture-provider-op-1',
      providerRevision: '8',
      observedState: { status: 'PAUSED' },
    },
  });

  const result = await executeSafeProviderWriteIntegration(writeRequest(intent), mock);

  assert.equal(result.ok, true);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.retryAuthorized, false);
  if (!result.ok) return;
  assert.equal(result.write.ok, true);
  assert.equal(result.readback?.ok, true);
  assert.equal(result.requiresReconciliation, false);
  assert.deepEqual(mock.snapshot(), {
    credentialUses: 2,
    writeCalls: 1,
    readCalls: 0,
    readbackCalls: 1,
  });
  assert.equal(JSON.stringify(result).includes(CREDENTIAL), false);
  assert.equal(JSON.stringify(mock.snapshot()).includes(CREDENTIAL), false);
});

test('W08-G ambiguous write performs readback once and never blind-retries', async () => {
  const intent = actionIntent();
  const mock = createSafeProviderMock({
    transientCredential: CREDENTIAL,
    writeResult: {
      ok: false,
      error: 'AMBIGUOUS_WRITE',
      mutationPossible: true,
      providerReference: 'fixture-provider-op-ambiguous',
    },
    readbackResult: {
      ok: true,
      status: 'PENDING',
      observedAt: NOW,
      providerReference: 'fixture-provider-op-ambiguous',
    },
  });

  const result = await executeSafeProviderWriteIntegration(writeRequest(intent), mock);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.write.ok, false);
  if (!result.write.ok) assert.equal(result.write.error, 'AMBIGUOUS_WRITE');
  assert.equal(result.requiresReconciliation, true);
  assert.equal(result.retryAuthorized, false);
  assert.deepEqual(mock.snapshot(), {
    credentialUses: 2,
    writeCalls: 1,
    readCalls: 0,
    readbackCalls: 1,
  });
});

test('W08-G rate limit and quota failures remain operational facts without retries', async (t: NestedTestContext) => {
  for (const error of ['RATE_LIMITED', 'QUOTA_EXHAUSTED'] as const) {
    await t.test(error, async () => {
      const intent = actionIntent();
      const mock = createSafeProviderMock({
        transientCredential: CREDENTIAL,
        writeResult: {
          ok: false,
          error,
          mutationPossible: false,
          ...(error === 'RATE_LIMITED' ? { retryAfterMs: 5_000 } : {}),
        },
      });
      const result = await executeSafeProviderWriteIntegration(writeRequest(intent), mock);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.write.ok, false);
      if (!result.write.ok) assert.equal(result.write.error, error);
      assert.equal(result.retryAuthorized, false);
      assert.equal(result.requiresReconciliation, false);
      assert.equal(mock.snapshot().writeCalls, 1);
      assert.equal(mock.snapshot().readbackCalls, 0);
    });
  }
});

test('W08-G rejects wrong tenant/account before credential access or provider call', async (t: NestedTestContext) => {
  await t.test('cross-tenant', async () => {
    const intent = actionIntent({ tenant: { tenantId: 'ten_01JTESTOTHER000000000000000' } });
    const mock = createSafeProviderMock({
      transientCredential: CREDENTIAL,
      writeResult: { ok: true, requiresReadback: false },
    });
    const result = await executeSafeProviderWriteIntegration(writeRequest(intent), mock);
    assert.deepEqual(result, {
      ok: false,
      error: 'TARGET_BINDING_UNAVAILABLE',
      retryAuthorized: false,
      authorizesExecution: false,
    });
    assert.deepEqual(mock.snapshot(), {
      credentialUses: 0,
      writeCalls: 0,
      readCalls: 0,
      readbackCalls: 0,
    });
  });

  await t.test('wrong-account', async () => {
    const intent = actionIntent({
      executionTarget: {
        schemaVersion: VERSION,
        kind: 'PROVIDER',
        provider: 'META',
        accountReference: 'fixture_act_wrong',
        targetType: 'AD',
        targetReference: 'fixture_ad_456',
      },
    });
    const mock = createSafeProviderMock({
      transientCredential: CREDENTIAL,
      writeResult: { ok: true, requiresReadback: false },
    });
    const result = await executeSafeProviderWriteIntegration(writeRequest(intent), mock);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, 'TARGET_BINDING_UNAVAILABLE');
    assert.equal(mock.snapshot().writeCalls, 0);
    assert.equal(mock.snapshot().credentialUses, 0);
  });
});

test('W08-G consumes W04 capability truth and rejects blocked or mismatched support publication', async (t: NestedTestContext) => {
  const scenarios: readonly [string, Partial<ProviderWriteIntegrationRequest>, string][] = [
    [
      'blocked-plan',
      { capabilityPlan: capabilityPlan({ status: 'BLOCKED' }) },
      'CAPABILITY_NOT_SELECTED',
    ],
    [
      'wrong-w04-binding',
      { supportBinding: supportBinding({ w04BindingId: 'cap-binding-not-selected' }) },
      'SUPPORT_BINDING_MISMATCH',
    ],
    [
      'revoked-support',
      { supportBinding: supportBinding({ state: 'REVOKED' }) },
      'SUPPORT_BINDING_MISMATCH',
    ],
    [
      'unsupported-action',
      { supportBinding: supportBinding({ supportedActionTypes: ['CREATE_AD'] }) },
      'UNSUPPORTED_OPERATION',
    ],
  ];
  for (const [name, overrides, expected] of scenarios) {
    await t.test(name, async () => {
      const intent = actionIntent();
      const mock = createSafeProviderMock({
        transientCredential: CREDENTIAL,
        writeResult: { ok: true, requiresReadback: false },
      });
      const result = await executeSafeProviderWriteIntegration(
        writeRequest(intent, overrides),
        mock,
      );
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.error, expected);
      assert.equal(mock.snapshot().credentialUses, 0);
      assert.equal(mock.snapshot().writeCalls, 0);
    });
  }
});

test('W08-G refuses LIVE-like environments and incompatible safe modes', async () => {
  const intent = actionIntent();
  const mock = createSafeProviderMock({
    transientCredential: CREDENTIAL,
    writeResult: { ok: true, requiresReadback: false },
  });
  const live = await executeSafeProviderWriteIntegration(
    writeRequest(intent, { environment: 'LIVE' as ProviderWriteIntegrationRequest['environment'] }),
    mock,
  );
  assert.equal(live.ok, false);
  if (!live.ok) assert.equal(live.error, 'UNSAFE_ENVIRONMENT');

  const wrongMode = await executeSafeProviderWriteIntegration(
    writeRequest(intent, { environment: 'MOCK', safeMode: 'PAUSED' }),
    mock,
  );
  assert.equal(wrongMode.ok, false);
  if (!wrongMode.ok) assert.equal(wrongMode.error, 'SAFE_MODE_MISMATCH');
  assert.equal(mock.snapshot().writeCalls, 0);
});

test('W08-G expired credential fails closed without leaking or invoking transport', async () => {
  const intent = actionIntent();
  const mock = createSafeProviderMock({
    transientCredential: CREDENTIAL,
    writeResult: { ok: true, requiresReadback: false },
  });
  const result = await executeSafeProviderWriteIntegration(
    writeRequest(intent, {
      secretReference: secretReference({ expiresAt: '2026-09-03T07:00:00Z' as Rfc3339Timestamp }),
    }),
    mock,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.write.ok, false);
  if (!result.write.ok) assert.equal(result.write.error, 'CREDENTIAL_UNAVAILABLE');
  assert.deepEqual(mock.snapshot(), {
    credentialUses: 0,
    writeCalls: 0,
    readCalls: 0,
    readbackCalls: 0,
  });
  assert.equal(JSON.stringify(result).includes(CREDENTIAL), false);
});

test('W08-G degraded health is metadata only and cannot mint authority', async () => {
  const intent = actionIntent();
  const mock = createSafeProviderMock({
    transientCredential: CREDENTIAL,
    writeResult: { ok: true, requiresReadback: true },
    readbackResult: {
      ok: true,
      status: 'OBSERVED',
      observedAt: NOW,
      observedState: { status: 'PAUSED' },
    },
  });
  const result = await executeSafeProviderWriteIntegration(
    writeRequest(intent, { healthObservation: healthObservation('DEGRADED') }),
    mock,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.health?.ok, true);
  if (result.health?.ok) {
    assert.equal(result.health.state, 'DEGRADED');
    assert.equal(result.health.authorizesExecution, false);
    assert.equal(result.health.retryAuthorized, false);
  }
  assert.equal(result.authorizesExecution, false);
});

test('W08-G read path is physically separated from write adapter invocation', async () => {
  const providerBinding = binding();
  const mock = createSafeProviderMock({
    transientCredential: CREDENTIAL,
    writeResult: { ok: true, requiresReadback: false },
    readResults: [
      {
        ok: true,
        page: {
          items: [{ id: 'fixture_ad_456' }],
          observedAt: NOW,
        },
      },
    ],
  });
  const result = await executeSafeProviderReadIntegration(
    {
      capabilityPlan: capabilityPlan(),
      supportBinding: supportBinding(),
      environment: 'MOCK',
      capabilityId: 'META_ADS',
      tenant: providerBinding.tenant,
      executionTarget: {
        schemaVersion: VERSION,
        kind: 'PROVIDER',
        provider: 'META',
        accountReference: 'fixture_act_123',
        targetType: 'AD',
        targetReference: 'fixture_ad_456',
      },
      binding: providerBinding,
      secretReference: secretReference(),
      now: NOW,
      correlationReference: CORRELATION_ID,
      operation: 'LIST_ADS',
      fields: ['id'],
      query: { status: 'PAUSED' },
      limits: { maxPages: 1, maxItems: 10 },
    },
    { credentials: mock.credentials, readAdapter: mock.readAdapter },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.read.ok, true);
  assert.deepEqual(mock.snapshot(), {
    credentialUses: 1,
    writeCalls: 0,
    readCalls: 1,
    readbackCalls: 0,
  });
  assert.equal(JSON.stringify(result).includes(CREDENTIAL), false);
});

test('W08-G rejects accessor-shaped capability support input before any provider activity', async () => {
  const intent = actionIntent();
  const malicious: Record<string, unknown> = { ...supportBinding() };
  Object.defineProperty(malicious, 'provider', {
    enumerable: true,
    get() {
      throw new Error('accessor must not execute');
    },
  });
  const mock = createSafeProviderMock({
    transientCredential: CREDENTIAL,
    writeResult: { ok: true, requiresReadback: false },
  });
  const result = await executeSafeProviderWriteIntegration(
    writeRequest(intent, { supportBinding: malicious }),
    mock,
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, 'SUPPORT_BINDING_INVALID');
  assert.equal(mock.snapshot().credentialUses, 0);
  assert.equal(mock.snapshot().writeCalls, 0);
});
