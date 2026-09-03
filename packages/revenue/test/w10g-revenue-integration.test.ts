// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { CorrelationId, TenantId } from '@aurora/contracts';

import {
  selectRevenueFastPath,
  type RevenueFastPathSelectionInput,
} from '../src/fast-path/index.js';
import { planRevenueFlow, type PlanRevenueFlowInput } from '../src/flows/index.js';
import {
  evaluateRevenueIntegration,
  type RevenueBusinessOutcomeObservation,
  type RevenueExecutionEvidenceProjection,
  type RevenueHumanCorrection,
  type RevenueIntegrationEvaluationInput,
  type RevenueProviderReadbackProjection,
} from '../src/integration/index.js';
import { planNextBestActions, type NextBestActionPlanningInput } from '../src/nba/index.js';

const TENANT_A = 'ten_01JW10GTENANTA00000000000' as TenantId;
const TENANT_B = 'ten_01JW10GTENANTB00000000000' as TenantId;
const CORRELATION = 'cor_01JW10GCORRELATION0000000' as CorrelationId;

function crm() {
  return {
    current: true,
    currentnessReasons: [],
    model: {
      tenantId: TENANT_A,
      entity: { kind: 'LEAD' as const, entityId: 'lead-001' },
      lifecycleState: 'QUALIFIED' as const,
      entityVersion: 4,
      sourceSystem: 'crm',
      sourceRevision: 'crm-r31',
      sourceReference: 'crm:lead-001:r31',
      observedAt: '2026-09-03T08:00:00Z',
      projectedAt: '2026-09-03T08:00:01Z',
      correlation: { correlationId: CORRELATION },
      historyBasis: 'AUTHORITATIVE_SNAPSHOT' as const,
      authorizesExecution: false as const,
      canGrantPermission: false as const,
    },
  };
}

function qualification() {
  return {
    kind: 'REVENUE_QUALIFICATION_EVALUATION' as const,
    schemaVersion: '1.0.0' as const,
    tenantId: TENANT_A,
    entity: { kind: 'LEAD' as const, entityId: 'lead-001' },
    entityVersion: 4,
    featureSetRevision: 'features-r12',
    ruleSetVersion: 'qualification-rules-7',
    thresholdVersion: 'thresholds-4',
    evaluatedAt: '2026-09-03T08:02:00Z',
    correlation: { correlationId: CORRELATION },
    mode: 'DETERMINISTIC' as const,
    scoreBps: 8_900,
    stage: 'QUALIFIED' as const,
    coverageBps: 10_000,
    contributions: [],
    missingCriticalFeatures: [],
    reviewDisposition: 'NONE' as const,
    authorizesExecution: false as const,
    canGrantPermission: false as const,
  };
}

function nbaInput(): NextBestActionPlanningInput {
  return {
    tenantId: TENANT_A,
    correlation: { correlationId: CORRELATION },
    evaluatedAt: '2026-09-03T08:10:00Z',
    ruleSetVersion: 'nba-rules-4',
    reasoningMode: 'DETERMINISTIC',
    crm: crm(),
    qualification: qualification(),
    facts: [
      {
        tenantId: TENANT_A,
        key: 'contact-channel-verified',
        status: 'VERIFIED_CURRENT',
        sourceSystem: 'crm-profile',
        sourceRevision: 'profile-r17',
        observedAt: '2026-09-03T08:03:00Z',
        sourceReference: 'profile:lead-001:r17',
      },
    ],
    capabilityPlan: {
      source: 'W04_CAPABILITY_PLAN',
      tenantId: TENANT_A,
      correlationId: CORRELATION,
      planReference: 'capability-plan:w04:w10g-1',
      registryVersion: 'registry-r30',
      status: 'READY',
      capabilityId: 'revenue.next-best-action',
      budget: {
        budgetReference: 'budget:w04:w10g-1',
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
      packageReference: 'context:w06:lead-001:r11',
      packageVersion: '11',
      compiledAt: '2026-09-03T08:04:00Z',
      current: true,
      conflictingSourceReferences: [],
      authorizesExecution: false,
      canGrantPermission: false,
    },
    rules: [
      {
        ruleId: 'qualified-sales-handoff',
        actionType: 'PREPARE_SALES_HANDOFF',
        entityKinds: ['LEAD'],
        lifecycleStates: ['QUALIFIED'],
        qualificationStages: ['QUALIFIED'],
        requiredFactKeys: ['contact-channel-verified'],
        priorityBps: 9_200,
        impact: 'INTERNAL_PREPARATION',
        rationale: 'Prepare a governed sales handoff for a qualified lead.',
        provenanceReferences: ['rule:w10g:sales-handoff'],
      },
    ],
    maxCandidates: 4,
  };
}

function flowInput(): PlanRevenueFlowInput {
  return {
    tenantId: TENANT_A,
    flowId: 'flow:w10g:lead-001:sales',
    evaluatedAt: '2026-09-03T08:11:00Z',
    correlation: { correlationId: CORRELATION },
    crm: crm(),
    qualification: qualification(),
    contactPolicy: {
      tenantId: TENANT_A,
      evaluatedAt: '2026-09-03T08:09:00Z',
      current: true,
      consentStatus: 'ALLOWED',
      allowedPurposes: ['SALES'],
      sourceRevision: 'consent-r12',
      sourceReference: 'policy:w02:lead-001:r12',
      authorizesExecution: false,
      canGrantPermission: false,
    },
    template: {
      source: 'W04_TEMPLATE_PLAN',
      tenantId: TENANT_A,
      templateReference: 'template:w04:sales-handoff',
      templateVersion: '5',
      status: 'READY',
      flowKind: 'SALES',
      steps: [
        {
          stepId: 'sales-handoff-1',
          taskKind: 'PREPARE_SALES_HANDOFF',
          contactPurpose: 'SALES',
          externalAction: true,
          cadenceMs: 0,
          maxAttempts: 2,
        },
      ],
      authorizesExecution: false,
      canGrantPermission: false,
    },
  };
}

function fastPathInput(): RevenueFastPathSelectionInput {
  return {
    evaluatedAt: '2026-09-03T08:12:00Z',
    task: {
      taskId: 'task:w10g:crm-read',
      tenantId: TENANT_A,
      correlation: { correlationId: CORRELATION },
      taskKind: 'CRM_CURRENT_READ',
      entity: { kind: 'LEAD', entityId: 'lead-001' },
      entityVersion: 4,
      inputContractVersion: '1.0.0',
      riskClass: 'LOW',
      valueClass: 'ROUTINE',
      conflictCount: 0,
      staleMaterialEvidence: false,
      externalWrite: false,
    },
    control: {
      source: 'W04_LANE_CAPABILITY_BUDGET',
      tenantId: TENANT_A,
      correlationId: CORRELATION,
      lane: 'FAST',
      preferredPlanningStrategy: 'DETERMINISTIC',
      capabilityPlanReference: 'capability-plan:w04:w10g-fast',
      capabilityPlanStatus: 'READY',
      registryVersion: 'registry-r30',
      budgetReference: 'budget:w04:w10g-fast',
      budgetState: 'WITHIN_BUDGET',
      budgetAction: 'CONTINUE_OPTIONAL',
      mandatoryValidations: ['CURRENT_POLICY', 'CURRENT_AUTHORITY', 'EXECUTOR_PRECONDITIONS'],
      authorizesExecution: false,
      canGrantPermission: false,
    },
    confidence: {
      source: 'W05_CONFIDENCE',
      tenantId: TENANT_A,
      correlationId: CORRELATION,
      evaluationReference: 'confidence:w05:w10g-fast',
      scoreBps: 9_300,
      disposition: 'PROCEED_WITH_EVIDENCE',
      calibrationInterfaceVersion: '1.0.0',
      authorizesExecution: false,
      canGrantPermission: false,
    },
  };
}

function verifiedExecution(
  overrides: Partial<RevenueExecutionEvidenceProjection> = {},
): RevenueExecutionEvidenceProjection {
  return {
    source: 'W07_EXECUTION_RESULT',
    tenantId: TENANT_A,
    correlationId: CORRELATION,
    actionIntentReference: 'act:w10g:sales-handoff-1',
    executionReference: 'exec:w10g:sales-handoff-1',
    outcome: 'VERIFIED',
    observedAt: '2026-09-03T08:15:00Z',
    authoritativeEvidenceReference: 'evidence:w07:sales-handoff-1',
    authorizesExecution: false,
    canGrantPermission: false,
    ...overrides,
  };
}

function providerReadback(
  overrides: Partial<RevenueProviderReadbackProjection> = {},
): RevenueProviderReadbackProjection {
  return {
    source: 'W08_PROVIDER_READBACK',
    tenantId: TENANT_A,
    correlationId: CORRELATION,
    actionIntentReference: 'act:w10g:sales-handoff-1',
    observedAt: '2026-09-03T08:15:30Z',
    observation: 'EFFECT_OBSERVED',
    reference: 'provider-readback:w10g:1',
    providerRevision: 'provider-r44',
    retryAuthorized: false,
    authorizesExecution: false,
    canGrantPermission: false,
    ...overrides,
  };
}

function businessOutcome(
  overrides: Partial<RevenueBusinessOutcomeObservation> = {},
): RevenueBusinessOutcomeObservation {
  return {
    kind: 'REVENUE_BUSINESS_OUTCOME_OBSERVATION',
    schemaVersion: '1.0.0',
    tenantId: TENANT_A,
    correlationId: CORRELATION,
    entity: { kind: 'LEAD', entityId: 'lead-001' },
    entityVersion: 4,
    outcomeType: 'SALES_HANDOFF_ACCEPTED',
    verification: 'VERIFIED_BUSINESS_FACT',
    observedAt: '2026-09-03T08:16:00Z',
    sourceSystem: 'crm-sales',
    sourceRevision: 'sales-r8',
    provenanceReference: 'crm-sales:handoff-001:r8',
    authorizesExecution: false,
    canGrantPermission: false,
    ...overrides,
  };
}

function humanCorrection(overrides: Partial<RevenueHumanCorrection> = {}): RevenueHumanCorrection {
  return {
    kind: 'REVENUE_HUMAN_CORRECTION',
    schemaVersion: '1.0.0',
    correctionId: 'correction:w10g:1',
    tenantId: TENANT_A,
    correlationId: CORRELATION,
    entity: { kind: 'LEAD', entityId: 'lead-001' },
    entityVersion: 4,
    disposition: 'REJECT_OUTCOME',
    observedAt: '2026-09-03T08:17:00Z',
    rationale: 'Sales operator corrected the imported CRM outcome after direct review.',
    provenanceReference: 'human-review:w10g:1',
    authorizesExecution: false,
    canGrantPermission: false,
    ...overrides,
  };
}

function fixture(
  overrides: Partial<RevenueIntegrationEvaluationInput> = {},
): RevenueIntegrationEvaluationInput {
  const nbaResult = planNextBestActions(nbaInput());
  if (!nbaResult.ok) throw new Error(`expected NBA fixture: ${nbaResult.error}`);
  const flowResult = planRevenueFlow(flowInput());
  if (!flowResult.ok) throw new Error(`expected flow fixture: ${flowResult.error}`);
  const fastPathResult = selectRevenueFastPath(fastPathInput());
  if (!fastPathResult.ok) throw new Error(`expected fast-path fixture: ${fastPathResult.error}`);
  return {
    evaluationId: 'eval:w10g:lead-001:1',
    tenantId: TENANT_A,
    correlation: { correlationId: CORRELATION },
    evaluatedAt: '2026-09-03T08:20:00Z',
    entity: { kind: 'LEAD', entityId: 'lead-001' },
    entityVersion: 4,
    eventReferences: ['event:lifecycle:4', 'event:qualification:4'],
    crm: crm(),
    qualification: qualification(),
    nba: nbaResult.plan,
    flow: flowResult.plan,
    fastPath: fastPathResult.selection,
    contactPolicy: flowInput().contactPolicy,
    execution: verifiedExecution(),
    providerReadback: providerReadback(),
    businessOutcome: businessOutcome(),
    measurement: {
      measurementScope: 'TEST_FIXTURE_PROXY_NOT_PRODUCTION_SLO_OR_PROVIDER_COST',
      latencyMicros: 1_500,
      modelCalls: 0,
      economicCostMicrounits: 12,
      budget: {
        budgetReference: 'budget:w10g:integration-1',
        maxLatencyMicros: 5_000,
        maxModelCalls: 1,
        maxEconomicCostMicrounits: 100,
      },
      providerCost: 'NOT_OBSERVED',
      productionSlo: 'NOT_OBSERVED',
    },
    ...overrides,
  };
}

test('W10-G integrates accepted W10-D/E/F evidence without granting authority', () => {
  const result = evaluateRevenueIntegration(fixture());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.evaluation.disposition, 'PASS');
  assert.equal(result.evaluation.reason, 'INTEGRATION_EVIDENCE_ACCEPTED');
  assert.equal(result.evaluation.businessOutcome.status, 'VERIFIED_BUSINESS_OUTCOME');
  assert.equal(result.evaluation.businessOutcome.suitableForW17W18Evaluation, true);
  assert.equal(result.evaluation.businessOutcome.adaptiveLearningPromotionAllowed, false);
  assert.equal(result.evaluation.authoritySemantics, 'INTEGRATION_EVIDENCE_ONLY_NO_ACTION_INTENT');
  assert.equal(result.evaluation.downstreamExecutionStillRequiresCurrentValidation, true);
  assert.equal(result.evaluation.authorizesExecution, false);
  assert.equal(result.evaluation.canGrantPermission, false);
  assert.equal(result.evaluation.budget.providerCost, 'NOT_OBSERVED');
  assert.equal(result.evaluation.budget.productionSlo, 'NOT_OBSERVED');
});

test('W10-G rejects duplicate event references instead of double-counting delivery', () => {
  const result = evaluateRevenueIntegration(
    fixture({ eventReferences: ['event:lifecycle:4', 'event:lifecycle:4'] }),
  );
  assert.deepEqual(result, { ok: false, error: 'DUPLICATE_EVENT_REFERENCE' });
});

test('W10-G abstains on stale CRM state before considering outcome evidence', () => {
  const result = evaluateRevenueIntegration(
    fixture({ crm: { ...crm(), current: false, currentnessReasons: ['MODEL_TOO_OLD'] } }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.evaluation.disposition, 'ABSTAIN');
  assert.equal(result.evaluation.reason, 'CRM_NOT_CURRENT');
});

test('W10-G fails closed across tenant and correlation boundaries', () => {
  const wrongTenant = evaluateRevenueIntegration(
    fixture({ execution: verifiedExecution({ tenantId: TENANT_B }) }),
  );
  assert.deepEqual(wrongTenant, { ok: false, error: 'TENANT_MISMATCH' });

  const wrongCorrelation = evaluateRevenueIntegration(
    fixture({
      providerReadback: providerReadback({
        correlationId: 'cor_01JW10GOTHER000000000000' as CorrelationId,
      }),
    }),
  );
  assert.deepEqual(wrongCorrelation, { ok: false, error: 'CORRELATION_MISMATCH' });
});

test('W10-G invalidates external continuation when consent or purpose changes', () => {
  const policy = flowInput().contactPolicy;
  const result = evaluateRevenueIntegration(
    fixture({
      contactPolicy: {
        ...policy,
        evaluatedAt: '2026-09-03T08:18:00Z',
        consentStatus: 'OPTED_OUT',
        allowedPurposes: [],
        sourceRevision: 'consent-r13',
      },
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.evaluation.disposition, 'ABSTAIN');
  assert.equal(result.evaluation.reason, 'CONSENT_OR_PURPOSE_CHANGED');
});

test('W10-G never treats provider acknowledgement or readback alone as VERIFIED execution', () => {
  const result = evaluateRevenueIntegration(
    fixture({ execution: verifiedExecution({ outcome: 'EXECUTED_ACKNOWLEDGED' }) }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.evaluation.disposition, 'ESCALATE');
  assert.equal(result.evaluation.reason, 'EXECUTION_NOT_VERIFIED');
  assert.equal(result.evaluation.businessOutcome.executionOutcome, 'EXECUTED_ACKNOWLEDGED');
});

test('W10-G preserves EXECUTION_UNCERTAIN even when W08 reports no effect', () => {
  const result = evaluateRevenueIntegration(
    fixture({
      execution: verifiedExecution({ outcome: 'EXECUTION_UNCERTAIN' }),
      providerReadback: providerReadback({ observation: 'NO_EFFECT_CONFIRMED' }),
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.evaluation.disposition, 'ESCALATE');
  assert.equal(result.evaluation.reason, 'RECONCILIATION_REQUIRED');
  assert.equal(result.evaluation.authorizesExecution, false);
});

test('W10-G detects contradictory readback after a W07 VERIFIED result', () => {
  const result = evaluateRevenueIntegration(
    fixture({ providerReadback: providerReadback({ observation: 'NO_EFFECT_CONFIRMED' }) }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.evaluation.disposition, 'ESCALATE');
  assert.equal(result.evaluation.reason, 'EXECUTION_READBACK_CONFLICT');
});

test('W10-G accepts human correction as learning-evaluation evidence without permission elevation', () => {
  const result = evaluateRevenueIntegration(fixture({ humanCorrection: humanCorrection() }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.evaluation.disposition, 'PASS');
  assert.equal(result.evaluation.businessOutcome.status, 'HUMAN_REJECTED_OUTCOME');
  assert.equal(result.evaluation.businessOutcome.suitableForW17W18Evaluation, true);
  assert.equal(result.evaluation.businessOutcome.adaptiveLearningPromotionAllowed, false);
  assert.equal(result.evaluation.authorizesExecution, false);
});

test('W10-G refuses to promote an unverified business observation', () => {
  const result = evaluateRevenueIntegration(
    fixture({ businessOutcome: businessOutcome({ verification: 'UNVERIFIED_OBSERVATION' }) }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.evaluation.disposition, 'ABSTAIN');
  assert.equal(result.evaluation.reason, 'BUSINESS_OUTCOME_UNVERIFIED');
  assert.equal(result.evaluation.businessOutcome.suitableForW17W18Evaluation, false);
});

test('W10-G escalates when performance or economic proxy budget is exceeded', () => {
  const base = fixture().measurement;
  const result = evaluateRevenueIntegration(
    fixture({
      measurement: {
        ...base,
        latencyMicros: base.budget.maxLatencyMicros + 1,
        modelCalls: base.budget.maxModelCalls + 1,
      },
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.evaluation.disposition, 'ESCALATE');
  assert.equal(result.evaluation.reason, 'BUDGET_EXCEEDED');
  assert.equal(result.evaluation.budget.withinBudget, false);
});

test('W10-G rejects W07/W08 evidence that references different action intents', () => {
  const result = evaluateRevenueIntegration(
    fixture({
      providerReadback: providerReadback({ actionIntentReference: 'act:w10g:other' }),
    }),
  );
  assert.deepEqual(result, { ok: false, error: 'EXECUTION_READBACK_REFERENCE_MISMATCH' });
});

test('W10-G is reproducible for equivalent bounded versioned evidence', () => {
  const first = evaluateRevenueIntegration(fixture());
  const second = evaluateRevenueIntegration(
    fixture({ eventReferences: [...fixture().eventReferences].reverse() }),
  );
  assert.deepEqual(second, first);
});
