// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { CorrelationId, TenantId } from '@aurora/contracts';

import { planMetaAdsDomainIntent, type MetaAdsCapabilityPlan } from '../src/meta-ads/contracts.js';
import {
  planCreativeAndAudience,
  type W12CreativeAudiencePlanningInput,
  type W12CreativeAudienceTemplate,
  type W12VerifiedPlanningFact,
} from '../src/meta-ads/creative-audience-planning.js';

const TENANT = 'ten_01JW12CTENANT000000000000' as TenantId;
const OTHER_TENANT = 'ten_01JW12COTHER0000000000000' as TenantId;
const CORRELATION = 'cor_01JW12CCORRELATION0000000' as CorrelationId;

function domainPlan(
  operation: 'CREATE_PAUSED' | 'ACTIVATE' = 'CREATE_PAUSED',
): MetaAdsCapabilityPlan {
  const result = planMetaAdsDomainIntent({
    tenantId: TENANT,
    correlationId: CORRELATION,
    intentId: `intent:${operation.toLowerCase()}`,
    resourceKind: 'AD',
    operation,
    providerBindingReference: 'meta-binding:toca',
    adAccountExternalId: 'act_123',
    target:
      operation === 'CREATE_PAUSED'
        ? { auroraResourceId: 'aurora:ad:candidate' }
        : { meta: { provider: 'META_ADS', resourceKind: 'AD', externalId: '987' } },
    capability: {
      source: 'W04_CAPABILITY_REGISTRY',
      capabilityId: 'meta.ads.ad.write',
      registryVersion: '42',
      targetKind: 'PROVIDER',
      compatibilityKey: 'meta-ads',
      authorizesExecution: false,
    },
    ...(operation === 'ACTIVATE'
      ? { financialScope: { currency: 'BRL', ceilingMinor: 10_000, horizon: 'DAILY' as const } }
      : {}),
  });

  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') throw new Error(result.code);
  return result.plan;
}

function fact(overrides: Partial<W12VerifiedPlanningFact> = {}): W12VerifiedPlanningFact {
  return {
    factId: 'fact:event:party',
    tenantId: TENANT,
    key: 'event-date',
    value: '2026-09-04',
    confidence: 0.99,
    sourceReference: 'drive:event:party',
    sourceRevision: 'rev-8',
    expectedSourceRevision: 'rev-8',
    provenanceReference: 'evidence:event:party:8',
    observedAt: '2026-09-03T14:00:00Z',
    expiresAt: '2026-09-04T06:00:00Z',
    authorizesExecution: false,
    ...overrides,
  };
}

function template(
  overrides: Partial<W12CreativeAudienceTemplate> = {},
): W12CreativeAudienceTemplate {
  return {
    templateId: 'template:nightlife-safe:v2',
    tenantId: TENANT,
    active: true,
    creativePattern: 'Evento confirmado: {{creative}}',
    allowedAudienceTerms: ['nightlife', 'travel'],
    sourceReference: 'template-registry:meta',
    sourceRevision: 'v2',
    expectedSourceRevision: 'v2',
    provenanceReference: 'curation:meta:nightlife:v2',
    authorizesExecution: false,
    ...overrides,
  };
}

function input(
  overrides: Partial<W12CreativeAudiencePlanningInput> = {},
): W12CreativeAudiencePlanningInput {
  return {
    tenantId: TENANT,
    correlationId: CORRELATION,
    planningId: 'planning:party:creative-audience',
    evaluatedAt: '2026-09-03T15:00:00Z',
    minimumFactConfidence: 0.95,
    uncertainty: 'LOW',
    domainPlan: domainPlan(),
    facts: [fact()],
    constraints: {
      content: 'ALLOW',
      targeting: 'ALLOW',
      prohibitedAudienceTerms: ['health-condition', 'religion'],
      maximumEstimatedAudienceSize: 250_000,
      policyReference: 'policy:meta-targeting:v7',
      authorizesExecution: false,
    },
    candidate: {
      creativeText: 'The Party — sexta-feira',
      audienceTerms: ['nightlife', 'travel'],
      estimatedAudienceSize: 120_000,
      estimatedBudgetMinor: 17_000,
      currency: 'BRL',
    },
    template: template(),
    ...overrides,
  };
}

function inputWithoutTemplate(
  overrides: Omit<Partial<W12CreativeAudiencePlanningInput>, 'template'> = {},
): W12CreativeAudiencePlanningInput {
  const { template: removedTemplate, ...withoutTemplate } = input(overrides);
  void removedTemplate;
  return withoutTemplate;
}

test('uses deterministic L0 planning only for a current curated safe template', () => {
  const result = planCreativeAndAudience(input());

  assert.equal(result.status, 'READY');
  if (result.status === 'READY') {
    assert.equal(result.plan.reasoningLevel, 'L0');
    assert.equal(result.plan.creativeText, 'Evento confirmado: The Party — sexta-feira');
    assert.equal(result.plan.deterministicTemplateId, 'template:nightlife-safe:v2');
    assert.equal(result.plan.authorizesExecution, false);
    assert.equal(result.plan.canGrantSpendAuthority, false);
    assert.deepEqual(result.plan.budgetEstimate, {
      estimatedMinor: 17_000,
      currency: 'BRL',
      advisoryOnly: true,
      canIncreaseFinancialAuthority: false,
    });
  }
});

test('uses structured L2 reasoning for bounded planning without a deterministic template', () => {
  const result = planCreativeAndAudience(inputWithoutTemplate({ uncertainty: 'MEDIUM' }));

  assert.equal(result.status, 'READY');
  if (result.status === 'READY') {
    assert.equal(result.plan.reasoningLevel, 'L2');
    assert.equal(result.plan.deterministicTemplateId, undefined);
    assert.equal(result.plan.creativeText, 'The Party — sexta-feira');
  }
});

test('confidence and budget estimates never increase financial or execution authority', () => {
  const result = planCreativeAndAudience(
    input({
      domainPlan: domainPlan('ACTIVATE'),
      facts: [fact({ confidence: 1 })],
      minimumFactConfidence: 1,
    }),
  );

  assert.equal(result.status, 'READY');
  if (result.status === 'READY') {
    assert.equal(result.plan.domainRiskClass, 'HIGH_IMPACT_SERVING_WRITE');
    assert.equal(result.plan.requiresCurrentApproval, true);
    assert.equal(result.plan.requiresW07Execution, true);
    assert.equal(result.plan.authorizesExecution, false);
    assert.equal(result.plan.canGrantSpendAuthority, false);
    assert.equal(result.plan.budgetEstimate?.canIncreaseFinancialAuthority, false);
  }
});

test('fails closed on denied content, targeting and prohibited audience terms', () => {
  const deniedContent = planCreativeAndAudience(
    input({ constraints: { ...input().constraints, content: 'DENY' } }),
  );
  assert.deepEqual(deniedContent, { status: 'BLOCKED', code: 'CONTENT_DENIED' });

  const deniedTargeting = planCreativeAndAudience(
    input({ constraints: { ...input().constraints, targeting: 'DENY' } }),
  );
  assert.deepEqual(deniedTargeting, { status: 'BLOCKED', code: 'TARGETING_DENIED' });

  const prohibited = planCreativeAndAudience(
    input({ candidate: { ...input().candidate, audienceTerms: ['nightlife', 'religion'] } }),
  );
  assert.deepEqual(prohibited, { status: 'BLOCKED', code: 'PROHIBITED_TARGETING_TERM' });
});

test('escalates policy review, stale facts, conflicts and high uncertainty', () => {
  const review = planCreativeAndAudience(
    input({ constraints: { ...input().constraints, targeting: 'REVIEW' } }),
  );
  assert.deepEqual(review, {
    status: 'ESCALATE',
    code: 'POLICY_REVIEW_REQUIRED',
    reasoningLevel: 'L4',
    authorizesExecution: false,
  });

  const stale = planCreativeAndAudience(
    input({ facts: [fact({ expiresAt: '2026-09-03T14:59:59Z' })] }),
  );
  assert.equal(stale.status, 'ESCALATE');
  if (stale.status === 'ESCALATE') assert.equal(stale.code, 'FACT_STALE_OR_INVALID');

  const conflict = planCreativeAndAudience(
    input({
      facts: [fact(), fact({ factId: 'fact:event:party:other', value: '2026-09-05' })],
    }),
  );
  assert.equal(conflict.status, 'ESCALATE');
  if (conflict.status === 'ESCALATE') assert.equal(conflict.code, 'FACT_CONFLICT');

  const high = planCreativeAndAudience(inputWithoutTemplate({ uncertainty: 'HIGH' }));
  assert.deepEqual(high, {
    status: 'ESCALATE',
    code: 'HIGH_UNCERTAINTY',
    reasoningLevel: 'L4',
    authorizesExecution: false,
  });
});

test('enforces tenant/domain-plan/template and audience-bound isolation', () => {
  const crossTenantFact = planCreativeAndAudience(
    input({ facts: [fact({ tenantId: OTHER_TENANT })] }),
  );
  assert.deepEqual(crossTenantFact, { status: 'BLOCKED', code: 'DOMAIN_PLAN_MISMATCH' });

  const wrongDomainPlan = planCreativeAndAudience(
    input({ domainPlan: { ...domainPlan(), tenantId: OTHER_TENANT } }),
  );
  assert.deepEqual(wrongDomainPlan, { status: 'BLOCKED', code: 'DOMAIN_PLAN_MISMATCH' });

  const invalidTemplate = planCreativeAndAudience(
    input({ template: template({ sourceRevision: 'v1' }) }),
  );
  assert.deepEqual(invalidTemplate, { status: 'BLOCKED', code: 'TEMPLATE_INVALID' });

  const oversized = planCreativeAndAudience(
    input({ candidate: { ...input().candidate, estimatedAudienceSize: 300_000 } }),
  );
  assert.deepEqual(oversized, { status: 'BLOCKED', code: 'AUDIENCE_BOUND_EXCEEDED' });
});

test('rejects malformed confidence and budget estimates instead of guessing', () => {
  assert.deepEqual(planCreativeAndAudience(input({ minimumFactConfidence: Number.NaN })), {
    status: 'BLOCKED',
    code: 'INVALID_INPUT',
  });

  assert.deepEqual(
    planCreativeAndAudience(
      input({ candidate: { ...input().candidate, estimatedBudgetMinor: -1, currency: 'BRL' } }),
    ),
    { status: 'BLOCKED', code: 'INVALID_INPUT' },
  );
});
