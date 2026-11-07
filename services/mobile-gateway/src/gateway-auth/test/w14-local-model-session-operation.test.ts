// @ts-expect-error -- gateway-auth tests intentionally use Node built-ins without @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- gateway-auth tests intentionally use Node built-ins without @types/node.
import test from 'node:test';

import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';
import { DeviceSessionTrustManager } from '../../device-session/session-trust.js';
import type { DeviceAttestationReference } from '../../device-session/types.js';
import { InMemoryDeviceRegistry, parseDeviceId } from '../../device/registry.js';
import type { DeviceTransition } from '../../device/types.js';
import { LocalModelSessionAdmission } from '../local-model-session-admission.js';
import {
  LocalModelSessionOperation,
  type LocalModelBoundRequest,
  type LocalModelSessionGuards,
  type LocalModelSessionOperationDependencies,
  type LocalModelSessionOperationResult,
} from '../local-model-session-operation.js';
import { GatewaySessionManager } from '../session-manager.js';

const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId;
const ACTOR = 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAW' as IdentityId;
const CORRELATION = 'correlation:session:core' as CorrelationId;
const DEVICE = parseDeviceId('dvc_01ARZ3NDEKTSV4RRFFQ69G5FAX');
const NOW = Date.parse('2026-11-06T12:00:00Z');
const GENERATED = {
  status: 'GENERATED',
  content: 'Informação pública de teste; nenhuma ação foi executada.',
  strategyId: 'aurora.local.qwen35.2b',
  modelSha256: 'aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223',
  authoritySemantics: 'INTELLIGENCE_ONLY_NO_AUTHORITY',
  authorizesExecution: false,
  canInvokeTools: false,
} as const;

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((done) => {
      resolve = done;
    }),
    resolve: (value) => resolve(value),
  };
}

async function tick(): Promise<void> {
  await new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 0));
}

function fixture(
  options: {
    readonly invoke?: LocalModelSessionOperationDependencies['invoke'];
    readonly readCurrent?: LocalModelSessionOperationDependencies['currentAttestation']['readCurrent'];
    readonly authLifetimeMs?: number;
    readonly attestationAgeMs?: number;
    readonly registerSyntheticReleaseGuard?: boolean;
    readonly registerSyntheticWork?: boolean;
  } = {},
) {
  let clock = NOW;
  let clockFailure = false;
  let observed: DeviceAttestationReference = {
    kind: 'DEVICE_ATTESTATION_REFERENCE',
    reference: 'attestation:explicit:test',
    provider: 'fixture:attester',
    version: '1',
    state: 'VERIFIED',
    observedAtMs: NOW - 100,
    expiresAtMs: NOW + 60_000,
  };
  const counts = { begin: 0, cancel: 0, complete: 0, attestation: 0, invoke: 0 };
  const gateway = new GatewaySessionManager({
    verify(credential: string) {
      return credential === 'fixture-only-not-live'
        ? {
            tenantId: TENANT,
            actorIdentityId: ACTOR,
            issuedAtMs: NOW - 1_000,
            expiresAtMs: NOW + (options.authLifetimeMs ?? 60_000),
            authVersion: 'test-only',
          }
        : null;
    },
  });
  const opened = gateway.openSession({
    protocolVersion: '1.0',
    sessionId: 'gateway:core:1',
    credential: 'fixture-only-not-live',
    tenantId: TENANT,
    actor: { kind: 'HUMAN', identityId: ACTOR },
    correlation: { correlationId: CORRELATION },
    nowMs: NOW,
  });
  if (!opened.ok) throw new Error('canonical gateway test setup failed');
  const devices = new InMemoryDeviceRegistry();
  const provenance = {
    source: 'W14_DEVICE_REGISTRATION',
    reference: 'registry:fixture',
    observedAt: new Date(NOW).toISOString(),
  } as const;
  const registered = devices.register({
    deviceId: DEVICE,
    tenantId: TENANT,
    boundIdentityId: ACTOR,
    registeredAt: new Date(NOW).toISOString(),
    provenance,
  });
  if (!registered.ok) throw new Error('canonical registry test setup failed');
  const activated = devices.transition('ACTIVATE', {
    ref: registered.record.ref,
    expectedVersion: registered.record.ref.registrationVersion,
    transitionedAt: new Date(NOW).toISOString(),
    provenance,
  });
  if (!activated.ok) throw new Error('canonical registry activation test setup failed');
  const deviceSessions = new DeviceSessionTrustManager({
    maxAttestationAgeMs: options.attestationAgeMs ?? 30_000,
  });
  const trusted = deviceSessions.openSession({
    deviceSessionId: 'device:core:1',
    gatewaySession: opened.value,
    deviceRecord: activated.record,
    attestation: observed,
    nowMs: NOW,
  });
  if (!trusted.ok) throw new Error('canonical device trust test setup failed');
  const binding = Object.freeze({
    sessionId: opened.value.sessionId,
    connectionId: opened.value.connectionId,
    tenantId: TENANT,
    actorIdentityId: ACTOR,
    correlationId: CORRELATION,
  });
  const gatewayPort: LocalModelSessionOperationDependencies['gatewaySessions'] = {
    getSession: (sessionId, nowMs) => gateway.getSession(sessionId, nowMs),
    beginRequest: (input) => {
      counts.begin += 1;
      return gateway.beginRequest(input);
    },
    cancelRequest: (input) => {
      counts.cancel += 1;
      return gateway.cancelRequest(input);
    },
    completeRequest: (input) => {
      counts.complete += 1;
      return gateway.completeRequest(input);
    },
  };
  const deps: LocalModelSessionOperationDependencies = {
    gatewaySessions: gatewayPort,
    deviceSessions,
    devices,
    currentAttestation: {
      readCurrent: async (bound) => {
        counts.attestation += 1;
        return options.readCurrent ? options.readCurrent(bound) : observed;
      },
    },
    now: () => {
      if (clockFailure) throw new Error('private-clock-error');
      return clock;
    },
    invoke: (bound, signal, guards) => {
      counts.invoke += 1;
      // Explicit software-only source fixture, never an assertion about live consent.
      if (options.registerSyntheticReleaseGuard !== false) guards.registerReleaseGuard(() => true);
      if (options.registerSyntheticWork === false)
        return options.invoke ? options.invoke(bound, signal, guards) : Promise.resolve(GENERATED);
      // This fixture observes its actual synthetic invocation, never a resolved
      // substitute for production work. Admission is before the fixture starts.
      let admitted = false;
      const work = Promise.resolve().then(() => {
        if (!admitted) throw new Error('fixture work not admitted');
        return options.invoke ? options.invoke(bound, signal, guards) : GENERATED;
      });
      void work.catch(() => undefined);
      guards.registerWork(work);
      admitted = true;
      return work;
    },
  };
  const operation = new LocalModelSessionOperation(deps);
  return {
    operation,
    gateway,
    gatewayPort,
    deviceSessions,
    devices,
    counts,
    binding,
    deps,
    body: (requestId = 'request:core:1', horizon = 2_000) => ({
      deviceSessionId: 'device:core:1',
      requestId,
      deadlineMs: NOW + horizon,
    }),
    setClock: (value: number) => {
      clock = value;
    },
    failClock: () => {
      clockFailure = true;
    },
    setAttestation: (value: DeviceAttestationReference) => {
      observed = value;
    },
    attestation: () => observed,
    transition: (transition: DeviceTransition) => {
      const changed = devices.transition(transition, {
        ref: activated.record.ref,
        expectedVersion: activated.record.ref.registrationVersion,
        transitionedAt: new Date(NOW + 1).toISOString(),
        provenance,
      });
      if (!changed.ok) throw new Error('canonical test transition failed');
      return changed.record;
    },
    outstanding: () => {
      const current = gateway.getSession(binding.sessionId, clock);
      return current.ok ? current.value.outstandingRequests : null;
    },
  };
}

function denied(result: LocalModelSessionOperationResult): string {
  assert.equal(result.status, 'ABSTAINED');
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.canInvokeTools, false);
  assert.equal(result.canGrantPermission, false);
  assert.equal(Object.hasOwn(result, 'content'), false);
  if (result.status !== 'ABSTAINED') throw new Error('expected safe abstention');
  return result.code;
}

test('real W14 registry, trust and gateway compose one admission, current checks and completion', async () => {
  let delegated: LocalModelBoundRequest | undefined;
  const f = fixture({
    invoke: async (bound, signal, guards) => {
      delegated = bound;
      assert.equal(Object.isFrozen(bound), true);
      assert.equal(signal.aborted, false);
      assert.equal(await guards.revalidateCurrent(), true);
      assert.equal(guards.isCurrent(), true);
      return GENERATED;
    },
  });
  const result = await f.operation.run(f.body(), f.binding);
  assert.deepEqual(result, { ...GENERATED, canGrantPermission: false });
  assert.deepEqual(delegated, {
    tenantId: TENANT,
    actorIdentityId: ACTOR,
    correlationId: CORRELATION,
    gatewaySessionId: f.binding.sessionId,
    connectionId: f.binding.connectionId,
    gatewayGeneration: 1,
    deviceSessionId: 'device:core:1',
    deviceId: DEVICE,
    registrationVersion: 2,
    requestId: 'request:core:1',
    deadlineMs: NOW + 2_000,
  });
  assert.deepEqual(f.counts, { begin: 1, cancel: 0, complete: 1, attestation: 3, invoke: 1 });
  assert.equal(f.outstanding(), 0);
});

test('regression: unchanged admission accepts cached ACTIVE trust after registry revoke; operation rejects it', async () => {
  const f = fixture();
  f.transition('REVOKE');
  const old = new LocalModelSessionAdmission(f.gateway, f.deviceSessions).admit(
    f.body('request:old:proof'),
    f.binding,
    NOW,
  );
  assert.equal(
    old.ok,
    true,
    'baseline gap is a real cached-trust admission, not a fabricated snapshot',
  );
  assert.equal(denied(await f.operation.run(f.body(), f.binding)), 'DEVICE_TRUST_NOT_CURRENT');
  assert.equal(f.counts.invoke, 0);
  assert.equal(f.counts.complete, 1);
  const cleanup = f.gateway.completeRequest({
    protocolVersion: '1.0',
    ...f.binding,
    requestId: 'request:old:proof',
    nowMs: NOW,
  });
  assert.equal(cleanup.ok, true);
});

test('current registration REVOKE, COMPROMISED and RETIRED each deny core and complete the admitted request', async () => {
  for (const transition of ['REVOKE', 'MARK_COMPROMISED', 'RETIRE'] as const) {
    const f = fixture();
    const record = f.transition(transition);
    assert.equal(record.ref.registrationVersion, 3);
    assert.equal(denied(await f.operation.run(f.body(), f.binding)), 'DEVICE_TRUST_NOT_CURRENT');
    assert.equal(f.counts.invoke, 0);
    assert.equal(f.counts.begin, 1);
    assert.equal(f.counts.complete, 1);
    assert.equal(f.outstanding(), 0);
  }
});

test('registry revocation during delegate or attestation await suppresses late generated text', async () => {
  const output = deferred<unknown>();
  const started = deferred<undefined>();
  const f = fixture({
    invoke: async () => {
      started.resolve(undefined);
      return output.promise;
    },
  });
  const running = f.operation.run(f.body(), f.binding);
  await started.promise;
  f.transition('REVOKE');
  output.resolve(GENERATED);
  assert.equal(denied(await running), 'DEVICE_TRUST_NOT_CURRENT');
  assert.equal(f.counts.complete, 1);
  assert.equal(f.outstanding(), 0);

  const observation = deferred<DeviceAttestationReference | null>();
  const reading = deferred<undefined>();
  const duringRead = fixture({
    readCurrent: async () => {
      reading.resolve(undefined);
      return observation.promise;
    },
  });
  const awaitingRead = duringRead.operation.run(duringRead.body(), duringRead.binding);
  await reading.promise;
  duringRead.transition('MARK_COMPROMISED');
  observation.resolve(duringRead.attestation());
  assert.equal(denied(await awaitingRead), 'DEVICE_TRUST_NOT_CURRENT');
  assert.equal(duringRead.counts.invoke, 0);
});

test('trusted current attestation null, stale, revoked, ambiguous or changed identity never becomes fresh', async () => {
  const absent = fixture({ readCurrent: async () => null });
  assert.equal(
    denied(await absent.operation.run(absent.body(), absent.binding)),
    'DEVICE_TRUST_NOT_CURRENT',
  );
  for (const changed of [
    { state: 'REVOKED' as const },
    { state: 'AMBIGUOUS' as const },
    { observedAtMs: NOW - 50_000 },
    { expiresAtMs: NOW },
    { observedAtMs: NOW + 1 },
    { reference: 'attestation:different' },
  ]) {
    const f = fixture();
    f.setAttestation({ ...f.attestation(), ...changed });
    assert.equal(denied(await f.operation.run(f.body(), f.binding)), 'DEVICE_TRUST_NOT_CURRENT');
    assert.equal(f.counts.invoke, 0);
    assert.equal(f.counts.complete, 1);
  }
});

test('cross-tenant, actor, correlation, connection and device-session metadata cannot invoke core', async () => {
  for (const changed of [
    { tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAY' },
    { actorIdentityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAZ' },
    { correlationId: 'correlation:foreign' },
    { connectionId: 'conn:foreign' },
    { sessionId: 'gateway:foreign' },
  ]) {
    const f = fixture();
    assert.equal(
      denied(await f.operation.run(f.body(), { ...f.binding, ...changed })),
      'SOCKET_NOT_AUTHENTICATED',
    );
    assert.equal(f.counts.begin, 0);
    assert.equal(f.counts.complete, 0);
    assert.equal(f.counts.invoke, 0);
  }
  const f = fixture();
  assert.equal(
    denied(await f.operation.run({ ...f.body(), deviceSessionId: 'device:foreign' }, f.binding)),
    'DEVICE_TRUST_NOT_CURRENT',
  );
  assert.equal(f.counts.begin, 0);
});

test('input snapshot does not execute getters/get traps and rejects symbol/proxy/body injection', async () => {
  const f = fixture();
  let getterCalls = 0;
  const accessorBody = {
    ...f.body(),
    get requestId() {
      getterCalls += 1;
      return 'secret';
    },
  };
  const accessorSocket = {
    ...f.binding,
    get actorIdentityId() {
      getterCalls += 1;
      return ACTOR;
    },
  };
  const proxy = new Proxy(f.binding, {
    get() {
      getterCalls += 1;
      throw new Error('private');
    },
  });
  assert.equal(denied(await f.operation.run(accessorBody, f.binding)), 'BODY_MALFORMED');
  assert.equal(denied(await f.operation.run(f.body(), accessorSocket)), 'SOCKET_NOT_AUTHENTICATED');
  assert.equal(
    (await f.operation.run(f.body(), proxy)).status,
    'GENERATED',
    'own data is copied without get traps',
  );
  assert.equal(getterCalls, 0);
  for (const extra of [
    { prompt: 'secret-prompt' },
    { credential: 'secret-token' },
    { tenantId: TENANT },
    { policy: 'ALLOW' },
    { [Symbol('hidden')]: true },
  ]) {
    assert.equal(
      denied(await f.operation.run({ ...f.body(), ...extra }, f.binding)),
      'BODY_MALFORMED',
    );
  }
  const revoked = Proxy.revocable(f.body(), {});
  revoked.revoke();
  assert.equal(denied(await f.operation.run(revoked.proxy, f.binding)), 'BODY_MALFORMED');
  const hostile = new Proxy(f.body(), {
    ownKeys() {
      throw new Error('private-reflection');
    },
  });
  assert.equal(denied(await f.operation.run(hostile, f.binding)), 'BODY_MALFORMED');
  assert.equal(f.counts.begin, 1);
});

test('attestation accessors are rejected without reading private values or calling core', async () => {
  let calls = 0;
  const f = fixture({
    readCurrent: async () => ({
      ...f.attestation(),
      get state(): DeviceAttestationReference['state'] {
        calls += 1;
        throw new Error('private-attestation');
      },
    }),
  });
  assert.equal(denied(await f.operation.run(f.body(), f.binding)), 'DEVICE_TRUST_NOT_CURRENT');
  assert.equal(calls, 0);
  assert.equal(f.counts.invoke, 0);
});

test('replay uses the canonical gateway request ledger, not a new local replay registry', async () => {
  const f = fixture();
  assert.equal((await f.operation.run(f.body(), f.binding)).status, 'GENERATED');
  assert.equal(denied(await f.operation.run(f.body(), f.binding)), 'REQUEST_NOT_ADMITTED');
  assert.equal(f.counts.invoke, 1);
  assert.equal(f.counts.complete, 1);
  assert.equal(f.outstanding(), 0);
});

test('expired or more than 30s request horizon fails before canonical admission', async () => {
  for (const horizon of [0, -1, 30_001]) {
    const f = fixture();
    assert.equal(
      denied(await f.operation.run(f.body('request:bounds', horizon), f.binding)),
      horizon <= 0 ? 'TIMEOUT' : 'BODY_MALFORMED',
    );
    assert.equal(f.counts.begin, 0);
  }
});

test('cancel is bounded to the same request and retains BUSY until a noncooperative delegate settles', async () => {
  const output = deferred<unknown>();
  const started = deferred<undefined>();
  let signal: AbortSignal | undefined;
  const f = fixture({
    invoke: async (_bound, incoming) => {
      signal = incoming;
      started.resolve(undefined);
      return output.promise;
    },
  });
  const running = f.operation.run(f.body(), f.binding);
  await started.promise;
  for (const changed of [
    { requestId: 'request:other' },
    { deviceSessionId: 'device:other' },
    { deadlineMs: NOW + 1 },
  ])
    assert.equal(f.operation.cancel({ ...f.body(), ...changed }, f.binding).requested, false);
  assert.equal(
    f.operation.cancel(f.body(), { ...f.binding, connectionId: 'conn:other' }).requested,
    false,
  );
  assert.equal(signal?.aborted, false);
  assert.equal(f.operation.cancel(f.body(), f.binding).requested, true);
  assert.equal(denied(await running), 'CANCELLED');
  assert.equal(signal?.aborted, true);
  assert.equal(f.counts.cancel, 1);
  assert.equal(f.counts.complete, 0);
  assert.equal(denied(await f.operation.run(f.body('request:other'), f.binding)), 'BUSY');
  output.resolve(GENERATED);
  await tick();
  assert.equal(f.counts.complete, 1);
  assert.equal(f.outstanding(), 0);
  assert.equal((await f.operation.run(f.body('request:next'), f.binding)).status, 'GENERATED');
});

test('deadline bounds noncooperative delegate, drops late output and completes only after settlement', async () => {
  const output = deferred<unknown>();
  const started = deferred<undefined>();
  const f = fixture({
    invoke: async () => {
      started.resolve(undefined);
      return output.promise;
    },
  });
  const running = f.operation.run(f.body('request:timeout', 25), f.binding);
  await started.promise;
  assert.equal(denied(await running), 'TIMEOUT');
  assert.equal(f.counts.cancel, 1);
  assert.equal(f.counts.complete, 0);
  assert.equal(denied(await f.operation.run(f.body('request:busy'), f.binding)), 'BUSY');
  output.resolve(GENERATED);
  await tick();
  assert.equal(f.counts.complete, 1);
  assert.equal(f.outstanding(), 0);
});

test('a never-settling attestation read is also bounded and keeps the sole operation slot occupied', async () => {
  const observation = deferred<DeviceAttestationReference | null>();
  const f = fixture({ readCurrent: () => observation.promise });
  const running = f.operation.run(f.body('request:observation-timeout', 20), f.binding);
  assert.equal(denied(await running), 'TIMEOUT');
  assert.equal(f.counts.invoke, 0);
  assert.equal(denied(await f.operation.run(f.body('request:busy'), f.binding)), 'BUSY');
  observation.resolve(null);
  await tick();
  assert.equal(f.counts.complete, 1);
});

test('closing, expiring or reconnecting gateway during inference yields reconciliation, never old-session text', async () => {
  for (const mode of ['close', 'expire', 'reconnect'] as const) {
    const output = deferred<unknown>();
    const started = deferred<undefined>();
    const f = fixture({
      authLifetimeMs: 1_000,
      invoke: async () => {
        started.resolve(undefined);
        return output.promise;
      },
    });
    const running = f.operation.run(f.body(), f.binding);
    await started.promise;
    if (mode === 'close')
      assert.equal(
        f.gateway.closeSession({ protocolVersion: '1.0', ...f.binding, nowMs: NOW }).ok,
        true,
      );
    if (mode === 'expire') f.setClock(NOW + 1_000);
    if (mode === 'reconnect') {
      assert.equal(
        f.gateway.closeSession({ protocolVersion: '1.0', ...f.binding, nowMs: NOW }).ok,
        true,
      );
      const reconnected = f.gateway.reconnectSession({
        protocolVersion: '1.0',
        sessionId: f.binding.sessionId,
        previousConnectionId: f.binding.connectionId,
        credential: 'fixture-only-not-live',
        tenantId: TENANT,
        actor: { kind: 'HUMAN', identityId: ACTOR },
        correlation: { correlationId: CORRELATION },
        nowMs: NOW,
      });
      assert.equal(reconnected.ok, true);
    }
    output.resolve(GENERATED);
    assert.equal(denied(await running), 'RECONCILIATION_REQUIRED');
    assert.equal(f.counts.complete, 1);
    assert.equal(
      denied(await f.operation.run(f.body('request:no-retry'), f.binding)),
      'RECONCILIATION_REQUIRED',
    );
    assert.equal(f.counts.complete, 1);
  }
});

test('device-session revoke after inference begins suppresses content while gateway cleanup still succeeds', async () => {
  const output = deferred<unknown>();
  const started = deferred<undefined>();
  const f = fixture({
    invoke: async () => {
      started.resolve(undefined);
      return output.promise;
    },
  });
  const running = f.operation.run(f.body(), f.binding);
  await started.promise;
  assert.equal(
    f.deviceSessions.revokeSession({
      deviceSessionId: 'device:core:1',
      connectionId: f.binding.connectionId,
      revokedAtMs: NOW,
      reasonReference: 'revoke:fixture',
    }).ok,
    true,
  );
  output.resolve(GENERATED);
  assert.equal(denied(await running), 'DEVICE_TRUST_NOT_CURRENT');
  assert.equal(f.counts.complete, 1);
  assert.equal(f.outstanding(), 0);
});

test('complete denial or throw quarantines instead of retrying, falsely completing or returning text', async () => {
  for (const mode of ['deny', 'throw'] as const) {
    const f = fixture();
    let calls = 0;
    f.gatewayPort.completeRequest = () => {
      calls += 1;
      if (mode === 'throw') throw new Error('private-cleanup-secret');
      return {
        ok: false,
        error: { code: 'SESSION_CLOSED', message: 'private-cleanup-secret', retryable: false },
      };
    };
    const result = await f.operation.run(f.body(), f.binding);
    assert.equal(denied(result), 'RECONCILIATION_REQUIRED');
    assert.equal(JSON.stringify(result).includes('private-cleanup'), false);
    assert.equal(f.outstanding(), 1);
    assert.equal(
      denied(await f.operation.run(f.body('request:next'), f.binding)),
      'RECONCILIATION_REQUIRED',
    );
    assert.equal(calls, 1);
  }
});

test('cancel failure quarantines even if later delegate settlement can complete the canonical request', async () => {
  const output = deferred<unknown>();
  const started = deferred<undefined>();
  const f = fixture({
    invoke: async () => {
      started.resolve(undefined);
      return output.promise;
    },
  });
  f.gatewayPort.cancelRequest = () => {
    throw new Error('private-cancel-error');
  };
  const running = f.operation.run(f.body(), f.binding);
  await started.promise;
  assert.equal(f.operation.cancel(f.body(), f.binding).code, 'RECONCILIATION_REQUIRED');
  assert.equal(denied(await running), 'RECONCILIATION_REQUIRED');
  output.resolve(GENERATED);
  await tick();
  assert.equal(f.counts.complete, 1);
  assert.equal(
    denied(await f.operation.run(f.body('request:next'), f.binding)),
    'RECONCILIATION_REQUIRED',
  );
});

test('unknown begin outcome is quarantined without completing a possibly unowned request', async () => {
  const f = fixture();
  f.gatewayPort.beginRequest = (input) => {
    f.gateway.beginRequest(input);
    throw new Error('private-begin-outcome');
  };
  assert.equal(denied(await f.operation.run(f.body(), f.binding)), 'RECONCILIATION_REQUIRED');
  assert.equal(f.counts.invoke, 0);
  assert.equal(f.counts.complete, 0);
  assert.equal(f.outstanding(), 1);
});

test('delegate abstention or exception completes exactly once without exposing upstream error content', async () => {
  const noModel = fixture({
    invoke: async () => ({
      status: 'ABSTAINED',
      code: 'UNAVAILABLE',
      authoritySemantics: 'INTELLIGENCE_ONLY_NO_AUTHORITY',
      authorizesExecution: false,
      canInvokeTools: false,
    }),
  });
  assert.equal(denied(await noModel.operation.run(noModel.body(), noModel.binding)), 'UNAVAILABLE');
  assert.equal(noModel.counts.complete, 1);
  const failure = fixture({
    invoke: async () => {
      throw new Error('secret-prompt-token');
    },
  });
  const result = await failure.operation.run(failure.body(), failure.binding);
  assert.equal(denied(result), 'W14_UPSTREAM_UNAVAILABLE');
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal(failure.counts.complete, 1);
});

test('tool/action claims, malformed results, excessive output and accessors are never released', async () => {
  let getters = 0;
  for (const result of [
    null,
    { ...GENERATED, authorizesExecution: true },
    { ...GENERATED, canInvokeTools: true },
    { ...GENERATED, canGrantPermission: true },
    { ...GENERATED, tool_calls: [] },
    { ...GENERATED, content: 'x'.repeat(32_769) },
    { ...GENERATED, content: '   ' },
    { ...GENERATED, modelSha256: 'unverified' },
    { ...GENERATED, code: 'UNAVAILABLE' },
    {
      ...GENERATED,
      get content() {
        getters += 1;
        throw new Error('secret-output');
      },
    },
  ]) {
    const f = fixture({ invoke: async () => result });
    assert.equal(denied(await f.operation.run(f.body(), f.binding)), 'INVALID_RESULT');
    assert.equal(f.counts.complete, 1);
  }
  assert.equal(getters, 0);
});

test('clock regression, exception and invalid current time fail closed without forging time for cleanup', async () => {
  for (const mode of ['backwards', 'throws', 'nan'] as const) {
    const output = deferred<unknown>();
    const started = deferred<undefined>();
    const f = fixture({
      invoke: async () => {
        started.resolve(undefined);
        return output.promise;
      },
    });
    const running = f.operation.run(f.body(), f.binding);
    await started.promise;
    if (mode === 'backwards') f.setClock(NOW - 1);
    if (mode === 'throws') f.failClock();
    if (mode === 'nan') f.setClock(Number.NaN);
    output.resolve(GENERATED);
    assert.equal(denied(await running), 'RECONCILIATION_REQUIRED');
    assert.equal(f.counts.complete, 0);
    assert.equal(
      denied(await f.operation.run(f.body('request:no-retry'), f.binding)),
      'RECONCILIATION_REQUIRED',
    );
  }
});

test('cancel immediately after run never begins or completes a foreign canonical request', async () => {
  const f = fixture();
  const running = f.operation.run(f.body(), f.binding);
  assert.equal(f.operation.cancel(f.body(), f.binding).requested, true);
  assert.equal(denied(await running), 'CANCELLED');
  await tick();
  assert.equal(f.counts.begin, 0);
  assert.equal(f.counts.complete, 0);
  assert.equal(f.counts.invoke, 0);
});

test('revocation in the microtask after async validation is rechecked before invoking core', async () => {
  const f = fixture();
  const evaluate = f.deviceSessions.evaluateSession.bind(f.deviceSessions);
  let scheduled = false;
  f.deviceSessions.evaluateSession = (input) => {
    const result = evaluate(input);
    if (!scheduled) {
      scheduled = true;
      queueMicrotask(() => f.transition('REVOKE'));
    }
    return result;
  };
  assert.equal(denied(await f.operation.run(f.body(), f.binding)), 'DEVICE_TRUST_NOT_CURRENT');
  assert.equal(
    f.counts.invoke,
    0,
    'an earlier resolved validation must not admit core after revocation',
  );
  assert.equal(f.counts.complete, 1);
});

test('current source release guard is mandatory, synchronous, boolean true and registered exactly once', async () => {
  for (const mode of [
    'missing',
    'false',
    'truthy',
    'promise',
    'throw',
    'duplicate',
    'not-function',
  ] as const) {
    const f = fixture({
      registerSyntheticReleaseGuard: false,
      invoke: async (_bound, _signal, guards) => {
        if (mode === 'false') guards.registerReleaseGuard(() => false);
        if (mode === 'truthy')
          guards.registerReleaseGuard((() => 'true') as unknown as (now: number) => boolean);
        if (mode === 'promise')
          guards.registerReleaseGuard((async () => true) as unknown as (now: number) => boolean);
        if (mode === 'throw')
          guards.registerReleaseGuard(() => {
            throw new Error('private-source-state');
          });
        if (mode === 'duplicate') {
          guards.registerReleaseGuard(() => true);
          guards.registerReleaseGuard(() => true);
        }
        if (mode === 'not-function')
          guards.registerReleaseGuard(null as unknown as (now: number) => boolean);
        return GENERATED;
      },
    });
    const result = await f.operation.run(f.body(), f.binding);
    assert.equal(denied(result), 'REJECTED', mode);
    assert.equal(JSON.stringify(result).includes('private-source-state'), false);
    assert.equal(f.counts.complete, 1);
  }
});

test('source revocation during the last W14 attestation await cannot release already-generated text', async () => {
  let sourceCurrent = true;
  let reads = 0;
  let releaseChecks = 0;
  const f = fixture({
    registerSyntheticReleaseGuard: false,
    readCurrent: async () => {
      reads += 1;
      if (reads === 2) sourceCurrent = false;
      return f.attestation();
    },
    invoke: async (_bound, _signal, guards) => {
      assert.equal(sourceCurrent, true);
      guards.registerReleaseGuard((nowMs) => {
        releaseChecks += 1;
        assert.equal(nowMs, NOW);
        return sourceCurrent;
      });
      return GENERATED;
    },
  });
  assert.equal(denied(await f.operation.run(f.body(), f.binding)), 'REJECTED');
  assert.equal(releaseChecks, 1);
  assert.equal(f.counts.complete, 1);
});

test('guard registration after the delegate settles is too late even while W14 awaits attestation', async () => {
  const observation = deferred<DeviceAttestationReference | null>();
  const finalRead = deferred<undefined>();
  let reads = 0;
  let captured: LocalModelSessionGuards | undefined;
  const f = fixture({
    registerSyntheticReleaseGuard: false,
    readCurrent: async () => {
      reads += 1;
      if (reads === 2) {
        finalRead.resolve(undefined);
        return observation.promise;
      }
      return f.attestation();
    },
    invoke: async (_bound, _signal, guards) => {
      captured = guards;
      return GENERATED;
    },
  });
  const running = f.operation.run(f.body(), f.binding);
  await finalRead.promise;
  if (!captured) throw new Error('fixture must capture private guards');
  assert.equal(captured.isCurrent(), false, 'delegate has settled');
  captured.registerReleaseGuard(() => true);
  observation.resolve(f.attestation());
  assert.equal(denied(await running), 'REJECTED');
});

test('deadline and cancellation are rechecked after synchronous release guard returns', async () => {
  for (const mode of ['deadline', 'cancel'] as const) {
    const f = fixture({
      registerSyntheticReleaseGuard: false,
      invoke: async (_bound, _signal, guards) => {
        guards.registerReleaseGuard(() => {
          if (mode === 'deadline') f.setClock(NOW + 2_000);
          else f.operation.cancel(f.body(), f.binding);
          return true;
        });
        return GENERATED;
      },
    });
    assert.equal(
      denied(await f.operation.run(f.body(), f.binding)),
      mode === 'deadline' ? 'TIMEOUT' : 'CANCELLED',
    );
    assert.equal(f.counts.complete, 1);
  }
});

test('core synchronous isCurrent guard observes registry revocation without awaiting a new attestation', async () => {
  const f = fixture({
    invoke: async (_bound, _signal, guards) => {
      assert.equal(guards.isCurrent(), true);
      f.transition('REVOKE');
      assert.equal(guards.isCurrent(), false);
      return GENERATED;
    },
  });
  assert.equal(denied(await f.operation.run(f.body(), f.binding)), 'DEVICE_TRUST_NOT_CURRENT');
  assert.equal(f.counts.complete, 1);
});

test('a mistaken rejected Promise from the synchronous release port is rejected without unhandled leakage', async () => {
  const f = fixture({
    registerSyntheticReleaseGuard: false,
    invoke: async (_bound, _signal, guards) => {
      guards.registerReleaseGuard((() =>
        Promise.reject(new Error('private-source-rejection'))) as unknown as (
        now: number,
      ) => boolean);
      return GENERATED;
    },
  });
  assert.equal(denied(await f.operation.run(f.body(), f.binding)), 'REJECTED');
  await tick();
});

test('invalid synchronous guard thenables are not assimilated or read through accessors', async () => {
  let thenReads = 0;
  const thenable = {
    get then() {
      thenReads += 1;
      throw new Error('private-thenable');
    },
  };
  const f = fixture({
    registerSyntheticReleaseGuard: false,
    invoke: async (_bound, _signal, guards) => {
      guards.registerReleaseGuard((() => thenable) as unknown as (now: number) => boolean);
      return GENERATED;
    },
  });
  assert.equal(denied(await f.operation.run(f.body(), f.binding)), 'REJECTED');
  assert.equal(thenReads, 0);
});

test('a fulfilled Promise payload is discarded without later thenable assimilation', async () => {
  let thenReads = 0;
  const payload = {};
  const promise = Promise.resolve(payload);
  Object.defineProperty(payload, 'then', {
    get() {
      thenReads += 1;
      throw new Error('private-late-thenable');
    },
  });
  const f = fixture({
    registerSyntheticReleaseGuard: false,
    invoke: async (_bound, _signal, guards) => {
      guards.registerReleaseGuard((() => promise) as unknown as (now: number) => boolean);
      return GENERATED;
    },
  });
  assert.equal(denied(await f.operation.run(f.body(), f.binding)), 'REJECTED');
  await tick();
  assert.equal(thenReads, 0);
});

test('W14 drains real descendant work after logical cancellation and completes only the original request', async () => {
  const actual = deferred<undefined>();
  const started = deferred<undefined>();
  const completed: string[] = [];
  const f = fixture({
    invoke: async (_bound, _signal, guards) => {
      guards.registerWork(actual.promise);
      started.resolve(undefined);
      return GENERATED;
    },
  });
  const originalComplete = f.gatewayPort.completeRequest;
  f.gatewayPort.completeRequest = (input) => {
    completed.push((input as { requestId: string }).requestId);
    return originalComplete(input);
  };
  const running = f.operation.run(f.body(), f.binding);
  await started.promise;
  await tick();
  assert.equal(f.counts.complete, 0);
  assert.equal(f.outstanding(), 1);
  assert.equal(f.operation.cancel(f.body(), f.binding).requested, true);
  assert.equal(denied(await running), 'CANCELLED');
  assert.equal(denied(await f.operation.run(f.body('request:other'), f.binding)), 'BUSY');
  assert.equal(f.counts.begin, 1);
  assert.equal(f.counts.complete, 0);
  actual.resolve(undefined);
  await tick();
  assert.equal(f.counts.complete, 1);
  assert.equal(f.outstanding(), 0);
  assert.deepEqual(completed, ['request:core:1']);
});

test('missing synchronous root evidence quarantines rather than treating logical fulfillment as quiescence', async () => {
  const f = fixture({ registerSyntheticWork: false });
  assert.equal(denied(await f.operation.run(f.body(), f.binding)), 'RECONCILIATION_REQUIRED');
  await tick();
  assert.equal(f.counts.complete, 0);
  assert.equal(f.outstanding(), 1);
  assert.equal(
    denied(await f.operation.run(f.body('request:new'), f.binding)),
    'RECONCILIATION_REQUIRED',
  );
});

test('malformed work never evaluates then accessors and never releases canonical ownership', async () => {
  let accessorReads = 0;
  const malformed = {
    get then() {
      accessorReads += 1;
      throw new Error('private accessor');
    },
  };
  const f = fixture({
    invoke: async (_binding, _signal, guards) => {
      guards.registerWork(malformed as unknown as Promise<unknown>);
      return GENERATED;
    },
  });
  assert.equal(denied(await f.operation.run(f.body(), f.binding)), 'RECONCILIATION_REQUIRED');
  await tick();
  assert.equal(accessorReads, 0);
  assert.equal(f.counts.complete, 0);
  assert.equal(f.outstanding(), 1);
});

test('late work registration during final attestation quarantines without dropping already pending work', async () => {
  const observation = deferred<DeviceAttestationReference | null>();
  const finalRead = deferred<undefined>();
  const actual = deferred<undefined>();
  let captured: LocalModelSessionGuards | undefined;
  let reads = 0;
  const f = fixture({
    readCurrent: async () => {
      reads += 1;
      if (reads === 2) {
        finalRead.resolve(undefined);
        return observation.promise;
      }
      return f.attestation();
    },
    invoke: async (_binding, _signal, guards) => {
      captured = guards;
      guards.registerWork(actual.promise);
      return GENERATED;
    },
  });
  const running = f.operation.run(f.body(), f.binding);
  await finalRead.promise;
  if (!captured) throw new Error('fixture guards missing');
  assert.throws(() => captured?.registerWork(Promise.resolve()), /NOT_ADMITTED/);
  assert.equal(denied(await running), 'RECONCILIATION_REQUIRED');
  assert.equal(f.counts.complete, 0);
  observation.resolve(f.attestation());
  await tick();
  assert.equal(f.counts.complete, 0);
  actual.resolve(undefined);
  await tick();
  assert.equal(f.counts.complete, 0);
  assert.equal(f.outstanding(), 1);
});

test('finite work admission rejects duplicate and overflow without replacing pending work by a resolved fallback', async () => {
  for (const mode of ['duplicate', 'overflow'] as const) {
    const actual = deferred<undefined>();
    const f = fixture({
      invoke: async (_binding, _signal, guards) => {
        if (mode === 'duplicate') {
          guards.registerWork(actual.promise);
          guards.registerWork(actual.promise);
        } else {
          for (let index = 0; index < 64; index += 1)
            guards.registerWork(actual.promise.then(() => undefined));
        }
        return GENERATED;
      },
    });
    assert.equal(denied(await f.operation.run(f.body(), f.binding)), 'RECONCILIATION_REQUIRED');
    assert.equal(f.counts.complete, 0);
    actual.resolve(undefined);
    await tick();
    assert.equal(f.counts.complete, 0);
    assert.equal(f.outstanding(), 1);
  }
});

test('rejected actual work is terminal evidence, not approval and not permanent protocol quarantine', async () => {
  let fail = true;
  const f = fixture({
    invoke: async (_binding, _signal, guards) => {
      if (fail) {
        let admitted = false;
        const work = Promise.resolve().then(() => {
          if (!admitted) throw new Error('not admitted');
          throw new Error('expected synthetic producer failure');
        });
        guards.registerWork(work);
        admitted = true;
      }
      return GENERATED;
    },
  });
  assert.equal(denied(await f.operation.run(f.body(), f.binding)), 'W14_UPSTREAM_UNAVAILABLE');
  assert.equal(f.counts.complete, 1);
  fail = false;
  assert.equal((await f.operation.run(f.body('request:second'), f.binding)).status, 'GENERATED');
  assert.equal(f.counts.complete, 2);
});

test('late callback from completed A quarantines pending B using B identity and never dispatches either old work or B', async () => {
  const beforeDispatch = deferred<undefined>();
  const release = deferred<undefined>();
  let prior: LocalModelSessionGuards | undefined;
  let current: LocalModelSessionGuards | undefined;
  let dispatches = 0;
  const cancellations: string[] = [];
  const f = fixture({
    invoke: async (binding, signal, guards) => {
      if (binding.requestId === 'request:A') {
        prior = guards;
        return GENERATED;
      }
      current = guards;
      beforeDispatch.resolve(undefined);
      await release.promise;
      if (signal.aborted || !guards.isCurrent())
        return {
          ...GENERATED,
          status: 'ABSTAINED',
          code: 'CANCELLED',
        };
      dispatches += 1;
      return GENERATED;
    },
  });
  const originalCancel = f.gatewayPort.cancelRequest;
  f.gatewayPort.cancelRequest = (input) => {
    cancellations.push((input as { requestId: string }).requestId);
    return originalCancel(input);
  };
  assert.equal((await f.operation.run(f.body('request:A'), f.binding)).status, 'GENERATED');
  assert.equal(f.counts.complete, 1);
  const second = f.operation.run(f.body('request:B'), f.binding);
  await beforeDispatch.promise;
  if (!prior || !current) throw new Error('both fixture guards required');
  const stale = prior;
  assert.throws(
    () => stale.registerWork(Promise.reject(new Error('refused late work'))),
    /NOT_ADMITTED/,
  );
  assert.equal(denied(await second), 'RECONCILIATION_REQUIRED');
  assert.equal(current.isCurrent(), false);
  assert.deepEqual(cancellations, ['request:B']);
  assert.equal(f.counts.begin, 2);
  assert.equal(f.counts.complete, 1);
  assert.equal(f.outstanding(), 1);
  release.resolve(undefined);
  await tick();
  assert.equal(dispatches, 0);
  assert.equal(f.counts.complete, 1);
  assert.equal(f.outstanding(), 1);
  assert.equal(
    denied(await f.operation.run(f.body('request:C'), f.binding)),
    'RECONCILIATION_REQUIRED',
  );
});
