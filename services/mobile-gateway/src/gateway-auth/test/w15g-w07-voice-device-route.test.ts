// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import test from 'node:test';

import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';

import {
  GatewayVoiceDevicePlaneNetworkHandler,
  OFFLINE_CURRENT_DEVICE_ROUTE,
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
  const base = requestInput();
  const input: GatewayDevicePlaneHandleInput = {
    ...base,
    socketBinding: { ...base.socketBinding, connectionId: 'stale-connection' },
  };

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

const OFFLINE_COMMAND_ID = 'cmd_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const OFFLINE_OTHER_COMMAND_ID = 'cmd_01ARZ3NDEKTSV4RRFFQ69G5FAW';
const OFFLINE_EXECUTION_ID = 'exe_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const OFFLINE_OTHER_EXECUTION_ID = 'exe_01ARZ3NDEKTSV4RRFFQ69G5FAW';
const OFFLINE_ACTION_INTENT_ID = 'act_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const OFFLINE_CIRCUIT_KEY = 'device:audio:volume';
const OFFLINE_KEY = `w14f:${OFFLINE_COMMAND_ID}`;

function offlineAuthorization(executionId = OFFLINE_EXECUTION_ID) {
  return {
    kind: 'W07_DEVICE_EXECUTION_AUTHORIZATION' as const,
    executionId,
    tenantId: TENANT,
    deviceId: DEVICE_ID,
    capabilityId: 'device.audio.volume',
    targetKind: 'DEVICE' as const,
    authoritySource: 'W07_CURRENT_EXECUTION_AUTHORITY' as const,
    actionId: 'AUDIO_VOLUME_STEP_UP',
    arguments: {},
    authorizedAtMs: NOW - 100,
    expiresAtMs: NOW + 1_000,
    authorizesExecution: true as const,
    cancelled: false as const,
  };
}

function defaultOfflineDelivery(): Record<string, unknown> {
  return {
    idempotencyKey: OFFLINE_KEY,
    commandId: OFFLINE_COMMAND_ID,
    executionId: OFFLINE_EXECUTION_ID,
    tenantId: TENANT,
    deviceId: DEVICE_ID,
    correlationId: CORRELATION,
    state: 'INFLIGHT',
  };
}

function defaultOfflineAttempt(): Record<string, unknown> {
  return {
    tenantId: TENANT,
    actionIntentId: OFFLINE_ACTION_INTENT_ID,
    executionRef: OFFLINE_EXECUTION_ID,
    attemptNumber: 1,
    maxAttempts: 1,
    version: 1,
    updatedAt: new Date(NOW - 100).toISOString(),
  };
}

function defaultOfflineIdentity(): Record<string, unknown> {
  return {
    actionIntentId: OFFLINE_ACTION_INTENT_ID,
    canonicalPayloadHash: `sha256:${'a'.repeat(64)}`,
    circuitKey: OFFLINE_CIRCUIT_KEY,
    authorizesExecution: false,
  };
}

function defaultOfflineContainment(): Record<string, unknown> {
  return {
    tenantId: TENANT,
    circuitKey: OFFLINE_CIRCUIT_KEY,
    version: 1,
    updatedAt: new Date(NOW - 100).toISOString(),
    snapshot: {
      circuit: { state: 'CLOSED' },
      killSwitch: { state: 'INACTIVE' },
      dependencyHealth: 'HEALTHY',
      cancellationRequested: false,
      currentInFlight: 0,
      maxInFlight: 1,
      retryDepth: 0,
      maxRetryDepth: 0,
    },
    authorizesExecution: false,
  };
}

type OfflineFixtureOptions = Readonly<{
  sessions?: FakeDeviceSessions;
  delivery?: Record<string, unknown> | null;
  attempt?: Record<string, unknown> | null;
  identity?: Record<string, unknown> | null;
  containment?: Record<string, unknown> | null;
  authorization?: ReturnType<typeof offlineAuthorization> | null;
}>;

function offlineFixture(options: OfflineFixtureOptions = {}) {
  const sessions = options.sessions ?? new FakeDeviceSessions();
  const authorization = Object.prototype.hasOwnProperty.call(options, 'authorization')
    ? (options.authorization ?? null)
    : offlineAuthorization();
  const boundary = new VoiceCandidateNetworkBoundary({
    evaluate: () => null,
    currentExecutionAuthorization: () => authorization,
  });
  const route = new GatewayVoiceDevicePlaneNetworkHandler(
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
      voiceCandidates: boundary,
      deliveries: {
        get: () =>
          options.delivery === null
            ? { ok: false }
            : { ok: true, value: options.delivery ?? defaultOfflineDelivery() },
      },
      currentAttemptQuota: {
        lookup: () => (options.attempt === undefined ? defaultOfflineAttempt() : options.attempt),
      },
      offlineExecutionIdentity: {
        current: () =>
          options.identity === undefined ? defaultOfflineIdentity() : options.identity,
      },
      currentContainment: {
        resolveCurrent: () =>
          options.containment === undefined ? defaultOfflineContainment() : options.containment,
      },
    },
  );
  return { route, sessions };
}

function offlineInput(body: Readonly<Record<string, unknown>> = { idempotencyKey: OFFLINE_KEY }) {
  return { ...requestInput(body), path: OFFLINE_CURRENT_DEVICE_ROUTE };
}

function responseValue(
  result: Awaited<ReturnType<GatewayVoiceDevicePlaneNetworkHandler['handle']>>,
) {
  assert.equal(isRecord(result.body), true);
  if (!isRecord(result.body) || !isRecord(result.body.value)) throw new Error('offline response');
  return result.body.value;
}

test('offline current projects current W03/W07/W14 state and ignores delivery INFLIGHT as safe-defer authority', async () => {
  const { route } = offlineFixture();
  const result = await route.handle(offlineInput());
  assert.equal(result.statusCode, 200);
  const value = responseValue(result);
  const body = result.body;
  if (!isRecord(body)) throw new Error('offline response');
  assert.equal(body.authorizesExecution, false);
  assert.equal(body.provesExecutionSuccess, false);
  assert.equal(body.retryAuthorized, false);
  assert.equal(value.authorizesExecution, false);
  assert.equal(value.provesExecutionSuccess, false);
  assert.equal(value.retryAuthorized, false);
  assert.equal(isRecord(value.w03), true);
  if (!isRecord(value.w03)) throw new Error('w03 projection');
  assert.equal(value.w03.state, 'ACCEPTED');
  assert.equal(value.w03.authorizesExecution, false);
  assert.equal(value.w03.retryAuthorized, false);
  assert.equal(isRecord(value.w14), true);
  if (!isRecord(value.w14)) throw new Error('w14 projection');
  assert.equal(value.w14.tenantId, TENANT);
  assert.equal(value.w14.deviceId, DEVICE_ID);
  assert.equal(value.w14.deviceSessionId, DEVICE_SESSION_ID);
  assert.equal(value.w14.gatewaySessionId, GATEWAY_SESSION_ID);
  assert.equal(value.w14.connectionId, CONNECTION_ID);
  assert.equal(value.w14.gatewayGeneration, 2);
  assert.equal(value.w14.registrationVersion, 3);
  assert.equal(value.w14.authorizesExecution, false);
  assert.equal(value.w14.canGrantPermission, false);
  assert.equal(value.w14.retryAuthorized, false);
  assert.equal(isRecord(value.executionAuthorization), true);
});

test('offline current maps current W03 containment in-flight to reconciliation-only state', async () => {
  const containment = defaultOfflineContainment();
  const snapshot = containment.snapshot;
  if (!isRecord(snapshot)) throw new Error('containment fixture');
  containment.snapshot = { ...snapshot, currentInFlight: 1 };
  const { route } = offlineFixture({ containment });
  const result = await route.handle(offlineInput());
  assert.equal(result.statusCode, 200);
  const value = responseValue(result);
  if (!isRecord(value.w03)) throw new Error('w03 projection');
  assert.equal(value.w03.state, 'INFLIGHT');
  assert.equal(value.w03.retryAuthorized, false);
});

test('offline current fails closed when current W03 attempt/quota is missing or belongs to another tenant', async () => {
  for (const attempt of [
    null,
    { ...defaultOfflineAttempt(), tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAW' },
  ]) {
    const { route } = offlineFixture({ attempt });
    const result = await route.handle(offlineInput());
    assert.equal(result.statusCode, 409);
    assert.equal(isRecord(result.body), true);
    if (!isRecord(result.body)) throw new Error('offline error');
    assert.equal(result.body.authorizesExecution, false);
    assert.equal(result.body.provesExecutionSuccess, false);
    assert.equal(result.body.retryAuthorized, false);
  }
});

test('offline current rejects wrong command/execution owner binding', async () => {
  for (const delivery of [
    { ...defaultOfflineDelivery(), commandId: OFFLINE_OTHER_COMMAND_ID },
    { ...defaultOfflineDelivery(), executionId: OFFLINE_OTHER_EXECUTION_ID },
  ]) {
    const { route } = offlineFixture({ delivery });
    const result = await route.handle(offlineInput());
    assert.equal(result.statusCode, 409);
  }
});

test('offline current returns no execution authorization when W07 authority is missing or stale', async () => {
  const stale = { ...offlineAuthorization(), expiresAtMs: NOW };
  for (const authorization of [null, stale]) {
    const { route } = offlineFixture({ authorization });
    const result = await route.handle(offlineInput());
    assert.equal(result.statusCode, 200);
    const value = responseValue(result);
    assert.equal(value.executionAuthorization, null);
    assert.equal(value.authorizesExecution, false);
    assert.equal(value.retryAuthorized, false);
  }
});

test('offline current rejects a non-current W14 session before reading owner projections', async () => {
  const sessions = new FakeDeviceSessions();
  sessions.snapshot = { ...trustSnapshot(), deviceSessionId: 'device-session-other' };
  const { route } = offlineFixture({ sessions });
  const result = await route.handle(offlineInput());
  assert.equal(result.statusCode, 409);
  assert.equal(isRecord(result.body), true);
  if (!isRecord(result.body)) throw new Error('offline error');
  assert.equal(result.body.authorizesExecution, false);
  assert.equal(result.body.provesExecutionSuccess, false);
  assert.equal(result.body.retryAuthorized, false);
});

test('offline current rejects malformed and authority-injecting request bodies', async () => {
  const { route } = offlineFixture();
  for (const body of [
    { idempotencyKey: 'forged' },
    { idempotencyKey: OFFLINE_KEY, retryAuthorized: true },
    { idempotencyKey: OFFLINE_KEY, authorizesExecution: true },
  ]) {
    const result = await route.handle(offlineInput(body));
    assert.equal(result.statusCode, 409);
    assert.equal(isRecord(result.body), true);
    if (!isRecord(result.body)) throw new Error('offline error');
    assert.equal(result.body.authorizesExecution, false);
    assert.equal(result.body.provesExecutionSuccess, false);
    assert.equal(result.body.retryAuthorized, false);
  }
});

test('offline current fails closed for malformed or mismatched containment instead of inventing safe deferral', async () => {
  for (const containment of [
    null,
    { ...defaultOfflineContainment(), tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAW' },
    { ...defaultOfflineContainment(), circuitKey: 'device:other' },
    { ...defaultOfflineContainment(), snapshot: { circuit: { state: 'CLOSED' } } },
  ]) {
    const { route } = offlineFixture({ containment });
    const result = await route.handle(offlineInput());
    assert.equal(result.statusCode, 409);
  }
});
