// @ts-expect-error -- mobile-gateway harness intentionally has no @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway harness intentionally has no @types/node.
import test from 'node:test';

import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';
import type { DeviceId, DeviceRegistrationRecord, DeviceRef } from '../src/device/types.js';
import type { GatewaySessionSnapshot } from '../src/gateway-auth/types.js';

import {
  DeviceSessionTrustManager,
  type DeviceAttestationReference,
  type DeviceSessionTrustResult,
} from '../src/device-session/index.js';

const DEVICE_A = 'dvc_01JW14DABCDA00000000000000' as DeviceId;
const DEVICE_B = 'dvc_01JW14DABCDF00000000000000' as DeviceId;
const TENANT_A = 'ten_01JW14DABCDB00000000000000' as TenantId;
const TENANT_B = 'ten_01JW14DABCDC00000000000000' as TenantId;
const IDENTITY_A = 'idn_01JW14DABCDD00000000000000' as IdentityId;
const IDENTITY_B = 'idn_01JW14DABCDE00000000000000' as IdentityId;
const CORRELATION = 'correlation:w14e' as CorrelationId;
const NOW = 10_000;

function gateway(overrides: Partial<GatewaySessionSnapshot> = {}): GatewaySessionSnapshot {
  return {
    protocolVersion: '1.0',
    sessionId: 'gateway:session:1',
    connectionId: 'gateway:connection:1',
    generation: 1,
    state: 'OPEN',
    tenantId: TENANT_A,
    actorKind: 'HUMAN',
    actorIdentityId: IDENTITY_A,
    correlationId: CORRELATION,
    authIssuedAtMs: 8_000,
    authExpiresAtMs: 20_000,
    openedAtMs: 8_000,
    outstandingRequests: 0,
    authorizesExecution: false,
    ...overrides,
  };
}

function deviceRef(overrides: Partial<DeviceRef> = {}): DeviceRef {
  return {
    kind: 'AURORA_DEVICE',
    deviceId: DEVICE_A,
    tenantId: TENANT_A,
    registrationVersion: 1,
    ...overrides,
  };
}

function device(overrides: Partial<DeviceRegistrationRecord> = {}): DeviceRegistrationRecord {
  return {
    kind: 'DeviceRegistrationRecord',
    schemaVersion: '1.0.0',
    ref: deviceRef(),
    boundIdentityId: IDENTITY_A,
    state: 'ACTIVE',
    registeredAt: '2026-09-03T08:00:00Z',
    updatedAt: '2026-09-03T08:01:00Z',
    provenance: {
      source: 'W14_DEVICE_REGISTRATION',
      reference: 'registration:w14e:fixture',
      observedAt: '2026-09-03T08:01:00Z',
    },
    authoritySemantics: 'DEVICE_REGISTRATION_ONLY_NO_ACTION_AUTHORITY',
    authorizesExecution: false,
    canGrantPermission: false,
    ...overrides,
  };
}

function attestation(
  overrides: Partial<DeviceAttestationReference> = {},
): DeviceAttestationReference {
  return {
    kind: 'DEVICE_ATTESTATION_REFERENCE',
    reference: 'attestation:w14e:1',
    provider: 'attestation:provider:fixture',
    version: '1',
    state: 'VERIFIED',
    observedAtMs: 9_500,
    expiresAtMs: 20_000,
    ...overrides,
  };
}

function manager(
  overrides: ConstructorParameters<typeof DeviceSessionTrustManager>[0] = {},
): DeviceSessionTrustManager {
  return new DeviceSessionTrustManager({
    maxActiveSessions: 8,
    maxRememberedSessions: 16,
    maxAttestationAgeMs: 2_000,
    maxSessionAgeMs: 20_000,
    ...overrides,
  });
}

function open(
  target: DeviceSessionTrustManager,
  overrides: Record<string, unknown> = {},
): DeviceSessionTrustResult {
  return target.openSession({
    deviceSessionId: 'device-session:1',
    gatewaySession: gateway(),
    deviceRecord: device(),
    attestation: attestation(),
    nowMs: NOW,
    ...overrides,
  });
}

function errorCode(result: DeviceSessionTrustResult): string {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error('Expected a failed trust result.');
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.canGrantPermission, false);
  return result.error.code;
}

test('opens tenant/device-bound current trust as precondition metadata without authority', () => {
  const result = open(manager());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.snapshot.state, 'ACTIVE');
  assert.equal(result.snapshot.tenantId, TENANT_A);
  assert.equal(result.snapshot.actorIdentityId, IDENTITY_A);
  assert.equal(result.snapshot.deviceRef.deviceId, DEVICE_A);
  assert.equal(result.snapshot.executionPreconditionSatisfied, true);
  assert.equal(result.snapshot.requiresCurrentAuthorityValidation, true);
  assert.equal(result.snapshot.authorizesExecution, false);
  assert.equal(result.snapshot.canGrantPermission, false);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.canGrantPermission, false);
});

test('fails closed for stale, expired, revoked and ambiguous attestation references', () => {
  assert.equal(
    errorCode(open(manager(), { attestation: attestation({ observedAtMs: 7_000 }) })),
    'ATTESTATION_STALE',
  );
  assert.equal(
    errorCode(open(manager(), { attestation: attestation({ expiresAtMs: 9_999 }) })),
    'ATTESTATION_EXPIRED',
  );
  assert.equal(
    errorCode(open(manager(), { attestation: attestation({ state: 'REVOKED' }) })),
    'ATTESTATION_REVOKED',
  );
  assert.equal(
    errorCode(open(manager(), { attestation: attestation({ state: 'AMBIGUOUS' }) })),
    'ATTESTATION_AMBIGUOUS',
  );
});

test('rejects wrong-tenant, wrong-identity and non-active device bindings', () => {
  assert.equal(
    errorCode(open(manager(), { gatewaySession: gateway({ tenantId: TENANT_B }) })),
    'TENANT_MISMATCH',
  );
  assert.equal(
    errorCode(open(manager(), { gatewaySession: gateway({ actorIdentityId: IDENTITY_B }) })),
    'DEVICE_IDENTITY_MISMATCH',
  );
  assert.equal(
    errorCode(open(manager(), { deviceRecord: device({ state: 'REGISTERED' }) })),
    'DEVICE_NOT_ACTIVE',
  );
});

test('re-evaluates current device lifecycle/version and observes revocation without creating authority', () => {
  const target = manager();
  assert.equal(open(target).ok, true);

  const current = target.evaluateSession({
    deviceSessionId: 'device-session:1',
    connectionId: 'gateway:connection:1',
    currentDeviceRecord: device(),
    currentAttestation: attestation({ observedAtMs: 10_100, expiresAtMs: 21_000 }),
    nowMs: 10_200,
  });
  assert.equal(current.ok, true);
  if (current.ok) {
    assert.equal(current.snapshot.executionPreconditionSatisfied, true);
    assert.equal(current.snapshot.authorizesExecution, false);
  }

  assert.equal(
    errorCode(
      target.evaluateSession({
        deviceSessionId: 'device-session:1',
        connectionId: 'gateway:connection:1',
        currentDeviceRecord: device({ state: 'REVOKED' }),
        currentAttestation: attestation({ observedAtMs: 10_100, expiresAtMs: 21_000 }),
        nowMs: 10_300,
      }),
    ),
    'DEVICE_NOT_ACTIVE',
  );

  assert.equal(
    errorCode(
      target.evaluateSession({
        deviceSessionId: 'device-session:1',
        connectionId: 'gateway:connection:1',
        currentDeviceRecord: device({ ref: deviceRef({ registrationVersion: 2 }) }),
        currentAttestation: attestation({ observedAtMs: 10_100, expiresAtMs: 21_000 }),
        nowMs: 10_300,
      }),
    ),
    'DEVICE_VERSION_MISMATCH',
  );
});

test('local session revocation is idempotent and blocks subsequent trust evaluation', () => {
  const target = manager();
  assert.equal(open(target).ok, true);

  const first = target.revokeSession({
    deviceSessionId: 'device-session:1',
    connectionId: 'gateway:connection:1',
    revokedAtMs: 10_500,
    reasonReference: 'revocation:operator-request',
  });
  assert.equal(first.ok, true);
  if (first.ok) {
    assert.equal(first.snapshot.state, 'REVOKED');
    assert.equal(first.snapshot.executionPreconditionSatisfied, false);
    assert.equal(first.snapshot.revokedAtMs, 10_500);
  }

  const replay = target.revokeSession({
    deviceSessionId: 'device-session:1',
    connectionId: 'gateway:connection:1',
    revokedAtMs: 10_600,
    reasonReference: 'revocation:operator-request',
  });
  assert.equal(replay.ok, true);
  if (replay.ok) assert.equal(replay.snapshot.revokedAtMs, 10_500);

  assert.equal(
    errorCode(
      target.evaluateSession({
        deviceSessionId: 'device-session:1',
        connectionId: 'gateway:connection:1',
        currentDeviceRecord: device(),
        currentAttestation: attestation(),
        nowMs: 10_700,
      }),
    ),
    'SESSION_REVOKED',
  );
});

test('resume rejects stale ownership and accepts only a newer bound gateway generation', () => {
  const target = manager();
  assert.equal(open(target).ok, true);

  assert.equal(
    errorCode(
      target.resumeSession({
        deviceSessionId: 'device-session:1',
        previousConnectionId: 'gateway:connection:other',
        gatewaySession: gateway({ connectionId: 'gateway:connection:2', generation: 2 }),
        deviceRecord: device(),
        attestation: attestation({ reference: 'attestation:w14e:2', observedAtMs: 10_300 }),
        nowMs: 10_400,
      }),
    ),
    'RESUME_HIJACK_DETECTED',
  );

  const resumed = target.resumeSession({
    deviceSessionId: 'device-session:1',
    previousConnectionId: 'gateway:connection:1',
    gatewaySession: gateway({ connectionId: 'gateway:connection:2', generation: 2 }),
    deviceRecord: device(),
    attestation: attestation({ reference: 'attestation:w14e:2', observedAtMs: 10_300 }),
    nowMs: 10_400,
  });
  assert.equal(resumed.ok, true);
  if (!resumed.ok) return;
  assert.equal(resumed.snapshot.connectionId, 'gateway:connection:2');
  assert.equal(resumed.snapshot.gatewayGeneration, 2);
  assert.equal(resumed.snapshot.attestation.reference, 'attestation:w14e:2');
  assert.equal(resumed.snapshot.authorizesExecution, false);
});

test('resume detects actor, correlation, device and attestation-provider hijack attempts', () => {
  const cases: Array<
    [string, GatewaySessionSnapshot, DeviceRegistrationRecord, DeviceAttestationReference]
  > = [
    [
      'RESUME_HIJACK_DETECTED',
      gateway({ connectionId: 'gateway:connection:2', generation: 2, actorIdentityId: IDENTITY_B }),
      device({ boundIdentityId: IDENTITY_B }),
      attestation({ observedAtMs: 10_200 }),
    ],
    [
      'CORRELATION_MISMATCH',
      gateway({
        connectionId: 'gateway:connection:2',
        generation: 2,
        correlationId: 'correlation:other' as CorrelationId,
      }),
      device(),
      attestation({ observedAtMs: 10_200 }),
    ],
    [
      'DEVICE_BINDING_MISMATCH',
      gateway({ connectionId: 'gateway:connection:2', generation: 2 }),
      device({ ref: deviceRef({ deviceId: DEVICE_B }) }),
      attestation({ observedAtMs: 10_200 }),
    ],
    [
      'ATTESTATION_MISMATCH',
      gateway({ connectionId: 'gateway:connection:2', generation: 2 }),
      device(),
      attestation({ provider: 'attestation:provider:other', observedAtMs: 10_200 }),
    ],
  ];

  for (const [expected, resumedGateway, currentDevice, currentAttestation] of cases) {
    const target = manager();
    assert.equal(open(target).ok, true);
    assert.equal(
      errorCode(
        target.resumeSession({
          deviceSessionId: 'device-session:1',
          previousConnectionId: 'gateway:connection:1',
          gatewaySession: resumedGateway,
          deviceRecord: currentDevice,
          attestation: currentAttestation,
          nowMs: 10_400,
        }),
      ),
      expected,
    );
  }
});

test('evaluation rejects changed or retrograde attestation identity/state', () => {
  const target = manager();
  assert.equal(open(target).ok, true);

  assert.equal(
    errorCode(
      target.evaluateSession({
        deviceSessionId: 'device-session:1',
        connectionId: 'gateway:connection:1',
        currentDeviceRecord: device(),
        currentAttestation: attestation({ reference: 'attestation:w14e:changed' }),
        nowMs: 10_100,
      }),
    ),
    'ATTESTATION_MISMATCH',
  );

  assert.equal(
    errorCode(
      target.evaluateSession({
        deviceSessionId: 'device-session:1',
        connectionId: 'gateway:connection:1',
        currentDeviceRecord: device(),
        currentAttestation: attestation({ observedAtMs: 9_400 }),
        nowMs: 10_100,
      }),
    ),
    'ATTESTATION_STALE',
  );
});

test('rejects malformed, accessor and secret-bearing trust input without invoking getters', () => {
  assert.equal(
    errorCode(
      open(manager(), {
        attestation: { ...attestation(), token: 'raw-local-device-secret' },
      }),
    ),
    'MALFORMED_REQUEST',
  );

  let getterInvoked = false;
  const accessorInput = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(accessorInput, 'deviceSessionId', {
    enumerable: true,
    get() {
      getterInvoked = true;
      return 'device-session:1';
    },
  });
  accessorInput.gatewaySession = gateway();
  accessorInput.deviceRecord = device();
  accessorInput.attestation = attestation();
  accessorInput.nowMs = NOW;

  assert.equal(errorCode(manager().openSession(accessorInput)), 'MALFORMED_REQUEST');
  assert.equal(getterInvoked, false);
});

test('bounds active/remembered sessions and evicts only revoked trust records', () => {
  const target = manager({ maxActiveSessions: 1, maxRememberedSessions: 1 });
  assert.equal(open(target).ok, true);

  assert.equal(
    errorCode(
      open(target, {
        deviceSessionId: 'device-session:2',
        gatewaySession: gateway({
          sessionId: 'gateway:session:2',
          connectionId: 'gateway:connection:2',
        }),
      }),
    ),
    'BACKPRESSURE',
  );

  assert.equal(
    target.revokeSession({
      deviceSessionId: 'device-session:1',
      connectionId: 'gateway:connection:1',
      revokedAtMs: 10_500,
      reasonReference: 'revocation:capacity-test',
    }).ok,
    true,
  );

  const replacement = open(target, {
    deviceSessionId: 'device-session:2',
    gatewaySession: gateway({
      sessionId: 'gateway:session:2',
      connectionId: 'gateway:connection:2',
    }),
  });
  assert.equal(replacement.ok, true);
});

test('gateway auth expiry and bounded session lifetime fail closed independently of attestation', () => {
  assert.equal(
    errorCode(open(manager(), { gatewaySession: gateway({ authExpiresAtMs: NOW }) })),
    'GATEWAY_AUTH_EXPIRED',
  );

  const target = manager({ maxSessionAgeMs: 500 });
  assert.equal(open(target).ok, true);
  assert.equal(
    errorCode(
      target.evaluateSession({
        deviceSessionId: 'device-session:1',
        connectionId: 'gateway:connection:1',
        currentDeviceRecord: device(),
        currentAttestation: attestation({ observedAtMs: 10_300, expiresAtMs: 20_000 }),
        nowMs: 10_501,
      }),
    ),
    'SESSION_EXPIRED',
  );
});
