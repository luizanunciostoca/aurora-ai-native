// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import test from 'node:test';

import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';

import {
  GatewayBootstrapExchangeTransport,
  TransientGatewayBootstrapBroker,
  TransientGatewayBootstrapDeliveryBroker,
  type AuthenticatedGatewayBootstrapPrincipal,
  type GatewayBootstrapReferenceEntropy,
} from '../index.js';

const now = 1_788_620_000_000;

function principal(): AuthenticatedGatewayBootstrapPrincipal {
  return {
    tenantId: 'tenant:delivery' as TenantId,
    actor: { kind: 'HUMAN', identityId: 'identity:delivery' as IdentityId },
    correlationId: 'correlation:delivery' as CorrelationId,
    deviceId: 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    deviceSessionId: 'device-session:delivery',
    authenticatedAtMs: now - 1_000,
    authenticationExpiresAtMs: now + 120_000,
    authenticationReference: 'upstream:delivery',
    authorizesExecution: false,
    canGrantPermission: false,
  };
}

function entropy(): GatewayBootstrapReferenceEntropy {
  return { reference: () => `gbr_${'r'.repeat(43)}` };
}

test('stages and exchanges a single-use opaque reference without exposing the principal', () => {
  const broker = new TransientGatewayBootstrapBroker({}, {
    credential: () => `gwc_${'c'.repeat(43)}`,
    gatewaySessionId: () => `gws_${'s'.repeat(22)}`,
  });
  const delivery = new TransientGatewayBootstrapDeliveryBroker(broker, {}, entropy());
  const staged = delivery.stage(principal(), now);
  assert.equal(staged.ok, true);
  if (!staged.ok) throw new Error('reference was not staged');
  assert.match(staged.value.reference, /^gbr_[A-Za-z0-9_-]{43,128}$/u);
  assert.equal('tenantId' in staged.value, false);

  const exchanged = delivery.exchange(staged.value.reference, now + 1);
  assert.equal(exchanged.ok, true);
  if (!exchanged.ok) throw new Error('reference was not exchanged');
  assert.equal(exchanged.value.authorizesExecution, false);
  assert.equal(delivery.exchange(staged.value.reference, now + 2).ok, false);
});

test('expires and rejects malformed references before minting a credential', () => {
  const broker = new TransientGatewayBootstrapBroker();
  const delivery = new TransientGatewayBootstrapDeliveryBroker(
    broker,
    { referenceTtlMs: 1_000 },
    entropy(),
  );
  const staged = delivery.stage(principal(), now);
  assert.equal(staged.ok, true);
  if (!staged.ok) throw new Error('reference was not staged');
  assert.equal(delivery.exchange(staged.value.reference, now + 1_000).ok, false);
  assert.equal(delivery.exchange('tenant:client-minted', now + 1_001).ok, false);
});

test('exchange listener is loopback-only and accepts only the reference body', async () => {
  const delivery = new TransientGatewayBootstrapDeliveryBroker(
    new TransientGatewayBootstrapBroker(),
    {},
    entropy(),
  );
  assert.throws(() => new GatewayBootstrapExchangeTransport(delivery, { host: '0.0.0.0' }));
  const transport = new GatewayBootstrapExchangeTransport(delivery);
  await transport.stop();
});
