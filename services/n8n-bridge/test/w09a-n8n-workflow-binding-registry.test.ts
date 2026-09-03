// @ts-expect-error -- W09 harness intentionally has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- W09 harness intentionally has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import {
  N8nWorkflowBindingRegistry,
  validateN8nWorkflowBinding,
  type N8nWorkflowBinding,
} from '../src/bindings/index.js';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const HASH_C = `sha256:${'c'.repeat(64)}`;

function binding(overrides: Partial<N8nWorkflowBinding> = {}): N8nWorkflowBinding {
  return {
    kind: 'N8N_WORKFLOW_BINDING',
    bindingId: 'w09.workflow.lead-enrichment',
    bindingVersion: '1.0.0',
    tenantId: 'ten_01JW09TENANTA00000000000',
    workflow: {
      workflowReference: 'n8n.workflow.742',
      workflowVersion: '3.0.0',
      workflowHash: HASH_A,
    },
    capability: {
      capabilityId: 'crm.lead.read',
      capabilityVersion: '2.1.0',
      registryVersion: 'registry.w04.r22',
    },
    provenance: {
      sourceKind: 'AURORA_NATIVE',
      sourceReference: 'aurora:w09:lead-enrichment',
      sourceHash: HASH_B,
      licenseStatus: 'AURORA_OWNED',
      sanitizedLineage: null,
    },
    credentialRequirements: [
      { credentialReference: 'credref.crm.primary', integration: 'crm' },
      { credentialReference: 'credref.n8n.bridge', integration: 'n8n' },
    ],
    compatibility: {
      contractVersion: '1.0.0',
      requiredTargetClasses: ['READ_ONLY_PROVIDER', 'WORKFLOW_BRIDGE'],
      integrationPrerequisites: ['W03_DURABILITY', 'W04_CAPABILITY', 'W07_EXECUTOR_BOUNDARY'],
    },
    status: 'ACTIVE',
    registeredAt: '2026-09-03T07:40:00.000Z',
    supersedesVersion: null,
    authorizesExecution: false,
    canGrantPermission: false,
    ...overrides,
  };
}

test('W09-A registers and resolves an immutable, non-authoritative binding deterministically', () => {
  const registry = new N8nWorkflowBindingRegistry();
  const result = registry.register(
    binding({
      credentialRequirements: [
        { credentialReference: 'credref.n8n.bridge', integration: 'n8n' },
        { credentialReference: 'credref.crm.primary', integration: 'crm' },
      ],
      compatibility: {
        contractVersion: '1.0.0',
        requiredTargetClasses: ['WORKFLOW_BRIDGE', 'READ_ONLY_PROVIDER'],
        integrationPrerequisites: ['W07_EXECUTOR_BOUNDARY', 'W03_DURABILITY', 'W04_CAPABILITY'],
      },
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.authorizesExecution, false);
  assert.equal(result.value.canGrantPermission, false);
  assert.equal(Object.isFrozen(result.value), true);
  assert.deepEqual(result.value.compatibility.requiredTargetClasses, [
    'READ_ONLY_PROVIDER',
    'WORKFLOW_BRIDGE',
  ]);
  assert.deepEqual(
    result.value.credentialRequirements.map((item) => item.integration),
    ['crm', 'n8n'],
  );

  const resolved = registry.resolve({
    tenantId: result.value.tenantId,
    bindingId: result.value.bindingId,
    bindingVersion: result.value.bindingVersion,
    expectedWorkflowReference: 'n8n.workflow.742',
    expectedWorkflowVersion: '3.0.0',
    expectedWorkflowHash: HASH_A,
    expectedCapabilityId: 'crm.lead.read',
    expectedCapabilityVersion: '2.1.0',
    expectedCapabilityRegistryVersion: 'registry.w04.r22',
    expectedContractVersion: '1.0.0',
  });
  assert.equal(resolved.ok, true);
});

test('W09-A rejects duplicate immutable binding versions', () => {
  const registry = new N8nWorkflowBindingRegistry();
  assert.equal(registry.register(binding()).ok, true);
  assert.deepEqual(registry.register(binding()), { ok: false, error: 'DUPLICATE_BINDING_VERSION' });
});

test('W09-A supersedes an exact current version without mutating historical topology', () => {
  const registry = new N8nWorkflowBindingRegistry();
  assert.equal(registry.register(binding()).ok, true);

  const next = binding({
    bindingVersion: '2.0.0',
    workflow: { ...binding().workflow, workflowVersion: '4.0.0', workflowHash: HASH_C },
    registeredAt: '2026-09-03T07:41:00.000Z',
    supersedesVersion: '1.0.0',
  });
  const registered = registry.register(next);
  assert.equal(registered.ok, true);
  assert.deepEqual(
    registry.resolve({
      tenantId: binding().tenantId,
      bindingId: binding().bindingId,
      bindingVersion: '1.0.0',
    }),
    { ok: false, error: 'SUPERSEDED_BINDING' },
  );
  assert.equal(
    registry.resolve({
      tenantId: next.tenantId,
      bindingId: next.bindingId,
      bindingVersion: '2.0.0',
      expectedWorkflowHash: HASH_C,
    }).ok,
    true,
  );

  const snapshot = registry.snapshot();
  assert.equal(snapshot.bindings[0]?.workflow.workflowHash, HASH_A);
  assert.equal(snapshot.bindings[0]?.status, 'SUPERSEDED');
  assert.equal(snapshot.bindings[1]?.workflow.workflowHash, HASH_C);
  assert.deepEqual(
    snapshot.lifecycle.map((event) => `${event.from ?? 'NONE'}>${event.to}`),
    ['NONE>ACTIVE', 'ACTIVE>SUPERSEDED', 'NONE>ACTIVE'],
  );
});

test('W09-A rejects an incorrect supersession target', () => {
  const registry = new N8nWorkflowBindingRegistry();
  assert.equal(registry.register(binding()).ok, true);
  assert.deepEqual(
    registry.register(
      binding({
        bindingVersion: '2.0.0',
        workflow: { ...binding().workflow, workflowHash: HASH_C },
        registeredAt: '2026-09-03T07:42:00.000Z',
        supersedesVersion: null,
      }),
    ),
    { ok: false, error: 'INVALID_SUPERSESSION' },
  );
});

test('W09-A fails closed for cross-tenant, unknown and stale binding lookups', () => {
  const registry = new N8nWorkflowBindingRegistry();
  assert.equal(registry.register(binding()).ok, true);
  assert.deepEqual(
    registry.resolve({
      tenantId: 'ten_01JW09TENANTB00000000000',
      bindingId: binding().bindingId,
      bindingVersion: '1.0.0',
    }),
    { ok: false, error: 'CROSS_TENANT_BINDING' },
  );
  assert.deepEqual(
    registry.resolve({
      tenantId: binding().tenantId,
      bindingId: 'w09.workflow.unknown',
      bindingVersion: '1.0.0',
    }),
    { ok: false, error: 'UNKNOWN_BINDING' },
  );
  assert.deepEqual(
    registry.resolve({
      tenantId: binding().tenantId,
      bindingId: binding().bindingId,
      bindingVersion: '0.9.0',
    }),
    { ok: false, error: 'STALE_BINDING' },
  );
});

test('W09-A enforces workflow, W04 capability and contract compatibility fences', () => {
  const registry = new N8nWorkflowBindingRegistry();
  assert.equal(registry.register(binding()).ok, true);
  const base = {
    tenantId: binding().tenantId,
    bindingId: binding().bindingId,
    bindingVersion: binding().bindingVersion,
  };
  assert.deepEqual(registry.resolve({ ...base, expectedWorkflowHash: HASH_C }), {
    ok: false,
    error: 'INCOMPATIBLE_WORKFLOW',
  });
  assert.deepEqual(registry.resolve({ ...base, expectedCapabilityId: 'crm.lead.write' }), {
    ok: false,
    error: 'INCOMPATIBLE_CAPABILITY',
  });
  assert.deepEqual(registry.resolve({ ...base, expectedContractVersion: '2.0.0' }), {
    ok: false,
    error: 'INCOMPATIBLE_CONTRACT',
  });
});

test('W09-A records sanitized corpus lineage without admitting raw sensitive workflow material', () => {
  const sanitized = binding({
    status: 'CANDIDATE',
    provenance: {
      sourceKind: 'SANITIZED_CORPUS',
      sourceReference: 'catalog:n8n:reference-1937',
      sourceHash: HASH_B,
      licenseStatus: 'REFERENCE_ONLY',
      sanitizedLineage: {
        corpusReference: 'n8n-salvage-2026-08-31',
        sourceEntryHash: HASH_C,
        sanitizerVersion: '1.0.0',
      },
    },
  });
  assert.equal(validateN8nWorkflowBinding(sanitized).ok, true);

  const unsafe = {
    ...sanitized,
    pinData: { node: ['private-payload'] },
    credentials: { apiKey: 'plaintext-value' },
  };
  assert.deepEqual(validateN8nWorkflowBinding(unsafe), {
    ok: false,
    error: 'SENSITIVE_MATERIAL_PROHIBITED',
  });
});

test('W09-A blocks reference-only or provenance-hold candidates from activation', () => {
  const registry = new N8nWorkflowBindingRegistry();
  const candidate = binding({
    status: 'CANDIDATE',
    provenance: { ...binding().provenance, licenseStatus: 'PROVENANCE_HOLD' },
  });
  assert.equal(registry.register(candidate).ok, true);
  assert.deepEqual(
    registry.activate(
      candidate.tenantId,
      candidate.bindingId,
      candidate.bindingVersion,
      '2026-09-03T07:43:00.000Z',
      null,
    ),
    { ok: false, error: 'INVALID_PROVENANCE' },
  );
});

test('W09-A exposes explicit disabled and revoked states and never resolves them as executable', () => {
  const disabledRegistry = new N8nWorkflowBindingRegistry();
  const disabled = binding();
  assert.equal(disabledRegistry.register(disabled).ok, true);
  assert.equal(
    disabledRegistry.disable(
      disabled.tenantId,
      disabled.bindingId,
      disabled.bindingVersion,
      '2026-09-03T07:44:00.000Z',
      'OPERATOR_DISABLE',
    ).ok,
    true,
  );
  assert.deepEqual(
    disabledRegistry.resolve({
      tenantId: disabled.tenantId,
      bindingId: disabled.bindingId,
      bindingVersion: disabled.bindingVersion,
    }),
    { ok: false, error: 'DISABLED_BINDING' },
  );

  const revokedRegistry = new N8nWorkflowBindingRegistry();
  const revoked = binding();
  assert.equal(revokedRegistry.register(revoked).ok, true);
  assert.equal(
    revokedRegistry.revoke(
      revoked.tenantId,
      revoked.bindingId,
      revoked.bindingVersion,
      '2026-09-03T07:45:00.000Z',
      'SECURITY_REVOKE',
    ).ok,
    true,
  );
  assert.deepEqual(
    revokedRegistry.resolve({
      tenantId: revoked.tenantId,
      bindingId: revoked.bindingId,
      bindingVersion: revoked.bindingVersion,
    }),
    { ok: false, error: 'REVOKED_BINDING' },
  );
});

test('W09-A candidate activation performs explicit expected-version supersession', () => {
  const registry = new N8nWorkflowBindingRegistry();
  const current = binding();
  assert.equal(registry.register(current).ok, true);
  const candidate = binding({
    bindingVersion: '2.0.0',
    status: 'CANDIDATE',
    workflow: { ...current.workflow, workflowHash: HASH_C },
    registeredAt: '2026-09-03T07:46:00.000Z',
    supersedesVersion: '1.0.0',
  });
  assert.equal(registry.register(candidate).ok, true);
  assert.deepEqual(
    registry.activate(
      candidate.tenantId,
      candidate.bindingId,
      candidate.bindingVersion,
      '2026-09-03T07:47:00.000Z',
      '0.9.0',
    ),
    { ok: false, error: 'INVALID_SUPERSESSION' },
  );
  const activated = registry.activate(
    candidate.tenantId,
    candidate.bindingId,
    candidate.bindingVersion,
    '2026-09-03T07:47:00.000Z',
    '1.0.0',
  );
  assert.equal(activated.ok, true);
  if (!activated.ok) return;
  assert.equal(activated.value.status, 'ACTIVE');
  assert.equal(activated.value.authorizesExecution, false);
  assert.equal(activated.value.canGrantPermission, false);
});

test('W09-A registry snapshots are stable and tenant scoped', () => {
  const registry = new N8nWorkflowBindingRegistry();
  const tenantB = binding({
    tenantId: 'ten_01JW09TENANTB00000000000',
    bindingId: 'w09.workflow.zeta',
  });
  const tenantA = binding({ bindingId: 'w09.workflow.alpha' });
  assert.equal(registry.register(tenantB).ok, true);
  assert.equal(registry.register(tenantA).ok, true);
  const first = registry.snapshot();
  const second = registry.snapshot();
  assert.deepEqual(first, second);
  assert.equal(first.authorizesExecution, false);
  assert.equal(first.canGrantPermission, false);
  assert.deepEqual(
    first.bindings.map((item) => `${item.tenantId}:${item.bindingId}`),
    [`${tenantA.tenantId}:${tenantA.bindingId}`, `${tenantB.tenantId}:${tenantB.bindingId}`],
  );
});
