// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import test from 'node:test';

import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';

import { GATEWAY_PROTOCOL_VERSION, GatewaySessionManager } from '../index.js';
import type { GatewayAuthClaims, GatewayAuthenticator } from '../types.js';

const tenantA = 'tenant:alpha' as TenantId;
const tenantB = 'tenant:beta' as TenantId;
const actorA = 'identity:alpha' as IdentityId;
const actorB = 'identity:beta' as IdentityId;
const correlationA = 'correlation:alpha' as CorrelationId;
const now = 1_788_420_000_000;

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
    tenantId: tenantA,
    actorIdentityId: actorA,
    issuedAtMs: now - 1_000,
    expiresAtMs: now + 60_000,
    authVersion: 'auth-v1',
    ...overrides,
  };
}

function handshake(credential = 'credential:valid') {
  return {
    protocolVersion: GATEWAY_PROTOCOL_VERSION,
    sessionId: 'session:alpha',
    credential,
    tenantId: tenantA,
    actor: { kind: 'HUMAN' as const, identityId: actorA },
    correlation: { correlationId: correlationA },
    nowMs: now,
  };
}

function openManager(config = {}) {
  const authenticator = new FixtureAuthenticator();
  authenticator.set('credential:valid', claims());
  const manager = new GatewaySessionManager(authenticator, config);
  const opened = manager.openSession(handshake());
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error('fixture session failed');
  return { authenticator, manager, session: opened.value };
}

function request(session: { sessionId: string; connectionId: string }, overrides = {}) {
  return {
    protocolVersion: GATEWAY_PROTOCOL_VERSION,
    sessionId: session.sessionId,
    connectionId: session.connectionId,
    requestId: 'request:one',
    tenantId: tenantA,
    actorIdentityId: actorA,
    correlationId: correlationA,
    deadlineMs: now + 30_000,
    nowMs: now,
    ...overrides,
  };
}

function boundOperation(
  session: { sessionId: string; connectionId: string },
  overrides = {},
) {
  return {
    protocolVersion: GATEWAY_PROTOCOL_VERSION,
    sessionId: session.sessionId,
    connectionId: session.connectionId,
    requestId: 'request:one',
    tenantId: tenantA,
    actorIdentityId: actorA,
    correlationId: correlationA,
    nowMs: now + 1,
    ...overrides,
  };
}

function boundSession(
  session: { sessionId: string; connectionId: string },
  overrides = {},
) {
  return {
    protocolVersion: GATEWAY_PROTOCOL_VERSION,
    sessionId: session.sessionId,
    connectionId: session.connectionId,
    tenantId: tenantA,
    actorIdentityId: actorA,
    correlationId: correlationA,
    nowMs: now + 1,
    ...overrides,
  };
}

test('opens an authenticated, tenant/actor-bound, non-authoritative transport session', () => {
  const { session } = openManager();
  assert.equal(session.tenantId, tenantA);
  assert.equal(session.actorIdentityId, actorA);
  assert.equal(session.correlationId, correlationA);
  assert.equal(session.authorizesExecution, false);
  assert.equal('credential' in session, false);
  assert.equal('policyToken' in session, false);
  assert.equal('ownerDecision' in session, false);
});

test('fails closed for missing, invalid, expired and stale authentication', () => {
  const authenticator = new FixtureAuthenticator();
  authenticator.set('credential:expired', claims({ expiresAtMs: now }));
  authenticator.set('credential:stale', claims({ issuedAtMs: now - 120_000 }));
  const manager = new GatewaySessionManager(authenticator, { maxAuthAgeMs: 60_000 });

  const missing = manager.openSession({ ...handshake(), credential: '' });
  const invalid = manager.openSession(handshake('credential:unknown'));
  const expired = manager.openSession(handshake('credential:expired'));
  const stale = manager.openSession(handshake('credential:stale'));

  assert.equal(missing.ok ? '' : missing.error.code, 'AUTH_REQUIRED');
  assert.equal(invalid.ok ? '' : invalid.error.code, 'AUTH_INVALID');
  assert.equal(expired.ok ? '' : expired.error.code, 'AUTH_EXPIRED');
  assert.equal(stale.ok ? '' : stale.error.code, 'AUTH_STALE');
});

test('rejects cross-tenant and identity/session mismatches', () => {
  const authenticator = new FixtureAuthenticator();
  authenticator.set('credential:tenant-b', claims({ tenantId: tenantB }));
  authenticator.set('credential:actor-b', claims({ actorIdentityId: actorB }));
  const manager = new GatewaySessionManager(authenticator);

  const tenantMismatch = manager.openSession(handshake('credential:tenant-b'));
  const actorMismatch = manager.openSession(handshake('credential:actor-b'));
  assert.equal(tenantMismatch.ok ? '' : tenantMismatch.error.code, 'TENANT_MISMATCH');
  assert.equal(actorMismatch.ok ? '' : actorMismatch.error.code, 'ACTOR_MISMATCH');

  const { manager: openedManager, session } = openManager();
  const wrongTenant = openedManager.beginRequest(request(session, { tenantId: tenantB }));
  const wrongActor = openedManager.beginRequest(request(session, { actorIdentityId: actorB }));
  const wrongCorrelation = openedManager.beginRequest(
    request(session, { correlationId: 'correlation:other' as CorrelationId }),
  );
  assert.equal(wrongTenant.ok ? '' : wrongTenant.error.code, 'TENANT_MISMATCH');
  assert.equal(wrongActor.ok ? '' : wrongActor.error.code, 'ACTOR_MISMATCH');
  assert.equal(wrongCorrelation.ok ? '' : wrongCorrelation.error.code, 'CORRELATION_MISMATCH');

  assert.equal(openedManager.beginRequest(request(session)).ok, true);
  const wrongCancelTenant = openedManager.cancelRequest(boundOperation(session, { tenantId: tenantB }));
  const wrongCompleteActor = openedManager.completeRequest(
    boundOperation(session, { actorIdentityId: actorB }),
  );
  assert.equal(wrongCancelTenant.ok ? '' : wrongCancelTenant.error.code, 'TENANT_MISMATCH');
  assert.equal(wrongCompleteActor.ok ? '' : wrongCompleteActor.error.code, 'ACTOR_MISMATCH');
});

test('requires explicit reconnect and fresh authentication after close', () => {
  const { authenticator, manager, session } = openManager();
  assert.equal(manager.closeSession(boundSession(session)).ok, true);

  const duplicateOpen = manager.openSession(handshake());
  assert.equal(duplicateOpen.ok ? '' : duplicateOpen.error.code, 'SESSION_CONFLICT');

  authenticator.set('credential:wrong-correlation', claims());
  const wrongCorrelationReconnect = manager.reconnectSession({
    ...handshake('credential:wrong-correlation'),
    correlation: { correlationId: 'correlation:other' as CorrelationId },
    previousConnectionId: session.connectionId,
    nowMs: now + 1,
  });
  assert.equal(
    wrongCorrelationReconnect.ok ? '' : wrongCorrelationReconnect.error.code,
    'CORRELATION_MISMATCH',
  );

  authenticator.set('credential:reconnect', claims({ issuedAtMs: now + 500, expiresAtMs: now + 90_000 }));
  const reconnect = manager.reconnectSession({
    ...handshake('credential:reconnect'),
    previousConnectionId: session.connectionId,
    nowMs: now + 1_000,
  });
  assert.equal(reconnect.ok, true);
  if (!reconnect.ok) return;
  assert.equal(reconnect.value.generation, 2);
  assert.notEqual(reconnect.value.connectionId, session.connectionId);

  assert.equal(manager.closeSession(boundSession(reconnect.value, { nowMs: now + 2_000 })).ok, true);
  authenticator.set('credential:expired-reconnect', claims({ expiresAtMs: now + 2_000 }));
  const expiredReconnect = manager.reconnectSession({
    ...handshake('credential:expired-reconnect'),
    previousConnectionId: reconnect.value.connectionId,
    nowMs: now + 2_000,
  });
  assert.equal(expiredReconnect.ok ? '' : expiredReconnect.error.code, 'AUTH_EXPIRED');
});

test('expires active sessions and refuses stale connection reuse', () => {
  const { manager, session } = openManager();
  const afterExpiry = manager.beginRequest(request(session, { nowMs: now + 60_000, deadlineMs: now + 61_000 }));
  assert.equal(afterExpiry.ok ? '' : afterExpiry.error.code, 'AUTH_EXPIRED');
  const staleConnection = manager.beginRequest(request(session));
  assert.equal(staleConnection.ok ? '' : staleConnection.error.code, 'SESSION_CLOSED');
});

test('enforces deadlines, bounded outstanding requests and duplicate request rejection', () => {
  const { manager, session } = openManager({ maxOutstandingRequestsPerSession: 1, maxDeadlineHorizonMs: 60_000 });
  const expired = manager.beginRequest(request(session, { deadlineMs: now }));
  const tooFar = manager.beginRequest(request(session, { deadlineMs: now + 60_001 }));
  assert.equal(expired.ok ? '' : expired.error.code, 'DEADLINE_EXCEEDED');
  assert.equal(tooFar.ok ? '' : tooFar.error.code, 'DEADLINE_OUT_OF_RANGE');

  const first = manager.beginRequest(request(session));
  const saturated = manager.beginRequest(request(session, { requestId: 'request:two' }));
  assert.equal(first.ok, true);
  assert.equal(saturated.ok ? '' : saturated.error.code, 'BACKPRESSURE');
  assert.equal(manager.completeRequest(boundOperation(session)).ok, true);
  const duplicate = manager.beginRequest(request(session));
  assert.equal(duplicate.ok ? '' : duplicate.error.code, 'REQUEST_DUPLICATE');
});

test('bounds remembered sessions and request tracking while evicting only closed/completed records', () => {
  const authenticator = new FixtureAuthenticator();
  authenticator.set('credential:valid', claims());
  const manager = new GatewaySessionManager(authenticator, {
    maxOpenSessions: 1,
    maxRememberedSessions: 1,
    maxOutstandingRequestsPerSession: 1,
    maxTrackedRequestsPerSession: 1,
  });

  const firstOpen = manager.openSession(handshake());
  assert.equal(firstOpen.ok, true);
  if (!firstOpen.ok) return;
  const secondWhileOpen = manager.openSession({ ...handshake(), sessionId: 'session:beta' });
  assert.equal(secondWhileOpen.ok ? '' : secondWhileOpen.error.code, 'BACKPRESSURE');

  assert.equal(manager.beginRequest(request(firstOpen.value)).ok, true);
  assert.equal(manager.completeRequest(boundOperation(firstOpen.value)).ok, true);
  const secondRequest = manager.beginRequest(
    request(firstOpen.value, { requestId: 'request:two' }),
  );
  assert.equal(secondRequest.ok, true);

  assert.equal(manager.closeSession(boundSession(firstOpen.value, { nowMs: now + 2 })).ok, true);
  const replacement = manager.openSession({ ...handshake(), sessionId: 'session:beta' });
  assert.equal(replacement.ok, true);
  const evicted = manager.getSession('session:alpha', now + 3);
  assert.equal(evicted.ok ? '' : evicted.error.code, 'SESSION_NOT_FOUND');
});

test('cancellation is idempotent and late completion preserves the cancellation race', () => {
  const { manager, session } = openManager();
  assert.equal(manager.beginRequest(request(session)).ok, true);
  const firstCancel = manager.cancelRequest(boundOperation(session, { nowMs: now + 1 }));
  const secondCancel = manager.cancelRequest(boundOperation(session, { nowMs: now + 2 }));
  assert.equal(firstCancel.ok, true);
  assert.equal(secondCancel.ok, true);
  if (!secondCancel.ok) return;
  assert.equal(secondCancel.value.state, 'CANCEL_REQUESTED');
  assert.equal(secondCancel.value.cancelRequestedAtMs, now + 1);

  const completed = manager.completeRequest(boundOperation(session, { nowMs: now + 3 }));
  assert.equal(completed.ok, true);
  if (!completed.ok) return;
  assert.equal(completed.value.state, 'COMPLETED');
  assert.equal(completed.value.cancelRequestedAtMs, now + 1);
  assert.equal(completed.value.completedAtMs, now + 3);
  assert.equal(completed.value.authorizesExecution, false);
});

test('rejects malformed protocol, accessor objects, prototype-bearing input and authority-like auth claims', () => {
  const authenticator = new FixtureAuthenticator();
  const manager = new GatewaySessionManager(authenticator);

  const wrongProtocol = manager.openSession({ ...handshake(), protocolVersion: '999' });
  assert.equal(wrongProtocol.ok ? '' : wrongProtocol.error.code, 'PROTOCOL_VERSION_UNSUPPORTED');

  const accessor: Record<string, unknown> = { ...handshake() };
  Object.defineProperty(accessor, 'tenantId', { enumerable: true, get: () => tenantA });
  const accessorResult = manager.openSession(accessor);
  assert.equal(accessorResult.ok ? '' : accessorResult.error.code, 'MALFORMED_REQUEST');

  const polluted = Object.create({ inherited: true }) as Record<string, unknown>;
  Object.assign(polluted, handshake());
  const pollutedResult = manager.openSession(polluted);
  assert.equal(pollutedResult.ok ? '' : pollutedResult.error.code, 'MALFORMED_REQUEST');

  const authorityLike = {
    ...claims(),
    policyToken: 'must-not-cross-auth-boundary',
  } as GatewayAuthClaims;
  authenticator.set('credential:authority-like', authorityLike);
  const authorityResult = manager.openSession(handshake('credential:authority-like'));
  assert.equal(authorityResult.ok ? '' : authorityResult.error.code, 'AUTH_INVALID');
});
