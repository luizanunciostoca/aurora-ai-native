// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import { Agent, request as httpRequest } from 'node:http';
// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import test from 'node:test';

import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';

import {
  GATEWAY_PROTOCOL_VERSION,
  GatewayHttpNetworkTransport,
  GatewaySessionManager,
} from '../index.js';
import type { GatewayAuthClaims, GatewayAuthenticator } from '../types.js';

const tenant = 'tenant:physical' as TenantId;
const actor = 'identity:physical' as IdentityId;
const correlation = 'correlation:physical' as CorrelationId;
const baseNow = 1_788_500_000_000;

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
    tenantId: tenant,
    actorIdentityId: actor,
    issuedAtMs: baseNow - 1_000,
    expiresAtMs: baseNow + 120_000,
    authVersion: 'physical-v1',
    ...overrides,
  };
}

function openBody(credential = 'credential:physical'): Record<string, unknown> {
  return {
    protocolVersion: GATEWAY_PROTOCOL_VERSION,
    sessionId: 'session:physical',
    credential,
    tenantId: tenant,
    actor: { kind: 'HUMAN', identityId: actor },
    correlation: { correlationId: correlation },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

function postRaw(
  port: number,
  path: string,
  rawBody: string,
  agent: object,
  contentType = 'application/json',
  method = 'POST',
): Promise<PostedResponse> {
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
          'content-type': contentType,
          'content-length': new TextEncoder().encode(rawBody).byteLength,
        },
      },
      (response: HttpResponseLike) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          try {
            resolve({ statusCode: response.statusCode ?? 0, body: parseJson(body) });
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

function postJson(
  port: number,
  path: string,
  body: unknown,
  agent: object,
  method = 'POST',
): Promise<PostedResponse> {
  return postRaw(port, path, JSON.stringify(body), agent, 'application/json', method);
}

function resultCode(response: PostedResponse): string {
  if (!isRecord(response.body) || response.body.ok !== false) return '';
  const error = response.body.error;
  if (!isRecord(error) || typeof error.code !== 'string') return '';
  return error.code;
}

function transportCode(response: PostedResponse): string {
  if (!isRecord(response.body) || response.body.ok !== false) return '';
  const error = response.body.transportError;
  if (!isRecord(error) || typeof error.code !== 'string') return '';
  return error.code;
}

function successfulValue(response: PostedResponse): Record<string, unknown> {
  assert.equal(response.statusCode, 200);
  assert.equal(isRecord(response.body), true);
  if (!isRecord(response.body)) throw new Error('response must be an object');
  assert.equal(response.body.ok, true);
  const value = response.body.value;
  assert.equal(isRecord(value), true);
  if (!isRecord(value)) throw new Error('successful response requires a value object');
  return value;
}

test('real socket path binds authenticated session, requests and reconnect without minting authority', async () => {
  const authenticator = new FixtureAuthenticator();
  authenticator.set('credential:physical', claims());
  authenticator.set(
    'credential:reconnect',
    claims({ issuedAtMs: baseNow + 500, expiresAtMs: baseNow + 180_000 }),
  );
  const manager = new GatewaySessionManager(authenticator);
  let now = baseNow;
  const transport = new GatewayHttpNetworkTransport(manager, {
    host: '127.0.0.1',
    clock: () => now,
  });
  const address = await transport.start(0);
  const agent = new Agent({ keepAlive: true, maxSockets: 1 }) as AgentLike;

  try {
    assert.equal(address.protocol, 'http');
    assert.equal(address.authorizesExecution, false);

    const opened = await postJson(address.port, '/v1/gateway/sessions/open', openBody(), agent);
    const session = successfulValue(opened);
    assert.equal(session.authorizesExecution, false);
    assert.equal('credential' in session, false);
    assert.equal(typeof session.connectionId, 'string');
    const firstConnectionId = String(session.connectionId);

    now += 1_000;
    const begun = await postJson(
      address.port,
      '/v1/gateway/requests/begin',
      { requestId: 'request:physical', deadlineMs: now + 10_000 },
      agent,
    );
    const request = successfulValue(begun);
    assert.equal(request.state, 'ACTIVE');
    assert.equal(request.authorizesExecution, false);

    now += 1_000;
    const cancelled = await postJson(
      address.port,
      '/v1/gateway/requests/cancel',
      { requestId: 'request:physical' },
      agent,
    );
    assert.equal(successfulValue(cancelled).state, 'CANCEL_REQUESTED');

    now += 1_000;
    const closed = await postJson(address.port, '/v1/gateway/sessions/close', {}, agent);
    assert.equal(successfulValue(closed).state, 'CLOSED');

    now += 1_000;
    const reconnected = await postJson(
      address.port,
      '/v1/gateway/sessions/reconnect',
      {
        ...openBody('credential:reconnect'),
        previousConnectionId: firstConnectionId,
      },
      agent,
    );
    const resumed = successfulValue(reconnected);
    assert.equal(resumed.generation, 2);
    assert.notEqual(resumed.connectionId, firstConnectionId);
    assert.equal(resumed.authorizesExecution, false);
  } finally {
    agent.destroy();
    await transport.stop();
  }
});

test('fails closed on unauthenticated socket use, auth failure and client-controlled binding/time fields', async () => {
  const authenticator = new FixtureAuthenticator();
  authenticator.set('credential:physical', claims());
  const manager = new GatewaySessionManager(authenticator);
  const transport = new GatewayHttpNetworkTransport(manager, {
    host: '127.0.0.1',
    clock: () => baseNow,
  });
  const address = await transport.start(0);
  const boundAgent = new Agent({ keepAlive: true, maxSockets: 1 }) as AgentLike;
  const unboundAgent = new Agent({ keepAlive: true, maxSockets: 1 }) as AgentLike;

  try {
    const unauthenticated = await postJson(
      address.port,
      '/v1/gateway/requests/begin',
      { requestId: 'request:no-session', deadlineMs: baseNow + 10_000 },
      unboundAgent,
    );
    assert.equal(unauthenticated.statusCode, 409);
    assert.equal(transportCode(unauthenticated), 'SESSION_BINDING_REQUIRED');

    const rejected = await postJson(
      address.port,
      '/v1/gateway/sessions/open',
      openBody('credential:unknown'),
      boundAgent,
    );
    assert.equal(rejected.statusCode, 200);
    assert.equal(resultCode(rejected), 'AUTH_INVALID');

    assert.equal(
      successfulValue(
        await postJson(address.port, '/v1/gateway/sessions/open', openBody(), boundAgent),
      ).authorizesExecution,
      false,
    );

    const injectedBinding = await postJson(
      address.port,
      '/v1/gateway/requests/begin',
      {
        requestId: 'request:injected',
        deadlineMs: baseNow + 10_000,
        tenantId: 'tenant:attacker',
      },
      boundAgent,
    );
    assert.equal(injectedBinding.statusCode, 400);
    assert.equal(transportCode(injectedBinding), 'BODY_MALFORMED');

    const injectedTime = await postJson(
      address.port,
      '/v1/gateway/sessions/open',
      { ...openBody(), sessionId: 'session:second', nowMs: baseNow - 1_000_000 },
      unboundAgent,
    );
    assert.equal(injectedTime.statusCode, 400);
    assert.equal(transportCode(injectedTime), 'BODY_MALFORMED');
  } finally {
    boundAgent.destroy();
    unboundAgent.destroy();
    await transport.stop();
  }
});

test('bounds route, method, content type, malformed JSON and body size before manager dispatch', async () => {
  const manager = new GatewaySessionManager(new FixtureAuthenticator());
  const transport = new GatewayHttpNetworkTransport(manager, {
    host: '127.0.0.1',
    maxBodyBytes: 512,
    clock: () => baseNow,
  });
  const address = await transport.start(0);
  const agent = new Agent({ keepAlive: true, maxSockets: 1 }) as AgentLike;

  try {
    const missingRoute = await postJson(address.port, '/v1/gateway/unknown', {}, agent);
    assert.equal(missingRoute.statusCode, 404);
    assert.equal(transportCode(missingRoute), 'ROUTE_NOT_FOUND');

    const wrongMethod = await postJson(
      address.port,
      '/v1/gateway/sessions/open',
      openBody(),
      agent,
      'PUT',
    );
    assert.equal(wrongMethod.statusCode, 405);
    assert.equal(transportCode(wrongMethod), 'METHOD_NOT_ALLOWED');

    const wrongContentType = await postRaw(
      address.port,
      '/v1/gateway/sessions/open',
      JSON.stringify(openBody()),
      agent,
      'text/plain',
    );
    assert.equal(wrongContentType.statusCode, 415);
    assert.equal(transportCode(wrongContentType), 'CONTENT_TYPE_UNSUPPORTED');

    const malformed = await postRaw(address.port, '/v1/gateway/sessions/open', '{not-json', agent);
    assert.equal(malformed.statusCode, 400);
    assert.equal(transportCode(malformed), 'BODY_MALFORMED');

    const oversized = await postRaw(
      address.port,
      '/v1/gateway/sessions/open',
      JSON.stringify({ padding: 'x'.repeat(2_048) }),
      agent,
    );
    assert.equal(oversized.statusCode, 413);
    assert.equal(transportCode(oversized), 'BODY_TOO_LARGE');
  } finally {
    agent.destroy();
    await transport.stop();
  }
});

test('refuses plaintext credential transport on non-loopback hosts', () => {
  const manager = new GatewaySessionManager(new FixtureAuthenticator());

  assert.throws(
    () => new GatewayHttpNetworkTransport(manager, { host: '0.0.0.0' }),
    /explicit loopback host/u,
  );
  assert.throws(
    () => new GatewayHttpNetworkTransport(manager, { host: '192.0.2.10' }),
    /explicit loopback host/u,
  );
});
