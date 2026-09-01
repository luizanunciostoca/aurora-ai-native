// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { Rfc3339Timestamp, TenantContext } from '@aurora/contracts/context';
import type { ExecutionTargetReference } from '@aurora/contracts/execution-target';
import type { TenantId } from '@aurora/contracts/ids';
import type { ContractVersion } from '@aurora/contracts/versioning';

import { resolveExecutionTarget } from '../src/target-resolution/index.js';
import type { ExecutableTargetBinding } from '../src/target-resolution/types.js';

const version = '1.0.0' as ContractVersion;
const otherVersion = '2.0.0' as ContractVersion;
const tenant: TenantContext = { tenantId: 'tenant:alpha' as TenantId };
const otherTenant: TenantContext = { tenantId: 'tenant:beta' as TenantId };
const target: ExecutionTargetReference = {
  schemaVersion: version,
  kind: 'WORKFLOW',
  bindingReference: 'workflow:publish-approved-post',
};

function timestamp(value: string): Rfc3339Timestamp {
  return value as Rfc3339Timestamp;
}

function binding(overrides: Partial<ExecutableTargetBinding> = {}): ExecutableTargetBinding {
  return {
    schemaVersion: version,
    bindingId: 'binding:one',
    tenant,
    target,
    state: 'AVAILABLE',
    freshUntil: timestamp('2026-09-01T17:00:00Z'),
    compatibleActionIntentSchemaVersions: [version],
    preconditionsSatisfied: true,
    ...overrides,
  };
}

function resolve(
  bindings: readonly ExecutableTargetBinding[],
  evaluatedAt: Rfc3339Timestamp = timestamp('2026-09-01T16:00:00Z'),
) {
  return resolveExecutionTarget({
    schemaVersion: version,
    actionIntentSchemaVersion: version,
    tenant,
    evaluatedAt,
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

test('fails closed for all non-available binding states', () => {
  const unavailable = resolve([binding({ state: 'UNAVAILABLE' })]);
  const degraded = resolve([binding({ state: 'DEGRADED' })]);
  const retired = resolve([binding({ state: 'RETIRED' })]);

  assert.deepEqual(unavailable.reasons, ['TARGET_UNAVAILABLE']);
  assert.deepEqual(degraded.reasons, ['TARGET_DEGRADED']);
  assert.deepEqual(retired.reasons, ['TARGET_RETIRED']);
});

test('fails closed for freshness, compatibility and preconditions', () => {
  const stale = resolve([binding({ freshUntil: timestamp('2026-09-01T16:00:00Z') })]);
  const incompatible = resolve([binding({ compatibleActionIntentSchemaVersions: [] })]);
  const preconditionFailed = resolve([binding({ preconditionsSatisfied: false })]);

  assert.deepEqual(stale.reasons, ['TARGET_STALE']);
  assert.deepEqual(incompatible.reasons, ['TARGET_INCOMPATIBLE']);
  assert.deepEqual(preconditionFailed.reasons, ['TARGET_PRECONDITION_FAILED']);
});

test('malformed or non-RFC3339 timing fails closed', () => {
  const invalidEvaluation = resolve([binding()], timestamp('not-a-timestamp'));
  const dateOnlyEvaluation = resolve([binding()], timestamp('2026-09-01'));
  const invalidFreshness = resolve([binding({ freshUntil: timestamp('not-a-timestamp') })]);

  assert.deepEqual(invalidEvaluation.reasons, ['TARGET_TIME_INVALID']);
  assert.deepEqual(dateOnlyEvaluation.reasons, ['TARGET_TIME_INVALID']);
  assert.deepEqual(invalidFreshness.reasons, ['TARGET_TIME_INVALID']);
  assert.equal(invalidEvaluation.authorizesExecution, false);
  assert.equal(invalidFreshness.authorizesExecution, false);
});

test('binding and target schema incompatibility fail closed', () => {
  const incompatibleBindingSchema = resolve([binding({ schemaVersion: otherVersion })]);
  const otherVersionTarget: ExecutionTargetReference = {
    ...target,
    schemaVersion: otherVersion,
  };
  const incompatibleTargetSchema = resolveExecutionTarget({
    schemaVersion: version,
    actionIntentSchemaVersion: version,
    tenant,
    evaluatedAt: timestamp('2026-09-01T16:00:00Z'),
    target: otherVersionTarget,
    bindings: [binding()],
  });

  assert.deepEqual(incompatibleBindingSchema.reasons, ['TARGET_INCOMPATIBLE']);
  assert.deepEqual(incompatibleTargetSchema.reasons, ['TARGET_INCOMPATIBLE']);
  assert.equal(incompatibleBindingSchema.authorizesExecution, false);
  assert.equal(incompatibleTargetSchema.authorizesExecution, false);
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
    evaluatedAt: timestamp('2026-09-01T16:00:00Z'),
    target: providerTarget,
    bindings: [providerBinding],
  });

  assert.equal(result.resolved, true);
  assert.equal(result.authorizesExecution, false);

  const differentAccount = resolveExecutionTarget({
    schemaVersion: version,
    actionIntentSchemaVersion: version,
    tenant,
    evaluatedAt: timestamp('2026-09-01T16:00:00Z'),
    target: { ...providerTarget, accountReference: 'business:other' },
    bindings: [providerBinding],
  });
  assert.deepEqual(differentAccount.reasons, ['TARGET_NOT_FOUND']);
});

test('keeps opaque non-provider bindings target-neutral and non-authoritative', () => {
  const opaqueTargets = [
    { schemaVersion: version, kind: 'DEVICE', bindingReference: 'device-binding:alpha' },
    { schemaVersion: version, kind: 'WORKFLOW', bindingReference: 'workflow-binding:alpha' },
    {
      schemaVersion: version,
      kind: 'LOCAL_SERVICE',
      bindingReference: 'local-service-binding:alpha',
    },
  ] satisfies readonly ExecutionTargetReference[];

  for (const opaqueTarget of opaqueTargets) {
    const result = resolveExecutionTarget({
      schemaVersion: version,
      actionIntentSchemaVersion: version,
      tenant,
      evaluatedAt: timestamp('2026-09-01T16:00:00Z'),
      target: opaqueTarget,
      bindings: [binding({ target: opaqueTarget })],
    });
    assert.equal(result.resolved, true);
    assert.equal(result.authorizesExecution, false);
  }
});
