// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { CorrelationId, TenantId } from '@aurora/contracts';

import {
  applyRevenueLifecycleTransition,
  createRevenueLifecycleRecord,
} from '../src/lifecycle/index.js';
import {
  assessQualificationFreshness,
  evaluateQualification,
  type QualificationEvaluationInput,
  type QualificationFeature,
} from '../src/scoring/index.js';

const TENANT_A = 'ten_01JW10BTENANTA00000000000' as TenantId;
const TENANT_B = 'ten_01JW10BTENANTB00000000000' as TenantId;
const CORRELATION = 'cor_01JW10BCORRELATION0000000' as CorrelationId;

function leadRecord() {
  const created = createRevenueLifecycleRecord({
    tenantId: TENANT_A,
    entity: { kind: 'LEAD', entityId: 'lead-score-001' },
    occurredAt: '2026-09-03T06:10:00Z',
    provenance: {
      sourceSystem: 'crm',
      sourceReference: 'lead-score-001',
      observedAt: '2026-09-03T06:09:59Z',
    },
  });
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error('lead fixture creation failed');
  return created.record;
}

interface EngagementFeatureOptions {
  readonly valueBps?: number | null;
  readonly tenantId?: TenantId;
  readonly key?: string;
  readonly weightBps?: number;
  readonly observedAt?: string;
}

function engagementFeature(options: EngagementFeatureOptions = {}): QualificationFeature {
  return {
    key: options.key ?? 'engagement',
    valueBps: options.valueBps === undefined ? 9_000 : options.valueBps,
    weightBps: options.weightBps ?? 6_000,
    critical: true,
    provenance: {
      tenantId: options.tenantId ?? TENANT_A,
      sourceSystem: 'conversation-analytics',
      sourceRevision: 'conv-r7',
      observedAt: options.observedAt ?? '2026-09-03T06:10:30Z',
    },
  };
}

interface FitFeatureOptions {
  readonly key?: string;
  readonly weightBps?: number;
}

function fitFeature(options: FitFeatureOptions = {}): QualificationFeature {
  return {
    key: options.key ?? 'fit',
    valueBps: 6_000,
    weightBps: options.weightBps ?? 4_000,
    critical: true,
    provenance: {
      tenantId: TENANT_A,
      sourceSystem: 'crm-profile',
      sourceRevision: 'profile-r3',
      observedAt: '2026-09-03T06:10:20Z',
      sourceReference: 'profile-001',
    },
  };
}

function features(): QualificationFeature[] {
  return [engagementFeature(), fitFeature()];
}

function deterministicInput(featureInput = features()): QualificationEvaluationInput {
  return {
    tenantId: TENANT_A,
    entity: { kind: 'LEAD', entityId: 'lead-score-001' },
    expectedEntityVersion: 1,
    featureSetRevision: 'feature-set-r11',
    ruleSetVersion: 'qualification-rules-3',
    evaluatedAt: '2026-09-03T06:11:00Z',
    correlation: { correlationId: CORRELATION },
    features: featureInput,
    modelAssistWeightBps: 0,
    thresholds: {
      version: 'thresholds-2',
      qualifiedMinBps: 7_500,
      nurtureMinBps: 4_000,
    },
  };
}

function modelAssistedInput(
  disposition: 'PROCEED_WITH_EVIDENCE' | 'ESCALATE',
): QualificationEvaluationInput {
  return {
    tenantId: TENANT_A,
    entity: { kind: 'LEAD', entityId: 'lead-score-001' },
    expectedEntityVersion: 1,
    featureSetRevision: 'feature-set-model-r2',
    ruleSetVersion: 'qualification-rules-3',
    evaluatedAt: '2026-09-03T06:12:00Z',
    correlation: { correlationId: CORRELATION },
    features: [
      {
        key: 'deterministic-fit',
        valueBps: 8_000,
        weightBps: 7_000,
        critical: true,
        provenance: {
          tenantId: TENANT_A,
          sourceSystem: 'crm-profile',
          sourceRevision: 'profile-r4',
          observedAt: '2026-09-03T06:11:10Z',
        },
      },
    ],
    modelAssistWeightBps: 3_000,
    modelAssist: {
      tenantId: TENANT_A,
      modelReference: 'model:qualification-specialist',
      modelVersion: '2026-09-01',
      signalBps: 9_000,
      evaluatedAt: '2026-09-03T06:11:40Z',
      provenanceReference: 'ctx:feature-set-model-r2',
      confidence: {
        evaluationReference: 'confidence:w05d:eval-77',
        scoreBps: 8_800,
        disposition,
        calibrationInterfaceVersion: '1.0.0',
        authorizesExecution: false,
        canGrantPermission: false,
      },
    },
    thresholds: {
      version: 'thresholds-2',
      qualifiedMinBps: 7_500,
      nurtureMinBps: 4_000,
    },
  };
}

test('W10-B deterministic scoring is order-stable, calibrated and non-authoritative', () => {
  const record = leadRecord();
  const first = evaluateQualification(record, deterministicInput());
  const reversed = evaluateQualification(record, deterministicInput([...features()].reverse()));
  assert.equal(first.ok, true);
  assert.equal(reversed.ok, true);
  if (!first.ok || !reversed.ok) return;

  assert.equal(first.evaluation.scoreBps, 7_800);
  assert.equal(first.evaluation.stage, 'QUALIFIED');
  assert.equal(first.evaluation.coverageBps, 10_000);
  assert.equal(first.evaluation.mode, 'DETERMINISTIC');
  assert.equal(first.evaluation.authorizesExecution, false);
  assert.equal(first.evaluation.canGrantPermission, false);
  assert.deepEqual(first.evaluation.contributions, reversed.evaluation.contributions);
});

test('W10-B missing critical evidence is explicit instead of optimistic scoring', () => {
  const missing = [engagementFeature({ valueBps: null }), fitFeature()];
  const result = evaluateQualification(leadRecord(), deterministicInput(missing));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.evaluation.scoreBps, null);
  assert.equal(result.evaluation.stage, 'INCOMPLETE');
  assert.deepEqual(result.evaluation.missingCriticalFeatures, ['engagement']);
  assert.equal(result.evaluation.authorizesExecution, false);
});

test('W10-B fails closed on cross-tenant features and duplicate keys', () => {
  const crossTenant = [engagementFeature({ tenantId: TENANT_B }), fitFeature()];
  assert.deepEqual(evaluateQualification(leadRecord(), deterministicInput(crossTenant)), {
    ok: false,
    error: 'FEATURE_TENANT_MISMATCH',
  });

  const duplicate = [engagementFeature(), fitFeature({ key: 'engagement' })];
  assert.deepEqual(evaluateQualification(leadRecord(), deterministicInput(duplicate)), {
    ok: false,
    error: 'FEATURE_DUPLICATE',
  });
});

test('W10-B rejects stale entity versions and out-of-order evaluation time', () => {
  const staleVersion: QualificationEvaluationInput = {
    ...deterministicInput(),
    expectedEntityVersion: 2,
  };
  assert.deepEqual(evaluateQualification(leadRecord(), staleVersion), {
    ok: false,
    error: 'ENTITY_VERSION_CONFLICT',
  });

  const oldTime: QualificationEvaluationInput = {
    ...deterministicInput(),
    evaluatedAt: '2026-09-03T06:09:00Z',
  };
  assert.deepEqual(evaluateQualification(leadRecord(), oldTime), {
    ok: false,
    error: 'OUT_OF_ORDER_EVALUATION',
  });
});

test('W10-B rejects feature observations from after the evaluation time', () => {
  const futureEvidence = [engagementFeature({ observedAt: '2026-09-03T06:11:01Z' }), fitFeature()];
  assert.deepEqual(evaluateQualification(leadRecord(), deterministicInput(futureEvidence)), {
    ok: false,
    error: 'FEATURE_FUTURE_OBSERVATION',
  });
});

test('W10-B threshold classification never becomes outreach or spend authority', () => {
  const result = evaluateQualification(leadRecord(), deterministicInput());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.evaluation.stage, 'QUALIFIED');
  assert.equal(result.evaluation.authorizesExecution, false);
  assert.equal(result.evaluation.canGrantPermission, false);
  assert.equal('actionIntent' in result.evaluation, false);
  assert.equal('providerWrite' in result.evaluation, false);
});

test('W10-B composes model assistance only with explicit W05 confidence evidence', () => {
  const result = evaluateQualification(leadRecord(), modelAssistedInput('PROCEED_WITH_EVIDENCE'));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.evaluation.mode, 'MODEL_ASSISTED');
  assert.equal(result.evaluation.modelContributionBps, 2_700);
  assert.equal(result.evaluation.scoreBps, 8_300);
  assert.equal(result.evaluation.stage, 'QUALIFIED');
  assert.equal(result.evaluation.modelConfidenceBps, 8_800);
  assert.equal(result.evaluation.confidenceEvaluationReference, 'confidence:w05d:eval-77');
  assert.equal(result.evaluation.reviewDisposition, 'NONE');
});

test('W10-B escalation confidence blocks model contribution without minting authority', () => {
  const result = evaluateQualification(leadRecord(), modelAssistedInput('ESCALATE'));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.evaluation.modelContributionBps, undefined);
  assert.equal(result.evaluation.scoreBps, 5_600);
  assert.equal(result.evaluation.stage, 'NURTURE');
  assert.equal(result.evaluation.coverageBps, 7_000);
  assert.equal(result.evaluation.reviewDisposition, 'ESCALATE_MODEL_ASSIST');
  assert.equal(result.evaluation.authorizesExecution, false);
});

test('W10-B detects material entity, fact, rule, threshold and model drift for recalculation', () => {
  const result = evaluateQualification(leadRecord(), modelAssistedInput('PROCEED_WITH_EVIDENCE'));
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const fresh = assessQualificationFreshness(result.evaluation, {
    entityVersion: 1,
    featureSetRevision: 'feature-set-model-r2',
    ruleSetVersion: 'qualification-rules-3',
    thresholdVersion: 'thresholds-2',
    modelVersion: '2026-09-01',
  });
  assert.deepEqual(fresh, { current: true, reasons: [], authorizesExecution: false });

  const stale = assessQualificationFreshness(result.evaluation, {
    entityVersion: 2,
    featureSetRevision: 'feature-set-model-r3',
    ruleSetVersion: 'qualification-rules-4',
    thresholdVersion: 'thresholds-3',
    modelVersion: '2026-09-02',
  });
  assert.deepEqual(stale.reasons, [
    'ENTITY_VERSION_CHANGED',
    'FEATURE_SET_REVISION_CHANGED',
    'RULE_SET_VERSION_CHANGED',
    'THRESHOLD_VERSION_CHANGED',
    'MODEL_VERSION_CHANGED',
  ]);
  assert.equal(stale.current, false);
  assert.equal(stale.authorizesExecution, false);
});

test('W10-B rejects malformed weight calibration and merged lifecycle entities', () => {
  const wrongWeights = [engagementFeature(), fitFeature({ weightBps: 3_999 })];
  assert.deepEqual(evaluateQualification(leadRecord(), deterministicInput(wrongWeights)), {
    ok: false,
    error: 'WEIGHT_TOTAL_INVALID',
  });

  const merged = applyRevenueLifecycleTransition(leadRecord(), {
    tenantId: TENANT_A,
    expectedVersion: 1,
    targetState: 'MERGED',
    idempotencyKey: 'merge-before-score',
    occurredAt: '2026-09-03T06:10:30Z',
    correlation: { correlationId: CORRELATION },
    provenance: {
      sourceSystem: 'dedupe',
      observedAt: '2026-09-03T06:10:30Z',
    },
    mergeTarget: {
      tenantId: TENANT_A,
      entity: { kind: 'LEAD', entityId: 'lead-score-canonical' },
    },
  });
  assert.equal(merged.ok, true);
  if (!merged.ok || merged.status !== 'APPLIED') return;

  const mergedInput: QualificationEvaluationInput = {
    ...deterministicInput(),
    entity: { kind: 'LEAD', entityId: 'lead-score-001' },
    expectedEntityVersion: 2,
    evaluatedAt: '2026-09-03T06:11:00Z',
  };
  assert.deepEqual(evaluateQualification(merged.record, mergedInput), {
    ok: false,
    error: 'ENTITY_NOT_SCORABLE',
  });
});
