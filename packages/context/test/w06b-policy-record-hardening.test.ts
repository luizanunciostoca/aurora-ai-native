// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- context harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import { evaluateContextRetrieval } from '../src/retrieval/index.js';
import type { ContextRetrievalRequest } from '../src/retrieval/types.js';

function baseRequest(): ContextRetrievalRequest {
  return {
    query: {
      kind: 'ContextQuery',
      schemaVersion: '1.0.0',
      tenant: { tenantId: 'tenant:alpha' },
      correlation: { correlationId: 'corr:w06b:policy-hardening' },
      actor: { kind: 'AGENT', identityId: 'identity:agent' },
      subject: { kind: 'IDENTITY', identityId: 'identity:subject' },
      purpose: {
        kind: 'PurposeContext',
        purposeId: 'support.current-context',
        version: '1.0.0',
        status: 'ACTIVE',
        allowedDataClassifications: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL'],
      },
      jurisdiction: { kind: 'JurisdictionContext', jurisdiction: 'BR', version: '1.0.0' },
      consent: { kind: 'CONSENT_RECORD', reference: 'consent:subject:w06b', version: '1.0.0' },
      requiresConsent: true,
      maxDataClassification: 'CONFIDENTIAL',
      currentness: 'CURRENT_REQUIRED',
      selectors: [
        {
          adapterId: 'source:company-primary',
          sourceClass: 'COMPANY_KNOWLEDGE',
          key: 'documentRef',
          value: 'doc:primary',
        },
      ],
      requestedFields: ['title', 'body'],
      limits: { maxSourceFanout: 1, maxItemsPerSource: 4, maxTotalItems: 4 },
    },
    acquisition: {
      kind: 'ContextAcquisitionResult',
      items: [
        {
          sourceReference: 'fact:primary',
          sourceRevision: 'rev:1',
          tenant: { tenantId: 'tenant:alpha' },
          subject: { kind: 'IDENTITY', identityId: 'identity:subject' },
          classification: 'INTERNAL',
          observedAt: '2026-09-02T03:30:00Z',
          provenanceReference: 'evidence:primary:1',
          payload: { title: 'Refund window', body: 'Thirty days.' },
          adapterId: 'source:company-primary',
          sourceClass: 'COMPANY_KNOWLEDGE',
        },
      ],
      rejections: [],
      attemptedSelectors: 1,
      invokedAdapters: ['source:company-primary'],
      authorizesExecution: false,
    },
    policy: {
      evaluatedAt: '2026-09-02T04:00:00Z',
      minimumTrustBps: 6000,
      trustBpsByAdapter: { 'source:company-primary': 9000 },
      maxAgeMsBySourceClass: { COMPANY_KNOWLEDGE: 2 * 60 * 60 * 1000 },
    },
  } as unknown as ContextRetrievalRequest;
}

function policyReasons(request: ContextRetrievalRequest): readonly string[] {
  return evaluateContextRetrieval(request).rejections.map((entry) => entry.reason);
}

test('W06-B rejects inherited trust and freshness policy values', () => {
  const trustBase = baseRequest();
  const inheritedTrust = {
    ...trustBase,
    policy: {
      ...trustBase.policy,
      trustBpsByAdapter: Object.create({ 'source:company-primary': 9000 }),
    },
  } as ContextRetrievalRequest;

  const freshnessBase = baseRequest();
  const inheritedFreshness = {
    ...freshnessBase,
    policy: {
      ...freshnessBase.policy,
      maxAgeMsBySourceClass: Object.create({ COMPANY_KNOWLEDGE: 7_200_000 }),
    },
  } as ContextRetrievalRequest;

  assert.deepEqual(policyReasons(inheritedTrust), ['POLICY_INVALID']);
  assert.deepEqual(policyReasons(inheritedFreshness), ['POLICY_INVALID']);
});

test('W06-B rejects accessor-backed policy values without executing getters', () => {
  let getterCalls = 0;
  const accessorTrust: Record<string, number> = {};
  Object.defineProperty(accessorTrust, 'source:company-primary', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 9000;
    },
  });

  const base = baseRequest();
  const request = {
    ...base,
    policy: { ...base.policy, trustBpsByAdapter: accessorTrust },
  } as ContextRetrievalRequest;

  assert.deepEqual(policyReasons(request), ['POLICY_INVALID']);
  assert.equal(getterCalls, 0);
});
