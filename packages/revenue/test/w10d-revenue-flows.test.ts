// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { CorrelationId, TenantId } from '@aurora/contracts';

import {
  planRevenueFlow,
  type PlanRevenueFlowInput,
  type RevenueFlowTemplateProjection,
} from '../src/flows/index.js';

const TENANT_A = 'ten_01JW10DTENANTA00000000000' as TenantId;
const TENANT_B = 'ten_01JW10DTENANTB00000000000' as TenantId;
const CORRELATION = 'cor_01JW10DCORRELATION0000000' as CorrelationId;

function nurtureTemplate(
  overrides: Partial<RevenueFlowTemplateProjection> = {},
): RevenueFlowTemplateProjection {
  return {
    source: 'W04_TEMPLATE_PLAN',
    tenantId: TENANT_A,
    templateReference: 'template:w04:nurture-default',
    templateVersion: '3',
    status: 'READY',
    flowKind: 'NURTURE',
    steps: [
      {
        stepId: 'touch-1',
        taskKind: 'PREPARE_NURTURE_TOUCH',
        contactPurpose: 'MARKETING',
        externalAction: true,
        cadenceMs: 0,
        maxAttempts: 2,
      },
      {
        stepId: 'touch-2',
        taskKind: 'PREPARE_NURTURE_TOUCH',
        contactPurpose: 'MARKETING',
        externalAction: true,
        cadenceMs: 60_000,
        maxAttempts: 2,
      },
    ],
    authorizesExecution: false,
    canGrantPermission: false,
    ...overrides,
  };
}

function fixture(overrides: Partial<PlanRevenueFlowInput> = {}): PlanRevenueFlowInput {
  return {
    tenantId: TENANT_A,
    flowId: 'flow-lead-001-nurture',
    evaluatedAt: '2026-09-03T08:10:00Z',
    correlation: { correlationId: CORRELATION },
    crm: {
      current: true,
      currentnessReasons: [],
      model: {
        tenantId: TENANT_A,
        entity: { kind: 'LEAD', entityId: 'lead-001' },
        lifecycleState: 'ENGAGED',
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
      scoreBps: 6_500,
      stage: 'NURTURE',
      coverageBps: 10_000,
      contributions: [],
      missingCriticalFeatures: [],
      reviewDisposition: 'NONE',
      authorizesExecution: false,
      canGrantPermission: false,
    },
    contactPolicy: {
      tenantId: TENANT_A,
      evaluatedAt: '2026-09-03T08:09:00Z',
      current: true,
      consentStatus: 'ALLOWED',
      allowedPurposes: ['MARKETING', 'SALES', 'CUSTOMER_SUCCESS'],
      sourceRevision: 'consent-r7',
      sourceReference: 'policy:w02:lead-001:r7',
      authorizesExecution: false,
      canGrantPermission: false,
    },
    template: nurtureTemplate(),
    ...overrides,
  };
}

function requiredQualification() {
  const qualification = fixture().qualification;
  if (qualification === undefined) {
    throw new Error('expected W10-D fixture qualification');
  }
  return qualification;
}

function requiredTemplateStep(template: RevenueFlowTemplateProjection, index = 0) {
  const step = template.steps[index];
  if (step === undefined) {
    throw new Error(`expected W10-D template step ${index}`);
  }
  return step;
}

function firstReady() {
  const result = planRevenueFlow(fixture());
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('expected W10-D fixture to create a task');
  assert.equal(result.plan.disposition, 'TASK_READY');
  return result.plan;
}

test('W10-D creates a deterministic non-authoritative external task', () => {
  const first = planRevenueFlow(fixture());
  const second = planRevenueFlow(fixture());
  assert.deepEqual(first, second);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.plan.reason, 'TASK_CREATED');
  assert.equal(first.plan.task?.requiresGovernedExecution, true);
  assert.equal(first.plan.task?.executionBoundary, 'W07_W08_CURRENT_VALIDATION_REQUIRED');
  assert.equal(first.plan.task?.createsActionIntent, false);
  assert.equal(first.plan.authoritySemantics, 'DOMAIN_TASK_ONLY_NO_ACTION_INTENT');
  assert.equal(first.plan.authorizesExecution, false);
  assert.equal(first.plan.canGrantPermission, false);
});

test('W10-D deduplicates pending outreach until a dispatch outcome is known', () => {
  const created = firstReady();
  const repeat = planRevenueFlow(
    fixture({ evaluatedAt: '2026-09-03T08:11:00Z', existing: created.record }),
  );
  assert.equal(repeat.ok, true);
  if (!repeat.ok) return;
  assert.equal(repeat.plan.disposition, 'WAIT');
  assert.equal(repeat.plan.reason, 'WAITING_FOR_OUTCOME');
  assert.equal(repeat.plan.task, undefined);
  assert.equal(repeat.plan.record.lastTaskDedupeKey, created.task?.dedupeKey);
});

test('W10-D advances only after acknowledgement and enforces cadence', () => {
  const created = firstReady();
  const acknowledged = planRevenueFlow(
    fixture({
      evaluatedAt: '2026-09-03T08:12:00Z',
      existing: created.record,
      dispatchObservation: 'ACKNOWLEDGED',
    }),
  );
  assert.equal(acknowledged.ok, true);
  if (!acknowledged.ok) return;
  assert.equal(acknowledged.plan.reason, 'NOT_YET_DUE');
  assert.equal(acknowledged.plan.record.stepIndex, 1);
  assert.equal(acknowledged.plan.record.nextEligibleAt, '2026-09-03T08:13:00.000Z');

  const due = planRevenueFlow(
    fixture({ evaluatedAt: '2026-09-03T08:13:00Z', existing: acknowledged.plan.record }),
  );
  assert.equal(due.ok, true);
  if (!due.ok) return;
  assert.equal(due.plan.disposition, 'TASK_READY');
  assert.equal(due.plan.task?.stepId, 'touch-2');
});

test('W10-D retries only after confirmed no-effect and never blind-retries uncertainty', () => {
  const created = firstReady();
  const noEffect = planRevenueFlow(
    fixture({
      evaluatedAt: '2026-09-03T08:12:00Z',
      existing: created.record,
      dispatchObservation: 'NO_EFFECT_CONFIRMED',
    }),
  );
  assert.equal(noEffect.ok, true);
  if (!noEffect.ok) return;
  assert.equal(noEffect.plan.reason, 'TASK_CREATED');
  assert.equal(noEffect.plan.task?.attempt, 2);
  assert.notEqual(noEffect.plan.task?.dedupeKey, created.task?.dedupeKey);

  const uncertain = planRevenueFlow(
    fixture({
      evaluatedAt: '2026-09-03T08:12:00Z',
      existing: created.record,
      dispatchObservation: 'EXECUTION_UNCERTAIN',
    }),
  );
  assert.equal(uncertain.ok, true);
  if (!uncertain.ok) return;
  assert.equal(uncertain.plan.disposition, 'ESCALATE');
  assert.equal(uncertain.plan.reason, 'RECONCILIATION_REQUIRED');
  assert.equal(uncertain.plan.record.state, 'WAITING_RECONCILIATION');
  assert.equal(uncertain.plan.task, undefined);
});

test('W10-D bounds retries and escalates after the configured attempt budget', () => {
  const created = planRevenueFlow(
    fixture({
      template: nurtureTemplate({
        steps: [{ ...requiredTemplateStep(nurtureTemplate()), maxAttempts: 1 }],
      }),
    }),
  );
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const exhausted = planRevenueFlow(
    fixture({
      template: nurtureTemplate({
        steps: [{ ...requiredTemplateStep(nurtureTemplate()), maxAttempts: 1 }],
      }),
      evaluatedAt: '2026-09-03T08:12:00Z',
      existing: created.plan.record,
      dispatchObservation: 'NO_EFFECT_CONFIRMED',
    }),
  );
  assert.equal(exhausted.ok, true);
  if (!exhausted.ok) return;
  assert.equal(exhausted.plan.disposition, 'ESCALATE');
  assert.equal(exhausted.plan.reason, 'RETRY_BUDGET_EXHAUSTED');
  assert.equal(exhausted.plan.task, undefined);
});

test('W10-D invalidates pending outreach on opt-out, stale policy or purpose removal', () => {
  const created = firstReady();
  const cases: Array<Partial<PlanRevenueFlowInput['contactPolicy']>> = [
    { consentStatus: 'OPTED_OUT' },
    { current: false },
    { allowedPurposes: ['SALES'] },
  ];
  const reasons = ['CONSENT_BLOCKED', 'CONTACT_POLICY_NOT_CURRENT', 'PURPOSE_NOT_ALLOWED'];
  for (let index = 0; index < cases.length; index += 1) {
    const result = planRevenueFlow(
      fixture({
        evaluatedAt: '2026-09-03T08:11:00Z',
        existing: created.record,
        contactPolicy: { ...fixture().contactPolicy, ...cases[index] },
      }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.equal(result.plan.reason, reasons[index]);
    assert.equal(result.plan.invalidatesPendingOutreach, true);
    assert.equal(result.plan.record.state, 'PAUSED_POLICY');
    assert.equal(result.plan.record.lastTaskDedupeKey, undefined);
  }
});

test('W10-D cancellation is terminal and invalidates pending outreach', () => {
  const created = firstReady();
  const cancelled = planRevenueFlow(
    fixture({
      evaluatedAt: '2026-09-03T08:11:00Z',
      existing: created.record,
      cancellationReason: 'USER_REQUEST',
    }),
  );
  assert.equal(cancelled.ok, true);
  if (!cancelled.ok) return;
  assert.equal(cancelled.plan.disposition, 'TERMINAL');
  assert.equal(cancelled.plan.reason, 'FLOW_CANCELLED');
  assert.equal(cancelled.plan.record.state, 'CANCELLED');
  assert.equal(cancelled.plan.invalidatesPendingOutreach, true);
});

test('W10-D fails closed across tenant, entity and entity-version boundaries', () => {
  const crossTenant = planRevenueFlow(
    fixture({ contactPolicy: { ...fixture().contactPolicy, tenantId: TENANT_B } }),
  );
  assert.deepEqual(crossTenant, { ok: false, error: 'TENANT_MISMATCH' });

  const entityMismatch = planRevenueFlow(
    fixture({
      qualification: {
        ...requiredQualification(),
        entity: { kind: 'LEAD', entityId: 'lead-other' },
      },
    }),
  );
  assert.deepEqual(entityMismatch, { ok: false, error: 'ENTITY_MISMATCH' });

  const versionMismatch = planRevenueFlow(
    fixture({ qualification: { ...requiredQualification(), entityVersion: 3 } }),
  );
  assert.deepEqual(versionMismatch, { ok: false, error: 'ENTITY_VERSION_CONFLICT' });
});

test('W10-D abstains or escalates on incomplete, mismatched or review-required qualification', () => {
  const incomplete = planRevenueFlow(
    fixture({
      qualification: { ...requiredQualification(), stage: 'INCOMPLETE', scoreBps: null },
    }),
  );
  const wrongStage = planRevenueFlow(
    fixture({ qualification: { ...requiredQualification(), stage: 'QUALIFIED' } }),
  );
  const review = planRevenueFlow(
    fixture({
      qualification: { ...requiredQualification(), reviewDisposition: 'VERIFY_MODEL_ASSIST' },
    }),
  );
  assert.equal(incomplete.ok && incomplete.plan.reason, 'QUALIFICATION_INCOMPLETE');
  assert.equal(wrongStage.ok && wrongStage.plan.reason, 'FLOW_NOT_APPLICABLE');
  assert.equal(review.ok && review.plan.reason, 'QUALIFICATION_REVIEW_REQUIRED');
  assert.equal(review.ok && review.plan.disposition, 'ESCALATE');
});

test('W10-D supports customer-success planning without inventing qualification authority', () => {
  const base = fixture();
  const { qualification, ...withoutQualification } = base;
  void qualification;
  const customerInput: PlanRevenueFlowInput = {
    ...withoutQualification,
    flowId: 'flow-customer-001-success',
    crm: {
      current: true,
      currentnessReasons: [],
      model: {
        ...base.crm.model,
        entity: { kind: 'CUSTOMER', entityId: 'customer-001' },
        lifecycleState: 'ACTIVE',
      },
    },
    template: {
      ...nurtureTemplate(),
      templateReference: 'template:w04:customer-success',
      flowKind: 'CUSTOMER_SUCCESS',
      steps: [
        {
          stepId: 'success-checkin',
          taskKind: 'PREPARE_CUSTOMER_SUCCESS_CHECKIN',
          contactPurpose: 'CUSTOMER_SUCCESS',
          externalAction: false,
          cadenceMs: 0,
          maxAttempts: 1,
        },
      ],
    },
  };
  const result = planRevenueFlow(customerInput);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.disposition, 'TASK_READY');
  assert.equal(result.plan.task?.requiresGovernedExecution, false);
  assert.equal(result.plan.task?.executionBoundary, 'INTERNAL_DOMAIN_PREPARATION');
  assert.equal(result.plan.task?.authorizesExecution, false);
});

test('W10-D rejects stale/duplicate template inputs and never treats templates as authority', () => {
  const stale = planRevenueFlow(fixture({ template: nurtureTemplate({ status: 'STALE' }) }));
  assert.equal(stale.ok && stale.plan.reason, 'TEMPLATE_NOT_READY');

  const duplicateStep = nurtureTemplate();
  const duplicate = planRevenueFlow(
    fixture({
      template: {
        ...duplicateStep,
        steps: [requiredTemplateStep(duplicateStep), requiredTemplateStep(duplicateStep)],
      },
    }),
  );
  assert.deepEqual(duplicate, { ok: false, error: 'TEMPLATE_STEP_DUPLICATE' });

  const result = firstReady();
  assert.equal(result.task?.templateReference, 'template:w04:nurture-default');
  assert.equal(result.task?.authorizesExecution, false);
  assert.equal(result.task?.canGrantPermission, false);
});

test('W10-D rejects forged dispatch observations and cancellation reasons befor state advancement', () => {
  const created = firstReady();
  const forgedObservation = planRevenueFlow(
    fixture({
      evaluatedAt: '2026-09-03T08:11:00Z',
      existing: created.record,
      dispatchObservation: 'FORGED_ACK' as unknown as NonNullable<
        PlanRevenueFlowInput['dispatchObservation']
      >,
    }),
  );
  assert.deepEqual(forgedObservation, { ok: false, error: 'DISPATCH_OBSERVATION_INVALID' });

  const forgedCancellation = planRevenueFlow(
    fixture({
      existing: created.record,
      cancellationReason: 'FORGED_CANCEL' as unknown as NonNullable<
        PlanRevenueFlowInput['cancellationReason']
      >,
    }),
  );
  assert.deepEqual(forgedCancellation, { ok: false, error: 'REQUEST_MALFORMED' });
});

test('W10-D requires one non-empty correlation and rejects cross-correlation evidence reuse', () => {
  const emptyCorrelation = planRevenueFlow(
    fixture({ correlation: { correlationId: '' as CorrelationId } }),
  );
  assert.deepEqual(emptyCorrelation, { ok: false, error: 'REQUEST_MALFORMED' });

  const otherCorrelation = 'cor_01JW10DOTHERCORRELATION000' as CorrelationId;
  const created = firstReady();
  const recordMismatch = planRevenueFlow(
    fixture({
      existing: { ...created.record, correlation: { correlationId: otherCorrelation } },
    }),
  );
  assert.deepEqual(recordMismatch, { ok: false, error: 'CORRELATION_MISMATCH' });

  const qualificationMismatch = planRevenueFlow(
    fixture({
      qualification: {
        ...requiredQualification(),
        correlation: { correlationId: otherCorrelation },
      },
    }),
  );
  assert.deepEqual(qualificationMismatch, { ok: false, error: 'CORRELATION_MISMATCH' });
});

test('W10-D rejects contradictory CRM currentness and malformed qualification authority evidence', () => {
  const contradictoryCrm = planRevenueFlow(
    fixture({
      crm: {
        ...fixture().crm,
        current: true,
        currentnessReasons: ['MODEL_TOO_OLD'],
      },
    }),
  );
  assert.deepEqual(contradictoryCrm, { ok: false, error: 'CRM_CURRENTNESS_CONFLICT' });

  const authoritativeQualification = planRevenueFlow(
    fixture({
      qualification: {
        ...requiredQualification(),
        authorizesExecution: true,
      } as unknown as NonNullable<PlanRevenueFlowInput['qualification']>,
    }),
  );
  assert.deepEqual(authoritativeQualification, { ok: false, error: 'QUALIFICATION_MALFORMED' });

  const malformedQualification = planRevenueFlow(
    fixture({
      qualification: {
        ...requiredQualification(),
        stage: 'FORGED_STAGE',
      } as unknown as NonNullable<PlanRevenueFlowInput['qualification']>,
    }),
  );
  assert.deepEqual(malformedQualification, { ok: false, error: 'QUALIFICATION_MALFORMED' });
});
