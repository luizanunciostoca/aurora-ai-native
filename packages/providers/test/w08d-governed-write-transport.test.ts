// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { ContractVersion } from '@aurora/contracts/versioning';

import type { ProviderBindingRecord } from '../src/bindings/index.js';
import type { CredentialBackend, SecretReferenceRecord } from '../src/credentials/index.js';
import {
  executeGovernedProviderWrite,
  PROVIDER_WRITE_SAFE_MODES,
  type ProviderWriteAdapter,
  type ProviderWriteRequest,
  type W07ProviderExecutionProof,
} from '../src/write/index.js';

const VERSION = '1.0.0' as ContractVersion;
const NOW = '2026-09-03T01:30:00Z' as Rfc3339Timestamp;
const FUTURE = '2026-09-03T02:30:00Z' as Rfc3339Timestamp;
const TRANSIENT_FIXTURE_VALUE = ['fixture', 'provider', 'credential'].join('-');

function binding(overrides: Partial<ProviderBindingRecord> = {}): ProviderBindingRecord {
  const { targetType, targetReference, ...rest } = overrides;
  return {
    kind: 'ProviderBindingRecord',
    schemaVersion: VERSION,
    bindingReference: 'provider-binding-meta-act-123',
    tenant: {
      tenantId: 'ten_01JTESTTENANTA000000000000' as ProviderBindingRecord['tenant']['tenantId'],
    },
    provider: 'META',
    accountReference: 'act_123' as ProviderBindingRecord['accountReference'],
    targetType: targetType ?? 'AD',
    targetReference:
      targetReference ?? ('ad_456' as NonNullable<ProviderBindingRecord['targetReference']>),
    state: 'ACTIVE',
    verificationState: 'VERIFIED',
    bindingVersion: 4,
    updatedAt: NOW,
    authorizesExecution: false,
    ...rest,
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
    updatedAt: NOW,
    expiresAt: FUTURE,
    authorizesExecution: false,
    ...overrides,
  };
}

function intent(overrides: Record<string, unknown> = {}): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: VERSION,
    actionIntentId: 'actint_01JTESTWRITE0000000000000',
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
    correlation: { correlationId: 'cor_01JTESTWRITE00000000000000' },
    resolvedParameters: { status: 'PAUSED', budgetMinor: 1000 },
    idempotency: { mode: 'REQUIRED', key: 'idem:w08d:1' },
    preconditions: [{ preconditionType: 'REVISION_EQUALS', parameters: { revision: '7' } }],
    expectedState: { stateType: 'AD_STATUS', value: { status: 'PAUSED' } },
    deadlineAt: FUTURE,
    authority: { kind: 'POLICY_TOKEN', policyTokenId: 'ptok_01JTESTTOKEN0000000000000' },
    dataClassification: 'INTERNAL',
    ...overrides,
  } as unknown as ActionIntent;
}

function proof(
  actionIntent: ActionIntent,
  overrides: Partial<W07ProviderExecutionProof> = {},
): W07ProviderExecutionProof {
  return {
    kind: 'W07_PROVIDER_EXECUTION_PROOF',
    actionIntentId: actionIntent.actionIntentId,
    currentAuthorityValidated: true,
    executionEligible: true,
    validatedAt: NOW,
    authorizesExecution: false,
    ...overrides,
  };
}

function credentials(onUse?: (credential: string) => void): CredentialBackend {
  return {
    async withCredential(_lookup, consume) {
      onUse?.(TRANSIENT_FIXTURE_VALUE);
      await consume(TRANSIENT_FIXTURE_VALUE);
    },
  };
}

function request(
  actionIntent: ActionIntent,
  overrides: Partial<ProviderWriteRequest> = {},
): ProviderWriteRequest {
  return {
    actionIntent,
    executionProof: proof(actionIntent),
    binding: binding(),
    secretReference: secretReference(),
    now: NOW,
    safeMode: 'PAUSED',
    ...overrides,
  };
}

test('W08-D performs one safe-mode provider write and returns transport acknowledgement without authority', async () => {
  const actionIntent = intent();
  let calls = 0;
  let transientSeen = false;
  const adapter: ProviderWriteAdapter = {
    async writeOnce(frame, credential) {
      calls += 1;
      transientSeen = credential === TRANSIENT_FIXTURE_VALUE;
      assert.equal(frame.actionIntentId, actionIntent.actionIntentId);
      assert.equal(frame.provider, 'META');
      assert.equal(frame.accountReference, 'act_123');
      assert.equal(frame.idempotencyKey, 'idem:w08d:1');
      assert.equal(frame.safeMode, 'PAUSED');
      assert.equal(frame.actionType, 'UPDATE_AD');
      return {
        ok: true,
        providerReference: 'provider-op-1',
        providerRevision: '8',
        requiresReadback: true,
      };
    },
  };

  const result = await executeGovernedProviderWrite(request(actionIntent), {
    credentials: credentials(),
    adapter,
  });

  assert.equal(calls, 1);
  assert.equal(transientSeen, true);
  assert.equal(result.ok, true);
  assert.equal(result.authorizesExecution, false);
  if (!result.ok) return;
  assert.equal(result.requiresReadback, true);
  assert.equal(result.safeMode, 'PAUSED');
  assert.equal(JSON.stringify(result).includes(TRANSIENT_FIXTURE_VALUE), false);
});

test('W08-D rejects invalid W07 proof, expired deadline and non-safe LIVE mode before provider access', async () => {
  let adapterCalls = 0;
  let credentialCalls = 0;
  const adapter: ProviderWriteAdapter = {
    async writeOnce() {
      adapterCalls += 1;
      return { ok: true, requiresReadback: true };
    },
  };
  const backend = credentials(() => {
    credentialCalls += 1;
  });

  const base = intent();
  const wrongProof = await executeGovernedProviderWrite(
    request(base, {
      executionProof: proof(base, {
        actionIntentId: 'actint_wrong' as W07ProviderExecutionProof['actionIntentId'],
      }),
    }),
    { credentials: backend, adapter },
  );
  assert.deepEqual(wrongProof, {
    ok: false,
    error: 'EXECUTION_PROOF_INVALID',
    mutationPossible: false,
    authorizesExecution: false,
  });

  const expired = intent({ deadlineAt: NOW });
  const deadlineResult = await executeGovernedProviderWrite(request(expired), {
    credentials: backend,
    adapter,
  });
  assert.equal(deadlineResult.ok, false);
  if (!deadlineResult.ok) assert.equal(deadlineResult.error, 'DEADLINE_EXPIRED');

  const liveResult = await executeGovernedProviderWrite(
    request(base, { safeMode: 'LIVE' as ProviderWriteRequest['safeMode'] }),
    { credentials: backend, adapter },
  );
  assert.equal(liveResult.ok, false);
  if (!liveResult.ok) assert.equal(liveResult.error, 'REQUEST_MALFORMED');

  assert.equal(adapterCalls, 0);
  assert.equal(credentialCalls, 0);
  assert.deepEqual(PROVIDER_WRITE_SAFE_MODES, ['NO_OP', 'SANDBOX', 'PAUSED']);
});

test('W08-D requires exact binding and explicit REQUIRED idempotency before dispatch', async () => {
  let calls = 0;
  const adapter: ProviderWriteAdapter = {
    async writeOnce() {
      calls += 1;
      return { ok: true, requiresReadback: true };
    },
  };

  const actionIntent = intent();
  const wrongBinding = await executeGovernedProviderWrite(
    request(actionIntent, {
      binding: binding({
        accountReference: 'act_999' as ProviderBindingRecord['accountReference'],
      }),
    }),
    { credentials: credentials(), adapter },
  );
  assert.equal(wrongBinding.ok, false);
  if (!wrongBinding.ok) assert.equal(wrongBinding.error, 'TARGET_BINDING_UNAVAILABLE');

  const noIdempotency = intent({
    idempotency: { mode: 'NOT_APPLICABLE', reason: 'incorrect for governed mutation' },
  });
  const idempotencyResult = await executeGovernedProviderWrite(request(noIdempotency), {
    credentials: credentials(),
    adapter,
  });
  assert.equal(idempotencyResult.ok, false);
  if (!idempotencyResult.ok) assert.equal(idempotencyResult.error, 'IDEMPOTENCY_REQUIRED');
  assert.equal(calls, 0);
});

test('W08-D classifies thrown dispatch as AMBIGUOUS_WRITE and never retries blindly', async () => {
  let calls = 0;
  const adapter: ProviderWriteAdapter = {
    async writeOnce() {
      calls += 1;
      throw new Error('connection lost after send');
    },
  };

  const actionIntent = intent();
  const result = await executeGovernedProviderWrite(request(actionIntent), {
    credentials: credentials(),
    adapter,
  });

  assert.equal(calls, 1);
  assert.deepEqual(result, {
    ok: false,
    error: 'AMBIGUOUS_WRITE',
    mutationPossible: true,
    authorizesExecution: false,
  });
});

test('W08-D rejects adapter results that disguise possible mutation as ordinary retryable failure', async () => {
  const adapter: ProviderWriteAdapter = {
    async writeOnce() {
      return {
        ok: false,
        error: 'TRANSIENT_TRANSPORT_FAILURE',
        mutationPossible: true,
      } as unknown as Awaited<ReturnType<ProviderWriteAdapter['writeOnce']>>;
    },
  };

  const actionIntent = intent();
  const result = await executeGovernedProviderWrite(request(actionIntent), {
    credentials: credentials(),
    adapter,
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, 'ADAPTER_PROTOCOL_VIOLATION');
});
