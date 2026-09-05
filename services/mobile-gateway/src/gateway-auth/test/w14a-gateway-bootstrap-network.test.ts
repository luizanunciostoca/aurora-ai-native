// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import { request } from 'node:http';
// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import test from 'node:test';

import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';

import {
  GatewayBootstrapDeliveryBroker,
  GatewayBootstrapHttpExchangeServer,
  TransientGatewayBootstrapBroker,
  type AuthenticatedGatewayBootstrapPrincipal,
} from '../index.js';

const now = 1_788_630_100_000;
const principal: AuthenticatedGatewayBootstrapPrincipal = {
  tenantId: 'tenant:alpha' as TenantId,
  actor: { kind: 'HUMAN', identityId: 'identity:alpha' as IdentityId },
  correlationId: 'correlation:network-bootstrap' as CorrelationId,
  deviceId: 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  deviceSessionId: 'device-session:network',
  authenticatedAtMs: now - 1_000,
  authenticationExpiresAtMs: now + 120_000,
  authenticationReference: 'upstream-auth:network',
  authorizesExecution: false,
  canGrantPermission: false,
};

function delivery(): GatewayBootstrapDeliveryBroker {
  return new GatewayBootstrapDeliveryBroker(
    new TransientGatewayBootstrapBroker(
      {},
      {
        credential: () => `gwc_${'c'.repeat(43)}`,
        gatewaySessionId: () => `gws_${'s'.repeat(22)}`,
      },
    ),
    {},
    { reference: () => `gbr_${'r'.repeat(43)}` },
  );
}

async function post(
  port: number,
  path: string,
  body: string,
  contentType = 'application/json',
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'content-type': contentType,
          'content-length': Buffer.byteLength(body),
        },
      },
      (response: { statusCode?: number; on(event: string, listener: (chunk?: unknown) => void): void }) => {
        let responseBody = '';
        response.on('data', (chunk) => {
          responseBody += String(chunk ?? '');
        });
        response.on('end', () => {
          resolve({ statusCode: response.statusCode ?? 0, body: responseBody });
        });
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

test('exchanges only a server-staged opaque reference and never accepts client identity fields', async () => {
  const broker = delivery();
  const staged = broker.stage(principal, now);
  assert.equal(staged.ok, true);
  if (!staged.ok) throw new Error('stage failed');

  const server = new GatewayBootstrapHttpExchangeServer(broker, { clock: () => now + 1 });
  const address = await server.start();
  try {
    const injected = await post(
      address.port,
      address.path,
      JSON.stringify({
        bootstrapReference: staged.value.bootstrapReference,
        tenantId: 'tenant:client-forged',
      }),
    );
    assert.equal(injected.statusCode, 400);
    assert.equal(injected.body.includes('tenant:client-forged'), false);

    const accepted = await post(
      address.port,
      address.path,
      JSON.stringify({ bootstrapReference: staged.value.bootstrapReference }),
    );
    assert.equal(accepted.statusCode, 200);
    const parsed = JSON.parse(accepted.body) as Record<string, unknown>;
    assert.equal(parsed.ok, true);
    assert.equal(accepted.body.includes('"authorizesExecution":true'), false);
    assert.equal(accepted.body.includes('"provesExecutionSuccess":true'), false);
    assert.equal(accepted.body.includes('"retryAuthorized":true'), false);

    const replay = await post(
      address.port,
      address.path,
      JSON.stringify({ bootstrapReference: staged.value.bootstrapReference }),
    );
    assert.equal(replay.statusCode, 401);
    assert.equal(replay.body.includes(staged.value.bootstrapReference), false);
  } finally {
    await server.stop();
  }
});

test('fails closed on wrong route malformed body and unsupported content type', async () => {
  const broker = delivery();
  const server = new GatewayBootstrapHttpExchangeServer(broker, { clock: () => now });
  const address = await server.start();
  try {
    assert.equal((await post(address.port, '/not-bootstrap', '{}')).statusCode, 404);
    assert.equal((await post(address.port, address.path, '{')).statusCode, 400);
    assert.equal(
      (await post(address.port, address.path, '{}', 'text/plain')).statusCode,
      415,
    );
  } finally {
    await server.stop();
  }
});

test('refuses non-loopback binding configuration', () => {
  assert.throws(
    () => new GatewayBootstrapHttpExchangeServer(delivery(), { host: '0.0.0.0' }),
    /loopback/u,
  );
});
