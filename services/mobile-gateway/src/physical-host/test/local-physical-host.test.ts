// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import { request } from 'node:http';
// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import test from 'node:test';

import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';

import type { W07DeviceReceiptEvidenceIngressPort } from '../../device-receipt-ingress/types.js';
import type { VoiceCandidateIntakePort } from '../../gateway-auth/voice-candidate-network.js';
import type { AuthenticatedGatewayBootstrapPrincipal } from '../../gateway-auth/gateway-bootstrap.js';
import { W15JLocalPhysicalHost } from '../local-physical-host.js';

const NOW = 1_788_631_000_000;

const principal: AuthenticatedGatewayBootstrapPrincipal = {
  tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId,
  actor: {
    kind: 'HUMAN',
    identityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV' as IdentityId,
  },
  correlationId: 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CorrelationId,
  deviceId: 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  deviceSessionId: 'device-session:physical-host',
  authenticatedAtMs: NOW - 1_000,
  authenticationExpiresAtMs: NOW + 120_000,
  authenticationReference: 'upstream-auth:physical-host',
  authorizesExecution: false,
  canGrantPermission: false,
};

const voiceIntake: VoiceCandidateIntakePort = {
  evaluate: () => ({
    kind: 'VOICE_CANDIDATE_INTAKE',
    ok: false,
    acceptedForEvaluation: false,
    error: { code: 'CANONICAL_RESOLUTION_UNAVAILABLE' },
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  }),
};

const receiptEvidenceIngress: W07DeviceReceiptEvidenceIngressPort = {
  observe: () => ({
    ok: false,
    code: 'UNAVAILABLE',
    retryable: true,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  }),
};

async function post(
  port: number,
  path: string,
  body: unknown,
): Promise<{ statusCode: number; body: string }> {
  const serialized = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': new TextEncoder().encode(serialized).byteLength,
        },
      },
      (response: {
        statusCode?: number;
        on(event: string, listener: (chunk?: unknown) => void): void;
      }) => {
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
    req.end(serialized);
  });
}

test('starts loopback gateway and bootstrap listeners and opens W14 session from one-shot gbr exchange', async () => {
  const host = new W15JLocalPhysicalHost(
    {
      databaseUrl: 'postgresql://unused.invalid/aurora_physical',
      gatewayPort: 0,
      bootstrapPort: 0,
      clock: () => NOW,
    },
    { voiceIntake, receiptEvidenceIngress },
  );
  const staged = host.stageBootstrap(principal);
  assert.equal(staged.ok, true);
  if (!staged.ok) throw new Error('bootstrap stage failed');

  const address = await host.start();
  try {
    assert.equal(address.gateway.host, '127.0.0.1');
    assert.equal(address.bootstrap.host, '127.0.0.1');
    assert.notEqual(address.gateway.port, address.bootstrap.port);
    assert.equal(address.hostMode, 'LOOPBACK_ONLY');
    assert.equal(address.physicalEvidenceStatus, 'NOT_RUN');
    assert.equal(address.authorizesExecution, false);

    const exchange = await post(address.bootstrap.port, address.bootstrap.path, {
      bootstrapReference: staged.value.bootstrapReference,
    });
    assert.equal(exchange.statusCode, 200);
    const exchangeBody = JSON.parse(exchange.body) as {
      ok?: unknown;
      value?: Readonly<Record<string, unknown>>;
    };
    assert.equal(exchangeBody.ok, true);
    const grant = exchangeBody.value;
    if (grant === undefined) throw new Error('bootstrap exchange returned no grant');

    const opened = await post(address.gateway.port, '/v1/gateway/sessions/open', {
      protocolVersion: '1.0',
      sessionId: grant.gatewaySessionId,
      credential: grant.credential,
      tenantId: grant.tenantId,
      actor: grant.actor,
      correlation: { correlationId: grant.correlationId },
    });
    assert.equal(opened.statusCode, 200);
    const openedBody = JSON.parse(opened.body) as Readonly<Record<string, unknown>>;
    assert.equal(openedBody.ok, true);
    assert.equal(opened.body.includes('"authorizesExecution":true'), false);

    const replay = await post(address.bootstrap.port, address.bootstrap.path, {
      bootstrapReference: staged.value.bootstrapReference,
    });
    assert.equal(replay.statusCode, 401);
    assert.equal(replay.body.includes(staged.value.bootstrapReference), false);
  } finally {
    await host.stop();
  }
});

test('fails closed on invalid ports double start and expired server-side principal', async () => {
  assert.throws(
    () =>
      new W15JLocalPhysicalHost(
        {
          databaseUrl: 'postgresql://unused.invalid/aurora_physical',
          gatewayPort: 8080,
          bootstrapPort: 8080,
          clock: () => NOW,
        },
        { voiceIntake, receiptEvidenceIngress },
      ),
    /distinct gateway and bootstrap ports/u,
  );

  const host = new W15JLocalPhysicalHost(
    {
      databaseUrl: 'postgresql://unused.invalid/aurora_physical',
      gatewayPort: 0,
      bootstrapPort: 0,
      clock: () => NOW,
    },
    { voiceIntake, receiptEvidenceIngress },
  );
  const expired = host.stageBootstrap({
    ...principal,
    authenticationExpiresAtMs: NOW,
  });
  assert.equal(expired.ok, false);

  await host.start();
  try {
    await assert.rejects(() => host.start(), /already started/u);
  } finally {
    await host.stop();
  }
  await host.stop();
});
