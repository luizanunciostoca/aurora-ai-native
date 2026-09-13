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
import type { DeviceRegistrationRecord, DeviceId } from '../src/device/types.js';
import { GatewaySessionManager, GATEWAY_PROTOCOL_VERSION } from '../src/gateway-auth/index.js';
import type {
  GatewayAuthenticator,
  GatewayProtocolResult,
  GatewayRequestSnapshot,
} from '../src/gateway-auth/types.js';
import { InteractionGatewayAdapter } from '../src/interaction-gateway/index.js';
import { InteractionSessionManager } from '../src/interaction-session/index.js';
import type {
  InteractionSessionIdFactory,
  InteractionSessionStore,
  StoredInteractionSession,
} from '../src/interaction-session/types.js';

const TENANT = 'ten_01JW14V0170000000000000000' as TenantId;
const TENANT_B = 'ten_01JW14V0170000000000000001' as TenantId;
const IDENTITY = 'idn_01JW14V0170000000000000000' as IdentityId;
const CORRELATION = 'cor_01JW14V0170000000000000000' as CorrelationId;
const CORRELATION_B = 'cor_01JW14V0170000000000000001' as CorrelationId;
const DEVICE_ID = 'dvc_01JW14V0170000000000000000' as DeviceId;
const GATEWAY_SESSION_ID = 'gateway:interaction:test';
const DEVICE_SESSION_ID = 'device-session:interaction:test';
const CREDENTIAL = 'interaction-test-credential';

class MemoryInteractionStore implements InteractionSessionStore {
  readonly records = new Map<InteractionSessionId, StoredInteractionSession>();
  readonly reservedTurnIds = new Set<InteractionTurnId>();
  rejectNextCas = false;

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
    if (this.rejectNextCas) {
      this.rejectNextCas = false;
      return false;
    }
    const current = this.records.get(interactionSessionId);
    if (current === undefined || current.revision !== expectedRevision) return false;
    this.records.set(interactionSessionId, next);
    return true;
  }
}

function interactionIds(): InteractionSessionIdFactory {
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
      registrationVersion: 7,
    },
    boundIdentityId: IDENTITY,
    state: 'ACTIVE',
    registeredAt: '2026-09-12T13:00:00.000Z',
    updatedAt: '2026-09-12T13:00:00.000Z',
    provenance: {
      source: 'W14_DEVICE_REGISTRATION',
      reference: 'test:interaction-gateway',
      observedAt: '2026-09-12T13:00:00.000Z',
    },
    authoritySemantics: 'DEVICE_REGISTRATION_ONLY_NO_ACTION_AUTHORITY',
    authorizesExecution: false,
    canGrantPermission: false,
  };
}

function authenticator(): GatewayAuthenticator {
  return {
    verify(credential, nowMs) {
      if (credential !== CREDENTIAL) return null;
      return {
        tenantId: TENANT,
        actorIdentityId: IDENTITY,
        actorKind: 'HUMAN',
        correlationId: CORRELATION,
        gatewaySessionId: GATEWAY_SESSION_ID,
        issuedAtMs: nowMs - 100,
        expiresAtMs: nowMs + 600_000,
        authVersion: 'test-v1',
      };
    },
  };
}

interface Runtime {
  readonly adapter: InteractionGatewayAdapter;
  readonly gateway: GatewaySessionManager;
  readonly deviceTrust: DeviceSessionTrustManager;
  readonly interaction: InteractionSessionManager;
  readonly store: MemoryInteractionStore;
  readonly connectionId: string;
  request(nowMs?: number): Record<string, unknown>;
}

function runtime(): Runtime {
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
      reference: 'attestation:interaction-test',
      provider: 'test-provider',
      version: '1',
      state: 'VERIFIED',
      observedAtMs: 1_000,
      expiresAtMs: 600_000,
    },
    nowMs: 1_000,
  });
  assert.equal(openedDevice.ok, true);
  if (!openedDevice.ok) throw new Error(openedDevice.error.message);

  const store = new MemoryInteractionStore();
  let interactionNow = 1_000;
  const interaction = new InteractionSessionManager(
    store,
    interactionIds(),
    () => ++interactionNow,
  );
  const adapter = new InteractionGatewayAdapter(gateway, deviceTrust, interaction, {
    ingressDataClassification: 'CONFIDENTIAL',
    clock: () => 2_000,
  });
  let requestIndex = 0;
  return {
    adapter,
    gateway,
    deviceTrust,
    interaction,
    store,
    connectionId: openedGateway.value.connectionId,
    request(nowMs = 2_000) {
      requestIndex += 1;
      return {
        protocolVersion: GATEWAY_PROTOCOL_VERSION,
        sessionId: GATEWAY_SESSION_ID,
        connectionId: openedGateway.value.connectionId,
        requestId: `interaction-request:${requestIndex}`,
        tenantId: TENANT,
        actorIdentityId: IDENTITY,
        correlationId: CORRELATION,
        deadlineMs: nowMs + 30_000,
        nowMs,
      };
    },
  };
}

function openInteraction(rt: Runtime, nowMs = 2_000) {
  const result = rt.adapter.open({
    gatewayRequest: rt.request(nowMs),
    deviceSessionId: DEVICE_SESSION_ID,
    modality: 'VOICE',
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

test('W14 adapter derives device participant and server-owned interaction metadata', () => {
  const rt = runtime();
  const opened = openInteraction(rt);

  assert.equal(opened.session.tenantId, TENANT);
  assert.deepEqual(opened.session.participant, {
    kind: 'DEVICE',
    bindingReference: `device:${DEVICE_ID}:registration:7`,
  });
  assert.equal(opened.session.dataClassification, 'CONFIDENTIAL');
  assert.deepEqual(opened.session.references.artifactRefs, []);
  assert.deepEqual(opened.session.references.pendingHumanControlRequestRefs, []);
  assert.equal(opened.session.authorizesExecution, false);

  const gatewaySnapshot = rt.gateway.getSession(GATEWAY_SESSION_ID, 2_000);
  assert.equal(gatewaySnapshot.ok, true);
  if (gatewaySnapshot.ok) assert.equal(gatewaySnapshot.value.outstandingRequests, 0);
});

test('valid client ingress can append only a USER turn with trusted correlation', () => {
  const rt = runtime();
  const opened = openInteraction(rt);
  const appended = rt.adapter.appendUserTurn({
    gatewayRequest: rt.request(2_100),
    deviceSessionId: DEVICE_SESSION_ID,
    interactionSessionId: opened.session.interactionSessionId,
    modality: 'VOICE',
    content: {
      kind: 'TEXT',
      text: 'Aurora, qual é o estado atual?',
      languageTag: 'pt-BR',
      speechConfidence: 0.97,
    },
  });

  assert.equal(appended.ok, true);
  if (!appended.ok) return;
  assert.equal(appended.value.session.turns.length, 1);
  assert.equal(appended.value.session.turns[0]?.role, 'USER');
  assert.equal(appended.value.session.turns[0]?.correlationId, CORRELATION);
  assert.equal(appended.value.session.turns[0]?.dataClassification, 'CONFIDENTIAL');
  assert.equal(appended.authorizesExecution, false);
  assert.equal(appended.provesExecutionSuccess, false);
  assert.equal(appended.retryAuthorized, false);
});

test('client cannot inject Aurora role, canonical references, participant or raw audio', () => {
  const rt = runtime();
  const opened = openInteraction(rt);
  const request = rt.request(2_100);
  const base = {
    gatewayRequest: request,
    deviceSessionId: DEVICE_SESSION_ID,
    interactionSessionId: opened.session.interactionSessionId,
    modality: 'VOICE',
    content: { kind: 'TEXT', text: 'teste', languageTag: 'pt-BR' },
  };

  for (const extra of [
    { role: 'AURORA' },
    { references: { artifactRefs: ['forged'], pendingHumanControlRequestRefs: [] } },
    { participant: { kind: 'DEVICE', bindingReference: 'forged' } },
  ]) {
    const result = rt.adapter.appendUserTurn({ ...base, ...extra });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'MALFORMED_REQUEST');
  }

  const rawAudio = rt.adapter.appendUserTurn({
    ...base,
    content: { kind: 'TEXT', text: 'teste', languageTag: 'pt-BR', audio: 'raw-pcm' },
  });
  assert.equal(rawAudio.ok, false);
  if (!rawAudio.ok) assert.equal(rawAudio.code, 'MALFORMED_REQUEST');

  const validWithSameRequestId = rt.adapter.appendUserTurn(base);
  assert.equal(validWithSameRequestId.ok, true);
});

test('transcript boundary is fail-closed before the gateway request is consumed', () => {
  const rt = runtime();
  const opened = openInteraction(rt);
  const request = rt.request(2_100);
  const tooLong = rt.adapter.appendUserTurn({
    gatewayRequest: request,
    deviceSessionId: DEVICE_SESSION_ID,
    interactionSessionId: opened.session.interactionSessionId,
    modality: 'VOICE',
    content: { kind: 'TEXT', text: 'x'.repeat(4_097), languageTag: 'pt-BR' },
  });
  assert.equal(tooLong.ok, false);
  if (!tooLong.ok) assert.equal(tooLong.code, 'MALFORMED_REQUEST');

  const boundary = rt.adapter.appendUserTurn({
    gatewayRequest: request,
    deviceSessionId: DEVICE_SESSION_ID,
    interactionSessionId: opened.session.interactionSessionId,
    modality: 'VOICE',
    content: { kind: 'TEXT', text: 'x'.repeat(4_096), languageTag: 'pt-BR' },
  });
  assert.equal(boundary.ok, true);
});

test('spoofed tenant is rejected by authenticated gateway before interaction mutation', () => {
  const rt = runtime();
  const gatewayRequest = rt.request(2_000);
  const result = rt.adapter.open({
    gatewayRequest: { ...gatewayRequest, tenantId: TENANT_B },
    deviceSessionId: DEVICE_SESSION_ID,
    modality: 'VOICE',
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'GATEWAY_REQUEST_REJECTED');
    assert.equal(result.causeCode, 'TENANT_MISMATCH');
    assert.equal(result.requestCompleted, false);
    assert.equal(result.retryAuthorized, false);
  }
  assert.equal(rt.store.records.size, 0);
});

test('missing physical trust is rejected but the authenticated request is completed', () => {
  const rt = runtime();
  const result = rt.adapter.open({
    gatewayRequest: rt.request(2_000),
    deviceSessionId: 'device-session:missing',
    modality: 'VOICE',
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'DEVICE_SESSION_REJECTED');
    assert.equal(result.causeCode, 'SESSION_NOT_FOUND');
    assert.equal(result.requestCompleted, true);
  }
  const gatewaySnapshot = rt.gateway.getSession(GATEWAY_SESSION_ID, 2_000);
  assert.equal(gatewaySnapshot.ok, true);
  if (gatewaySnapshot.ok) assert.equal(gatewaySnapshot.value.outstandingRequests, 0);
});

test('revoked device session cannot continue conversational ingress', () => {
  const rt = runtime();
  const opened = openInteraction(rt);
  const revoked = rt.deviceTrust.revokeSession({
    deviceSessionId: DEVICE_SESSION_ID,
    connectionId: rt.connectionId,
    revokedAtMs: 1_950,
    reasonReference: 'test:revoked',
  });
  assert.equal(revoked.ok, true);

  const result = rt.adapter.current({
    gatewayRequest: rt.request(2_100),
    deviceSessionId: DEVICE_SESSION_ID,
    interactionSessionId: opened.session.interactionSessionId,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'DEVICE_SESSION_REJECTED');
    assert.equal(result.causeCode, 'DEVICE_SESSION_NOT_ACTIVE');
    assert.equal(result.requestCompleted, true);
  }
});

test('adapter independently rejects a gateway/device binding mismatch', () => {
  const rt = runtime();
  const trust = rt.deviceTrust.getSession(DEVICE_SESSION_ID, rt.connectionId, 2_000);
  assert.equal(trust.ok, true);
  if (!trust.ok) return;
  const spoofTrust = {
    getSession() {
      return {
        ...trust,
        snapshot: { ...trust.snapshot, correlationId: CORRELATION_B },
      };
    },
  };
  const adapter = new InteractionGatewayAdapter(rt.gateway, spoofTrust, rt.interaction, {
    ingressDataClassification: 'CONFIDENTIAL',
    clock: () => 2_000,
  });
  const result = adapter.open({
    gatewayRequest: rt.request(2_100),
    deviceSessionId: DEVICE_SESSION_ID,
    modality: 'VOICE',
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'GATEWAY_DEVICE_BINDING_MISMATCH');
    assert.equal(result.requestCompleted, true);
  }
});

test('CAS conflict is recoverable only after reconciliation and never grants retry authority', () => {
  const rt = runtime();
  const opened = openInteraction(rt);
  rt.store.rejectNextCas = true;
  const result = rt.adapter.appendUserTurn({
    gatewayRequest: rt.request(2_100),
    deviceSessionId: DEVICE_SESSION_ID,
    interactionSessionId: opened.session.interactionSessionId,
    modality: 'VOICE',
    content: { kind: 'TEXT', text: 'conflito', languageTag: 'pt-BR' },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'INTERACTION_REJECTED');
    assert.equal(result.causeCode, 'REVISION_CONFLICT');
    assert.equal(result.retryable, true);
    assert.equal(result.retryAuthorized, false);
    assert.equal(result.requiresStateReconciliation, true);
    assert.equal(result.requestCompleted, true);
  }
});

test('request completion failure after mutation requires state reconciliation', () => {
  const rt = runtime();
  const completionFailGateway = {
    beginRequest(input: unknown): GatewayProtocolResult<GatewayRequestSnapshot> {
      return rt.gateway.beginRequest(input);
    },
    completeRequest(): GatewayProtocolResult<GatewayRequestSnapshot> {
      return {
        ok: false,
        error: {
          code: 'SESSION_CLOSED',
          message: 'synthetic completion failure',
          retryable: false,
        },
      };
    },
  };
  const adapter = new InteractionGatewayAdapter(
    completionFailGateway,
    rt.deviceTrust,
    rt.interaction,
    { ingressDataClassification: 'CONFIDENTIAL', clock: () => 2_000 },
  );
  const result = adapter.open({
    gatewayRequest: rt.request(2_000),
    deviceSessionId: DEVICE_SESSION_ID,
    modality: 'VOICE',
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'REQUEST_COMPLETION_FAILED');
    assert.equal(result.requestCompleted, false);
    assert.equal(result.requiresStateReconciliation, true);
    assert.equal(result.retryAuthorized, false);
  }
  assert.equal(rt.store.records.size, 1);
});
