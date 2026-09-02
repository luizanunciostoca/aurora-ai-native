// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { ConsentRecordReference } from '@aurora/contracts/consent';
import type {
  CorrelationContext,
  Rfc3339Timestamp,
  SubjectRef,
  TenantContext,
} from '@aurora/contracts/context';
import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';
import type { JurisdictionContext } from '@aurora/contracts/jurisdiction';
import type { PurposeContext } from '@aurora/contracts/purpose';
import type { ContractVersion } from '@aurora/contracts/versioning';

import type { MinimalContextPackage } from '../src/minimal-context/types.js';
import type { ContextQuery } from '../src/query/types.js';
import type { RankedContextItem } from '../src/retrieval/types.js';
import {
  applyContextSnapshotInvalidation,
  compileContextSnapshot,
  recompileContextSnapshot,
} from '../src/snapshots/index.js';
import type { ContextSnapshotInvalidationSignal } from '../src/snapshots/types.js';

const version = '1.0.0' as ContractVersion;
const tenant: TenantContext = { tenantId: 'tenant:alpha' as TenantId };
const correlation: CorrelationContext = {
  correlationId: 'corr:context:w06d' as CorrelationId,
};
const subject: SubjectRef = {
  kind: 'IDENTITY',
  identityId: 'identity:subject' as IdentityId,
};
const purpose: PurposeContext = {
  kind: 'PurposeContext',
  purposeId: 'support.snapshot',
  version,
  status: 'ACTIVE',
  allowedDataClassifications: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL'],
};
const jurisdiction: JurisdictionContext = {
  kind: 'JurisdictionContext',
  jurisdiction: 'BR',
  version,
};
const consent: ConsentRecordReference = {
  kind: 'CONSENT_RECORD',
  reference: 'consent:subject:w06d',
  version,
};
const at = (value: string) => value as Rfc3339Timestamp;

function query(): ContextQuery {
  return {
    kind: 'ContextQuery',
    schemaVersion: version,
    tenant,
    correlation,
    actor: { kind: 'AGENT', identityId: 'identity:agent' as IdentityId },
    subject,
    purpose,
    jurisdiction,
    consent,
    requiresConsent: true,
    maxDataClassification: 'CONFIDENTIAL',
    currentness: 'CURRENT_REQUIRED',
    selectors: [
      {
        adapterId: 'source:company',
        sourceClass: 'COMPANY_KNOWLEDGE',
        key: 'documentRef',
        value: 'doc:company:policy',
      },
    ],
    requestedFields: ['title', 'body'],
    limits: { maxSourceFanout: 4, maxItemsPerSource: 4, maxTotalItems: 8 },
  };
}

function rankedItem(revision?: string, payload: unknown = { title: 'Policy', body: 'Current' }): RankedContextItem {
  return {
    sourceReference: 'fact:company:policy',
    ...(revision ? { sourceRevision: revision } : {}),
    tenant,
    subject,
    classification: 'INTERNAL',
    observedAt: at('2026-09-02T21:30:00Z'),
    provenanceReference: 'evidence:company:policy',
    payload,
    adapterId: 'source:company',
    sourceClass: 'COMPANY_KNOWLEDGE',
    retrieval: {
      rank: 1,
      trust: { scoreBps: 9500, basis: 'ADAPTER_CONFIG', adapterId: 'source:company' },
      freshness: {
        state: 'CURRENT',
        evaluatedAt: at('2026-09-02T21:35:00Z'),
        observedAt: at('2026-09-02T21:30:00Z'),
        ageMs: 5 * 60 * 1000,
        maxAgeMs: 60 * 60 * 1000,
      },
      conflict: { state: 'NONE', key: 'fact:company:policy', peerSourceReferences: [] },
      uncertainty: [],
    },
  };
}

function packageFor(revision?: string, q: ContextQuery = query()): MinimalContextPackage {
  const item = rankedItem(revision);
  return {
    kind: 'MinimalContextPackage',
    query: q,
    retrievalEvaluatedAt: at('2026-09-02T21:35:00Z'),
    items: [item],
    includedSourceReferences: ['fact:company:policy'],
    excludedSources: [],
    retrievalRejections: [],
    upstreamRejections: [],
    metrics: {
      inputItemCount: 1,
      outputItemCount: 1,
      inputCanonicalUnits: 100,
      outputCanonicalUnits: 100,
      retainedRatioBps: 10_000,
      compressionSavingsBps: 0,
    },
    authorizesExecution: false,
  };
}

function signal(
  sequence: number,
  nextSourceRevision: string,
  eventId = `event:${sequence}`,
): ContextSnapshotInvalidationSignal {
  return {
    kind: 'ContextSnapshotInvalidationSignal',
    eventId,
    tenant,
    streamKey: 'context:company:policy',
    sequence,
    occurredAt: at('2026-09-02T21:40:00Z'),
    sourceReference: 'fact:company:policy',
    previousSourceRevision: 'rev:1',
    nextSourceRevision,
    authorizesExecution: false,
  };
}

test('W06-D compiles deterministic current snapshots with explicit source provenance', () => {
  const request = { package: packageFor('rev:1'), compiledAt: at('2026-09-02T21:36:00Z') };
  const first = compileContextSnapshot(request);
  const second = compileContextSnapshot(request);

  assert.equal(first.valid, true);
  assert.deepEqual(first, second);
  if (!first.valid) return;

  assert.equal(first.snapshot.status, 'CURRENT');
  assert.equal(first.snapshot.version, 1);
  assert.equal(first.snapshot.sourceStates[0]?.boundary, 'COMPANY');
  assert.equal(first.snapshot.sourceStates[0]?.sourceRevision, 'rev:1');
  assert.deepEqual(first.snapshot.provenanceReferences, ['evidence:company:policy']);
  assert.equal(first.snapshot.authorizesExecution, false);
  assert.match(first.snapshot.contentHash, /^fnv1a64:[0-9a-f]{16}$/);
  assert.match(first.snapshot.snapshotHash, /^fnv1a64:[0-9a-f]{16}$/);
});

test('W06-D requires explicit source revision before a snapshot can become current', () => {
  const result = compileContextSnapshot({
    package: packageFor(undefined),
    compiledAt: at('2026-09-02T21:36:00Z'),
  });

  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.ok(result.reasons.includes('SOURCE_REVISION_REQUIRED'));
  assert.equal(result.authorizesExecution, false);
});

test('W06-D invalidation is idempotent and rejects stale/out-of-order event projections', () => {
  const compiled = compileContextSnapshot({
    package: packageFor('rev:1'),
    compiledAt: at('2026-09-02T21:36:00Z'),
  });
  assert.equal(compiled.valid, true);
  if (!compiled.valid) return;

  const invalidation = signal(10, 'rev:2');
  const applied = applyContextSnapshotInvalidation(compiled.snapshot, invalidation);
  assert.equal(applied.status, 'APPLIED');
  assert.equal(applied.snapshot.status, 'INVALIDATED');
  assert.deepEqual(applied.snapshot.invalidatedSourceReferences, ['fact:company:policy']);
  assert.equal(applied.snapshot.sourceStates[0]?.pendingSourceRevision, 'rev:2');
  assert.equal(applied.snapshot.authorizesExecution, false);

  const duplicate = applyContextSnapshotInvalidation(applied.snapshot, invalidation);
  assert.equal(duplicate.status, 'DUPLICATE');
  assert.equal(duplicate.snapshot.snapshotHash, applied.snapshot.snapshotHash);

  const outOfOrder = applyContextSnapshotInvalidation(applied.snapshot, signal(9, 'rev:2'));
  assert.equal(outOfOrder.status, 'OUT_OF_ORDER_REJECTED');
  assert.equal(outOfOrder.snapshot.snapshotHash, applied.snapshot.snapshotHash);
});

test('W06-D recompilation uses the same deterministic full-build content hash', () => {
  const initial = compileContextSnapshot({
    package: packageFor('rev:1'),
    compiledAt: at('2026-09-02T21:36:00Z'),
  });
  assert.equal(initial.valid, true);
  if (!initial.valid) return;

  const invalidated = applyContextSnapshotInvalidation(initial.snapshot, signal(10, 'rev:2'));
  assert.equal(invalidated.status, 'APPLIED');

  const rebuilt = recompileContextSnapshot({
    previousSnapshot: invalidated.snapshot,
    package: packageFor('rev:2'),
    compiledAt: at('2026-09-02T21:45:00Z'),
  });
  assert.equal(rebuilt.valid, true);
  if (!rebuilt.valid) return;

  const fresh = compileContextSnapshot({
    package: packageFor('rev:2'),
    compiledAt: at('2026-09-02T21:45:00Z'),
  });
  assert.equal(fresh.valid, true);
  if (!fresh.valid) return;

  assert.equal(rebuilt.snapshot.status, 'CURRENT');
  assert.deepEqual(rebuilt.recompiledSourceReferences, ['fact:company:policy']);
  assert.equal(rebuilt.equivalentToFullRebuild, true);
  assert.equal(rebuilt.snapshot.contentHash, fresh.snapshot.contentHash);
  assert.equal(rebuilt.snapshot.authorizesExecution, false);
});

test('W06-D refuses to recompile an invalidated snapshot under a different query context', () => {
  const initial = compileContextSnapshot({
    package: packageFor('rev:1'),
    compiledAt: at('2026-09-02T21:36:00Z'),
  });
  assert.equal(initial.valid, true);
  if (!initial.valid) return;

  const q = query();
  const changed: ContextQuery = {
    ...q,
    purpose: { ...q.purpose, purposeId: 'support.other-purpose' },
  };
  const result = recompileContextSnapshot({
    previousSnapshot: initial.snapshot,
    package: packageFor('rev:2', changed),
    compiledAt: at('2026-09-02T21:45:00Z'),
  });

  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.deepEqual(result.reasons, ['SNAPSHOT_CONTEXT_MISMATCH']);
  assert.equal(result.authorizesExecution, false);
});
