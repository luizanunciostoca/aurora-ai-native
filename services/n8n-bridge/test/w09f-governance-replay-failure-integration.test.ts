// @ts-expect-error -- W09 harness intentionally has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- W09 harness intentionally has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import {
  N8nWorkflowBindingRegistry,
  type N8nWorkflowBinding,
} from '../src/bindings/index.js';
import {
  withResolvedN8nWorkflowCredential,
  type N8nWorkflowCredentialBackend,
  type N8nWorkflowCredentialReference,
} from '../src/credentials/index.js';
import {
  reconstructN8nWorkflowEvidenceChain,
} from '../src/evidence/index.js';
import {
  prepareW09CuratedMigration,
  type W09SanitizedWorkflowCandidate,
} from '../src/migration/index.js';
import {
  N8nTriggerBridge,
  type N8nTriggerEnvelope,
} from '../src/triggers/bridge.js';

const TENANT = 'ten_01JW09FTENANTA000000000';
const WORKFLOW_HASH_V1 = `sha256:${'a'.repeat(64)}`;
const WORKFLOW_HASH_V2 = `sha256:${'b'.repeat(64)}`;
const SOURCE_HASH = `sha256:${'c'.repeat(64)}`;
const PAYLOAD_HASH = `sha256:${'d'.repeat(64)}`;
const NOW = '2026-09-03T21:55:00.000Z';

function binding(overrides: Partial<N8nWorkflowBinding> = {}): N8nWorkflowBinding {
  return {
    kind: 'N8N_WORKFLOW_BINDING',
    bindingId: 'w09.workflow.acceptance-sync',
    bindingVersion: '1.0.0',
    tenantId: TENANT,
    workflow: {
      workflowReference: 'n8n.workflow.acceptance-sync',
      workflowVersion: '1',
      workflowHash: WORKFLOW_HASH_V1,
    },
    capability: {
      capabilityId: 'crm.lead.sync',
      capabilityVersion: '1.0.0',
      registryVersion: 'registry.w04.accepted',
    },
    provenance: {
      sourceKind: 'AURORA_NATIVE',
      sourceReference: 'aurora:w09f:acceptance-sync',
      sourceHash: SOURCE_HASH,
      licenseStatus: 'AURORA_OWNED',
      sanitizedLineage: null,
    },
    credentialRequirements: [
      { credentialReference: 'credref.w09f.crm', integration: 'crm' },
    ],
    compatibility: {
      contractVersion: '1.0.0',
      requiredTargetClasses: ['WORKFLOW_BRIDGE', 'PROVIDER'],
      integrationPrerequisites: ['W03_DURABILITY', 'W07_EXECUTOR_BOUNDARY'],
    },
    status: 'ACTIVE',
    registeredAt: '2026-09-03T21:00:00.000Z',
    supersedesVersion: null,
    authorizesExecution: false,
    canGrantPermission: false,
    ...overrides,
  };
}

function trigger(
  bindingValue: N8nWorkflowBinding,
  sequence: number,
  overrides: Partial<N8nTriggerEnvelope> = {},
): N8nTriggerEnvelope {
  return {
    kind: 'N8N_TRIGGER_ENVELOPE',
    triggerKind: 'WEBHOOK',
    tenantId: bindingValue.tenantId,
    bindingId: bindingValue.bindingId,
    bindingVersion: bindingValue.bindingVersion,
    triggerId: `trigger.w09f.${sequence}`,
    sourceStream: 'stream.w09f.acceptance',
    correlationId: `cor.w09f.${sequence}`,
    causationId: null,
    idempotencyKey: `key-${sequence}`,
    sequence,
    observedAt: `2026-09-03T21:${String(sequence % 60).padStart(2, '0')}:00.000Z`,
    scheduledFor: null,
    payloadHash: PAYLOAD_HASH,
    provenanceReference: 'evidence:w09f:synthetic-fixture',
    ...overrides,
  };
}

function provenance(): Record<string, unknown> {
  return {
    bindingSourceKind: 'AURORA_NATIVE',
    bindingSourceReference: 'aurora:w09f:acceptance-sync',
    bindingSourceHash: SOURCE_HASH,
    bindingLicenseStatus: 'AURORA_OWNED',
  };
}

function statusEvent(
  bindingValue: N8nWorkflowBinding,
  sequence: number,
  workflowState: 'STARTED' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'EXECUTION_UNCERTAIN',
): Record<string, unknown> {
  return {
    schemaVersion: '1.0.0',
    forwardingId: `fwd.w09f.${sequence}`,
    sequence,
    tenantId: bindingValue.tenantId,
    bindingId: bindingValue.bindingId,
    bindingVersion: bindingValue.bindingVersion,
    workflowReference: bindingValue.workflow.workflowReference,
    workflowVersion: bindingValue.workflow.workflowVersion,
    workflowHash: bindingValue.workflow.workflowHash,
    workflowRunReference: 'n8n.run.w09f.acceptance',
    correlationId: 'cor.w09f.chain',
    causationId: sequence === 1 ? null : `fwd.w09f.${sequence - 1}`,
    occurredAt: `2026-09-03T21:${40 + sequence}:00.000Z`,
    provenance: provenance(),
    authorizesExecution: false,
    verifiedExternalState: false,
    canGrantRetry: false,
    kind: 'N8N_WORKFLOW_STATUS_FORWARDING',
    workflowState,
    safeOutputReferences: workflowState === 'COMPLETED' ? ['artifact:w09f:result'] : [],
    errorReference:
      workflowState === 'FAILED' || workflowState === 'EXECUTION_UNCERTAIN'
        ? `evidence:w09f:${workflowState.toLowerCase()}`
        : null,
  };
}

function w07Event(
  bindingValue: N8nWorkflowBinding,
  sequence: number,
  state: 'ACKNOWLEDGED' | 'READBACK_MATCH' | 'READBACK_MISMATCH' | 'READBACK_UNKNOWN' | 'EXECUTION_UNCERTAIN',
): Record<string, unknown> {
  return {
    schemaVersion: '1.0.0',
    forwardingId: `fwd.w09f.${sequence}`,
    sequence,
    tenantId: bindingValue.tenantId,
    bindingId: bindingValue.bindingId,
    bindingVersion: bindingValue.bindingVersion,
    workflowReference: bindingValue.workflow.workflowReference,
    workflowVersion: bindingValue.workflow.workflowVersion,
    workflowHash: bindingValue.workflow.workflowHash,
    workflowRunReference: 'n8n.run.w09f.acceptance',
    correlationId: 'cor.w09f.chain',
    causationId: sequence === 1 ? null : `fwd.w09f.${sequence - 1}`,
    occurredAt: `2026-09-03T21:${40 + sequence}:00.000Z`,
    provenance: provenance(),
    authorizesExecution: false,
    verifiedExternalState: false,
    canGrantRetry: false,
    kind: 'N8N_W07_EVIDENCE_REFERENCE_FORWARDING',
    w07State: state,
    receiptReference: 'receipt:w07:w09f',
    evidenceReference:
      state === 'ACKNOWLEDGED' ? null : `evidence:w07:${state.toLowerCase()}`,
  };
}

function credentialReference(bindingValue: N8nWorkflowBinding): N8nWorkflowCredentialReference {
  return {
    kind: 'N8N_WORKFLOW_CREDENTIAL_REFERENCE',
    schemaVersion: '1.0.0',
    credentialReference: 'credref.w09f.crm',
    tenantId: bindingValue.tenantId,
    bindingId: bindingValue.bindingId,
    bindingVersion: bindingValue.bindingVersion,
    workflowReference: bindingValue.workflow.workflowReference,
    workflowVersion: bindingValue.workflow.workflowVersion,
    workflowHash: bindingValue.workflow.workflowHash,
    integration: 'crm',
    provider: 'crm-provider',
    state: 'ACTIVE',
    credentialVersion: 1,
    updatedAt: '2026-09-03T21:30:00.000Z',
    expiresAt: '2026-09-03T22:30:00.000Z',
    authorizesExecution: false,
    canGrantPermission: false,
  };
}

function migrationCandidate(
  overrides: Partial<W09SanitizedWorkflowCandidate> = {},
): W09SanitizedWorkflowCandidate {
  return {
    candidateId: 'w09f.candidate.acceptance-sync',
    tenantId: TENANT,
    capabilityId: 'crm.lead.sync',
    domain: 'CRM',
    sourceReference: 'sanitized-corpus:w09f:acceptance-sync',
    sourceHash: SOURCE_HASH,
    sanitizerVersion: '1.0.0',
    licenseStatus: 'REFERENCE_ONLY',
    topology: [
      { nodeReference: 'trigger:1', kind: 'WEBHOOK_TRIGGER' },
      { nodeReference: 'request:1', kind: 'AURORA_ACTION_REQUEST' },
    ],
    sideEffecting: true,
    validStructure: true,
    duplicateOfCandidateId: null,
    containsSensitiveMaterial: false,
    containsPrivateStaticIdentifier: false,
    verbatimReuseRequested: false,
    ...overrides,
  };
}

test('W09-F composes current binding, trigger and migration owners without minting authority', () => {
  const registry = new N8nWorkflowBindingRegistry();
  const first = binding();
  assert.equal(registry.register(first).ok, true);

  const second = binding({
    bindingVersion: '2.0.0',
    workflow: {
      ...first.workflow,
      workflowVersion: '2',
      workflowHash: WORKFLOW_HASH_V2,
    },
    registeredAt: '2026-09-03T21:01:00.000Z',
    supersedesVersion: '1.0.0',
  });
  assert.equal(registry.register(second).ok, true);
  assert.deepEqual(
    registry.resolve({
      tenantId: first.tenantId,
      bindingId: first.bindingId,
      bindingVersion: first.bindingVersion,
    }),
    { ok: false, error: 'SUPERSEDED_BINDING' },
  );

  const current = registry.resolve({
    tenantId: second.tenantId,
    bindingId: second.bindingId,
    bindingVersion: second.bindingVersion,
    expectedWorkflowHash: WORKFLOW_HASH_V2,
  });
  assert.equal(current.ok, true);
  if (!current.ok) return;

  const bridge = new N8nTriggerBridge();
  const accepted = bridge.ingest(current.value, trigger(current.value, 1));
  assert.equal(accepted.status, 'ACCEPTED');
  if (accepted.status !== 'ACCEPTED') return;
  assert.equal(accepted.request.executionBoundary, 'W07_EXECUTOR_REQUIRED');
  assert.equal(accepted.request.directSideEffect, false);
  assert.equal(accepted.request.authorizesExecution, false);
  assert.equal(accepted.request.canGrantPermission, false);

  const migration = prepareW09CuratedMigration(migrationCandidate());
  assert.equal(migration.status, 'READY');
  if (migration.status !== 'READY') return;
  assert.equal(migration.plan.maxProviderMutationAttempts, 1);
  assert.equal(migration.plan.retryBoundary, 'W07_RECONCILE_BEFORE_RETRY');
  assert.equal(migration.plan.authorizesExecution, false);
  assert.equal(migration.plan.canGrantPermission, false);
});

test('W09-F preserves replay and ordering fences under bounded trigger load', () => {
  const bindingValue = binding();
  const bridge = new N8nTriggerBridge();
  const acceptedRequests = [];

  for (let sequence = 1; sequence <= 128; sequence += 1) {
    const input = trigger(bindingValue, sequence);
    const first = bridge.ingest(bindingValue, input);
    assert.equal(first.status, 'ACCEPTED');
    if (first.status === 'ACCEPTED') {
      acceptedRequests.push(first.request);
      assert.equal(first.request.directSideEffect, false);
      assert.equal(first.request.authorizesExecution, false);
    }

    const replay = bridge.ingest(bindingValue, { ...input });
    assert.equal(replay.status, 'DUPLICATE');
    if (replay.status === 'DUPLICATE') {
      assert.equal(replay.request.requestReference, first.status === 'ACCEPTED' ? first.request.requestReference : '');
    }
  }

  assert.equal(acceptedRequests.length, 128);
  assert.deepEqual(
    bridge.ingest(bindingValue, trigger(bindingValue, 129, { sequence: 64 })),
    { status: 'BLOCKED', code: 'STALE_OR_REORDERED_SEQUENCE' },
  );
  const conflict = trigger(bindingValue, 130, {
    idempotencyKey: 'key-128',
    payloadHash: `sha256:${'e'.repeat(64)}`,
  });
  assert.deepEqual(bridge.ingest(bindingValue, conflict), {
    status: 'BLOCKED',
    code: 'IDEMPOTENCY_CONFLICT',
  });
});

test('W09-F fails closed on credential-owner outage without leaking or granting authority', async () => {
  const bindingValue = binding();
  let backendCalls = 0;
  const backend: N8nWorkflowCredentialBackend = {
    async withCredential() {
      backendCalls += 1;
      throw new Error('synthetic provider outage');
    },
  };

  const result = await withResolvedN8nWorkflowCredential(
    {
      tenantId: bindingValue.tenantId,
      binding: bindingValue,
      credentialReference: credentialReference(bindingValue),
      expectedIntegration: 'crm',
      expectedProvider: 'crm-provider',
      now: NOW,
    },
    backend,
    () => {
      throw new Error('consumer must not run');
    },
  );

  assert.equal(backendCalls, 1);
  assert.deepEqual(result, {
    ok: false,
    error: 'CREDENTIAL_UNAVAILABLE',
    authorizesExecution: false,
    canGrantPermission: false,
  });
  assert.equal(JSON.stringify(result).includes('synthetic provider outage'), false);
});

test('W09-F preserves cancellation and execution uncertainty through late W07 evidence', () => {
  const bindingValue = binding();
  const cancelled = reconstructN8nWorkflowEvidenceChain(bindingValue, [
    statusEvent(bindingValue, 1, 'STARTED'),
    statusEvent(bindingValue, 2, 'CANCELLED'),
    w07Event(bindingValue, 3, 'ACKNOWLEDGED'),
  ]);
  assert.equal(cancelled.ok, true);
  if (cancelled.ok) {
    assert.equal(cancelled.chain.currentWorkflowState, 'CANCELLED');
    assert.equal(cancelled.chain.verifiedExternalState, false);
    assert.equal(cancelled.chain.canGrantRetry, false);
  }

  const uncertain = reconstructN8nWorkflowEvidenceChain(bindingValue, [
    statusEvent(bindingValue, 1, 'STARTED'),
    statusEvent(bindingValue, 2, 'EXECUTION_UNCERTAIN'),
    w07Event(bindingValue, 3, 'READBACK_MATCH'),
  ]);
  assert.equal(uncertain.ok, true);
  if (uncertain.ok) {
    assert.equal(uncertain.chain.currentWorkflowState, 'EXECUTION_UNCERTAIN');
    assert.equal(uncertain.chain.w07References[0]?.w07State, 'READBACK_MATCH');
    assert.equal(uncertain.chain.verifiedExternalState, false);
    assert.equal(uncertain.chain.canGrantRetry, false);
  }
});

test('W09-F keeps high-risk corpus patterns inactive and blocks direct-provider inheritance', () => {
  for (const kind of ['SHELL', 'SSH', 'EXECUTE_COMMAND'] as const) {
    const result = prepareW09CuratedMigration(
      migrationCandidate({ topology: [{ nodeReference: `risk:${kind}`, kind }] }),
    );
    assert.equal(result.status, 'REFERENCE_ONLY');
    assert.equal(result.classification.category, 'HIGH_RISK_INDEX_ONLY');
  }

  const providerWrite = prepareW09CuratedMigration(
    migrationCandidate({ topology: [{ nodeReference: 'write:1', kind: 'PROVIDER_DIRECT_WRITE' }] }),
  );
  assert.equal(providerWrite.status, 'REFERENCE_ONLY');
  assert.equal(providerWrite.classification.category, 'REFERENCE_ONLY_PROVIDER_PATTERN');
});
