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

import type { ContextQuery, ContextSelector, ContextSourceClass } from '../src/query/types.js';
import { evaluateContextRetrieval } from '../src/retrieval/index.js';
import type { ContextRetrievalPolicy } from '../src/retrieval/types.js';
import type {
  AcquiredContextItem,
  ContextAcquisitionResult,
  ContextSourceRejection,
} from '../src/sources/types.js';

const version = '1.0.0' as ContractVersion;
const tenant: TenantContext = { tenantId: 'tenant:alpha' as TenantId };
const otherTenant: TenantContext = { tenantId: 'tenant:beta' as TenantId };
const correlation: CorrelationContext = {
  correlationId: 'corr:context:w06b' as CorrelationId,
};
const subject: SubjectRef = {
  kind: 'IDENTITY',
  identityId: 'identity:subject' as IdentityId,
};
const purpose: PurposeContext = {
  kind: 'PurposeContext',
  purposeId: 'support.current-context',
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
  reference: 'consent:subject:w06b',
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

function query(overrides: Partial<ContextQuery> = {}): ContextQuery {
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
    selectors: [selector('source:company-primary')],
    requestedFields: ['title', 'body'],
    limits: { maxSourceFanout: 4, maxItemsPerSource: 8, maxTotalItems: 16 },
    ...overrides,
  };
}

function acquiredItem(overrides: Partial<AcquiredContextItem> = {}): AcquiredContextItem {
  return {
    sourceReference: 'fact:primary',
    sourceRevision: 'rev:1',
    tenant,
    subject,
    classification: 'INTERNAL',
    observedAt: at('2026-09-02T03:30:00Z'),
    provenanceReference: 'evidence:primary:1',
    payload: { title: 'Refund window', body: 'Thirty days.' },
    adapterId: 'source:company-primary',
    sourceClass: 'COMPANY_KNOWLEDGE',
    ...overrides,
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
    attemptedSelectors: 1,
    invokedAdapters: [...new Set(items.map((item) => item.adapterId))],
    authorizesExecution: false,
  };
}

function policy(overrides: Partial<ContextRetrievalPolicy> = {}): ContextRetrievalPolicy {
  return {
    evaluatedAt: at('2026-09-02T04:00:00Z'),
    minimumTrustBps: 6000,
    trustBpsByAdapter: {
      'source:company-primary': 9000,
      'source:company-secondary': 8000,
      'source:evidence': 9500,
    },
    maxAgeMsBySourceClass: {
      COMPANY_KNOWLEDGE: 2 * 60 * 60 * 1000,
      EVIDENCE: 24 * 60 * 60 * 1000,
    },
    ...overrides,
  };
}

test('W06-B ranking is deterministic for fixed evidence and trust config', () => {
  const q = query({
    selectors: [selector('source:company-primary'), selector('source:company-secondary')],
  });
  const primary = acquiredItem();
  const secondary = acquiredItem({
    sourceReference: 'fact:secondary',
    sourceRevision: 'rev:2',
    provenanceReference: 'evidence:secondary:2',
    adapterId: 'source:company-secondary',
    observedAt: at('2026-09-02T03:50:00Z'),
  });

  const first = evaluateContextRetrieval({ query: q, acquisition: acquisition([secondary, primary]), policy: policy() });
  const second = evaluateContextRetrieval({ query: q, acquisition: acquisition([primary, secondary]), policy: policy() });

  assert.equal(first.authorizesExecution, false);
  assert.deepEqual(first.rejections, []);
  assert.deepEqual(
    first.items.map((item) => [item.sourceReference, item.retrieval.rank, item.retrieval.trust.scoreBps]),
    [
      ['fact:primary', 1, 9000],
      ['fact:secondary', 2, 8000],
    ],
  );
  assert.deepEqual(
    first.items.map((item) => item.sourceReference),
    second.items.map((item) => item.sourceReference),
  );
});

test('W06-B rejects stale current facts and preserves historical facts explicitly', () => {
  const stale = acquiredItem({ observedAt: at('2026-09-02T00:00:00Z') });
  const currentRequired = evaluateContextRetrieval({
    query: query(),
    acquisition: acquisition([stale]),
    policy: policy({ maxAgeMsBySourceClass: { COMPANY_KNOWLEDGE: 60 * 60 * 1000 } }),
  });
  const historicalAllowed = evaluateContextRetrieval({
    query: query({ currentness: 'HISTORICAL_ALLOWED' }),
    acquisition: acquisition([stale]),
    policy: policy({ maxAgeMsBySourceClass: { COMPANY_KNOWLEDGE: 60 * 60 * 1000 } }),
  });

  assert.deepEqual(currentRequired.items, []);
  assert.deepEqual(currentRequired.rejections.map((entry) => entry.reason), [
    'STALE_CURRENT_REQUIRED',
  ]);
  assert.equal(historicalAllowed.items.length, 1);
  assert.equal(historicalAllowed.items[0]?.retrieval.freshness.state, 'HISTORICAL');
  assert.deepEqual(historicalAllowed.items[0]?.retrieval.uncertainty, ['HISTORICAL_SOURCE']);
});

test('W06-B makes unknown freshness explicit and never treats it as current', () => {
  const currentRequired = evaluateContextRetrieval({
    query: query(),
    acquisition: acquisition([acquiredItem()]),
    policy: policy({ maxAgeMsBySourceClass: {} }),
  });
  const historicalAllowed = evaluateContextRetrieval({
    query: query({ currentness: 'HISTORICAL_ALLOWED' }),
    acquisition: acquisition([acquiredItem()]),
    policy: policy({ maxAgeMsBySourceClass: {} }),
  });

  assert.deepEqual(currentRequired.rejections.map((entry) => entry.reason), [
    'FRESHNESS_RULE_MISSING',
  ]);
  assert.equal(historicalAllowed.items[0]?.retrieval.freshness.state, 'UNKNOWN');
  assert.deepEqual(historicalAllowed.items[0]?.retrieval.uncertainty, ['FRESHNESS_UNKNOWN']);
});

test('W06-B trust basis is explicit and below-threshold or unknown trust fails closed', () => {
  const below = evaluateContextRetrieval({
    query: query(),
    acquisition: acquisition([acquiredItem()]),
    policy: policy({ trustBpsByAdapter: { 'source:company-primary': 5000 } }),
  });
  const unknown = evaluateContextRetrieval({
    query: query(),
    acquisition: acquisition([acquiredItem()]),
    policy: policy({ trustBpsByAdapter: {} }),
  });
  const accepted = evaluateContextRetrieval({
    query: query(),
    acquisition: acquisition([acquiredItem()]),
    policy: policy(),
  });

  assert.deepEqual(below.rejections.map((entry) => entry.reason), ['TRUST_BELOW_MINIMUM']);
  assert.deepEqual(unknown.rejections.map((entry) => entry.reason), ['TRUST_UNKNOWN']);
  assert.equal(accepted.items[0]?.retrieval.trust.basis, 'ADAPTER_CONFIG');
  assert.equal(accepted.items[0]?.retrieval.trust.scoreBps, 9000);
  assert.equal(accepted.authorizesExecution, false);
});

test('W06-B preserves conflicting facts instead of selecting a silent winner', () => {
  const q = query({
    selectors: [selector('source:company-primary'), selector('source:company-secondary')],
    currentness: 'HISTORICAL_ALLOWED',
  });
  const primary = acquiredItem({ sourceReference: 'fact:refund:primary' });
  const secondary = acquiredItem({
    sourceReference: 'fact:refund:secondary',
    adapterId: 'source:company-secondary',
    provenanceReference: 'evidence:secondary:conflict',
    payload: { title: 'Refund window', body: 'Fourteen days.' },
  });
  const result = evaluateContextRetrieval({
    query: q,
    acquisition: acquisition([primary, secondary]),
    policy: policy({
      conflictKeyBySourceReference: {
        'fact:refund:primary': 'semantic:refund-window',
        'fact:refund:secondary': 'semantic:refund-window',
      },
    }),
  });

  assert.equal(result.items.length, 2);
  for (const item of result.items) {
    assert.equal(item.retrieval.conflict.state, 'CONFLICTING');
    assert.equal(item.retrieval.conflict.key, 'semantic:refund-window');
    assert.equal(item.retrieval.uncertainty.includes('CONFLICTING_FACT'), true);
    assert.equal(item.retrieval.conflict.peerSourceReferences.length, 1);
  }
  assert.equal(result.authorizesExecution, false);
});

test('W06-B duplicate evidence cannot inflate ranking and conflicting source identity is quarantined', () => {
  const base = acquiredItem();
  const duplicate = evaluateContextRetrieval({
    query: query(),
    acquisition: acquisition([base, { ...base }]),
    policy: policy(),
  });
  const poisoned = evaluateContextRetrieval({
    query: query(),
    acquisition: acquisition([
      base,
      acquiredItem({
        sourceReference: base.sourceReference,
        provenanceReference: 'evidence:tampered',
        payload: { title: 'Refund window', body: 'Never.' },
      }),
    ]),
    policy: policy(),
  });

  assert.equal(duplicate.items.length, 1);
  assert.deepEqual(duplicate.rejections.map((entry) => entry.reason), ['DUPLICATE_SOURCE_ITEM']);
  assert.deepEqual(poisoned.items, []);
  assert.deepEqual(poisoned.rejections.map((entry) => entry.reason), [
    'SOURCE_IDENTITY_CONFLICT',
    'SOURCE_IDENTITY_CONFLICT',
  ]);
});

test('W06-B rejects future, unrequested, cross-tenant and runtime-invalid classification evidence', () => {
  const q = query();
  const tamperedClassification = acquiredItem({
    sourceReference: 'fact:classification',
  }) as unknown as Record<string, unknown>;
  tamperedClassification.classification = 'SECRET';

  const result = evaluateContextRetrieval({
    query: q,
    acquisition: acquisition([
      acquiredItem({ sourceReference: 'fact:future', observedAt: at('2026-09-02T05:00:00Z') }),
      acquiredItem({
        sourceReference: 'fact:unrequested',
        adapterId: 'source:company-secondary',
      }),
      acquiredItem({ sourceReference: 'fact:tenant', tenant: otherTenant }),
      tamperedClassification as unknown as AcquiredContextItem,
    ]),
    policy: policy(),
  });

  assert.deepEqual(result.items, []);
  assert.deepEqual(result.rejections.map((entry) => entry.reason), [
    'FUTURE_OBSERVATION',
    'UNREQUESTED_SOURCE_ITEM',
    'CROSS_TENANT_ITEM',
    'CLASSIFICATION_INVALID',
  ]);
});

test('W06-B rejects unrankable payloads and preserves upstream acquisition failures', () => {
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const upstream: ContextSourceRejection = {
    adapterId: 'source:missing',
    reason: 'ADAPTER_NOT_FOUND',
  };
  const result = evaluateContextRetrieval({
    query: query(),
    acquisition: acquisition([acquiredItem({ payload: cyclic })], [upstream]),
    policy: policy(),
  });

  assert.deepEqual(result.items, []);
  assert.deepEqual(result.rejections.map((entry) => entry.reason), ['PAYLOAD_UNRANKABLE']);
  assert.deepEqual(result.upstreamRejections, [upstream]);
  assert.equal(result.authorizesExecution, false);
});

test('W06-B invalid query, acquisition or policy fails closed without authority', () => {
  const invalidQuery = evaluateContextRetrieval({
    query: query({ selectors: [] }),
    acquisition: acquisition([]),
    policy: policy(),
  });
  const invalidAcquisition = evaluateContextRetrieval({
    query: query(),
    acquisition: {
      ...acquisition([]),
      authorizesExecution: true,
    } as unknown as ContextAcquisitionResult,
    policy: policy(),
  });
  const invalidPolicy = evaluateContextRetrieval({
    query: query(),
    acquisition: acquisition([]),
    policy: policy({ minimumTrustBps: 10_001 }),
  });

  assert.deepEqual(invalidQuery.rejections, [{ reason: 'QUERY_INVALID' }]);
  assert.deepEqual(invalidAcquisition.rejections, [{ reason: 'ACQUISITION_INVALID' }]);
  assert.deepEqual(invalidPolicy.rejections, [{ reason: 'POLICY_INVALID' }]);
  assert.equal(invalidQuery.authorizesExecution, false);
  assert.equal(invalidAcquisition.authorizesExecution, false);
  assert.equal(invalidPolicy.authorizesExecution, false);
});
