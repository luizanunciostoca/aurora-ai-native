// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import test from 'node:test';

import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';

import {
  GatewayBootstrapDeliveryBroker,
  GatewaySessionManager,
  GATEWAY_PROTOCOL_VERSION,
  TransientGatewayBootstrapBroker,
  type AuthenticatedGatewayBootstrapPrincipal,
} from '../index.js';

const now = 1_788_630_000_000;
const tenantId = 'tenant:alpha' as TenantId;
const identityId = 'identity:alpha' as IdentityId;
const correlationId = 'correlation:bootstrap-delivery' as CorrelationId;
const deviceId = 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const deviceSessionId = 'device-session:alpha';

function principal(
  overrides: Partial<AuthenticatedGatewayBootstrapPrincipal> = {},
): AuthenticatedGatewayBootstrapPrincipal {
  return {
    tenantId,
    actor: { kind: 'HUMAN', identityId },
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

function delivery(reference = `gbr_${'r'.repeat(43)}`): GatewayBootstrapDeliveryBroker {
  const issuer = new TransientGatewayBootstrapBroker(
    {},
    {
      credential: () => `gwc_${'c'.repeat(43)}`,
      gatewaySessionId: () => `gws_${'s'.repeat(22)}`,
    },
  );
  return new GatewayBootstrapDeliveryBroker(
    issuer,
    {},
    { reference: () => reference },
  );
}

test('stages only an opaque non-authoritative reference and exchanges it exactly once', () => {
  const broker = delivery();
  const staged = broker.stage(principal(), now);
  assert.equal(staged.ok, true);
  if (!staged.ok) throw new Error('reference stage rejected');
  assert.deepEqual(Object.keys(staged.value).sort(), [
    'authorizesExecution',
    'bootstrapReference',
    'expiresAtMs',
    'provesExecutionSuccess',
    'retryAuthorized',
  ]);
  assert.equal(staged.value.authorizesExecution, false);
  assert.equal(staged.value.provesExecutionSuccess, false);
  assert.equal(staged.value.retryAuthorized, false);

  const exchanged = broker.exchange(staged.value.bootstrapReference, now + 1);
  assert.equal(exchanged.ok, true);
  if (!exchanged.ok) throw new Error('reference exchange rejected');
  assert.equal(exchanged.value.tenantId, tenantId);
  assert.equal(exchanged.value.actor.identityId, identityId);
  assert.equal(exchanged.value.correlationId, correlationId);
  assert.equal(exchanged.value.deviceId, deviceId);
  assert.equal(exchanged.value.deviceSessionId, deviceSessionId);
  assert.equal(exchanged.value.authorizesExecution, false);
  assert.equal(exchanged.value.provesExecutionSuccess, false);
  assert.equal(exchanged.value.retryAuthorized, false);
  assert.equal(broker.exchange(staged.value.bootstrapReference, now + 2).ok, false);
});

test('issued grant is bound to server-staged gateway session actor and correlation', () => {
  const broker = delivery();
  const staged = broker.stage(principal(), now);
  assert.equal(staged.ok, true);
  if (!staged.ok) throw new Error('reference stage rejected');
  const exchanged = broker.exchange(staged.value.bootstrapReference, now + 1);
  assert.equal(exchanged.ok, true);
  if (!exchanged.ok) throw new Error('reference exchange rejected');

  const manager = new GatewaySessionManager(brokerIssuer(exchanged.value.credential, exchanged.value));
  const substituted = manager.openSession({
    protocolVersion: GATEWAY_PROTOCOL_VERSION,
    sessionId: `${exchanged.value.gatewaySessionId}-substituted`,
    credential: exchanged.value.credential,
    tenantId: exchanged.value.tenantId,
    actor: exchanged.value.actor,
    correlation: { correlationId: exchanged.value.correlationId },
    nowMs: now + 2,
  });
  assert.equal(substituted.ok, false);
});

function brokerIssuer(
  credential: string,
  grant: {
    gatewaySessionId: string;
    tenantId: TenantId;
    actor: { kind: 'HUMAN' | 'AGENT' | 'SERVICE' | 'SYSTEM'; identityId: IdentityId };
    correlationId: CorrelationId;
    issuedAtMs: number;
    expiresAtMs: number;
  },
) {
  let consumed = false;
  return {
    verify(candidate: string) {
      if (candidate !== credential || consumed) return null;
      consumed = true;
      return {
        tenantId: grant.tenantId,
        actorIdentityId: grant.actor.identityId,
        issuedAtMs: grant.issuedAtMs,
        expiresAtMs: grant.expiresAtMs,
        authVersion: 'w14-bootstrap-v1',
        gatewaySessionId: grant.gatewaySessionId,
        actorKind: grant.actor.kind,
        correlationId: grant.correlationId,
      };
    },
  };
}

test('expired revoked replayed and malformed references fail closed with no retry authority', () => {
  const broker = delivery();
  const staged = broker.stage(principal(), now);
  assert.equal(staged.ok, true);
  if (!staged.ok) throw new Error('reference stage rejected');

  const expired = broker.exchange(staged.value.bootstrapReference, now + 120_000);
  assert.equal(expired.ok, false);
  if (!expired.ok) {
    assert.equal(expired.error.code, 'REFERENCE_EXPIRED');
    assert.equal(expired.error.retryable, false);
    assert.equal(expired.authorizesExecution, false);
    assert.equal(expired.provesExecutionSuccess, false);
    assert.equal(expired.retryAuthorized, false);
  }

  const second = broker.stage(principal(), now + 1);
  assert.equal(second.ok, true);
  if (!second.ok) throw new Error('reference stage rejected');
  assert.equal(broker.revoke(second.value.bootstrapReference), true);
  assert.equal(broker.exchange(second.value.bootstrapReference, now + 2).ok, false);
  assert.equal(broker.exchange('not-a-bootstrap-reference', now + 2).ok, false);
});

test('rejects malformed principal and authority-shaped principal before staging', () => {
  const broker = delivery();
  assert.equal(broker.stage({ ...principal(), actor: null }, now).ok, false);
  assert.equal(
    broker.stage({ ...principal(), authorizesExecution: true } as unknown, now).ok,
    false,
  );
  const accessor = Object.defineProperty({ ...principal() }, 'tenantId', {
    enumerable: true,
    get() {
      throw new Error('must not invoke accessor');
    },
  });
  assert.doesNotThrow(() => broker.stage(accessor, now));
  assert.equal(broker.stage(accessor, now).ok, false);
});

test('bounds staged references and rejects invalid or colliding entropy', () => {
  const issuer = new TransientGatewayBootstrapBroker();
  const bounded = new GatewayBootstrapDeliveryBroker(
    issuer,
    { maxPendingReferences: 1 },
    { reference: () => `gbr_${'a'.repeat(43)}` },
  );
  assert.equal(bounded.stage(principal(), now).ok, true);
  const capacity = bounded.stage(principal(), now + 1);
  assert.equal(capacity.ok, false);
  if (!capacity.ok) assert.equal(capacity.error.code, 'CAPACITY_EXHAUSTED');

  const invalid = new GatewayBootstrapDeliveryBroker(
    issuer,
    {},
    { reference: () => 'fixture-reference' },
  );
  const invalidResult = invalid.stage(principal(), now);
  assert.equal(invalidResult.ok, false);
  if (!invalidResult.ok) assert.equal(invalidResult.error.code, 'ENTROPY_FAILURE');
});
