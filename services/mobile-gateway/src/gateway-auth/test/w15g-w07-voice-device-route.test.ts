// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import test from 'node:test';

import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';

import {
  GatewayVoiceDevicePlaneNetworkHandler,
  VOICE_CANDIDATE_DEVICE_ROUTE,
  VoiceCandidateNetworkBoundary,
  type GatewayDevicePlaneHandleInput,
} from '../index.js';

const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId;
const ACTOR = 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV' as IdentityId;
const CORRELATION = 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CorrelationId;
const DEVICE_ID = 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const DEVICE_SESSION_ID = 'device-session-1';
const GATEWAY_SESSION_ID = 'gateway-session-1';
const CONNECTION_ID = 'gateway-connection-1';
const NOW = 1_788_500_000_000;

const candidate = {
  commandId: 'voice:open-dashboard',
  capabilityId: 'device.app.open',
  normalizedTranscript: 'abrir painel',
  requiresW07Authorization: true,
  authorizesExecution: false,
};

function trustSnapshot(): Record<string, unknown> {
  return {
    kind: 'DeviceSessionTrustSnapshot',
    schemaVersion: '1.0.0',
    deviceSessionId: DEVICE_SESSION_ID,
    gatewaySessionId: GATEWAY_SESSION_ID,
    connectionId: CONNECTION_ID,
    gatewayGeneration: 2,
    tenantId: TENANT,
    actorIdentityId: ACTOR,
    correlationId: CORRELATION,
    deviceRef: {
      kind: 'AURORA_DEVICE',
      deviceId: DEVICE_ID,
      tenantId: TENANT,
      registrationVersion: 3,
    },
    attestation: {
      kind: 'DEVICE_ATTESTATION_REFERENCE',
      reference: 'attestation:voice-route',
      provider: 'test-provider',
      version: 'v1',
      state: 'VERIFIED',
      observedAtMs: NOW - 1_000,
      expiresAtMs: NOW + 60_000,
    },
    state: 'ACTIVE',
    openedAtMs: NOW - 10_000,
    lastEvaluatedAtMs: NOW,
    gatewayAuthExpiresAtMs: NOW + 60_000,
    executionPreconditionSatisfied: true,
    requiresCurrentAuthorityValidation: true,
    authoritySemantics: 'DEVICE_SESSION_TRUST_IS_PRECONDITION_METADATA_ONLY',
    authorizesExecution: false,
    canGrantPermission: false,
  };
}

class FakeDeviceSessions {
  snapshot: Record<string, unknown> = trustSnapshot();
  calls = 0;

  getSession(deviceSessionId: unknown, connectionId: unknown, nowMs: unknown): unknown {
    this.calls += 1;
    assert.equal(deviceSessionId, DEVICE_SESSION_ID);
    assert.equal(connectionId, CONNECTION_ID);
    assert.equal(nowMs, NOW);
    return {
      ok: true,
      snapshot: this.snapshot,
      authorizesExecution: false,
      canGrantPermission: false,
    };
  }
}

function requestInput(
  body: Readonly<Record<string, unknown>> = candidate,
): GatewayDevicePlaneHandleInput {
  return {
    path: VOICE_CANDIDATE_DEVICE_ROUTE,
    body,
    gatewaySession: {
      protocolVersion: '1.0',
      sessionId: GATEWAY_SESSION_ID,
      connectionId: CONNECTION_ID,
      generation: 2,
      state: 'OPEN',
      tenantId: TENANT,
      actorKind: 'HUMAN',
      actorIdentityId: ACTOR,
      correlationId: CORRELATION,
      authIssuedAtMs: NOW - 10_000,
      authExpiresAtMs: NOW + 60_000,
      openedAtMs: NOW - 10_000,
      outstandingRequests: 0,
      authorizesExecution: false,
    },
    socketBinding: {
      sessionId: GATEWAY_SESSION_ID,
      connectionId: CONNECTION_ID,
      tenantId: TENANT,
      actorIdentityId: ACTOR,
      correlationId: CORRELATION,
    },
    connectionState: {
      deviceRef: {
        kind: 'AURORA_DEVICE',
        deviceId: DEVICE_ID,
        tenantId: TENANT,
        registrationVersion: 3,
      },
      deviceSessionId: DEVICE_SESSION_ID,
    },
    nowMs: NOW,
  };
}

function handler(
  sessions: FakeDeviceSessions,
  intake: { evaluate(input: unknown): unknown },
): GatewayVoiceDevicePlaneNetworkHandler {
  return new GatewayVoiceDevicePlaneNetworkHandler(
    {
      devices: {},
      deviceSessions: sessions,
      realtimeCommands: {},
      deliveries: {},
      receiptIngress: {},
      deviceProofVerifier: {},
    },
    {
      deviceSessions: sessions,
      voiceCandidates: new VoiceCandidateNetworkBoundary(intake),
    },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

test('derives W07 candidate context only from current authenticated W14 gateway/device state', async () => {
  const sessions = new FakeDeviceSessions();
  let observed: unknown = null;
  const route = handler(sessions, {
    evaluate: (input) => {
      observed = input;
      return {
        ok: true,
        acceptedForEvaluation: true,
        gate: { executionEligible: true, mustNotCrossNetwork: 'private' },
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      };
    },
  });

  const result = await route.handle(requestInput());
  assert.equal(result.statusCode, 202);
  assert.deepEqual(result.body, {
    ok: true,
    acceptedForEvaluation: true,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  });
  assert.deepEqual(observed, {
    candidate,
    context: {
      tenantId: TENANT,
      actorIdentityId: ACTOR,
      correlationId: CORRELATION,
      gatewaySessionId: GATEWAY_SESSION_ID,
      connectionId: CONNECTION_ID,
      deviceSessionId: DEVICE_SESSION_ID,
      deviceId: DEVICE_ID,
      registrationVersion: 3,
    },
  });
  assert.equal(JSON.stringify(result.body).includes('executionEligible'), false);
  assert.equal(JSON.stringify(result.body).includes('mustNotCrossNetwork'), false);
});

test('rejects Android identity, policy, trust, outcome and retry injection before W07 intake', async () => {
  const sessions = new FakeDeviceSessions();
  let intakeCalls = 0;
  const route = handler(sessions, {
    evaluate: () => {
      intakeCalls += 1;
      return null;
    },
  });

  for (const injected of [
    { tenantId: 'ten_forged' },
    { actorIdentityId: 'idn_forged' },
    { policyTokenId: 'tok_forged' },
    { deviceTrust: 'TRUSTED' },
    { serverTime: NOW },
    { provesExecutionSuccess: true },
    { retryAuthorized: true },
  ]) {
    const result = await route.handle(requestInput({ ...candidate, ...injected }));
    assert.equal(result.statusCode, 400);
    assert.equal(isRecord(result.body), true);
    if (!isRecord(result.body)) throw new Error('voice response must be an object');
    assert.equal(result.body.authorizesExecution, false);
    assert.equal(result.body.provesExecutionSuccess, false);
    assert.equal(result.body.retryAuthorized, false);
  }
  assert.equal(intakeCalls, 0);
});

test('fails closed before W07 when W14 device-session binding is absent', async () => {
  const sessions = new FakeDeviceSessions();
  let intakeCalls = 0;
  const route = handler(sessions, {
    evaluate: () => {
      intakeCalls += 1;
      return null;
    },
  });
  const input = requestInput();
  delete input.connectionState.deviceSessionId;

  const result = await route.handle(input);
  assert.equal(result.statusCode, 409);
  assert.equal(sessions.calls, 0);
  assert.equal(intakeCalls, 0);
  assert.equal(isRecord(result.body), true);
  if (!isRecord(result.body)) throw new Error('voice response must be an object');
  assert.equal(result.body.authorizesExecution, false);
  assert.equal(result.body.retryAuthorized, false);
});

test('fails closed when current W14 trust is revoked, stale, or bound to a different DeviceRef', async () => {
  for (const mutation of [
    { state: 'REVOKED' },
    { executionPreconditionSatisfied: false },
    { gatewayAuthExpiresAtMs: NOW },
    {
      deviceRef: {
        kind: 'AURORA_DEVICE',
        deviceId: DEVICE_ID,
        tenantId: TENANT,
        registrationVersion: 4,
      },
    },
  ]) {
    const sessions = new FakeDeviceSessions();
    sessions.snapshot = { ...sessions.snapshot, ...mutation };
    let intakeCalls = 0;
    const route = handler(sessions, {
      evaluate: () => {
        intakeCalls += 1;
        return null;
      },
    });

    const result = await route.handle(requestInput());
    assert.equal(result.statusCode, 409);
    assert.equal(intakeCalls, 0);
    assert.equal(isRecord(result.body), true);
    if (!isRecord(result.body)) throw new Error('voice response must be an object');
    assert.equal(result.body.authorizesExecution, false);
    assert.equal(result.body.provesExecutionSuccess, false);
    assert.equal(result.body.retryAuthorized, false);
  }
});

test('fails closed on stale authenticated socket binding without reading device trust', async () => {
  const sessions = new FakeDeviceSessions();
  let intakeCalls = 0;
  const route = handler(sessions, {
    evaluate: () => {
      intakeCalls += 1;
      return null;
    },
  });
  const input = requestInput();
  input.socketBinding = { ...input.socketBinding, connectionId: 'stale-connection' };

  const result = await route.handle(input);
  assert.equal(result.statusCode, 409);
  assert.equal(sessions.calls, 0);
  assert.equal(intakeCalls, 0);
});

test('adds only the governed voice route while preserving the accepted W14 route allowlist', () => {
  const sessions = new FakeDeviceSessions();
  const route = handler(sessions, { evaluate: () => null });
  assert.equal(route.isRoute(VOICE_CANDIDATE_DEVICE_ROUTE), true);
  assert.equal(route.isRoute('/v1/device/commands/claim'), true);
  assert.equal(route.isRoute('/v1/not-allowlisted'), false);
});
