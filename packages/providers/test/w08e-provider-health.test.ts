// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { ContractVersion } from '@aurora/contracts/versioning';

import type { ProviderBindingRecord } from '../src/bindings/index.js';
import {
  normalizeProviderOperationalObservation,
  PROVIDER_OPERATIONAL_STATES,
} from '../src/health/index.js';

const VERSION = '1.0.0' as ContractVersion;
const NOW = '2026-09-03T03:00:00Z' as Rfc3339Timestamp;
const RECENT = '2026-09-03T02:59:30Z' as Rfc3339Timestamp;
const STALE = '2026-09-03T02:00:00Z' as Rfc3339Timestamp;
const TENANT = 'ten_01JTESTTENANTA000000000000' as ProviderBindingRecord['tenant']['tenantId'];
const OTHER_TENANT = 'ten_01JTESTTENANTB000000000000' as ProviderBindingRecord['tenant']['tenantId'];
const ACCOUNT = 'act_123' as ProviderBindingRecord['accountReference'];
const OTHER_ACCOUNT = 'act_999' as ProviderBindingRecord['accountReference'];

function binding(
  tenantId: ProviderBindingRecord['tenant']['tenantId'] = TENANT,
  accountReference: ProviderBindingRecord['accountReference'] = ACCOUNT,
): ProviderBindingRecord {
  return {
    kind: 'ProviderBindingRecord',
    schemaVersion: VERSION,
    bindingReference: 'provider-binding-meta-act-123',
    tenant: { tenantId },
    provider: 'META',
    accountReference,
    state: 'ACTIVE',
    verificationState: 'VERIFIED',
    bindingVersion: 4,
    updatedAt: NOW,
    authorizesExecution: false,
  };
}

function observation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    provider: 'META',
    accountReference: ACCOUNT,
    bindingReference: 'provider-binding-meta-act-123',
    observedAt: RECENT,
    sourceEndpoint: 'meta:/v1/operational-status',
    state: 'HEALTHY',
    ...overrides,
  };
}

function request(rawObservation: unknown, providerBinding = binding()) {
  return {
    tenant: { tenantId: TENANT },
    binding: providerBinding,
    now: NOW,
    maxObservationAgeMs: 60_000,
    observation: rawObservation,
  };
}

test('W08-E normalizes current health, rate-limit and quota metadata without granting authority', () => {
  const result = normalizeProviderOperationalObservation(
    request(
      observation({
        rateLimit: {
          remaining: 9,
          limit: 10,
          resetAt: '2026-09-03T03:05:00Z',
          retryAfterMs: 2_000,
        },
        quota: { remaining: 90, limit: 100, resetAt: '2026-09-04T00:00:00Z' },
        retryAfterMs: 2_000,
      }),
    ),
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state, 'HEALTHY');
  assert.equal(result.currentness, 'CURRENT');
  assert.equal(result.provider, 'META');
  assert.equal(result.accountReference, ACCOUNT);
  assert.equal(result.rateLimit?.remaining, 9);
  assert.equal(result.quota?.remaining, 90);
  assert.equal(result.advisoryRetryAfterMs, 2_000);
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.authorizesExecution, false);
});

test('W08-E preserves explicit degradation taxonomy without converting health to policy authority', () => {
  for (const state of PROVIDER_OPERATIONAL_STATES) {
    const result = normalizeProviderOperationalObservation(request(observation({ state })));
    assert.equal(result.ok, true, state);
    if (!result.ok) continue;
    assert.equal(result.state, state);
    assert.equal(result.retryAuthorized, false);
    assert.equal(result.authorizesExecution, false);
  }
});

test('W08-E marks stale observations explicitly instead of reusing them as current preconditions', () => {
  const result = normalizeProviderOperationalObservation(
    request(observation({ observedAt: STALE, state: 'DEGRADED' })),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.currentness, 'STALE');
  assert.equal(result.state, 'DEGRADED');
  assert.equal(result.authorizesExecution, false);
});

test('W08-E fails closed on tenant, account and binding-reference mismatches', () => {
  const wrongTenant = normalizeProviderOperationalObservation(
    request(observation(), binding(OTHER_TENANT, ACCOUNT)),
  );
  assert.equal(wrongTenant.ok, false);
  if (!wrongTenant.ok) assert.equal(wrongTenant.error, 'BINDING_MISMATCH');

  const wrongAccount = normalizeProviderOperationalObservation(
    request(observation({ accountReference: OTHER_ACCOUNT })),
  );
  assert.equal(wrongAccount.ok, false);
  if (!wrongAccount.ok) assert.equal(wrongAccount.error, 'BINDING_MISMATCH');

  const wrongBinding = normalizeProviderOperationalObservation(
    request(observation({ bindingReference: 'provider-binding-other' })),
  );
  assert.equal(wrongBinding.ok, false);
  if (!wrongBinding.ok) assert.equal(wrongBinding.error, 'BINDING_MISMATCH');
});

test('W08-E rejects extreme or conflicting retry metadata rather than inventing backoff policy', () => {
  const extreme = normalizeProviderOperationalObservation(
    request(observation({ retryAfterMs: 86_400_001, state: 'THROTTLED' })),
  );
  assert.equal(extreme.ok, false);
  if (!extreme.ok) assert.equal(extreme.error, 'OBSERVATION_MALFORMED');

  const conflicting = normalizeProviderOperationalObservation(
    request(
      observation({
        retryAfterMs: 1_000,
        rateLimit: { retryAfterMs: 2_000 },
        state: 'THROTTLED',
      }),
    ),
  );
  assert.equal(conflicting.ok, false);
  if (!conflicting.ok) assert.equal(conflicting.error, 'OBSERVATION_MALFORMED');
});

test('W08-E rejects malformed limits and never executes accessor-backed provider metadata', () => {
  const malformed = normalizeProviderOperationalObservation(
    request(observation({ rateLimit: { remaining: 11, limit: 10 } })),
  );
  assert.equal(malformed.ok, false);
  if (!malformed.ok) assert.equal(malformed.error, 'OBSERVATION_MALFORMED');

  const accessor = observation();
  Object.defineProperty(accessor, 'authorization', {
    enumerable: true,
    get() {
      throw new Error('sensitive accessor must never execute');
    },
  });
  const sensitive = normalizeProviderOperationalObservation(request(accessor));
  assert.equal(sensitive.ok, false);
  if (!sensitive.ok) assert.equal(sensitive.error, 'SENSITIVE_METADATA_REJECTED');
});

test('W08-E keeps authentication failure distinct from Aurora authorization and exposes no retry decision', () => {
  const result = normalizeProviderOperationalObservation(
    request(observation({ state: 'AUTH_FAILED' })),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.state, 'AUTH_FAILED');
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.authorizesExecution, false);
  assert.equal('policyAllowed' in result, false);
  assert.equal('execute' in result, false);
});
