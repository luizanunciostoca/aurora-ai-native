// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import { readFile } from 'node:fs/promises';
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
  applySemanticCacheInvalidation,
  createSemanticCacheEntry,
} from '../src/semantic-cache/index.js';
import type { SemanticCacheEntry } from '../src/semantic-cache/types.js';
import {
  cancelSpeculativePreparation,
  evaluateSpeculativeReuse,
  prepareSpeculativeContext,
} from '../src/speculation/index.js';
import type {
  SpeculativeCancellationSignal,
  SpeculativePreparation,
} from '../src/speculation/types.js';
import {
  applyContextSnapshotInvalidation,
  compileContextSnapshot,
} from '../src/snapshots/index.js';
import type { ContextSnapshot } from '../src/snapshots/types.js';

const version = '1.0.0' as ContractVersion;
const tenant: TenantContext = { tenantId: 'tenant:alpha' as TenantId };
const correlation: CorrelationContext = {
  correlationId: 'corr:context:w06g' as CorrelationId,
};
const subject: SubjectRef = {
  kind: 'IDENTITY',
  identityId: 'identity:subject' as IdentityId,
};
const purpose: PurposeContext = {
  kind: 'PurposeContext',
  purposeId: 'support.speculation',
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
  reference: 'consent:subject:w06g',
  version,
};
const at = (value: string) => value as Rfc3339Timestamp;

function query(forTenant: TenantContext = tenant): ContextQuery {
  return {
    kind: 'ContextQuery',
    schemaVersion: version,
    tenant: forTenant,
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
        value: 'doc:company:speculation',
      },
    ],
    requestedFields: ['title', 'body'],
    deadline: { deadlineAt: at('2026-09-02T22:00:00Z') },
    limits: { maxSourceFanout: 4, maxItemsPerSource: 4, maxTotalItems: 8 },
  };
}

function rankedItem(
  revision = 'rev:1',
  payload: unknown = { title: 'Policy', body: 'Prepared read-only' },
): RankedContextItem {
  return {
    sourceReference: 'fact:company:speculation',
    sourceRevision: revision,
    tenant,
    subject,
    classification: 'INTERNAL',
    observedAt: at('2026-09-02T21:30:00Z'),
    provenanceReference: 'evidence:company:speculation',
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
      conflict: {
        state: 'NONE',
        key: 'fact:company:speculation',
        peerSourceReferences: [],
      },
      uncertainty: [],
    },
  };
}

function packageFor(revision = 'rev:1', q: ContextQuery = query()): MinimalContextPackage {
  return {
    kind: 'MinimalContextPackage',
    query: q,
    retrievalEvaluatedAt: at('2026-09-02T21:35:00Z'),
    items: [rankedItem(revision)],
    includedSourceReferences: ['fact:company:speculation'],
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

function snapshotFor(packageResult: MinimalContextPackage = packageFor()): ContextSnapshot {
  const result = compileContextSnapshot({
    package: packageResult,
    compiledAt: at('2026-09-02T21:36:00Z'),
  });
  assert.equal(result.valid, true);
  if (!result.valid) throw new Error('fixture snapshot must compile');
  return result.snapshot;
}

function cacheFor(packageResult: MinimalContextPackage = packageFor()): SemanticCacheEntry {
  const result = createSemanticCacheEntry({
    package: packageResult,
    configVersion: 'context:v1',
    createdAt: at('2026-09-02T21:40:00Z'),
    ttlMs: 30 * 60 * 1000,
  });
  assert.equal(result.valid, true);
  if (!result.valid) throw new Error('fixture cache must compile');
  return result.entry;
}

function prepare(
  packageResult: MinimalContextPackage = packageFor(),
  snapshot: ContextSnapshot = snapshotFor(packageResult),
  cacheEntry: SemanticCacheEntry = cacheFor(packageResult),
) {
  return prepareSpeculativeContext({
    package: packageResult,
    snapshot,
    cacheEntry,
    policyCompatibilityVersion: 'policy-compat:v1',
    configVersion: 'context:v1',
    preparedAt: at('2026-09-02T21:41:00Z'),
    deadlineAt: at('2026-09-02T21:55:00Z'),
    limits: { maxUnits: 3 },
  });
}

function cancellation(
  preparation: SpeculativePreparation,
  sequence: number,
  eventId = `cancel:${sequence}`,
): SpeculativeCancellationSignal {
  return {
    kind: 'SpeculativeCancellationSignal',
    preparationId: preparation.preparationId,
    tenant,
    streamKey: 'speculation:task:w06g',
    sequence,
    eventId,
    occurredAt: at('2026-09-02T21:45:00Z'),
    authorizesExecution: false,
  };
}

test('W06-G deterministically prepares bounded uncommitted read-only units', () => {
  const packageResult = packageFor();
  const snapshot = snapshotFor(packageResult);
  const cacheEntry = cacheFor(packageResult);
  const first = prepare(packageResult, snapshot, cacheEntry);
  const second = prepare(packageResult, snapshot, cacheEntry);

  assert.equal(first.valid, true);
  assert.deepEqual(first, second);
  if (!first.valid) return;

  assert.equal(first.preparation.status, 'PREPARED');
  assert.equal(first.preparation.commitState, 'UNCOMMITTED');
  assert.equal(first.preparation.authorizesExecution, false);
  assert.equal(first.preparation.units.length, 3);
  assert.deepEqual(
    first.preparation.units.map((unit) => unit.kind),
    ['PREFETCH_BINDING', 'PRE_RANK_PACKAGE', 'PRECOMPUTE_CACHE_LOOKUP'],
  );
  assert.ok(first.preparation.units.every((unit) => unit.authorizesExecution === false));
  assert.match(first.preparation.preparationId, /^fnv1a64:[0-9a-f]{16}$/);
});

test('W06-G fails closed when speculation would exceed its explicit unit budget', () => {
  const packageResult = packageFor();
  const snapshot = snapshotFor(packageResult);
  const cacheEntry = cacheFor(packageResult);
  const result = prepareSpeculativeContext({
    package: packageResult,
    snapshot,
    cacheEntry,
    policyCompatibilityVersion: 'policy-compat:v1',
    configVersion: 'context:v1',
    preparedAt: at('2026-09-02T21:41:00Z'),
    deadlineAt: at('2026-09-02T21:55:00Z'),
    limits: { maxUnits: 2 },
  });

  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.deepEqual(result.reasons, ['SPECULATION_LIMIT_EXCEEDED']);
  assert.equal(result.authorizesExecution, false);
});

test('W06-G rejects runtime-malformed snapshot shapes without throwing', () => {
  const packageResult = packageFor();
  const malformed = {
    kind: 'ContextSnapshot',
    authorizesExecution: false,
    status: 'CURRENT',
  } as unknown as ContextSnapshot;

  const result = prepareSpeculativeContext({
    package: packageResult,
    snapshot: malformed,
    policyCompatibilityVersion: 'policy-compat:v1',
    configVersion: 'context:v1',
    preparedAt: at('2026-09-02T21:41:00Z'),
    deadlineAt: at('2026-09-02T21:55:00Z'),
    limits: { maxUnits: 3 },
  });

  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.deepEqual(result.reasons, ['SNAPSHOT_MISMATCH']);
  assert.equal(result.authorizesExecution, false);
});

test('W06-G discards prepared work on policy, config, snapshot or cache drift', () => {
  const packageResult = packageFor();
  const snapshot = snapshotFor(packageResult);
  const cacheEntry = cacheFor(packageResult);
  const created = prepare(packageResult, snapshot, cacheEntry);
  assert.equal(created.valid, true);
  if (!created.valid) return;

  const base = {
    preparation: created.preparation,
    package: packageResult,
    snapshot,
    cacheEntry,
    policyCompatibilityVersion: 'policy-compat:v1',
    configVersion: 'context:v1',
    evaluatedAt: at('2026-09-02T21:50:00Z'),
  } as const;
  assert.equal(evaluateSpeculativeReuse(base).status, 'REUSABLE');
  assert.equal(
    evaluateSpeculativeReuse({ ...base, policyCompatibilityVersion: 'policy-compat:v2' }).status,
    'POLICY_REJECTED',
  );
  assert.equal(
    evaluateSpeculativeReuse({ ...base, configVersion: 'context:v2' }).status,
    'CONFIG_REJECTED',
  );

  const snapshotInvalidation = applyContextSnapshotInvalidation(snapshot, {
    kind: 'ContextSnapshotInvalidationSignal',
    eventId: 'event:snapshot:2',
    tenant,
    streamKey: 'context:company:speculation',
    sequence: 2,
    occurredAt: at('2026-09-02T21:46:00Z'),
    sourceReference: 'fact:company:speculation',
    previousSourceRevision: 'rev:1',
    nextSourceRevision: 'rev:2',
    authorizesExecution: false,
  });
  assert.equal(snapshotInvalidation.status, 'APPLIED');
  assert.equal(
    evaluateSpeculativeReuse({ ...base, snapshot: snapshotInvalidation.snapshot }).status,
    'SNAPSHOT_REJECTED',
  );

  const cacheInvalidation = applySemanticCacheInvalidation(cacheEntry, {
    kind: 'SemanticCacheInvalidationSignal',
    eventId: 'event:cache:2',
    tenant,
    streamKey: 'context:company:speculation',
    sequence: 2,
    occurredAt: at('2026-09-02T21:46:00Z'),
    sourceReference: 'fact:company:speculation',
    nextSourceRevision: 'rev:2',
    authorizesExecution: false,
  });
  assert.equal(cacheInvalidation.status, 'APPLIED');
  assert.equal(
    evaluateSpeculativeReuse({ ...base, cacheEntry: cacheInvalidation.entry }).status,
    'CACHE_REJECTED',
  );
});

test('W06-G rejects cross-tenant and expired speculative reuse', () => {
  const packageResult = packageFor();
  const snapshot = snapshotFor(packageResult);
  const cacheEntry = cacheFor(packageResult);
  const created = prepare(packageResult, snapshot, cacheEntry);
  assert.equal(created.valid, true);
  if (!created.valid) return;

  assert.equal(
    evaluateSpeculativeReuse({
      preparation: created.preparation,
      package: packageResult,
      snapshot,
      cacheEntry,
      policyCompatibilityVersion: 'policy-compat:v1',
      configVersion: 'context:v1',
      evaluatedAt: at('2026-09-02T21:55:00Z'),
    }).status,
    'DEADLINE_REJECTED',
  );

  const otherTenant: TenantContext = { tenantId: 'tenant:beta' as TenantId };
  const otherPackage = packageFor('rev:1', query(otherTenant));
  const otherSnapshot = { ...snapshot, tenant: otherTenant };
  assert.equal(
    evaluateSpeculativeReuse({
      preparation: created.preparation,
      package: otherPackage,
      snapshot: otherSnapshot,
      cacheEntry,
      policyCompatibilityVersion: 'policy-compat:v1',
      configVersion: 'context:v1',
      evaluatedAt: at('2026-09-02T21:50:00Z'),
    }).status,
    'TENANT_REJECTED',
  );
});

test('W06-G cancellation is replay-safe and cancelled preparation cannot be reused', () => {
  const packageResult = packageFor();
  const snapshot = snapshotFor(packageResult);
  const cacheEntry = cacheFor(packageResult);
  const created = prepare(packageResult, snapshot, cacheEntry);
  assert.equal(created.valid, true);
  if (!created.valid) return;

  const signal = cancellation(created.preparation, 10);
  const cancelled = cancelSpeculativePreparation(created.preparation, signal);
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.preparation.status, 'CANCELLED');
  assert.equal(cancelled.preparation.commitState, 'UNCOMMITTED');
  assert.equal(cancelled.preparation.authorizesExecution, false);

  assert.equal(cancelSpeculativePreparation(cancelled.preparation, signal).status, 'DUPLICATE');
  assert.equal(
    cancelSpeculativePreparation(cancelled.preparation, cancellation(cancelled.preparation, 9))
      .status,
    'OUT_OF_ORDER_REJECTED',
  );
  assert.equal(
    evaluateSpeculativeReuse({
      preparation: cancelled.preparation,
      package: packageResult,
      snapshot,
      cacheEntry,
      policyCompatibilityVersion: 'policy-compat:v1',
      configVersion: 'context:v1',
      evaluatedAt: at('2026-09-02T21:50:00Z'),
    }).status,
    'CANCELLED_REJECTED',
  );
});

test('W06-G speculation source has no executor/provider/W07 side-effect reachability', async () => {
  const source = await readFile('packages/context/src/speculation/index.ts', 'utf8');
  assert.doesNotMatch(
    source,
    /from ['"][^'"]*(?:executors|providers|workflow|device|w07)[^'"]*['"]/i,
  );
  assert.doesNotMatch(source, /\b(?:fetch|invoke|execute)\s*\(/i);
  assert.doesNotMatch(source, /authorizesExecution\s*:\s*true/);
});
