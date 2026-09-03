// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { ContractVersion } from '@aurora/contracts/versioning';

import type { ProviderBindingRecord } from '../src/bindings/index.js';
import type { CredentialBackend, SecretReferenceRecord } from '../src/credentials/index.js';
import type { ProviderOperationalObservationResult } from '../src/health/index.js';
import {
  reconcileProviderWrite,
  type ProviderReadbackAdapter,
  type ProviderReadbackRequest,
} from '../src/readback/index.js';
import type { ProviderWriteResult } from '../src/write/index.js';

const VERSION = '1.0.0' as ContractVersion;
const WRITE_AT = '2026-09-03T04:00:00Z' as Rfc3339Timestamp;
const OBSERVED_AT = '2026-09-03T04:00:05Z' as Rfc3339Timestamp;
const NOW = '2026-09-03T04:00:10Z' as Rfc3339Timestamp;
const CREDENTIAL = ['fixture', 'transient', 'readback', 'credential'].join('-');

function binding(overrides: Partial<ProviderBindingRecord> = {}): ProviderBindingRecord {
  return {
    kind: 'ProviderBindingRecord',
    schemaVersion: VERSION,
    bindingReference: 'provider-binding-meta-act-123',
    tenant: {
      tenantId: 'ten_01JTESTTENANTA000000000000' as ProviderBindingRecord['tenant']['tenantId'],
    },
    provider: 'META',
    accountReference: 'act_123' as ProviderBindingRecord['accountReference'],
    targetType: 'AD',
    targetReference: 'ad_456' as NonNullable<ProviderBindingRecord['targetReference']>,
    state: 'ACTIVE',
    verificationState: 'VERIFIED',
    bindingVersion: 4,
    updatedAt: WRITE_AT,
    authorizesExecution: false,
    ...overrides,
  };
}

function secretReference(overrides: Partial<SecretReferenceRecord> = {}): SecretReferenceRecord {
  return {
    kind: 'SecretReferenceRecord',
    schemaVersion: VERSION,
    secretReference: 'secretref/meta/act-123',
    tenant: {
      tenantId: 'ten_01JTESTTENANTA000000000000' as SecretReferenceRecord['tenant']['tenantId'],
    },
    provider: 'META',
    accountReference: 'act_123' as SecretReferenceRecord['accountReference'],
    bindingReference: 'provider-binding-meta-act-123',
    state: 'ACTIVE',
    credentialVersion: 2,
    updatedAt: WRITE_AT,
    authorizesExecution: false,
    ...overrides,
  };
}

function actionIntent(overrides: Record<string, unknown> = {}): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: VERSION,
    actionIntentId: 'actint_01JTESTREADBACK0000000000',
    capability: { capability: 'META_ADS', actionType: 'UPDATE_AD' },
    executionTarget: {
      schemaVersion: VERSION,
      kind: 'PROVIDER',
      provider: 'META',
      accountReference: 'act_123',
      targetType: 'AD',
      targetReference: 'ad_456',
    },
    tenant: { tenantId: 'ten_01JTESTTENANTA000000000000' },
    actor: { actorId: 'usr_01JTESTACTOR00000000000000', actorType: 'USER' },
    requestOrigin: { actorId: 'usr_01JTESTACTOR00000000000000', actorType: 'USER' },
    correlation: { correlationId: 'cor_01JTESTREADBACK0000000000' },
    resolvedParameters: { status: 'PAUSED' },
    idempotency: { mode: 'REQUIRED', key: 'idem:w08f:1' },
    preconditions: [],
    expectedState: { stateType: 'AD_STATUS', value: { status: 'PAUSED' } },
    deadlineAt: '2026-09-03T05:00:00Z',
    authority: { kind: 'POLICY_TOKEN', policyTokenId: 'ptok_01JTESTTOKEN0000000000000' },
    dataClassification: 'INTERNAL',
    ...overrides,
  } as unknown as ActionIntent;
}

function successfulWrite(
  overrides: Partial<Extract<ProviderWriteResult, { ok: true }>> = {},
): ProviderWriteResult {
  return {
    ok: true,
    provider: 'META',
    accountReference: 'act_123',
    bindingReference: 'provider-binding-meta-act-123',
    bindingVersion: 4,
    actionIntentId: 'actint_01JTESTREADBACK0000000000' as ActionIntent['actionIntentId'],
    providerReference: 'provider-op-1',
    providerRevision: '8',
    requiresReadback: true,
    safeMode: 'PAUSED',
    authorizesExecution: false,
    ...overrides,
  };
}

function ambiguousWrite(): ProviderWriteResult {
  return {
    ok: false,
    error: 'AMBIGUOUS_WRITE',
    mutationPossible: true,
    providerReference: 'provider-op-ambiguous',
    authorizesExecution: false,
  };
}

function health(
  overrides: Partial<Extract<ProviderOperationalObservationResult, { ok: true }>> = {},
): ProviderOperationalObservationResult {
  return {
    ok: true,
    state: 'HEALTHY',
    currentness: 'CURRENT',
    provider: 'META',
    accountReference: 'act_123',
    bindingReference: 'provider-binding-meta-act-123',
    observedAt: NOW,
    sourceEndpoint: 'meta/health',
    retryAuthorized: false,
    authorizesExecution: false,
    ...overrides,
  };
}

function credentials(onUse?: (credential: string) => void): CredentialBackend {
  return {
    async withCredential(_lookup, consume) {
      onUse?.(CREDENTIAL);
      await consume(CREDENTIAL);
    },
  };
}

function request(overrides: Partial<ProviderReadbackRequest> = {}): ProviderReadbackRequest {
  return {
    actionIntent: actionIntent(),
    binding: binding(),
    secretReference: secretReference(),
    writeResult: successfulWrite(),
    health: health(),
    writeOccurredAt: WRITE_AT,
    now: NOW,
    maxObservationAgeMs: 60_000,
    ...overrides,
  };
}

test('W08-F observed expected state becomes W07 effect observation without retry authority', async () => {
  let calls = 0;
  const adapter: ProviderReadbackAdapter = {
    async readbackOnce(frame, credential) {
      calls += 1;
      assert.equal(credential, CREDENTIAL);
      assert.equal(frame.provider, 'META');
      assert.equal(frame.bindingReference, 'provider-binding-meta-act-123');
      assert.deepEqual(frame.expectedState, {
        stateType: 'AD_STATUS',
        value: { status: 'PAUSED' },
      });
      return {
        ok: true,
        status: 'OBSERVED',
        observedAt: OBSERVED_AT,
        providerReference: 'provider-op-1',
        providerRevision: '9',
        observedState: { status: 'PAUSED' },
      };
    },
  };

  const result = await reconcileProviderWrite(request(), {
    credentials: credentials(),
    adapter,
  });

  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.authorizesExecution, false);
  if (!result.ok) return;
  assert.deepEqual(result.observation, {
    state: 'EFFECT_OBSERVED',
    observedAt: OBSERVED_AT,
    reference: 'provider-op-1',
  });
  assert.equal(result.requiresFurtherReadback, false);
  assert.equal(JSON.stringify(result).includes(CREDENTIAL), false);
});

test('W08-F mismatched observed state remains indeterminate and never becomes verified outcome', async () => {
  const result = await reconcileProviderWrite(request(), {
    credentials: credentials(),
    adapter: {
      async readbackOnce() {
        return {
          ok: true,
          status: 'OBSERVED',
          observedAt: OBSERVED_AT,
          observedState: { status: 'ACTIVE' },
        };
      },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.observation.state, 'INDETERMINATE');
  if (result.observation.state === 'INDETERMINATE') {
    assert.equal(result.observation.reason, 'READBACK_MISMATCH');
  }
  assert.equal(result.requiresFurtherReadback, true);
  assert.equal(result.retryAuthorized, false);
});

test('W08-F ambiguous write can observe no effect but still cannot authorize retry', async () => {
  const result = await reconcileProviderWrite(request({ writeResult: ambiguousWrite() }), {
    credentials: credentials(),
    adapter: {
      async readbackOnce(frame) {
        assert.equal(frame.providerReference, 'provider-op-ambiguous');
        return {
          ok: true,
          status: 'NO_EFFECT_CONFIRMED',
          observedAt: OBSERVED_AT,
          providerReference: 'provider-op-ambiguous',
        };
      },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.observation, {
    state: 'NO_EFFECT_CONFIRMED',
    observedAt: OBSERVED_AT,
    reference: 'provider-op-ambiguous',
  });
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.authorizesExecution, false);
});

test('W08-F eventual-consistency statuses remain indeterminate and request further readback', async () => {
  for (const status of ['NOT_FOUND', 'DUPLICATE', 'PENDING', 'DELAYED'] as const) {
    const result = await reconcileProviderWrite(request(), {
      credentials: credentials(),
      adapter: {
        async readbackOnce() {
          return { ok: true, status, observedAt: OBSERVED_AT };
        },
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.equal(result.observation.state, 'INDETERMINATE');
    assert.equal(result.requiresFurtherReadback, true);
    assert.equal(result.retryAuthorized, false);
  }
});

test('W08-F stale and out-of-order observations cannot resolve write outcome', async () => {
  const stale = await reconcileProviderWrite(request({ maxObservationAgeMs: 1_000 }), {
    credentials: credentials(),
    adapter: {
      async readbackOnce() {
        return {
          ok: true,
          status: 'OBSERVED',
          observedAt: OBSERVED_AT,
          observedState: { status: 'PAUSED' },
        };
      },
    },
  });
  assert.equal(stale.ok, true);
  if (stale.ok && stale.observation.state === 'INDETERMINATE') {
    assert.equal(stale.observation.reason, 'READBACK_STALE');
  }

  const outOfOrder = await reconcileProviderWrite(request(), {
    credentials: credentials(),
    adapter: {
      async readbackOnce() {
        return {
          ok: true,
          status: 'OBSERVED',
          observedAt: '2026-09-03T03:59:59Z' as Rfc3339Timestamp,
          observedState: { status: 'PAUSED' },
        };
      },
    },
  });
  assert.equal(outOfOrder.ok, true);
  if (outOfOrder.ok && outOfOrder.observation.state === 'INDETERMINATE') {
    assert.equal(outOfOrder.observation.reason, 'READBACK_TIME_ORDER_INVALID');
  }
});

test('W08-F provider failure is advisory evidence only and never retry authority', async () => {
  const result = await reconcileProviderWrite(request(), {
    credentials: credentials(),
    adapter: {
      async readbackOnce() {
        return { ok: false, error: 'RATE_LIMITED', retryAfterMs: 2_000 };
      },
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.observation.state, 'INDETERMINATE');
  assert.equal(result.advisoryRetryAfterMs, 2_000);
  assert.equal(result.retryAuthorized, false);
});

test('W08-F rejects binding and health mismatches before credential/provider access', async () => {
  let credentialCalls = 0;
  let adapterCalls = 0;
  const dependencies = {
    credentials: credentials(() => {
      credentialCalls += 1;
    }),
    adapter: {
      async readbackOnce() {
        adapterCalls += 1;
        return { ok: true, status: 'PENDING', observedAt: OBSERVED_AT } as const;
      },
    } satisfies ProviderReadbackAdapter,
  };

  const wrongBinding = await reconcileProviderWrite(
    request({
      binding: binding({
        accountReference: 'act_999' as ProviderBindingRecord['accountReference'],
      }),
    }),
    dependencies,
  );
  assert.equal(wrongBinding.ok, false);
  if (!wrongBinding.ok) assert.equal(wrongBinding.error, 'WRITE_OUTCOME_INELIGIBLE');

  const wrongHealth = await reconcileProviderWrite(
    request({
      health: health({ accountReference: 'act_999' }),
    }),
    dependencies,
  );
  assert.equal(wrongHealth.ok, false);
  if (!wrongHealth.ok) assert.equal(wrongHealth.error, 'HEALTH_BINDING_MISMATCH');
  assert.equal(credentialCalls, 0);
  assert.equal(adapterCalls, 0);
});

test('W08-F rejects malformed adapter payloads and accessor state without executing getters', async () => {
  let getterCalls = 0;
  const observedState = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(observedState, 'status', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'PAUSED';
    },
  });

  const result = await reconcileProviderWrite(request(), {
    credentials: credentials(),
    adapter: {
      async readbackOnce() {
        return {
          ok: true,
          status: 'OBSERVED',
          observedAt: OBSERVED_AT,
          observedState,
        } as never;
      },
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, 'ADAPTER_PROTOCOL_VIOLATION');
  assert.equal(getterCalls, 0);
});