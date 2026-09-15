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
  createDurableMemoryFabricRepository,
  createMemoryFabricSnapshot,
  openMemoryFabricSession,
  stageMemoryProposal,
  transitionMemoryProjection,
} from '../src/memory-fabric/index.js';
import type {
  MemoryFabricDurableStateAddress,
  MemoryFabricDurableStateRecord,
  MemoryFabricDurableStateStorePort,
  MemoryFabricDurableStateWriteResult,
  MemoryFabricJsonValue,
  MemoryFabricSnapshot,
  MemoryWriteProposal,
} from '../src/memory-fabric/index.js';
import type { ContextSourceReadRequest } from '../src/sources/types.js';

const version = '1.0.0' as ContractVersion;
const tenant: TenantContext = { tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId };
const otherTenant: TenantContext = { tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAW' as TenantId };
const correlation: CorrelationContext = { correlationId: 'corr:memory:session:1' as CorrelationId };
const at = (value: string) => value as Rfc3339Timestamp;

const purpose: PurposeContext = {
  kind: 'PurposeContext',
  purposeId: 'assistant.shared-memory-session',
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

function proposal(
  reference: string,
  boundary: MemoryBoundaryKind = 'SEMANTIC',
  digest = `sha256:${reference}`,
): MemoryWriteProposal {
  return {
    kind: 'MemoryWriteProposal',
    proposalReference: reference,
    memoryKey: 'project:aurora:session-memory',
    boundaryCandidate: {
      boundary,
      tenant,
      subject: { kind: 'IDENTITY', identityId: 'identity:session-subject' as IdentityId },
      classification: 'INTERNAL',
      sourceOwner: ownerByBoundary[boundary],
      sourceReference: `source:${boundary.toLowerCase()}:session`,
      provenanceReference: `provenance:${reference}`,
      observedAt: at('2026-09-15T03:00:00Z'),
      ...(boundary === 'EPISODIC' || boundary === 'SEMANTIC' || boundary === 'USER'
        ? { retentionPolicyReference: 'retention:session:1' }
        : {}),
      conflictState: 'NONE',
    },
    producer: {
      kind: 'MODEL',
      producerReference: 'agent:conversation-runtime',
      providerReference: 'provider:test',
      modelReference: 'model:test',
    },
    content: {
      kind: 'STRUCTURED',
      digest,
      payload: { fact: reference },
    },
  };
}

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
    if (this.record && JSON.stringify(this.record.payload) === JSON.stringify(request.payload)) {
      return {
        status: 'UNCHANGED',
        record: cloneJson(this.record),
        authorizesExecution: false,
        retryAuthorized: false,
      };
    }

    const revision = currentRevision + 1;
    const now = `2026-09-15T03:00:0${revision}.000Z`;
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

function sourceRequest(
  adapterId: string,
  sourceClass: ContextSourceReadRequest['selector']['sourceClass'],
  boundaryKey = 'project:aurora:session-memory',
): ContextSourceReadRequest {
  return {
    schemaVersion: version,
    tenant,
    correlation,
    actor: { kind: 'AGENT', identityId: 'identity:session-agent' as IdentityId },
    subject: { kind: 'IDENTITY', identityId: 'identity:session-subject' as IdentityId },
    purpose,
    jurisdiction,
    maxDataClassification: 'CONFIDENTIAL',
    currentness: 'CURRENT_REQUIRED',
    selector: {
      adapterId,
      sourceClass,
      key: 'memoryKey',
      value: boundaryKey,
    },
    limit: 8,
  };
}

function stage(snapshot: MemoryFabricSnapshot, item: MemoryWriteProposal) {
  return stageMemoryProposal({
    snapshot,
    proposal: item,
    maxDataClassification: 'CONFIDENTIAL',
  });
}

function validatedSnapshot(reference: string): MemoryFabricSnapshot {
  const staged = stage(createMemoryFabricSnapshot(tenant), proposal(reference));
  if (staged.status !== 'STAGED') throw new Error('test setup failed to stage candidate');
  const validated = transitionMemoryProjection({
    snapshot: staged.snapshot,
    tenant,
    projectionReference: reference,
    expectedLifecycleRevision: 0,
    to: 'VALIDATED',
    evidenceReference: `validation:${reference}`,
    sourceCommitReference: `semantic-kb:${reference}`,
    sourceCommitRevision: 'rev:1',
  });
  if (!validated.applied) throw new Error('test setup failed to validate candidate');
  return validated.snapshot;
}

test('W06-K opens an empty governed session without authority or retry semantics', async () => {
  const repository = createDurableMemoryFabricRepository(new InMemoryDurableStore());
  const session = await openMemoryFabricSession({ tenant, repository });
  const status = session.status();

  assert.equal(status.state, 'OPEN');
  assert.equal(status.restored, false);
  assert.equal(status.durableRevision, 0);
  assert.equal(status.memoryRevision, 0);
  assert.equal(status.dirty, false);
  assert.equal(status.authorizesExecution, false);
  assert.equal(status.retryAuthorized, false);
});

test('W06-K stages model proposals as candidates and keeps them hidden from ordinary context', async () => {
  const repository = createDurableMemoryFabricRepository(new InMemoryDurableStore());
  const session = await openMemoryFabricSession({ tenant, repository });
  const staged = session.stage(proposal('mem:session:candidate'), 'CONFIDENTIAL');

  assert.equal(staged.status, 'STAGED');
  assert.equal(staged.record?.lifecycle, 'CANDIDATE');
  assert.equal(staged.authorizesExecution, false);
  assert.equal(session.status().dirty, true);

  const adapter = session.sourceAdapter('SEMANTIC', 8);
  const result = await adapter.read(
    sourceRequest(adapter.descriptor.adapterId, adapter.descriptor.sourceClass),
  );
  assert.equal(result.items.length, 0, 'candidate memory must not reach normal context');
});

test('W06-K exposes previously validated shared memory through the existing source adapter path', async () => {
  const store = new InMemoryDurableStore();
  const repository = createDurableMemoryFabricRepository(store);
  const seed = validatedSnapshot('mem:session:validated');
  const seeded = await repository.save(seed, 0);
  if (seeded.status === 'CONFLICT') throw new Error('test seed unexpectedly conflicted');

  const session = await openMemoryFabricSession({ tenant, repository });
  const adapter = session.sourceAdapter('SEMANTIC', 8);
  const result = await adapter.read(
    sourceRequest(adapter.descriptor.adapterId, adapter.descriptor.sourceClass),
  );

  assert.equal(session.status().restored, true);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.sourceReference, 'semantic-kb:mem:session:validated');
  const payload = result.items[0]?.payload as Record<string, unknown>;
  assert.equal(payload.projectionReference, 'mem:session:validated');
  assert.equal(payload.lifecycle, 'VALIDATED');
});

test('W06-K keeps WORKING memory live in-session and removes it across restart', async () => {
  const store = new InMemoryDurableStore();
  const repository = createDurableMemoryFabricRepository(store);
  const session = await openMemoryFabricSession({ tenant, repository });

  const staged = session.stage(proposal('mem:session:working', 'WORKING'), 'CONFIDENTIAL');
  assert.equal(staged.status, 'STAGED');
  assert.equal(staged.record?.lifecycle, 'TRANSIENT');

  const liveAdapter = session.sourceAdapter('WORKING', 8);
  const live = await liveAdapter.read(
    sourceRequest(liveAdapter.descriptor.adapterId, liveAdapter.descriptor.sourceClass),
  );
  assert.equal(live.items.length, 1);

  const checkpoint = await session.checkpoint();
  assert.equal(checkpoint.status, 'APPLIED');
  session.close();

  const restarted = await openMemoryFabricSession({ tenant, repository });
  const restartedAdapter = restarted.sourceAdapter('WORKING', 8);
  const afterRestart = await restartedAdapter.read(
    sourceRequest(restartedAdapter.descriptor.adapterId, restartedAdapter.descriptor.sourceClass),
  );
  assert.equal(afterRestart.items.length, 0);
  assert.equal(
    restarted.snapshot().records.some((record) => record.boundary === 'WORKING'),
    false,
  );
});

test('W06-K checkpoints durable candidates and reconstructs them after a new session opens', async () => {
  const store = new InMemoryDurableStore();
  const repository = createDurableMemoryFabricRepository(store);
  const first = await openMemoryFabricSession({ tenant, repository });
  first.stage(proposal('mem:session:durable'), 'CONFIDENTIAL');

  const checkpoint = await first.checkpoint();
  assert.equal(checkpoint.status, 'APPLIED');
  assert.equal(checkpoint.authorizesExecution, false);
  assert.equal(checkpoint.retryAuthorized, false);
  assert.equal(first.status().dirty, false);
  first.close();

  const second = await openMemoryFabricSession({ tenant, repository });
  assert.equal(second.status().restored, true);
  assert.equal(second.snapshot().records[0]?.projectionReference, 'mem:session:durable');
  assert.equal(second.snapshot().records[0]?.lifecycle, 'CANDIDATE');
});

test('W06-K returns NO_CHANGES without touching durability when nothing changed', async () => {
  let writes = 0;
  const baseStore = new InMemoryDurableStore();
  const store: MemoryFabricDurableStateStorePort = {
    load: (address) => baseStore.load(address),
    compareAndSwap: async (request) => {
      writes += 1;
      return baseStore.compareAndSwap(request);
    },
  };
  const repository = createDurableMemoryFabricRepository(store);
  const session = await openMemoryFabricSession({ tenant, repository });

  const result = await session.checkpoint();
  assert.equal(result.status, 'NO_CHANGES');
  assert.equal(writes, 0);
});

test('W06-K surfaces stale CAS, enters CONFLICTED, blocks stale reads and never auto-retries', async () => {
  const store = new InMemoryDurableStore();
  const repository = createDurableMemoryFabricRepository(store);
  const first = await openMemoryFabricSession({ tenant, repository });
  const stale = await openMemoryFabricSession({ tenant, repository });

  first.stage(proposal('mem:session:first-writer'), 'CONFIDENTIAL');
  const committed = await first.checkpoint();
  assert.equal(committed.status, 'APPLIED');

  stale.stage(proposal('mem:session:stale-writer'), 'CONFIDENTIAL');
  const staleAdapter = stale.sourceAdapter('SEMANTIC', 8);
  const conflict = await stale.checkpoint();
  assert.deepEqual(conflict, {
    kind: 'MEMORY_FABRIC_CHECKPOINT_RESULT',
    status: 'CONFLICT',
    currentDurableRevision: 1,
    memoryRevision: 1,
    authorizesExecution: false,
    retryAuthorized: false,
  });
  assert.equal(stale.status().state, 'CONFLICTED');
  await assert.rejects(
    () =>
      staleAdapter.read(
        sourceRequest(staleAdapter.descriptor.adapterId, staleAdapter.descriptor.sourceClass),
      ),
    /MEMORY_FABRIC_SESSION_CONFLICTED/,
  );
  assert.throws(
    () => stale.stage(proposal('mem:session:no-hidden-retry'), 'CONFIDENTIAL'),
    /MEMORY_FABRIC_SESSION_CONFLICTED/,
  );
  await assert.rejects(() => stale.checkpoint(), /MEMORY_FABRIC_SESSION_CONFLICTED/);
});

test('W06-K does not let a session read another tenant through a bound source adapter', async () => {
  const repository = createDurableMemoryFabricRepository(new InMemoryDurableStore());
  const session = await openMemoryFabricSession({ tenant, repository });
  session.stage(proposal('mem:session:tenant', 'WORKING'), 'CONFIDENTIAL');
  const adapter = session.sourceAdapter('WORKING', 8);
  const request = sourceRequest(adapter.descriptor.adapterId, adapter.descriptor.sourceClass);

  await assert.rejects(
    () => adapter.read({ ...request, tenant: otherTenant }),
    /MEMORY_FABRIC_TENANT_MISMATCH/,
  );
});

test('W06-K close is explicit, idempotent and prevents further reads, staging or checkpoints', async () => {
  const repository = createDurableMemoryFabricRepository(new InMemoryDurableStore());
  const session = await openMemoryFabricSession({ tenant, repository });
  const adapter = session.sourceAdapter('SEMANTIC', 8);

  const firstClose = session.close();
  const secondClose = session.close();
  assert.equal(firstClose.state, 'CLOSED');
  assert.equal(secondClose.state, 'CLOSED');
  assert.equal(firstClose.authorizesExecution, false);
  assert.throws(() => session.snapshot(), /MEMORY_FABRIC_SESSION_CLOSED/);
  assert.throws(
    () => session.stage(proposal('mem:session:after-close'), 'CONFIDENTIAL'),
    /MEMORY_FABRIC_SESSION_CLOSED/,
  );
  await assert.rejects(() => session.checkpoint(), /MEMORY_FABRIC_SESSION_CLOSED/);
  await assert.rejects(
    () => adapter.read(sourceRequest(adapter.descriptor.adapterId, adapter.descriptor.sourceClass)),
    /MEMORY_FABRIC_SESSION_CLOSED/,
  );
});
