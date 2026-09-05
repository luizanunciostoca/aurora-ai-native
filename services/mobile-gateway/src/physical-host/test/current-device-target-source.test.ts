// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';
import type { IdentityId, TenantId } from '@aurora/contracts/ids';

import type { DeviceRegistrationRecord, DeviceResolutionResult } from '../../device/types.js';
import {
  W14CurrentDeviceTargetBindingSource,
  type CurrentDeviceRegistrationReader,
  type LocalCurrentVoiceTargetBindingRequest,
} from '../current-device-target-source.js';

const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId;
const ACTOR = 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV' as IdentityId;
const DEVICE = 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const EVALUATED_AT = '2026-09-05T19:30:00.000Z';

function actionIntent(): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: '1.0.0',
    actionIntentId: 'act_01J00000000000000000000000',
    capability: { capability: 'camera.open', actionType: 'OPEN_CAMERA' },
    executionTarget: {
      schemaVersion: '1.0.0',
      kind: 'DEVICE',
      bindingReference: DEVICE,
    },
    tenant: { tenantId: TENANT },
    actor: { kind: 'HUMAN', identityId: ACTOR },
    requestOrigin: { kind: 'HUMAN', identityId: ACTOR },
    correlation: { correlationId: 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV' },
    resolvedParameters: {},
    idempotency: { mode: 'REQUIRED', key: 'target-source-test' },
    preconditions: [],
    deadlineAt: '2026-09-05T20:00:00.000Z',
    dataClassification: 'INTERNAL',
  } as unknown as ActionIntent;
}

function record(overrides: Partial<DeviceRegistrationRecord> = {}): DeviceRegistrationRecord {
  return {
    kind: 'DeviceRegistrationRecord',
    schemaVersion: '1.0.0',
    ref: {
      kind: 'AURORA_DEVICE',
      deviceId: DEVICE as DeviceRegistrationRecord['ref']['deviceId'],
      tenantId: TENANT,
      registrationVersion: 3,
    },
    boundIdentityId: ACTOR,
    state: 'ACTIVE',
    registeredAt: '2026-09-05T19:00:00.000Z',
    updatedAt: '2026-09-05T19:20:00.000Z',
    provenance: {
      source: 'W14_DEVICE_REGISTRATION',
      reference: 'registration:physical-target',
      observedAt: '2026-09-05T19:00:00.000Z',
    },
    authoritySemantics: 'DEVICE_REGISTRATION_ONLY_NO_ACTION_AUTHORITY',
    authorizesExecution: false,
    canGrantPermission: false,
    ...overrides,
  };
}

class Reader implements CurrentDeviceRegistrationReader {
  calls = 0;
  result: DeviceResolutionResult = {
    ok: true,
    record: record(),
    authorizesExecution: false,
    canGrantPermission: false,
  };
  fail = false;

  resolve(): DeviceResolutionResult {
    this.calls += 1;
    if (this.fail) throw new Error('registry unavailable');
    return this.result;
  }
}

function request(
  overrides: Partial<LocalCurrentVoiceTargetBindingRequest> = {},
): LocalCurrentVoiceTargetBindingRequest {
  return {
    actionIntent: actionIntent(),
    tenantId: TENANT,
    actorIdentityId: ACTOR,
    deviceId: DEVICE,
    registrationVersion: 3,
    evaluatedAt: EVALUATED_AT,
    ...overrides,
  };
}

test('active exact-version W14 registration becomes one non-authoritative W07 DEVICE binding', () => {
  const reader = new Reader();
  const source = new W14CurrentDeviceTargetBindingSource(reader);
  const bindings = source.resolve(request());
  assert.notEqual(bindings, null);
  assert.equal(bindings?.length, 1);
  assert.equal(bindings?.[0]?.state, 'AVAILABLE');
  assert.equal(bindings?.[0]?.target.kind, 'DEVICE');
  assert.equal(bindings?.[0]?.target.bindingReference, DEVICE);
  assert.equal(bindings?.[0]?.bindingId, `w14:device:${DEVICE}:v3`);
  assert.equal(bindings?.[0]?.preconditionsSatisfied, true);
  assert.equal(reader.calls, 1);
});

test('stale registration version and inactive/revoked resolution produce no usable binding', () => {
  const reader = new Reader();
  const source = new W14CurrentDeviceTargetBindingSource(reader);
  reader.result = {
    ok: false,
    error: 'STALE_VERSION',
    authorizesExecution: false,
    canGrantPermission: false,
  };
  assert.deepEqual(source.resolve(request({ registrationVersion: 2 })), []);

  reader.result = {
    ok: false,
    error: 'DEVICE_REVOKED',
    authorizesExecution: false,
    canGrantPermission: false,
  };
  assert.deepEqual(source.resolve(request()), []);
});

test('tenant actor device and target mismatch fail before registry lookup', () => {
  const cases: LocalCurrentVoiceTargetBindingRequest[] = [
    request({ tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAW' }),
    request({ actorIdentityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAW' }),
    request({ deviceId: 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAW' }),
    request({ registrationVersion: 0 }),
    request({ evaluatedAt: 'invalid-time' }),
  ];
  for (const candidate of cases) {
    const reader = new Reader();
    const source = new W14CurrentDeviceTargetBindingSource(reader);
    assert.deepEqual(source.resolve(candidate), []);
    assert.equal(reader.calls, 0);
  }
});

test('future or authority-bearing registry data cannot become target availability', () => {
  const reader = new Reader();
  const source = new W14CurrentDeviceTargetBindingSource(reader);
  reader.result = {
    ok: true,
    record: record({ updatedAt: '2026-09-05T19:40:00.000Z' }),
    authorizesExecution: false,
    canGrantPermission: false,
  };
  assert.deepEqual(source.resolve(request()), []);

  reader.result = {
    ok: true,
    record: record(),
    authorizesExecution: true as unknown as false,
    canGrantPermission: false,
  };
  assert.deepEqual(source.resolve(request()), []);
});

test('registry dependency failure stays unavailable rather than fabricating an empty-current target', () => {
  const reader = new Reader();
  reader.fail = true;
  const source = new W14CurrentDeviceTargetBindingSource(reader);
  assert.equal(source.resolve(request()), null);
});
