// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import { Agent, request as httpRequest } from 'node:http';
// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import test from 'node:test';

import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';

import {
  GATEWAY_PROTOCOL_VERSION,
  GatewayDevicePlaneNetworkHandler,
  GatewayHttpNetworkTransport,
  GatewaySessionManager,
} from '../index.js';
import type { GatewayAuthClaims, GatewayAuthenticator, GatewaySessionSnapshot } from '../types.js';

const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId;
const ACTOR = 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV' as IdentityId;
const CORRELATION = 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CorrelationId;
const DEVICE_ID = 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const COMMAND_ID = 'cmd_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const EXECUTION_ID = 'exe_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const RECEIPT_ID = 'rcp_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const EVIDENCE_ID = 'evd_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const BASE_NOW = 1_788_500_000_000;

interface HttpResponseLike {
  readonly statusCode?: number;
  setEncoding(encoding: 'utf8'): void;
  on(event: 'data', listener: (chunk: string) => void): this;
  on(event: 'end', listener: () => void): this;
}

interface HttpRequestLike {
  on(event: 'error', listener: (error: Error) => void): this;
  end(body: string): void;
}

interface AgentLike {
  destroy(): void;
}

interface PostedResponse {
  readonly statusCode: number;
  readonly body: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function postJson(
  port: number,
  path: string,
  body: unknown,
  agent: object,
  method = 'POST',
): Promise<PostedResponse> {
  const rawBody = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        agent,
        headers: {
          connection: 'keep-alive',
          'content-type': 'application/json',
          'content-length': new TextEncoder().encode(rawBody).byteLength,
        },
      },
      (incoming: HttpResponseLike) => {
        let raw = '';
        incoming.setEncoding('utf8');
        incoming.on('data', (chunk) => {
          raw += chunk;
        });
        incoming.on('end', () => {
          try {
            resolve({ statusCode: incoming.statusCode ?? 0, body: JSON.parse(raw) as unknown });
          } catch (error) {
            reject(error instanceof Error ? error : new Error('response JSON parse failed'));
          }
        });
      },
    ) as HttpRequestLike;
    outgoing.on('error', reject);
    outgoing.end(rawBody);
  });
}

function devicePlaneCode(value: PostedResponse): string {
  if (!isRecord(value.body) || value.body.ok !== false || !isRecord(value.body.devicePlaneError)) {
    return '';
  }
  return typeof value.body.devicePlaneError.code === 'string' ? value.body.devicePlaneError.code : '';
}

function transportCode(value: PostedResponse): string {
  if (!isRecord(value.body) || value.body.ok !== false || !isRecord(value.body.transportError)) {
    return '';
  }
  return typeof value.body.transportError.code === 'string' ? value.body.transportError.code : '';
}

class FixtureAuthenticator implements GatewayAuthenticator {
  verify(credential: string): GatewayAuthClaims | null {
    if (credential !== 'credential:device') return null;
    return {
      tenantId: TENANT,
      actorIdentityId: ACTOR,
      issuedAtMs: BASE_NOW - 1_000,
      expiresAtMs: BASE_NOW + 120_000,
      authVersion: 'device-v1',
    };
  }
}

function openBody(): Record<string, unknown> {
  return {
    protocolVersion: GATEWAY_PROTOCOL_VERSION,
    sessionId: 'gateway-device-session',
    credential: 'credential:device',
    tenantId: TENANT,
    actor: { kind: 'HUMAN', identityId: ACTOR },
    correlation: { correlationId: CORRELATION },
  };
}

class FakeDevices {
  record: Record<string, unknown> | null = null;
  lastRegister: Record<string, unknown> | null = null;

  register(input: unknown) {
    assert.equal(isRecord(input), true);
    if (!isRecord(input)) throw new Error('registration input must be an object');
    this.lastRegister = input;
    if (this.record === null) {
      this.record = {
        kind: 'DeviceRegistrationRecord',
        schemaVersion: '1.0.0',
        ref: {
          kind: 'AURORA_DEVICE',
          deviceId: input.deviceId,
          tenantId: input.tenantId,
          registrationVersion: 1,
        },
        boundIdentityId: input.boundIdentityId,
        state: 'REGISTERED',
        registeredAt: input.registeredAt,
        updatedAt: input.registeredAt,
        provenance: input.provenance,
        authoritySemantics: 'DEVICE_REGISTRATION_ONLY_NO_ACTION_AUTHORITY',
        authorizesExecution: false,
        canGrantPermission: false,
      };
    }
    return {
      ok: true,
      disposition: 'REGISTERED',
      record: this.record,
      authorizesExecution: false,
    };
  }

  resolve() {
    if (this.record === null || this.record.state !== 'ACTIVE') {
      return {
        ok: false,
        error: 'DEVICE_NOT_ACTIVE',
        authorizesExecution: false,
        canGrantPermission: false,
      };
    }
    return {
      ok: true,
      record: this.record,
      authorizesExecution: false,
      canGrantPermission: false,
    };
  }

  transition(transition: string, input: unknown) {
    assert.equal(transition, 'ACTIVATE');
    assert.equal(isRecord(input), true);
    if (this.record === null || !isRecord(input) || !isRecord(this.record.ref)) {
      throw new Error('activation requires a registration');
    }
    const ref = this.record.ref;
    this.record = {
      ...this.record,
      ref: { ...ref, registrationVersion: Number(ref.registrationVersion) + 1 },
      state: 'ACTIVE',
      updatedAt: input.transitionedAt,
      provenance: input.provenance,
    };
    return { ok: true, transition: 'ACTIVATE', record: this.record, authorizesExecution: false };
  }
}

class FakeDeviceSessions {
  current: Record<string, unknown> | null = null;
  lastOpen: Record<string, unknown> | null = null;

  openSession(input: unknown) {
    assert.equal(isRecord(input), true);
    if (!isRecord(input) || !isRecord(input.gatewaySession) || !isRecord(input.deviceRecord)) {
      throw new Error('session open input malformed');
    }
    this.lastOpen = input;
    const gateway = input.gatewaySession;
    const device = input.deviceRecord;
    this.current = {
      kind: 'DeviceSessionTrustSnapshot',
      schemaVersion: '1.0.0',
      deviceSessionId: input.deviceSessionId,
      gatewaySessionId: gateway.sessionId,
      connectionId: gateway.connectionId,
      gatewayGeneration: gateway.generation,
      tenantId: gateway.tenantId,
      actorIdentityId: gateway.actorIdentityId,
      correlationId: gateway.correlationId,
      deviceRef: device.ref,
      attestation: input.attestation,
      state: 'ACTIVE',
      openedAtMs: input.nowMs,
      lastEvaluatedAtMs: input.nowMs,
      gatewayAuthExpiresAtMs: gateway.authExpiresAtMs,
      executionPreconditionSatisfied: true,
      requiresCurrentAuthorityValidation: true,
      authoritySemantics: 'DEVICE_SESSION_TRUST_IS_PRECONDITION_METADATA_ONLY',
      authorizesExecution: false,
      canGrantPermission: false,
    };
    return { ok: true, snapshot: this.current, authorizesExecution: false, canGrantPermission: false };
  }

  getSession(deviceSessionId: unknown, connectionId: unknown) {
    if (
      this.current === null ||
      this.current.deviceSessionId !== deviceSessionId ||
      this.current.connectionId !== connectionId
    ) {
      return {
        ok: false,
        error: { code: 'CONNECTION_MISMATCH', message: 'not current', retryable: false },
        authorizesExecution: false,
        canGrantPermission: false,
      };
    }
    return { ok: true, snapshot: this.current, authorizesExecution: false, canGrantPermission: false };
  }

  revokeSession(input: unknown) {
    if (this.current === null || !isRecord(input)) throw new Error('no current session');
    this.current = {
      ...this.current,
      state: 'REVOKED',
      revokedAtMs: input.revokedAtMs,
      revocationReasonReference: input.reasonReference,
      executionPreconditionSatisfied: false,
    };
    return { ok: true, snapshot: this.current, authorizesExecution: false, canGrantPermission: false };
  }
}

class FakeRealtimeCommands {
  getCommand(
    _gatewaySessionId: unknown,
    _gatewayConnectionId: unknown,
    commandId: unknown,
    nowMs: unknown,
  ) {
    return {
      ok: true,
      value: {
        commandId,
        executionId: EXECUTION_ID,
        executionTarget: { schemaVersion: '1.0.0', kind: 'DEVICE', bindingReference: DEVICE_ID },
        correlationId: CORRELATION,
        causationId: 'cau_01ARZ3NDEKTSV4RRFFQ69G5FAV',
        state: 'SUBMITTED',
        deadlineMs: Number(nowMs) + 30_000,
        submittedAtMs: Number(nowMs) - 100,
        updatedAtMs: Number(nowMs) - 100,
        submittedGatewayGeneration: 1,
        lastRemoteSequence: 0,
        redeliveryDisposition: 'NOT_DECIDED_BY_W14_B',
        authoritySemantics: 'TRANSPORT_SESSION_ONLY_NO_ACTION_AUTHORITY',
        authorizesExecution: false,
        provesExecutionSuccess: false,
        externalStateVerified: false,
      },
      authorizesExecution: false,
    };
  }
}

class FakeDeliveries {
  lastClaim: Record<string, unknown> | null = null;
  lastAck: Record<string, unknown> | null = null;

  claim(input: unknown) {
    assert.equal(isRecord(input), true);
    if (!isRecord(input)) throw new Error('claim input malformed');
    this.lastClaim = input;
    return {
      ok: true,
      value: {
        disposition: 'DELIVERED',
        envelope: { commandId: COMMAND_ID, payloadReference: 'payload:server-owned' },
        authorizesExecution: false,
      },
      authorizesExecution: false,
      retryAuthorized: false,
    };
  }

  acknowledge(input: unknown) {
    assert.equal(isRecord(input), true);
    if (!isRecord(input)) throw new Error('ack input malformed');
    this.lastAck = input;
    return {
      ok: true,
      value: { disposition: 'ACKNOWLEDGED', authorizesExecution: false },
      authorizesExecution: false,
      retryAuthorized: false,
    };
  }
}

class FakeReceiptIngress {
  lastInput: Record<string, unknown> | null = null;

  ingest(input: unknown) {
    assert.equal(isRecord(input), true);
    if (!isRecord(input)) throw new Error('receipt input malformed');
    this.lastInput = input;
    return {
      ok: true,
      value: {
        classification: 'CURRENT_SESSION',
        durableReference: 'w03:receipt',
        authoritySemantics: 'EVIDENCE_INPUT_ONLY_W07_OWNS_OUTCOME_AND_RETRY',
        authorizesExecution: false,
        canGrantPermission: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      },
      authorizesExecution: false,
      retryAuthorized: false,
    };
  }
}

class FakeProofVerifier {
  rejectRegistration = false;
  registrationCalls = 0;
  attestationCalls = 0;

  verifyRegistration() {
    this.registrationCalls += 1;
    if (this.rejectRegistration) {
      return {
        ok: false,
        error: { code: 'PROOF_INVALID', retryable: false },
        authorizesExecution: false,
        canGrantPermission: false,
      };
    }
    return {
      ok: true,
      proofReference: 'device-proof:key-fingerprint-1',
      authorizesExecution: false,
      canGrantPermission: false,
    };
  }

  verifyAttestation(input: unknown) {
    this.attestationCalls += 1;
    assert.equal(isRecord(input), true);
    if (!isRecord(input)) throw new Error('attestation verifier input malformed');
    return {
      ok: true,
      attestation: {
        kind: 'DEVICE_ATTESTATION_REFERENCE',
        reference: 'attestation:verified-1',
        provider: 'fixture',
        version: '1',
        state: 'VERIFIED',
        observedAtMs: Number(input.nowMs),
        expiresAtMs: Number(input.nowMs) + 60_000,
      },
      authorizesExecution: false,
      canGrantPermission: false,
    };
  }
}

function createFixture() {
  const devices = new FakeDevices();
  const sessions = new FakeDeviceSessions();
  const realtime = new FakeRealtimeCommands();
  const deliveries = new FakeDeliveries();
  const receipts = new FakeReceiptIngress();
  const verifier = new FakeProofVerifier();
  const handler = new GatewayDevicePlaneNetworkHandler({
    devices,
    deviceSessions: sessions,
    realtimeCommands: realtime,
    deliveries,
    receiptIngress: receipts,
    deviceProofVerifier: verifier,
  });
  return { devices, sessions, deliveries, receipts, verifier, handler };
}

async function openAuthenticatedSocket(
  handler?: GatewayDevicePlaneNetworkHandler,
): Promise<{
  transport: GatewayHttpNetworkTransport;
  port: number;
  agent: AgentLike;
  now: { value: number };
  session: Record<string, unknown>;
}> {
  const manager = new GatewaySessionManager(new FixtureAuthenticator());
  const now = { value: BASE_NOW };
  const transport = new GatewayHttpNetworkTransport(
    manager,
    { host: '127.0.0.1', clock: () => now.value },
    handler,
  );
  const address = await transport.start(0);
  const agent = new Agent({ keepAlive: true, maxSockets: 1 }) as AgentLike;
  const opened = await postJson(address.port, '/v1/gateway/sessions/open', openBody(), agent);
  assert.equal(opened.statusCode, 200);
  assert.equal(isRecord(opened.body), true);
  if (!isRecord(opened.body) || opened.body.ok !== true || !isRecord(opened.body.value)) {
    throw new Error('gateway session must open');
  }
  return { transport, port: address.port, agent, now, session: opened.body.value };
}

test('device-plane routes are absent unless the optional W14 composition is configured', async () => {
  const fixture = await openAuthenticatedSocket();
  try {
    const result = await postJson(
      fixture.port,
      '/v1/device/registrations/register',
      { deviceId: DEVICE_ID, proof: 'cHJvb2Y=' },
      fixture.agent,
    );
    assert.equal(result.statusCode, 404);
    assert.equal(transportCode(result), 'ROUTE_NOT_FOUND');
  } finally {
    fixture.agent.destroy();
    await fixture.transport.stop();
  }
});

test('same authenticated socket derives registration/session bindings and rejects client authority injection', async () => {
  const fakes = createFixture();
  const fixture = await openAuthenticatedSocket(fakes.handler);
  try {
    const injected = await postJson(
      fixture.port,
      '/v1/device/registrations/register',
      { deviceId: DEVICE_ID, proof: 'cHJvb2Y=', tenantId: 'ten_forged' },
      fixture.agent,
    );
    assert.equal(injected.statusCode, 400);
    assert.equal(devicePlaneCode(injected), 'BODY_MALFORMED');

    const registered = await postJson(
      fixture.port,
      '/v1/device/registrations/register',
      { deviceId: DEVICE_ID, proof: 'cHJvb2Y=' },
      fixture.agent,
    );
    assert.equal(registered.statusCode, 200);
    assert.equal(fakes.verifier.registrationCalls, 1);
    assert.equal(fakes.devices.lastRegister?.tenantId, TENANT);
    assert.equal(fakes.devices.lastRegister?.boundIdentityId, ACTOR);
    assert.equal('nowMs' in (fakes.devices.lastRegister ?? {}), false);

    fixture.now.value += 1;
    const activated = await postJson(
      fixture.port,
      '/v1/device/registrations/activate',
      {},
      fixture.agent,
    );
    assert.equal(activated.statusCode, 200);

    fixture.now.value += 1;
    const sessionOpened = await postJson(
      fixture.port,
      '/v1/device/sessions/open',
      { deviceSessionId: 'device-session-1', proof: 'YXR0ZXN0YXRpb24=' },
      fixture.agent,
    );
    assert.equal(sessionOpened.statusCode, 200);
    assert.equal(fakes.verifier.attestationCalls, 1);
    assert.equal(fakes.sessions.lastOpen?.gatewaySession, undefined, 'nested object check follows');
    assert.equal(isRecord(fakes.sessions.lastOpen?.gatewaySession), true);
    if (isRecord(fakes.sessions.lastOpen?.gatewaySession)) {
      assert.equal(fakes.sessions.lastOpen.gatewaySession.tenantId, TENANT);
      assert.equal(fakes.sessions.lastOpen.gatewaySession.actorIdentityId, ACTOR);
      assert.equal(fakes.sessions.lastOpen.gatewaySession.correlationId, CORRELATION);
      assert.equal(fakes.sessions.lastOpen.gatewaySession.connectionId, fixture.session.connectionId);
    }
    assert.equal(isRecord(fakes.sessions.lastOpen?.attestation), true);
    if (isRecord(fakes.sessions.lastOpen?.attestation)) {
      assert.equal(fakes.sessions.lastOpen.attestation.state, 'VERIFIED');
    }

    const forgedAttestation = await postJson(
      fixture.port,
      '/v1/device/sessions/open',
      {
        deviceSessionId: 'device-session-2',
        proof: 'YXR0ZXN0YXRpb24=',
        attestation: { state: 'VERIFIED' },
      },
      fixture.agent,
    );
    assert.equal(forgedAttestation.statusCode, 400);
    assert.equal(devicePlaneCode(forgedAttestation), 'BODY_MALFORMED');
  } finally {
    fixture.agent.destroy();
    await fixture.transport.stop();
  }
});

test('proof rejection is sanitized and never registers or reflects raw device proof', async () => {
  const fakes = createFixture();
  fakes.verifier.rejectRegistration = true;
  const fixture = await openAuthenticatedSocket(fakes.handler);
  try {
    const proof = 'c2Vuc2l0aXZlLXByb29m';
    const result = await postJson(
      fixture.port,
      '/v1/device/registrations/register',
      { deviceId: DEVICE_ID, proof },
      fixture.agent,
    );
    assert.equal(result.statusCode, 403);
    assert.equal(devicePlaneCode(result), 'DEVICE_PROOF_REJECTED');
    assert.equal(JSON.stringify(result.body).includes(proof), false);
    assert.equal(fakes.devices.lastRegister, null);
  } finally {
    fixture.agent.destroy();
    await fixture.transport.stop();
  }
});

test('command and receipt routes server-resolve canonical command/trust while retaining reported late-evidence binding', async () => {
  const fakes = createFixture();
  const fixture = await openAuthenticatedSocket(fakes.handler);
  try {
    await postJson(
      fixture.port,
      '/v1/device/registrations/register',
      { deviceId: DEVICE_ID, proof: 'cHJvb2Y=' },
      fixture.agent,
    );
    await postJson(fixture.port, '/v1/device/registrations/activate', {}, fixture.agent);
    fixture.now.value += 1;
    await postJson(
      fixture.port,
      '/v1/device/sessions/open',
      { deviceSessionId: 'device-session-1', proof: 'YXR0ZXN0YXRpb24=' },
      fixture.agent,
    );

    fixture.now.value += 1;
    const forgedCommand = await postJson(
      fixture.port,
      '/v1/device/commands/claim',
      { commandId: COMMAND_ID, state: 'COMPLETED' },
      fixture.agent,
    );
    assert.equal(forgedCommand.statusCode, 400);
    assert.equal(devicePlaneCode(forgedCommand), 'BODY_MALFORMED');

    const claimed = await postJson(
      fixture.port,
      '/v1/device/commands/claim',
      { commandId: COMMAND_ID },
      fixture.agent,
    );
    assert.equal(claimed.statusCode, 200);
    assert.equal(isRecord(fakes.deliveries.lastClaim?.command), true);
    if (isRecord(fakes.deliveries.lastClaim?.command)) {
      assert.equal(fakes.deliveries.lastClaim.command.state, 'SUBMITTED');
      assert.equal(fakes.deliveries.lastClaim.command.authorizesExecution, false);
    }
    assert.equal(isRecord(fakes.deliveries.lastClaim?.deviceSession), true);

    fixture.now.value += 1;
    const acknowledged = await postJson(
      fixture.port,
      '/v1/device/commands/acknowledge',
      {
        commandId: COMMAND_ID,
        deliveryReference: 'w14f:delivery-1',
        ackReference: 'device-ack-1',
      },
      fixture.agent,
    );
    assert.equal(acknowledged.statusCode, 200);
    assert.equal(fakes.deliveries.lastAck?.observedAtMs, fixture.now.value);

    fixture.now.value += 1;
    const receipt = await postJson(
      fixture.port,
      '/v1/device/receipts/ingest',
      {
        receiptId: RECEIPT_ID,
        evidenceId: EVIDENCE_ID,
        commandId: COMMAND_ID,
        executionId: EXECUTION_ID,
        connectionId: 'reported-prior-connection',
        gatewayGeneration: 1,
        deliveryReference: 'w14f:delivery-1',
        reportedState: 'COMPLETED',
        sourceReference: 'device-receipt-1',
        proofReference: 'device-signature-1',
        integrityDigest: 'sha256:abcdef0123456789',
        capturedAtMs: fixture.now.value - 10,
      },
      fixture.agent,
    );
    assert.equal(receipt.statusCode, 200);
    assert.equal(fakes.receipts.lastInput?.tenantId, TENANT);
    assert.equal(fakes.receipts.lastInput?.correlationId, CORRELATION);
    assert.equal(fakes.receipts.lastInput?.receivedAtMs, fixture.now.value);
    assert.equal(fakes.receipts.lastInput?.connectionId, 'reported-prior-connection');
    assert.equal(fakes.receipts.lastInput?.gatewayGeneration, 1);
    assert.equal(isRecord(fakes.receipts.lastInput?.deviceSession), true);

    const injectedReceipt = await postJson(
      fixture.port,
      '/v1/device/receipts/ingest',
      {
        receiptId: RECEIPT_ID,
        commandId: COMMAND_ID,
        executionId: EXECUTION_ID,
        connectionId: 'reported-prior-connection',
        gatewayGeneration: 1,
        deliveryReference: 'w14f:delivery-1',
        reportedState: 'COMPLETED',
        sourceReference: 'device-receipt-1',
        proofReference: 'device-signature-1',
        integrityDigest: 'sha256:abcdef0123456789',
        capturedAtMs: fixture.now.value - 10,
        tenantId: 'ten_forged',
      },
      fixture.agent,
    );
    assert.equal(injectedReceipt.statusCode, 400);
    assert.equal(devicePlaneCode(injectedReceipt), 'BODY_MALFORMED');
  } finally {
    fixture.agent.destroy();
    await fixture.transport.stop();
  }
});

test('device routes inherit POST enforcement and require an authenticated same-socket gateway binding', async () => {
  const fakes = createFixture();
  const manager = new GatewaySessionManager(new FixtureAuthenticator());
  const transport = new GatewayHttpNetworkTransport(
    manager,
    { host: '127.0.0.1', clock: () => BASE_NOW },
    fakes.handler,
  );
  const address = await transport.start(0);
  const agent = new Agent({ keepAlive: true, maxSockets: 1 }) as AgentLike;
  try {
    const unauthenticated = await postJson(
      address.port,
      '/v1/device/registrations/register',
      { deviceId: DEVICE_ID, proof: 'cHJvb2Y=' },
      agent,
    );
    assert.equal(unauthenticated.statusCode, 409);
    assert.equal(transportCode(unauthenticated), 'SESSION_BINDING_REQUIRED');

    const wrongMethod = await postJson(
      address.port,
      '/v1/device/registrations/register',
      { deviceId: DEVICE_ID, proof: 'cHJvb2Y=' },
      agent,
      'GET',
    );
    assert.equal(wrongMethod.statusCode, 405);
    assert.equal(transportCode(wrongMethod), 'METHOD_NOT_ALLOWED');
  } finally {
    agent.destroy();
    await transport.stop();
  }
});
