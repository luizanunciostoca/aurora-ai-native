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
  type DeviceRegistrationRequest,
  type DeviceTransition,
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
  return { source: 'W14_DEVICE_REGISTRATION', reference, observedAt };
}

function registration(
  overrides: Partial<DeviceRegistrationRequest> = {},
): DeviceRegistrationRequest {
  return {
    deviceId: DEVICE,
    tenantId: TENANT_A,
    boundIdentityId: IDENTITY_A,
    registeredAt: '2026-09-03T07:31:00Z',
    provenance: provenance('registration:fixture'),
    ...overrides,
  };
}

function registerAndActivate(registry: InMemoryDeviceRegistry) {
  const registered = registry.register(registration());
  assert.equal(registered.ok, true);
  if (!registered.ok) throw new Error('fixture registration failed');
  const activated = registry.transition('ACTIVATE', {
    ref: registered.record.ref,
    expectedVersion: 1,
    transitionedAt: '2026-09-03T07:32:00Z',
    provenance: provenance('activation:fixture', '2026-09-03T07:32:00Z'),
  });
  assert.equal(activated.ok, true);
  if (!activated.ok) throw new Error('fixture activation failed');
  return activated.record;
}

test('W14-D registers one canonical tenant-bound DeviceRef and never grants authority', () => {
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

test('W14-D duplicate same-binding registration is idempotent', () => {
  const registry = new InMemoryDeviceRegistry();
  const first = registry.register(registration());
  const duplicate = registry.register(
    registration({
      registeredAt: '2026-09-03T07:32:00Z',
      provenance: provenance('registration:duplicate', '2026-09-03T07:32:00Z'),
    }),
  );
  assert.equal(first.ok, true);
  assert.equal(duplicate.ok, true);
  if (!first.ok || !duplicate.ok) return;
  assert.equal(duplicate.disposition, 'ALREADY_REGISTERED');
  assert.strictEqual(duplicate.record, first.record);
  assert.equal(duplicate.record.ref.registrationVersion, 1);
});

test('W14-D rejects cross-tenant and conflicting identity registration', () => {
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

test('W14-D active resolution requires the bound canonical identity', () => {
  const registry = new InMemoryDeviceRegistry();
  const active = registerAndActivate(registry);

  assert.deepEqual(registry.resolve({ ref: active.ref }), {
    ok: false,
    error: 'IDENTITY_BINDING_REQUIRED',
    authorizesExecution: false,
    canGrantPermission: false,
  });
  assert.deepEqual(registry.resolve({ ref: active.ref, boundIdentityId: IDENTITY_B }), {
    ok: false,
    error: 'IDENTITY_BINDING_MISMATCH',
    authorizesExecution: false,
    canGrantPermission: false,
  });
  const resolved = registry.resolve({ ref: active.ref, boundIdentityId: IDENTITY_A });
  assert.equal(resolved.ok, true);
  if (!resolved.ok) return;
  assert.equal(resolved.record, active);
  assert.equal(resolved.authorizesExecution, false);
  assert.equal(resolved.canGrantPermission, false);
});

test('W14-D revocation is explicit and revoked devices fail closed', () => {
  const registry = new InMemoryDeviceRegistry();
  const active = registerAndActivate(registry);
  const revoked = registry.transition('REVOKE', {
    ref: active.ref,
    expectedVersion: 2,
    transitionedAt: '2026-09-03T07:33:00Z',
    provenance: provenance('revocation:fixture', '2026-09-03T07:33:00Z'),
  });
  assert.equal(revoked.ok, true);
  if (!revoked.ok) return;
  assert.equal(revoked.record.state, 'REVOKED');
  assert.deepEqual(registry.resolve({ ref: revoked.record.ref, boundIdentityId: IDENTITY_A }), {
    ok: false,
    error: 'DEVICE_REVOKED',
    authorizesExecution: false,
    canGrantPermission: false,
  });
});

test('W14-D re-registration is denied by default and policy-explicit when allowed', () => {
  const deniedRegistry = new InMemoryDeviceRegistry();
  const deniedRegistered = deniedRegistry.register(registration());
  assert.equal(deniedRegistered.ok, true);
  if (!deniedRegistered.ok) return;
  const deniedRevoked = deniedRegistry.transition('REVOKE', {
    ref: deniedRegistered.record.ref,
    expectedVersion: 1,
    transitionedAt: '2026-09-03T07:32:00Z',
    provenance: provenance('revocation:default', '2026-09-03T07:32:00Z'),
  });
  assert.equal(deniedRevoked.ok, true);
  if (!deniedRevoked.ok) return;
  assert.deepEqual(
    deniedRegistry.register(
      registration({
        expectedVersion: 2,
        registeredAt: '2026-09-03T07:33:00Z',
        provenance: provenance('reregistration:denied', '2026-09-03T07:33:00Z'),
      }),
    ),
    { ok: false, error: 'REREGISTRATION_DENIED', authorizesExecution: false },
  );

  const allowedRegistry = new InMemoryDeviceRegistry('ALLOW_SAME_BINDING_AFTER_REVOCATION');
  const allowedRegistered = allowedRegistry.register(registration());
  assert.equal(allowedRegistered.ok, true);
  if (!allowedRegistered.ok) return;
  const allowedRevoked = allowedRegistry.transition('REVOKE', {
    ref: allowedRegistered.record.ref,
    expectedVersion: 1,
    transitionedAt: '2026-09-03T07:32:00Z',
    provenance: provenance('revocation:allowed', '2026-09-03T07:32:00Z'),
  });
  assert.equal(allowedRevoked.ok, true);
  if (!allowedRevoked.ok) return;

  assert.deepEqual(
    allowedRegistry.register(
      registration({
        expectedVersion: 1,
        registeredAt: '2026-09-03T07:33:00Z',
        provenance: provenance('reregistration:stale', '2026-09-03T07:33:00Z'),
      }),
    ),
    { ok: false, error: 'STALE_VERSION', authorizesExecution: false },
  );
  const accepted = allowedRegistry.register(
    registration({
      expectedVersion: allowedRevoked.record.ref.registrationVersion,
      registeredAt: '2026-09-03T07:33:00Z',
      provenance: provenance('reregistration:accepted', '2026-09-03T07:33:00Z'),
    }),
  );
  assert.equal(accepted.ok, true);
  if (!accepted.ok) return;
  assert.equal(accepted.disposition, 'REREGISTERED');
  assert.equal(accepted.record.state, 'REGISTERED');
  assert.equal(accepted.record.ref.registrationVersion, 3);
});

test('W14-D compromised and retired lifecycle states are fail-closed', () => {
  const compromisedRegistry = new InMemoryDeviceRegistry();
  const compromisedRegistered = compromisedRegistry.register(registration());
  assert.equal(compromisedRegistered.ok, true);
  if (!compromisedRegistered.ok) return;
  const compromised = compromisedRegistry.transition('MARK_COMPROMISED', {
    ref: compromisedRegistered.record.ref,
    expectedVersion: 1,
    transitionedAt: '2026-09-03T07:32:00Z',
    provenance: provenance('compromise:fixture', '2026-09-03T07:32:00Z'),
  });
  assert.equal(compromised.ok, true);
  if (!compromised.ok) return;
  assert.equal(compromised.record.state, 'COMPROMISED');
  assert.deepEqual(
    compromisedRegistry.resolve({ ref: compromised.record.ref, boundIdentityId: IDENTITY_A }),
    {
      ok: false,
      error: 'DEVICE_COMPROMISED',
      authorizesExecution: false,
      canGrantPermission: false,
    },
  );
  assert.deepEqual(
    compromisedRegistry.transition('ACTIVATE', {
      ref: compromised.record.ref,
      expectedVersion: 2,
      transitionedAt: '2026-09-03T07:33:00Z',
      provenance: provenance('activation:blocked', '2026-09-03T07:33:00Z'),
    }),
    { ok: false, error: 'TRANSITION_NOT_ALLOWED', authorizesExecution: false },
  );

  const retiredRegistry = new InMemoryDeviceRegistry('ALLOW_SAME_BINDING_AFTER_REVOCATION');
  const retiredRegistered = retiredRegistry.register(registration());
  assert.equal(retiredRegistered.ok, true);
  if (!retiredRegistered.ok) return;
  const retired = retiredRegistry.transition('RETIRE', {
    ref: retiredRegistered.record.ref,
    expectedVersion: 1,
    transitionedAt: '2026-09-03T07:32:00Z',
    provenance: provenance('retirement:fixture', '2026-09-03T07:32:00Z'),
  });
  assert.equal(retired.ok, true);
  if (!retired.ok) return;
  assert.deepEqual(
    retiredRegistry.register(
      registration({
        expectedVersion: 2,
        registeredAt: '2026-09-03T07:33:00Z',
        provenance: provenance('registration:after-retire', '2026-09-03T07:33:00Z'),
      }),
    ),
    { ok: false, error: 'DEVICE_RETIRED', authorizesExecution: false },
  );
  assert.deepEqual(retiredRegistry.resolve({ ref: retired.record.ref, boundIdentityId: IDENTITY_A }), {
    ok: false,
    error: 'DEVICE_RETIRED',
    authorizesExecution: false,
    canGrantPermission: false,
  });
});

test('W14-D rejects stale versions, wrong-tenant references and invalid transition values', () => {
  const registry = new InMemoryDeviceRegistry();
  const registered = registry.register(registration());
  assert.equal(registered.ok, true);
  if (!registered.ok) return;
  const active = registerAndActivate(new InMemoryDeviceRegistry());

  assert.deepEqual(registry.transition('ACTIVATE', {
    ref: registered.record.ref,
    expectedVersion: 2,
    transitionedAt: '2026-09-03T07:32:00Z',
    provenance: provenance('activation:stale', '2026-09-03T07:32:00Z'),
  }), { ok: false, error: 'STALE_VERSION', authorizesExecution: false });

  const activeRegistry = new InMemoryDeviceRegistry();
  const current = registerAndActivate(activeRegistry);
  const wrongTenantRef = { ...current.ref, tenantId: TENANT_B };
  assert.deepEqual(activeRegistry.resolve({ ref: wrongTenantRef, boundIdentityId: IDENTITY_A }), {
    ok: false,
    error: 'CROSS_TENANT',
    authorizesExecution: false,
    canGrantPermission: false,
  });
  const staleRef = { ...current.ref, registrationVersion: 1 };
  assert.deepEqual(activeRegistry.resolve({ ref: staleRef, boundIdentityId: IDENTITY_A }), {
    ok: false,
    error: 'STALE_VERSION',
    authorizesExecution: false,
    canGrantPermission: false,
  });
  assert.equal(active.state, 'ACTIVE');
  assert.deepEqual(
    activeRegistry.transition('UNKNOWN' as DeviceTransition, {
      ref: current.ref,
      expectedVersion: 2,
      transitionedAt: '2026-09-03T07:33:00Z',
      provenance: provenance('transition:invalid', '2026-09-03T07:33:00Z'),
    }),
    { ok: false, error: 'REQUEST_MALFORMED', authorizesExecution: false },
  );
});

test('W14-D enforces dvc_<ULID> and rejects canonical-looking malicious IDs', () => {
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
    assert.deepEqual(registry.register(registration({ deviceId: malicious as DeviceId })), {
      ok: false,
      error: 'DEVICE_ID_INVALID',
      authorizesExecution: false,
    });
  }
});

test('W14-D rejects malformed/accessor/secret-bearing references without invoking getters', () => {
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

test('W14-D DeviceRef is minimal, deterministic and contains no secret or authority material', () => {
  const first = new InMemoryDeviceRegistry().register(registration());
  const second = new InMemoryDeviceRegistry().register(registration());
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
  for (const forbidden of [
    'PolicyToken',
    'OwnerDecision',
    'secret',
    'privateKey',
    'sessionToken',
    'keystore',
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  assert.equal(first.record.authorizesExecution, false);
  assert.equal(first.record.canGrantPermission, false);
});
