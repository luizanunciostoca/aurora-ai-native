// @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides this built-in at runtime.
import assert from 'node:assert/strict';
// @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides this built-in at runtime.
import test from 'node:test';
import type { CorrelationId, TenantId } from '../../contracts/src/ids/types.ts';
import {
  assessCapabilityForPlanning,
  createCapabilityRegistry,
  type CapabilityDescriptor,
} from '../../registries/src/capabilities/registry.ts';
import { validateSeedAdjudication } from '../../registries/src/capabilities/adjudication.ts';
import { planCapabilities } from '../src/capability-plan/index.ts';

const tenant = 'ten_01J00000000000000000000000' as TenantId;
const otherTenant = 'ten_01J00000000000000000000001' as TenantId;
const correlation = 'cor_01J00000000000000000000000' as CorrelationId;
const now = Date.parse('2026-09-01T08:05:00.000Z');

function capability(overrides: Partial<CapabilityDescriptor> = {}): CapabilityDescriptor {
  return {
    capabilityId: 'file.read',
    semanticVersion: '1.0.0',
    name: 'Read a file',
    description: 'Target-neutral file read vocabulary.',
    supportedTargetKinds: ['DEVICE', 'LOCAL_SERVICE'],
    compatibilityKeys: ['file.v1'],
    requiredPermissionClaims: ['file.read'],
    preconditions: ['path-scoped'],
    riskClass: 'MEDIUM',
    sideEffectClass: 'READ_ONLY',
    readbackStrategy: 'RECEIPT',
    evidenceStrategy: 'REQUIRED',
    availability: {
      state: 'AVAILABLE',
      observedAt: '2026-09-01T08:00:00.000Z',
      maxAgeMs: 600_000,
      source: 'test-observer',
    },
    bindings: [
      {
        bindingId: 'binding:file-read-device',
        targetKind: 'DEVICE',
        compatibilityKey: 'file.v1',
        availability: {
          state: 'AVAILABLE',
          observedAt: '2026-09-01T08:00:00.000Z',
          maxAgeMs: 600_000,
          source: 'test-observer',
        },
      },
    ],
    provenance: {
      sourceKind: 'LEGACY_SEED',
      sourceRef: 'AURORA_LEGACY_CAPABILITY_SEED_CATALOG_2026-08-31:file.read',
      adjudicationId: 'W04-B:file.read',
    },
    ...overrides,
  };
}

test('W04-B rejects duplicate capability identity instead of silently merging semantics', () => {
  const first = capability();
  const incompatible = capability({ name: 'Different semantics', sideEffectClass: 'DESTRUCTIVE' });
  const result = createCapabilityRegistry('w04-b.1', [first, incompatible]);
  assert.equal(result.status, 'REJECTED');
  if (result.status === 'REJECTED') assert.equal(result.code, 'DUPLICATE_CAPABILITY_ID');
});

test('W04-B marks stale availability as non-current and never grants authority', () => {
  const descriptor = capability({
    availability: {
      state: 'AVAILABLE',
      observedAt: '2026-09-01T07:00:00.000Z',
      maxAgeMs: 60_000,
      source: 'test-observer',
    },
  });
  const assessment = assessCapabilityForPlanning(descriptor, now);
  assert.equal(assessment.currentAvailability, 'STALE');
  assert.equal(assessment.authorizesExecution, false);
});

test('W04-B creates a target-neutral plan and permission metadata cannot authorize execution', () => {
  const created = createCapabilityRegistry('w04-b.1', [capability()]);
  assert.equal(created.status, 'CREATED');
  if (created.status !== 'CREATED') return;

  const plan = planCapabilities(created.registry, {
    tenantId: tenant,
    correlationId: correlation,
    registryVersion: 'w04-b.1',
    nowEpochMs: now,
    requirements: [
      {
        requirementId: 'read-input',
        capabilityId: 'file.read',
        acceptedTargetKinds: ['DEVICE'],
        requiredCompatibilityKeys: ['file.v1'],
      },
    ],
  });

  assert.equal(plan.status, 'READY');
  assert.equal(plan.authorizesExecution, false);
  assert.deepEqual(plan.selections[0]?.selectedBindingIds, ['binding:file-read-device']);
  assert.equal('agentId' in plan, false);
  assert.equal('providerId' in plan, false);
  assert.equal('deviceId' in plan, false);
});

test('W04-B DEVICE binding stays target-neutral without Android runtime identity', () => {
  const descriptor = capability({
    capabilityId: 'app.open',
    name: 'Open application',
    description: 'Vocabulary only; native execution belongs to W15.',
    supportedTargetKinds: ['DEVICE'],
    compatibilityKeys: ['application.open.v1'],
    bindings: [
      {
        bindingId: 'binding:application-open',
        targetKind: 'DEVICE',
        compatibilityKey: 'application.open.v1',
        availability: {
          state: 'AVAILABLE',
          observedAt: '2026-09-01T08:00:00.000Z',
          maxAgeMs: 600_000,
          source: 'device-capability-advertisement',
        },
      },
    ],
  });
  const [binding] = descriptor.bindings;
  if (binding === undefined) throw new Error('device binding fixture is required');
  assert.equal(binding.targetKind, 'DEVICE');
  assert.equal('deviceId' in binding, false);
  assert.equal('androidPackage' in binding, false);
  assert.equal('session' in binding, false);
});

test('W04-B fails closed when tenant-scoped capability belongs to another tenant', () => {
  const created = createCapabilityRegistry('w04-b.1', [capability({ tenantId: otherTenant })]);
  assert.equal(created.status, 'CREATED');
  if (created.status !== 'CREATED') return;

  const plan = planCapabilities(created.registry, {
    tenantId: tenant,
    correlationId: correlation,
    registryVersion: 'w04-b.1',
    nowEpochMs: now,
    requirements: [{ requirementId: 'read-input', capabilityId: 'file.read' }],
  });
  assert.equal(plan.status, 'BLOCKED');
  assert.equal(plan.selections[0]?.reason, 'TENANT_MISMATCH');
});

test('W04-B validates explicit ACCEPT, REJECT, RENAME and DECOMPOSE seed decisions', () => {
  assert.deepEqual(
    validateSeedAdjudication({
      adjudicationId: 'adj:file.read',
      seedId: 'file.read',
      sourceRef: 'legacy:file.read',
      decision: 'ACCEPT',
      resultingCapabilityIds: ['file.read'],
      reason: 'Specific target-neutral vocabulary.',
    }),
    { status: 'VALID' },
  );
  assert.deepEqual(
    validateSeedAdjudication({
      adjudicationId: 'adj:external.service.invoke',
      seedId: 'external.service.invoke',
      sourceRef: 'legacy:external.service.invoke',
      decision: 'REJECT',
      resultingCapabilityIds: [],
      reason: 'Too generic; require explicit capabilities.',
    }),
    { status: 'VALID' },
  );
  assert.deepEqual(
    validateSeedAdjudication({
      adjudicationId: 'adj:old-name',
      seedId: 'old-name',
      sourceRef: 'legacy:old-name',
      decision: 'RENAME',
      resultingCapabilityIds: ['new-name'],
      reason: 'Canonical naming correction.',
    }),
    { status: 'VALID' },
  );
  assert.deepEqual(
    validateSeedAdjudication({
      adjudicationId: 'adj:browser.scroll',
      seedId: 'browser.scroll',
      sourceRef: 'legacy:browser.scroll',
      decision: 'DECOMPOSE',
      resultingCapabilityIds: ['browser.scroll.up', 'browser.scroll.down'],
      reason: 'Direction changes behavior and evidence.',
    }),
    { status: 'VALID' },
  );
});
