// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { TenantId } from '@aurora/contracts';

import {
  prepareGoogleAdsAccountRead,
  type GoogleAdsAccountReadInput,
} from '../src/google-ads/account-read.js';

const TENANT = 'ten_01JW13BTENANT000000000000' as TenantId;
const OTHER_TENANT = 'ten_01JW13BOTHER00000000000' as TenantId;
const NOW = 1_800_000_000_000;

function fixture(overrides: Partial<GoogleAdsAccountReadInput> = {}): GoogleAdsAccountReadInput {
  return {
    tenantId: TENANT,
    providerBindingReference: 'w08:google-ads:binding-1',
    customerId: '1234567890',
    managerCustomerId: '9988776655',
    operation: 'CAMPAIGNS',
    fields: ['campaign.id', 'campaign.name', 'campaign.status'],
    nowMs: NOW,
    maxVerificationAgeMs: 60_000,
    maxHealthAgeMs: 30_000,
    limits: { maxPages: 5, maxItems: 500 },
    binding: {
      source: 'W08_PROVIDER_BINDING',
      tenantId: TENANT,
      provider: 'GOOGLE_ADS',
      bindingReference: 'w08:google-ads:binding-1',
      customerId: '1234567890',
      managerCustomerId: '9988776655',
      state: 'ACTIVE',
      verificationState: 'VERIFIED',
      bindingVersion: 7,
      verifiedAtMs: NOW - 10_000,
      authorizesExecution: false,
    },
    health: {
      source: 'W08_PROVIDER_HEALTH',
      status: 'HEALTHY',
      observedAtMs: NOW - 5_000,
      authorizesExecution: false,
    },
    ...overrides,
  };
}

test('W13-B produces a bounded W08 read-only plan without granting authority', () => {
  const result = prepareGoogleAdsAccountRead(fixture());
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;

  assert.equal(result.plan.executionPath, 'W08_READ_ONLY');
  assert.equal(result.plan.readOnly, true);
  assert.equal(result.plan.accountVerificationIsPreconditionOnly, true);
  assert.equal(result.plan.authorizesExecution, false);
  assert.equal(result.plan.canGrantPermission, false);
  assert.equal(result.plan.bindingVersion, 7);
  assert.equal(result.plan.verificationAgeMs, 10_000);
  assert.deepEqual(result.plan.limits, { maxPages: 5, maxItems: 500 });
});

test('W13-B accepts degraded but fresh provider health as observable read context', () => {
  const result = prepareGoogleAdsAccountRead(
    fixture({
      operation: 'METRICS',
      health: {
        source: 'W08_PROVIDER_HEALTH',
        status: 'DEGRADED',
        observedAtMs: NOW - 1_000,
        authorizesExecution: false,
      },
    }),
  );
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;
  assert.equal(result.plan.providerHealth, 'DEGRADED');
  assert.equal(result.plan.operation, 'METRICS');
});

test('W13-B fails closed on cross-tenant and wrong-customer bindings', () => {
  assert.deepEqual(
    prepareGoogleAdsAccountRead(
      fixture({ binding: { ...fixture().binding, tenantId: OTHER_TENANT } }),
    ),
    { status: 'BLOCKED', code: 'WRONG_TENANT' },
  );

  assert.deepEqual(
    prepareGoogleAdsAccountRead(
      fixture({ binding: { ...fixture().binding, customerId: '0000000000' } }),
    ),
    { status: 'BLOCKED', code: 'WRONG_CUSTOMER' },
  );
});

test('W13-B fails closed on MCC hierarchy mismatch or missing manager binding', () => {
  assert.deepEqual(
    prepareGoogleAdsAccountRead(
      fixture({
        binding: { ...fixture().binding, managerCustomerId: '1111222233' },
      }),
    ),
    { status: 'BLOCKED', code: 'MANAGER_HIERARCHY_MISMATCH' },
  );

  const binding = fixture().binding;
  const withoutManager = {
    source: binding.source,
    tenantId: binding.tenantId,
    provider: binding.provider,
    bindingReference: binding.bindingReference,
    customerId: binding.customerId,
    state: binding.state,
    verificationState: binding.verificationState,
    bindingVersion: binding.bindingVersion,
    verifiedAtMs: binding.verifiedAtMs,
    authorizesExecution: binding.authorizesExecution,
  };
  assert.deepEqual(prepareGoogleAdsAccountRead(fixture({ binding: withoutManager })), {
    status: 'BLOCKED',
    code: 'MANAGER_HIERARCHY_MISMATCH',
  });
});

test('W13-B treats verification as a current precondition, not cached authority', () => {
  assert.deepEqual(
    prepareGoogleAdsAccountRead(
      fixture({ binding: { ...fixture().binding, verificationState: 'UNVERIFIED' } }),
    ),
    { status: 'BLOCKED', code: 'ACCOUNT_NOT_VERIFIED' },
  );

  assert.deepEqual(
    prepareGoogleAdsAccountRead(
      fixture({ binding: { ...fixture().binding, verifiedAtMs: NOW - 60_001 } }),
    ),
    { status: 'BLOCKED', code: 'VERIFICATION_STALE' },
  );
});

test('W13-B blocks unavailable or stale provider health before composing a read', () => {
  assert.deepEqual(
    prepareGoogleAdsAccountRead(
      fixture({
        health: {
          ...fixture().health,
          status: 'UNAVAILABLE',
        },
      }),
    ),
    { status: 'BLOCKED', code: 'PROVIDER_UNAVAILABLE' },
  );

  assert.deepEqual(
    prepareGoogleAdsAccountRead(
      fixture({
        health: { ...fixture().health, observedAtMs: NOW - 30_001 },
      }),
    ),
    { status: 'BLOCKED', code: 'HEALTH_STALE' },
  );
});

test('W13-B rejects malformed limits, fields and future-dated observations', () => {
  assert.deepEqual(prepareGoogleAdsAccountRead(fixture({ limits: { maxPages: 0, maxItems: 1 } })), {
    status: 'BLOCKED',
    code: 'INVALID_LIMITS',
  });
  assert.deepEqual(prepareGoogleAdsAccountRead(fixture({ fields: [] })), {
    status: 'BLOCKED',
    code: 'EMPTY_FIELDS',
  });
  assert.deepEqual(
    prepareGoogleAdsAccountRead(
      fixture({ binding: { ...fixture().binding, verifiedAtMs: NOW + 1 } }),
    ),
    { status: 'BLOCKED', code: 'INVALID_TIME_BOUNDARY' },
  );
});
