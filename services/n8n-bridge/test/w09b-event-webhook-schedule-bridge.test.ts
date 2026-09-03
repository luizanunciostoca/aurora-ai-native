// @ts-expect-error -- W09 harness intentionally has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- W09 harness intentionally has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { N8nWorkflowBinding } from '../src/bindings/types.js';
import { N8nTriggerBridge, type N8nTriggerEnvelope } from '../src/triggers/bridge.js';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;

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
    credentialRequirements: [],
    compatibility: {
      contractVersion: '1.0.0',
      requiredTargetClasses: ['WORKFLOW_BRIDGE'],
      integrationPrerequisites: ['W03_DURABILITY', 'W07_EXECUTOR_BOUNDARY'],
    },
    status: 'ACTIVE',
    registeredAt: '2026-09-03T07:40:00.000Z',
    supersedesVersion: null,
    authorizesExecution: false,
    canGrantPermission: false,
    ...overrides,
  };
}

function trigger(overrides: Partial<N8nTriggerEnvelope> = {}): N8nTriggerEnvelope {
  return {
    kind: 'N8N_TRIGGER_ENVELOPE',
    triggerKind: 'EVENT',
    tenantId: 'ten_01JW09TENANTA00000000000',
    bindingId: 'w09.workflow.lead-enrichment',
    bindingVersion: '1.0.0',
    triggerId: 'evt-001',
    sourceStream: 'crm.leads',
    correlationId: 'cor-w09b-001',
    causationId: 'cause-w09a-001',
    idempotencyKey: 'idem-w09b-001',
    sequence: 10,
    observedAt: '2026-09-03T11:00:00.000Z',
    scheduledFor: null,
    payloadHash: HASH_A,
    provenanceReference: 'evidence:w09b:event:001',
    ...overrides,
  };
}

test('W09-B accepts an event and emits only a governed W07 execution request', () => {
  const bridge = new N8nTriggerBridge();
  const result = bridge.ingest(binding(), trigger());

  assert.equal(result.status, 'ACCEPTED');
  if (result.status !== 'ACCEPTED') return;

  assert.equal(result.request.executionBoundary, 'W07_EXECUTOR_REQUIRED');
  assert.equal(result.request.requiresW07Execution, true);
  assert.equal(result.request.directSideEffect, false);
  assert.equal(result.request.authorizesExecution, false);
  assert.equal(result.request.canGrantPermission, false);
  assert.equal(result.request.correlationId, 'cor-w09b-001');
  assert.equal(result.request.causationId, 'cause-w09a-001');
  assert.equal(result.request.workflowReference, 'n8n.workflow.742');
  assert.equal(result.request.capabilityId, 'crm.lead.read');
});

test('W09-B deduplicates an exact webhook replay without creating a second request identity', () => {
  const bridge = new N8nTriggerBridge();
  const webhook = trigger({ triggerKind: 'WEBHOOK', triggerId: 'hook-001', sequence: null });

  const first = bridge.ingest(binding(), webhook);
  const replay = bridge.ingest(binding(), webhook);

  assert.equal(first.status, 'ACCEPTED');
  assert.equal(replay.status, 'DUPLICATE');
  if (first.status !== 'ACCEPTED' || replay.status !== 'DUPLICATE') return;
  assert.equal(replay.request, first.request);
});

test('W09-B fails closed when an idempotency key is reused for different payload semantics', () => {
  const bridge = new N8nTriggerBridge();
  assert.equal(bridge.ingest(binding(), trigger()).status, 'ACCEPTED');

  assert.deepEqual(bridge.ingest(binding(), trigger({ payloadHash: HASH_B })), {
    status: 'BLOCKED',
    code: 'IDEMPOTENCY_CONFLICT',
  });
});

test('W09-B rejects stale or reordered stream sequences while allowing later work', () => {
  const bridge = new N8nTriggerBridge();
  assert.equal(bridge.ingest(binding(), trigger({ sequence: 10 })).status, 'ACCEPTED');

  assert.deepEqual(
    bridge.ingest(
      binding(),
      trigger({ triggerId: 'evt-009', idempotencyKey: 'idem-w09b-009', sequence: 9 }),
    ),
    { status: 'BLOCKED', code: 'STALE_OR_REORDERED_SEQUENCE' },
  );

  assert.equal(
    bridge.ingest(
      binding(),
      trigger({ triggerId: 'evt-011', idempotencyKey: 'idem-w09b-011', sequence: 11 }),
    ).status,
    'ACCEPTED',
  );
});

test('W09-B maps schedules to governed requests and never direct side effects', () => {
  const bridge = new N8nTriggerBridge();

  assert.deepEqual(
    bridge.ingest(
      binding(),
      trigger({
        triggerKind: 'SCHEDULE',
        triggerId: 'schedule-missing-time',
        idempotencyKey: 'idem-schedule-missing',
        sequence: null,
      }),
    ),
    { status: 'BLOCKED', code: 'SCHEDULE_TIME_REQUIRED' },
  );

  const scheduled = bridge.ingest(
    binding(),
    trigger({
      triggerKind: 'SCHEDULE',
      triggerId: 'schedule-001',
      idempotencyKey: 'idem-schedule-001',
      sequence: null,
      scheduledFor: '2026-09-04T12:00:00.000Z',
    }),
  );
  assert.equal(scheduled.status, 'ACCEPTED');
  if (scheduled.status !== 'ACCEPTED') return;
  assert.equal(scheduled.request.scheduledFor, '2026-09-04T12:00:00.000Z');
  assert.equal(scheduled.request.executionBoundary, 'W07_EXECUTOR_REQUIRED');
  assert.equal(scheduled.request.directSideEffect, false);
});

test('W09-B rejects cross-tenant, wrong-binding and inactive-binding ingress', () => {
  const bridge = new N8nTriggerBridge();

  assert.deepEqual(bridge.ingest(binding(), trigger({ tenantId: 'ten_other' })), {
    status: 'BLOCKED',
    code: 'CROSS_TENANT_BINDING',
  });
  assert.deepEqual(bridge.ingest(binding(), trigger({ bindingVersion: '2.0.0' })), {
    status: 'BLOCKED',
    code: 'WRONG_BINDING',
  });
  assert.deepEqual(bridge.ingest(binding({ status: 'DISABLED' }), trigger()), {
    status: 'BLOCKED',
    code: 'BINDING_NOT_ACTIVE',
  });
});

test('W09-B rejects invalid hashes and schedule timestamps on the boundary', () => {
  const bridge = new N8nTriggerBridge();
  assert.deepEqual(bridge.ingest(binding(), trigger({ payloadHash: 'not-a-hash' })), {
    status: 'BLOCKED',
    code: 'INVALID_HASH',
  });
  assert.deepEqual(
    bridge.ingest(
      binding(),
      trigger({
        triggerKind: 'SCHEDULE',
        sequence: null,
        scheduledFor: 'not-a-date',
      }),
    ),
    { status: 'BLOCKED', code: 'INVALID_TIMESTAMP' },
  );
});
