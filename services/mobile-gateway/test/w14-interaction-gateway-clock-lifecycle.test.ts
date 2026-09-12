// @ts-expect-error -- mobile-gateway harness intentionally has no @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway harness intentionally has no @types/node.
import test from 'node:test';

import type {
  CorrelationId,
  IdentityId,
  InteractionSessionId,
  InteractionTurnId,
  TenantId,
} from '@aurora/contracts/ids';

import { DeviceSessionTrustManager } from '../src/device-session/index.js';
import type { DeviceId, DeviceRegistrationRecord } from '../src/device/types.js';
import { GatewaySessionManager, GATEWAY_PROTOCOL_VERSION } from '../src/gateway-auth/index.js';
import type { GatewayAuthenticator } from '../src/gateway-auth/types.js';
import { InteractionGatewayAdapter } from '../src/interaction-gateway/index.js';
import { InteractionSessionManager } from '../src/interaction-session/index.js';
import type {
  InteractionSessionIdFactory,
  InteractionSessionStore,
  StoredInteractionSession,
} from '../src/interaction-session/types.js';

const TENANT = 'ten_01JW14V0170000000000000000' as TenantId;
const IDENTITY = 'idn_01JW14V0170000000000000000' as IdentityId;
const CORRELATION = 'cor_01JW14V0170000000000000000' as CorrelationId;
const DEVICE_ID = 'dvc_01JW14V0170000000000000000' as DeviceId;
const GATEWAY_SESSION_ID = 'gateway:interaction:clock-lifecycle';
const DEVICE_SESSION_ID = 'device-session:interaction:clock-lifecycle';
const CREDENTIAL = 'interaction-clock-lifecycle-credential';

class MemoryStore implements InteractionSessionStore {
  readonly records = new Map<InteractionSessionId, StoredInteractionSession>();
  readonly reservedTurnIds = new Set<InteractionTurnId>();

  read(interactionSessionId: InteractionSessionId): StoredInteractionSession | null {
    return this.records.get(interactionSessionId) ?? null;
  }

  create(initial: StoredInteractionSession): boolean {
    if (this.records.has(initial.session.interactionSessionId)) return false;
    this.records.set(initial.session.interactionSessionId, initial);
    return true;
  }

  reserveTurnId(interactionTurnId: InteractionTurnId): boolean {
    if (this.reservedTurnIds.has(interactionTurnId)) return false;
    this.reservedTurnIds.add(interactionTurnId);
    return true;
  }

  compareAndSwap(
    interactionSessionId: InteractionSessionId,
    expectedRevision: number,
    next: StoredInteractionSession,
  ): boolean {
    const current = this.records.get(interactionSessionId);
    if (current === undefined || current.revision !== expectedRevision) return false;
    this.records.set(interactionSessionId, next);
    return true;
  }
}

function ids(): InteractionSessionIdFactory {
  let session = 0;
  let turn = 0;
  return {
    sessionId: () => `ins_${String(++session).padStart(26, '0')}` as InteractionSessionId,
    turnId: () => `itr_${String(++turn).padStart(26, '0')}` as InteractionTurnId,
  };
}

function deviceRecord(): DeviceRegistrationRecord {
  return {
    kind: 'DeviceRegistrationRecord',
    schemaVersion: '1.0.0',
    ref: {
      kind: 'AURORA_DEVICE',
      deviceId: DEVICE_ID,
      tenantId: TENANT,
      registrationVersion: 1,
    },
    boundIdentityId: IDENTITY,
    state: 'ACTIVE',
    registeredAt: '2026-09-12T13:00:00.000Z',
    updatedAt: '2026-09-12T13:00:00.000Z',
    provenance: {
      source: 'W14_DEVICE_REGISTRATION',
      reference: 'test:interaction-clock-lifecycle',
      observedAt: '2026-09-12T13:00:00.000Z',
    },
    authoritySemantics: 'DEVICE_REGISTRATION_ONLY_NO_ACTION_AUTHORITY',
    authorizesExecution: false,
    canGrantPermission: false,
  };
}

function authenticator(): GatewayAuthenticator {
  return {
    verify(credential) {
      if (credential !== CREDENTIAL) return null;
      return {
        tenantId: TENANT,
        actorIdentityId: IDENTITY,
        actorKind: 'HUMAN',
        correlationId: CORRELATION,
        gatewaySessionId: GATEWAY_SESSION_ID,
        issuedAtMs: 500,
        expiresAtMs: 10_000,
        authVersion: 'clock-lifecycle-v1',
      };
    },
  };
}

interface Harness {
  readonly gateway: GatewaySessionManager;
  readonly deviceTrust: DeviceSessionTrustManager;
  readonly interaction: InteractionSessionManager;
  readonly store: MemoryStore;
  readonly connectionId: string;
  setInteractionNow(value: number): void;
  adapter(clock: () => number): InteractionGatewayAdapter;
  request(clientNowMs?: number, deadlineMs?: number): Record<string, unknown>;
}

function harness(): Harness {
  const gateway = new GatewaySessionManager(authenticator());
  const openedGateway = gateway.openSession({
    protocolVersion: GATEWAY_PROTOCOL_VERSION,
    sessionId: GATEWAY_SESSION_ID,
    credential: CREDENTIAL,
    tenantId: TENANT,
    actor: { kind: 'HUMAN', identityId: IDENTITY },
    correlation: { correlationId: CORRELATION },
    nowMs: 1_000,
  });
  assert.equal(openedGateway.ok, true);
  if (!openedGateway.ok) throw new Error(openedGateway.error.message);

  const deviceTrust = new DeviceSessionTrustManager();
  const openedDevice = deviceTrust.openSession({
    deviceSessionId: DEVICE_SESSION_ID,
    gatewaySession: openedGateway.value,
    deviceRecord: deviceRecord(),
    attestation: {
      kind: 'DEVICE_ATTESTATION_REFERENCE',
      reference: 'attestation:interaction-clock-lifecycle',
      provider: 'test-provider',
      version: '1',
      state: 'VERIFIED',
      observedAtMs: 1_000,
      expiresAtMs: 10_000,
    },
    nowMs: 1_000,
  });
  assert.equal(openedDevice.ok, true);
  if (!openedDevice.ok) throw new Error(openedDevice.error.message);

  const store = new MemoryStore();
  let interactionNow = 1_000;
  const interaction = new InteractionSessionManager(store, ids(), () => interactionNow);
  let requestIndex = 0;

  return {
    gateway,
    deviceTrust,
    interaction,
    store,
    connectionId: openedGateway.value.connectionId,
    setInteractionNow(value: number) {
      interactionNow = value;
    },
    adapter(clock: () => number) {
      return new InteractionGatewayAdapter(gateway, deviceTrust, interaction, {
        ingressDataClassification: 'CONFIDENTIAL',
        clock,
      });
    },
    request(clientNowMs = 1_000, deadlineMs = 20_000) {
      requestIndex += 1;
      return {
        protocolVersion: GATEWAY_PROTOCOL_VERSION,
        sessionId: GATEWAY_SESSION_ID,
        connectionId: openedGateway.value.connectionId,
        requestId: `clock-lifecycle-request:${requestIndex}`,
        tenantId: TENANT,
        actorIdentityId: IDENTITY,
        correlationId: CORRELATION,
        deadlineMs,
        nowMs: clientNowMs,
      };
    },
  };
}

function openInteraction(rt: Harness, adapter: InteractionGatewayAdapter) {
  const opened = adapter.open({
    gatewayRequest: rt.request(),
    deviceSessionId: DEVICE_SESSION_ID,
    modality: 'VOICE',
  });
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error(opened.message);
  return opened.value;
}

test('client nowMs cannot make an expired authenticated session current again', () => {
  const rt = harness();
  const adapter = rt.adapter(() => 12_000);
  const result = adapter.open({
    gatewayRequest: rt.request(1_000, 20_000),
    deviceSessionId: DEVICE_SESSION_ID,
    modality: 'VOICE',
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'GATEWAY_REQUEST_REJECTED');
  assert.equal(result.causeCode, 'AUTH_EXPIRED');
  assert.equal(result.requestCompleted, false);
  assert.equal(rt.store.records.size, 0);
});

test('fresh completion clock detects expiry during a mutating operation and requires reconciliation', () => {
  const rt = harness();
  const clockValues = [2_000, 12_000];
  let last = 12_000;
  const adapter = rt.adapter(() => {
    const next = clockValues.shift();
    if (next !== undefined) last = next;
    return last;
  });

  const result = adapter.open({
    gatewayRequest: rt.request(1_000, 20_000),
    deviceSessionId: DEVICE_SESSION_ID,
    modality: 'VOICE',
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'REQUEST_COMPLETION_FAILED');
  assert.equal(result.requestCompleted, false);
  assert.equal(result.requiresStateReconciliation, true);
  assert.equal(result.retryAuthorized, false);
  assert.equal(rt.store.records.size, 1);
});

test('suspend resume and end succeed through authenticated gateway and current device trust', () => {
  const rt = harness();
  const adapter = rt.adapter(() => 2_000);
  const opened = openInteraction(rt, adapter);

  const suspended = adapter.suspend({
    gatewayRequest: rt.request(),
    deviceSessionId: DEVICE_SESSION_ID,
    interactionSessionId: opened.session.interactionSessionId,
    resumeWindowMs: 5_000,
  });
  assert.equal(suspended.ok, true);
  if (!suspended.ok) return;
  assert.equal(suspended.value.session.state, 'SUSPENDED');
  assert.equal(suspended.requestCompleted, true);
  assert.equal(suspended.requiresStateReconciliation, false);

  rt.setInteractionNow(1_500);
  const resumed = adapter.resume({
    gatewayRequest: rt.request(),
    deviceSessionId: DEVICE_SESSION_ID,
    interactionSessionId: opened.session.interactionSessionId,
  });
  assert.equal(resumed.ok, true);
  if (!resumed.ok) return;
  assert.equal(resumed.value.session.state, 'ACTIVE');

  const ended = adapter.end({
    gatewayRequest: rt.request(),
    deviceSessionId: DEVICE_SESSION_ID,
    interactionSessionId: opened.session.interactionSessionId,
  });
  assert.equal(ended.ok, true);
  if (!ended.ok) return;
  assert.equal(ended.value.session.state, 'ENDED');
  assert.equal(ended.requestCompleted, true);
});

test('suspend rejection is fail-closed and conservatively requires reconciliation for a mutating route', () => {
  const rt = harness();
  const adapter = rt.adapter(() => 2_000);
  const opened = openInteraction(rt, adapter);
  const result = adapter.suspend({
    gatewayRequest: rt.request(),
    deviceSessionId: DEVICE_SESSION_ID,
    interactionSessionId: opened.session.interactionSessionId,
    resumeWindowMs: 999,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'INTERACTION_REJECTED');
  assert.equal(result.causeCode, 'INVALID_RESUME_WINDOW');
  assert.equal(result.requestCompleted, true);
  assert.equal(result.requiresStateReconciliation, true);
  assert.equal(result.retryAuthorized, false);
});

test('expired resume persists non-resumable state and adapter marks reconciliation even though manager error is non-retryable', () => {
  const rt = harness();
  const adapter = rt.adapter(() => 2_000);
  const opened = openInteraction(rt, adapter);
  const suspended = adapter.suspend({
    gatewayRequest: rt.request(),
    deviceSessionId: DEVICE_SESSION_ID,
    interactionSessionId: opened.session.interactionSessionId,
    resumeWindowMs: 1_000,
  });
  assert.equal(suspended.ok, true);

  rt.setInteractionNow(2_000);
  const result = adapter.resume({
    gatewayRequest: rt.request(),
    deviceSessionId: DEVICE_SESSION_ID,
    interactionSessionId: opened.session.interactionSessionId,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'INTERACTION_REJECTED');
  assert.equal(result.causeCode, 'RESUME_EXPIRED');
  assert.equal(result.retryable, false);
  assert.equal(result.requiresStateReconciliation, true);
  const stored = rt.store.records.get(opened.session.interactionSessionId);
  assert.deepEqual(stored?.session.resume, { resumable: false });
});

test('end mutation requires reconciliation when authentication expires before completion', () => {
  const rt = harness();
  const stable = rt.adapter(() => 2_000);
  const opened = openInteraction(rt, stable);
  const clockValues = [2_000, 12_000];
  let last = 12_000;
  const expiring = rt.adapter(() => {
    const next = clockValues.shift();
    if (next !== undefined) last = next;
    return last;
  });

  const result = expiring.end({
    gatewayRequest: rt.request(1_000, 20_000),
    deviceSessionId: DEVICE_SESSION_ID,
    interactionSessionId: opened.session.interactionSessionId,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, 'REQUEST_COMPLETION_FAILED');
  assert.equal(result.requiresStateReconciliation, true);
  assert.equal(result.retryAuthorized, false);
  assert.equal(rt.store.records.get(opened.session.interactionSessionId)?.session.state, 'ENDED');
});
