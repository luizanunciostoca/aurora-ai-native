// @ts-expect-error -- mobile-gateway harness intentionally has no @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway harness intentionally has no @types/node.
import test from 'node:test';

import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';

import type { DeviceId } from '../src/device/types.js';
import type { DeviceSessionTrustResult } from '../src/device-session/types.js';
import { GATEWAY_PROTOCOL_VERSION } from '../src/gateway-auth/index.js';
import type { GatewayProtocolResult, GatewayRequestSnapshot } from '../src/gateway-auth/types.js';
import {
  InteractionGatewayAdapter,
  type DeviceInteractionTrustPort,
  type GatewayInteractionRequestPort,
  type InteractionContinuityPort,
} from '../src/interaction-gateway/index.js';

const TENANT = 'ten_01JW14V0170000000000000000' as TenantId;
const IDENTITY = 'idn_01JW14V0170000000000000000' as IdentityId;
const CORRELATION = 'cor_01JW14V0170000000000000000' as CorrelationId;
const DEVICE_ID = 'dvc_01JW14V0170000000000000000' as DeviceId;
const GATEWAY_SESSION_ID = 'gateway:reconciliation:test';
const CONNECTION_ID = 'conn:reconciliation:test';
const REQUEST_ID = 'request:reconciliation:test';
const DEVICE_SESSION_ID = 'device-session:reconciliation:test';

function requestSnapshot(state: 'ACTIVE' | 'COMPLETED'): GatewayRequestSnapshot {
  return {
    requestId: REQUEST_ID,
    sessionId: GATEWAY_SESSION_ID,
    connectionId: CONNECTION_ID,
    state,
    deadlineMs: 31_000,
    startedAtMs: 1_000,
    ...(state === 'COMPLETED' ? { completedAtMs: 1_000 } : {}),
    authorizesExecution: false,
  };
}

const gateway: GatewayInteractionRequestPort = {
  beginRequest(): GatewayProtocolResult<GatewayRequestSnapshot> {
    return { ok: true, value: requestSnapshot('ACTIVE') };
  },
  completeRequest(): GatewayProtocolResult<GatewayRequestSnapshot> {
    return { ok: true, value: requestSnapshot('COMPLETED') };
  },
};

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
          reference: 'attestation:reconciliation:test',
          provider: 'test-provider',
          version: '1',
          state: 'VERIFIED',
          observedAtMs: 1_000,
          expiresAtMs: 600_000,
        },
        state: 'ACTIVE',
        openedAtMs: 1_000,
        lastEvaluatedAtMs: 1_000,
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

function unexpected(): never {
  throw new Error('unexpected interaction continuity operation');
}

const throwingContinuity: InteractionContinuityPort = {
  open(): never {
    throw new Error('synthetic failure after a potentially mutating boundary');
  },
  current: unexpected,
  appendTurn: unexpected,
  suspend: unexpected,
  resume: unexpected,
  end: unexpected,
};

test('mutating interaction exception requires reconciliation even after request completion', () => {
  const adapter = new InteractionGatewayAdapter(gateway, deviceTrust, throwingContinuity, {
    ingressDataClassification: 'CONFIDENTIAL',
    clock: () => 2_000,
  });

  const result = adapter.open({
    gatewayRequest: {
      protocolVersion: GATEWAY_PROTOCOL_VERSION,
      sessionId: GATEWAY_SESSION_ID,
      connectionId: CONNECTION_ID,
      requestId: REQUEST_ID,
      tenantId: TENANT,
      actorIdentityId: IDENTITY,
      correlationId: CORRELATION,
      deadlineMs: 31_000,
      nowMs: 1_000,
    },
    deviceSessionId: DEVICE_SESSION_ID,
    modality: 'VOICE',
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'INTERNAL_FAILURE');
  assert.equal(result.requestCompleted, true);
  assert.equal(result.requiresStateReconciliation, true);
  assert.equal(result.retryable, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.provesExecutionSuccess, false);
});
