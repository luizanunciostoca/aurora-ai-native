// @ts-expect-error -- W14 mobile-gateway harness intentionally uses Node 22 built-ins without @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- W14 mobile-gateway harness intentionally uses Node 22 built-ins without @types/node.
import test from 'node:test';

import type {
  CausationId,
  CommandId,
  CorrelationId,
  EventId,
  ExecutionId,
  IdentityId,
  TenantId,
} from '@aurora/contracts/ids';

import {
  InMemoryDeviceRegistry,
  type DeviceId,
  type DeviceRegistrationProvenance,
} from '../../device/index.js';
import {
  GATEWAY_PROTOCOL_VERSION,
  GatewaySessionManager,
  type GatewayAuthClaims,
  type GatewayAuthenticator,
  type GatewaySessionSnapshot,
} from '../../gateway-auth/index.js';
import { RealtimeCommandSessionManager } from '../manager.js';

const NOW = 1_788_423_000_000;
const TENANT_A = 'ten_01JW14BABCDA00000000000000' as TenantId;
const TENANT_B = 'ten_01JW14BABCDB00000000000000' as TenantId;
const ACTOR_A = 'idn_01JW14BABCDC00000000000000' as IdentityId;
const CORRELATION_A = 'cor_01JW14BABCDD00000000000000' as CorrelationId;
const CORRELATION_B = 'cor_01JW14BABCDE00000000000000' as CorrelationId;
const CAUSATION_A = 'cau_01JW14BABCDF00000000000000' as CausationId;
const DEVICE_A = 'dvc_01JW14BABCDG00000000000000' as DeviceId;
const COMMAND_A = 'cmd_01JW14BABCDH00000000000000' as CommandId;
const COMMAND_B = 'cmd_01JW14BABCDJ00000000000000' as CommandId;
const EXECUTION_A = 'exe_01JW14BABCDK00000000000000' as ExecutionId;
const EXECUTION_B = 'exe_01JW14BABCDM00000000000000' as ExecutionId;
const EVENT_1 = 'evt_01JW14BABCDN00000000000000' as EventId;
const EVENT_2 = 'evt_01JW14BABCDP00000000000000' as EventId;
const EVENT_3 = 'evt_01JW14BABCDQ00000000000000' as EventId;

class FixtureAuthenticator implements GatewayAuthenticator {
  readonly #claims = new Map<string, GatewayAuthClaims | null>();

  set(credential: string, claims: GatewayAuthClaims | null): void {
    this.#claims.set(credential, claims);
  }

  verify(credential: string): GatewayAuthClaims | null {
    return this.#claims.get(credential) ?? null;
  }
}

function claims(overrides: Partial<GatewayAuthClaims> = {}): GatewayAuthClaims {
  return {
    tenantId: TENANT_A,
    actorIdentityId: ACTOR_A,
    issuedAtMs: NOW - 1_000,
    expiresAtMs: NOW + 120_000,
    authVersion: 'auth-v1',
    ...overrides,
  };
}

function gatewayHandshake(nowMs = NOW) {
  return {
    protocolVersion: GATEWAY_PROTOCOL_VERSION,
    sessionId: 'session:w14b:alpha',
    credential: 'credential:w14b',
    tenantId: TENANT_A,
    actor: { kind: 'HUMAN' as const, identityId: ACTOR_A },
    correlation: { correlationId: CORRELATION_A },
    nowMs,
  };
}

function provenance(reference: string, observedAt = '2026-09-03T08:25:00Z'): DeviceRegistrationProvenance {
  return { source: 'W14_DEVICE_REGISTRATION', reference, observedAt };
}

function activateDevice(registry: InMemoryDeviceRegistry) {
  const registered = registry.register({
    deviceId: DEVICE_A,
    tenantId: TENANT_A,
    boundIdentityId: ACTOR_A,
    registeredAt: '2026-09-03T08:25:00Z',
    provenance: provenance('w14b:registration'),
  });
  assert.equal(registered.ok, true);
  if (!registered.ok) throw new Error('device registration fixture failed');
  const activated = registry.transition('ACTIVATE', {
    ref: registered.record.ref,
    expectedVersion: 1,
    transitionedAt: '2026-09-03T08:26:00Z',
    provenance: provenance('w14b:activation', '2026-09-03T08:26:00Z'),
  });
  assert.equal(activated.ok, true);
  if (!activated.ok) throw new Error('device activation fixture failed');
  return activated.record;
}

function setup(
  config: ConstructorParameters<typeof RealtimeCommandSessionManager>[2] = {},
  claimOverrides: Partial<GatewayAuthClaims> = {},
) {
  const authenticator = new FixtureAuthenticator();
  authenticator.set('credential:w14b', claims(claimOverrides));
  const gateway = new GatewaySessionManager(authenticator);
  const openedGateway = gateway.openSession(gatewayHandshake());
  assert.equal(openedGateway.ok, true);
  if (!openedGateway.ok) throw new Error('gateway fixture failed');

  const devices = new InMemoryDeviceRegistry();
  const activeDevice = activateDevice(devices);
  const manager = new RealtimeCommandSessionManager(gateway, devices, config);
  const openedRealtime = manager.openSession({
    gatewaySessionId: openedGateway.value.sessionId,
    deviceRef: activeDevice.ref,
    nowMs: NOW + 1,
  });
  assert.equal(openedRealtime.ok, true);
  if (!openedRealtime.ok) throw new Error('realtime session fixture failed');

  return {
    authenticator,
    gateway,
    gatewaySession: openedGateway.value,
    devices,
    activeDevice,
    manager,
    session: openedRealtime.value,
  };
}

function commandInput(
  session: { gatewaySessionId: string; gatewayConnectionId: string; deviceRef: { deviceId: string } },
  overrides: Record<string, unknown> = {},
) {
  return {
    gatewaySessionId: session.gatewaySessionId,
    gatewayConnectionId: session.gatewayConnectionId,
    nowMs: NOW + 2,
    commandId: COMMAND_A,
    executionId: EXECUTION_A,
    executionTarget: {
      schemaVersion: '1.0.0',
      kind: 'DEVICE',
      bindingReference: session.deviceRef.deviceId,
    },
    correlationId: CORRELATION_A,
    causationId: CAUSATION_A,
    deadlineMs: NOW + 60_000,
    ...overrides,
  };
}

function frameInput(
  session: { gatewaySessionId: string; gatewayConnectionId: string },
  state: string,
  sequence: number,
  frameId: EventId,
  overrides: Record<string, unknown> = {},
) {
  return {
    gatewaySessionId: session.gatewaySessionId,
    gatewayConnectionId: session.gatewayConnectionId,
    nowMs: NOW + 10 + sequence,
    commandId: COMMAND_A,
    frameId,
    sequence,
    state,
    ...overrides,
  };
}

function gatewayBoundSession(session: GatewaySessionSnapshot, nowMs: number) {
  return {
    protocolVersion: GATEWAY_PROTOCOL_VERSION,
    sessionId: session.sessionId,
    connectionId: session.connectionId,
    tenantId: session.tenantId,
    actorIdentityId: session.actorIdentityId,
    correlationId: session.correlationId,
    nowMs,
  };
}

test('W14-B opens one active device-bound realtime session without granting execution authority', () => {
  const { session } = setup();
  assert.equal(session.state, 'OPEN');
  assert.equal(session.tenantId, TENANT_A);
  assert.equal(session.actorIdentityId, ACTOR_A);
  assert.equal(session.correlationId, CORRELATION_A);
  assert.equal(session.deviceRef.deviceId, DEVICE_A);
  assert.equal(session.authorizesExecution, false);
  assert.equal(session.canGrantPermission, false);
  assert.equal('credential' in session, false);
  assert.equal('policyToken' in session, false);
  assert.equal('ownerDecision' in session, false);
  assert.equal('reasoning' in session, false);
});

test('W14-B submission is idempotent for exact duplicates and rejects conflicting command reuse', () => {
  const { manager, session } = setup();
  const first = manager.submitCommand(commandInput(session));
  const duplicate = manager.submitCommand(commandInput(session));
  const conflict = manager.submitCommand(commandInput(session, { executionId: EXECUTION_B }));

  assert.equal(first.ok, true);
  assert.equal(duplicate.ok, true);
  if (!first.ok || !duplicate.ok) return;
  assert.equal(first.value.disposition, 'SUBMITTED');
  assert.equal(duplicate.value.disposition, 'ALREADY_SUBMITTED');
  assert.equal(first.value.command.state, 'SUBMITTED');
  assert.equal(first.value.command.authorizesExecution, false);
  assert.equal(first.value.command.provesExecutionSuccess, false);
  assert.equal(first.value.command.externalStateVerified, false);
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.error.code, 'COMMAND_CONFLICT');
});

test('W14-B enforces bounded outstanding-command backpressure and releases capacity after terminal state', () => {
  const { manager, session } = setup({
    maxOutstandingCommandsPerSession: 1,
    maxTrackedCommandsPerSession: 2,
  });
  assert.equal(manager.submitCommand(commandInput(session)).ok, true);
  const blocked = manager.submitCommand(
    commandInput(session, { commandId: COMMAND_B, executionId: EXECUTION_B }),
  );
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.error.code, 'BACKPRESSURE');
    assert.equal(blocked.error.retryable, true);
  }

  assert.equal(manager.applyRemoteFrame(frameInput(session, 'ACCEPTED', 1, EVENT_1)).ok, true);
  assert.equal(manager.applyRemoteFrame(frameInput(session, 'COMPLETED', 2, EVENT_2)).ok, true);
  const second = manager.submitCommand(
    commandInput(session, {
      commandId: COMMAND_B,
      executionId: EXECUTION_B,
      nowMs: NOW + 20,
    }),
  );
  assert.equal(second.ok, true);
});

test('W14-B deduplicates exact frames and rejects gaps, reordering and conflicting frame reuse', () => {
  const { manager, session } = setup();
  assert.equal(manager.submitCommand(commandInput(session)).ok, true);

  const accepted = manager.applyRemoteFrame(frameInput(session, 'ACCEPTED', 1, EVENT_1));
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  assert.equal(accepted.value.command.state, 'ACCEPTED');

  const duplicate = manager.applyRemoteFrame(frameInput(session, 'ACCEPTED', 1, EVENT_1));
  assert.equal(duplicate.ok, true);
  if (duplicate.ok) assert.equal(duplicate.value.disposition, 'DUPLICATE_FRAME');

  const gap = manager.applyRemoteFrame(frameInput(session, 'RUNNING', 3, EVENT_3));
  assert.equal(gap.ok, false);
  if (!gap.ok) assert.equal(gap.error.code, 'FRAME_OUT_OF_ORDER');

  const running = manager.applyRemoteFrame(frameInput(session, 'RUNNING', 2, EVENT_2));
  assert.equal(running.ok, true);
  if (running.ok) assert.equal(running.value.command.state, 'RUNNING');

  const conflictingFrame = manager.applyRemoteFrame(frameInput(session, 'WAITING', 2, EVENT_2));
  assert.equal(conflictingFrame.ok, false);
  if (!conflictingFrame.ok) assert.equal(conflictingFrame.error.code, 'FRAME_CONFLICT');
});

test('W14-B preserves cancellation intent across late running frames and records late completion without claiming success truth', () => {
  const { manager, session } = setup();
  assert.equal(manager.submitCommand(commandInput(session)).ok, true);
  assert.equal(manager.applyRemoteFrame(frameInput(session, 'ACCEPTED', 1, EVENT_1)).ok, true);

  const cancelled = manager.requestCancellation({
    gatewaySessionId: session.gatewaySessionId,
    gatewayConnectionId: session.gatewayConnectionId,
    commandId: COMMAND_A,
    nowMs: NOW + 20,
  });
  assert.equal(cancelled.ok, true);
  if (!cancelled.ok) return;
  assert.equal(cancelled.value.command.state, 'CANCEL_REQUESTED');

  const lateRunning = manager.applyRemoteFrame(
    frameInput(session, 'RUNNING', 2, EVENT_2, { nowMs: NOW + 21 }),
  );
  assert.equal(lateRunning.ok, true);
  if (!lateRunning.ok) return;
  assert.equal(lateRunning.value.disposition, 'CANCELLATION_PRESERVED');
  assert.equal(lateRunning.value.command.state, 'CANCEL_REQUESTED');

  const lateCompleted = manager.applyRemoteFrame(
    frameInput(session, 'COMPLETED', 3, EVENT_3, { nowMs: NOW + 22 }),
  );
  assert.equal(lateCompleted.ok, true);
  if (!lateCompleted.ok) return;
  assert.equal(lateCompleted.value.command.state, 'COMPLETED');
  assert.equal(lateCompleted.value.command.provesExecutionSuccess, false);
  assert.equal(lateCompleted.value.command.externalStateVerified, false);

  const afterTerminal = manager.requestCancellation({
    gatewaySessionId: session.gatewaySessionId,
    gatewayConnectionId: session.gatewayConnectionId,
    commandId: COMMAND_A,
    nowMs: NOW + 23,
  });
  assert.equal(afterTerminal.ok, true);
  if (afterTerminal.ok) {
    assert.equal(afterTerminal.value.disposition, 'NOOP_TERMINAL_OR_UNCERTAIN');
  }
});

test('W14-B preserves UNCERTAIN as a fail-closed unresolved state and blocks later transport completion', () => {
  const { manager, session } = setup();
  assert.equal(manager.submitCommand(commandInput(session)).ok, true);
  assert.equal(manager.applyRemoteFrame(frameInput(session, 'ACCEPTED', 1, EVENT_1)).ok, true);
  const uncertain = manager.applyRemoteFrame(frameInput(session, 'UNCERTAIN', 2, EVENT_2));
  assert.equal(uncertain.ok, true);
  if (!uncertain.ok) return;
  assert.equal(uncertain.value.command.state, 'UNCERTAIN');
  assert.equal(uncertain.value.command.redeliveryDisposition, 'BLOCK_UNCERTAIN');
  assert.equal(uncertain.value.command.provesExecutionSuccess, false);

  const fabricatedResolution = manager.applyRemoteFrame(frameInput(session, 'COMPLETED', 3, EVENT_3));
  assert.equal(fabricatedResolution.ok, false);
  if (!fabricatedResolution.ok) assert.equal(fabricatedResolution.error.code, 'INVALID_TRANSITION');

  const cancel = manager.requestCancellation({
    gatewaySessionId: session.gatewaySessionId,
    gatewayConnectionId: session.gatewayConnectionId,
    commandId: COMMAND_A,
    nowMs: NOW + 30,
  });
  assert.equal(cancel.ok, true);
  if (cancel.ok) assert.equal(cancel.value.disposition, 'NOOP_TERMINAL_OR_UNCERTAIN');
});

test('W14-B explicit resume binds a newer W14-A connection while preserving outstanding commands', () => {
  const { authenticator, gateway, gatewaySession, manager, session, activeDevice } = setup();
  assert.equal(manager.submitCommand(commandInput(session)).ok, true);

  const closed = gateway.closeSession(gatewayBoundSession(gatewaySession, NOW + 30));
  assert.equal(closed.ok, true);
  authenticator.set('credential:w14b', claims({ issuedAtMs: NOW + 20, expiresAtMs: NOW + 120_000 }));
  const reconnected = gateway.reconnectSession({
    ...gatewayHandshake(NOW + 31),
    previousConnectionId: gatewaySession.connectionId,
  });
  assert.equal(reconnected.ok, true);
  if (!reconnected.ok) return;

  const resumed = manager.resumeSession({
    gatewaySessionId: gatewaySession.sessionId,
    previousGatewayConnectionId: gatewaySession.connectionId,
    deviceRef: activeDevice.ref,
    nowMs: NOW + 32,
  });
  assert.equal(resumed.ok, true);
  if (!resumed.ok) return;
  assert.equal(resumed.value.gatewayGeneration, 2);
  assert.equal(resumed.value.gatewayConnectionId, reconnected.value.connectionId);
  assert.equal(resumed.value.outstandingCommands, 1);

  const staleConnection = manager.applyRemoteFrame(
    frameInput(session, 'ACCEPTED', 1, EVENT_1, { nowMs: NOW + 33 }),
  );
  assert.equal(staleConnection.ok, false);
  if (!staleConnection.ok) assert.equal(staleConnection.error.code, 'GATEWAY_CONNECTION_MISMATCH');

  const liveFrame = manager.applyRemoteFrame(
    frameInput(
      {
        gatewaySessionId: resumed.value.gatewaySessionId,
        gatewayConnectionId: resumed.value.gatewayConnectionId,
      },
      'ACCEPTED',
      1,
      EVENT_1,
      { nowMs: NOW + 34 },
    ),
  );
  assert.equal(liveFrame.ok, true);
});

test('W14-B fails closed on wrong target, correlation, connection and wrong-tenant device references', () => {
  const { gateway, devices, manager, session, activeDevice } = setup();
  const wrongTarget = manager.submitCommand(
    commandInput(session, { executionTarget: { schemaVersion: '1.0.0', kind: 'DEVICE', bindingReference: 'dvc_other' } }),
  );
  assert.equal(wrongTarget.ok, false);
  if (!wrongTarget.ok) assert.equal(wrongTarget.error.code, 'TARGET_MISMATCH');

  const wrongCorrelation = manager.submitCommand(commandInput(session, { correlationId: CORRELATION_B }));
  assert.equal(wrongCorrelation.ok, false);
  if (!wrongCorrelation.ok) assert.equal(wrongCorrelation.error.code, 'CORRELATION_MISMATCH');

  const wrongConnection = manager.submitCommand(
    commandInput(session, { gatewayConnectionId: 'connection:forged' }),
  );
  assert.equal(wrongConnection.ok, false);
  if (!wrongConnection.ok) assert.equal(wrongConnection.error.code, 'GATEWAY_CONNECTION_MISMATCH');

  const secondManager = new RealtimeCommandSessionManager(gateway, devices);
  const wrongTenantOpen = secondManager.openSession({
    gatewaySessionId: session.gatewaySessionId,
    deviceRef: { ...activeDevice.ref, tenantId: TENANT_B },
    nowMs: NOW + 3,
  });
  assert.equal(wrongTenantOpen.ok, false);
  if (!wrongTenantOpen.ok) assert.equal(wrongTenantOpen.error.code, 'DEVICE_BINDING_MISMATCH');
});

test('W14-B revalidates W14-D state on every operation and closes when the bound device is revoked', () => {
  const { devices, manager, session, activeDevice } = setup();
  const revoked = devices.transition('REVOKE', {
    ref: activeDevice.ref,
    expectedVersion: activeDevice.ref.registrationVersion,
    transitionedAt: '2026-09-03T08:27:00Z',
    provenance: provenance('w14b:revoke', '2026-09-03T08:27:00Z'),
  });
  assert.equal(revoked.ok, true);

  const submission = manager.submitCommand(commandInput(session));
  assert.equal(submission.ok, false);
  if (!submission.ok) assert.equal(submission.error.code, 'DEVICE_NOT_ACTIVE');

  const snapshot = manager.getSession(session.gatewaySessionId, NOW + 4);
  assert.equal(snapshot.ok, true);
  if (snapshot.ok) assert.equal(snapshot.value.state, 'CLOSED');
});

test('W14-B fails closed when W14-A authentication expires mid-command', () => {
  const { manager, session } = setup({}, { expiresAtMs: NOW + 5_000 });
  const submitted = manager.submitCommand(commandInput(session, { deadlineMs: NOW + 4_000 }));
  assert.equal(submitted.ok, true);
  const expiredFrame = manager.applyRemoteFrame(
    frameInput(session, 'ACCEPTED', 1, EVENT_1, { nowMs: NOW + 6_000 }),
  );
  assert.equal(expiredFrame.ok, false);
  if (!expiredFrame.ok) assert.equal(expiredFrame.error.code, 'GATEWAY_SESSION_INVALID');
  const snapshot = manager.getSession(session.gatewaySessionId, NOW + 6_001);
  assert.equal(snapshot.ok, true);
  if (snapshot.ok) assert.equal(snapshot.value.state, 'CLOSED');
});

test('W14-B rejects accessor/prototype/extra authority-bearing inputs without invoking getters', () => {
  const { manager, session, activeDevice } = setup();
  let getterReads = 0;
  const malicious = {
    gatewaySessionId: session.gatewaySessionId,
    nowMs: NOW + 2,
    get deviceRef() {
      getterReads += 1;
      return activeDevice.ref;
    },
  };
  const open = new RealtimeCommandSessionManager(
    { getSession: () => ({ ok: false, error: { code: 'SESSION_NOT_FOUND', message: 'x', retryable: false } }) },
    { resolve: () => ({ ok: false, error: 'DEVICE_NOT_FOUND', authorizesExecution: false, canGrantPermission: false }) },
  ).openSession(malicious);
  assert.equal(open.ok, false);
  assert.equal(getterReads, 0);

  const extraAuthority = manager.submitCommand(
    commandInput(session, { policyToken: 'ptk_01JW14BABCDR00000000000000' }),
  );
  assert.equal(extraAuthority.ok, false);
  if (!extraAuthority.ok) assert.equal(extraAuthority.error.code, 'MALFORMED_REQUEST');
});
