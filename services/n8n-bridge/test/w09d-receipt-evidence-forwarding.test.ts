// @ts-expect-error -- W09 harness intentionally has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- W09 harness intentionally has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { N8nWorkflowBinding } from '../src/bindings/index.js';
import {
  normalizeN8nWorkflowForwarding,
  reconstructN8nWorkflowEvidenceChain,
} from '../src/evidence/index.js';

const TENANT_A = 'ten_01JW09DTENANTA000000000';
const TENANT_B = 'ten_01JW09DTENANTB000000000';
const WORKFLOW_HASH = `sha256:${'a'.repeat(64)}`;
const SOURCE_HASH = `sha256:${'b'.repeat(64)}`;
const REGISTERED_AT = '2026-09-03T08:30:00.000Z';

function binding(overrides: Partial<N8nWorkflowBinding> = {}): N8nWorkflowBinding {
  return {
    kind: 'N8N_WORKFLOW_BINDING',
    bindingId: 'w09.workflow.lead-sync',
    bindingVersion: '1.0.0',
    tenantId: TENANT_A,
    workflow: {
      workflowReference: 'n8n.workflow.lead-sync',
      workflowVersion: '41',
      workflowHash: WORKFLOW_HASH,
    },
    capability: {
      capabilityId: 'crm.lead.read',
      capabilityVersion: '2.1.0',
      registryVersion: 'registry.w04.r22',
    },
    provenance: {
      sourceKind: 'AURORA_NATIVE',
      sourceReference: 'aurora:w09:lead-sync',
      sourceHash: SOURCE_HASH,
      licenseStatus: 'AURORA_OWNED',
      sanitizedLineage: null,
    },
    credentialRequirements: [],
    compatibility: {
      contractVersion: '1.0.0',
      requiredTargetClasses: ['WORKFLOW'],
      integrationPrerequisites: [],
    },
    status: 'ACTIVE',
    registeredAt: REGISTERED_AT,
    supersedesVersion: null,
    authorizesExecution: false,
    canGrantPermission: false,
    ...overrides,
  };
}

function provenance(): Record<string, unknown> {
  return {
    bindingSourceKind: 'AURORA_NATIVE',
    bindingSourceReference: 'aurora:w09:lead-sync',
    bindingSourceHash: SOURCE_HASH,
    bindingLicenseStatus: 'AURORA_OWNED',
  };
}

function base(sequence: number): Record<string, unknown> {
  return {
    schemaVersion: '1.0.0',
    forwardingId: `fwd.w09d.${sequence}`,
    sequence,
    tenantId: TENANT_A,
    bindingId: 'w09.workflow.lead-sync',
    bindingVersion: '1.0.0',
    workflowReference: 'n8n.workflow.lead-sync',
    workflowVersion: '41',
    workflowHash: WORKFLOW_HASH,
    workflowRunReference: 'n8n.run.20260903.001',
    correlationId: 'cor.w09d.001',
    causationId: sequence === 1 ? null : `fwd.w09d.${sequence - 1}`,
    occurredAt: `2026-09-03T08:3${sequence}:00.000Z`,
    provenance: provenance(),
    authorizesExecution: false,
    verifiedExternalState: false,
    canGrantRetry: false,
  };
}

function statusEvent(
  sequence: number,
  workflowState: 'STARTED' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'EXECUTION_UNCERTAIN',
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  let safeOutputReferences: readonly string[] = [];
  let errorReference: string | null = null;
  if (workflowState === 'COMPLETED') safeOutputReferences = ['artifact:w09d:output:001'];
  if (workflowState === 'FAILED') errorReference = 'evidence:w09d:failure:001';
  if (workflowState === 'EXECUTION_UNCERTAIN') errorReference = 'evidence:w09d:uncertain:001';
  return {
    ...base(sequence),
    kind: 'N8N_WORKFLOW_STATUS_FORWARDING',
    workflowState,
    safeOutputReferences,
    errorReference,
    ...overrides,
  };
}

function w07Event(
  sequence: number,
  w07State:
    | 'ACKNOWLEDGED'
    | 'READBACK_MATCH'
    | 'READBACK_MISMATCH'
    | 'READBACK_UNKNOWN'
    | 'EXECUTION_UNCERTAIN',
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...base(sequence),
    kind: 'N8N_W07_EVIDENCE_REFERENCE_FORWARDING',
    w07State,
    receiptReference: 'receipt:w07:001',
    evidenceReference: w07State === 'ACKNOWLEDGED' ? null : `evidence:w07:${w07State.toLowerCase()}`,
    ...overrides,
  };
}

function request(event: unknown, bindingValue: N8nWorkflowBinding = binding()): Record<string, unknown> {
  return { binding: bindingValue, event };
}

test('W09-D normalizes workflow status with exact binding provenance and no authority', () => {
  const result = normalizeN8nWorkflowForwarding(request(statusEvent(1, 'STARTED')));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.event.provenance, provenance());
  assert.equal(result.event.authorizesExecution, false);
  assert.equal(result.event.verifiedExternalState, false);
  assert.equal(result.event.canGrantRetry, false);
  assert.equal(Object.isFrozen(result.event), true);
});

test('W09-D preserves explicit completed, failed, cancelled and uncertain workflow outcomes', () => {
  for (const state of ['COMPLETED', 'FAILED', 'CANCELLED', 'EXECUTION_UNCERTAIN'] as const) {
    const result = normalizeN8nWorkflowForwarding(request(statusEvent(2, state)));
    assert.equal(result.ok, true, state);
    if (result.ok) {
      assert.equal(result.event.kind, 'N8N_WORKFLOW_STATUS_FORWARDING');
      if (result.event.kind === 'N8N_WORKFLOW_STATUS_FORWARDING') {
        assert.equal(result.event.workflowState, state);
      }
      assert.equal(result.verifiedExternalState, false);
      assert.equal(result.canGrantRetry, false);
    }
  }
});

test('W09-D keeps W07 acknowledgement and readback references non-authoritative', () => {
  const acknowledged = normalizeN8nWorkflowForwarding(request(w07Event(2, 'ACKNOWLEDGED')));
  const readbackMatch = normalizeN8nWorkflowForwarding(request(w07Event(2, 'READBACK_MATCH')));
  assert.equal(acknowledged.ok, true);
  assert.equal(readbackMatch.ok, true);
  if (readbackMatch.ok) {
    assert.equal(readbackMatch.event.kind, 'N8N_W07_EVIDENCE_REFERENCE_FORWARDING');
    assert.equal(readbackMatch.verifiedExternalState, false);
    assert.equal(readbackMatch.authorizesExecution, false);
    assert.equal(readbackMatch.canGrantRetry, false);
  }
});

test('W09-D rejects acknowledgement/evidence ambiguity and readback without evidence', () => {
  const acknowledgementConflict = normalizeN8nWorkflowForwarding(
    request(w07Event(2, 'ACKNOWLEDGED', { evidenceReference: 'evidence:w07:unexpected' })),
  );
  const missingReadbackEvidence = normalizeN8nWorkflowForwarding(
    request(w07Event(2, 'READBACK_MISMATCH', { evidenceReference: null })),
  );
  assert.deepEqual(acknowledgementConflict, {
    ok: false,
    error: 'ACKNOWLEDGEMENT_EVIDENCE_CONFLICT',
    authorizesExecution: false,
    verifiedExternalState: false,
    canGrantRetry: false,
  });
  assert.deepEqual(missingReadbackEvidence, {
    ok: false,
    error: 'READBACK_EVIDENCE_REQUIRED',
    authorizesExecution: false,
    verifiedExternalState: false,
    canGrantRetry: false,
  });
});

test('W09-D fails closed on tenant, binding, workflow and provenance drift', () => {
  const cases: readonly [Record<string, unknown>, string][] = [
    [statusEvent(1, 'STARTED', { tenantId: TENANT_B }), 'TENANT_MISMATCH'],
    [statusEvent(1, 'STARTED', { bindingVersion: '2.0.0' }), 'BINDING_MISMATCH'],
    [statusEvent(1, 'STARTED', { workflowVersion: '42' }), 'WORKFLOW_MISMATCH'],
    [
      statusEvent(1, 'STARTED', {
        provenance: { ...provenance(), bindingSourceHash: `sha256:${'c'.repeat(64)}` },
      }),
      'PROVENANCE_MISMATCH',
    ],
  ];
  for (const [event, expected] of cases) {
    const result = normalizeN8nWorkflowForwarding(request(event));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, expected);
  }
});

test('W09-D rejects secret/raw workflow material and never invokes accessors', () => {
  for (const event of [
    { ...statusEvent(1, 'STARTED'), rawOutput: { customer: 'private' } },
    { ...statusEvent(1, 'STARTED'), pinData: { authorization: 'private' } },
    { ...statusEvent(1, 'STARTED'), secretValue: 'must-not-enter-evidence' },
  ]) {
    const result = normalizeN8nWorkflowForwarding(request(event));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, 'SENSITIVE_MATERIAL_PROHIBITED');
  }

  let getterCalls = 0;
  const accessor = statusEvent(1, 'STARTED');
  Object.defineProperty(accessor, 'safeOutputReferences', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return [];
    },
  });
  const accessorResult = normalizeN8nWorkflowForwarding(request(accessor));
  assert.equal(accessorResult.ok, false);
  if (!accessorResult.ok) assert.equal(accessorResult.error, 'REQUEST_MALFORMED');
  assert.equal(getterCalls, 0);
});

test('W09-D exact duplicate replay is idempotent during evidence-chain reconstruction', () => {
  const started = statusEvent(1, 'STARTED');
  const acknowledged = w07Event(2, 'ACKNOWLEDGED');
  const completed = statusEvent(3, 'COMPLETED');
  const result = reconstructN8nWorkflowEvidenceChain(binding(), [
    started,
    acknowledged,
    { ...acknowledged },
    completed,
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.chain.events.length, 3);
  assert.equal(result.chain.lastSequence, 3);
  assert.equal(result.chain.currentWorkflowState, 'COMPLETED');
});

test('W09-D reconstructs out-of-order delivery deterministically from canonical sequence', () => {
  const result = reconstructN8nWorkflowEvidenceChain(binding(), [
    statusEvent(3, 'COMPLETED'),
    w07Event(2, 'ACKNOWLEDGED'),
    statusEvent(1, 'STARTED'),
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.chain.events.map((event) => event.sequence),
    [1, 2, 3],
  );
  assert.deepEqual(
    result.chain.events.map((event) => event.forwardingId),
    ['fwd.w09d.1', 'fwd.w09d.2', 'fwd.w09d.3'],
  );
});

test('W09-D rejects conflicting duplicate IDs and conflicting sequence ownership', () => {
  const duplicateConflict = reconstructN8nWorkflowEvidenceChain(binding(), [
    statusEvent(1, 'STARTED'),
    statusEvent(1, 'STARTED', { workflowRunReference: 'n8n.run.changed' }),
  ]);
  assert.equal(duplicateConflict.ok, false);
  if (!duplicateConflict.ok) assert.equal(duplicateConflict.error, 'DUPLICATE_EVENT_CONFLICT');

  const sequenceConflict = reconstructN8nWorkflowEvidenceChain(binding(), [
    statusEvent(1, 'STARTED'),
    w07Event(2, 'ACKNOWLEDGED'),
    w07Event(2, 'ACKNOWLEDGED', { forwardingId: 'fwd.w09d.competing' }),
  ]);
  assert.equal(sequenceConflict.ok, false);
  if (!sequenceConflict.ok) assert.equal(sequenceConflict.error, 'SEQUENCE_CONFLICT');
});

test('W09-D rejects sequence gaps instead of inventing missing evidence', () => {
  const result = reconstructN8nWorkflowEvidenceChain(binding(), [
    statusEvent(1, 'STARTED'),
    statusEvent(3, 'COMPLETED'),
  ]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, 'SEQUENCE_GAP');
});

test('W09-D requires one workflow-run/correlation/causation chain for reconstruction', () => {
  for (const event of [
    w07Event(2, 'ACKNOWLEDGED', { workflowRunReference: 'n8n.run.other' }),
    w07Event(2, 'ACKNOWLEDGED', { correlationId: 'cor.w09d.other' }),
    w07Event(2, 'ACKNOWLEDGED', { causationId: 'fwd.w09d.wrong-parent' }),
  ]) {
    const result = reconstructN8nWorkflowEvidenceChain(binding(), [statusEvent(1, 'STARTED'), event]);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, 'CHAIN_CONTEXT_MISMATCH');
  }
});

test('W09-D rejects workflow terminal-state regression', () => {
  const result = reconstructN8nWorkflowEvidenceChain(binding(), [
    statusEvent(1, 'STARTED'),
    statusEvent(2, 'COMPLETED'),
    statusEvent(3, 'FAILED'),
  ]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, 'WORKFLOW_STATE_REGRESSION');
});

test('W09-D preserves execution uncertainty through later W07 readback evidence without retry authority', () => {
  const result = reconstructN8nWorkflowEvidenceChain(binding(), [
    statusEvent(1, 'STARTED'),
    statusEvent(2, 'EXECUTION_UNCERTAIN'),
    w07Event(3, 'READBACK_MATCH'),
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.chain.currentWorkflowState, 'EXECUTION_UNCERTAIN');
  assert.equal(result.chain.w07References[0]?.w07State, 'READBACK_MATCH');
  assert.equal(result.chain.verifiedExternalState, false);
  assert.equal(result.chain.canGrantRetry, false);
});

test('W09-D late W07 receipt after cancellation cannot overwrite the canonical workflow outcome', () => {
  const result = reconstructN8nWorkflowEvidenceChain(binding(), [
    statusEvent(1, 'STARTED'),
    statusEvent(2, 'CANCELLED'),
    w07Event(3, 'ACKNOWLEDGED'),
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.chain.currentWorkflowState, 'CANCELLED');
  assert.equal(result.chain.verifiedExternalState, false);
  assert.equal(result.chain.canGrantRetry, false);
});

test('W09-D reconstruction requires an explicit STARTED status before receipts or terminal outcomes', () => {
  for (const events of [
    [statusEvent(1, 'COMPLETED')],
    [w07Event(1, 'ACKNOWLEDGED'), statusEvent(2, 'COMPLETED')],
  ]) {
    const result = reconstructN8nWorkflowEvidenceChain(binding(), events);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, 'WORKFLOW_STATE_REGRESSION');
  }
});
