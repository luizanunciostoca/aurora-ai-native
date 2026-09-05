// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import test from 'node:test';

import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';

import type { W07DeviceReceiptEvidenceIngressPort } from '../../device-receipt-ingress/types.js';
import type { AuthenticatedGatewayBootstrapPrincipal } from '../../gateway-auth/gateway-bootstrap.js';
import type { VoiceCandidateIntakePort } from '../../gateway-auth/voice-candidate-network.js';
import {
  startW15JLocalPhysicalHostRunner,
  type W15JLocalPhysicalHostRunnerAnnouncement,
  type W15JLocalPhysicalHostRunnerHooks,
  type W15JLocalPhysicalHostSignal,
} from '../local-physical-host-runner.js';

const NOW = 1_788_631_000_000;
const AUTH_REFERENCE = 'upstream-auth:runner-secret-reference';

const principal: AuthenticatedGatewayBootstrapPrincipal = {
  tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId,
  actor: {
    kind: 'HUMAN',
    identityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV' as IdentityId,
  },
  correlationId: 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CorrelationId,
  deviceId: 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  deviceSessionId: 'device-session:runner',
  authenticatedAtMs: NOW - 1_000,
  authenticationExpiresAtMs: NOW + 120_000,
  authenticationReference: AUTH_REFERENCE,
  authorizesExecution: false,
  canGrantPermission: false,
};

const voiceIntake: VoiceCandidateIntakePort = {
  evaluate: () => ({
    ok: false,
    acceptedForEvaluation: false,
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

function hooks() {
  const announcements: W15JLocalPhysicalHostRunnerAnnouncement[] = [];
  const listeners = new Map<W15JLocalPhysicalHostSignal, () => void>();
  let removals = 0;
  let cleanupFailures = 0;
  const value: W15JLocalPhysicalHostRunnerHooks = {
    emit: (item) => announcements.push(item),
    registerSignal: (signal, listener) => {
      listeners.set(signal, listener);
      return () => {
        removals += 1;
        listeners.delete(signal);
      };
    },
    cleanupFailed: () => {
      cleanupFailures += 1;
    },
  };
  return {
    value,
    announcements,
    listeners,
    removals: () => removals,
    cleanupFailures: () => cleanupFailures,
  };
}

function hostInput(runtimeHooks: W15JLocalPhysicalHostRunnerHooks) {
  return {
    host: {
      databaseUrl: 'postgresql://unused.invalid/aurora_runner',
      gatewayPort: 0,
      bootstrapPort: 0,
      clock: () => NOW,
    },
    dependencies: { voiceIntake, receiptEvidenceIngress },
    principal,
    hooks: runtimeHooks,
  } as const;
}

test('starts both loopback listeners emits only allowlisted bootstrap metadata and cleans up on signal', async () => {
  const runtime = hooks();
  const handle = await startW15JLocalPhysicalHostRunner(hostInput(runtime.value));

  assert.equal(runtime.announcements.length, 1);
  const ready = runtime.announcements[0];
  if (ready === undefined) throw new Error('runner emitted no ready announcement');
  assert.deepEqual(Object.keys(ready).sort(), [
    'authorizesExecution',
    'bootstrap',
    'bootstrapExpiresAtMs',
    'bootstrapReference',
    'gateway',
    'hostMode',
    'kind',
    'physicalEvidenceStatus',
    'provesExecutionSuccess',
    'retryAuthorized',
  ]);
  assert.match(ready.bootstrapReference, /^gbr_[A-Za-z0-9_-]{43,128}$/u);
  assert.equal(ready.gateway.host, '127.0.0.1');
  assert.equal(ready.bootstrap.host, '127.0.0.1');
  assert.notEqual(ready.gateway.port, ready.bootstrap.port);
  assert.equal(ready.bootstrap.path, '/v1/gateway/bootstrap/exchange');
  assert.equal(ready.physicalEvidenceStatus, 'NOT_RUN');
  assert.equal(ready.authorizesExecution, false);
  assert.equal(ready.provesExecutionSuccess, false);
  assert.equal(ready.retryAuthorized, false);

  const serialized = JSON.stringify(ready);
  for (const forbidden of [
    principal.tenantId,
    principal.actor.identityId,
    principal.correlationId,
    principal.deviceId,
    principal.deviceSessionId,
    principal.authenticationReference,
    'credential',
    'POLICY_TOKEN',
    'VERIFIED',
  ]) {
    assert.equal(serialized.includes(String(forbidden)), false);
  }

  assert.equal(runtime.listeners.size, 2);
  runtime.listeners.get('SIGTERM')?.();
  await handle.stop();
  await handle.stop();
  assert.equal(runtime.listeners.size, 0);
  assert.equal(runtime.removals(), 2);
  assert.equal(runtime.cleanupFailures(), 0);
});

test('expired staged principal fails closed after listener startup and emits no bootstrap reference', async () => {
  const runtime = hooks();
  await assert.rejects(
    () =>
      startW15JLocalPhysicalHostRunner({
        ...hostInput(runtime.value),
        principal: { ...principal, authenticationExpiresAtMs: NOW },
      }),
    /bootstrap staging failed: PRINCIPAL_EXPIRED/u,
  );
  assert.equal(runtime.announcements.length, 0);
  assert.equal(runtime.listeners.size, 0);
});

test('output or signal hook failure closes the real host and returns a sanitized initialization error', async () => {
  const listeners = new Map<W15JLocalPhysicalHostSignal, () => void>();
  const runtimeHooks: W15JLocalPhysicalHostRunnerHooks = {
    emit: () => {
      throw new Error(`must not escape ${AUTH_REFERENCE}`);
    },
    registerSignal: (signal, listener) => {
      listeners.set(signal, listener);
      return () => listeners.delete(signal);
    },
  };

  await assert.rejects(
    () => startW15JLocalPhysicalHostRunner(hostInput(runtimeHooks)),
    (error: unknown) =>
      error instanceof Error &&
      error.message === 'W15-J LOCAL runner initialization failed.' &&
      !error.message.includes(AUTH_REFERENCE),
  );
  assert.equal(listeners.size, 0);
});
