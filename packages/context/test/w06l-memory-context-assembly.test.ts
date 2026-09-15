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

import type { MemorySourceOwner } from '../src/memory-boundaries/index.js';
import {
  assembleMemoryContext,
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
import type { ContextQuery, ContextSelector } from '../src/query/types.js';
import type { ContextRetrievalPolicy } from '../src/retrieval/types.js';
import type { ContextSourceAdapter } from '../src/sources/types.js';

const version = '1.0.0' as ContractVersion;
const tenant: TenantContext = { tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId };
const otherTenant: TenantContext = { tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAW' as TenantId };
const correlation: CorrelationContext = {
  correlationId: 'corr:memory:assembly:1' as CorrelationId,
};
const subject = {
  kind: 'IDENTITY',
  identityId: 'identity:assembly-subject' as IdentityId,
} as const;
const at = (value: string) => value as Rfc3339Timestamp;

const purpose: PurposeContext = {
  kind: 'PurposeContext',
  purposeId: 'assistant.memory-context-assembly',
  version,
  status: 'ACTIVE',
  allowedDataClassifications: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL'],
};
const jurisdiction: JurisdictionContext = {
  kind: 'JurisdictionContext',
  jurisdiction: 'BR',
  version,
};

const semanticOwner: MemorySourceOwner = 'SEMANTIC_KNOWLEDGE';
const semanticAdapterId = 'aurora-memory-fabric:semantic';

function proposal(reference: string): MemoryWriteProposal {
  return {
    kind: 'MemoryWriteProposal',
    proposalReference: reference,
    memoryKey: 'project:aurora:shared-brain',
    boundaryCandidate: {
      boundary: 'SEMANTIC',
      tenant,
      subject,
      classification: 'INTERNAL',
      sourceOwner: semanticOwner,
      sourceReference: `source:semantic:${reference}`,
      provenanceReference: `provenance:${reference}`,
      observedAt: at('2026-09-15T03:00:00Z'),
      retentionPolicyReference: 'retention:semantic:1',
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

function staged(snapshot: MemoryFabricSnapshot, item: MemoryWriteProposal) {
  return stageMemoryProposal({
    snapshot,
    proposal: item,
    maxDataClassification: 'CONFIDENTIAL',
  });
}

function validatedSnapshot(reference: string): MemoryFabricSnapshot {
  const candidate = staged(createMemoryFabricSnapshot(tenant), proposal(reference));
  if (candidate.status !== 'STAGED') throw new Error('test setup failed to stage memory');
  const validated = transitionMemoryProjection({
    snapshot: candidate.snapshot,
    tenant,
    projectionReference: reference,
    expectedLifecycleRevision: 0,
    to: 'VALIDATED',
    evidenceReference: `validation:${reference}`,
    sourceCommitReference: `semantic-kb:${reference}`,
    sourceCommitRevision: 'rev:1',
  });
  if (!validated.applied) throw new Error('test setup failed to validate memory');
  return validated.snapshot;
}

function semanticSelector(): ContextSelector {
  return {
    adapterId: semanticAdapterId,
    sourceClass: 'SEMANTIC',
    key: 'memoryKey',
    value: 'project:aurora:shared-brain',
  };
}

function contextQuery(
  selectors: readonly ContextSelector[],
  queryTenant: TenantContext = tenant,
): ContextQuery {
  return {
    kind: 'ContextQuery',
    schemaVersion: version,
    tenant: queryTenant,
    correlation,
    actor: { kind: 'AGENT', identityId: 'identity:assembly-agent' as IdentityId },
    subject,
    purpose,
    jurisdiction,
    maxDataClassification: 'CONFIDENTIAL',
    currentness: 'CURRENT_REQUIRED',
    selectors,
    limits: {
      maxSourceFanout: Math.max(1, selectors.length),
      maxItemsPerSource: 8,
      maxTotalItems: 16,
    },
  };
}

function retrievalPolicy(
  extraTrust: Readonly<Record<string, number>> = {},
): ContextRetrievalPolicy {
  return {
    evaluatedAt: at('2026-09-15T03:05:00Z'),
    minimumTrustBps: 5_000,
    trustBpsByAdapter: {
      [semanticAdapterId]: 9_000,
      ...extraTrust,
    },
    maxAgeMsBySourceClass: {
      SEMANTIC: 10 * 60 * 1000,
      EVIDENCE: 10 * 60 * 1000,
    },
  };
}

const compilerLimits = {
  maxItems: 8,
  maxCanonicalUnits: 100_000,
} as const;

function evidenceAdapter(): ContextSourceAdapter {
  return {
    descriptor: {
      adapterId: 'fixture:evidence',
      sourceClass: 'EVIDENCE',
      readOnly: true,
      supportedSelectorKeys: ['evidenceId'],
      maxItemsPerRead: 4,
    },
    read: async (request) => ({
      items: [
        {
          sourceReference: `evidence:${request.selector.value}`,
          sourceRevision: 'rev:7',
          tenant,
          subject,
          classification: 'INTERNAL',
          observedAt: at('2026-09-15T03:01:00Z'),
          provenanceReference: 'evidence:provenance:1',
          payload: { verified: true },
        },
      ],
    }),
  };
}

test('W06-L compiles validated shared memory into the accepted MinimalContextPackage', async () => {
  const store = new InMemoryDurableStore();
  const repository = createDurableMemoryFabricRepository(store);
  const seed = await repository.save(validatedSnapshot('mem:assembly:validated'), 0);
  if (seed.status === 'CONFLICT') throw new Error('test seed unexpectedly conflicted');
  const session = await openMemoryFabricSession({ tenant, repository });

  const result = await assembleMemoryContext({
    session,
    query: contextQuery([semanticSelector()]),
    memoryBoundaries: ['SEMANTIC'],
    retrievalPolicy: retrievalPolicy(),
    compilerLimits,
    maxItemsPerMemoryRead: 8,
  });

  assert.equal(result.valid, true);
  assert.equal(result.authorizesExecution, false);
  if (!result.valid) return;
  assert.equal(result.acquisition.authorizesExecution, false);
  assert.equal(result.retrieval.authorizesExecution, false);
  assert.equal(result.package.authorizesExecution, false);
  assert.equal(result.package.items.length, 1);
  assert.equal(result.package.items[0]?.sourceReference, 'semantic-kb:mem:assembly:validated');
});

test('W06-L keeps candidate model memory out of ordinary assembled context', async () => {
  const repository = createDurableMemoryFabricRepository(new InMemoryDurableStore());
  const session = await openMemoryFabricSession({ tenant, repository });
  const candidate = session.stage(proposal('mem:assembly:candidate'), 'CONFIDENTIAL');
  assert.equal(candidate.status, 'STAGED');
  assert.equal(candidate.record?.lifecycle, 'CANDIDATE');

  const result = await assembleMemoryContext({
    session,
    query: contextQuery([semanticSelector()]),
    memoryBoundaries: ['SEMANTIC'],
    retrievalPolicy: retrievalPolicy(),
    compilerLimits,
  });

  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.equal(result.package.items.length, 0);
  assert.equal(result.package.includedSourceReferences.length, 0);
});

test('W06-L composes explicit additional read-only adapters without widening authority', async () => {
  const store = new InMemoryDurableStore();
  const repository = createDurableMemoryFabricRepository(store);
  const seed = await repository.save(validatedSnapshot('mem:assembly:mixed'), 0);
  if (seed.status === 'CONFLICT') throw new Error('test seed unexpectedly conflicted');
  const session = await openMemoryFabricSession({ tenant, repository });
  const evidenceSelector: ContextSelector = {
    adapterId: 'fixture:evidence',
    sourceClass: 'EVIDENCE',
    key: 'evidenceId',
    value: 'ev-1',
  };

  const result = await assembleMemoryContext({
    session,
    query: contextQuery([semanticSelector(), evidenceSelector]),
    memoryBoundaries: ['SEMANTIC'],
    additionalAdapters: [evidenceAdapter()],
    retrievalPolicy: retrievalPolicy({ 'fixture:evidence': 8_500 }),
    compilerLimits,
  });

  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.equal(result.package.items.length, 2);
  assert.deepEqual(
    new Set(result.package.items.map((item) => item.adapterId)),
    new Set([semanticAdapterId, 'fixture:evidence']),
  );
  assert.equal(result.authorizesExecution, false);
});

test('W06-L fails closed for cross-tenant and closed sessions', async () => {
  const repository = createDurableMemoryFabricRepository(new InMemoryDurableStore());
  const session = await openMemoryFabricSession({ tenant, repository });

  const crossTenant = await assembleMemoryContext({
    session,
    query: contextQuery([semanticSelector()], otherTenant),
    memoryBoundaries: ['SEMANTIC'],
    retrievalPolicy: retrievalPolicy(),
    compilerLimits,
  });
  assert.equal(crossTenant.valid, false);
  if (!crossTenant.valid) assert.equal(crossTenant.reason, 'TENANT_MISMATCH');

  session.close();
  const closed = await assembleMemoryContext({
    session,
    query: contextQuery([semanticSelector()]),
    memoryBoundaries: ['SEMANTIC'],
    retrievalPolicy: retrievalPolicy(),
    compilerLimits,
  });
  assert.equal(closed.valid, false);
  if (!closed.valid) assert.equal(closed.reason, 'SESSION_NOT_OPEN');
});

test('W06-L rejects a conflicted stale session instead of assembling stale context', async () => {
  const store = new InMemoryDurableStore();
  const repository = createDurableMemoryFabricRepository(store);
  const first = await openMemoryFabricSession({ tenant, repository });
  const stale = await openMemoryFabricSession({ tenant, repository });

  first.stage(proposal('mem:assembly:first'), 'CONFIDENTIAL');
  stale.stage(proposal('mem:assembly:stale'), 'CONFIDENTIAL');
  const firstCheckpoint = await first.checkpoint();
  assert.equal(firstCheckpoint.status, 'APPLIED');
  const staleCheckpoint = await stale.checkpoint();
  assert.equal(staleCheckpoint.status, 'CONFLICT');
  assert.equal(stale.status().state, 'CONFLICTED');

  const result = await assembleMemoryContext({
    session: stale,
    query: contextQuery([semanticSelector()]),
    memoryBoundaries: ['SEMANTIC'],
    retrievalPolicy: retrievalPolicy(),
    compilerLimits,
  });

  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.reason, 'SESSION_NOT_OPEN');
  assert.equal(result.authorizesExecution, false);
});
