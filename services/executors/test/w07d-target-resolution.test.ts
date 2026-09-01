import assert from 'node:assert/strict';
import test from 'node:test';

import type { TenantContext } from '@aurora/contracts/context';
import type { ExecutionTargetReference } from '@aurora/contracts/execution-target';
import type { TenantId } from '@aurora/contracts/ids';
import type { ContractVersion } from '@aurora/contracts/versioning';

import { resolveExecutionTarget } from '../src/target-resolution/index.js';
import type { ExecutableTargetBinding } from '../src/target-resolution/index.js';

const version = '1.0.0' as ContractVersion;
const tenant: TenantContext = { tenantId: 'tenant:alpha' as TenantId };
const otherTenant: TenantContext = { tenantId: 'tenant:beta' as TenantId };
const target: ExecutionTargetReference = {
  schemaVersion: version,
  kind: 'WORKFLOW',
  bindingReference: 'workflow:publish-approved-post',
};

function binding(overrides: Partial<ExecutableTargetBinding> = {}): ExecutableTargetBinding {
  return {
    schemaVersion: version,
    bindingId: 'binding:one',
    tenant,
    target,
    state: 'AVAILABLE',
    freshUntil: '2026-09-01T17:00:00Z',
    compatibleActionIntentSchemaVersions: [version],
    preconditionsSatisfied: true,
    ...overrides,
  };
}

function resolve(bindings: readonly ExecutableTargetBinding[]) {
  return resolveExecutionTarget({
    schemaVersion: version,
    actionIntentSchemaVersion: version,
    tenant,
    evaluatedAt: '2026-09-01T16:00:00Z',
    target,
    bindings,
  });
}

test('resolves one fresh compatible binding without granting authority', () => {
  const result = resolve([binding()]);
  assert.equal(result.resolved, true);
  assert.equal(result.authorizesExecution, false);
  if (result.resolved) assert.equal(result.binding.bindingId, 'binding:one');
});

test('fails closed for missing, cross-tenant and ambiguous bindings', () => {
  assert.deepEqual(resolve([]).reasons, ['TARGET_NOT_FOUND']);
  assert.deepEqual(resolve([binding({ tenant: otherTenant })]).reasons, [
    'TARGET_TENANT_MISMATCH',
  ]);
  assert.deepEqual(resolve([binding(), binding({ bindingId: 'binding:two' })]).reasons, [
    'TARGET_AMBIGUOUS',
  ]);
});

test('fails closed for availability, freshness, compatibility and preconditions', () => {
  assert.deepEqual(resolve([binding({ state: 'UNAVAILABLE' })]).reasons, ['TARGET_UNAVAILABLE']);
  assert.deepEqual(resolve([binding({ freshUntil: '2026-09-01T16:00:00Z' })]).reasons, [
    'TARGET_STALE',
  ]);
  assert.deepEqual(resolve([binding({ compatibleActionIntentSchemaVersions: [] })]).reasons, [
    'TARGET_INCOMPATIBLE',
  ]);
  assert.deepEqual(resolve([binding({ preconditionsSatisfied: false })]).reasons, [
    'TARGET_PRECONDITION_FAILED',
  ]);
});

test('matches provider targets using the complete target identity', () => {
  const providerTarget: ExecutionTargetReference = {
    schemaVersion: version,
    kind: 'PROVIDER',
    provider: 'meta',
    targetType: 'instagram_account',
    targetReference: 'ig:123',
    accountReference: 'business:456',
  };
  const providerBinding = binding({ target: providerTarget });
  const result = resolveExecutionTarget({
    schemaVersion: version,
    actionIntentSchemaVersion: version,
    tenant,
    evaluatedAt: '2026-09-01T16:00:00Z',
    target: providerTarget,
    bindings: [providerBinding],
  });
  assert.equal(result.resolved, true);
  assert.equal(result.authorizesExecution, false);
});
