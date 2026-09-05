// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';
import type { CausationId, CommandId, ExecutionId } from '@aurora/contracts/ids';

import type { DeviceCommandDeliverySnapshot } from '../../device-command-delivery/types.js';
import type { DeviceSessionTrustSnapshot } from '../../device-session/types.js';
import type { DeviceRegistrationRecord, DeviceRef } from '../../device/types.js';
import type { GatewaySessionSnapshot } from '../../gateway-auth/types.js';
import type {
  RealtimeCommandSessionSnapshot,
  RealtimeCommandSnapshot,
} from '../../realtime-session/types.js';
import {
  W14LocalGovernedDeviceDispatchPort,
  type LocalW14GovernedDeviceDispatchRequest,
  type W14LocalGovernedDeviceDispatchDependencies,
} from '../governed-device-dispatch.js';

const NOW = 1_788_633_600_000;
const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const ACTOR = 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const CORRELATION = 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const DEVICE_ID = 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const COMMAND = 'cmd_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CommandId;
const EXECUTION = 'exe_01ARZ3NDEKTSV4RRFFQ69G5FAV' as ExecutionId;
const CAUSATION = 'cau_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CausationId;
const GATEWAY_SESSION = 'gws_test_session';
const CONNECTION = 'gw-connection-2';
const DEVICE_SESSION = 'device-session-1';

function deviceRef(): DeviceRef {
  return {
    kind: 'AURORA_DEVICE',
    deviceId: DEVICE_ID,
    tenantId: TENANT,
    registrationVersion: 1,
  } as unknown as DeviceRef;
}

function gateway(): GatewaySessionSnapshot {
  return {
    protocolVersion: '1.0',
    sessionId: GATEWAY_SESSION,
    connectionId: CONNECTION,
    generation: 2,
    state: 'OPEN',
    tenantId: TENANT,
    actorKind: 'HUMAN',
    actorIdentityId: ACTOR,
    correlationId: CORRELATION,
    authIssuedAtMs: NOW - 1_000,
    authExpiresAtMs: NOW + 120_000,
    openedAtMs: NOW - 1_000,
    outstandingRequests: 0,
    authorizesExecution: false,
  } as unknown as GatewaySessionSnapshot;
}

function registration(): DeviceRegistrationRecord {
  return {
    kind: 'DeviceRegistrationRecord',
    schemaVersion: '1.0.0',
    ref: deviceRef(),
    boundIdentityId: ACTOR,
    state: 'ACTIVE',
    registeredAt: '2026-09-05T20:00:00.000Z',
    updatedAt: '2026-09-05T20:00:00.000Z',
    provenance: {
      source: 'W14_DEVICE_REGISTRATION',
      reference: 'device-key:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      observedAt: '2026-09-05T20:00:00.000Z',
    },
    authoritySemantics: 'DEVICE_REGISTRATION_ONLY_NO_ACTION_AUTHORITY',
    authorizesExecution: false,
    canGrantPermission: false,
  } as unknown as DeviceRegistrationRecord;
}

function trust(): DeviceSessionTrustSnapshot {
  return {
    kind: 'DeviceSessionTrustSnapshot',
    schemaVersion: '1.0.0',
    deviceSessionId: DEVICE_SESSION,
    gatewaySessionId: GATEWAY_SESSION,
    connectionId: CONNECTION,
    gatewayGeneration: 2,
    tenantId: TENANT,
    actorIdentityId: ACTOR,
    correlationId: CORRELATION,
    deviceRef: deviceRef(),
    attestation: {
      kind: 'DEVICE_ATTESTATION_REFERENCE',
      reference: 'device-attestation:fixture',
      provider: 'aurora-device-key-proof',
      version: '1',
      state: 'VERIFIED',
      observedAtMs: NOW - 100,
      expiresAtMs: NOW + 60_000,
    },
    state: 'ACTIVE',
    openedAtMs: NOW - 500,
    lastEvaluatedAtMs: NOW - 10,
    gatewayAuthExpiresAtMs: NOW + 120_000,
    executionPreconditionSatisfied: true,
    requiresCurrentAuthorityValidation: true,
    authoritySemantics: 'DEVICE_SESSION_TRUST_IS_PRECONDITION_METADATA_ONLY',
    authorizesExecution: false,
    canGrantPermission: false,
  } as unknown as DeviceSessionTrustSnapshot;
}

function realtimeSession(overrides: Partial<RealtimeCommandSessionSnapshot> = {}): RealtimeCommandSessionSnapshot {
  return {
    gatewaySessionId: GATEWAY_SESSION,
    gatewayConnectionId: CONNECTION,
    gatewayGeneration: 2,
    state: 'OPEN',
    tenantId: TENANT,
    actorIdentityId: ACTOR,
    correlationId: CORRELATION,
    deviceRef: deviceRef(),
    openedAtMs: NOW,
    outstandingCommands: 0,
    authorizesExecution: false,
    canGrantPermission: false,
    ...overrides,
  } as unknown as RealtimeCommandSessionSnapshot;
}

function realtimeCommand(): RealtimeCommandSnapshot {
  return {
    commandId: COMMAND,
    executionId: EXECUTION,
    executionTarget: {
      schemaVersion: '1.0.0',
      kind: 'DEVICE',
      bindingReference: DEVICE_ID,
    },
    correlationId: CORRELATION,
    causationId: CAUSATION,
    state: 'SUBMITTED',
    deadlineMs: NOW + 30_000,
    submittedAtMs: NOW,
    updatedAtMs: NOW,
    submittedGatewayGeneration: 2,
    lastRemoteSequence: 0,
    redeliveryDisposition: 'NOT_DECIDED_BY_W14_B',
    authoritySemantics: 'TRANSPORT_SESSION_ONLY_NO_ACTION_AUTHORITY',
    authorizesExecution: false,
    provesExecutionSuccess: false,
    externalStateVerified: false,
  } as unknown as RealtimeCommandSnapshot;
}

function delivery(): DeviceCommandDeliverySnapshot {
  return {
    deliveryReference: 'w14f:delivery:1',
    durableIdempotencyReference: 'w03d:fixture',
    idempotencyKey: `w14f:${COMMAND}`,
    commandId: COMMAND,
    executionId: EXECUTION,
    correlationId: CORRELATION,
    tenantId: TENANT,
    deviceSessionId: DEVICE_SESSION,
    deviceId: DEVICE_ID,
    orderingKey: 'device:camera',
    orderingSequence: 9,
    state: 'QUEUED',
    preparedAtMs: NOW,
    lastUpdatedAtMs: NOW,
    deliveryAttempts: 0,
    authoritySemantics: 'TRANSPORT_ONLY_W07_RETAINS_EXECUTION_AUTHORITY',
    retryAuthority: 'W07_RECONCILIATION_REQUIRED_FOR_UNCERTAIN',
    authorizesExecution: false,
    provesExecutionSuccess: false,
  } as unknown as DeviceCommandDeliverySnapshot;
}

function actionIntent(): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: '1.0.0',
    actionIntentId: 'act_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    capability: { capability: 'camera.open', actionType: 'OPEN_CAMERA' },
    executionTarget: {
      schemaVersion: '1.0.0',
      kind: 'DEVICE',
      bindingReference: DEVICE_ID,
    },
    tenant: { tenantId: TENANT },
    actor: { kind: 'HUMAN', identityId: ACTOR },
    requestOrigin: { kind: 'HUMAN', identityId: ACTOR },
    correlation: { correlationId: CORRELATION },
    resolvedParameters: {},
    idempotency: { mode: 'REQUIRED', key: 'business:camera:open:1' },
    preconditions: [],
    deadlineAt: new Date(NOW + 30_000).toISOString(),
    dataClassification: 'INTERNAL',
  } as unknown as ActionIntent;
}

function request(): LocalW14GovernedDeviceDispatchRequest {
  return {
    command: {
      commandId: COMMAND,
      executionId: EXECUTION,
      causationId: CAUSATION,
      orderingKey: 'device:camera',
      orderingSequence: 9,
      actionIntent: actionIntent(),
      canonicalPayloadHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      authorizesExecution: false,
    },
    context: {
      tenantId: TENANT,
      actorIdentityId: ACTOR,
      correlationId: CORRELATION,
      gatewaySessionId: GATEWAY_SESSION,
      connectionId: CONNECTION,
      deviceSessionId: DEVICE_SESSION,
      deviceId: DEVICE_ID,
      registrationVersion: 1,
    },
    dispatchedAtMs: NOW,
  };
}

interface Harness {
  readonly dependencies: W14LocalGovernedDeviceDispatchDependencies;
  readonly calls: {
    open: unknown[];
    resume: unknown[];
    submit: unknown[];
    prepare: unknown[];
  };
  setRealtimeSession(value: RealtimeCommandSessionSnapshot | null): void;
  setGateway(value: GatewaySessionSnapshot): void;
  setTrust(value: DeviceSessionTrustSnapshot): void;
  failDelivery(code: string, retryable: boolean): void;
}

function harness(): Harness {
  let gatewayValue = gateway();
  let trustValue = trust();
  let existingRealtime: RealtimeCommandSessionSnapshot | null = null;
  let deliveryFailure: { code: string; retryable: boolean } | null = null;
  const calls = { open: [] as unknown[], resume: [] as unknown[], submit: [] as unknown[], prepare: [] as unknown[] };

  const dependencies = {
    gatewaySessions: {
      getSession: () => ({ ok: true, value: gatewayValue }),
    },
    devices: {
      resolve: () => ({ ok: true, record: registration(), authorizesExecution: false, canGrantPermission: false }),
    },
    deviceSessions: {
      getSession: () => ({ ok: true, snapshot: trustValue, authorizesExecution: false, canGrantPermission: false }),
    },
    realtimeCommands: {
      getSession: () =>
        existingRealtime === null
          ? { ok: false, error: { code: 'SESSION_NOT_FOUND', message: 'missing', retryable: false }, authorizesExecution: false }
          : { ok: true, value: existingRealtime, authorizesExecution: false },
      openSession: (input: unknown) => {
        calls.open.push(input);
        existingRealtime = realtimeSession();
        return { ok: true, value: existingRealtime, authorizesExecution: false };
      },
      resumeSession: (input: unknown) => {
        calls.resume.push(input);
        existingRealtime = realtimeSession();
        return { ok: true, value: existingRealtime, authorizesExecution: false };
      },
      submitCommand: (input: unknown) => {
        calls.submit.push(input);
        return {
          ok: true,
          value: { disposition: 'SUBMITTED', session: realtimeSession(), command: realtimeCommand() },
          authorizesExecution: false,
        };
      },
    },
    deliveries: {
      prepare: (input: unknown) => {
        calls.prepare.push(input);
        if (deliveryFailure !== null) {
          return {
            ok: false,
            error: {
              code: deliveryFailure.code,
              message: 'delivery failed',
              retryable: deliveryFailure.retryable,
            },
            authorizesExecution: false,
            retryAuthorized: false,
          };
        }
        return {
          ok: true,
          value: { disposition: 'PREPARED', delivery: delivery() },
          authorizesExecution: false,
          retryAuthorized: false,
        };
      },
    },
  } as unknown as W14LocalGovernedDeviceDispatchDependencies;

  return {
    dependencies,
    calls,
    setRealtimeSession: (value) => {
      existingRealtime = value;
    },
    setGateway: (value) => {
      gatewayValue = value;
    },
    setTrust: (value) => {
      trustValue = value;
    },
    failDelivery: (code, retryable) => {
      deliveryFailure = { code, retryable };
    },
  };
}

test('opens server-owned realtime session then submits and prepares W14-F delivery', () => {
  const state = harness();
  const result = new W14LocalGovernedDeviceDispatchPort(state.dependencies).dispatch(request());

  assert.equal(result.ok, true);
  assert.equal(state.calls.open.length, 1);
  assert.equal(state.calls.resume.length, 0);
  assert.equal(state.calls.submit.length, 1);
  assert.equal(state.calls.prepare.length, 1);
  const prepared = state.calls.prepare[0] as Record<string, unknown>;
  assert.equal(prepared.idempotencyKey, `w14f:${COMMAND}`);
  assert.equal(prepared.orderingKey, 'device:camera');
  assert.equal(prepared.orderingSequence, 9);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.provesExecutionSuccess, false);
  assert.equal(result.retryAuthorized, false);
});

test('resumes realtime session only from server-held previous connection and advanced gateway generation', () => {
  const state = harness();
  state.setRealtimeSession(
    realtimeSession({ gatewayConnectionId: 'gw-connection-1', gatewayGeneration: 1 }),
  );
  const result = new W14LocalGovernedDeviceDispatchPort(state.dependencies).dispatch(request());

  assert.equal(result.ok, true);
  assert.equal(state.calls.open.length, 0);
  assert.equal(state.calls.resume.length, 1);
  const resumed = state.calls.resume[0] as Record<string, unknown>;
  assert.equal(resumed.previousGatewayConnectionId, 'gw-connection-1');
});

test('stale gateway or trust binding fails closed before realtime submission', () => {
  const gatewayState = harness();
  gatewayState.setGateway({ ...gateway(), connectionId: 'other-connection' });
  let result = new W14LocalGovernedDeviceDispatchPort(gatewayState.dependencies).dispatch(request());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'GATEWAY_SESSION_NOT_CURRENT');
  assert.equal(gatewayState.calls.submit.length, 0);
  assert.equal(gatewayState.calls.prepare.length, 0);

  const trustState = harness();
  trustState.setTrust({ ...trust(), state: 'REVOKED', executionPreconditionSatisfied: false });
  result = new W14LocalGovernedDeviceDispatchPort(trustState.dependencies).dispatch(request());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'DEVICE_SESSION_NOT_CURRENT');
  assert.equal(trustState.calls.submit.length, 0);
  assert.equal(trustState.calls.prepare.length, 0);
});

test('delivery failure remains a transport failure and never grants retry authority', () => {
  const state = harness();
  state.failDelivery('DURABLE_IDEMPOTENCY_UNAVAILABLE', true);
  const result = new W14LocalGovernedDeviceDispatchPort(state.dependencies).dispatch(request());

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'DELIVERY_DURABLE_IDEMPOTENCY_UNAVAILABLE');
    assert.equal(result.retryable, true);
    assert.equal(result.retryAuthorized, false);
  }
});
