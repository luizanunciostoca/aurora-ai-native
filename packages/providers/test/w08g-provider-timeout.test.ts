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
  executeSafeProviderWriteIntegration,
  type ProviderCapabilitySupportBinding,
  type W04CapabilityPlanProjection,
} from '../src/integration/index.js';
import type { W07ProviderExecutionProof } from '../src/write/index.js';

const VERSION = '1.0.0' as ContractVersion;
const NOW = '2026-09-03T08:00:00Z' as Rfc3339Timestamp;
const TENANT_ID = 'ten_01JTESTW08GTIMEOUT000000000';
const CORRELATION_ID = 'cor_01JTESTW08GTIMEOUT000000000';
const BINDING_REFERENCE = 'provider-binding-fixture-timeout';
const W04_BINDING_ID = 'cap-binding-fixture-timeout';
const CREDENTIAL = ['fixture', 'transient', 'timeout', 'credential'].join('-');

function binding(): ProviderBindingRecord {
  return {
    kind: 'ProviderBindingRecord',
    schemaVersion: VERSION,
    bindingReference: BINDING_REFERENCE,
    tenant: { tenantId: TENANT_ID as ProviderBindingRecord['tenant']['tenantId'] },
    provider: 'META',
    accountReference: 'fixture_act_timeout' as ProviderBindingRecord['accountReference'],
    targetType: 'AD',
    targetReference: 'fixture_ad_timeout' as NonNullable<ProviderBindingRecord['targetReference']>,
    state: 'ACTIVE',
    verificationState: 'VERIFIED',
    bindingVersion: 1,
    updatedAt: NOW,
    authorizesExecution: false,
  };
}

function secretReference(): SecretReferenceRecord {
  return {
    kind: 'SecretReferenceRecord',
    schemaVersion: VERSION,
    secretReference: 'secretref/fixture/timeout',
    tenant: { tenantId: TENANT_ID as SecretReferenceRecord['tenant']['tenantId'] },
    provider: 'META',
    accountReference: 'fixture_act_timeout' as SecretReferenceRecord['accountReference'],
    bindingReference: BINDING_REFERENCE,
    state: 'ACTIVE',
    credentialVersion: 1,
    updatedAt: NOW,
    authorizesExecution: false,
  };
}

function intent(): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: VERSION,
    actionIntentId: 'actint_01JTESTW08GTIMEOUT000000',
    capability: { capability: 'META_ADS', actionType: 'UPDATE_AD' },
    executionTarget: {
      schemaVersion: VERSION,
      kind: 'PROVIDER',
      provider: 'META',
      accountReference: 'fixture_act_timeout',
      targetType: 'AD',
      targetReference: 'fixture_ad_timeout',
    },
    tenant: { tenantId: TENANT_ID },
    actor: { actorId: 'usr_01JTESTW08GTIMEOUT0000000', actorType: 'USER' },
    requestOrigin: { actorId: 'usr_01JTESTW08GTIMEOUT0000000', actorType: 'USER' },
    correlation: { correlationId: CORRELATION_ID },
    resolvedParameters: { status: 'PAUSED' },
    idempotency: { mode: 'REQUIRED', key: 'idem:w08g:timeout' },
    preconditions: [],
    expectedState: { stateType: 'AD_STATUS', value: { status: 'PAUSED' } },
    deadlineAt: '2026-09-03T09:00:00Z',
    authority: { kind: 'POLICY_TOKEN', policyTokenId: 'ptok_01JTESTW08GTIMEOUT000000' },
    dataClassification: 'INTERNAL',
  } as unknown as ActionIntent;
}

function plan(): W04CapabilityPlanProjection {
  return {
    planKind: 'TARGET_NEUTRAL_CAPABILITY_PLAN',
    tenantId: TENANT_ID as W04CapabilityPlanProjection['tenantId'],
    correlationId: CORRELATION_ID,
    registryVersion: 'fixture-registry-timeout',
    status: 'READY',
    selections: [
      {
        requirementId: 'req-timeout',
        capabilityId: 'META_ADS',
        status: 'SELECTED',
        reason: 'SELECTED',
        selectedBindingIds: [W04_BINDING_ID],
      },
    ],
    authorizesExecution: false,
  };
}

function support(): ProviderCapabilitySupportBinding {
  return {
    kind: 'ProviderCapabilitySupportBinding',
    supportBindingId: 'provider-support-fixture-timeout',
    tenantId: TENANT_ID as ProviderCapabilitySupportBinding['tenantId'],
    provider: 'META',
    providerBindingReference: BINDING_REFERENCE,
    providerBindingVersion: 1,
    w04BindingId: W04_BINDING_ID,
    capabilityId: 'META_ADS',
    supportedActionTypes: ['UPDATE_AD'],
    supportedReadOperations: [],
    state: 'ACTIVE',
    authorizesExecution: false,
  };
}

test('W08-G transport exception becomes ambiguous write, performs readback, and never retries', async () => {
  const actionIntent = intent();
  const providerBinding = binding();
  const mock = createSafeProviderMock({
    transientCredential: CREDENTIAL,
    writeResult: { ok: true, requiresReadback: false },
    readbackResult: {
      ok: true,
      status: 'PENDING',
      observedAt: NOW,
      providerReference: 'fixture-provider-op-timeout',
    },
  });
  let writeCalls = 0;
  const executionProof: W07ProviderExecutionProof = {
    kind: 'W07_PROVIDER_EXECUTION_PROOF',
    actionIntentId: actionIntent.actionIntentId,
    currentAuthorityValidated: true,
    executionEligible: true,
    validatedAt: NOW,
    authorizesExecution: false,
  };

  const result = await executeSafeProviderWriteIntegration(
    {
      actionIntent,
      executionProof,
      binding: providerBinding,
      secretReference: secretReference(),
      capabilityPlan: plan(),
      supportBinding: support(),
      environment: 'STAGING',
      now: NOW,
      safeMode: 'PAUSED',
      healthObservation: {
        provider: 'META',
        accountReference: 'fixture_act_timeout',
        bindingReference: BINDING_REFERENCE,
        observedAt: NOW,
        sourceEndpoint: 'mock/health',
        state: 'HEALTHY',
      },
      maxObservationAgeMs: 60_000,
    },
    {
      credentials: mock.credentials,
      readAdapter: mock.readAdapter,
      readbackAdapter: mock.readbackAdapter,
      writeAdapter: {
        async writeOnce() {
          writeCalls += 1;
          throw new Error('fixture transport timeout');
        },
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(writeCalls, 1);
  assert.equal(result.write.ok, false);
  if (!result.write.ok) {
    assert.equal(result.write.error, 'AMBIGUOUS_WRITE');
    assert.equal(result.write.mutationPossible, true);
  }
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.requiresReconciliation, true);
  assert.equal(mock.snapshot().readbackCalls, 1);
  assert.equal(mock.snapshot().credentialUses, 2);
  assert.equal(JSON.stringify(result).includes(CREDENTIAL), false);
});
