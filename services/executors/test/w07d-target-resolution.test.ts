import assert from 'node:assert/strict';
import test from 'node:test';

import type { TenantContext } from '@aurora/contracts/context';
import type { ExecutionTargetReference } from '@aurora/contracts/execution-target';
import type { TenantId } from '@aurora/contracts/ids';
import type { ContractVersion } from '@aurora/contracts/versioning';

import { resolveExecutionTarget } from '../src/target-resolution';
import type { ExecutableTargetBinding } from '../src/target-resolution';

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

function resolve(bindings: readonly ExecutableTargetBinding[], evaluatedAt = '2026-09-01T16:00:00Z') {
  return resolveExecutionTarget({
    schemaVersion: version,
    actionIntentSchemaVersion: version,
    tenant,
    evaluatedAt: evaluatedAt as typeof binding extends never ? never : any,
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
  const missing = resolve([]);
  const crossTenant = resolve([binding({ tenant: otherTenant })]);
  const ambiguous = resolve([binding(), binding({ bindingId: 'binding:two' })]);

  assert.deepEqual(missing.reasons, ['TARGET_NOT_FOUND']);
  assert.deepEqual(crossTenant.reasons, ['TARGET_TENANT_MISMATCH']);
  assert.deepEqual(ambiguous.reasons, ['TARGET_AMBIGUOUS']);
});

test('fails closed for every non-available binding state', () => {
  assert.deepEqual(resolve([binding({ state: 'UNAVAILABLE' })]).reasons, ['TARGET_UNAVAILABLE']);
  assert.deepEqual(resolve([binding({ state: 'DEGRADED' })]).reasons, ['TARGET_DEGRADED']);
  assert.deepEqual(resolve([binding({ state: 'RETIRED' })]).reasons, ['TARGET_RETIRED']);
});

test('fails closed for freshness, compatibility and generic preconditions', () => {
  const stale = resolve([binding({ freshUntil: '2026-09-01T16:00:00Z' })]);
  const incompatible = resolve([binding({ compatibleActionIntentSchemaVersions: [] })]);
  const preconditionFailed = resolve([binding({ preconditionsSatisfied: false })]);

  assert.deepEqual(stale.reasons, ['TARGET_STALE']);
  assert.deepEqual(incompatible.reasons, ['TARGET_INCOMPATIBLE']);
  assert.deepEqual(preconditionFailed.reasons, ['TARGET_PRECONDITION_FAILED']);
});

test('malformed resolver or freshness timestamps fail closed instead of becoming fresh by NaN comparison', () => {
  const invalidEvaluation = resolve([binding()], 'not-a-timestamp');
  const invalidFreshness = resolve([binding({ freshUntil: 'not-a-timestamp' as never })]);

  assert.deepEqual(invalidEvaluation.reasons, ['TARGET_TIME_INVALID']);
  assert.deepEqual(invalidFreshness.reasons, ['TARGET_TIME_INVALID']);
  assert.equal(invalidEvaluation.authorizesExecution, false);
  assert.equal(invalidFreshness.authorizesExecution, false);
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

  const differentAccount = resolveExecutionTarget({
    schemaVersion: version,
    actionIntentSchemaVersion: version,
    tenant,
    evaluatedAt: '2026-09-01T16:00:00Z',
    target: { ...providerTarget, accountReference: 'business:other' },
    bindings: [providerBinding],
  });
  assert.deepEqual(differentAccount.reasons, ['TARGET_NOT_FOUND']);
});

test('opaque DEVICE, WORKFLOW and LOCAL_SERVICE bindings remain target-neutral and non-authoritative', () => {
  for (const opaqueTarget of [
    { schemaVersion: version, kind: 'DEVICE', bindingReference: 'device-binding:alpha' },
    { schemaVersion: version, kind: 'WORKFLOW', bindingReference: 'workflow-binding:alpha' },
    { schemaVersion: version, kind: 'LOCAL_SERVICE', bindingReference: 'local-service-binding:alpha' },
  ] satisfies readonly ExecutionTargetReference[]) {
    const result = resolveExecutionTarget({
      schemaVersion: version,
      actionIntentSchemaVersion: version,
      tenant,
      evaluatedAt: '2026-09-01T16:00:00Z',
      target: opaqueTarget,
      bindings: [binding({ target: opaqueTarget })],
    });
    assert.equal(result.resolved, true);
    assert.equal(result.authorizesExecution, false);
  }
});
