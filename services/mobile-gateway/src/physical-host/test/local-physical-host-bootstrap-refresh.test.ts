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

    const oldExchange = await fetch(
      `http://127.0.0.1:${handle.address.bootstrap.port}${handle.address.bootstrap.path}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bootstrapReference: initial.bootstrapReference }),
      },
    );
    assert.equal(oldExchange.status, 401);

    const newExchange = await fetch(
      `http://127.0.0.1:${handle.address.bootstrap.port}${handle.address.bootstrap.path}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bootstrapReference: refreshed.bootstrapReference }),
      },
    );
    assert.equal(newExchange.status, 200);
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
