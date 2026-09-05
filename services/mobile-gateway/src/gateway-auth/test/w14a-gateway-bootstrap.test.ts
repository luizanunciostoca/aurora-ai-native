// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import test from 'node:test';

import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';

import {
  GATEWAY_PROTOCOL_VERSION,
  GatewaySessionManager,
  TransientGatewayBootstrapBroker,
  type AuthenticatedGatewayBootstrapPrincipal,
  type GatewayBootstrapEntropy,
} from '../index.js';

const now = 1_788_620_000_000;
const tenantId = 'tenant:alpha' as TenantId;
const actorIdentityId = 'identity:alpha' as IdentityId;
const correlationId = 'correlation:bootstrap' as CorrelationId;
const deviceId = 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const deviceSessionId = 'device-session:alpha';

function principal(
  overrides: Partial<AuthenticatedGatewayBootstrapPrincipal> = {},
): AuthenticatedGatewayBootstrapPrincipal {
  return {
    tenantId,
    actor: { kind: 'HUMAN', identityId: actorIdentityId },
    correlationId,
    deviceId,
    deviceSessionId,
    authenticatedAtMs: now - 1_000,
    authenticationExpiresAtMs: now + 120_000,
    authenticationReference: 'upstream-auth:alpha',
    authorizesExecution: false,
    canGrantPermission: false,
    ...overrides,
  };
}

function entropy(seed = 'A'): GatewayBootstrapEntropy {
  let counter = 0;
  return {
    credential: () => `gwc_${seed}${String(counter++).padStart(2, '0')}${'x'.repeat(40)}`,
    gatewaySessionId: () => `gws_${seed}${String(counter++).padStart(2, '0')}${'y'.repeat(19)}`,
  };
}

test('issues a short-lived transport-only grant from an upstream-authenticated principal', () => {
  const broker = new TransientGatewayBootstrapBroker({}, entropy());
  const result = broker.issue(principal(), now);

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('bootstrap grant was unexpectedly rejected');
  assert.equal(result.value.tenantId, tenantId);
  assert.deepEqual(result.value.actor, { kind: 'HUMAN', identityId: actorIdentityId });
  assert.equal(result.value.correlationId, correlationId);
  assert.equal(result.value.deviceId, deviceId);
  assert.equal(result.value.deviceSessionId, deviceSessionId);
  assert.equal(result.value.authVersion, 'w14-bootstrap-v1');
  assert.equal(result.value.authorizesExecution, false);
  assert.equal(result.value.provesExecutionSuccess, false);
  assert.equal(result.value.retryAuthorized, false);
  assert.equal(result.value.expiresAtMs, now + 60_000);
  assert.match(result.value.credential, /^gwc_[A-Za-z0-9_-]{43,128}$/u);
  assert.match(result.value.gatewaySessionId, /^gws_[A-Za-z0-9_-]{22,86}$/u);
  assert.equal('ownerDecision' in result.value, false);
  assert.equal('policyToken' in result.value, false);
});

test('implements the existing W14 authenticator contract and consumes credentials exactly once', () => {
  const broker = new TransientGatewayBootstrapBroker({}, entropy('B'));
  const issued = broker.issue(principal(), now);
  assert.equal(issued.ok, true);
  if (!issued.ok) throw new Error('bootstrap grant was unexpectedly rejected');

  const manager = new GatewaySessionManager(broker);
  const opened = manager.openSession({
    protocolVersion: GATEWAY_PROTOCOL_VERSION,
    sessionId: issued.value.gatewaySessionId,
    credential: issued.value.credential,
    tenantId: issued.value.tenantId,
    actor: issued.value.actor,
    correlation: { correlationId: issued.value.correlationId },
    nowMs: now + 1,
  });

  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error('gateway session did not accept bootstrap credential');
  assert.equal(opened.value.authorizesExecution, false);
  assert.equal(opened.value.tenantId, tenantId);
  assert.equal(opened.value.actorIdentityId, actorIdentityId);
  assert.equal(broker.verify(issued.value.credential, now + 2), null);
});

test('rejects invalid, expired and stale upstream authentication without issuing a credential', () => {
  const broker = new TransientGatewayBootstrapBroker({ maxPrincipalAgeMs: 30_000 }, entropy('C'));

  const expired = broker.issue(
    principal({ authenticationExpiresAtMs: now, authenticatedAtMs: now - 1_000 }),
    now,
  );
  const stale = broker.issue(
    principal({ authenticatedAtMs: now - 30_001, authenticationExpiresAtMs: now + 60_000 }),
    now,
  );
  const future = broker.issue(principal({ authenticatedAtMs: now + 1 }), now);
  const authoritative = broker.issue(
    { ...principal(), authorizesExecution: true } as unknown,
    now,
  );

  assert.equal(expired.ok ? '' : expired.error.code, 'PRINCIPAL_EXPIRED');
  assert.equal(stale.ok ? '' : stale.error.code, 'PRINCIPAL_STALE');
  assert.equal(future.ok ? '' : future.error.code, 'PRINCIPAL_INVALID');
  assert.equal(authoritative.ok ? '' : authoritative.error.code, 'PRINCIPAL_INVALID');
});

test('fails closed for expired, revoked, replayed and unknown credentials', () => {
  const broker = new TransientGatewayBootstrapBroker({ credentialTtlMs: 1_000 }, entropy('D'));
  const expired = broker.issue(principal(), now);
  assert.equal(expired.ok, true);
  if (!expired.ok) throw new Error('bootstrap grant was unexpectedly rejected');
  assert.equal(broker.verify(expired.value.credential, now + 1_000), null);
  assert.equal(broker.verify(expired.value.credential, now + 1_001), null);

  const revoked = broker.issue(principal(), now + 2_000);
  assert.equal(revoked.ok, true);
  if (!revoked.ok) throw new Error('bootstrap grant was unexpectedly rejected');
  assert.equal(broker.revokeGatewaySession(revoked.value.gatewaySessionId), true);
  assert.equal(broker.verify(revoked.value.credential, now + 2_001), null);
  assert.equal(broker.verify(`gwc_${'z'.repeat(43)}`, now + 2_001), null);
});

test('bounds pending grants and rejects malformed or colliding entropy without weakening gates', () => {
  const bounded = new TransientGatewayBootstrapBroker({ maxActiveGrants: 1 }, entropy('E'));
  assert.equal(bounded.issue(principal(), now).ok, true);
  const capacity = bounded.issue(principal(), now + 1);
  assert.equal(capacity.ok ? '' : capacity.error.code, 'CAPACITY_EXHAUSTED');
  if (!capacity.ok) {
    assert.equal(capacity.error.retryable, false);
    assert.equal(capacity.authorizesExecution, false);
    assert.equal(capacity.provesExecutionSuccess, false);
    assert.equal(capacity.retryAuthorized, false);
  }

  const invalidEntropy: GatewayBootstrapEntropy = {
    credential: () => 'fixture-secret',
    gatewaySessionId: () => 'client-session',
  };
  const invalidBroker = new TransientGatewayBootstrapBroker({}, invalidEntropy);
  const invalid = invalidBroker.issue(principal(), now);
  assert.equal(invalid.ok ? '' : invalid.error.code, 'ENTROPY_FAILURE');
});
