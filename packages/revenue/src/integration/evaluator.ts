import { EXECUTION_OUTCOMES } from '@aurora/contracts/results';

import {
  REVENUE_BUSINESS_OUTCOME_TYPES,
  REVENUE_HUMAN_CORRECTION_DISPOSITIONS,
  REVENUE_PROVIDER_READBACK_OBSERVATIONS,
  type RevenueBusinessOutcomeEvidence,
  type RevenueIntegrationBudgetAssessment,
  type RevenueIntegrationDisposition,
  type RevenueIntegrationError,
  type RevenueIntegrationEvaluation,
  type RevenueIntegrationEvaluationInput,
  type RevenueIntegrationEvaluationResult,
  type RevenueIntegrationReason,
} from './types.js';

const MAX_IDENTIFIER_LENGTH = 1_024;
const MAX_EVENT_REFERENCES = 128;
const MAX_RATIONALE_LENGTH = 4_096;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(
    (descriptor) => descriptor.get === undefined && descriptor.set === undefined,
  );
}

function isNonEmptyString(value: unknown, maxLength = MAX_IDENTIFIER_LENGTH): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isTimestamp(value: unknown): value is string {
  return isNonEmptyString(value, 128) && Number.isFinite(Date.parse(value));
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function sameEntity(
  left: Readonly<{ kind: string; entityId: string }>,
  right: Readonly<{ kind: string; entityId: string }>,
): boolean {
  return left.kind === right.kind && left.entityId === right.entityId;
}

function correlationIdOf(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const correlationId = value['correlationId'];
  return isNonEmptyString(correlationId) ? correlationId : undefined;
}

function eventReferencesAreValid(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_EVENT_REFERENCES &&
    value.every((reference) => isNonEmptyString(reference))
  );
}

function requestIsValid(input: RevenueIntegrationEvaluationInput): boolean {
  return (
    isNonEmptyString(input?.evaluationId) &&
    isNonEmptyString(input?.tenantId) &&
    isNonEmptyString(input?.correlation?.correlationId) &&
    isTimestamp(input?.evaluatedAt) &&
    isRecord(input?.entity) &&
    (input.entity.kind === 'LEAD' ||
      input.entity.kind === 'CUSTOMER' ||
      input.entity.kind === 'CONVERSATION') &&
    isNonEmptyString(input.entity.entityId) &&
    Number.isSafeInteger(input.entityVersion) &&
    input.entityVersion >= 1 &&
    eventReferencesAreValid(input.eventReferences)
  );
}

function crmIsValid(input: RevenueIntegrationEvaluationInput): boolean {
  const crm = input.crm;
  return (
    isRecord(crm) &&
    typeof crm.current === 'boolean' &&
    Array.isArray(crm.currentnessReasons) &&
    crm.currentnessReasons.every(
      (reason) =>
        reason === 'ENTITY_VERSION_BEHIND' ||
        reason === 'MODEL_TOO_OLD' ||
        reason === 'MODEL_TIME_UNKNOWN',
    ) &&
    isRecord(crm.model) &&
    isNonEmptyString(crm.model.tenantId) &&
    isRecord(crm.model.entity) &&
    isNonEmptyString(crm.model.entity.entityId) &&
    (crm.model.entity.kind === 'LEAD' ||
      crm.model.entity.kind === 'CUSTOMER' ||
      crm.model.entity.kind === 'CONVERSATION') &&
    Number.isSafeInteger(crm.model.entityVersion) &&
    crm.model.entityVersion >= 1 &&
    isNonEmptyString(crm.model.sourceSystem) &&
    isNonEmptyString(crm.model.sourceRevision) &&
    isTimestamp(crm.model.observedAt) &&
    isTimestamp(crm.model.projectedAt) &&
    crm.model.authorizesExecution === false &&
    crm.model.canGrantPermission === false
  );
}

function qualificationIsValid(input: RevenueIntegrationEvaluationInput): boolean {
  const qualification = input.qualification;
  return (
    isRecord(qualification) &&
    qualification.kind === 'REVENUE_QUALIFICATION_EVALUATION' &&
    qualification.schemaVersion === '1.0.0' &&
    isNonEmptyString(qualification.tenantId) &&
    isRecord(qualification.entity) &&
    isNonEmptyString(qualification.entity.entityId) &&
    (qualification.entity.kind === 'LEAD' ||
      qualification.entity.kind === 'CUSTOMER' ||
      qualification.entity.kind === 'CONVERSATION') &&
    Number.isSafeInteger(qualification.entityVersion) &&
    qualification.entityVersion >= 1 &&
    isTimestamp(qualification.evaluatedAt) &&
    isNonEmptyString(qualification.ruleSetVersion) &&
    (qualification.stage === 'QUALIFIED' ||
      qualification.stage === 'NURTURE' ||
      qualification.stage === 'UNQUALIFIED' ||
      qualification.stage === 'INCOMPLETE') &&
    (qualification.reviewDisposition === 'NONE' ||
      qualification.reviewDisposition === 'VERIFY_MODEL_ASSIST' ||
      qualification.reviewDisposition === 'ESCALATE_MODEL_ASSIST' ||
      qualification.reviewDisposition === 'ABSTAIN_MODEL_ASSIST') &&
    qualification.authorizesExecution === false &&
    qualification.canGrantPermission === false
  );
}

function nbaIsValid(input: RevenueIntegrationEvaluationInput): boolean {
  const nba = input.nba;
  return (
    isRecord(nba) &&
    nba.kind === 'REVENUE_NEXT_BEST_ACTION_PLAN' &&
    nba.schemaVersion === '1.0.0' &&
    isNonEmptyString(nba.tenantId) &&
    isRecord(nba.correlation) &&
    isNonEmptyString(nba.correlation.correlationId) &&
    isRecord(nba.entity) &&
    isNonEmptyString(nba.entity.entityId) &&
    Number.isSafeInteger(nba.entityVersion) &&
    nba.entityVersion >= 1 &&
    isTimestamp(nba.evaluatedAt) &&
    (nba.disposition === 'SELECTED' ||
      nba.disposition === 'ABSTAIN' ||
      nba.disposition === 'ESCALATE') &&
    Array.isArray(nba.candidates) &&
    nba.authoritySemantics === 'DOMAIN_CANDIDATE_ONLY_NO_ACTION_INTENT' &&
    nba.downstreamExecutionStillRequiresCurrentValidation === true &&
    nba.authorizesExecution === false &&
    nba.canGrantPermission === false
  );
}

function flowIsValid(input: RevenueIntegrationEvaluationInput): boolean {
  const flow = input.flow;
  if (flow === undefined) return true;
  if (!isRecord(flow) || !isRecord(flow.record)) return false;
  if (
    flow.kind !== 'REVENUE_FLOW_PLAN' ||
    flow.schemaVersion !== '1.0.0' ||
    !isNonEmptyString(flow.record.tenantId) ||
    !isRecord(flow.record.entity) ||
    !isNonEmptyString(flow.record.entity.entityId) ||
    !Number.isSafeInteger(flow.record.entityVersion) ||
    flow.record.entityVersion < 1 ||
    !isRecord(flow.record.correlation) ||
    !isNonEmptyString(flow.record.correlation.correlationId) ||
    flow.authoritySemantics !== 'DOMAIN_TASK_ONLY_NO_ACTION_INTENT' ||
    flow.downstreamExecutionStillRequiresCurrentValidation !== true ||
    flow.authorizesExecution !== false ||
    flow.canGrantPermission !== false
  ) {
    return false;
  }
  if (flow.task === undefined) return true;
  return (
    isRecord(flow.task) &&
    flow.task.kind === 'REVENUE_DOMAIN_TASK' &&
    flow.task.schemaVersion === '1.0.0' &&
    flow.task.createsActionIntent === false &&
    flow.task.authorizesExecution === false &&
    flow.task.canGrantPermission === false &&
    typeof flow.task.externalActionPlanned === 'boolean' &&
    typeof flow.task.requiresGovernedExecution === 'boolean' &&
    isNonEmptyString(flow.task.contactPurpose)
  );
}

function fastPathIsValid(input: RevenueIntegrationEvaluationInput): boolean {
  const fastPath = input.fastPath;
  if (fastPath === undefined) return true;
  return (
    isRecord(fastPath) &&
    fastPath.kind === 'REVENUE_FAST_PATH_SELECTION' &&
    fastPath.schemaVersion === '1.0.0' &&
    isNonEmptyString(fastPath.tenantId) &&
    isRecord(fastPath.correlation) &&
    isNonEmptyString(fastPath.correlation.correlationId) &&
    isRecord(fastPath.entity) &&
    isNonEmptyString(fastPath.entity.entityId) &&
    Number.isSafeInteger(fastPath.entityVersion) &&
    fastPath.entityVersion >= 1 &&
    fastPath.requiresCurrentW07ValidationForExternalWrite === true &&
    fastPath.createsActionIntent === false &&
    fastPath.authorizesExecution === false &&
    fastPath.canGrantPermission === false
  );
}

function contactPolicyIsValid(input: RevenueIntegrationEvaluationInput): boolean {
  const policy = input.contactPolicy;
  if (policy === undefined) return true;
  return (
    isRecord(policy) &&
    isNonEmptyString(policy.tenantId) &&
    isTimestamp(policy.evaluatedAt) &&
    typeof policy.current === 'boolean' &&
    (policy.consentStatus === 'ALLOWED' ||
      policy.consentStatus === 'OPTED_OUT' ||
      policy.consentStatus === 'UNKNOWN') &&
    Array.isArray(policy.allowedPurposes) &&
    policy.allowedPurposes.every(
      (purpose) => purpose === 'MARKETING' || purpose === 'SALES' || purpose === 'CUSTOMER_SUCCESS',
    ) &&
    isNonEmptyString(policy.sourceRevision) &&
    isNonEmptyString(policy.sourceReference) &&
    policy.authorizesExecution === false &&
    policy.canGrantPermission === false
  );
}

function executionIsValid(input: RevenueIntegrationEvaluationInput): boolean {
  const execution = input.execution;
  if (execution === undefined) return true;
  return (
    isRecord(execution) &&
    execution.source === 'W07_EXECUTION_RESULT' &&
    isNonEmptyString(execution.tenantId) &&
    isNonEmptyString(execution.correlationId) &&
    isNonEmptyString(execution.actionIntentReference) &&
    isNonEmptyString(execution.executionReference) &&
    EXECUTION_OUTCOMES.includes(execution.outcome) &&
    isTimestamp(execution.observedAt) &&
    (execution.authoritativeEvidenceReference === undefined ||
      isNonEmptyString(execution.authoritativeEvidenceReference)) &&
    (execution.outcome !== 'VERIFIED' ||
      isNonEmptyString(execution.authoritativeEvidenceReference)) &&
    execution.authorizesExecution === false &&
    execution.canGrantPermission === false
  );
}

function providerReadbackIsValid(input: RevenueIntegrationEvaluationInput): boolean {
  const readback = input.providerReadback;
  if (readback === undefined) return true;
  return (
    isRecord(readback) &&
    readback.source === 'W08_PROVIDER_READBACK' &&
    isNonEmptyString(readback.tenantId) &&
    isNonEmptyString(readback.correlationId) &&
    isNonEmptyString(readback.actionIntentReference) &&
    isTimestamp(readback.observedAt) &&
    REVENUE_PROVIDER_READBACK_OBSERVATIONS.includes(readback.observation) &&
    (readback.reference === undefined || isNonEmptyString(readback.reference)) &&
    (readback.providerRevision === undefined || isNonEmptyString(readback.providerRevision)) &&
    readback.retryAuthorized === false &&
    readback.authorizesExecution === false &&
    readback.canGrantPermission === false
  );
}

function businessOutcomeIsValid(input: RevenueIntegrationEvaluationInput): boolean {
  const outcome = input.businessOutcome;
  if (outcome === undefined) return true;
  return (
    isRecord(outcome) &&
    outcome.kind === 'REVENUE_BUSINESS_OUTCOME_OBSERVATION' &&
    outcome.schemaVersion === '1.0.0' &&
    isNonEmptyString(outcome.tenantId) &&
    isNonEmptyString(outcome.correlationId) &&
    isRecord(outcome.entity) &&
    isNonEmptyString(outcome.entity.entityId) &&
    Number.isSafeInteger(outcome.entityVersion) &&
    outcome.entityVersion >= 1 &&
    REVENUE_BUSINESS_OUTCOME_TYPES.includes(outcome.outcomeType) &&
    (outcome.verification === 'VERIFIED_BUSINESS_FACT' ||
      outcome.verification === 'UNVERIFIED_OBSERVATION') &&
    isTimestamp(outcome.observedAt) &&
    isNonEmptyString(outcome.sourceSystem) &&
    isNonEmptyString(outcome.sourceRevision) &&
    isNonEmptyString(outcome.provenanceReference) &&
    outcome.authorizesExecution === false &&
    outcome.canGrantPermission === false
  );
}

function humanCorrectionIsValid(input: RevenueIntegrationEvaluationInput): boolean {
  const correction = input.humanCorrection;
  if (correction === undefined) return true;
  return (
    isRecord(correction) &&
    correction.kind === 'REVENUE_HUMAN_CORRECTION' &&
    correction.schemaVersion === '1.0.0' &&
    isNonEmptyString(correction.correctionId) &&
    isNonEmptyString(correction.tenantId) &&
    isNonEmptyString(correction.correlationId) &&
    isRecord(correction.entity) &&
    isNonEmptyString(correction.entity.entityId) &&
    Number.isSafeInteger(correction.entityVersion) &&
    correction.entityVersion >= 1 &&
    REVENUE_HUMAN_CORRECTION_DISPOSITIONS.includes(correction.disposition) &&
    isTimestamp(correction.observedAt) &&
    isNonEmptyString(correction.rationale, MAX_RATIONALE_LENGTH) &&
    isNonEmptyString(correction.provenanceReference) &&
    correction.authorizesExecution === false &&
    correction.canGrantPermission === false
  );
}

function measurementIsValid(input: RevenueIntegrationEvaluationInput): boolean {
  const measurement = input.measurement;
  return (
    isRecord(measurement) &&
    measurement.measurementScope === 'TEST_FIXTURE_PROXY_NOT_PRODUCTION_SLO_OR_PROVIDER_COST' &&
    isNonNegativeSafeInteger(measurement.latencyMicros) &&
    isNonNegativeSafeInteger(measurement.modelCalls) &&
    isNonNegativeSafeInteger(measurement.economicCostMicrounits) &&
    isRecord(measurement.budget) &&
    isNonEmptyString(measurement.budget.budgetReference) &&
    isNonNegativeSafeInteger(measurement.budget.maxLatencyMicros) &&
    isNonNegativeSafeInteger(measurement.budget.maxModelCalls) &&
    isNonNegativeSafeInteger(measurement.budget.maxEconomicCostMicrounits) &&
    measurement.providerCost === 'NOT_OBSERVED' &&
    measurement.productionSlo === 'NOT_OBSERVED'
  );
}

function tenantAndEntityError(
  input: RevenueIntegrationEvaluationInput,
): RevenueIntegrationError | undefined {
  const tenantIds = [
    input.crm.model.tenantId,
    input.qualification.tenantId,
    input.nba.tenantId,
    input.flow?.record.tenantId,
    input.fastPath?.tenantId,
    input.contactPolicy?.tenantId,
    input.execution?.tenantId,
    input.providerReadback?.tenantId,
    input.businessOutcome?.tenantId,
    input.humanCorrection?.tenantId,
  ].filter((tenantId): tenantId is typeof input.tenantId => tenantId !== undefined);
  if (tenantIds.some((tenantId) => tenantId !== input.tenantId)) return 'TENANT_MISMATCH';

  const entities = [
    input.crm.model.entity,
    input.qualification.entity,
    input.nba.entity,
    input.flow?.record.entity,
    input.fastPath?.entity,
    input.businessOutcome?.entity,
    input.humanCorrection?.entity,
  ].filter((entity): entity is RevenueIntegrationEvaluationInput['entity'] => entity !== undefined);
  if (entities.some((entity) => !sameEntity(entity, input.entity))) return 'ENTITY_MISMATCH';

  const versions = [
    input.crm.model.entityVersion,
    input.qualification.entityVersion,
    input.nba.entityVersion,
    input.flow?.record.entityVersion,
    input.fastPath?.entityVersion,
    input.businessOutcome?.entityVersion,
    input.humanCorrection?.entityVersion,
  ].filter((version): version is number => version !== undefined);
  return versions.some((version) => version !== input.entityVersion)
    ? 'ENTITY_VERSION_CONFLICT'
    : undefined;
}

function correlationError(
  input: RevenueIntegrationEvaluationInput,
): RevenueIntegrationError | undefined {
  const expected = input.correlation.correlationId;
  const correlations = [
    correlationIdOf(input.crm.model.correlation),
    input.qualification.correlation.correlationId,
    input.nba.correlation.correlationId,
    input.flow?.record.correlation.correlationId,
    input.fastPath?.correlation.correlationId,
    input.execution?.correlationId,
    input.providerReadback?.correlationId,
    input.businessOutcome?.correlationId,
    input.humanCorrection?.correlationId,
  ].filter((correlation): correlation is string => correlation !== undefined);
  return correlations.some((correlation) => correlation !== expected)
    ? 'CORRELATION_MISMATCH'
    : undefined;
}

function futureEvidenceError(
  input: RevenueIntegrationEvaluationInput,
): RevenueIntegrationError | undefined {
  const evaluatedAt = Date.parse(input.evaluatedAt);
  const timestamps = [
    input.crm.model.observedAt,
    input.crm.model.projectedAt,
    input.qualification.evaluatedAt,
    input.nba.evaluatedAt,
    input.contactPolicy?.evaluatedAt,
    input.execution?.observedAt,
    input.providerReadback?.observedAt,
    input.businessOutcome?.observedAt,
    input.humanCorrection?.observedAt,
  ].filter((timestamp): timestamp is string => timestamp !== undefined);
  return timestamps.some((timestamp) => Date.parse(timestamp) > evaluatedAt)
    ? 'EVIDENCE_FUTURE_OBSERVATION'
    : undefined;
}

function assessBudget(
  input: RevenueIntegrationEvaluationInput,
): RevenueIntegrationBudgetAssessment {
  const { measurement } = input;
  const latencyWithinBudget = measurement.latencyMicros <= measurement.budget.maxLatencyMicros;
  const modelCallsWithinBudget = measurement.modelCalls <= measurement.budget.maxModelCalls;
  const economicCostWithinBudget =
    measurement.economicCostMicrounits <= measurement.budget.maxEconomicCostMicrounits;
  return {
    budgetReference: measurement.budget.budgetReference,
    latencyWithinBudget,
    modelCallsWithinBudget,
    economicCostWithinBudget,
    withinBudget: latencyWithinBudget && modelCallsWithinBudget && economicCostWithinBudget,
    measurementScope: measurement.measurementScope,
    providerCost: 'NOT_OBSERVED',
    productionSlo: 'NOT_OBSERVED',
  };
}

function buildBusinessOutcome(
  input: RevenueIntegrationEvaluationInput,
): RevenueBusinessOutcomeEvidence {
  const correction = input.humanCorrection;
  if (correction?.disposition === 'REJECT_OUTCOME') {
    return {
      status: 'HUMAN_REJECTED_OUTCOME',
      ...(input.businessOutcome === undefined
        ? {}
        : { outcomeType: input.businessOutcome.outcomeType }),
      ...(input.execution === undefined ? {} : { executionOutcome: input.execution.outcome }),
      ...(input.execution === undefined
        ? {}
        : { executionReference: input.execution.executionReference }),
      ...(input.providerReadback === undefined
        ? {}
        : { providerReadbackObservation: input.providerReadback.observation }),
      humanCorrectionReference: correction.provenanceReference,
      suitableForW17W18Evaluation: true,
      adaptiveLearningPromotionAllowed: false,
      authorizesExecution: false,
      canGrantPermission: false,
    };
  }
  if (input.businessOutcome !== undefined) {
    return {
      status:
        input.businessOutcome.verification === 'VERIFIED_BUSINESS_FACT'
          ? 'VERIFIED_BUSINESS_OUTCOME'
          : 'UNVERIFIED_BUSINESS_OBSERVATION',
      outcomeType: input.businessOutcome.outcomeType,
      businessProvenanceReference: input.businessOutcome.provenanceReference,
      ...(input.execution === undefined ? {} : { executionOutcome: input.execution.outcome }),
      ...(input.execution === undefined
        ? {}
        : { executionReference: input.execution.executionReference }),
      ...(input.providerReadback === undefined
        ? {}
        : { providerReadbackObservation: input.providerReadback.observation }),
      ...(correction === undefined
        ? {}
        : { humanCorrectionReference: correction.provenanceReference }),
      suitableForW17W18Evaluation: input.businessOutcome.verification === 'VERIFIED_BUSINESS_FACT',
      adaptiveLearningPromotionAllowed: false,
      authorizesExecution: false,
      canGrantPermission: false,
    };
  }
  if (input.execution?.outcome === 'VERIFIED') {
    return {
      status: 'EXECUTION_VERIFIED_NO_BUSINESS_OUTCOME',
      executionOutcome: input.execution.outcome,
      executionReference: input.execution.executionReference,
      ...(input.providerReadback === undefined
        ? {}
        : { providerReadbackObservation: input.providerReadback.observation }),
      suitableForW17W18Evaluation: false,
      adaptiveLearningPromotionAllowed: false,
      authorizesExecution: false,
      canGrantPermission: false,
    };
  }
  return {
    status: 'NO_EXTERNAL_EXECUTION_OR_BUSINESS_OUTCOME',
    ...(input.execution === undefined ? {} : { executionOutcome: input.execution.outcome }),
    ...(input.execution === undefined
      ? {}
      : { executionReference: input.execution.executionReference }),
    suitableForW17W18Evaluation: false,
    adaptiveLearningPromotionAllowed: false,
    authorizesExecution: false,
    canGrantPermission: false,
  };
}

function evidenceReferences(input: RevenueIntegrationEvaluationInput): readonly string[] {
  const references = [
    input.crm.model.sourceReference,
    input.crm.model.sourceRevision,
    input.qualification.ruleSetVersion,
    input.nba.evidence.capabilityPlanReference,
    input.nba.evidence.contextPackageReference,
    input.flow?.record.templateReference,
    input.fastPath?.evidence.capabilityPlanReference,
    input.execution?.authoritativeEvidenceReference,
    input.execution?.executionReference,
    input.providerReadback?.reference,
    input.businessOutcome?.provenanceReference,
    input.humanCorrection?.provenanceReference,
  ].filter((reference): reference is string => reference !== undefined);
  return [...new Set(references)].sort();
}

function evaluation(
  input: RevenueIntegrationEvaluationInput,
  budget: RevenueIntegrationBudgetAssessment,
  disposition: RevenueIntegrationDisposition,
  reason: RevenueIntegrationReason,
): RevenueIntegrationEvaluationResult {
  const result: RevenueIntegrationEvaluation = {
    kind: 'REVENUE_INTEGRATION_EVALUATION',
    schemaVersion: '1.0.0',
    evaluationId: input.evaluationId,
    tenantId: input.tenantId,
    correlation: input.correlation,
    entity: input.entity,
    entityVersion: input.entityVersion,
    evaluatedAt: input.evaluatedAt,
    disposition,
    reason,
    eventReferences: [...input.eventReferences].sort(),
    evidenceReferences: evidenceReferences(input),
    businessOutcome: buildBusinessOutcome(input),
    budget,
    downstreamExecutionStillRequiresCurrentValidation: true,
    authoritySemantics: 'INTEGRATION_EVIDENCE_ONLY_NO_ACTION_INTENT',
    adaptiveLearningPromotionAllowed: false,
    authorizesExecution: false,
    canGrantPermission: false,
  };
  return { ok: true, evaluation: result };
}

function malformedError(
  input: RevenueIntegrationEvaluationInput,
): RevenueIntegrationError | undefined {
  if (!requestIsValid(input)) return 'REQUEST_MALFORMED';
  if (!crmIsValid(input)) return 'CRM_MALFORMED';
  if (!qualificationIsValid(input)) return 'QUALIFICATION_MALFORMED';
  if (!nbaIsValid(input)) return 'NBA_MALFORMED';
  if (!flowIsValid(input)) return 'FLOW_MALFORMED';
  if (!fastPathIsValid(input)) return 'FAST_PATH_MALFORMED';
  if (!contactPolicyIsValid(input)) return 'CONTACT_POLICY_MALFORMED';
  if (!executionIsValid(input)) return 'EXECUTION_EVIDENCE_MALFORMED';
  if (!providerReadbackIsValid(input)) return 'PROVIDER_READBACK_MALFORMED';
  if (!businessOutcomeIsValid(input)) return 'BUSINESS_OUTCOME_MALFORMED';
  if (!humanCorrectionIsValid(input)) return 'HUMAN_CORRECTION_MALFORMED';
  if (!measurementIsValid(input)) return 'MEASUREMENT_MALFORMED';
  return undefined;
}

/**
 * Pure W10-G acceptance/evaluation composition. It reads accepted projections
 * and emits advisory evidence only; it performs no persistence or side effect.
 */
export function evaluateRevenueIntegration(
  input: RevenueIntegrationEvaluationInput,
): RevenueIntegrationEvaluationResult {
  const malformed = malformedError(input);
  if (malformed !== undefined) return { ok: false, error: malformed };

  if (new Set(input.eventReferences).size !== input.eventReferences.length) {
    return { ok: false, error: 'DUPLICATE_EVENT_REFERENCE' };
  }

  const tenantOrEntity = tenantAndEntityError(input);
  if (tenantOrEntity !== undefined) return { ok: false, error: tenantOrEntity };

  const correlation = correlationError(input);
  if (correlation !== undefined) return { ok: false, error: correlation };

  if (
    input.execution !== undefined &&
    input.providerReadback !== undefined &&
    input.execution.actionIntentReference !== input.providerReadback.actionIntentReference
  ) {
    return { ok: false, error: 'EXECUTION_READBACK_REFERENCE_MISMATCH' };
  }

  const futureEvidence = futureEvidenceError(input);
  if (futureEvidence !== undefined) return { ok: false, error: futureEvidence };

  const budget = assessBudget(input);
  if (!budget.withinBudget) return evaluation(input, budget, 'ESCALATE', 'BUDGET_EXCEEDED');

  if (!input.crm.current || input.crm.currentnessReasons.length > 0) {
    return evaluation(input, budget, 'ABSTAIN', 'CRM_NOT_CURRENT');
  }
  if (input.qualification.stage === 'INCOMPLETE') {
    return evaluation(input, budget, 'ABSTAIN', 'QUALIFICATION_INCOMPLETE');
  }
  if (input.qualification.reviewDisposition !== 'NONE') {
    return evaluation(input, budget, 'ESCALATE', 'QUALIFICATION_REVIEW_REQUIRED');
  }
  if (input.nba.disposition === 'ABSTAIN') {
    return evaluation(input, budget, 'ABSTAIN', 'NBA_ABSTAINED');
  }
  if (input.nba.disposition === 'ESCALATE') {
    return evaluation(input, budget, 'ESCALATE', 'NBA_ESCALATED');
  }
  if (input.flow?.disposition === 'ABSTAIN') {
    return evaluation(input, budget, 'ABSTAIN', 'FLOW_ABSTAINED');
  }
  if (input.flow?.disposition === 'ESCALATE') {
    return evaluation(input, budget, 'ESCALATE', 'FLOW_ESCALATED');
  }

  if (input.humanCorrection?.disposition === 'REQUIRE_REVIEW') {
    return evaluation(input, budget, 'ESCALATE', 'HUMAN_CORRECTION_REQUIRES_REVIEW');
  }

  const externalTask = input.flow?.task?.externalActionPlanned === true;
  if (externalTask) {
    const policy = input.contactPolicy;
    const purpose = input.flow?.task?.contactPurpose;
    if (
      policy === undefined ||
      purpose === undefined ||
      !policy.current ||
      policy.consentStatus !== 'ALLOWED' ||
      !policy.allowedPurposes.includes(purpose)
    ) {
      return evaluation(input, budget, 'ABSTAIN', 'CONSENT_OR_PURPOSE_CHANGED');
    }
    if (input.execution === undefined) {
      return evaluation(input, budget, 'ESCALATE', 'EXECUTION_EVIDENCE_REQUIRED');
    }
  }

  if (input.execution !== undefined) {
    switch (input.execution.outcome) {
      case 'NOT_ATTEMPTED':
        return evaluation(input, budget, 'ABSTAIN', 'EXECUTION_NOT_ATTEMPTED');
      case 'REJECTED':
        return evaluation(input, budget, 'ABSTAIN', 'EXECUTION_REJECTED');
      case 'FAILED':
        return evaluation(input, budget, 'ABSTAIN', 'EXECUTION_FAILED');
      case 'EXECUTED_ACKNOWLEDGED':
        return evaluation(input, budget, 'ESCALATE', 'EXECUTION_NOT_VERIFIED');
      case 'EXECUTION_UNCERTAIN':
        return evaluation(input, budget, 'ESCALATE', 'RECONCILIATION_REQUIRED');
      case 'VERIFIED':
        if (
          input.providerReadback !== undefined &&
          input.providerReadback.observation !== 'EFFECT_OBSERVED'
        ) {
          return evaluation(input, budget, 'ESCALATE', 'EXECUTION_READBACK_CONFLICT');
        }
        break;
    }
  }

  if (
    input.businessOutcome?.verification === 'UNVERIFIED_OBSERVATION' &&
    input.humanCorrection?.disposition !== 'REJECT_OUTCOME'
  ) {
    return evaluation(input, budget, 'ABSTAIN', 'BUSINESS_OUTCOME_UNVERIFIED');
  }

  return evaluation(input, budget, 'PASS', 'INTEGRATION_EVIDENCE_ACCEPTED');
}
