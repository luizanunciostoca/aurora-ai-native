// @ts-expect-error -- executor tests target Node 22 without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor tests target Node 22 without repository-wide @types/node.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';
import type { TenantId } from '@aurora/contracts/ids';

import type {
  ActionIntentContainmentKeySource,
  DurableContainmentStateRecord,
  DurableContainmentStateSource,
} from '../src/failure-containment/durable-containment-state.js';
import { DurableCurrentVoiceContainmentStateSource } from '../src/voice-intake/durable-current-containment-source.js';

const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId;
const CIRCUIT = 'device:camera:local';
const NOW = '2026-09-06T00:30:00.000Z';

function intent(): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: '1.0.0',
    actionIntentId: 'act_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    capability: { capability: 'camera.open', actionType: 'OPEN_CAMERA' },
    tenant: { tenantId: TENANT },
    actor: { kind: 'HUMAN', identityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV' },
    requestOrigin: { kind: 'HUMAN', identityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV' },
    correlation: { correlationId: 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV' },
    resolvedParameters: {},
    idempotency: { mode: 'REQUIRED', key: 'camera:open' },
    preconditions: [],
    deadlineAt: '2026-09-06T00:35:00.000Z',
    authority: { kind: 'POLICY_TOKEN', policyTokenId: 'ptk_01ARZ3NDEKTSV4RRFFQ69G5FAV' },
    dataClassification: 'INTERNAL',
  } as unknown as ActionIntent;
}

function record(): DurableContainmentStateRecord {
  return {
    tenantId: TENANT,
    circuitKey: CIRCUIT,
    version: 2,
    updatedAt: '2026-09-06T00:29:59.000Z',
    snapshot: {
      circuit: { state: 'CLOSED', consecutiveFailures: 0, halfOpenProbeInFlight: false },
      killSwitch: { state: 'INACTIVE', changedAt: '2026-09-06T00:29:59.000Z' },
      dependencyHealth: 'HEALTHY',
      cancellationRequested: false,
      currentInFlight: 0,
      maxInFlight: 2,
      retryDepth: 0,
      maxRetryDepth: 2,
    },
    authorizesExecution: false,
  };
}

test('resolves circuit key and current durable snapshot on every voice-state read', () => {
  let keyCalls = 0;
  let stateCalls = 0;
  const keys: ActionIntentContainmentKeySource = {
    resolveCircuitKey: () => {
      keyCalls += 1;
      return CIRCUIT;
    },
  };
  const durable: DurableContainmentStateSource = {
    resolveCurrent: (lookup) => {
      stateCalls += 1;
      assert.equal(lookup.circuitKey, CIRCUIT);
      assert.equal(lookup.tenantId, TENANT);
      return record();
    },
  };
  const source = new DurableCurrentVoiceContainmentStateSource({
    circuitKeys: keys,
    durableState: durable,
  });

  assert.equal(source.resolve({ actionIntent: intent(), tenantId: TENANT, evaluatedAt: NOW })?.circuit.state, 'CLOSED');
  assert.equal(source.resolve({ actionIntent: intent(), tenantId: TENANT, evaluatedAt: NOW })?.killSwitch.state, 'INACTIVE');
  assert.equal(keyCalls, 2);
  assert.equal(stateCalls, 2);
});

test('tenant mismatch, missing key, missing state and owner outages all fail closed', () => {
  const baseKeys: ActionIntentContainmentKeySource = { resolveCircuitKey: () => CIRCUIT };
  const baseState: DurableContainmentStateSource = { resolveCurrent: () => record() };

  const source = new DurableCurrentVoiceContainmentStateSource({
    circuitKeys: baseKeys,
    durableState: baseState,
  });
  assert.equal(
    source.resolve({ actionIntent: intent(), tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAW', evaluatedAt: NOW }),
    null,
  );

  const missingKey = new DurableCurrentVoiceContainmentStateSource({
    circuitKeys: { resolveCircuitKey: () => null },
    durableState: baseState,
  });
  assert.equal(missingKey.resolve({ actionIntent: intent(), tenantId: TENANT, evaluatedAt: NOW }), null);

  const missingState = new DurableCurrentVoiceContainmentStateSource({
    circuitKeys: baseKeys,
    durableState: { resolveCurrent: () => null },
  });
  assert.equal(missingState.resolve({ actionIntent: intent(), tenantId: TENANT, evaluatedAt: NOW }), null);

  const throwing = new DurableCurrentVoiceContainmentStateSource({
    circuitKeys: {
      resolveCircuitKey: () => {
        throw new Error('key owner unavailable');
      },
    },
    durableState: baseState,
  });
  assert.equal(throwing.resolve({ actionIntent: intent(), tenantId: TENANT, evaluatedAt: NOW }), null);
});
