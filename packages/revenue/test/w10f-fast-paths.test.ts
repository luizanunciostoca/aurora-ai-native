// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { CorrelationId, TenantId } from '@aurora/contracts';

import {
  selectRevenueFastPath,
  summarizeRevenueFastPathBenchmark,
  type RevenueFastPathCacheProjection,
  type RevenueFastPathSelectionInput,
  type RevenueFastPathTemplateProjection,
} from '../src/fast-path/index.js';

const TENANT_A = 'ten_01JW10FTENANTA00000000000' as TenantId;
const TENANT_B = 'ten_01JW10FTENANTB00000000000' as TenantId;
const CORRELATION = 'cor_01JW10FCORRELATION0000000' as CorrelationId;

function cache(
  overrides: Partial<RevenueFastPathCacheProjection> = {},
): RevenueFastPathCacheProjection {
  return {
    source: 'W06_SEMANTIC_CACHE_EVALUATION',
    tenantId: TENANT_A,
    correlationId: CORRELATION,
    status: 'HIT',
    cacheKey: 'cache:w10f:lead-001',
    queryFingerprint: 'sha256:query-001',
    configVersion: 'cache-config-4',
    expectedConfigVersion: 'cache-config-4',
    sourceVersions: [
      { sourceReference: 'crm:lead-001', sourceRevision: 'crm-r19' },
      { sourceReference: 'context:lead-001', sourceRevision: 'context-r8' },
    ],
    expectedSourceVersions: [
      { sourceReference: 'context:lead-001', sourceRevision: 'context-r8' },
      { sourceReference: 'crm:lead-001', sourceRevision: 'crm-r19' },
    ],
    createdAt: '2026-09-03T08:20:00Z',
    expiresAt: '2026-09-03T08:30:00Z',
    invalidated: false,
    authorizesExecution: false,
    canGrantPermission: false,
    ...overrides,
  };
}

function template(
  overrides: Partial<RevenueFastPathTemplateProjection> = {},
): RevenueFastPathTemplateProjection {
  return {
    source: 'W04_CURATED_PLAN_TEMPLATE',
    tenantId: TENANT_A,
    correlationId: CORRELATION,
    templateId: 'template:w10f:follow-up-draft',
    semanticVersion: '2.1.0',
    expectedSemanticVersion: '2.1.0',
    contentHash: 'sha256:template-content-22',
    expectedContentHash: 'sha256:template-content-22',
    status: 'ACTIVE',
    taskKind: 'FOLLOW_UP_DRAFT',
    inputContractVersion: '1.0.0',
    registryVersion: 'registry-r22',
    capabilityPlanReference: 'capability-plan:w04:fast-19',
    provenanceReference: 'curation:w04:template-22',
    authorizesExecution: false,
    adaptivePromotion: false,
    canGrantPermission: false,
    ...overrides,
  };
}

function fixture(
  overrides: Partial<RevenueFastPathSelectionInput> = {},
): RevenueFastPathSelectionInput {
  return {
    evaluatedAt: '2026-09-03T08:25:00Z',
    task: {
      taskId: 'task:w10f:lead-001',
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
      capabilityPlanReference: 'capability-plan:w04:fast-19',
      capabilityPlanStatus: 'READY',
      registryVersion: 'registry-r22',
      budgetReference: 'budget:w04:fast-19',
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
      evaluationReference: 'confidence:w05:fast-19',
      scoreBps: 9_200,
      disposition: 'PROCEED_WITH_EVIDENCE',
      calibrationInterfaceVersion: '1.0.0',
      authorizesExecution: false,
      canGrantPermission: false,
    },
    ...overrides,
  };
}

test('W10-F selects the deterministic path only for bounded current low-risk reads', () => {
  const result = selectRevenueFastPath(fixture());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.selection.path, 'DETERMINISTIC');
  assert.equal(result.selection.reason, 'LOW_RISK_DETERMINISTIC_TASK');
  assert.equal(result.selection.authorizesExecution, false);
  assert.equal(result.selection.canGrantPermission, false);
  assert.equal(result.selection.createsActionIntent, false);
  assert.equal(result.selection.requiresCurrentW07ValidationForExternalWrite, true);
});

test('W10-F accepts only a current exact W06 cache hit and normalizes source order', () => {
  const input = fixture({
    task: { ...fixture().task, taskKind: 'NBA_CONTEXT_REUSE' },
    cache: cache(),
    template: template({ taskKind: 'NBA_CONTEXT_REUSE' }),
  });
  const first = selectRevenueFastPath(input);
  const reordered = selectRevenueFastPath({
    ...input,
    cache: cache({ sourceVersions: [...cache().sourceVersions].reverse() }),
  });
  assert.equal(first.ok, true);
  assert.deepEqual(reordered, first);
  if (!first.ok) return;
  assert.equal(first.selection.path, 'CACHE');
  assert.equal(first.selection.reason, 'CURRENT_COMPATIBLE_CACHE_HIT');
  assert.equal(first.selection.evidence.cacheFresh, true);
  assert.equal(first.selection.evidence.templateCurrent, true);
});

test('W10-F rejects stale, invalidated and incompatible cache reuse explicitly', () => {
  const cases: RevenueFastPathCacheProjection[] = [
    cache({ expiresAt: '2026-09-03T08:25:00Z', status: 'STALE_REJECTED' }),
    cache({
      status: 'INVALIDATED_REJECTED',
      invalidated: true,
      invalidatedAt: '2026-09-03T08:24:00Z',
    }),
    cache({ configVersion: 'cache-config-old', status: 'INCOMPATIBLE_REJECTED' }),
    cache({
      sourceVersions: [{ sourceReference: 'crm:lead-001', sourceRevision: 'crm-r18' }],
      status: 'INCOMPATIBLE_REJECTED',
    }),
  ];
  for (const projectedCache of cases) {
    const result = selectRevenueFastPath(
      fixture({
        task: { ...fixture().task, taskKind: 'NBA_CONTEXT_REUSE' },
        cache: projectedCache,
      }),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.selection.path, 'GOVERNED');
      assert.equal(result.selection.reason, 'NO_CURRENT_COMPATIBLE_FAST_PATH');
      assert.equal(result.selection.evidence.cacheFresh, false);
    }
  }
});

test('W10-F selects only an active exact-version W04 curated template', () => {
  const input = fixture({
    task: { ...fixture().task, taskKind: 'FOLLOW_UP_DRAFT' },
    control: { ...fixture().control, preferredPlanningStrategy: 'TEMPLATE' },
    template: template(),
  });
  const selected = selectRevenueFastPath(input);
  assert.equal(selected.ok, true);
  if (selected.ok) {
    assert.equal(selected.selection.path, 'TEMPLATE');
    assert.equal(selected.selection.evidence.templateCurrent, true);
  }

  for (const projectedTemplate of [
    template({ status: 'INVALIDATED' }),
    template({ semanticVersion: '2.0.0' }),
    template({ contentHash: 'sha256:stale-content' }),
    template({ inputContractVersion: '0.9.0' }),
  ]) {
    const result = selectRevenueFastPath({ ...input, template: projectedTemplate });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.selection.path, 'GOVERNED');
      assert.equal(result.selection.evidence.templateCurrent, false);
    }
  }
});

test('W10-F escalates high risk, high value, conflicts and stale material evidence', () => {
  const cases = [
    { task: { ...fixture().task, riskClass: 'HIGH' as const }, reason: 'HIGH_RISK' },
    { task: { ...fixture().task, valueClass: 'HIGH_VALUE' as const }, reason: 'HIGH_VALUE' },
    { task: { ...fixture().task, conflictCount: 1 }, reason: 'CONFLICTING_EVIDENCE' },
    {
      task: { ...fixture().task, staleMaterialEvidence: true },
      reason: 'STALE_MATERIAL_EVIDENCE',
    },
  ];
  for (const item of cases) {
    const result = selectRevenueFastPath(fixture({ task: item.task }));
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.selection.path, 'GOVERNED');
      assert.equal(result.selection.reason, item.reason);
    }
  }
});

test('W10-F never fast-paths an external write or bypasses W07', () => {
  const result = selectRevenueFastPath(
    fixture({
      task: { ...fixture().task, taskKind: 'FOLLOW_UP_DRAFT', externalWrite: true },
      cache: cache(),
      template: template(),
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.selection.path, 'GOVERNED');
  assert.equal(result.selection.reason, 'EXTERNAL_WRITE_REQUIRES_W07');
  assert.equal(result.selection.requiresCurrentW07ValidationForExternalWrite, true);
  assert.equal(result.selection.authorizesExecution, false);
});

test('W10-F preserves W04/W05 governance for lanes, budgets and confidence', () => {
  const governedLane = selectRevenueFastPath(
    fixture({ control: { ...fixture().control, lane: 'GOVERNED' } }),
  );
  const blocked = selectRevenueFastPath(
    fixture({ control: { ...fixture().control, capabilityPlanStatus: 'BLOCKED' } }),
  );
  const exhausted = selectRevenueFastPath(
    fixture({
      control: {
        ...fixture().control,
        budgetState: 'EXHAUSTED',
        budgetAction: 'HOLD',
      },
    }),
  );
  const verify = selectRevenueFastPath(
    fixture({ confidence: { ...fixture().confidence, disposition: 'VERIFY' } }),
  );
  assert.equal(governedLane.ok && governedLane.selection.reason, 'W04_GOVERNED_LANE');
  assert.equal(blocked.ok && blocked.selection.reason, 'CAPABILITY_PLAN_BLOCKED');
  assert.equal(exhausted.ok && exhausted.selection.reason, 'BUDGET_RESTRICTED');
  assert.equal(verify.ok && verify.selection.reason, 'CONFIDENCE_REQUIRES_GOVERNANCE');
});

test('W10-F fails closed on tenant, correlation and future cache observations', () => {
  const crossTenant = selectRevenueFastPath(
    fixture({ confidence: { ...fixture().confidence, tenantId: TENANT_B } }),
  );
  assert.deepEqual(crossTenant, { ok: false, error: 'TENANT_MISMATCH' });

  const correlationMismatch = selectRevenueFastPath(
    fixture({ cache: cache({ correlationId: 'cor_other' }) }),
  );
  assert.deepEqual(correlationMismatch, { ok: false, error: 'CORRELATION_MISMATCH' });

  const future = selectRevenueFastPath(
    fixture({ cache: cache({ createdAt: '2026-09-03T08:25:01Z' }) }),
  );
  assert.deepEqual(future, { ok: false, error: 'EVIDENCE_FUTURE_OBSERVATION' });
});

test('W10-F reports bounded test-fixture latency and model-call savings without production claims', () => {
  const result = summarizeRevenueFastPathBenchmark([
    {
      baselineLatencyMicros: 1_000,
      selectedLatencyMicros: 100,
      baselineModelCalls: 1,
      selectedModelCalls: 0,
      qualityAccepted: true,
      authorityElevationViolations: 0,
    },
    {
      baselineLatencyMicros: 2_000,
      selectedLatencyMicros: 200,
      baselineModelCalls: 1,
      selectedModelCalls: 0,
      qualityAccepted: true,
      authorityElevationViolations: 0,
    },
  ]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(
    result.benchmark.measurementScope,
    'TEST_FIXTURE_PROXY_NOT_PRODUCTION_SLO_OR_PROVIDER_COST',
  );
  assert.equal(result.benchmark.latencySavingsBps, 9_000);
  assert.equal(result.benchmark.avoidedModelCalls, 2);
  assert.equal(result.benchmark.qualityRegressionCount, 0);
  assert.equal(result.benchmark.authorityElevationViolations, 0);
  assert.equal(result.benchmark.providerCost, 'NOT_OBSERVED');
  assert.equal(result.benchmark.productionSlo, 'NOT_OBSERVED');
});

test('W10-F selection is replay-stable and benchmark inputs are strictly bounded', () => {
  const expected = selectRevenueFastPath(fixture());
  for (let index = 0; index < 250; index += 1) {
    assert.deepEqual(selectRevenueFastPath(fixture()), expected);
  }
  assert.deepEqual(summarizeRevenueFastPathBenchmark([]), {
    ok: false,
    error: 'BENCHMARK_MALFORMED',
  });
  assert.deepEqual(
    summarizeRevenueFastPathBenchmark([
      {
        baselineLatencyMicros: -1,
        selectedLatencyMicros: 0,
        baselineModelCalls: 0,
        selectedModelCalls: 0,
        qualityAccepted: true,
        authorityElevationViolations: 0,
      },
    ]),
    { ok: false, error: 'BENCHMARK_MALFORMED' },
  );
});
