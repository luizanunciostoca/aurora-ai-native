// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import { tmpdir } from 'node:os';
// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import { join } from 'node:path';
// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import process from 'node:process';
// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import test from 'node:test';

import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';

import type { AuthenticatedGatewayBootstrapPrincipal } from '../../gateway-auth/gateway-bootstrap.js';
import {
  startW15JLocalPhysicalHostRunner,
  type W15JLocalPhysicalHostRunnerAnnouncement,
  type W15JLocalPhysicalHostRunnerHooks,
  type W15JLocalPhysicalHostSignal,
} from '../local-physical-host-runner.js';

const NOW = 1_788_631_000_000;
const REFRESH_ENV = 'AURORA_W15J_BOOTSTRAP_REFRESH_FILE';

const principal: AuthenticatedGatewayBootstrapPrincipal = {
  tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId,
  actor: {
    kind: 'HUMAN',
    identityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV' as IdentityId,
  },
  correlationId: 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CorrelationId,
  deviceId: 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  deviceSessionId: 'device-session:refresh-control',
  authenticatedAtMs: NOW - 1_000,
  authenticationExpiresAtMs: NOW + 120_000,
  authenticationReference: 'upstream-auth:refresh-control',
  authorizesExecution: false,
  canGrantPermission: false,
};

function hooks() {
  const announcements: W15JLocalPhysicalHostRunnerAnnouncement[] = [];
  const listeners = new Map<W15JLocalPhysicalHostSignal, () => void>();
  const value: W15JLocalPhysicalHostRunnerHooks = {
    emit: (announcement) => announcements.push(announcement),
    registerSignal: (signal, listener) => {
      listeners.set(signal, listener);
      return () => listeners.delete(signal);
    },
  };
  return { value, announcements, listeners };
}

async function waitForFile(path: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (existsSync(path)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('bootstrap refresh output was not written');
}

test('SIGUSR2 stages one fresh bootstrap reference without replacing the live host instance', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'aurora-w15j-bootstrap-refresh-'));
  chmodSync(fixture, 0o700);
  const output = join(fixture, 'bootstrap-refresh.json');
  const previous = process.env[REFRESH_ENV];
  process.env[REFRESH_ENV] = output;
  const runtime = hooks();

  const handle = await startW15JLocalPhysicalHostRunner({
    host: {
      databaseUrl: 'postgresql://unused.invalid/aurora_refresh',
      gatewayPort: 0,
      bootstrapPort: 0,
      clock: () => NOW,
    },
    dependencies: {
      voiceIntake: {
        evaluate: () => ({
          ok: false,
          acceptedForEvaluation: false,
          authorizesExecution: false,
          provesExecutionSuccess: false,
          retryAuthorized: false,
        }),
      },
      receiptEvidenceIngress: {
        observe: () => ({
          ok: false,
          code: 'UNAVAILABLE',
          retryable: true,
          authorizesExecution: false,
          provesExecutionSuccess: false,
          retryAuthorized: false,
        }),
      },
    },
    principal,
    hooks: runtime.value,
  });

  try {
    const initial = runtime.announcements[0];
    if (initial === undefined) throw new Error('initial bootstrap announcement missing');
    process.kill(process.pid, 'SIGUSR2');
    await waitForFile(output);

    const refreshed = JSON.parse(readFileSync(output, 'utf8')) as Readonly<Record<string, unknown>>;
    assert.deepEqual(Object.keys(refreshed).sort(), [
      'authorizesExecution',
      'bootstrapExpiresAtMs',
      'bootstrapReference',
      'hostInstanceId',
      'kind',
      'physicalEvidenceStatus',
      'provesExecutionSuccess',
      'retryAuthorized',
    ]);
    assert.equal(refreshed.kind, 'W15J_LOCAL_BOOTSTRAP_REFRESH_READY');
    assert.equal(refreshed.hostInstanceId, handle.hostInstanceId);
    assert.match(String(refreshed.bootstrapReference), /^gbr_[A-Za-z0-9_-]{43,128}$/u);
    assert.notEqual(refreshed.bootstrapReference, initial.bootstrapReference);
    assert.equal(refreshed.bootstrapExpiresAtMs, initial.bootstrapExpiresAtMs);
    assert.equal(refreshed.physicalEvidenceStatus, 'NOT_RUN');
    assert.equal(refreshed.authorizesExecution, false);
    assert.equal(refreshed.provesExecutionSuccess, false);
    assert.equal(refreshed.retryAuthorized, false);

    const newExchange = await fetch(
      `http://127.0.0.1:${handle.address.bootstrap.port}${handle.address.bootstrap.path}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bootstrapReference: refreshed.bootstrapReference }),
      },
    );
    assert.equal(newExchange.status, 200);
    const body = (await newExchange.json()) as Readonly<Record<string, unknown>>;
    assert.equal(body.ok, true);
    assert.equal(JSON.stringify(body).includes('"authorizesExecution":true'), false);
  } finally {
    await handle.stop();
    if (previous === undefined) Reflect.deleteProperty(process.env, REFRESH_ENV);
    else process.env[REFRESH_ENV] = previous;
    rmSync(fixture, { recursive: true, force: true });
  }
});

test('unsafe refresh output path fails host startup closed before any recovery control is exposed', async () => {
  const previous = process.env[REFRESH_ENV];
  process.env[REFRESH_ENV] = 'relative/bootstrap-refresh.json';
  const runtime = hooks();
  try {
    await assert.rejects(
      () =>
        startW15JLocalPhysicalHostRunner({
          host: {
            databaseUrl: 'postgresql://unused.invalid/aurora_refresh_invalid',
            gatewayPort: 0,
            bootstrapPort: 0,
            clock: () => NOW,
          },
          dependencies: {
            voiceIntake: {
              evaluate: () => ({
                ok: false,
                acceptedForEvaluation: false,
                authorizesExecution: false,
                provesExecutionSuccess: false,
                retryAuthorized: false,
              }),
            },
            receiptEvidenceIngress: {
              observe: () => ({
                ok: false,
                code: 'UNAVAILABLE',
                retryable: true,
                authorizesExecution: false,
                provesExecutionSuccess: false,
                retryAuthorized: false,
              }),
            },
          },
          principal,
          hooks: runtime.value,
        }),
      /bootstrap refresh output is invalid/u,
    );
    assert.equal(runtime.announcements.length, 0);
  } finally {
    if (previous === undefined) Reflect.deleteProperty(process.env, REFRESH_ENV);
    else process.env[REFRESH_ENV] = previous;
  }
});

const RECONNECT_ENV = 'AURORA_W15J_BOOTSTRAP_RECONNECT_FILE';

test('SIGUSR1 stages reconnect bootstrap only after an established gateway session', async () => {
  const fixture = mkdtempSync(join(tmpdir(), 'aurora-w15j-bootstrap-reconnect-'));
  chmodSync(fixture, 0o700);
  const output = join(fixture, 'bootstrap-reconnect.json');
  const previous = process.env[RECONNECT_ENV];
  process.env[RECONNECT_ENV] = output;
  const runtime = hooks();

  const handle = await startW15JLocalPhysicalHostRunner({
    host: {
      databaseUrl: 'postgresql://unused.invalid/aurora_reconnect',
      gatewayPort: 0,
      bootstrapPort: 0,
      clock: () => NOW,
    },
    dependencies: {
      voiceIntake: {
        evaluate: () => ({
          ok: false,
          acceptedForEvaluation: false,
          authorizesExecution: false,
          provesExecutionSuccess: false,
          retryAuthorized: false,
        }),
      },
      receiptEvidenceIngress: {
        observe: () => ({
          ok: false,
          code: 'UNAVAILABLE',
          retryable: true,
          authorizesExecution: false,
          provesExecutionSuccess: false,
          retryAuthorized: false,
        }),
      },
    },
    principal,
    hooks: runtime.value,
  });

  try {
    assert.throws(() => handle.reconnectBootstrapReference?.(), /RECONNECT_TARGET_UNAVAILABLE/u);
    const initial = runtime.announcements[0];
    if (initial === undefined) throw new Error('initial bootstrap announcement missing');

    const exchange = await fetch(
      `http://127.0.0.1:${handle.address.bootstrap.port}${handle.address.bootstrap.path}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bootstrapReference: initial.bootstrapReference }),
      },
    );
    assert.equal(exchange.status, 200);
    const exchanged = (await exchange.json()) as Readonly<{
      ok: boolean;
      value: Readonly<{
        gatewaySessionId: string;
        credential: string;
        tenantId: string;
        actor: Readonly<{ kind: string; identityId: string }>;
        correlationId: string;
      }>;
    }>;
    assert.equal(exchanged.ok, true);

    const opened = await fetch(
      `http://127.0.0.1:${handle.address.gateway.port}/v1/gateway/sessions/open`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          protocolVersion: '1.0',
          sessionId: exchanged.value.gatewaySessionId,
          credential: exchanged.value.credential,
          tenantId: exchanged.value.tenantId,
          actor: exchanged.value.actor,
          correlation: { correlationId: exchanged.value.correlationId },
        }),
      },
    );
    assert.equal(opened.status, 200);
    const openedBody = (await opened.json()) as Readonly<{
      ok: boolean;
      value: Readonly<{ sessionId: string; generation: number; authorizesExecution: boolean }>;
    }>;
    assert.equal(openedBody.ok, true);
    assert.equal(openedBody.value.generation, 1);
    assert.equal(openedBody.value.authorizesExecution, false);

    process.kill(process.pid, 'SIGUSR1');
    await waitForFile(output);
    const reconnect = JSON.parse(readFileSync(output, 'utf8')) as Readonly<Record<string, unknown>>;
    assert.equal(reconnect.kind, 'W15J_LOCAL_BOOTSTRAP_RECONNECT_READY');
    assert.equal(reconnect.hostInstanceId, handle.hostInstanceId);
    assert.match(String(reconnect.bootstrapReference), /^gbr_[A-Za-z0-9_-]{43,128}$/u);
    assert.equal(reconnect.authorizesExecution, false);
    assert.equal(reconnect.provesExecutionSuccess, false);
    assert.equal(reconnect.retryAuthorized, false);

    const reconnectExchange = await fetch(
      `http://127.0.0.1:${handle.address.bootstrap.port}${handle.address.bootstrap.path}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bootstrapReference: reconnect.bootstrapReference }),
      },
    );
    assert.equal(reconnectExchange.status, 200);
    const reconnectBody = (await reconnectExchange.json()) as Readonly<{
      ok: boolean;
      value: Readonly<{
        gatewaySessionId: string;
        credential: string;
        authorizesExecution: boolean;
        retryAuthorized: boolean;
      }>;
    }>;
    assert.equal(reconnectBody.ok, true);
    assert.equal(reconnectBody.value.gatewaySessionId, exchanged.value.gatewaySessionId);
    assert.notEqual(reconnectBody.value.credential, exchanged.value.credential);
    assert.equal(reconnectBody.value.authorizesExecution, false);
    assert.equal(reconnectBody.value.retryAuthorized, false);
  } finally {
    await handle.stop();
    if (previous === undefined) Reflect.deleteProperty(process.env, RECONNECT_ENV);
    else process.env[RECONNECT_ENV] = previous;
    rmSync(fixture, { recursive: true, force: true });
  }
});
