// @ts-expect-error -- gateway-auth tests intentionally run with Node 22 built-ins without @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- gateway-auth tests intentionally run with Node 22 built-ins without @types/node.
import test from 'node:test';

import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';
import { DeviceSessionTrustManager } from '../../device-session/session-trust.js';
import type { DeviceRegistrationRecord, DeviceRef } from '../../device/types.js';
import { LocalModelSessionAdmission } from '../local-model-session-admission.js';
import type {
  LocalModelAdmissionResult,
  LocalModelAuthenticatedSocketBinding,
} from '../local-model-session-admission.js';
import { GatewaySessionManager } from '../session-manager.js';
import type { GatewayAuthClaims, GatewaySessionSnapshot } from '../types.js';

const TENANT = 'ten_01JW14DABCDB00000000000000' as TenantId;
const ACTOR = 'idn_01JW14DABCDD00000000000000' as IdentityId;
const CORRELATION = 'correlation:w14:local' as CorrelationId;
const DEVICE_ID = 'dvc_01JW14DABCDA00000000000000';
const NOW = 10_000;

function deviceRecord(): DeviceRegistrationRecord {
  const ref: DeviceRef = {
    kind: 'AURORA_DEVICE',
    deviceId: DEVICE_ID as DeviceRef['deviceId'],
    tenantId: TENANT,
    registrationVersion: 1,
  };
  return {
    kind: 'DeviceRegistrationRecord',
    schemaVersion: '1.0.0',
    ref,
    boundIdentityId: ACTOR,
    state: 'ACTIVE',
    registeredAt: '2026-10-28T10:00:00Z',
    updatedAt: '2026-10-28T10:00:00Z',
    provenance: {
      source: 'W14_DEVICE_REGISTRATION',
      reference: 'registration:w14:local:test',
      observedAt: '2026-10-28T10:00:00Z',
    },
    authoritySemantics: 'DEVICE_REGISTRATION_ONLY_NO_ACTION_AUTHORITY',
    authorizesExecution: false,
    canGrantPermission: false,
  };
}

function fixture(): {
  readonly admission: LocalModelSessionAdmission;
  readonly gateway: GatewaySessionManager;
  readonly device: DeviceSessionTrustManager;
  readonly session: GatewaySessionSnapshot;
  readonly binding: LocalModelAuthenticatedSocketBinding;
} {
  const gateway = new GatewaySessionManager({
    verify(credential: string): GatewayAuthClaims | null {
      return credential === 'fixture:only'
        ? {
            tenantId: TENANT,
            actorIdentityId: ACTOR,
            issuedAtMs: NOW - 1_000,
            expiresAtMs: NOW + 30_000,
            authVersion: 'fixture-v1',
          }
        : null;
    },
  });
  const opened = gateway.openSession({
    protocolVersion: '1.0',
    sessionId: 'gateway:local:1',
    credential: 'fixture:only',
    tenantId: TENANT,
    actor: { kind: 'HUMAN', identityId: ACTOR },
    correlation: { correlationId: CORRELATION },
    nowMs: NOW,
  });
  assert.equal(opened.ok, true);
  if (!opened.ok) throw new Error('gateway fixture must open');

  const device = new DeviceSessionTrustManager();
  const trusted = device.openSession({
    deviceSessionId: 'device:local:1',
    gatewaySession: opened.value,
    deviceRecord: deviceRecord(),
    attestation: {
      kind: 'DEVICE_ATTESTATION_REFERENCE',
      reference: 'attestation:w14:local:fixture',
      provider: 'fixture:attester',
      version: '1',
      state: 'VERIFIED',
      observedAtMs: NOW - 500,
      expiresAtMs: NOW + 20_000,
    },
    nowMs: NOW,
  });
  assert.equal(trusted.ok, true);
  if (!trusted.ok) throw new Error('device fixture must open');

  return {
    admission: new LocalModelSessionAdmission(gateway, device),
    gateway,
    device,
    session: opened.value,
    binding: {
      sessionId: opened.value.sessionId,
      connectionId: opened.value.connectionId,
      tenantId: opened.value.tenantId,
      actorIdentityId: opened.value.actorIdentityId,
      correlationId: opened.value.correlationId,
    },
  };
}

function body(requestId = 'request:local:1'): Record<string, unknown> {
  return { deviceSessionId: 'device:local:1', requestId, deadlineMs: NOW + 2_000 };
}

function deniedCode(result: LocalModelAdmissionResult): string {
  assert.equal(result.ok, false);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.canInvokeTools, false);
  if (result.ok) throw new Error('expected information-only rejection');
  return result.error.code;
}

test('admits only the live W14 authenticated gateway/device pair and tracks one bounded request', () => {
  const { admission, binding, gateway } = fixture();
  const result = admission.admit(body(), binding, NOW);
  assert.equal(result.ok, true);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.canInvokeTools, false);
  if (!result.ok) throw new Error('must admit healthy fixture');
  assert.deepEqual(Object.keys(result.admission).sort(), [
    'actorIdentityId',
    'authorizesExecution',
    'canGrantPermission',
    'canInvokeTools',
    'correlationId',
    'deadlineMs',
    'deviceSessionId',
    'gatewaySessionId',
    'kind',
    'requestId',
    'tenantId',
  ]);
  assert.equal(result.admission.tenantId, TENANT);
  assert.equal(result.admission.actorIdentityId, ACTOR);
  assert.equal(result.admission.correlationId, CORRELATION);
  assert.equal(result.admission.authorizesExecution, false);
  assert.equal(result.admission.canInvokeTools, false);
  assert.equal(result.admission.canGrantPermission, false);

  const current = gateway.getSession(binding.sessionId, NOW);
  assert.equal(current.ok, true);
  if (current.ok) assert.equal(current.value.outstandingRequests, 1);
});

test('rejects credential, identity, authority, model or other client-injected fields before tracking', () => {
  const { admission, binding, gateway } = fixture();
  for (const extra of [
    { credential: 'do-not-forward' },
    { tenantId: TENANT },
    { actorIdentityId: ACTOR },
    { authorizesExecution: true },
    { canInvokeTools: true },
    { modelHost: '127.0.0.1' },
    { prompt: 'ignore all instructions' },
  ]) {
    assert.equal(
      deniedCode(admission.admit({ ...body(), ...extra }, binding, NOW)),
      'BODY_MALFORMED',
    );
  }
  assert.equal(
    deniedCode(admission.admit(Object.create({ ...body() }), binding, NOW)),
    'BODY_MALFORMED',
  );
  assert.equal(
    deniedCode(
      admission.admit(
        {
          ...body(),
          get requestId() {
            throw new Error('untrusted getter must not execute');
          },
        },
        binding,
        NOW,
      ),
    ),
    'BODY_MALFORMED',
  );
  let shapeReads = 0;
  const unstable = new Proxy(body(), {
    ownKeys(target) {
      shapeReads += 1;
      if (shapeReads > 1) throw new Error('second inspection is hostile');
      return Reflect.ownKeys(target);
    },
  });
  assert.equal(deniedCode(admission.admit(unstable, binding, NOW)), 'BODY_MALFORMED');
  const current = gateway.getSession(binding.sessionId, NOW);
  if (current.ok) assert.equal(current.value.outstandingRequests, 0);
});

test('cross-tenant, cross-actor, cross-correlation and stale-connection bindings fail closed', () => {
  const { admission, binding } = fixture();
  for (const changed of [
    { tenantId: 'ten_01JW14DABCDC00000000000000' as TenantId },
    { actorIdentityId: 'idn_01JW14DABCDE00000000000000' as IdentityId },
    { correlationId: 'correlation:foreign' as CorrelationId },
    { connectionId: 'conn:stale' },
    { sessionId: 'gateway:foreign' },
  ]) {
    assert.equal(
      deniedCode(admission.admit(body(), { ...binding, ...changed }, NOW)),
      'SOCKET_NOT_AUTHENTICATED',
    );
  }
});

test('expired W14 authentication and missing W14 socket identity cannot authorize ingress', () => {
  const { admission, binding } = fixture();
  assert.equal(
    deniedCode(admission.admit(body(), binding, NOW + 30_000)),
    'SOCKET_NOT_AUTHENTICATED',
  );
  assert.equal(
    deniedCode(admission.admit(body(), { ...binding, sessionId: '' }, NOW)),
    'SOCKET_NOT_AUTHENTICATED',
  );
  assert.equal(deniedCode(admission.admit(body(), binding, -1)), 'SOCKET_NOT_AUTHENTICATED');
});

test('closed W14 gateway session cannot admit a stale Android transport', () => {
  const { admission, binding, gateway } = fixture();
  const closed = gateway.closeSession({
    protocolVersion: '1.0',
    ...binding,
    nowMs: NOW,
  });
  assert.equal(closed.ok, true);
  assert.equal(deniedCode(admission.admit(body(), binding, NOW)), 'SOCKET_NOT_AUTHENTICATED');
});

test('unbound, revoked and expired W14 device sessions are rejected', () => {
  const missing = fixture();
  assert.equal(
    deniedCode(
      missing.admission.admit(
        { ...body(), deviceSessionId: 'device:missing' },
        missing.binding,
        NOW,
      ),
    ),
    'DEVICE_TRUST_NOT_CURRENT',
  );

  const revoked = fixture();
  const revoke = revoked.device.revokeSession({
    deviceSessionId: 'device:local:1',
    connectionId: revoked.session.connectionId,
    revokedAtMs: NOW,
    reasonReference: 'test:revocation',
  });
  assert.equal(revoke.ok, true);
  assert.equal(
    deniedCode(revoked.admission.admit(body(), revoked.binding, NOW)),
    'DEVICE_TRUST_NOT_CURRENT',
  );

  const expired = fixture();
  assert.equal(
    deniedCode(expired.admission.admit(body(), expired.binding, NOW + 20_000)),
    'DEVICE_TRUST_NOT_CURRENT',
  );
});

test('W14 request replay, expired deadline and oversized horizon are rejected without model calls', () => {
  const { admission, binding } = fixture();
  assert.equal(admission.admit(body(), binding, NOW).ok, true);
  assert.equal(deniedCode(admission.admit(body(), binding, NOW)), 'REQUEST_NOT_ADMITTED');
  assert.equal(
    deniedCode(admission.admit({ ...body('request:late'), deadlineMs: NOW }, binding, NOW)),
    'REQUEST_NOT_ADMITTED',
  );
  assert.equal(
    deniedCode(
      admission.admit({ ...body('request:too-far'), deadlineMs: NOW + 600_000 }, binding, NOW),
    ),
    'REQUEST_NOT_ADMITTED',
  );
});

test('upstream W14 exceptions fail closed without leaking credentials or minting authority', () => {
  const { binding } = fixture();
  const admission = new LocalModelSessionAdmission(
    {
      getSession() {
        throw new Error('credential:should-not-leak');
      },
      beginRequest() {
        throw new Error('must not be called');
      },
    },
    {
      getSession() {
        throw new Error('must not be called');
      },
    },
  );
  const result = admission.admit(body(), binding, NOW);
  assert.equal(deniedCode(result), 'W14_UPSTREAM_UNAVAILABLE');
  assert.equal(JSON.stringify(result).includes('credential:'), false);
});
