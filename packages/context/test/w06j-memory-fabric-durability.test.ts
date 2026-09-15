// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { Rfc3339Timestamp, TenantContext } from '@aurora/contracts/context';
import type { TenantId } from '@aurora/contracts/ids';

import type { MemoryBoundaryKind, MemorySourceOwner } from '../src/memory-boundaries/index.js';
import {
  createDurableMemoryFabricRepository,
  createMemoryFabricSnapshot,
  stageMemoryProposal,
} from '../src/memory-fabric/index.js';
import type {
  MemoryFabricDurableStateAddress,
  MemoryFabricDurableStateRecord,
  MemoryFabricDurableStateStorePort,
  MemoryFabricDurableStateWriteResult,
  MemoryFabricJsonValue,
  MemoryWriteProposal,
} from '../src/memory-fabric/index.js';

const tenant: TenantContext = { tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId };
const otherTenant: TenantContext = { tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAW' as TenantId };
const at = (value: string) => value as Rfc3339Timestamp;

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
  payload: unknown = { fact: 'Aurora owns continuity across model providers.' },
): MemoryWriteProposal {
  return {
    kind: 'MemoryWriteProposal',
    proposalReference: reference,
    memoryKey: 'project:aurora:durable-memory',
    boundaryCandidate: {
      boundary,
      tenant,
      classification: 'INTERNAL',
      sourceOwner: ownerByBoundary[boundary],
      sourceReference: `source:${boundary.toLowerCase()}:durable`,
      provenanceReference: `provenance:${reference}`,
      observedAt: at('2026-09-15T02:30:00Z'),
      ...(boundary === 'EPISODIC' || boundary === 'SEMANTIC' || boundary === 'USER'
        ? { retentionPolicyReference: 'retention:governed:1' }
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
      digest: `sha256:${reference}`,
      payload,
    },
  };
}

function stage(snapshot: ReturnType<typeof createMemoryFabricSnapshot>, item: MemoryWriteProposal) {
  return stageMemoryProposal({
    snapshot,
    proposal: item,
    maxDataClassification: 'CONFIDENTIAL',
  });
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
    if (currentRevision !== request.expectedRevision) {
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
    const now = `2026-09-15T02:30:0${revision}.000Z`;
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

test('W06-J empty durable repository starts from an empty non-authoritative snapshot', async () => {
  const repository = createDurableMemoryFabricRepository(new InMemoryDurableStore());
  const loaded = await repository.load(tenant);

  assert.equal(loaded.restored, false);
  assert.equal(loaded.durableRevision, 0);
  assert.equal(loaded.snapshot.revision, 0);
  assert.equal(loaded.snapshot.records.length, 0);
  assert.equal(loaded.authorizesExecution, false);
  assert.equal(loaded.retryAuthorized, false);
});

test('W06-J persists a durable candidate and reconstructs it after repository restart', async () => {
  const store = new InMemoryDurableStore();
  const staged = stage(createMemoryFabricSnapshot(tenant), proposal('mem:durable:1'));
  assert.equal(staged.status, 'STAGED');
  assert.equal(staged.record?.lifecycle, 'CANDIDATE');

  const firstRepository = createDurableMemoryFabricRepository(store);
  const saved = await firstRepository.save(staged.snapshot, 0);
  if (saved.status === 'CONFLICT') throw new Error('first durable write must apply');
  assert.equal(saved.status, 'APPLIED');
  assert.equal(saved.durableRevision, 1);

  const restartedRepository = createDurableMemoryFabricRepository(store);
  const restored = await restartedRepository.load(tenant);
  assert.equal(restored.restored, true);
  assert.equal(restored.durableRevision, 1);
  assert.equal(restored.snapshot.records.length, 1);
  assert.equal(restored.snapshot.records[0]?.projectionReference, 'mem:durable:1');
  assert.equal(restored.snapshot.records[0]?.lifecycle, 'CANDIDATE');
  assert.equal(restored.authorizesExecution, false);
});

test('W06-J never persists transient working memory', async () => {
  const store = new InMemoryDurableStore();
  const working = stage(
    createMemoryFabricSnapshot(tenant),
    proposal('mem:working:durable-test', 'WORKING'),
  );
  const semantic = stage(working.snapshot, proposal('mem:semantic:durable-test'));

  const repository = createDurableMemoryFabricRepository(store);
  const saved = await repository.save(semantic.snapshot, 0);
  assert.notEqual(saved.status, 'CONFLICT');

  const restored = await repository.load(tenant);
  assert.deepEqual(
    restored.snapshot.records.map((record) => record.projectionReference),
    ['mem:semantic:durable-test'],
  );
  assert.equal(
    restored.snapshot.records.some((record) => record.boundary === 'WORKING'),
    false,
  );
});

test('W06-J identical durable save is idempotent and keeps the durable revision', async () => {
  const store = new InMemoryDurableStore();
  const staged = stage(createMemoryFabricSnapshot(tenant), proposal('mem:idempotent:durable'));
  const repository = createDurableMemoryFabricRepository(store);

  const first = await repository.save(staged.snapshot, 0);
  if (first.status === 'CONFLICT') throw new Error('first durable write must apply');
  assert.equal(first.status, 'APPLIED');

  const duplicate = await repository.save(staged.snapshot, first.durableRevision);
  if (duplicate.status === 'CONFLICT') throw new Error('equal write must be idempotent');
  assert.equal(duplicate.status, 'UNCHANGED');
  assert.equal(duplicate.durableRevision, first.durableRevision);
});

test('W06-J stale CAS is surfaced as conflict and never auto-retries', async () => {
  const store = new InMemoryDurableStore();
  const repository = createDurableMemoryFabricRepository(store);
  const firstStage = stage(createMemoryFabricSnapshot(tenant), proposal('mem:cas:first'));
  const first = await repository.save(firstStage.snapshot, 0);
  assert.notEqual(first.status, 'CONFLICT');

  const secondStage = stage(firstStage.snapshot, proposal('mem:cas:second'));
  const second = await repository.save(secondStage.snapshot, 1);
  assert.notEqual(second.status, 'CONFLICT');

  const staleStage = stage(firstStage.snapshot, proposal('mem:cas:stale'));
  const conflict = await repository.save(staleStage.snapshot, 1);
  assert.deepEqual(conflict, {
    status: 'CONFLICT',
    currentDurableRevision: 2,
    authorizesExecution: false,
    retryAuthorized: false,
  });
});

test('W06-J fails closed when persisted payload tenant does not match requested tenant', async () => {
  const staged = stage(createMemoryFabricSnapshot(tenant), proposal('mem:tenant:durable'));
  const seedStore = new InMemoryDurableStore();
  const seedRepository = createDurableMemoryFabricRepository(seedStore);
  const seeded = await seedRepository.save(staged.snapshot, 0);
  assert.notEqual(seeded.status, 'CONFLICT');
  const seededRecord = await seedStore.load({
    tenantId: tenant.tenantId,
    namespace: 'aurora.w06.memory-fabric.v1',
    stateKey: 'snapshot',
  });
  if (!seededRecord) throw new Error('seeded durable record expected');

  const tamperedStore: MemoryFabricDurableStateStorePort = {
    load: async () => ({
      ...seededRecord,
      tenantId: otherTenant.tenantId,
    }),
    compareAndSwap: async () => assert.fail('save should not be reached'),
  };
  const repository = createDurableMemoryFabricRepository(tamperedStore);
  await assert.rejects(() => repository.load(tenant), /MEMORY_FABRIC_DURABLE_RECORD_INVALID/);
});

test('W06-J rejects malformed persisted snapshots including transient durable records', async () => {
  const badStore: MemoryFabricDurableStateStorePort = {
    load: async (address) => ({
      ...address,
      revision: 1,
      payload: {
        kind: 'MemoryFabricSnapshot',
        tenant: { tenantId: tenant.tenantId },
        revision: 1,
        records: [
          {
            kind: 'MemoryProjectionRecord',
            projectionReference: 'mem:invalid:working',
            memoryKey: 'invalid',
            boundary: 'WORKING',
            tenant: { tenantId: tenant.tenantId },
            classification: 'INTERNAL',
            sourceOwner: 'TASK_RUNTIME',
            sourceReference: 'source:working:invalid',
            provenanceReference: 'provenance:invalid',
            observedAt: '2026-09-15T02:30:00Z',
            conflictState: 'NONE',
            conflictsWithProjectionReferences: [],
            producer: { kind: 'SYSTEM', producerReference: 'system:test' },
            content: { kind: 'TEXT', digest: 'sha256:invalid', payload: 'transient' },
            lifecycle: 'TRANSIENT',
            lifecycleRevision: 0,
            authorizesExecution: false,
          },
        ],
        authorizesExecution: false,
      },
      createdAt: '2026-09-15T02:30:00Z',
      updatedAt: '2026-09-15T02:30:00Z',
      authorizesExecution: false,
    }),
    compareAndSwap: async () => assert.fail('save should not be reached'),
  };

  const repository = createDurableMemoryFabricRepository(badStore);
  await assert.rejects(() => repository.load(tenant), /MEMORY_FABRIC_DURABLE_PAYLOAD_INVALID/);
});

test('W06-J rejects JSON-unsafe and known credential material before durable write', async () => {
  const store = new InMemoryDurableStore();
  const repository = createDurableMemoryFabricRepository(store);

  const binary = stage(
    createMemoryFabricSnapshot(tenant),
    proposal('mem:binary:unsafe', 'SEMANTIC', { bytes: new Uint8Array([1, 2]) }),
  );
  await assert.rejects(() => repository.save(binary.snapshot, 0), /MEMORY_FABRIC_SNAPSHOT_INVALID/);

  const credential = stage(
    createMemoryFabricSnapshot(tenant),
    proposal('mem:credential:unsafe', 'SEMANTIC', { apiKey: 'do-not-persist' }),
  );
  await assert.rejects(
    () => repository.save(credential.snapshot, 0),
    /MEMORY_FABRIC_SNAPSHOT_INVALID/,
  );
});
