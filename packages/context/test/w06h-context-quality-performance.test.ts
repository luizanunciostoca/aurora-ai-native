// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import { Buffer } from 'node:buffer';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import console from 'node:console';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import { createHash } from 'node:crypto';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import { performance } from 'node:perf_hooks';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import process from 'node:process';
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

import { compileMinimalContext } from '../src/minimal-context/index.js';
import type { MinimalContextPackage } from '../src/minimal-context/types.js';
import type { ContextQuery, ContextSourceClass } from '../src/query/types.js';
import { evaluateContextRetrieval } from '../src/retrieval/index.js';
import type { ContextRetrievalPolicy, ContextRetrievalResult } from '../src/retrieval/types.js';
import {
  applySemanticCacheInvalidation,
  createSemanticCacheEntry,
  evaluateSemanticCache,
} from '../src/semantic-cache/index.js';
import type { SemanticCacheEntry } from '../src/semantic-cache/types.js';
import { evaluateSpeculativeReuse, prepareSpeculativeContext } from '../src/speculation/index.js';
import type { SpeculativePreparation } from '../src/speculation/types.js';
import { compileContextSnapshot } from '../src/snapshots/index.js';
import type { ContextSnapshot } from '../src/snapshots/types.js';
import type { AcquiredContextItem, ContextAcquisitionResult } from '../src/sources/types.js';

const HARNESS_VERSION = 'w06-h.1';
const FIXTURE_VERSION = 'w06-h-context-fixtures.1';
const BENCHMARK_ITERATIONS = 200;
const CONCURRENCY_ITERATIONS = 64;
const MEASUREMENT_SCOPE = 'TEST_ONLY_NOT_PRODUCTION_SLO';
const NOT_OBSERVED = 'NOT_OBSERVED';
const version = '1.0.0' as ContractVersion;
const at = (value: string) => value as Rfc3339Timestamp;
const tenantAlpha: TenantContext = { tenantId: 'tenant:alpha' as TenantId };
const tenantBeta: TenantContext = { tenantId: 'tenant:beta' as TenantId };
const correlation: CorrelationContext = {
  correlationId: 'corr:context:w06h' as CorrelationId,
};
const subject: SubjectRef = {
  kind: 'IDENTITY',
  identityId: 'identity:subject' as IdentityId,
};
const purpose: PurposeContext = {
  kind: 'PurposeContext',
  purposeId: 'support.context-quality',
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
  reference: 'consent:subject:w06h',
  version,
};
const RETRIEVAL_AT = at('2026-09-02T22:00:00Z');
const SNAPSHOT_AT = at('2026-09-02T22:02:00Z');
const CACHE_AT = at('2026-09-02T22:03:00Z');
const PREPARED_AT = at('2026-09-02T22:04:00Z');
const REUSE_AT = at('2026-09-02T22:10:00Z');
const DEADLINE_AT = at('2026-09-02T22:20:00Z');

interface FixtureItemOptions {
  readonly sourceReference: string;
  readonly adapterId: string;
  readonly sourceClass: ContextSourceClass;
  readonly payload: unknown;
  readonly tenant?: TenantContext;
  readonly sourceRevision?: string;
  readonly observedAt?: Rfc3339Timestamp;
  readonly provenanceReference?: string;
}

interface ContextFixture {
  readonly query: ContextQuery;
  readonly acquisition: ContextAcquisitionResult;
  readonly policy: ContextRetrievalPolicy;
}

interface AssemblyResult {
  readonly retrieval: ContextRetrievalResult;
  readonly package: MinimalContextPackage;
  readonly snapshot: ContextSnapshot;
  readonly cache: SemanticCacheEntry;
  readonly preparation: SpeculativePreparation;
}

function queryFor(tenant: TenantContext = tenantAlpha): ContextQuery {
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
        value: 'doc:w06h:company',
      },
      {
        adapterId: 'source:user',
        sourceClass: 'USER_CONTEXT',
        key: 'profileRef',
        value: 'profile:w06h:user',
      },
      {
        adapterId: 'source:temporal',
        sourceClass: 'TEMPORAL_FACT',
        key: 'factRef',
        value: 'fact:w06h:temporal',
      },
    ],
    requestedFields: ['title', 'body', 'value'],
    deadline: { deadlineAt: at('2026-09-02T22:30:00Z') },
    limits: { maxSourceFanout: 4, maxItemsPerSource: 8, maxTotalItems: 16 },
  };
}

function item(options: FixtureItemOptions): AcquiredContextItem {
  return {
    sourceReference: options.sourceReference,
    sourceRevision: options.sourceRevision ?? 'rev:1',
    tenant: options.tenant ?? tenantAlpha,
    subject,
    classification: 'INTERNAL',
    observedAt: options.observedAt ?? at('2026-09-02T21:50:00Z'),
    provenanceReference: options.provenanceReference ?? `evidence:${options.sourceReference}`,
    payload: options.payload,
    adapterId: options.adapterId,
    sourceClass: options.sourceClass,
  };
}

function acquisitionFor(
  query: ContextQuery,
  items: readonly AcquiredContextItem[],
): ContextAcquisitionResult {
  return {
    kind: 'ContextAcquisitionResult',
    items,
    rejections: [],
    attemptedSelectors: query.selectors.length,
    invokedAdapters: [...new Set(items.map((entry) => entry.adapterId))].sort(),
    authorizesExecution: false,
  };
}

function policyFor(
  conflictKeyBySourceReference: Readonly<Record<string, string>> = {},
): ContextRetrievalPolicy {
  return {
    evaluatedAt: RETRIEVAL_AT,
    minimumTrustBps: 8000,
    trustBpsByAdapter: {
      'source:company': 9500,
      'source:user': 9300,
      'source:temporal': 9700,
    },
    maxAgeMsBySourceClass: {
      COMPANY_KNOWLEDGE: 60 * 60 * 1000,
      USER_CONTEXT: 60 * 60 * 1000,
      TEMPORAL_FACT: 30 * 60 * 1000,
    },
    conflictKeyBySourceReference,
  };
}

function canonicalItems(): AcquiredContextItem[] {
  return [
    item({
      sourceReference: 'fact:company:policy',
      adapterId: 'source:company',
      sourceClass: 'COMPANY_KNOWLEDGE',
      observedAt: at('2026-09-02T21:45:00Z'),
      payload: { title: 'Policy', body: 'Current company guidance' },
    }),
    item({
      sourceReference: 'fact:user:preference',
      adapterId: 'source:user',
      sourceClass: 'USER_CONTEXT',
      observedAt: at('2026-09-02T21:50:00Z'),
      payload: { title: 'Preference', value: 'concise' },
    }),
    item({
      sourceReference: 'fact:temporal:status',
      adapterId: 'source:temporal',
      sourceClass: 'TEMPORAL_FACT',
      observedAt: at('2026-09-02T21:55:00Z'),
      payload: { title: 'Status', value: 'current' },
    }),
  ];
}

function canonicalFixture(reverseInput = false): ContextFixture {
  const query = queryFor();
  const items = canonicalItems();
  return {
    query,
    acquisition: acquisitionFor(query, reverseInput ? [...items].reverse() : items),
    policy: policyFor(),
  };
}

function fixtureHash(): string {
  const fixture = canonicalFixture();
  const descriptor = {
    fixtureVersion: FIXTURE_VERSION,
    query: fixture.query,
    items: [...fixture.acquisition.items].sort((left, right) =>
      left.sourceReference.localeCompare(right.sourceReference),
    ),
    policy: fixture.policy,
  };
  return createHash('sha256').update(JSON.stringify(descriptor)).digest('hex');
}

function assemble(fixture: ContextFixture): AssemblyResult {
  const retrieval = evaluateContextRetrieval(fixture);
  const compiled = compileMinimalContext({
    query: fixture.query,
    retrieval,
    limits: { maxItems: fixture.query.limits.maxTotalItems, maxCanonicalUnits: 1_000_000 },
  });
  if (!compiled.valid) {
    throw new Error(`W06-H fixture failed minimal compilation: ${compiled.reasons.join(',')}`);
  }

  const snapshotResult = compileContextSnapshot({
    package: compiled.package,
    compiledAt: SNAPSHOT_AT,
  });
  if (!snapshotResult.valid) {
    throw new Error(
      `W06-H fixture failed snapshot compilation: ${snapshotResult.reasons.join(',')}`,
    );
  }

  const cacheResult = createSemanticCacheEntry({
    package: compiled.package,
    configVersion: 'context:v1',
    createdAt: CACHE_AT,
    ttlMs: 30 * 60 * 1000,
  });
  if (!cacheResult.valid) {
    throw new Error(`W06-H fixture failed cache creation: ${cacheResult.reasons.join(',')}`);
  }

  const preparationResult = prepareSpeculativeContext({
    package: compiled.package,
    snapshot: snapshotResult.snapshot,
    cacheEntry: cacheResult.entry,
    policyCompatibilityVersion: 'policy-compat:v1',
    configVersion: 'context:v1',
    preparedAt: PREPARED_AT,
    deadlineAt: DEADLINE_AT,
    limits: { maxUnits: compiled.package.items.length + 2 },
  });
  if (!preparationResult.valid) {
    throw new Error(
      `W06-H fixture failed speculative preparation: ${preparationResult.reasons.join(',')}`,
    );
  }

  return {
    retrieval,
    package: compiled.package,
    snapshot: snapshotResult.snapshot,
    cache: cacheResult.entry,
    preparation: preparationResult.preparation,
  };
}

function percentile(sortedSamples: readonly number[], quantile: number): number {
  const index = Math.min(
    sortedSamples.length - 1,
    Math.floor((sortedSamples.length - 1) * quantile),
  );
  return sortedSamples[index] ?? 0;
}

function percentiles(samples: readonly number[]) {
  const sorted = [...samples].sort((left, right) => left - right);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };
}

function measureAssemblyLatency(fixture: ContextFixture) {
  const samples: number[] = [];
  let last: AssemblyResult | undefined;
  for (let index = 0; index < BENCHMARK_ITERATIONS; index += 1) {
    const startedAt = performance.now();
    last = assemble(fixture);
    samples.push(performance.now() - startedAt);
  }
  return { latencyMs: percentiles(samples), last };
}

function measureInvalidationObservationLatency(assembly: AssemblyResult) {
  const samples: number[] = [];
  for (let index = 0; index < BENCHMARK_ITERATIONS; index += 1) {
    const startedAt = performance.now();
    const invalidated = applySemanticCacheInvalidation(assembly.cache, {
      kind: 'SemanticCacheInvalidationSignal',
      eventId: `event:w06h:cache:${index + 1}`,
      tenant: tenantAlpha,
      streamKey: 'context:w06h:cache',
      sequence: index + 1,
      occurredAt: at('2026-09-02T22:11:00Z'),
      sourceReference: 'fact:company:policy',
      nextSourceRevision: 'rev:2',
      authorizesExecution: false,
    });
    assert.equal(invalidated.status, 'APPLIED');
    const evaluation = evaluateSemanticCache({
      query: assembly.package.query,
      entry: invalidated.entry,
      evaluatedAt: at('2026-09-02T22:12:00Z'),
      configVersion: 'context:v1',
      expectedSourceVersions: assembly.cache.sourceVersions,
    });
    assert.equal(evaluation.status, 'INVALIDATED_REJECTED');
    samples.push(performance.now() - startedAt);
  }
  return percentiles(samples);
}

function assertOrderedPercentiles(values: { p50: number; p95: number; p99: number }) {
  assert.ok(Number.isFinite(values.p50));
  assert.ok(Number.isFinite(values.p95));
  assert.ok(Number.isFinite(values.p99));
  assert.ok(values.p50 >= 0);
  assert.ok(values.p50 <= values.p95);
  assert.ok(values.p95 <= values.p99);
}

test('W06-H equivalent versioned tasks produce identical minimal context and derived state', () => {
  const forward = assemble(canonicalFixture(false));
  const reversed = assemble(canonicalFixture(true));

  assert.deepEqual(forward.retrieval, reversed.retrieval);
  assert.deepEqual(forward.package, reversed.package);
  assert.deepEqual(forward.snapshot, reversed.snapshot);
  assert.deepEqual(forward.cache, reversed.cache);
  assert.deepEqual(forward.preparation, reversed.preparation);
  assert.equal(forward.package.authorizesExecution, false);
  assert.equal(forward.snapshot.authorizesExecution, false);
  assert.equal(forward.cache.authorizesExecution, false);
  assert.equal(forward.preparation.authorizesExecution, false);
  assert.match(fixtureHash(), /^[0-9a-f]{64}$/);
});

test('W06-H surfaces stale, poisoned and conflicting sources without hiding uncertainty', () => {
  const query = queryFor();
  const poisonedPayload: Record<string, unknown> = { marker: 'poison' };
  poisonedPayload.self = poisonedPayload;
  const acquisition = acquisitionFor(query, [
    item({
      sourceReference: 'fact:user:stale',
      adapterId: 'source:user',
      sourceClass: 'USER_CONTEXT',
      observedAt: at('2026-09-02T20:00:00Z'),
      payload: { title: 'Stale', value: 'old' },
    }),
    item({
      sourceReference: 'fact:temporal:poison',
      adapterId: 'source:temporal',
      sourceClass: 'TEMPORAL_FACT',
      observedAt: at('2026-09-02T21:58:00Z'),
      payload: poisonedPayload,
    }),
    item({
      sourceReference: 'fact:company:conflict:a',
      adapterId: 'source:company',
      sourceClass: 'COMPANY_KNOWLEDGE',
      observedAt: at('2026-09-02T21:58:00Z'),
      payload: { title: 'Conflicting fact', value: 'A' },
    }),
    item({
      sourceReference: 'fact:company:conflict:b',
      adapterId: 'source:company',
      sourceClass: 'COMPANY_KNOWLEDGE',
      observedAt: at('2026-09-02T21:57:00Z'),
      payload: { title: 'Conflicting fact', value: 'B' },
    }),
  ]);
  const policy = policyFor({
    'fact:company:conflict:a': 'conflict:w06h:company',
    'fact:company:conflict:b': 'conflict:w06h:company',
  });

  const retrieval = evaluateContextRetrieval({ query, acquisition, policy });
  assert.ok(retrieval.rejections.some((entry) => entry.reason === 'STALE_CURRENT_REQUIRED'));
  assert.ok(retrieval.rejections.some((entry) => entry.reason === 'PAYLOAD_UNRANKABLE'));
  assert.equal(retrieval.items.length, 2);
  assert.ok(retrieval.items.every((entry) => entry.retrieval.conflict.state === 'CONFLICTING'));
  assert.ok(
    retrieval.items.every((entry) => entry.retrieval.uncertainty.includes('CONFLICTING_FACT')),
  );

  const compiled = compileMinimalContext({
    query,
    retrieval,
    limits: { maxItems: 4, maxCanonicalUnits: 1_000_000 },
  });
  assert.equal(compiled.valid, true);
  if (!compiled.valid) return;
  assert.deepEqual(
    new Set(compiled.package.includedSourceReferences),
    new Set(['fact:company:conflict:a', 'fact:company:conflict:b']),
  );
  assert.equal(compiled.package.authorizesExecution, false);
});

test('W06-H preserves tenant isolation across concurrent fixture assembly', async () => {
  const runs = Array.from({ length: CONCURRENCY_ITERATIONS }, (_, index) =>
    Promise.resolve().then(() => {
      const ownTenant = index % 2 === 0 ? tenantAlpha : tenantBeta;
      const foreignTenant = index % 2 === 0 ? tenantBeta : tenantAlpha;
      const query = queryFor(ownTenant);
      const ownReference = `fact:company:concurrency:${index}:own`;
      const foreignReference = `fact:company:concurrency:${index}:foreign`;
      const retrieval = evaluateContextRetrieval({
        query,
        acquisition: acquisitionFor(query, [
          item({
            sourceReference: ownReference,
            adapterId: 'source:company',
            sourceClass: 'COMPANY_KNOWLEDGE',
            tenant: ownTenant,
            payload: { title: 'Own tenant', value: index },
          }),
          item({
            sourceReference: foreignReference,
            adapterId: 'source:company',
            sourceClass: 'COMPANY_KNOWLEDGE',
            tenant: foreignTenant,
            payload: { title: 'Foreign tenant', value: index },
          }),
        ]),
        policy: policyFor(),
      });
      assert.equal(retrieval.items.length, 1);
      assert.equal(retrieval.items[0]?.tenant.tenantId, ownTenant.tenantId);
      assert.equal(retrieval.items[0]?.sourceReference, ownReference);
      assert.ok(retrieval.rejections.some((entry) => entry.reason === 'CROSS_TENANT_ITEM'));

      const compiled = compileMinimalContext({
        query,
        retrieval,
        limits: { maxItems: 2, maxCanonicalUnits: 1_000_000 },
      });
      assert.equal(compiled.valid, true);
      if (!compiled.valid) throw new Error('concurrent tenant fixture must compile');
      assert.equal(compiled.package.query.tenant.tenantId, ownTenant.tenantId);
      assert.ok(
        compiled.package.items.every((entry) => entry.tenant.tenantId === ownTenant.tenantId),
      );
      return ownTenant.tenantId;
    }),
  );

  const results = await Promise.all(runs);
  assert.equal(results.length, CONCURRENCY_ITERATIONS);
  assert.equal(results.filter((tenantId) => tenantId === tenantAlpha.tenantId).length, 32);
  assert.equal(results.filter((tenantId) => tenantId === tenantBeta.tenantId).length, 32);
});

test('W06-H cache hit, stale, miss and invalidation outcomes stay explicit and non-authoritative', () => {
  const assembly = assemble(canonicalFixture());
  const hit = evaluateSemanticCache({
    query: assembly.package.query,
    entry: assembly.cache,
    evaluatedAt: REUSE_AT,
    configVersion: 'context:v1',
    expectedSourceVersions: assembly.cache.sourceVersions,
  });
  const stale = evaluateSemanticCache({
    query: assembly.package.query,
    entry: assembly.cache,
    evaluatedAt: REUSE_AT,
    configVersion: 'context:v2',
    expectedSourceVersions: assembly.cache.sourceVersions,
  });
  const miss = evaluateSemanticCache({
    query: assembly.package.query,
    entry: { ...assembly.cache, cacheKey: 'fnv1a64:0000000000000000' },
    evaluatedAt: REUSE_AT,
    configVersion: 'context:v1',
    expectedSourceVersions: assembly.cache.sourceVersions,
  });
  const invalidated = applySemanticCacheInvalidation(assembly.cache, {
    kind: 'SemanticCacheInvalidationSignal',
    eventId: 'event:w06h:cache:invalidated',
    tenant: tenantAlpha,
    streamKey: 'context:w06h:cache',
    sequence: 1,
    occurredAt: at('2026-09-02T22:11:00Z'),
    sourceReference: 'fact:company:policy',
    nextSourceRevision: 'rev:2',
    authorizesExecution: false,
  });
  assert.equal(invalidated.status, 'APPLIED');
  const invalidatedEvaluation = evaluateSemanticCache({
    query: assembly.package.query,
    entry: invalidated.entry,
    evaluatedAt: at('2026-09-02T22:12:00Z'),
    configVersion: 'context:v1',
    expectedSourceVersions: assembly.cache.sourceVersions,
  });

  assert.equal(hit.status, 'HIT');
  assert.equal(stale.status, 'STALE_REJECTED');
  assert.equal(miss.status, 'MISS');
  assert.equal(invalidatedEvaluation.status, 'INVALIDATED_REJECTED');
  assert.equal(hit.authorizesExecution, false);
  assert.equal(stale.authorizesExecution, false);
  assert.equal(miss.authorizesExecution, false);
  assert.equal(invalidatedEvaluation.authorizesExecution, false);

  const reusable = evaluateSpeculativeReuse({
    preparation: assembly.preparation,
    package: assembly.package,
    snapshot: assembly.snapshot,
    cacheEntry: assembly.cache,
    policyCompatibilityVersion: 'policy-compat:v1',
    configVersion: 'context:v1',
    evaluatedAt: REUSE_AT,
  });
  assert.equal(reusable.status, 'REUSABLE');
  assert.equal(reusable.authorizesExecution, false);
});

test('W06-H records test-only package, fan-out, cache, invalidation and p50/p95/p99 evidence', () => {
  const fixture = canonicalFixture();
  const benchmark = measureAssemblyLatency(fixture);
  const assembly = benchmark.last;
  if (!assembly) throw new Error('W06-H benchmark produced no assembly sample');
  const invalidationObservationLatencyMs = measureInvalidationObservationLatency(assembly);
  assertOrderedPercentiles(benchmark.latencyMs);
  assertOrderedPercentiles(invalidationObservationLatencyMs);

  const hit = evaluateSemanticCache({
    query: assembly.package.query,
    entry: assembly.cache,
    evaluatedAt: REUSE_AT,
    configVersion: 'context:v1',
    expectedSourceVersions: assembly.cache.sourceVersions,
  });
  const stale = evaluateSemanticCache({
    query: assembly.package.query,
    entry: assembly.cache,
    evaluatedAt: REUSE_AT,
    configVersion: 'context:v2',
    expectedSourceVersions: assembly.cache.sourceVersions,
  });
  const invalidated = applySemanticCacheInvalidation(assembly.cache, {
    kind: 'SemanticCacheInvalidationSignal',
    eventId: 'event:w06h:evidence:cache',
    tenant: tenantAlpha,
    streamKey: 'context:w06h:evidence',
    sequence: 1,
    occurredAt: at('2026-09-02T22:11:00Z'),
    sourceReference: 'fact:company:policy',
    nextSourceRevision: 'rev:2',
    authorizesExecution: false,
  });
  assert.equal(invalidated.status, 'APPLIED');
  const invalidatedStatus = evaluateSemanticCache({
    query: assembly.package.query,
    entry: invalidated.entry,
    evaluatedAt: at('2026-09-02T22:12:00Z'),
    configVersion: 'context:v1',
    expectedSourceVersions: assembly.cache.sourceVersions,
  });

  const record = {
    schema: 'aurora.w06h.context_quality_performance.v1',
    measurementScope: MEASUREMENT_SCOPE,
    fixtureVersion: FIXTURE_VERSION,
    fixtureHash: fixtureHash(),
    packageMeasurement: {
      method: 'JSON_UTF8_BYTES_TEST_FIXTURE',
      utf8Bytes: Buffer.byteLength(JSON.stringify(assembly.package), 'utf8'),
      inputCanonicalUnits: assembly.package.metrics.inputCanonicalUnits,
      outputCanonicalUnits: assembly.package.metrics.outputCanonicalUnits,
      retainedRatioBps: assembly.package.metrics.retainedRatioBps,
      compressionSavingsBps: assembly.package.metrics.compressionSavingsBps,
    },
    retrievalFanout: {
      querySelectorCount: fixture.query.selectors.length,
      attemptedSelectors: fixture.acquisition.attemptedSelectors,
      invokedAdapterCount: fixture.acquisition.invokedAdapters.length,
      invokedAdapters: fixture.acquisition.invokedAdapters,
    },
    cacheMetrics: {
      hits: hit.status === 'HIT' ? 1 : 0,
      staleRejected: stale.status === 'STALE_REJECTED' ? 1 : 0,
      invalidatedRejected: invalidatedStatus.status === 'INVALIDATED_REJECTED' ? 1 : 0,
      authorityElevationViolations: [hit, stale, invalidatedStatus].filter(
        (entry) => entry.authorizesExecution !== false,
      ).length,
    },
    assemblyLatencyMs: benchmark.latencyMs,
    invalidationObservationLatencyMs,
    invalidationMeasurementDefinition:
      'LOCAL_APPLY_INVALIDATION_PLUS_CACHE_REJECTION_OBSERVATION_TEST_ONLY',
    benchmarkIterations: BENCHMARK_ITERATIONS,
    concurrencyIterations: CONCURRENCY_ITERATIONS,
    providerCalls: NOT_OBSERVED,
    modelCalls: NOT_OBSERVED,
    toolCalls: NOT_OBSERVED,
    productionSlo: NOT_OBSERVED,
    environment: {
      harnessVersion: HARNESS_VERSION,
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
  };

  assert.equal(record.measurementScope, 'TEST_ONLY_NOT_PRODUCTION_SLO');
  assert.ok(record.packageMeasurement.utf8Bytes > 0);
  assert.equal(record.retrievalFanout.querySelectorCount, 3);
  assert.equal(record.retrievalFanout.invokedAdapterCount, 3);
  assert.equal(record.cacheMetrics.hits, 1);
  assert.equal(record.cacheMetrics.staleRejected, 1);
  assert.equal(record.cacheMetrics.invalidatedRejected, 1);
  assert.equal(record.cacheMetrics.authorityElevationViolations, 0);
  assert.equal(record.productionSlo, NOT_OBSERVED);
  assert.equal(record.providerCalls, NOT_OBSERVED);
  assert.equal(record.modelCalls, NOT_OBSERVED);
  assert.equal(record.toolCalls, NOT_OBSERVED);

  console.log(`W06H_CONTEXT_QUALITY_PERFORMANCE ${JSON.stringify(record)}`);
});
