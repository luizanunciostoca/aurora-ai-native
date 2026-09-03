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

import { compileMinimalContext } from '../src/minimal-context/index.js';
import type { ContextQuery, ContextSelector, ContextSourceClass } from '../src/query/types.js';
import { evaluateContextRetrieval } from '../src/retrieval/index.js';
import type {
  ContextRetrievalPolicy,
  ContextRetrievalResult,
  RankedContextItem,
} from '../src/retrieval/types.js';
import type {
  AcquiredContextItem,
  ContextAcquisitionResult,
  ContextSourceRejection,
} from '../src/sources/types.js';

const version = '1.0.0' as ContractVersion;
const tenant: TenantContext = { tenantId: 'tenant:alpha' as TenantId };
const correlation: CorrelationContext = {
  correlationId: 'corr:context:w06c' as CorrelationId,
};
const subject: SubjectRef = {
  kind: 'IDENTITY',
  identityId: 'identity:subject' as IdentityId,
};
const purpose: PurposeContext = {
  kind: 'PurposeContext',
  purposeId: 'support.minimal-context',
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
  reference: 'consent:subject:w06c',
  version,
};
const at = (value: string) => value as Rfc3339Timestamp;

function selector(
  adapterId: string,
  sourceClass: ContextSourceClass = 'COMPANY_KNOWLEDGE',
): ContextSelector {
  return {
    adapterId,
    sourceClass,
    key: 'documentRef',
    value: `doc:${adapterId}`,
  };
}

function query(adapterIds: readonly string[]): ContextQuery {
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
    selectors: adapterIds.map((adapterId) => selector(adapterId)),
    requestedFields: ['title', 'body'],
    limits: { maxSourceFanout: 8, maxItemsPerSource: 8, maxTotalItems: 16 },
  };
}

function acquiredItem(
  sourceReference: string,
  adapterId: string,
  observedAt: string,
  payload: unknown = { title: sourceReference, body: `body:${sourceReference}` },
): AcquiredContextItem {
  return {
    sourceReference,
    sourceRevision: `rev:${sourceReference}`,
    tenant,
    subject,
    classification: 'INTERNAL',
    observedAt: at(observedAt),
    provenanceReference: `evidence:${sourceReference}`,
    payload,
    adapterId,
    sourceClass: 'COMPANY_KNOWLEDGE',
  };
}

function acquisition(
  items: readonly AcquiredContextItem[],
  rejections: readonly ContextSourceRejection[] = [],
): ContextAcquisitionResult {
  return {
    kind: 'ContextAcquisitionResult',
    items,
    rejections,
    attemptedSelectors: items.length,
    invokedAdapters: [...new Set(items.map((item) => item.adapterId))],
    authorizesExecution: false,
  };
}

function policy(
  trustBpsByAdapter: Readonly<Record<string, number>>,
  conflictKeyBySourceReference?: Readonly<Record<string, string>>,
): ContextRetrievalPolicy {
  return {
    evaluatedAt: at('2026-09-02T20:00:00Z'),
    minimumTrustBps: 6000,
    trustBpsByAdapter,
    maxAgeMsBySourceClass: { COMPANY_KNOWLEDGE: 2 * 60 * 60 * 1000 },
    ...(conflictKeyBySourceReference ? { conflictKeyBySourceReference } : {}),
  };
}

function retrieval(
  q: ContextQuery,
  items: readonly AcquiredContextItem[],
  trustBpsByAdapter: Readonly<Record<string, number>>,
  conflictKeyBySourceReference?: Readonly<Record<string, string>>,
  upstreamRejections: readonly ContextSourceRejection[] = [],
): ContextRetrievalResult {
  return evaluateContextRetrieval({
    query: q,
    acquisition: acquisition(items, upstreamRejections),
    policy: policy(trustBpsByAdapter, conflictKeyBySourceReference),
  });
}

test('W06-C compiles reproducible ranked context and tracks deterministic exclusions', () => {
  const adapters = ['source:primary', 'source:secondary', 'source:tertiary'] as const;
  const q = query(adapters);
  const result = retrieval(
    q,
    [
      acquiredItem('fact:secondary', adapters[1], '2026-09-02T19:50:00Z'),
      acquiredItem('fact:tertiary', adapters[2], '2026-09-02T19:55:00Z'),
      acquiredItem('fact:primary', adapters[0], '2026-09-02T19:40:00Z'),
    ],
    {
      [adapters[0]]: 9500,
      [adapters[1]]: 8500,
      [adapters[2]]: 7500,
    },
    undefined,
    [{ adapterId: 'source:unused', reason: 'ADAPTER_ERROR' }],
  );

  const request = {
    query: q,
    retrieval: result,
    limits: { maxItems: 2, maxCanonicalUnits: 100_000 },
  } as const;
  const first = compileMinimalContext(request);
  const second = compileMinimalContext(request);

  assert.equal(first.valid, true);
  assert.deepEqual(first, second);
  if (!first.valid) return;

  assert.deepEqual(first.package.includedSourceReferences, ['fact:primary', 'fact:secondary']);
  assert.deepEqual(first.package.excludedSources, [
    { sourceReference: 'fact:tertiary', rank: 3, reason: 'ITEM_LIMIT' },
  ]);
  assert.equal(first.package.query, q);
  assert.equal(first.package.query.tenant.tenantId, tenant.tenantId);
  assert.equal(first.package.query.maxDataClassification, 'CONFIDENTIAL');
  assert.equal(first.package.query.currentness, 'CURRENT_REQUIRED');
  assert.equal(first.package.metrics.inputItemCount, 3);
  assert.equal(first.package.metrics.outputItemCount, 2);
  assert.equal(first.package.upstreamRejections.length, 1);
  assert.equal(first.package.authorizesExecution, false);
  assert.equal(first.authorizesExecution, false);
});

test('W06-C enforces canonical-unit pressure without deleting mandatory package constraints', () => {
  const adapters = ['source:primary', 'source:secondary'] as const;
  const q = query(adapters);
  const result = retrieval(
    q,
    [
      acquiredItem('fact:primary', adapters[0], '2026-09-02T19:55:00Z', {
        body: 'A'.repeat(256),
      }),
      acquiredItem('fact:secondary', adapters[1], '2026-09-02T19:50:00Z', {
        body: 'B'.repeat(256),
      }),
    ],
    { [adapters[0]]: 9500, [adapters[1]]: 8500 },
  );

  const generous = compileMinimalContext({
    query: q,
    retrieval: result,
    limits: { maxItems: 2, maxCanonicalUnits: 100_000 },
  });
  assert.equal(generous.valid, true);
  if (!generous.valid) return;

  const pressured = compileMinimalContext({
    query: q,
    retrieval: result,
    limits: {
      maxItems: 2,
      maxCanonicalUnits: Math.max(1, generous.package.metrics.inputCanonicalUnits - 1),
    },
  });
  assert.equal(pressured.valid, true);
  if (!pressured.valid) return;

  assert.ok(pressured.package.metrics.outputItemCount < 2);
  assert.ok(
    pressured.package.excludedSources.some((entry) => entry.reason === 'CANONICAL_UNIT_LIMIT'),
  );
  assert.equal(pressured.package.query.purpose.purposeId, 'support.minimal-context');
  assert.equal(pressured.package.query.jurisdiction.jurisdiction, 'BR');
  assert.equal(pressured.package.query.consent?.reference, 'consent:subject:w06c');
  assert.equal(pressured.package.authorizesExecution, false);
});

test('W06-C never partially includes an explicit conflicting fact group', () => {
  const adapters = ['source:conflict-a', 'source:conflict-b', 'source:stable'] as const;
  const q = query(adapters);
  const result = retrieval(
    q,
    [
      acquiredItem('fact:conflict-a', adapters[0], '2026-09-02T19:55:00Z', { answer: 'A' }),
      acquiredItem('fact:conflict-b', adapters[1], '2026-09-02T19:54:00Z', { answer: 'B' }),
      acquiredItem('fact:stable', adapters[2], '2026-09-02T19:53:00Z', { answer: 'stable' }),
    ],
    { [adapters[0]]: 9500, [adapters[1]]: 9000, [adapters[2]]: 7000 },
    {
      'fact:conflict-a': 'policy:refund-window',
      'fact:conflict-b': 'policy:refund-window',
      'fact:stable': 'stable:key',
    },
  );

  const compiled = compileMinimalContext({
    query: q,
    retrieval: result,
    limits: { maxItems: 1, maxCanonicalUnits: 100_000 },
  });
  assert.equal(compiled.valid, true);
  if (!compiled.valid) return;

  assert.deepEqual(compiled.package.includedSourceReferences, ['fact:stable']);
  assert.deepEqual(
    compiled.package.excludedSources.map((entry) => [entry.sourceReference, entry.reason]),
    [
      ['fact:conflict-a', 'CONFLICT_GROUP_ITEM_LIMIT'],
      ['fact:conflict-b', 'CONFLICT_GROUP_ITEM_LIMIT'],
    ],
  );
});

test('W06-C rejects ranked evidence that would weaken currentness or subject constraints', () => {
  const adapter = 'source:primary';
  const q = query([adapter]);
  const base = retrieval(q, [acquiredItem('fact:primary', adapter, '2026-09-02T19:55:00Z')], {
    [adapter]: 9500,
  });
  const item = base.items[0];
  assert.ok(item);
  if (!item) return;

  const weakened: RankedContextItem = {
    ...item,
    retrieval: {
      ...item.retrieval,
      freshness: { ...item.retrieval.freshness, state: 'HISTORICAL' },
      uncertainty: ['HISTORICAL_SOURCE'],
    },
  };
  const result = compileMinimalContext({
    query: q,
    retrieval: { ...base, items: [weakened] },
    limits: { maxItems: 1, maxCanonicalUnits: 100_000 },
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.reasons, ['INVALID_RANKED_ITEM']);
  assert.equal(result.authorizesExecution, false);
});

test('W06-C canonical measurement rejects accessor-backed payloads without invoking getters', () => {
  const adapter = 'source:primary';
  const q = query([adapter]);
  const base = retrieval(q, [acquiredItem('fact:primary', adapter, '2026-09-02T19:55:00Z')], {
    [adapter]: 9500,
  });
  const item = base.items[0];
  assert.ok(item);
  if (!item) return;

  let getterCalls = 0;
  const payload = {} as Record<string, unknown>;
  Object.defineProperty(payload, 'secret', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'should-not-run';
    },
  });

  const result = compileMinimalContext({
    query: q,
    retrieval: { ...base, items: [{ ...item, payload }] },
    limits: { maxItems: 1, maxCanonicalUnits: 100_000 },
  });

  assert.equal(result.valid, false);
  assert.deepEqual(result.reasons, ['INVALID_RANKED_ITEM']);
  assert.equal(getterCalls, 0);
});

test('W06-C rejects incomplete conflict metadata rather than hiding a peer', () => {
  const adapters = ['source:conflict-a', 'source:conflict-b'] as const;
  const q = query(adapters);
  const base = retrieval(
    q,
    [
      acquiredItem('fact:conflict-a', adapters[0], '2026-09-02T19:55:00Z', { answer: 'A' }),
      acquiredItem('fact:conflict-b', adapters[1], '2026-09-02T19:54:00Z', { answer: 'B' }),
    ],
    { [adapters[0]]: 9500, [adapters[1]]: 9000 },
    {
      'fact:conflict-a': 'policy:refund-window',
      'fact:conflict-b': 'policy:refund-window',
    },
  );
  const first = base.items[0];
  assert.ok(first);
  if (!first) return;

  const broken: RankedContextItem = {
    ...first,
    retrieval: {
      ...first.retrieval,
      conflict: { ...first.retrieval.conflict, peerSourceReferences: [] },
    },
  };
  const result = compileMinimalContext({
    query: q,
    retrieval: { ...base, items: [broken, ...base.items.slice(1)] },
    limits: { maxItems: 2, maxCanonicalUnits: 100_000 },
  });

  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.ok(result.reasons.includes('CONFLICT_GROUP_INVALID'));
  assert.equal(result.authorizesExecution, false);
});
