// @ts-expect-error -- mobile-gateway harness intentionally has no @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway harness intentionally has no @types/node.
import test from 'node:test';

import type { IdentityId, TenantId } from '@aurora/contracts/ids';

import {
  InMemoryDeviceRegistry,
  parseDeviceId,
  type DeviceId,
  type DeviceRef,
  type DeviceRegistrationProvenance,
} from '../src/device/index.js';

const DEVICE = 'dvc_01JW14DABCDA00000000000000' as DeviceId;
const TENANT_A = 'ten_01JW14DABCDB00000000000000' as TenantId;
const TENANT_B = 'ten_01JW14DABCDC00000000000000' as TenantId;
const IDENTITY_A = 'idn_01JW14DABCDD00000000000000' as IdentityId;
const IDENTITY_B = 'idn_01JW14DABCDE00000000000000' as IdentityId;

function provenance(
  reference: string,
  observedAt = '2026-09-03T07:31:00Z',
): DeviceRegistrationProvenance {
  return {
    source: 'W14_DEVICE_REGISTRATION',
    reference,
    observedAt,
  };
}

function registration(overrides: Record<string, unknown> = {}) {
  return {
    deviceId: DEVICE,
    tenantId: TENANT_A,
    boundIdentityId: IDENTITY_A,
    registeredAt: '2026-09-03T07:31:00Z',
    provenance: provenance('registration:fixture'),
    ...overrides,
  };
}

test('W14-D registers one canonical tenant-bound DeviceRef and does not grant authority', () => {
  const registry = new InMemoryDeviceRegistry();
  const result = registry.register(registration());
  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.disposition, 'REGISTERED');
  assert.deepEqual(result.record.ref, {
    kind: 'AURORA_DEVICE',
    deviceId: DEVICE,
    tenantId: TENANT_A,
    registrationVersion: 1,
  });
  assert.equal(result.record.state, 'REGISTERED');
  assert.equal(result.record.boundIdentityId, IDENTITY_A);
  assert.equal(result.record.authoritySemantics, 'DEVICE_REGISTRATION_ONLY_NO_ACTION_AUTHORITY');
  assert.equal(result.record.authorizesExecution, false);
  assert.equal(result.record.canGrantPermission, false);
  assert.equal(Object.isFrozen(result.record), true);
  assert.equal(Object.isFrozen(result.record.ref), true);
});

test('W14-D handles duplicate same-binding registration idempotently without minting another device', () => {
  const registry = new InMemoryDeviceRegistry();
  const first = registry.register(registration());
  const duplicate = registry.register(registration({ registeredAt: '2026-09-03T07:32:00Z' }));
  assert.equal(first.ok, true);
  assert.equal(duplicate.ok, true);
  if (!first.ok || !duplicate.ok) return;
  assert.equal(duplicate.disposition, 'ALREADY_REGISTERED');
  assert.strictEqual(duplicate.record, first.record);
  assert.equal(duplicate.record.ref.registrationVersion, 1);
});

test('W14-D fails closed on cross-tenant and conflicting identity registration', () => {
  const registry = new InMemoryDeviceRegistry();
  assert.equal(registry.register(registration()).ok, true);

  assert.deepEqual(registry.register(registration({ tenantId: TENANT_B })), {
    ok: false,
    error: 'CROSS_TENANT',
    authorizesExecution: false,
  });
  assert.deepEqual(registry.register(registration({ boundIdentityId: IDENTITY_B })), {
    ok: false,
    error: 'IDENTITY_BINDING_MISMATCH',
    authorizesExecution: false,
  });
});

test('W14-D activates then revokes a device and refuses revoked resolution', () => {
  const registry = new InMemoryDeviceRegistry();
  const registered = registry.register(registration());
  assert.equal(registered.ok, true);
  if (!registered.ok) return;

  const activated = registry.transition('ACTIVATE', {
    ref: registered.record.ref,
    expectedVersion: 1,
    transitionedAt: '2026-09-03T07:32:00Z',
    provenance: provenance('activation:fixture', '2026-09-03T07:32:00Z'),
  });
  assert.equal(activated.ok, true);
  if (!activated.ok) return;
  assert.equal(activated.record.state, 'ACTIVE');
  assert.equal(registry.resolve({ ref: activated.record.ref, boundIdentityId: IDENTITY_A }).ok, true);

  const revoked = registry.transition('REVOKE', {
    ref: activated.record.ref,
    expectedVersion: 2,
    transitionedAt: '2026-09-03T07:33:00Z',
    provenance: provenance('revocation:fixture', '2026-09-03T07:33:00Z'),
  });
  assert.equal(revoked.ok, true);
  if (!revoked.ok) return;
  assert.equal(revoked.record.state, 'REVOKED');
  assert.deepEqual(registry.resolve({ ref: revoked.record.ref }), {
    ok: false,
    error: 'DEVICE_REVOKED',
    authorizesExecution: false,
    canGrantPermission: false,
  });
});

test('W14-D denies re-registration after revoke by default', () => {
  const registry = new InMemoryDeviceRegistry();
  const registered = registry.register(registration());
  assert.equal(registered.ok, true);
  if (!registered.ok) return;
  const revoked = registry.transition('REVOKE', {
    ref: registered.record.ref,
    expectedVersion: 1,
    transitionedAt: '2026-09-03T07:32:00Z',
    provenance: provenance('revocation:default', '2026-09-03T07:32:00Z'),
  });
  assert.equal(revoked.ok, true);
  if (!revoked.ok) return;

  assert.deepEqual(
    registry.register(
      registration({
        registeredAt: '2026-09-03T07:33:00Z',
        expectedVersion: revoked.record.ref.registrationVersion,
        provenance: provenance('reregistration:denied', '2026-09-03T07:33:00Z'),
      }),
    ),
    { ok: false, error: 'REREGISTRATION_DENIED', authorizesExecution: false },
  );
});

test('W14-D allows policy-explicit same-binding re-registration with exact version fencing', () => {
  const registry = new InMemoryDeviceRegistry('ALLOW_SAME_BINDING_AFTER_REVOCATION');
  const registered = registry.register(registration());
  assert.equal(registered.ok, true);
  if (!registered.ok) return;
  const revoked = registry.transition('REVOKE', {
    ref: registered.record.ref,
    expectedVersion: 1,
    transitionedAt: '2026-09-03T07:32:00Z',
    provenance: provenance('revocation:reregister', '2026-09-03T07:32:00Z'),
  });
  assert.equal(revoked.ok, true);
  if (!revoked.ok) return;

  const stale = registry.register(
    registration({
      registeredAt: '2026-09-03T07:33:00Z',
      expectedVersion: 1,
      provenance: provenance('reregistration:stale', '2026-09-03T07:33:00Z'),
    }),
  );
  assert.deepEqual(stale, { ok: false, error: 'STALE_VERSION', authorizesExecution: false });

  const accepted = registry.register(
    registration({
      registeredAt: '2026-09-03T07:33:00Z',
      expectedVersion: revoked.record.ref.registrationVersion,
      provenance: provenance('reregistration:accepted', '2026-09-03T07:33:00Z'),
    }),
  );
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  assert.equal(accepted.disposition, 'REREGISTERED');
  assert.equal(accepted.record.state, 'REGISTERED');
  assert.equal(accepted.record.ref.registrationVersion, 3);
});

test('W14-D compromised state is fail-closed and cannot silently reactivate', () => {
  const registry = new InMemoryDeviceRegistry();
  const registered = registry.register(registration());
  assert.equal(registered.ok, true);
  if (!registered.ok) return;
  const compromised = registry.transition('MARK_COMPROMISED', {
    ref: registered.record.ref,
    expectedVersion: 1,
    transitionedAt: '2026-09-03T07:32:00Z',
    provenance: provenance('compromise:fixture', '2026-09-03T07:32:00Z'),
  });
  assert.equal(compromised.ok, true);
  if (!compromised.ok) return;
  assert.equal(compromised.record.state, 'COMPROMISED');
  assert.deepEqual(registry.resolve({ ref: compromised.record.ref }), {
    ok: false,
    error: 'DEVICE_COMPROMISED',
    authorizesExecution: false,
    canGrantPermission: false,
  });
  assert.deepEqual(
    registry.transition('ACTIVATE', {
      ref: compromised.record.ref,
      expectedVersion: 2,
      transitionedAt: '2026-09-03T07:33:00Z',
      provenance: provenance('activation:blocked', '2026-09-03T07:33:00Z'),
    }),
    { ok: false, error: 'TRANSITION_NOT_ALLOWED', authorizesExecution: false },
  );
});

test('W14-D retirement is terminal for normal registration and resolution', () => {
  const registry = new InMemoryDeviceRegistry('ALLOW_SAME_BINDING_AFTER_REVOCATION');
  const registered = registry.register(registration());
  assert.equal(registered.ok, true);
  if (!registered.ok) return;
  const retired = registry.transition('RETIRE', {
    ref: registered.record.ref,
    expectedVersion: 1,
    transitionedAt: '2026-09-03T07:32:00Z',
    provenance: provenance('retirement:fixture', '2026-09-03T07:32:00Z'),
  });
  assert.equal(retired.ok, true);
  if (!retired.ok) return;
  assert.equal(retired.record.state, 'RETIRED');
  assert.deepEqual(
    registry.register(
      registration({
        expectedVersion: 2,
        registeredAt: '2026-09-03T07:33:00Z',
        provenance: provenance('registration:after-retire', '2026-09-03T07:33:00Z'),
      }),
    ),
    { ok: false, error: 'DEVICE_RETIRED', authorizesExecution: false },
  );
  assert.deepEqual(registry.resolve({ ref: retired.record.ref }), {
    ok: false,
    error: 'DEVICE_RETIRED',
    authorizesExecution: false,
    canGrantPermission: false,
  });
});

test('W14-D rejects stale DeviceRef versions and wrong identity at resolution', () => {
  const registry = new InMemoryDeviceRegistry();
  const registered = registry.register(registration());
  assert.equal(registered.ok, true);
  if (!registered.ok) return;
  const activated = registry.transition('ACTIVATE', {
    ref: registered.record.ref,
    expectedVersion: 1,
    transitionedAt: '2026-09-03T07:32:00Z',
    provenance: provenance('activation:version', '2026-09-03T07:32:00Z'),
  });
  assert.equal(activated.ok, true);
  if (!activated.ok) return;

  assert.deepEqual(registry.resolve({ ref: registered.record.ref }), {
    ok: false,
    error: 'STALE_VERSION',
    authorizesExecution: false,
    canGrantPermission: false,
  });
  assert.deepEqual(registry.resolve({ ref: activated.record.ref, boundIdentityId: IDENTITY_B }), {
    ok: false,
    error: 'IDENTITY_BINDING_MISMATCH',
    authorizesExecution: false,
    canGrantPermission: false,
  });
});

test('W14-D enforces canonical DeviceId format and rejects canonical-looking malicious IDs', () => {
  assert.equal(parseDeviceId(DEVICE), DEVICE);
  for (const malicious of [
    'dvc_01JW14DABCDI00000000000000',
    'dvc_01jw14dabcda00000000000000',
    'dvc_01JW14DABCDA00000000000000\n',
    'dev_01JW14DABCDA00000000000000',
    'ten_01JW14DABCDA00000000000000',
  ]) {
    assert.throws(() => parseDeviceId(malicious), TypeError);
    const registry = new InMemoryDeviceRegistry();
    assert.deepEqual(registry.register(registration({ deviceId: malicious })), {
      ok: false,
      error: 'DEVICE_ID_INVALID',
      authorizesExecution: false,
    });
  }
});

test('W14-D rejects malformed, accessor-backed and secret-bearing DeviceRef data without invoking getters', () => {
  const registry = new InMemoryDeviceRegistry();
  const registered = registry.register(registration());
  assert.equal(registered.ok, true);
  if (!registered.ok) return;

  let getterCalls = 0;
  const accessorRef = Object.defineProperty({}, 'deviceId', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return DEVICE;
    },
  });
  assert.deepEqual(registry.resolve({ ref: accessorRef as DeviceRef }), {
    ok: false,
    error: 'DEVICE_REF_INVALID',
    authorizesExecution: false,
    canGrantPermission: false,
  });
  assert.equal(getterCalls, 0);

  const secretBearingRef = {
    ...registered.record.ref,
    token: 'fixture-must-never-be-accepted',
  } as unknown as DeviceRef;
  assert.deepEqual(registry.resolve({ ref: secretBearingRef }), {
    ok: false,
    error: 'DEVICE_REF_INVALID',
    authorizesExecution: false,
    canGrantPermission: false,
  });

  const inherited = Object.create({ ref: registered.record.ref }) as { ref: DeviceRef };
  assert.deepEqual(registry.resolve(inherited), {
    ok: false,
    error: 'REQUEST_MALFORMED',
    authorizesExecution: false,
    canGrantPermission: false,
  });
});

test('W14-D DeviceRef stays minimal, deterministic and contains no secret/authority material', () => {
  const firstRegistry = new InMemoryDeviceRegistry();
  const secondRegistry = new InMemoryDeviceRegistry();
  const first = firstRegistry.register(registration());
  const second = secondRegistry.register(registration());
  assert.deepEqual(first, second);
  assert.equal(first.ok, true);
  if (!first.ok) return;

  assert.deepEqual(Object.keys(first.record.ref).sort(), [
    'deviceId',
    'kind',
    'registrationVersion',
    'tenantId',
  ]);
  const serialized = JSON.stringify(first.record);
  assert.equal(serialized.includes('PolicyToken'), false);
  assert.equal(serialized.includes('OwnerDecision'), false);
  assert.equal(serialized.includes('secret'), false);
  assert.equal(serialized.includes('privateKey'), false);
  assert.equal(serialized.includes('sessionToken'), false);
  assert.equal(serialized.includes('keystore'), false);
  assert.equal(first.record.authorizesExecution, false);
  assert.equal(first.record.canGrantPermission, false);
});
