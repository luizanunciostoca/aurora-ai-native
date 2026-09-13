// @ts-expect-error -- mobile-gateway harness intentionally has no @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway harness intentionally has no @types/node.
import test from 'node:test';

import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type {
  CorrelationId,
  IdentityId,
  InteractionSessionId,
  TenantId,
} from '@aurora/contracts/ids';

import type { DeviceId } from '../src/device/types.js';
import type { DeviceSessionTrustResult } from '../src/device-session/types.js';
import { GATEWAY_PROTOCOL_VERSION } from '../src/gateway-auth/index.js';
import type {
  GatewayProtocolResult,
  GatewayRequestSnapshot,
} from '../src/gateway-auth/types.js';
import {
  InteractionGatewayAdapter,
  type DeviceInteractionTrustPort,
  type GatewayInteractionRequestPort,
  type InteractionContinuityPort,
} from '../src/interaction-gateway/index.js';
import type {
  InteractionSessionManagerErrorCode,
  InteractionSessionManagerResult,
  StoredInteractionSession,
} from '../src/interaction-session/types.js';

const TENANT = 'ten_01JW14V0170000000000000000' as TenantId;
const IDENTITY = 'idn_01JW14V0170000000000000000' as IdentityId;
const CORRELATION = 'cor_01JW14V0170000000000000000' as CorrelationId;
const SESSION_ID = 'ins_00000000000000000000000001' as InteractionSessionId;
const DEVICE_ID = 'dvc_01JW14V0170000000000000000' as DeviceId;
const GATEWAY_SESSION_ID = 'gateway:lifecycle:test';
const CONNECTION_ID = 'conn:lifecycle:test';
const DEVICE_SESSION_ID = 'device-session:lifecycle:test';
const NOW = '2026-09-13T08:00:00.000Z' as Rfc3339Timestamp;

function stored(state: 'ACTIVE' | 'SUSPENDED' | 'ENDED'): StoredInteractionSession {
  return {
    revision: state === 'ACTIVE' ? 1 : state === 'SUSPENDED' ? 2 : 3,
    session: {
      kind: 'INTERACTION_SESSION',
      schemaVersion: 1,
      interactionSessionId: SESSION_ID,
      tenantId: TENANT,
      participant: {
        kind: 'DEVICE',
        bindingReference: `device:${DEVICE_ID}:registration:1`,
      },
      modality: 'VOICE',
      state,
      createdAt: NOW,
      updatedAt: NOW,
      dataClassification: 'CONFIDENTIAL',
      resume:
        state === 'SUSPENDED'
          ? {
              resumable: true,
              resumableUntil: '2026-09-13T08:01:00.000Z' as Rfc3339Timestamp,
            }
          : { resumable: false },
      references: { artifactRefs: [], pendingHumanControlRequestRefs: [] },
      turns: [],
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    },
  };
}

function success(
  state: 'ACTIVE' | 'SUSPENDED' | 'ENDED',
): InteractionSessionManagerResult {
  return {
    ok: true,
    value: stored(state),
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

function failure(code: InteractionSessionManagerErrorCode): InteractionSessionManagerResult {
  return {
    ok: false,
    code,
    message: `synthetic ${code}`,
    retryable: code === 'REVISION_CONFLICT',
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

function snapshot(
  state: 'ACTIVE' | 'COMPLETED',
  requestId: string,
): GatewayRequestSnapshot {
  return {
    requestId,
    sessionId: GATEWAY_SESSION_ID,
    connectionId: CONNECTION_ID,
    state,
    deadlineMs: 32_000,
    startedAtMs: 2_000,
    ...(state === 'COMPLETED' ? { completedAtMs: 2_000 } : {}),
    authorizesExecution: false,
  };
}

function gateway(): GatewayInteractionRequestPort & {
  begins: string[];
  completes: string[];
} {
  const begins: string[] = [];
  const completes: string[] = [];
  return {
    begins,
    completes,
    beginRequest(input: unknown): GatewayProtocolResult<GatewayRequestSnapshot> {
      const requestId = (input as { requestId: string }).requestId;
      begins.push(requestId);
      return { ok: true, value: snapshot('ACTIVE', requestId) };
    },
    completeRequest(input: unknown): GatewayProtocolResult<GatewayRequestSnapshot> {
      const requestId = (input as { requestId: string }).requestId;
      completes.push(requestId);
      return { ok: true, value: snapshot('COMPLETED', requestId) };
    },
  };
}

const deviceTrust: DeviceInteractionTrustPort = {
  getSession(): DeviceSessionTrustResult {
    return {
      ok: true,
      snapshot: {
        kind: 'DeviceSessionTrustSnapshot',
        schemaVersion: '1.0.0',
        deviceSessionId: DEVICE_SESSION_ID,
        gatewaySessionId: GATEWAY_SESSION_ID,
        connectionId: CONNECTION_ID,
        gatewayGeneration: 1,
        tenantId: TENANT,
        actorIdentityId: IDENTITY,
        correlationId: CORRELATION,
        deviceRef: {
          kind: 'AURORA_DEVICE',
          deviceId: DEVICE_ID,
          tenantId: TENANT,
          registrationVersion: 1,
        },
        attestation: {
          kind: 'DEVICE_ATTESTATION_REFERENCE',
          reference: 'attestation:lifecycle:test',
          provider: 'test-provider',
          version: '1',
          state: 'VERIFIED',
          observedAtMs: 1_000,
          expiresAtMs: 600_000,
        },
        state: 'ACTIVE',
        openedAtMs: 1_000,
        lastEvaluatedAtMs: 2_000,
        gatewayAuthExpiresAtMs: 600_000,
        executionPreconditionSatisfied: true,
        requiresCurrentAuthorityValidation: true,
        authoritySemantics: 'DEVICE_SESSION_TRUST_IS_PRECONDITION_METADATA_ONLY',
        authorizesExecution: false,
        canGrantPermission: false,
      },
      authorizesExecution: false,
      canGrantPermission: false,
    };
  },
};

function request(index: number) {
  return {
    protocolVersion: GATEWAY_PROTOCOL_VERSION,
    sessionId: GATEWAY_SESSION_ID,
    connectionId: CONNECTION_ID,
    requestId: `lifecycle:${index}`,
    tenantId: TENANT,
    actorIdentityId: IDENTITY,
    correlationId: CORRELATION,
    deadlineMs: 32_000,
    nowMs: 1_000,
  };
}

function input(index: number) {
  return {
    gatewayRequest: request(index),
    deviceSessionId: DEVICE_SESSION_ID,
    interactionSessionId: SESSION_ID,
  };
}

function continuity(
  overrides: Partial<InteractionContinuityPort> = {},
): InteractionContinuityPort {
  return {
    open: () => success('ACTIVE'),
    current: () => success('ACTIVE'),
    appendTurn: () => success('ACTIVE'),
    suspend: () => success('SUSPENDED'),
    resume: () => success('ACTIVE'),
    end: () => success('ENDED'),
    ...overrides,
  };
}

test('suspend, resume and end traverse trust binding and complete each gateway request', () => {
  const gw = gateway();
  const adapter = new InteractionGatewayAdapter(gw, deviceTrust, continuity(), {
    ingressDataClassification: 'CONFIDENTIAL',
    clock: () => 2_000,
  });

  const suspended = adapter.suspend({ ...input(1), resumeWindowMs: 60_000 });
  const resumed = adapter.resume(input(2));
  const ended = adapter.end(input(3));

  for (const result of [suspended, resumed, ended]) {
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.requestCompleted, true);
      assert.equal(result.authorizesExecution, false);
      assert.equal(result.provesExecutionSuccess, false);
      assert.equal(result.retryAuthorized, false);
      assert.equal(result.requiresStateReconciliation, false);
    }
  }
  assert.equal(suspended.ok && suspended.value.session.state, 'SUSPENDED');
  assert.equal(resumed.ok && resumed.value.session.state, 'ACTIVE');
  assert.equal(ended.ok && ended.value.session.state, 'ENDED');
  assert.deepEqual(gw.begins, ['lifecycle:1', 'lifecycle:2', 'lifecycle:3']);
  assert.deepEqual(gw.completes, ['lifecycle:1', 'lifecycle:2', 'lifecycle:3']);
});

test('lifecycle manager rejections remain non-authoritative and require reconciliation', () => {
  const cases: ReadonlyArray<{
    name: 'suspend' | 'resume' | 'end';
    cause: InteractionSessionManagerErrorCode;
  }> = [
    { name: 'suspend', cause: 'INVALID_RESUME_WINDOW' },
    { name: 'resume', cause: 'SESSION_NOT_SUSPENDED' },
    { name: 'end', cause: 'REVISION_CONFLICT' },
  ];

  for (const [index, item] of cases.entries()) {
    const gw = gateway();
    const adapter = new InteractionGatewayAdapter(
      gw,
      deviceTrust,
      continuity({ [item.name]: () => failure(item.cause) }),
      { ingressDataClassification: 'CONFIDENTIAL', clock: () => 2_000 },
    );
    const bound = input(index + 10);
    const result =
      item.name === 'suspend'
        ? adapter.suspend({ ...bound, resumeWindowMs: 60_000 })
        : item.name === 'resume'
          ? adapter.resume(bound)
          : adapter.end(bound);

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, 'INTERACTION_REJECTED');
      assert.equal(result.causeCode, item.cause);
      assert.equal(result.requestCompleted, true);
      assert.equal(result.requiresStateReconciliation, true);
      assert.equal(result.authorizesExecution, false);
      assert.equal(result.provesExecutionSuccess, false);
      assert.equal(result.retryAuthorized, false);
    }
    assert.equal(gw.begins.length, 1);
    assert.equal(gw.completes.length, 1);
  }
});