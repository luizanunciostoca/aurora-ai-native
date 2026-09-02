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

import { validateContextQuery } from '../src/query/index.js';
import type { ContextQuery, ContextSelector } from '../src/query/types.js';
import { acquireContextCandidates } from '../src/sources/index.js';
import type { ContextSourceAdapter, ContextSourceReadRequest } from '../src/sources/types.js';

const version = '1.0.0' as ContractVersion;
const tenant: TenantContext = { tenantId: 'tenant:alpha' as TenantId };
const otherTenant: TenantContext = { tenantId: 'tenant:beta' as TenantId };
const correlation: CorrelationContext = {
  correlationId: 'corr:context:1' as CorrelationId,
};
const subject: SubjectRef = {
  kind: 'IDENTITY',
  identityId: 'identity:subject' as IdentityId,
};
const otherSubject: SubjectRef = {
  kind: 'IDENTITY',
  identityId: 'identity:other' as IdentityId,
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
  reference: 'consent:subject:1',
  version,
};
const selector: ContextSelector = {
  adapterId: 'source:company-kb',
  sourceClass: 'COMPANY_KNOWLEDGE',
  key: 'documentRef',
  value: 'doc:faq:refunds',
};

const at = (value: string) => value as Rfc3339Timestamp;

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
    selectors: [selector],
    requestedFields: ['title', 'body'],
    limits: { maxSourceFanout: 4, maxItemsPerSource: 5, maxTotalItems: 10 },
    ...overrides,
  };
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    sourceReference: 'company-kb:doc:faq:refunds',
    sourceRevision: 'sha256:abc123',
    tenant,
    subject,
    classification: 'INTERNAL' as const,
    observedAt: at('2026-09-02T03:00:00Z'),
    provenanceReference: 'evidence:company-kb:abc123',
    payload: { title: 'Refunds', body: 'Governed source text.' },
    ...overrides,
  };
}

function adapter(
  read: ContextSourceAdapter['read'],
  overrides: Partial<ContextSourceAdapter['descriptor']> = {},
): ContextSourceAdapter {
  return {
    descriptor: {
      adapterId: 'source:company-kb',
      sourceClass: 'COMPANY_KNOWLEDGE',
      readOnly: true,
      supportedSelectorKeys: ['documentRef'],
      maxItemsPerRead: 8,
      ...overrides,
    },
    read,
  };
}

test('W06-A propagates canonical constraints into a bounded read-only adapter request', async () => {
  let captured: ContextSourceReadRequest | undefined;
  const result = await acquireContextCandidates({
    query: query(),
    adapters: [
      adapter(async (request) => {
        captured = request;
        return { items: [item()] };
      }),
    ],
  });

  assert.equal(result.authorizesExecution, false);
  assert.deepEqual(result.rejections, []);
  assert.deepEqual(
    result.items.map((entry) => entry.sourceReference),
    ['company-kb:doc:faq:refunds'],
  );
  assert.equal(captured?.tenant.tenantId, tenant.tenantId);
  assert.equal(captured?.correlation.correlationId, correlation.correlationId);
  assert.deepEqual(captured?.subject, subject);
  assert.equal(captured?.purpose.purposeId, purpose.purposeId);
  assert.equal(captured?.jurisdiction.jurisdiction, jurisdiction.jurisdiction);
  assert.equal(captured?.consent?.reference, consent.reference);
  assert.equal(captured?.maxDataClassification, 'CONFIDENTIAL');
  assert.equal(captured?.limit, 5);
});

test('W06-A rejects empty and whole-store selectors before source reads', async () => {
  let calls = 0;
  const readAdapter = adapter(async () => {
    calls += 1;
    return { items: [] };
  });
  const empty = validateContextQuery(query({ selectors: [] }));
  const wildcard = validateContextQuery(query({ selectors: [{ ...selector, value: '*' }] }));
  const acquired = await acquireContextCandidates({
    query: query({ selectors: [] }),
    adapters: [readAdapter],
  });

  assert.equal(empty.valid, false);
  assert.equal(wildcard.valid, false);
  if (!wildcard.valid) {
    assert.equal(wildcard.reasons.includes('WHOLE_STORE_SELECTOR_FORBIDDEN'), true);
  }
  assert.deepEqual(acquired.rejections, [{ reason: 'QUERY_INVALID' }]);
  assert.equal(calls, 0);
});

test('W06-A enforces finite fan-out, item and duplicate-selector bounds', () => {
  const duplicate = validateContextQuery(query({ selectors: [selector, selector] }));
  const fanout = validateContextQuery(
    query({
      limits: { maxSourceFanout: 1, maxItemsPerSource: 5, maxTotalItems: 10 },
      selectors: [
        selector,
        {
          adapterId: 'source:evidence',
          sourceClass: 'EVIDENCE',
          key: 'evidenceRef',
          value: 'evidence:1',
        },
      ],
    }),
  );
  const invalidLimits = validateContextQuery(
    query({ limits: { maxSourceFanout: 33, maxItemsPerSource: 101, maxTotalItems: 1025 } }),
  );

  assert.equal(duplicate.valid, false);
  assert.equal(fanout.valid, false);
  assert.equal(invalidLimits.valid, false);
  if (!duplicate.valid) assert.equal(duplicate.reasons.includes('DUPLICATE_SELECTOR'), true);
  if (!fanout.valid) assert.equal(fanout.reasons.includes('SOURCE_FANOUT_LIMIT_EXCEEDED'), true);
  if (!invalidLimits.valid) assert.equal(invalidLimits.reasons.includes('INVALID_LIMITS'), true);
});

test('W06-A fails closed for purpose, classification and consent constraints', () => {
  const disabled = validateContextQuery(query({ purpose: { ...purpose, status: 'DISABLED' } }));
  const classification = validateContextQuery(
    query({
      purpose: { ...purpose, allowedDataClassifications: ['PUBLIC', 'INTERNAL'] },
      maxDataClassification: 'CONFIDENTIAL',
    }),
  );
  const { consent: omittedConsent, ...withoutConsent } = query();
  void omittedConsent;
  const missingConsent = validateContextQuery({ ...withoutConsent, requiresConsent: true });

  assert.equal(disabled.valid, false);
  assert.equal(classification.valid, false);
  assert.equal(missingConsent.valid, false);
  if (!disabled.valid) assert.equal(disabled.reasons.includes('PURPOSE_DISABLED'), true);
  if (!classification.valid) {
    assert.equal(classification.reasons.includes('PURPOSE_CLASSIFICATION_MISMATCH'), true);
  }
  if (!missingConsent.valid)
    assert.equal(missingConsent.reasons.includes('CONSENT_REQUIRED'), true);
});

test('W06-A rejects unsafe source items and keeps only tenant-safe provenanced items', async () => {
  const result = await acquireContextCandidates({
    query: query({ limits: { maxSourceFanout: 4, maxItemsPerSource: 8, maxTotalItems: 10 } }),
    adapters: [
      adapter(async () => ({
        items: [
          item({ sourceReference: 'item:tenant', tenant: otherTenant }),
          item({ sourceReference: 'item:subject', subject: otherSubject }),
          item({ sourceReference: 'item:restricted', classification: 'RESTRICTED' }),
          item({ sourceReference: 'item:no-provenance', provenanceReference: '' }),
          item({ sourceReference: 'item:valid' }),
        ],
      })),
    ],
  });

  assert.deepEqual(
    result.items.map((entry) => entry.sourceReference),
    ['item:valid'],
  );
  assert.deepEqual(
    result.rejections.map((entry) => entry.reason),
    ['CROSS_TENANT_ITEM', 'SUBJECT_MISMATCH', 'CLASSIFICATION_EXCEEDED', 'MISSING_PROVENANCE'],
  );
});

test('W06-A fails closed when adapters exceed source or total item bounds', async () => {
  const overflowing = adapter(async () => ({
    items: [item(), item({ sourceReference: 'item:2' })],
  }));
  const sourceLimit = await acquireContextCandidates({
    query: query({ limits: { maxSourceFanout: 4, maxItemsPerSource: 1, maxTotalItems: 10 } }),
    adapters: [overflowing],
  });
  const totalLimit = await acquireContextCandidates({
    query: query({ limits: { maxSourceFanout: 4, maxItemsPerSource: 5, maxTotalItems: 1 } }),
    adapters: [overflowing],
  });

  assert.deepEqual(sourceLimit.items, []);
  assert.deepEqual(
    sourceLimit.rejections.map((entry) => entry.reason),
    ['ITEM_LIMIT_EXCEEDED'],
  );
  assert.deepEqual(totalLimit.items, []);
  assert.deepEqual(
    totalLimit.rejections.map((entry) => entry.reason),
    ['TOTAL_ITEM_LIMIT_EXCEEDED'],
  );
});

test('W06-A source discovery failures remain explicit and non-authoritative', async () => {
  const missing = await acquireContextCandidates({ query: query(), adapters: [] });
  const unsupported = await acquireContextCandidates({
    query: query(),
    adapters: [adapter(async () => ({ items: [] }), { supportedSelectorKeys: ['recordId'] })],
  });
  const tamperedWritable = {
    ...adapter(async () => ({ items: [] })),
    descriptor: {
      adapterId: 'source:company-kb',
      sourceClass: 'COMPANY_KNOWLEDGE',
      readOnly: false,
      supportedSelectorKeys: ['documentRef'],
      maxItemsPerRead: 8,
    },
  } as unknown as ContextSourceAdapter;
  const writable = await acquireContextCandidates({
    query: query(),
    adapters: [tamperedWritable],
  });

  assert.equal(missing.authorizesExecution, false);
  assert.deepEqual(
    missing.rejections.map((entry) => entry.reason),
    ['ADAPTER_NOT_FOUND'],
  );
  assert.deepEqual(
    unsupported.rejections.map((entry) => entry.reason),
    ['SELECTOR_UNSUPPORTED'],
  );
  assert.deepEqual(
    writable.rejections.map((entry) => entry.reason),
    ['ADAPTER_NOT_READ_ONLY'],
  );
});
