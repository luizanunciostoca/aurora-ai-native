// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type {
  CorrelationContext,
  Rfc3339Timestamp,
  TenantContext,
} from '@aurora/contracts/context';
import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';
import type { JurisdictionContext } from '@aurora/contracts/jurisdiction';
import type { PurposeContext } from '@aurora/contracts/purpose';
import type { ContractVersion } from '@aurora/contracts/versioning';

import type { MemoryBoundaryKind, MemorySourceOwner } from '../src/memory-boundaries/index.js';
import {
  captureMemoryObservation,
  createDurableMemoryFabricRepository,
  MEMORY_CAPTURE_MAX_CONTENT_UNITS,
  openMemoryFabricSession,
} from '../src/memory-fabric/index.js';
import type {
  MemoryCaptureRequest,
  MemoryFabricDurableStateAddress,
  MemoryFabricDurableStateRecord,
  MemoryFabricDurableStateStorePort,
  MemoryFabricDurableStateWriteResult,
  MemoryFabricJsonValue,
} from '../src/memory-fabric/index.js';
import type { ContextSourceReadRequest } from '../src/sources/types.js';

const version = '1.0.0' as ContractVersion;
const tenant: TenantContext = { tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId };
const otherTenant: TenantContext = { tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAW' as TenantId };
const correlation: CorrelationContext = { correlationId: 'corr:memory:capture:1' as CorrelationId };
const subject = { kind: 'IDENTITY', identityId: 'identity:capture-subject' as IdentityId } as const;
const at = (value: string) => value as Rfc3339Timestamp;

const purpose: PurposeContext = {
  kind: 'PurposeContext',
  purposeId: 'assistant.memory-capture',
  version,
  status: 'ACTIVE',
  allowedDataClassifications: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL'],
};
const jurisdiction: JurisdictionContext = {
  kind: 'JurisdictionContext',
  jurisdiction: 'BR',
  version,
};

const ownerByBoundary: Readonly<Record<MemoryBoundaryKind, MemorySourceOwner>> = {
  WORKING: 'TASK_RUNTIME',
  EPISODIC: 'EVENT_HISTORY',
  SEMANTIC: 'SEMANTIC_KNOWLEDGE',
  COMPANY: 'COMPANY_KNOWLEDGE',
  USER: 'USER_PROFILE',
  TEMPORAL: 'TEMPORAL_FACT_SOURCE',
  OPERATIONAL: 'OPERATIONAL_STATE_SOURCE',
  EVIDENCE: 'EVIDENCE_SOURCE',
};

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

class InMemoryDurableStore implements MemoryFabricDurableStateStorePort {
  private record: MemoryFabricDurableStateRecord | null = null;

  async load(
    address: MemoryFabricDurableStateAddress,
  ): Promise<MemoryFabricDurableStateRecord | null> {
    if (!this.record) return null;
    if (
      this.record.tenantId !== address.tenantId ||
      this.record.namespace !== address.namespace ||
      this.record.stateKey !== address.stateKey
    ) {
      return null;
    }
    return cloneJson(this.record);
  }

  async compareAndSwap(request: {
    readonly tenantId: string;
    readonly namespace: string;
    readonly stateKey: string;
    readonly expectedRevision: number;
    readonly payload: MemoryFabricJsonValue;
  }): Promise<MemoryFabricDurableStateWriteResult> {
    const currentRevision = this.record?.revision ?? 0;
    if (request.expectedRevision !== currentRevision) {
      return {
        status: 'CONFLICT',
        currentRevision: this.record?.revision ?? null,
        authorizesExecution: false,
        retryAuthorized: false,
      };
    }

    const revision = currentRevision + 1;
    const now = `2026-09-15T03:20:0${revision}.000Z`;
    this.record = {
      tenantId: request.tenantId,
      namespace: request.namespace,
      stateKey: request.stateKey,
      revision,
      payload: cloneJson(request.payload),
      createdAt: this.record?.createdAt ?? now,
      updatedAt: now,
      authorizesExecution: false,
    };
    return {
      status: 'APPLIED',
      record: cloneJson(this.record),
      authorizesExecution: false,
      retryAuthorized: false,
    };
  }
}

function boundaryCandidate(
  boundary: MemoryBoundaryKind = 'SEMANTIC',
  candidateTenant: TenantContext = tenant,
): MemoryCaptureRequest['boundaryCandidate'] {
  return {
    boundary,
    tenant: candidateTenant,
    subject,
    classification: 'INTERNAL',
    sourceOwner: ownerByBoundary[boundary],
    sourceReference: `source:${boundary.toLowerCase()}:capture`,
    provenanceReference: `provenance:${boundary.toLowerCase()}:capture`,
    observedAt: at('2026-09-15T03:20:00Z'),
    ...(boundary === 'EPISODIC' || boundary === 'SEMANTIC' || boundary === 'USER'
      ? { retentionPolicyReference: 'retention:capture:1' }
      : {}),
    conflictState: 'NONE',
  };
}

function captureRequest(
  session: MemoryCaptureRequest['session'],
  reference: string,
  overrides: Partial<Omit<MemoryCaptureRequest, 'session' | 'captureReference'>> = {},
): MemoryCaptureRequest {
  return {
    session,
    captureReference: reference,
    memoryKey: 'project:aurora:shared-brain',
    boundaryCandidate: boundaryCandidate(),
    producer: {
      kind: 'MODEL',
      producerReference: 'agent:conversation-runtime',
      providerReference: 'provider:test',
      modelReference: 'model:test',
    },
    content: {
      kind: 'STRUCTURED',
      digest: `sha256:${reference}`,
      payload: { fact: reference },
    },
    maxDataClassification: 'CONFIDENTIAL',
    ...overrides,
  };
}

function sourceRequest(
  adapterId: string,
  sourceClass: ContextSourceReadRequest['selector']['sourceClass'],
): ContextSourceReadRequest {
  return {
    schemaVersion: version,
    tenant,
    correlation,
    actor: { kind: 'AGENT', identityId: 'identity:capture-agent' as IdentityId },
    subject,
    purpose,
    jurisdiction,
    maxDataClassification: 'CONFIDENTIAL',
    currentness: 'CURRENT_REQUIRED',
    selector: {
      adapterId,
      sourceClass,
      key: 'memoryKey',
      value: 'project:aurora:shared-brain',
    },
    limit: 8,
  };
}

test('W06-M captures model output as candidate, preserves provenance and remains idempotent', async () => {
  const repository = createDurableMemoryFabricRepository(new InMemoryDurableStore());
  const session = await openMemoryFabricSession({ tenant, repository });
  const request = captureRequest(session, 'capture:model:1');

  const first = captureMemoryObservation(request);
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  assert.equal(first.status, 'CAPTURED');
  assert.equal(first.record.lifecycle, 'CANDIDATE');
  assert.equal(first.record.producer.providerReference, 'provider:test');
  assert.equal(first.record.producer.modelReference, 'model:test');
  assert.equal(first.authorizesExecution, false);
  assert.equal(first.retryAuthorized, false);
  assert.equal(session.status().memoryRevision, 1);

  const adapter = session.sourceAdapter('SEMANTIC', 8);
  const hidden = await adapter.read(
    sourceRequest(adapter.descriptor.adapterId, adapter.descriptor.sourceClass),
  );
  assert.equal(hidden.items.length, 0, 'candidate model memory must remain hidden from context');

  const duplicate = captureMemoryObservation(request);
  assert.equal(duplicate.accepted, true);
  if (!duplicate.accepted) return;
  assert.equal(duplicate.status, 'DUPLICATE');
  assert.equal(session.status().memoryRevision, 1);
});

test('W06-M permits bounded WORKING capture only as transient session memory', async () => {
  const repository = createDurableMemoryFabricRepository(new InMemoryDurableStore());
  const session = await openMemoryFabricSession({ tenant, repository });
  const result = captureMemoryObservation(
    captureRequest(session, 'capture:working:1', {
      boundaryCandidate: boundaryCandidate('WORKING'),
      producer: {
        kind: 'USER',
        producerReference: 'identity:capture-subject',
      },
      content: {
        kind: 'TEXT',
        digest: 'sha256:working-1',
        payload: 'temporary conversational detail',
      },
    }),
  );

  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.record.lifecycle, 'TRANSIENT');
  const adapter = session.sourceAdapter('WORKING', 8);
  const visible = await adapter.read(
    sourceRequest(adapter.descriptor.adapterId, adapter.descriptor.sourceClass),
  );
  assert.equal(visible.items.length, 1);
});

test('W06-M requires explicit provider and model provenance for MODEL captures', async () => {
  const repository = createDurableMemoryFabricRepository(new InMemoryDurableStore());
  const session = await openMemoryFabricSession({ tenant, repository });
  const result = captureMemoryObservation(
    captureRequest(session, 'capture:model:missing-provenance', {
      producer: {
        kind: 'MODEL',
        producerReference: 'agent:conversation-runtime',
      },
    }),
  );

  assert.equal(result.accepted, false);
  if (result.accepted) return;
  assert.equal(result.reason, 'MODEL_PROVENANCE_REQUIRED');
  assert.equal(session.status().memoryRevision, 0);
});

test('W06-M rejects credential, authority and raw-audio material before staging', async () => {
  const repository = createDurableMemoryFabricRepository(new InMemoryDurableStore());
  const session = await openMemoryFabricSession({ tenant, repository });
  const payloads = [
    { policyToken: 'opaque-token' },
    { nested: { credentials: { password: 'do-not-store' } } },
    { rawAudio: 'binary-like-material' },
  ];

  payloads.forEach((payload, index) => {
    const result = captureMemoryObservation(
      captureRequest(session, `capture:forbidden:${index}`, {
        content: {
          kind: 'STRUCTURED',
          digest: `sha256:forbidden-${index}`,
          payload,
        },
      }),
    );
    assert.equal(result.accepted, false);
    if (!result.accepted) assert.equal(result.reason, 'FORBIDDEN_CONTENT');
  });
  assert.equal(session.status().memoryRevision, 0);
});

test('W06-M fails closed for cyclic/unsafe and over-limit payloads', async () => {
  const repository = createDurableMemoryFabricRepository(new InMemoryDurableStore());
  const session = await openMemoryFabricSession({ tenant, repository });
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;

  const unsafe = captureMemoryObservation(
    captureRequest(session, 'capture:unsafe:cycle', {
      content: {
        kind: 'STRUCTURED',
        digest: 'sha256:unsafe-cycle',
        payload: cyclic,
      },
    }),
  );
  assert.equal(unsafe.accepted, false);
  if (!unsafe.accepted) assert.equal(unsafe.reason, 'UNSAFE_CONTENT');

  const oversized = captureMemoryObservation(
    captureRequest(session, 'capture:unsafe:large', {
      content: {
        kind: 'TEXT',
        digest: 'sha256:unsafe-large',
        payload: 'x'.repeat(MEMORY_CAPTURE_MAX_CONTENT_UNITS + 1),
      },
    }),
  );
  assert.equal(oversized.accepted, false);
  if (!oversized.accepted) assert.equal(oversized.reason, 'CONTENT_LIMIT_EXCEEDED');
  assert.equal(session.status().memoryRevision, 0);
});

test('W06-M keeps OPERATIONAL/EVIDENCE and SOURCE_ADAPTER ingestion outside cognitive capture', async () => {
  const repository = createDurableMemoryFabricRepository(new InMemoryDurableStore());
  const session = await openMemoryFabricSession({ tenant, repository });

  for (const boundary of ['OPERATIONAL', 'EVIDENCE'] as const) {
    const result = captureMemoryObservation(
      captureRequest(session, `capture:source-owned:${boundary}`, {
        boundaryCandidate: boundaryCandidate(boundary),
        producer: {
          kind: 'SYSTEM',
          producerReference: 'system:test',
        },
      }),
    );
    assert.equal(result.accepted, false);
    if (!result.accepted) assert.equal(result.reason, 'SOURCE_OWNED_BOUNDARY_FORBIDDEN');
  }

  const sourceAdapter = captureMemoryObservation(
    captureRequest(session, 'capture:source-adapter', {
      producer: {
        kind: 'SOURCE_ADAPTER',
        producerReference: 'adapter:test',
      },
    }),
  );
  assert.equal(sourceAdapter.accepted, false);
  if (!sourceAdapter.accepted) {
    assert.equal(sourceAdapter.reason, 'SOURCE_ADAPTER_PRODUCER_FORBIDDEN');
  }
  assert.equal(session.status().memoryRevision, 0);
});

test('W06-M surfaces stage rejection evidence without widening authority', async () => {
  const repository = createDurableMemoryFabricRepository(new InMemoryDurableStore());
  const session = await openMemoryFabricSession({ tenant, repository });
  const result = captureMemoryObservation(
    captureRequest(session, 'capture:classification-rejected', {
      maxDataClassification: 'PUBLIC',
    }),
  );

  assert.equal(result.accepted, false);
  if (result.accepted) return;
  assert.equal(result.reason, 'STAGE_REJECTED');
  assert.deepEqual(result.stageReasons, ['CLASSIFICATION_EXCEEDED']);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.retryAuthorized, false);
});

test('W06-M fails closed for cross-tenant, closed and conflicted sessions', async () => {
  const store = new InMemoryDurableStore();
  const repository = createDurableMemoryFabricRepository(store);
  const first = await openMemoryFabricSession({ tenant, repository });
  const stale = await openMemoryFabricSession({ tenant, repository });

  const crossTenant = captureMemoryObservation(
    captureRequest(first, 'capture:cross-tenant', {
      boundaryCandidate: boundaryCandidate('SEMANTIC', otherTenant),
    }),
  );
  assert.equal(crossTenant.accepted, false);
  if (!crossTenant.accepted) assert.equal(crossTenant.reason, 'TENANT_MISMATCH');

  captureMemoryObservation(captureRequest(first, 'capture:first'));
  captureMemoryObservation(captureRequest(stale, 'capture:stale'));
  assert.equal((await first.checkpoint()).status, 'APPLIED');
  assert.equal((await stale.checkpoint()).status, 'CONFLICT');
  const conflicted = captureMemoryObservation(captureRequest(stale, 'capture:after-conflict'));
  assert.equal(conflicted.accepted, false);
  if (!conflicted.accepted) assert.equal(conflicted.reason, 'SESSION_NOT_OPEN');

  first.close();
  const closed = captureMemoryObservation(captureRequest(first, 'capture:after-close'));
  assert.equal(closed.accepted, false);
  if (!closed.accepted) assert.equal(closed.reason, 'SESSION_NOT_OPEN');
});
