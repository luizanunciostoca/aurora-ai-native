// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { TenantId } from '@aurora/contracts';

import {
  prepareMetaAdsAccountRead,
  type MetaAdsAccountReadInput,
} from '../src/meta-ads/account-read.js';

const TENANT = 'ten_01JW12BTENANT000000000000' as TenantId;
const OTHER_TENANT = 'ten_01JW12BOTHER00000000000' as TenantId;
const NOW = 1_800_000_000_000;

function fixture(overrides: Partial<MetaAdsAccountReadInput> = {}): MetaAdsAccountReadInput {
  return {
    tenantId: TENANT,
    providerBindingReference: 'w08:meta-ads:binding-1',
    businessAccountExternalId: 'biz_123456789',
    adAccountExternalId: 'act_123456789',
    operation: 'CAMPAIGNS',
    fields: ['campaign.id', 'campaign.name', 'campaign.status'],
    nowMs: NOW,
    maxVerificationAgeMs: 60_000,
    maxHealthAgeMs: 30_000,
    limits: { maxPages: 5, maxItems: 500 },
    binding: {
      source: 'W08_PROVIDER_BINDING',
      tenantId: TENANT,
      provider: 'META_ADS',
      bindingReference: 'w08:meta-ads:binding-1',
      businessAccountExternalId: 'biz_123456789',
      adAccountExternalId: 'act_123456789',
      state: 'ACTIVE',
      verificationState: 'VERIFIED',
      bindingVersion: 4,
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

test('W12-B produces a bounded W08 read-only plan without granting authority', () => {
  const result = prepareMetaAdsAccountRead(fixture());
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') return;

  assert.equal(result.plan.executionPath, 'W08_READ_ONLY');
  assert.equal(result.plan.readOnly, true);
  assert.equal(result.plan.accountVerificationIsPreconditionOnly, true);
  assert.equal(result.plan.authorizesExecution, false);
  assert.equal(result.plan.canGrantPermission, false);
  assert.equal(result.plan.bindingVersion, 4);
  assert.equal(result.plan.verificationAgeMs, 10_000);
  assert.deepEqual(result.plan.limits, { maxPages: 5, maxItems: 500 });
});

test('W12-B accepts degraded but fresh provider health as observable read context', () => {
  const result = prepareMetaAdsAccountRead(
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

test('W12-B fails closed on cross-tenant and wrong ad-account bindings', () => {
  assert.deepEqual(
    prepareMetaAdsAccountRead(
      fixture({ binding: { ...fixture().binding, tenantId: OTHER_TENANT } }),
    ),
    { status: 'BLOCKED', code: 'WRONG_TENANT' },
  );

  assert.deepEqual(
    prepareMetaAdsAccountRead(
      fixture({ binding: { ...fixture().binding, adAccountExternalId: 'act_wrong' } }),
    ),
    { status: 'BLOCKED', code: 'WRONG_AD_ACCOUNT' },
  );
});

test('W12-B fails closed on wrong Meta business account', () => {
  assert.deepEqual(
    prepareMetaAdsAccountRead(
      fixture({ binding: { ...fixture().binding, businessAccountExternalId: 'biz_wrong' } }),
    ),
    { status: 'BLOCKED', code: 'WRONG_BUSINESS_ACCOUNT' },
  );
});

test('W12-B treats account verification as a current precondition, not authority', () => {
  assert.deepEqual(
    prepareMetaAdsAccountRead(
      fixture({ binding: { ...fixture().binding, verificationState: 'UNVERIFIED' } }),
    ),
    { status: 'BLOCKED', code: 'ACCOUNT_NOT_VERIFIED' },
  );

  assert.deepEqual(
    prepareMetaAdsAccountRead(
      fixture({ binding: { ...fixture().binding, verifiedAtMs: NOW - 60_001 } }),
    ),
    { status: 'BLOCKED', code: 'VERIFICATION_STALE' },
  );
});

test('W12-B blocks revoked bindings and unavailable or stale provider health', () => {
  assert.deepEqual(
    prepareMetaAdsAccountRead(
      fixture({ binding: { ...fixture().binding, state: 'REVOKED' } }),
    ),
    { status: 'BLOCKED', code: 'BINDING_REVOKED' },
  );

  assert.deepEqual(
    prepareMetaAdsAccountRead(
      fixture({ health: { ...fixture().health, status: 'UNAVAILABLE' } }),
    ),
    { status: 'BLOCKED', code: 'PROVIDER_UNAVAILABLE' },
  );

  assert.deepEqual(
    prepareMetaAdsAccountRead(
      fixture({ health: { ...fixture().health, observedAtMs: NOW - 30_001 } }),
    ),
    { status: 'BLOCKED', code: 'HEALTH_STALE' },
  );
});

test('W12-B rejects malformed limits, fields and future-dated observations', () => {
  assert.deepEqual(prepareMetaAdsAccountRead(fixture({ limits: { maxPages: 0, maxItems: 1 } })), {
    status: 'BLOCKED',
    code: 'INVALID_LIMITS',
  });
  assert.deepEqual(prepareMetaAdsAccountRead(fixture({ fields: [] })), {
    status: 'BLOCKED',
    code: 'EMPTY_FIELDS',
  });
  assert.deepEqual(
    prepareMetaAdsAccountRead(
      fixture({ binding: { ...fixture().binding, verifiedAtMs: NOW + 1 } }),
    ),
    { status: 'BLOCKED', code: 'INVALID_TIME_BOUNDARY' },
  );
});
