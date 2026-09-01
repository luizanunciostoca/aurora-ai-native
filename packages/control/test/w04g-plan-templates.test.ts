// @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides this built-in at runtime.
import assert from 'node:assert/strict';
// @ts-expect-error -- control harness intentionally has no package manifest/@types/node; Node 22 provides this built-in at runtime.
import test from 'node:test';
import type { CorrelationId, TenantId } from '../../contracts/src/ids/types.ts';
import type { CapabilityRegistrySnapshot } from '../../registries/src/capabilities/registry.ts';
import type { CapabilityPlan } from '../src/capability-plan/types.ts';
import {
  bindPlanTemplate,
  createPlanTemplate,
  type BindPlanTemplateResult,
  type CreatePlanTemplateInput,
  type CreatePlanTemplateResult,
  type PlanTemplate,
  type PlanTemplateBindingInput,
} from '../src/templates/index.ts';

const tenantId = 'ten_01J00000000000000000000000' as TenantId;
const otherTenantId = 'ten_01J00000000000000000000001' as TenantId;
const correlationId = 'cor_01J00000000000000000000000' as CorrelationId;
const otherCorrelationId = 'cor_01J00000000000000000000001' as CorrelationId;
const contentHash = `sha256:${'a'.repeat(64)}`;

function templateInput(overrides: Partial<CreatePlanTemplateInput> = {}): CreatePlanTemplateInput {
  return {
    templateId: 'template:publish-preview',
    semanticVersion: '1.0.0',
    contentHash,
    status: 'ACTIVE',
    match: {
      intentKind: 'PUBLISH_PREVIEW',
      taskKind: 'MARKETING_PREVIEW',
      inputContractVersion: '1.0.0',
    },
    requirementOrder: ['publish', 'evidence'],
    compatibility: {
      registryVersions: ['registry-2', 'registry-1'],
      requirements: [
        {
          requirementId: 'evidence',
          capabilityId: 'cap:evidence',
          allowedCapabilityVersions: ['2.0.0', '1.0.0'],
          requiredCompatibilityKeys: ['evidence:v1'],
        },
        {
          requirementId: 'publish',
          capabilityId: 'cap:publish',
          allowedCapabilityVersions: ['1.0.0'],
          requiredCompatibilityKeys: ['preview:v1', 'publish:v1'],
        },
      ],
    },
    invalidationConditions: [
      'REGISTRY_VERSION_MISMATCH',
      'EXPLICIT_REVOCATION',
      'CAPABILITY_VERSION_MISMATCH',
    ],
    provenance: {
      sourceKind: 'AURORA_CURATED',
      sourceRef: 'governance:w04-g/template-publish-preview',
      curatedBy: 'AURORA_PROGRAM_CONTROL',
      curatedAt: '2026-09-01T10:00:00.000Z',
    },
    ...overrides,
  };
}

function expectCreated(
  result: CreatePlanTemplateResult,
): Extract<CreatePlanTemplateResult, { readonly status: 'CREATED' }> {
  if (result.status !== 'CREATED') {
    throw new Error(`expected template creation, received ${result.code}`);
  }
  return result;
}

function expectBound(
  result: BindPlanTemplateResult,
): Extract<BindPlanTemplateResult, { readonly status: 'BOUND' }> {
  if (result.status !== 'BOUND') {
    throw new Error(`expected template binding, received ${result.code}`);
  }
  return result;
}

function createActiveTemplate(): PlanTemplate {
  return expectCreated(createPlanTemplate(templateInput())).template;
}

function registry(overrides: Partial<CapabilityRegistrySnapshot> = {}): CapabilityRegistrySnapshot {
  return {
    registryKind: 'AURORA_CANONICAL_CAPABILITY_REGISTRY',
    registryVersion: 'registry-1',
    entries: [
      {
        capabilityId: 'cap:publish',
        semanticVersion: '1.0.0',
        name: 'Publish preview',
        description: 'Target-neutral preview publication planning capability.',
        supportedTargetKinds: ['PROVIDER'],
        compatibilityKeys: ['publish:v1', 'preview:v1'],
        requiredPermissionClaims: [],
        preconditions: [],
        riskClass: 'LOW',
        sideEffectClass: 'EXTERNAL_SIDE_EFFECT',
        readbackStrategy: 'RECEIPT',
        evidenceStrategy: 'REQUIRED',
        availability: {
          state: 'AVAILABLE',
          observedAt: '2026-09-01T10:00:00.000Z',
          maxAgeMs: 60_000,
          source: 'test',
        },
        bindings: [],
        provenance: {
          sourceKind: 'AURORA_NATIVE',
          sourceRef: 'test:publish',
        },
      },
      {
        capabilityId: 'cap:evidence',
        semanticVersion: '2.0.0',
        name: 'Evidence capture',
        description: 'Target-neutral evidence capture planning capability.',
        supportedTargetKinds: ['LOCAL_SERVICE'],
        compatibilityKeys: ['evidence:v1'],
        requiredPermissionClaims: [],
        preconditions: [],
        riskClass: 'LOW',
        sideEffectClass: 'INTERNAL_STATE',
        readbackStrategy: 'STATE_COMPARE',
        evidenceStrategy: 'REQUIRED',
        availability: {
          state: 'AVAILABLE',
          observedAt: '2026-09-01T10:00:00.000Z',
          maxAgeMs: 60_000,
          source: 'test',
        },
        bindings: [],
        provenance: {
          sourceKind: 'AURORA_NATIVE',
          sourceRef: 'test:evidence',
        },
      },
    ],
    ...overrides,
  };
}

function capabilityPlan(overrides: Partial<CapabilityPlan> = {}): CapabilityPlan {
  return {
    planKind: 'TARGET_NEUTRAL_CAPABILITY_PLAN',
    tenantId,
    correlationId,
    registryVersion: 'registry-1',
    status: 'READY',
    selections: [
      {
        requirementId: 'publish',
        capabilityId: 'cap:publish',
        status: 'SELECTED',
        reason: 'SELECTED',
        currentAvailability: 'CURRENT_AVAILABLE',
        selectedBindingIds: ['binding:z', 'binding:a'],
      },
      {
        requirementId: 'evidence',
        capabilityId: 'cap:evidence',
        status: 'SELECTED',
        reason: 'SELECTED',
        currentAvailability: 'CURRENT_AVAILABLE',
        selectedBindingIds: ['binding:evidence'],
      },
    ],
    authorizesExecution: false,
    ...overrides,
  };
}

function bindingInput(overrides: Partial<PlanTemplateBindingInput> = {}): PlanTemplateBindingInput {
  return {
    tenantId,
    correlationId,
    expectedContentHash: contentHash,
    match: {
      intentKind: 'PUBLISH_PREVIEW',
      taskKind: 'MARKETING_PREVIEW',
      inputContractVersion: '1.0.0',
    },
    template: createActiveTemplate(),
    capabilityPlan: capabilityPlan(),
    registry: registry(),
    ...overrides,
  };
}

test('W04-G creates deterministic curated templates without authority or adaptive promotion', () => {
  const result = expectCreated(createPlanTemplate(templateInput()));
  assert.equal(result.status, 'CREATED');
  assert.equal(result.template.authorizesExecution, false);
  assert.equal(result.template.adaptivePromotion, false);
  assert.deepEqual(result.template.compatibility.registryVersions, ['registry-1', 'registry-2']);
  assert.deepEqual(
    result.template.compatibility.requirements.map((requirement) => requirement.requirementId),
    ['evidence', 'publish'],
  );
  assert.deepEqual(result.template.compatibility.requirements[1]?.requiredCompatibilityKeys, [
    'preview:v1',
    'publish:v1',
  ]);
  assert.deepEqual(result.template.invalidationConditions, [
    'CAPABILITY_VERSION_MISMATCH',
    'EXPLICIT_REVOCATION',
    'REGISTRY_VERSION_MISMATCH',
  ]);
});

test('W04-G rejects malformed, ambiguous, or inconsistent template metadata fail-closed', () => {
  assert.deepEqual(createPlanTemplate(templateInput({ contentHash: 'not-a-hash' })), {
    status: 'REJECTED',
    code: 'INVALID_CONTENT_HASH',
  });
  assert.deepEqual(createPlanTemplate(templateInput({ status: 'INVALIDATED' })), {
    status: 'REJECTED',
    code: 'INVALID_STATUS_METADATA',
  });
  assert.deepEqual(
    createPlanTemplate(
      templateInput({
        provenance: {
          sourceKind: 'AURORA_CURATED',
          sourceRef: '',
          curatedBy: 'AURORA_PROGRAM_CONTROL',
          curatedAt: '2026-09-01T10:00:00.000Z',
        },
      }),
    ),
    { status: 'REJECTED', code: 'INVALID_PROVENANCE' },
  );
  assert.deepEqual(
    createPlanTemplate(templateInput({ requirementOrder: ['publish', 'publish'] })),
    { status: 'REJECTED', code: 'INVALID_REQUIREMENT_ORDER' },
  );
});

test('W04-G binds a compatible READY plan deterministically and preserves current validation barriers', () => {
  const result = expectBound(bindPlanTemplate(bindingInput()));
  assert.equal(result.status, 'BOUND');
  assert.deepEqual(result.binding.requirementOrder, ['publish', 'evidence']);
  assert.deepEqual(result.binding.selections, [
    {
      requirementId: 'publish',
      capabilityId: 'cap:publish',
      capabilityVersion: '1.0.0',
      selectedBindingIds: ['binding:a', 'binding:z'],
    },
    {
      requirementId: 'evidence',
      capabilityId: 'cap:evidence',
      capabilityVersion: '2.0.0',
      selectedBindingIds: ['binding:evidence'],
    },
  ]);
  assert.deepEqual(result.binding.mandatoryValidations, [
    'CURRENT_CAPABILITY',
    'CURRENT_POLICY',
    'CURRENT_AUTHORITY',
    'EXECUTOR_PRECONDITIONS',
  ]);
  assert.equal(result.binding.authorizesExecution, false);
  assert.equal(result.binding.adaptivePromotion, false);
});

test('W04-G refuses invalidated, hash-stale, and input-contract-incompatible templates', () => {
  const active = createActiveTemplate();
  const invalidated = expectCreated(
    createPlanTemplate(
      templateInput({
        status: 'INVALIDATED',
        invalidationReason: 'explicit governance revocation',
      }),
    ),
  );

  assert.deepEqual(bindPlanTemplate(bindingInput({ template: invalidated.template })), {
    status: 'REJECTED',
    code: 'TEMPLATE_INVALIDATED',
  });
  assert.deepEqual(
    bindPlanTemplate(
      bindingInput({ template: active, expectedContentHash: `sha256:${'b'.repeat(64)}` }),
    ),
    {
      status: 'REJECTED',
      code: 'CONTENT_HASH_MISMATCH',
    },
  );
  assert.deepEqual(
    bindPlanTemplate(
      bindingInput({
        template: active,
        match: {
          intentKind: 'PUBLISH_PREVIEW',
          taskKind: 'MARKETING_PREVIEW',
          inputContractVersion: '2.0.0',
        },
      }),
    ),
    { status: 'REJECTED', code: 'MATCH_CRITERIA_MISMATCH' },
  );
});

test('W04-G rejects tenant, correlation, blocked-plan, and registry snapshot mismatches', () => {
  assert.deepEqual(bindPlanTemplate(bindingInput({ tenantId: otherTenantId })), {
    status: 'REJECTED',
    code: 'TENANT_MISMATCH',
  });
  assert.deepEqual(bindPlanTemplate(bindingInput({ correlationId: otherCorrelationId })), {
    status: 'REJECTED',
    code: 'CORRELATION_MISMATCH',
  });
  assert.deepEqual(
    bindPlanTemplate(bindingInput({ capabilityPlan: capabilityPlan({ status: 'BLOCKED' }) })),
    { status: 'REJECTED', code: 'CAPABILITY_PLAN_NOT_READY' },
  );
  assert.deepEqual(
    bindPlanTemplate(bindingInput({ registry: registry({ registryVersion: 'registry-other' }) })),
    { status: 'REJECTED', code: 'REGISTRY_SNAPSHOT_MISMATCH' },
  );
});

test('W04-G rejects incompatible capability identity, version, and compatibility keys', () => {
  const wrongCapability = capabilityPlan({
    selections: capabilityPlan().selections.map((selection) =>
      selection.requirementId === 'publish'
        ? { ...selection, capabilityId: 'cap:other' }
        : selection,
    ),
  });
  assert.deepEqual(bindPlanTemplate(bindingInput({ capabilityPlan: wrongCapability })), {
    status: 'REJECTED',
    code: 'CAPABILITY_MISMATCH',
    requirementId: 'publish',
    capabilityId: 'cap:other',
  });

  const wrongVersion = registry({
    entries: registry().entries.map((entry) =>
      entry.capabilityId === 'cap:publish' ? { ...entry, semanticVersion: '9.0.0' } : entry,
    ),
  });
  assert.deepEqual(bindPlanTemplate(bindingInput({ registry: wrongVersion })), {
    status: 'REJECTED',
    code: 'CAPABILITY_VERSION_INCOMPATIBLE',
    requirementId: 'publish',
    capabilityId: 'cap:publish',
  });

  const missingCompatibility = registry({
    entries: registry().entries.map((entry) =>
      entry.capabilityId === 'cap:publish'
        ? { ...entry, compatibilityKeys: ['publish:v1'] }
        : entry,
    ),
  });
  assert.deepEqual(bindPlanTemplate(bindingInput({ registry: missingCompatibility })), {
    status: 'REJECTED',
    code: 'COMPATIBILITY_KEY_MISSING',
    requirementId: 'publish',
    capabilityId: 'cap:publish',
    compatibilityKey: 'preview:v1',
  });
});
