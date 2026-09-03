// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { CorrelationId, TenantId } from '@aurora/contracts';

import {
  resolveVerifiedFaqFastPath,
  summarizeVerifiedFaqBenchmark,
  type VerifiedFactProjection,
  type VerifiedFaqLookupInput,
  type VerifiedFaqTemplateProjection,
} from '../src/social/verified-faq.js';

const TENANT_A = 'ten_01JW11DTENANTA00000000000' as TenantId;
const TENANT_B = 'ten_01JW11DTENANTB00000000000' as TenantId;
const CORRELATION = 'cor_01JW11DCORRELATION0000000' as CorrelationId;

function fact(overrides: Partial<VerifiedFactProjection> = {}): VerifiedFactProjection {
  return {
    factId: 'fact:hours:main',
    tenantId: TENANT_A,
    kind: 'HOURS',
    key: 'opening-hours',
    value: '16:30-22:00',
    confidence: 0.99,
    sourceReference: 'drive:operations:hours',
    sourceRevision: 'rev-42',
    expectedSourceRevision: 'rev-42',
    provenanceReference: 'evidence:hours:42',
    observedAt: '2026-09-03T14:00:00Z',
    expiresAt: '2026-09-03T18:00:00Z',
    invalidated: false,
    authorizesExecution: false,
    ...overrides,
  };
}

function template(
  overrides: Partial<VerifiedFaqTemplateProjection> = {},
): VerifiedFaqTemplateProjection {
  return {
    templateId: 'template:hours:v3',
    tenantId: TENANT_A,
    kind: 'HOURS',
    key: 'opening-hours',
    body: 'Nosso horário hoje é {{value}}.',
    active: true,
    sourceReference: 'template-registry:faq',
    sourceRevision: 'tpl-3',
    expectedSourceRevision: 'tpl-3',
    provenanceReference: 'curation:faq:hours:v3',
    authorizesExecution: false,
    ...overrides,
  };
}

function input(overrides: Partial<VerifiedFaqLookupInput> = {}): VerifiedFaqLookupInput {
  return {
    tenantId: TENANT_A,
    correlationId: CORRELATION,
    kind: 'HOURS',
    key: 'opening-hours',
    evaluatedAt: '2026-09-03T15:00:00Z',
    minimumConfidence: 0.95,
    facts: [fact()],
    template: template(),
    ...overrides,
  };
}

test('returns a deterministic answer with evidence and no write authority', () => {
  const result = resolveVerifiedFaqFastPath(input());
  assert.equal(result.status, 'ANSWER');
  assert.equal(result.authorizesExecution, false);

  if (result.status === 'ANSWER') {
    assert.equal(result.answer, 'Nosso horário hoje é 16:30-22:00.');
    assert.equal(result.factId, 'fact:hours:main');
    assert.deepEqual(result.reasons, []);
    assert.deepEqual(result.evidenceReferences, [
      'evidence:hours:42',
      'drive:operations:hours',
      'curation:faq:hours:v3',
      'template-registry:faq',
    ]);
  }
});

test('fails closed when the fact is stale or its source revision changed', () => {
  const stale = resolveVerifiedFaqFastPath(
    input({ facts: [fact({ expiresAt: '2026-09-03T14:59:59Z' })] }),
  );

  assert.equal(stale.status, 'ESCALATE');
  if (stale.status === 'ESCALATE') {
    assert.deepEqual(stale.reasons, ['STALE_FACT']);
  }

  const changed = resolveVerifiedFaqFastPath(
    input({ facts: [fact({ sourceRevision: 'rev-41' })] }),
  );

  assert.equal(changed.status, 'ESCALATE');
  if (changed.status === 'ESCALATE') {
    assert.deepEqual(changed.reasons, ['SOURCE_CHANGED']);
  }
});

test('rejects invalid confidence thresholds and impossible fact timing', () => {
  for (const minimumConfidence of [-0.01, 1.01, Number.NaN]) {
    const invalidThreshold = resolveVerifiedFaqFastPath(input({ minimumConfidence }));
    assert.equal(invalidThreshold.status, 'ESCALATE');
    if (invalidThreshold.status === 'ESCALATE') {
      assert.deepEqual(invalidThreshold.reasons, ['INVALID_CONFIDENCE_THRESHOLD']);
    }
  }

  const futureFact = resolveVerifiedFaqFastPath(
    input({ facts: [fact({ observedAt: '2026-09-03T15:00:01Z' })] }),
  );
  assert.equal(futureFact.status, 'ESCALATE');
  if (futureFact.status === 'ESCALATE') {
    assert.deepEqual(futureFact.reasons, ['INVALID_FACT_TIME']);
  }

  const impossibleWindow = resolveVerifiedFaqFastPath(
    input({ facts: [fact({ expiresAt: '2026-09-03T13:59:59Z' })] }),
  );
  assert.equal(impossibleWindow.status, 'ESCALATE');
  if (impossibleWindow.status === 'ESCALATE') {
    assert.deepEqual(impossibleWindow.reasons, ['INVALID_FACT_TIME']);
  }
});

test('requires complete provenance for facts and curated templates', () => {
  const missingFactSource = resolveVerifiedFaqFastPath(
    input({ facts: [fact({ sourceReference: '' })] }),
  );
  assert.equal(missingFactSource.status, 'ESCALATE');
  if (missingFactSource.status === 'ESCALATE') {
    assert.deepEqual(missingFactSource.reasons, ['MISSING_PROVENANCE']);
  }

  const missingTemplateSource = resolveVerifiedFaqFastPath(
    input({ template: template({ sourceReference: '' }) }),
  );
  assert.equal(missingTemplateSource.status, 'ESCALATE');
  if (missingTemplateSource.status === 'ESCALATE') {
    assert.deepEqual(missingTemplateSource.reasons, ['TEMPLATE_INVALID']);
  }
});

test('escalates conflicting values instead of guessing', () => {
  const result = resolveVerifiedFaqFastPath(
    input({
      facts: [fact(), fact({ factId: 'fact:hours:secondary', value: '17:00-22:00' })],
    }),
  );

  assert.equal(result.status, 'ESCALATE');
  if (result.status === 'ESCALATE') {
    assert.deepEqual(result.reasons, ['CONFLICTING_FACTS']);
  }
});

test('enforces tenant isolation and validates curated template provenance', () => {
  const isolated = resolveVerifiedFaqFastPath(input({ facts: [fact({ tenantId: TENANT_B })] }));
  assert.equal(isolated.status, 'ESCALATE');
  if (isolated.status === 'ESCALATE') {
    assert.deepEqual(isolated.reasons, ['NO_VERIFIED_FACT']);
  }

  const invalidTemplate = resolveVerifiedFaqFastPath(
    input({ template: template({ provenanceReference: '' }) }),
  );

  assert.equal(invalidTemplate.status, 'ESCALATE');
  if (invalidTemplate.status === 'ESCALATE') {
    assert.deepEqual(invalidTemplate.reasons, ['TEMPLATE_INVALID']);
  }
});

test('requires sufficient confidence and valid evaluation time', () => {
  const weak = resolveVerifiedFaqFastPath(input({ facts: [fact({ confidence: 0.4 })] }));
  assert.equal(weak.status, 'ESCALATE');
  if (weak.status === 'ESCALATE') {
    assert.deepEqual(weak.reasons, ['LOW_CONFIDENCE']);
  }

  const invalidFactConfidence = resolveVerifiedFaqFastPath(
    input({ facts: [fact({ confidence: 1.01 })] }),
  );
  assert.equal(invalidFactConfidence.status, 'ESCALATE');
  if (invalidFactConfidence.status === 'ESCALATE') {
    assert.deepEqual(invalidFactConfidence.reasons, ['LOW_CONFIDENCE']);
  }

  const invalidTime = resolveVerifiedFaqFastPath(input({ evaluatedAt: 'not-a-date' }));
  assert.equal(invalidTime.status, 'ESCALATE');
  if (invalidTime.status === 'ESCALATE') {
    assert.deepEqual(invalidTime.reasons, ['INVALID_EVALUATION_TIME']);
  }
});

test('benchmarks latency and cost improvement independently of authority', () => {
  const summary = summarizeVerifiedFaqBenchmark([
    {
      baselineLatencyMs: 1000,
      fastPathLatencyMs: 200,
      baselineCostMicros: 500,
      fastPathCostMicros: 100,
    },
    {
      baselineLatencyMs: 500,
      fastPathLatencyMs: 100,
      baselineCostMicros: 250,
      fastPathCostMicros: 50,
    },
  ]);

  assert.equal(summary.sampleCount, 2);
  assert.equal(summary.averageBaselineLatencyMs, 750);
  assert.equal(summary.averageFastPathLatencyMs, 150);
  assert.equal(summary.latencyReductionPercent, 80);
  assert.equal(summary.averageBaselineCostMicros, 375);
  assert.equal(summary.averageFastPathCostMicros, 75);
  assert.equal(summary.costReductionPercent, 80);
});
