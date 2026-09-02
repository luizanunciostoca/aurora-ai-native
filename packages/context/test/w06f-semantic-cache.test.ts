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
  applySemanticCacheInvalidation,
  createSemanticCacheEntry,
  evaluateSemanticCache,
} from '../src/semantic-cache/index.js';
import type { SemanticCacheInvalidationSignal } from '../src/semantic-cache/types.js';

const version = '1.0.0' as ContractVersion;
const tenant: TenantContext = { tenantId: 'tenant:alpha' as TenantId };
const correlation: CorrelationContext = {
  correlationId: 'corr:context:w06f' as CorrelationId,
};
const subject: SubjectRef = {
  kind: 'IDENTITY',
  identityId: 'identity:subject' as IdentityId,
};
const purpose: PurposeContext = {
  kind: 'PurposeContext',
  purposeId: 'support.semantic-cache',
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
  reference: 'consent:subject:w06f',
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
        value: 'doc:company:cache',
      },
    ],
    requestedFields: ['title', 'body'],
    limits: { maxSourceFanout: 4, maxItemsPerSource: 4, maxTotalItems: 8 },
  };
}

function rankedItem(
  revision = 'rev:1',
  payload: unknown = { title: 'Policy', body: 'Cacheable' },
): RankedContextItem {
  return {
    sourceReference: 'fact:company:cache',
    sourceRevision: revision,
    tenant,
    subject,
    classification: 'INTERNAL',
    observedAt: at('2026-09-02T21:30:00Z'),
    provenanceReference: 'evidence:company:cache',
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
      conflict: { state: 'NONE', key: 'fact:company:cache', peerSourceReferences: [] },
      uncertainty: [],
    },
  };
}

function packageFor(
  revision = 'rev:1',
  payload: unknown = { title: 'Policy', body: 'Cacheable' },
): MinimalContextPackage {
  return {
    kind: 'MinimalContextPackage',
    query: query(),
    retrievalEvaluatedAt: at('2026-09-02T21:35:00Z'),
    items: [rankedItem(revision, payload)],
    includedSourceReferences: ['fact:company:cache'],
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

function createEntry(payload?: unknown) {
  return createSemanticCacheEntry({
    package: packageFor('rev:1', payload ?? { title: 'Policy', body: 'Cacheable' }),
    configVersion: 'retrieval:v1',
    createdAt: at('2026-09-02T21:40:00Z'),
    ttlMs: 30 * 60 * 1000,
  });
}

function invalidation(sequence: number, nextSourceRevision: string): SemanticCacheInvalidationSignal {
  return {
    kind: 'SemanticCacheInvalidationSignal',
    eventId: `event:${sequence}`,
    tenant,
    streamKey: 'context:company:cache',
    sequence,
    occurredAt: at('2026-09-02T21:45:00Z'),
    sourceReference: 'fact:company:cache',
    nextSourceRevision,
    authorizesExecution: false,
  };
}

test('W06-F creates deterministic semantic entries and returns only compatible fresh hits', () => {
  const first = createEntry();
  const second = createEntry();
  assert.equal(first.valid, true);
  assert.deepEqual(first, second);
  if (!first.valid) return;

  const evaluation = evaluateSemanticCache({
    query: query(),
    entry: first.entry,
    evaluatedAt: at('2026-09-02T21:50:00Z'),
    configVersion: 'retrieval:v1',
    expectedSourceVersions: [{ sourceReference: 'fact:company:cache', sourceRevision: 'rev:1' }],
  });

  assert.equal(evaluation.status, 'HIT');
  assert.equal(evaluation.package, first.entry.package);
  assert.equal(first.entry.authorizesExecution, false);
  assert.match(first.entry.cacheKey, /^fnv1a64:[0-9a-f]{16}$/);
});

test('W06-F rejects cross-tenant reuse and stale config/source/TTL state', () => {
  const created = createEntry();
  assert.equal(created.valid, true);
  if (!created.valid) return;

  const otherTenant: TenantContext = { tenantId: 'tenant:beta' as TenantId };
  const crossTenant = evaluateSemanticCache({
    query: query(otherTenant),
    entry: created.entry,
    evaluatedAt: at('2026-09-02T21:50:00Z'),
    configVersion: 'retrieval:v1',
    expectedSourceVersions: created.entry.sourceVersions,
  });
  assert.equal(crossTenant.status, 'INCOMPATIBLE_REJECTED');

  const staleConfig = evaluateSemanticCache({
    query: query(),
    entry: created.entry,
    evaluatedAt: at('2026-09-02T21:50:00Z'),
    configVersion: 'retrieval:v2',
    expectedSourceVersions: created.entry.sourceVersions,
  });
  assert.equal(staleConfig.status, 'STALE_REJECTED');

  const staleSource = evaluateSemanticCache({
    query: query(),
    entry: created.entry,
    evaluatedAt: at('2026-09-02T21:50:00Z'),
    configVersion: 'retrieval:v1',
    expectedSourceVersions: [{ sourceReference: 'fact:company:cache', sourceRevision: 'rev:2' }],
  });
  assert.equal(staleSource.status, 'STALE_REJECTED');

  const expired = evaluateSemanticCache({
    query: query(),
    entry: created.entry,
    evaluatedAt: at('2026-09-02T22:10:00Z'),
    configVersion: 'retrieval:v1',
    expectedSourceVersions: created.entry.sourceVersions,
  });
  assert.equal(expired.status, 'STALE_REJECTED');
});

test('W06-F rejects credential/authority-like payload fields and never invokes getters', () => {
  let getterCalls = 0;
  const payload = { title: 'unsafe' } as Record<string, unknown>;
  Object.defineProperty(payload, 'accessToken', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'must-not-run';
    },
  });

  const result = createEntry(payload);
  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.ok(result.reasons.includes('SENSITIVE_VALUE_REJECTED'));
  assert.equal(getterCalls, 0);
  assert.equal(result.authorizesExecution, false);
});

test('W06-F rejects malformed package input before scanning or fingerprinting', () => {
  const result = createSemanticCacheEntry(
    undefined as unknown as Parameters<typeof createSemanticCacheEntry>[0],
  );
  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.deepEqual(result.reasons, [
    'INVALID_PACKAGE',
    'INVALID_CONFIG_VERSION',
    'INVALID_CREATED_AT',
    'INVALID_TTL',
  ]);
  assert.equal(result.authorizesExecution, false);
});

test('W06-F invalidation is replay-safe and stale entries never resurrect', () => {
  const created = createEntry();
  assert.equal(created.valid, true);
  if (!created.valid) return;

  const signal = invalidation(10, 'rev:2');
  const applied = applySemanticCacheInvalidation(created.entry, signal);
  assert.equal(applied.status, 'APPLIED');
  assert.equal(applied.entry.invalidated, true);
  assert.equal(applied.entry.authorizesExecution, false);

  const duplicate = applySemanticCacheInvalidation(applied.entry, signal);
  assert.equal(duplicate.status, 'DUPLICATE');

  const outOfOrder = applySemanticCacheInvalidation(applied.entry, invalidation(9, 'rev:2'));
  assert.equal(outOfOrder.status, 'OUT_OF_ORDER_REJECTED');

  const evaluation = evaluateSemanticCache({
    query: query(),
    entry: applied.entry,
    evaluatedAt: at('2026-09-02T21:50:00Z'),
    configVersion: 'retrieval:v1',
    expectedSourceVersions: [{ sourceReference: 'fact:company:cache', sourceRevision: 'rev:2' }],
  });
  assert.equal(evaluation.status, 'INVALIDATED_REJECTED');
});

test('W06-F same-revision invalidation only advances the replay cursor', () => {
  const created = createEntry();
  assert.equal(created.valid, true);
  if (!created.valid) return;

  const result = applySemanticCacheInvalidation(created.entry, invalidation(10, 'rev:1'));
  assert.equal(result.status, 'NO_CHANGE');
  assert.equal(result.entry.invalidated, false);
  assert.deepEqual(result.entry.invalidationCursors, [
    { streamKey: 'context:company:cache', sequence: 10, eventId: 'event:10' },
  ]);
});
