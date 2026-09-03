// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { CorrelationId, TenantId } from '@aurora/contracts';

import {
  planNextBestActions,
  type NbaIntelligenceRouteProjection,
  type NextBestActionPlanningInput,
  type NextBestActionRule,
} from '../src/nba/index.js';

const TENANT_A = 'ten_01JW10ETENANTA00000000000' as TenantId;
const TENANT_B = 'ten_01JW10ETENANTB00000000000' as TenantId;
const CORRELATION = 'cor_01JW10ECORRELATION0000000' as CorrelationId;

function rule(overrides: Partial<NextBestActionRule> = {}): NextBestActionRule {
  return {
    ruleId: 'qualified-sales-handoff',
    actionType: 'PREPARE_SALES_HANDOFF',
    entityKinds: ['LEAD'],
    lifecycleStates: ['QUALIFIED'],
    qualificationStages: ['QUALIFIED'],
    requiredFactKeys: ['contact-channel-verified'],
    priorityBps: 9_000,
    impact: 'INTERNAL_PREPARATION',
    rationale: 'Qualified lead with a verified contact channel is ready for handoff preparation.',
    provenanceReferences: ['crm:lead-001', 'rule:w10e:qualified-sales-handoff'],
    ...overrides,
  };
}

function route(
  disposition: NbaIntelligenceRouteProjection['confidence']['disposition'] = 'PROCEED_WITH_EVIDENCE',
): NbaIntelligenceRouteProjection {
  return {
    source: 'W05_INTELLIGENCE_ROUTE',
    tenantId: TENANT_A,
    correlationId: CORRELATION,
    routeReference: 'route:w05:decision-41',
    routeVersion: '1.0.0',
    status: disposition === 'ABSTAIN' ? 'ABSTAINED' : 'SELECTED',
    family: 'SPECIALIST',
    confidence: {
      evaluationReference: 'confidence:w05:eval-41',
      scoreBps: disposition === 'ABSTAIN' ? null : 8_700,
      disposition,
      calibrationInterfaceVersion: '1.0.0',
      authorizesExecution: false,
      canGrantPermission: false,
    },
    authorizesExecution: false,
    canGrantPermission: false,
  };
}

function verifiedFact(
  status: 'VERIFIED_CURRENT' | 'STALE' | 'CONFLICTED' | 'UNKNOWN' = 'VERIFIED_CURRENT',
) {
  return {
    tenantId: TENANT_A,
    key: 'contact-channel-verified',
    status,
    sourceSystem: 'crm-profile',
    sourceRevision: 'profile-r11',
    observedAt: '2026-09-03T08:01:00Z',
    sourceReference: 'profile:lead-001',
  } as const;
}

function fixture(
  overrides: Partial<NextBestActionPlanningInput> = {},
): NextBestActionPlanningInput {
  return {
    tenantId: TENANT_A,
    correlation: { correlationId: CORRELATION },
    evaluatedAt: '2026-09-03T08:10:00Z',
    ruleSetVersion: 'nba-rules-1',
    reasoningMode: 'DETERMINISTIC',
    crm: {
      current: true,
      currentnessReasons: [],
      model: {
        tenantId: TENANT_A,
        entity: { kind: 'LEAD', entityId: 'lead-001' },
        lifecycleState: 'QUALIFIED',
        entityVersion: 4,
        sourceSystem: 'crm',
        sourceRevision: 'crm-r19',
        sourceReference: 'crm:lead-001',
        observedAt: '2026-09-03T08:00:00Z',
        projectedAt: '2026-09-03T08:00:01Z',
        historyBasis: 'AUTHORITATIVE_SNAPSHOT',
        authorizesExecution: false,
        canGrantPermission: false,
      },
    },
    qualification: {
      kind: 'REVENUE_QUALIFICATION_EVALUATION',
      schemaVersion: '1.0.0',
      tenantId: TENANT_A,
      entity: { kind: 'LEAD', entityId: 'lead-001' },
      entityVersion: 4,
      featureSetRevision: 'features-r8',
      ruleSetVersion: 'qualification-rules-3',
      thresholdVersion: 'thresholds-2',
      evaluatedAt: '2026-09-03T08:02:00Z',
      correlation: { correlationId: CORRELATION },
      mode: 'DETERMINISTIC',
      scoreBps: 8_500,
      stage: 'QUALIFIED',
      coverageBps: 10_000,
      contributions: [],
      missingCriticalFeatures: [],
      reviewDisposition: 'NONE',
      authorizesExecution: false,
      canGrantPermission: false,
    },
    facts: [verifiedFact()],
    capabilityPlan: {
      source: 'W04_CAPABILITY_PLAN',
      tenantId: TENANT_A,
      correlationId: CORRELATION,
      planReference: 'capability-plan:w04:77',
      registryVersion: 'registry-r22',
      status: 'READY',
      capabilityId: 'revenue.next-best-action',
      budget: {
        budgetReference: 'budget:w04:77',
        state: 'WITHIN_BUDGET',
        action: 'CONTINUE_OPTIONAL',
        canSkipMandatoryValidation: false,
        authorizesExecution: false,
      },
      authorizesExecution: false,
      canGrantPermission: false,
    },
    context: {
      source: 'W06_MINIMAL_CONTEXT_PACKAGE',
      tenantId: TENANT_A,
      correlationId: CORRELATION,
      packageReference: 'context:w06:lead-001:r5',
      packageVersion: '5',
      compiledAt: '2026-09-03T08:03:00Z',
      current: true,
      conflictingSourceReferences: [],
      authorizesExecution: false,
      canGrantPermission: false,
    },
    rules: [
      rule(),
      rule({
        ruleId: 'qualified-nurture-backup',
        actionType: 'PREPARE_NURTURE_TOUCH',
        priorityBps: 7_000,
        rationale: 'Keep a bounded nurture preparation as a secondary candidate.',
        provenanceReferences: ['rule:w10e:qualified-nurture-backup'],
      }),
    ],
    maxCandidates: 5,
    ...overrides,
  };
}

test('W10-E deterministically ranks applicable candidates with rationale and evidence', () => {
  const first = planNextBestActions(fixture());
  const second = planNextBestActions(fixture({ rules: [...fixture().rules].reverse() }));
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(first.plan.disposition, 'SELECTED');
  assert.equal(first.plan.reason, 'CANDIDATES_RANKED');
  assert.deepEqual(first.plan.candidates, second.plan.candidates);
  assert.deepEqual(
    first.plan.candidates.map((candidate) => candidate.actionType),
    ['PREPARE_SALES_HANDOFF', 'PREPARE_NURTURE_TOUCH'],
  );
  assert.equal(first.plan.evidence.capabilityPlanReference, 'capability-plan:w04:77');
  assert.equal(first.plan.evidence.budgetReference, 'budget:w04:77');
  assert.equal(first.plan.evidence.contextPackageReference, 'context:w06:lead-001:r5');
});

test('W10-E uses stable candidate-id tie breaking and enforces the result bound', () => {
  const result = planNextBestActions(
    fixture({
      rules: [
        rule({ ruleId: 'z-rule', priorityBps: 8_000 }),
        rule({ ruleId: 'a-rule', priorityBps: 8_000 }),
      ],
      maxCandidates: 1,
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.plan.candidates.map((item) => item.candidateId),
    ['nba:a-rule'],
  );
});

test('W10-E fails closed across tenant, entity and version boundaries', () => {
  const crossTenant = fixture({
    context: { ...fixture().context, tenantId: TENANT_B },
  });
  assert.deepEqual(planNextBestActions(crossTenant), { ok: false, error: 'TENANT_MISMATCH' });

  const entityMismatch = fixture({
    qualification: {
      ...fixture().qualification,
      entity: { kind: 'LEAD', entityId: 'lead-other' },
    },
  });
  assert.deepEqual(planNextBestActions(entityMismatch), { ok: false, error: 'ENTITY_MISMATCH' });

  const versionMismatch = fixture({
    qualification: { ...fixture().qualification, entityVersion: 3 },
  });
  assert.deepEqual(planNextBestActions(versionMismatch), {
    ok: false,
    error: 'ENTITY_VERSION_CONFLICT',
  });
});

test('W10-E abstains on stale CRM, incomplete qualification and blocked capability plans', () => {
  const stale = planNextBestActions(
    fixture({ crm: { ...fixture().crm, current: false, currentnessReasons: ['MODEL_TOO_OLD'] } }),
  );
  const incomplete = planNextBestActions(
    fixture({
      qualification: {
        ...fixture().qualification,
        stage: 'INCOMPLETE',
        scoreBps: null,
        missingCriticalFeatures: ['budget-fit'],
      },
    }),
  );
  const blocked = planNextBestActions(
    fixture({ capabilityPlan: { ...fixture().capabilityPlan, status: 'BLOCKED' } }),
  );
  assert.equal(stale.ok && stale.plan.reason, 'CRM_NOT_CURRENT');
  assert.equal(incomplete.ok && incomplete.plan.reason, 'QUALIFICATION_INCOMPLETE');
  assert.equal(blocked.ok && blocked.plan.reason, 'CAPABILITY_PLAN_BLOCKED');
});

test('W10-E abstains when required facts are missing, stale, conflicted or unknown', () => {
  for (const status of ['STALE', 'CONFLICTED', 'UNKNOWN'] as const) {
    const result = planNextBestActions(fixture({ facts: [verifiedFact(status)] }));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.plan.disposition, 'ABSTAIN');
      assert.equal(result.plan.reason, 'REQUIRED_FACT_UNAVAILABLE');
    }
  }
  const missing = planNextBestActions(fixture({ facts: [] }));
  assert.equal(missing.ok && missing.plan.reason, 'REQUIRED_FACT_UNAVAILABLE');
});

test('W10-E carries accepted W05 route confidence and escalates verify/review dispositions', () => {
  for (const disposition of ['VERIFY', 'ESCALATE'] as const) {
    const result = planNextBestActions(
      fixture({ reasoningMode: 'ROUTED', route: route(disposition) }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.equal(result.plan.disposition, 'ESCALATE');
    assert.equal(result.plan.reason, 'ROUTE_CONFIDENCE_REQUIRES_REVIEW');
    assert.equal(result.plan.evidence.confidenceDisposition, disposition);
    assert.equal(result.plan.evidence.routeReference, 'route:w05:decision-41');
  }
  const qualificationReview = planNextBestActions(
    fixture({
      qualification: { ...fixture().qualification, reviewDisposition: 'VERIFY_MODEL_ASSIST' },
    }),
  );
  assert.equal(
    qualificationReview.ok && qualificationReview.plan.reason,
    'QUALIFICATION_REVIEW_REQUIRED',
  );
});

test('W10-E explicitly abstains when routed reasoning has no usable route', () => {
  const missing = planNextBestActions(fixture({ reasoningMode: 'ROUTED' }));
  const abstained = planNextBestActions(
    fixture({ reasoningMode: 'ROUTED', route: route('ABSTAIN') }),
  );
  assert.equal(missing.ok && missing.plan.reason, 'ROUTE_REQUIRED');
  assert.equal(abstained.ok && abstained.plan.reason, 'ROUTE_ABSTAINED');
});

test('W10-E escalates conflicting context, exhausted budget and external side effects', () => {
  const conflict = planNextBestActions(
    fixture({
      context: {
        ...fixture().context,
        conflictingSourceReferences: ['crm:lead-001', 'warehouse:lead-001'],
      },
    }),
  );
  assert.equal(conflict.ok && conflict.plan.reason, 'CONTEXT_CONFLICT');

  const exhausted = planNextBestActions(
    fixture({
      capabilityPlan: {
        ...fixture().capabilityPlan,
        budget: {
          ...fixture().capabilityPlan.budget,
          state: 'EXHAUSTED',
          action: 'HOLD',
        },
      },
    }),
  );
  assert.equal(exhausted.ok && exhausted.plan.reason, 'BUDGET_RESTRICTED');

  const external = planNextBestActions(
    fixture({ rules: [rule({ impact: 'EXTERNAL_SIDE_EFFECT' })] }),
  );
  assert.equal(external.ok, true);
  if (!external.ok) return;
  assert.equal(external.plan.disposition, 'ESCALATE');
  assert.equal(external.plan.reason, 'EXTERNAL_SIDE_EFFECT_REQUIRES_GOVERNED_FLOW');
  assert.equal(external.plan.candidates[0]?.requiresGovernedExecution, true);
  assert.equal(external.plan.candidates[0]?.createsActionIntent, false);
});

test('W10-E rejects duplicate/future evidence, duplicate rules and oversized bounds', () => {
  const duplicateFact = planNextBestActions(fixture({ facts: [verifiedFact(), verifiedFact()] }));
  assert.deepEqual(duplicateFact, { ok: false, error: 'FACT_DUPLICATE' });

  const futureFact = planNextBestActions(
    fixture({ facts: [{ ...verifiedFact(), observedAt: '2026-09-03T08:10:01Z' }] }),
  );
  assert.deepEqual(futureFact, { ok: false, error: 'FACT_FUTURE_OBSERVATION' });

  const duplicateRule = planNextBestActions(fixture({ rules: [rule(), rule()] }));
  assert.deepEqual(duplicateRule, { ok: false, error: 'RULE_DUPLICATE' });

  const oversized = planNextBestActions(fixture({ maxCandidates: 33 }));
  assert.deepEqual(oversized, { ok: false, error: 'REQUEST_MALFORMED' });
});

test('W10-E benchmark scenario is repeatable and never creates authority or ActionIntent', () => {
  const expected = planNextBestActions(fixture());
  assert.equal(expected.ok, true);
  for (let index = 0; index < 250; index += 1) {
    assert.deepEqual(planNextBestActions(fixture()), expected);
  }
  if (!expected.ok) return;
  assert.equal(expected.plan.authoritySemantics, 'DOMAIN_CANDIDATE_ONLY_NO_ACTION_INTENT');
  assert.equal(expected.plan.downstreamExecutionStillRequiresCurrentValidation, true);
  assert.equal(expected.plan.authorizesExecution, false);
  assert.equal(expected.plan.canGrantPermission, false);
  for (const item of expected.plan.candidates) {
    assert.equal(item.createsActionIntent, false);
    assert.equal(item.authorizesExecution, false);
    assert.equal(item.canGrantPermission, false);
  }
});
