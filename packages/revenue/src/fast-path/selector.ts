import type {
  RevenueFastPathBenchmarkResult,
  RevenueFastPathBenchmarkSample,
  RevenueFastPathCacheProjection,
  RevenueFastPathConfidenceProjection,
  RevenueFastPathControlProjection,
  RevenueFastPathEvidence,
  RevenueFastPathReason,
  RevenueFastPathSelection,
  RevenueFastPathSelectionInput,
  RevenueFastPathSelectionResult,
  RevenueFastPathTask,
  RevenueFastPathTemplateProjection,
} from './types.js';

const MAX_IDENTIFIER_LENGTH = 1_024;
const MAX_SOURCE_VERSIONS = 64;
const MAX_BENCHMARK_SAMPLES = 2_000;

function isNonEmptyString(value: unknown, maxLength = MAX_IDENTIFIER_LENGTH): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isTimestamp(value: unknown): value is string {
  return isNonEmptyString(value, 128) && Number.isFinite(Date.parse(value));
}

function isBps(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 10_000;
}

function taskIsValid(task: RevenueFastPathTask): boolean {
  return (
    isNonEmptyString(task?.taskId) &&
    isNonEmptyString(task?.tenantId) &&
    isNonEmptyString(task?.correlation?.correlationId) &&
    (task.taskKind === 'CRM_CURRENT_READ' ||
      task.taskKind === 'QUALIFICATION_CURRENT_READ' ||
      task.taskKind === 'NBA_CONTEXT_REUSE' ||
      task.taskKind === 'REVENUE_SUMMARY_READ' ||
      task.taskKind === 'FOLLOW_UP_DRAFT' ||
      task.taskKind === 'CUSTOMER_SUCCESS_BRIEF') &&
    (task.entity?.kind === 'LEAD' ||
      task.entity?.kind === 'CUSTOMER' ||
      task.entity?.kind === 'CONVERSATION') &&
    isNonEmptyString(task.entity.entityId) &&
    Number.isSafeInteger(task.entityVersion) &&
    task.entityVersion >= 1 &&
    isNonEmptyString(task.inputContractVersion) &&
    (task.riskClass === 'LOW' ||
      task.riskClass === 'MEDIUM' ||
      task.riskClass === 'HIGH' ||
      task.riskClass === 'CRITICAL') &&
    (task.valueClass === 'ROUTINE' || task.valueClass === 'HIGH_VALUE') &&
    Number.isSafeInteger(task.conflictCount) &&
    task.conflictCount >= 0 &&
    task.conflictCount <= 1_000 &&
    typeof task.staleMaterialEvidence === 'boolean' &&
    typeof task.externalWrite === 'boolean'
  );
}

function controlIsValid(control: RevenueFastPathControlProjection): boolean {
  return (
    control?.source === 'W04_LANE_CAPABILITY_BUDGET' &&
    isNonEmptyString(control.tenantId) &&
    isNonEmptyString(control.correlationId) &&
    (control.lane === 'FAST' || control.lane === 'GOVERNED') &&
    (control.preferredPlanningStrategy === 'DETERMINISTIC' ||
      control.preferredPlanningStrategy === 'TEMPLATE' ||
      control.preferredPlanningStrategy === 'GOVERNED_REASONING') &&
    isNonEmptyString(control.capabilityPlanReference) &&
    (control.capabilityPlanStatus === 'READY' || control.capabilityPlanStatus === 'BLOCKED') &&
    isNonEmptyString(control.registryVersion) &&
    isNonEmptyString(control.budgetReference) &&
    (control.budgetState === 'WITHIN_BUDGET' ||
      control.budgetState === 'DEGRADED' ||
      control.budgetState === 'EXHAUSTED') &&
    (control.budgetAction === 'CONTINUE_OPTIONAL' ||
      control.budgetAction === 'DEGRADE_OPTIONAL' ||
      control.budgetAction === 'STOP_OPTIONAL' ||
      control.budgetAction === 'HOLD') &&
    Array.isArray(control.mandatoryValidations) &&
    control.mandatoryValidations.join('|') ===
      'CURRENT_POLICY|CURRENT_AUTHORITY|EXECUTOR_PRECONDITIONS' &&
    control.authorizesExecution === false &&
    control.canGrantPermission === false
  );
}

function confidenceIsValid(confidence: RevenueFastPathConfidenceProjection): boolean {
  return (
    confidence?.source === 'W05_CONFIDENCE' &&
    isNonEmptyString(confidence.tenantId) &&
    isNonEmptyString(confidence.correlationId) &&
    isNonEmptyString(confidence.evaluationReference) &&
    (confidence.scoreBps === null || isBps(confidence.scoreBps)) &&
    (confidence.disposition === 'PROCEED_WITH_EVIDENCE' ||
      confidence.disposition === 'VERIFY' ||
      confidence.disposition === 'ESCALATE' ||
      confidence.disposition === 'ABSTAIN') &&
    isNonEmptyString(confidence.calibrationInterfaceVersion) &&
    confidence.authorizesExecution === false &&
    confidence.canGrantPermission === false
  );
}

function sourceVersionsAreValid(
  versions: readonly { readonly sourceReference: string; readonly sourceRevision: string }[],
): boolean {
  if (!Array.isArray(versions) || versions.length > MAX_SOURCE_VERSIONS) return false;
  const references = new Set<string>();
  for (const version of versions) {
    if (
      !isNonEmptyString(version?.sourceReference) ||
      !isNonEmptyString(version?.sourceRevision) ||
      references.has(version.sourceReference)
    ) {
      return false;
    }
    references.add(version.sourceReference);
  }
  return true;
}

function cacheIsValid(cache: RevenueFastPathCacheProjection): boolean {
  return (
    cache?.source === 'W06_SEMANTIC_CACHE_EVALUATION' &&
    isNonEmptyString(cache.tenantId) &&
    isNonEmptyString(cache.correlationId) &&
    (cache.status === 'HIT' ||
      cache.status === 'MISS' ||
      cache.status === 'STALE_REJECTED' ||
      cache.status === 'INVALIDATED_REJECTED' ||
      cache.status === 'INCOMPATIBLE_REJECTED') &&
    isNonEmptyString(cache.cacheKey) &&
    isNonEmptyString(cache.queryFingerprint) &&
    isNonEmptyString(cache.configVersion) &&
    isNonEmptyString(cache.expectedConfigVersion) &&
    sourceVersionsAreValid(cache.sourceVersions) &&
    sourceVersionsAreValid(cache.expectedSourceVersions) &&
    isTimestamp(cache.createdAt) &&
    isTimestamp(cache.expiresAt) &&
    Date.parse(cache.createdAt) <= Date.parse(cache.expiresAt) &&
    typeof cache.invalidated === 'boolean' &&
    (cache.invalidatedAt === undefined || isTimestamp(cache.invalidatedAt)) &&
    (cache.invalidated ? cache.invalidatedAt !== undefined : cache.invalidatedAt === undefined) &&
    cache.authorizesExecution === false &&
    cache.canGrantPermission === false
  );
}

function templateIsValid(template: RevenueFastPathTemplateProjection): boolean {
  return (
    template?.source === 'W04_CURATED_PLAN_TEMPLATE' &&
    isNonEmptyString(template.tenantId) &&
    isNonEmptyString(template.correlationId) &&
    isNonEmptyString(template.templateId) &&
    isNonEmptyString(template.semanticVersion) &&
    isNonEmptyString(template.expectedSemanticVersion) &&
    isNonEmptyString(template.contentHash) &&
    isNonEmptyString(template.expectedContentHash) &&
    (template.status === 'ACTIVE' || template.status === 'INVALIDATED') &&
    (template.taskKind === 'CRM_CURRENT_READ' ||
      template.taskKind === 'QUALIFICATION_CURRENT_READ' ||
      template.taskKind === 'NBA_CONTEXT_REUSE' ||
      template.taskKind === 'REVENUE_SUMMARY_READ' ||
      template.taskKind === 'FOLLOW_UP_DRAFT' ||
      template.taskKind === 'CUSTOMER_SUCCESS_BRIEF') &&
    isNonEmptyString(template.inputContractVersion) &&
    isNonEmptyString(template.registryVersion) &&
    isNonEmptyString(template.capabilityPlanReference) &&
    isNonEmptyString(template.provenanceReference) &&
    template.authorizesExecution === false &&
    template.adaptivePromotion === false &&
    template.canGrantPermission === false
  );
}

function sourceVersionsMatch(cache: RevenueFastPathCacheProjection): boolean {
  const canonical = (
    versions: RevenueFastPathCacheProjection['sourceVersions'],
  ): readonly string[] =>
    versions
      .map((item) => `${item.sourceReference}\u0000${item.sourceRevision}`)
      .sort((left, right) => left.localeCompare(right));
  const actual = canonical(cache.sourceVersions);
  const expected = canonical(cache.expectedSourceVersions);
  return (
    actual.length === expected.length && actual.every((value, index) => value === expected[index])
  );
}

function cacheIsCurrent(cache: RevenueFastPathCacheProjection, evaluatedAt: string): boolean {
  return (
    cache.status === 'HIT' &&
    !cache.invalidated &&
    cache.configVersion === cache.expectedConfigVersion &&
    sourceVersionsMatch(cache) &&
    Date.parse(cache.createdAt) <= Date.parse(evaluatedAt) &&
    Date.parse(evaluatedAt) < Date.parse(cache.expiresAt)
  );
}

function templateIsCurrent(
  template: RevenueFastPathTemplateProjection,
  input: RevenueFastPathSelectionInput,
): boolean {
  return (
    template.status === 'ACTIVE' &&
    template.semanticVersion === template.expectedSemanticVersion &&
    template.contentHash === template.expectedContentHash &&
    template.taskKind === input.task.taskKind &&
    template.inputContractVersion === input.task.inputContractVersion &&
    template.registryVersion === input.control.registryVersion &&
    template.capabilityPlanReference === input.control.capabilityPlanReference
  );
}

function evidence(input: RevenueFastPathSelectionInput): RevenueFastPathEvidence {
  return {
    capabilityPlanReference: input.control.capabilityPlanReference,
    registryVersion: input.control.registryVersion,
    budgetReference: input.control.budgetReference,
    confidenceEvaluationReference: input.confidence.evaluationReference,
    confidenceDisposition: input.confidence.disposition,
    ...(input.cache === undefined
      ? {}
      : {
          cacheStatus: input.cache.status,
          cacheKey: input.cache.cacheKey,
          cacheFresh: cacheIsCurrent(input.cache, input.evaluatedAt),
          cacheInvalidated: input.cache.invalidated,
        }),
    ...(input.template === undefined
      ? {}
      : {
          templateId: input.template.templateId,
          templateVersion: input.template.semanticVersion,
          templateCurrent: templateIsCurrent(input.template, input),
        }),
  };
}

function selection(
  input: RevenueFastPathSelectionInput,
  path: RevenueFastPathSelection['path'],
  reason: RevenueFastPathReason,
): RevenueFastPathSelectionResult {
  return {
    ok: true,
    selection: {
      kind: 'REVENUE_FAST_PATH_SELECTION',
      schemaVersion: '1.0.0',
      tenantId: input.task.tenantId,
      correlation: {
        correlationId: input.task.correlation.correlationId,
        ...(input.task.correlation.causation === undefined
          ? {}
          : { causation: { causationId: input.task.correlation.causation.causationId } }),
      },
      taskId: input.task.taskId,
      taskKind: input.task.taskKind,
      entity: { kind: input.task.entity.kind, entityId: input.task.entity.entityId },
      entityVersion: input.task.entityVersion,
      evaluatedAt: input.evaluatedAt,
      path,
      reason,
      evidence: evidence(input),
      requiresCurrentW07ValidationForExternalWrite: true,
      createsActionIntent: false,
      authorizesExecution: false,
      canGrantPermission: false,
    },
  };
}

export function selectRevenueFastPath(
  input: RevenueFastPathSelectionInput,
): RevenueFastPathSelectionResult {
  if (!isTimestamp(input?.evaluatedAt)) return { ok: false, error: 'REQUEST_MALFORMED' };
  if (!taskIsValid(input?.task)) return { ok: false, error: 'TASK_MALFORMED' };
  if (!controlIsValid(input?.control)) {
    return { ok: false, error: 'CONTROL_PROJECTION_MALFORMED' };
  }
  if (!confidenceIsValid(input?.confidence)) {
    return { ok: false, error: 'CONFIDENCE_PROJECTION_MALFORMED' };
  }
  if (input.cache !== undefined && !cacheIsValid(input.cache)) {
    return { ok: false, error: 'CACHE_PROJECTION_MALFORMED' };
  }
  if (input.template !== undefined && !templateIsValid(input.template)) {
    return { ok: false, error: 'TEMPLATE_PROJECTION_MALFORMED' };
  }
  if (
    input.control.tenantId !== input.task.tenantId ||
    input.confidence.tenantId !== input.task.tenantId ||
    (input.cache !== undefined && input.cache.tenantId !== input.task.tenantId) ||
    (input.template !== undefined && input.template.tenantId !== input.task.tenantId)
  ) {
    return { ok: false, error: 'TENANT_MISMATCH' };
  }
  if (
    input.control.correlationId !== input.task.correlation.correlationId ||
    input.confidence.correlationId !== input.task.correlation.correlationId ||
    (input.cache !== undefined &&
      input.cache.correlationId !== input.task.correlation.correlationId) ||
    (input.template !== undefined &&
      input.template.correlationId !== input.task.correlation.correlationId)
  ) {
    return { ok: false, error: 'CORRELATION_MISMATCH' };
  }
  if (
    (input.cache !== undefined &&
      Date.parse(input.cache.createdAt) > Date.parse(input.evaluatedAt)) ||
    (input.cache?.invalidatedAt !== undefined &&
      Date.parse(input.cache.invalidatedAt) > Date.parse(input.evaluatedAt))
  ) {
    return { ok: false, error: 'EVIDENCE_FUTURE_OBSERVATION' };
  }

  if (input.task.externalWrite) return selection(input, 'GOVERNED', 'EXTERNAL_WRITE_REQUIRES_W07');
  if (input.control.lane === 'GOVERNED') return selection(input, 'GOVERNED', 'W04_GOVERNED_LANE');
  if (input.control.capabilityPlanStatus === 'BLOCKED') {
    return selection(input, 'GOVERNED', 'CAPABILITY_PLAN_BLOCKED');
  }
  if (
    input.control.budgetState === 'EXHAUSTED' ||
    input.control.budgetAction === 'STOP_OPTIONAL' ||
    input.control.budgetAction === 'HOLD'
  ) {
    return selection(input, 'GOVERNED', 'BUDGET_RESTRICTED');
  }
  if (input.task.riskClass === 'HIGH' || input.task.riskClass === 'CRITICAL') {
    return selection(input, 'GOVERNED', 'HIGH_RISK');
  }
  if (input.task.valueClass === 'HIGH_VALUE') return selection(input, 'GOVERNED', 'HIGH_VALUE');
  if (input.task.conflictCount > 0) return selection(input, 'GOVERNED', 'CONFLICTING_EVIDENCE');
  if (input.task.staleMaterialEvidence) {
    return selection(input, 'GOVERNED', 'STALE_MATERIAL_EVIDENCE');
  }
  if (input.confidence.disposition !== 'PROCEED_WITH_EVIDENCE') {
    return selection(input, 'GOVERNED', 'CONFIDENCE_REQUIRES_GOVERNANCE');
  }

  if (
    (input.task.taskKind === 'CRM_CURRENT_READ' ||
      input.task.taskKind === 'QUALIFICATION_CURRENT_READ') &&
    input.control.preferredPlanningStrategy === 'DETERMINISTIC'
  ) {
    return selection(input, 'DETERMINISTIC', 'LOW_RISK_DETERMINISTIC_TASK');
  }
  if (input.cache !== undefined && cacheIsCurrent(input.cache, input.evaluatedAt)) {
    return selection(input, 'CACHE', 'CURRENT_COMPATIBLE_CACHE_HIT');
  }
  if (input.template !== undefined && templateIsCurrent(input.template, input)) {
    return selection(input, 'TEMPLATE', 'CURRENT_CURATED_TEMPLATE');
  }
  return selection(input, 'GOVERNED', 'NO_CURRENT_COMPATIBLE_FAST_PATH');
}

function percentile(values: readonly number[], fraction: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * fraction) - 1));
  return ordered[index] ?? 0;
}

function sampleIsValid(sample: RevenueFastPathBenchmarkSample): boolean {
  return (
    Number.isFinite(sample?.baselineLatencyMicros) &&
    sample.baselineLatencyMicros >= 0 &&
    Number.isFinite(sample?.selectedLatencyMicros) &&
    sample.selectedLatencyMicros >= 0 &&
    Number.isSafeInteger(sample?.baselineModelCalls) &&
    sample.baselineModelCalls >= 0 &&
    Number.isSafeInteger(sample?.selectedModelCalls) &&
    sample.selectedModelCalls >= 0 &&
    typeof sample.qualityAccepted === 'boolean' &&
    Number.isSafeInteger(sample.authorityElevationViolations) &&
    sample.authorityElevationViolations >= 0
  );
}

export function summarizeRevenueFastPathBenchmark(
  samples: readonly RevenueFastPathBenchmarkSample[],
): RevenueFastPathBenchmarkResult {
  if (
    !Array.isArray(samples) ||
    samples.length === 0 ||
    samples.length > MAX_BENCHMARK_SAMPLES ||
    !samples.every(sampleIsValid)
  ) {
    return { ok: false, error: 'BENCHMARK_MALFORMED' };
  }
  const baseline = samples.map((sample) => sample.baselineLatencyMicros);
  const selected = samples.map((sample) => sample.selectedLatencyMicros);
  const baselineTotal = baseline.reduce((total, value) => total + value, 0);
  const selectedTotal = selected.reduce((total, value) => total + value, 0);
  return {
    ok: true,
    benchmark: {
      schema: 'aurora.w10f.fast_path_benchmark.v1',
      measurementScope: 'TEST_FIXTURE_PROXY_NOT_PRODUCTION_SLO_OR_PROVIDER_COST',
      sampleCount: samples.length,
      baselineLatencyMicros: {
        p50: percentile(baseline, 0.5),
        p95: percentile(baseline, 0.95),
        p99: percentile(baseline, 0.99),
      },
      selectedLatencyMicros: {
        p50: percentile(selected, 0.5),
        p95: percentile(selected, 0.95),
        p99: percentile(selected, 0.99),
      },
      latencySavingsBps:
        baselineTotal === 0
          ? 0
          : Math.max(
              0,
              Math.min(
                10_000,
                Math.round(((baselineTotal - selectedTotal) * 10_000) / baselineTotal),
              ),
            ),
      avoidedModelCalls: samples.reduce(
        (total, sample) =>
          total + Math.max(0, sample.baselineModelCalls - sample.selectedModelCalls),
        0,
      ),
      qualityRegressionCount: samples.filter((sample) => !sample.qualityAccepted).length,
      authorityElevationViolations: samples.reduce(
        (total, sample) => total + sample.authorityElevationViolations,
        0,
      ),
      providerCost: 'NOT_OBSERVED',
      productionSlo: 'NOT_OBSERVED',
    },
  };
}
