// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- provider harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type {
  ExecutionTargetReference,
  ProviderExecutionTargetReference,
} from '@aurora/contracts/execution-target';
import type { ProviderExternalId, TenantId } from '@aurora/contracts/ids';
import type { ContractVersion } from '@aurora/contracts/versioning';

import {
  resolveProviderBinding,
  type ProviderBindingRecord,
} from '../src/bindings/index.js';

const VERSION = '1.0.0' as ContractVersion;
const NOW = '2026-09-02T23:00:00Z' as Rfc3339Timestamp;
const TENANT_A = 'ten_01JTESTTENANTA000000000000' as TenantId;
const TENANT_B = 'ten_01JTESTTENANTB000000000000' as TenantId;
const ACCOUNT = 'act_123' as ProviderExternalId;
const TARGET = 'page_456' as ProviderExternalId;

function binding(
  overrides: Partial<ProviderBindingRecord> = {},
): ProviderBindingRecord {
  return {
    kind: 'ProviderBindingRecord',
    schemaVersion: VERSION,
    bindingReference: 'provider-binding-meta-page-1',
    tenant: { tenantId: TENANT_A },
    provider: 'META',
    accountReference: ACCOUNT,
    targetType: 'PAGE',
    targetReference: TARGET,
    state: 'ACTIVE',
    verificationState: 'VERIFIED',
    bindingVersion: 1,
    updatedAt: NOW,
    authorizesExecution: false,
    ...overrides,
  };
}

function providerTarget(
  overrides: Partial<ProviderExecutionTargetReference> = {},
): ProviderExecutionTargetReference {
  return {
    schemaVersion: VERSION,
    kind: 'PROVIDER',
    provider: 'META',
    accountReference: ACCOUNT,
    targetType: 'PAGE',
    targetReference: TARGET,
    ...overrides,
  };
}

test('W08-A resolves one exact provider binding without granting authority', () => {
  const result = resolveProviderBinding({
    tenant: { tenantId: TENANT_A },
    executionTarget: providerTarget(),
    candidates: [binding()],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.binding.bindingReference, 'provider-binding-meta-page-1');
  assert.equal(result.binding.accountReference, ACCOUNT);
  assert.equal(result.binding.targetReference, TARGET);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.binding.authorizesExecution, false);
  assert.equal(result.verificationState, 'VERIFIED');
});

test('W08-A verification metadata never becomes Aurora authority', () => {
  for (const verificationState of ['UNVERIFIED', 'VERIFIED'] as const) {
    const result = resolveProviderBinding({
      tenant: { tenantId: TENANT_A },
      executionTarget: providerTarget(),
      candidates: [binding({ verificationState })],
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.verificationState, verificationState);
      assert.equal(result.authorizesExecution, false);
    }
  }
});

test('W08-A fails closed on tenant/provider/account/target mismatch without cross-context fallback', () => {
  const scenarios = [
    {
      name: 'tenant',
      tenant: { tenantId: TENANT_B },
      target: providerTarget(),
    },
    {
      name: 'provider',
      tenant: { tenantId: TENANT_A },
      target: providerTarget({ provider: 'GOOGLE_ADS' }),
    },
    {
      name: 'account',
      tenant: { tenantId: TENANT_A },
      target: providerTarget({ accountReference: 'act_wrong' }),
    },
    {
      name: 'target type',
      tenant: { tenantId: TENANT_A },
      target: providerTarget({ targetType: 'AD_ACCOUNT' }),
    },
    {
      name: 'target reference',
      tenant: { tenantId: TENANT_A },
      target: providerTarget({ targetReference: 'page_wrong' }),
    },
  ] as const;

  for (const scenario of scenarios) {
    const result = resolveProviderBinding({
      tenant: scenario.tenant,
      executionTarget: scenario.target,
      candidates: [binding()],
    });
    assert.deepEqual(
      {
        ok: result.ok,
        error: result.ok ? null : result.error,
        authority: result.authorizesExecution,
      },
      { ok: false, error: 'BINDING_NOT_FOUND', authority: false },
      scenario.name,
    );
  }
});

test('W08-A rejects duplicate, inactive, revoked and stale exact bindings', () => {
  const duplicate = resolveProviderBinding({
    tenant: { tenantId: TENANT_A },
    executionTarget: providerTarget(),
    candidates: [
      binding(),
      binding({ bindingReference: 'provider-binding-meta-page-2' }),
    ],
  });
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.error, 'BINDING_AMBIGUOUS');

  for (const [candidate, expected] of [
    [binding({ state: 'INACTIVE' }), 'BINDING_INACTIVE'],
    [binding({ state: 'REVOKED' }), 'BINDING_REVOKED'],
    [binding({ verificationState: 'STALE' }), 'BINDING_STALE'],
  ] as const) {
    const result = resolveProviderBinding({
      tenant: { tenantId: TENANT_A },
      executionTarget: providerTarget(),
      candidates: [candidate],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, expected);
      assert.equal(result.authorizesExecution, false);
    }
  }
});

test('W08-A requires a PROVIDER target with an explicit account reference', () => {
  const localTarget: ExecutionTargetReference = {
    schemaVersion: VERSION,
    kind: 'LOCAL_SERVICE',
    bindingReference: 'asset-service',
  };
  const nonProvider = resolveProviderBinding({
    tenant: { tenantId: TENANT_A },
    executionTarget: localTarget,
    candidates: [binding()],
  });
  assert.equal(nonProvider.ok, false);
  if (!nonProvider.ok) assert.equal(nonProvider.error, 'NON_PROVIDER_TARGET');

  const noAccountTarget: ProviderExecutionTargetReference = {
    schemaVersion: VERSION,
    kind: 'PROVIDER',
    provider: 'META',
    targetType: 'PAGE',
    targetReference: TARGET,
  };
  const noAccount = resolveProviderBinding({
    tenant: { tenantId: TENANT_A },
    executionTarget: noAccountTarget,
    candidates: [binding()],
  });
  assert.equal(noAccount.ok, false);
  if (!noAccount.ok) assert.equal(noAccount.error, 'TARGET_ACCOUNT_REQUIRED');
});

test('W08-A rejects malformed, accessor, inherited and secret-bearing binding objects', () => {
  const accessor = { ...binding() } as Record<string, unknown>;
  Object.defineProperty(accessor, 'provider', {
    enumerable: true,
    configurable: true,
    get: () => 'META',
  });

  const inherited = Object.assign(Object.create({ injected: true }), binding());
  const secretBearing = {
    ...binding(),
    apiToken: 'must-not-enter-binding-shape',
  };

  for (const candidate of [accessor, inherited, secretBearing]) {
    const result = resolveProviderBinding({
      tenant: { tenantId: TENANT_A },
      executionTarget: providerTarget(),
      candidates: [candidate],
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, 'MALFORMED_BINDING');
      assert.equal(result.candidateIndex, 0);
      assert.equal(result.authorizesExecution, false);
    }
  }
});

test('W08-A preserves provider-owned IDs as opaque external references even when they resemble Aurora IDs', () => {
  const canonicalLookingExternal =
    'ten_01JLOOKSLIKECANONICAL0000000' as ProviderExternalId;
  const result = resolveProviderBinding({
    tenant: { tenantId: TENANT_A },
    executionTarget: providerTarget({
      targetReference: canonicalLookingExternal,
    }),
    candidates: [binding({ targetReference: canonicalLookingExternal })],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.binding.targetReference, canonicalLookingExternal);
  assert.notEqual(result.binding.targetReference, result.binding.tenant.tenantId);
  assert.equal(result.authorizesExecution, false);
});
