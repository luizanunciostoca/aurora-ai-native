// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { ProviderExternalId, TenantId } from '@aurora/contracts/ids';
import type { ContractVersion } from '@aurora/contracts/versioning';

import type { ProviderBindingRecord } from '../src/bindings/index.js';
import {
  withResolvedCredential,
  type CredentialBackend,
  type CredentialBackendLookup,
  type SecretReferenceRecord,
} from '../src/credentials/index.js';

const VERSION = '1.0.0' as ContractVersion;
const NOW = '2026-09-03T00:00:00Z' as Rfc3339Timestamp;
const FUTURE = '2026-09-04T00:00:00Z' as Rfc3339Timestamp;
const PAST = '2026-09-02T00:00:00Z' as Rfc3339Timestamp;
const TENANT_A = 'ten_01JTESTTENANTA000000000000' as TenantId;
const TENANT_B = 'ten_01JTESTTENANTB000000000000' as TenantId;
const ACCOUNT = 'act_123' as ProviderExternalId;
const OTHER_ACCOUNT = 'act_999' as ProviderExternalId;
const TRANSIENT_FIXTURE_VALUE = ['fixture', 'transient', 'credential'].join('-');

function binding(overrides: Partial<ProviderBindingRecord> = {}): ProviderBindingRecord {
  return {
    kind: 'ProviderBindingRecord',
    schemaVersion: VERSION,
    bindingReference: 'provider-binding-meta-account-1',
    tenant: { tenantId: TENANT_A },
    provider: 'META',
    accountReference: ACCOUNT,
    state: 'ACTIVE',
    verificationState: 'VERIFIED',
    bindingVersion: 1,
    updatedAt: NOW,
    authorizesExecution: false,
    ...overrides,
  };
}

function secretReference(overrides: Partial<SecretReferenceRecord> = {}): SecretReferenceRecord {
  return {
    kind: 'SecretReferenceRecord',
    schemaVersion: VERSION,
    secretReference: 'secretref/meta/account/primary',
    tenant: { tenantId: TENANT_A },
    provider: 'META',
    accountReference: ACCOUNT,
    bindingReference: 'provider-binding-meta-account-1',
    state: 'ACTIVE',
    credentialVersion: 3,
    updatedAt: NOW,
    expiresAt: FUTURE,
    authorizesExecution: false,
    ...overrides,
  };
}

function successfulBackend(
  onLookup?: (lookup: CredentialBackendLookup) => void,
): CredentialBackend {
  return {
    async withCredential(lookup, consume) {
      onLookup?.(lookup);
      await consume(TRANSIENT_FIXTURE_VALUE);
    },
  };
}

test('W08-B exposes credential material only inside the transient callback and returns sanitized metadata', async () => {
  let consumed: string | null = null;
  let capturedLookup: CredentialBackendLookup | null = null;

  const result = await withResolvedCredential(
    {
      tenant: { tenantId: TENANT_A },
      binding: binding(),
      secretReference: secretReference(),
      now: NOW,
    },
    successfulBackend((lookup) => {
      capturedLookup = lookup;
    }),
    (credential) => {
      consumed = credential;
    },
  );

  assert.equal(consumed, TRANSIENT_FIXTURE_VALUE);
  assert.equal(result.ok, true);
  assert.equal(result.authorizesExecution, false);
  if (!result.ok) return;
  assert.equal(result.secretReference, 'secretref/meta/account/primary');
  assert.equal(result.credentialVersion, 3);

  const serializedResult = JSON.stringify(result);
  const serializedLookup = JSON.stringify(capturedLookup);
  assert.equal(serializedResult.includes(TRANSIENT_FIXTURE_VALUE), false);
  assert.equal(serializedLookup.includes(TRANSIENT_FIXTURE_VALUE), false);
});

test('W08-B fails closed on tenant, provider, account and binding mismatch before backend access', async () => {
  let backendCalls = 0;
  const backend: CredentialBackend = {
    async withCredential(_lookup, _consume) {
      backendCalls += 1;
    },
  };

  const scenarios = [
    {
      name: 'request tenant',
      requestTenant: TENANT_B,
      binding: binding(),
      reference: secretReference(),
      expected: 'TENANT_MISMATCH',
    },
    {
      name: 'reference tenant',
      requestTenant: TENANT_A,
      binding: binding(),
      reference: secretReference({ tenant: { tenantId: TENANT_B } }),
      expected: 'TENANT_MISMATCH',
    },
    {
      name: 'provider',
      requestTenant: TENANT_A,
      binding: binding(),
      reference: secretReference({ provider: 'GOOGLE_ADS' }),
      expected: 'PROVIDER_MISMATCH',
    },
    {
      name: 'account',
      requestTenant: TENANT_A,
      binding: binding(),
      reference: secretReference({ accountReference: OTHER_ACCOUNT }),
      expected: 'ACCOUNT_MISMATCH',
    },
    {
      name: 'binding reference',
      requestTenant: TENANT_A,
      binding: binding(),
      reference: secretReference({ bindingReference: 'provider-binding-other' }),
      expected: 'BINDING_MISMATCH',
    },
  ] as const;

  for (const scenario of scenarios) {
    const result = await withResolvedCredential(
      {
        tenant: { tenantId: scenario.requestTenant },
        binding: scenario.binding,
        secretReference: scenario.reference,
        now: NOW,
      },
      backend,
      () => undefined,
    );
    assert.equal(result.ok, false, scenario.name);
    if (!result.ok) {
      assert.equal(result.error, scenario.expected, scenario.name);
      assert.equal(result.authorizesExecution, false, scenario.name);
    }
  }

  assert.equal(backendCalls, 0);
});

test('W08-B rejects unavailable binding and revoked, rotated or expired credential metadata', async () => {
  let backendCalls = 0;
  const backend: CredentialBackend = {
    async withCredential(_lookup, _consume) {
      backendCalls += 1;
    },
  };

  const cases = [
    {
      binding: binding({ state: 'REVOKED' }),
      reference: secretReference(),
      expected: 'BINDING_UNAVAILABLE',
    },
    {
      binding: binding({ verificationState: 'STALE' }),
      reference: secretReference(),
      expected: 'BINDING_UNAVAILABLE',
    },
    {
      binding: binding(),
      reference: secretReference({ state: 'REVOKED' }),
      expected: 'SECRET_REVOKED',
    },
    {
      binding: binding(),
      reference: secretReference({ state: 'ROTATED' }),
      expected: 'SECRET_ROTATED',
    },
    {
      binding: binding(),
      reference: secretReference({ expiresAt: PAST }),
      expected: 'SECRET_EXPIRED',
    },
  ] as const;

  for (const item of cases) {
    const result = await withResolvedCredential(
      {
        tenant: { tenantId: TENANT_A },
        binding: item.binding,
        secretReference: item.reference,
        now: NOW,
      },
      backend,
      () => undefined,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, item.expected);
  }

  assert.equal(backendCalls, 0);
});

test('W08-B rejects malformed, accessor, inherited and raw-token-like reference objects without invoking getters', async () => {
  let getterCalls = 0;
  const accessor = { ...secretReference() } as Record<string, unknown>;
  Object.defineProperty(accessor, 'provider', {
    enumerable: true,
    configurable: true,
    get: () => {
      getterCalls += 1;
      return 'META';
    },
  });

  const inherited = Object.assign(Object.create({ injected: true }), secretReference());
  const rawTokenLike = {
    ...secretReference(),
    token: ['raw', 'credential', 'must', 'not', 'be', 'accepted'].join('-'),
  };

  let backendCalls = 0;
  const backend: CredentialBackend = {
    async withCredential(_lookup, _consume) {
      backendCalls += 1;
    },
  };

  for (const candidate of [accessor, inherited, rawTokenLike]) {
    const result = await withResolvedCredential(
      {
        tenant: { tenantId: TENANT_A },
        binding: binding(),
        secretReference: candidate,
        now: NOW,
      },
      backend,
      () => undefined,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, 'REFERENCE_MALFORMED');
  }

  assert.equal(getterCalls, 0);
  assert.equal(backendCalls, 0);
});

test('W08-B sanitizes backend and consumer failures instead of returning thrown credential-bearing messages', async () => {
  const backendFailure: CredentialBackend = {
    async withCredential(_lookup, _consume) {
      throw new Error(`backend:${TRANSIENT_FIXTURE_VALUE}`);
    },
  };
  const backendResult = await withResolvedCredential(
    {
      tenant: { tenantId: TENANT_A },
      binding: binding(),
      secretReference: secretReference(),
      now: NOW,
    },
    backendFailure,
    () => undefined,
  );
  assert.deepEqual(backendResult, {
    ok: false,
    error: 'SECRET_UNAVAILABLE',
    authorizesExecution: false,
  });
  assert.equal(JSON.stringify(backendResult).includes(TRANSIENT_FIXTURE_VALUE), false);

  const consumerResult = await withResolvedCredential(
    {
      tenant: { tenantId: TENANT_A },
      binding: binding(),
      secretReference: secretReference(),
      now: NOW,
    },
    successfulBackend(),
    () => {
      throw new Error(`consumer:${TRANSIENT_FIXTURE_VALUE}`);
    },
  );
  assert.deepEqual(consumerResult, {
    ok: false,
    error: 'CONSUMER_FAILED',
    authorizesExecution: false,
  });
  assert.equal(JSON.stringify(consumerResult).includes(TRANSIENT_FIXTURE_VALUE), false);
});

test('W08-B fails closed when the credential backend violates the callback protocol', async () => {
  const noCallback: CredentialBackend = {
    async withCredential(_lookup, _consume) {},
  };
  const twice: CredentialBackend = {
    async withCredential(_lookup, consume) {
      await consume(TRANSIENT_FIXTURE_VALUE);
      await consume(TRANSIENT_FIXTURE_VALUE);
    },
  };
  const empty: CredentialBackend = {
    async withCredential(_lookup, consume) {
      await consume('');
    },
  };

  for (const backend of [noCallback, twice, empty]) {
    const result = await withResolvedCredential(
      {
        tenant: { tenantId: TENANT_A },
        binding: binding(),
        secretReference: secretReference(),
        now: NOW,
      },
      backend,
      () => undefined,
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, 'BACKEND_PROTOCOL_VIOLATION');
  }
});

test('W08-B keeps credential lifecycle and successful resolution non-authoritative', async () => {
  for (const verificationState of ['UNVERIFIED', 'VERIFIED'] as const) {
    const result = await withResolvedCredential(
      {
        tenant: { tenantId: TENANT_A },
        binding: binding({ verificationState }),
        secretReference: secretReference({ credentialVersion: 7 }),
        now: NOW,
      },
      successfulBackend(),
      () => undefined,
    );
    assert.equal(result.ok, true);
    assert.equal(result.authorizesExecution, false);
    if (result.ok) assert.equal(result.credentialVersion, 7);
  }
});
