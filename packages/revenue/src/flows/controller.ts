import type { RevenueCrmReadModel } from '../crm/types.js';
import type { RevenueEntityRef } from '../lifecycle/types.js';
import type { QualificationEvaluation } from '../scoring/types.js';
import type {
  PlanRevenueFlowInput,
  PlanRevenueFlowResult,
  RevenueContactPolicyProjection,
  RevenueDispatchObservation,
  RevenueDomainTask,
  RevenueFlowError,
  RevenueFlowPlan,
  RevenueFlowRecord,
  RevenueFlowReason,
  RevenueFlowTemplateProjection,
  RevenueFlowTemplateStepProjection,
} from './types.js';

const MAX_IDENTIFIER_LENGTH = 1_024;
const MAX_TEMPLATE_STEPS = 32;
const MAX_ATTEMPTS_PER_STEP = 16;
const MAX_CADENCE_MS = 365 * 24 * 60 * 60 * 1_000;

function isNonEmptyString(value: unknown, maxLength = MAX_IDENTIFIER_LENGTH): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isTimestamp(value: unknown): value is string {
  return isNonEmptyString(value, 128) && Number.isFinite(Date.parse(value));
}

function isNonNegativeInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= maximum;
}

function correlationId(value: unknown): string | null {
  if (value === null || typeof value !== 'object') return null;
  const descriptor = Object.getOwnPropertyDescriptor(value, 'correlationId');
  if (descriptor === undefined || !('value' in descriptor) || !isNonEmptyString(descriptor.value)) {
    return null;
  }
  return descriptor.value;
}

function correlationsMatch(left: unknown, right: unknown): boolean {
  const leftId = correlationId(left);
  const rightId = correlationId(right);
  return leftId !== null && rightId !== null && leftId === rightId;
}

function dispatchObservationValid(value: unknown): value is RevenueDispatchObservation | undefined {
  return (
    value === undefined ||
    value === 'NONE' ||
    value === 'ACKNOWLEDGED' ||
    value === 'NO_EFFECT_CONFIRMED' ||
    value === 'EXECUTION_UNCERTAIN'
  );
}

function cancellationReasonValid(value: unknown): boolean {
  return (
    value === undefined ||
    value === 'NONE' ||
    value === 'USER_REQUEST' ||
    value === 'CONSENT_REVOKED' ||
    value === 'BUSINESS_CANCELLED'
  );
}

function crmCurrentnessValid(input: PlanRevenueFlowInput['crm']): boolean {
  return (
    typeof input.current === 'boolean' &&
    Array.isArray(input.currentnessReasons) &&
    input.currentnessReasons.every(
      (reason) =>
        reason === 'ENTITY_VERSION_BEHIND' ||
        reason === 'MODEL_TOO_OLD' ||
        reason === 'MODEL_TIME_UNKNOWN',
    ) &&
    !(input.current && input.currentnessReasons.length > 0)
  );
}

function qualificationValid(value: QualificationEvaluation): boolean {
  return (
    value.kind === 'REVENUE_QUALIFICATION_EVALUATION' &&
    value.schemaVersion === '1.0.0' &&
    isNonEmptyString(value.tenantId) &&
    isEntity(value.entity) &&
    isNonNegativeInteger(value.entityVersion) &&
    value.entityVersion >= 1 &&
    isNonEmptyString(value.featureSetRevision) &&
    isNonEmptyString(value.ruleSetVersion) &&
    isNonEmptyString(value.thresholdVersion) &&
    isTimestamp(value.evaluatedAt) &&
    correlationId(value.correlation) !== null &&
    (value.mode === 'DETERMINISTIC' || value.mode === 'MODEL_ASSISTED') &&
    (value.scoreBps === null || isNonNegativeInteger(value.scoreBps, 10_000)) &&
    (value.stage === 'QUALIFIED' ||
      value.stage === 'NURTURE' ||
      value.stage === 'UNQUALIFIED' ||
      value.stage === 'INCOMPLETE') &&
    isNonNegativeInteger(value.coverageBps, 10_000) &&
    Array.isArray(value.contributions) &&
    Array.isArray(value.missingCriticalFeatures) &&
    value.missingCriticalFeatures.every((key) => isNonEmptyString(key)) &&
    (value.reviewDisposition === 'NONE' ||
      value.reviewDisposition === 'VERIFY_MODEL_ASSIST' ||
      value.reviewDisposition === 'ESCALATE_MODEL_ASSIST' ||
      value.reviewDisposition === 'ABSTAIN_MODEL_ASSIST') &&
    value.authorizesExecution === false &&
    value.canGrantPermission === false
  );
}

function sameEntity(left: RevenueEntityRef, right: RevenueEntityRef): boolean {
  return left.kind === right.kind && left.entityId === right.entityId;
}

function isEntity(value: RevenueEntityRef | undefined): value is RevenueEntityRef {
  return (
    value !== undefined &&
    (value.kind === 'LEAD' || value.kind === 'CUSTOMER' || value.kind === 'CONVERSATION') &&
    isNonEmptyString(value.entityId)
  );
}

function isCrmModelValid(model: RevenueCrmReadModel | undefined): model is RevenueCrmReadModel {
  return (
    model !== undefined &&
    isNonEmptyString(model.tenantId) &&
    isEntity(model.entity) &&
    isNonNegativeInteger(model.entityVersion) &&
    model.entityVersion >= 1 &&
    isNonEmptyString(model.sourceSystem) &&
    isNonEmptyString(model.sourceRevision) &&
    isTimestamp(model.observedAt) &&
    isTimestamp(model.projectedAt) &&
    model.authorizesExecution === false &&
    model.canGrantPermission === false
  );
}

function isTemplateStepValid(step: RevenueFlowTemplateStepProjection | undefined): boolean {
  return (
    step !== undefined &&
    isNonEmptyString(step.stepId) &&
    (step.taskKind === 'PREPARE_NURTURE_TOUCH' ||
      step.taskKind === 'PREPARE_SALES_HANDOFF' ||
      step.taskKind === 'PREPARE_CUSTOMER_SUCCESS_CHECKIN') &&
    (step.contactPurpose === 'MARKETING' ||
      step.contactPurpose === 'SALES' ||
      step.contactPurpose === 'CUSTOMER_SUCCESS') &&
    typeof step.externalAction === 'boolean' &&
    isNonNegativeInteger(step.cadenceMs, MAX_CADENCE_MS) &&
    Number.isSafeInteger(step.maxAttempts) &&
    step.maxAttempts >= 1 &&
    step.maxAttempts <= MAX_ATTEMPTS_PER_STEP
  );
}

function templateError(
  template: RevenueFlowTemplateProjection,
): 'TEMPLATE_MALFORMED' | 'TEMPLATE_STEP_DUPLICATE' | null {
  if (
    template.source !== 'W04_TEMPLATE_PLAN' ||
    !isNonEmptyString(template.tenantId) ||
    !isNonEmptyString(template.templateReference) ||
    !isNonEmptyString(template.templateVersion) ||
    !['READY', 'STALE', 'BLOCKED'].includes(template.status) ||
    !['NURTURE', 'SALES', 'CUSTOMER_SUCCESS'].includes(template.flowKind) ||
    !Array.isArray(template.steps) ||
    template.steps.length < 1 ||
    template.steps.length > MAX_TEMPLATE_STEPS ||
    !template.steps.every((step) => isTemplateStepValid(step)) ||
    template.authorizesExecution !== false ||
    template.canGrantPermission !== false
  ) {
    return 'TEMPLATE_MALFORMED';
  }
  if (new Set(template.steps.map((step) => step.stepId)).size !== template.steps.length) {
    return 'TEMPLATE_STEP_DUPLICATE';
  }
  return null;
}

function contactPolicyValid(policy: RevenueContactPolicyProjection): boolean {
  return (
    isNonEmptyString(policy.tenantId) &&
    isTimestamp(policy.evaluatedAt) &&
    typeof policy.current === 'boolean' &&
    ['ALLOWED', 'OPTED_OUT', 'UNKNOWN'].includes(policy.consentStatus) &&
    Array.isArray(policy.allowedPurposes) &&
    policy.allowedPurposes.every((purpose) =>
      ['MARKETING', 'SALES', 'CUSTOMER_SUCCESS'].includes(purpose),
    ) &&
    new Set(policy.allowedPurposes).size === policy.allowedPurposes.length &&
    isNonEmptyString(policy.sourceRevision) &&
    isNonEmptyString(policy.sourceReference) &&
    policy.authorizesExecution === false &&
    policy.canGrantPermission === false
  );
}

function qualificationBoundaryError(
  input: PlanRevenueFlowInput,
  qualification: QualificationEvaluation,
):
  | 'TENANT_MISMATCH'
  | 'ENTITY_MISMATCH'
  | 'ENTITY_VERSION_CONFLICT'
  | 'CORRELATION_MISMATCH'
  | 'OUT_OF_ORDER_EVALUATION'
  | null {
  if (qualification.tenantId !== input.tenantId) return 'TENANT_MISMATCH';
  if (!correlationsMatch(qualification.correlation, input.correlation))
    return 'CORRELATION_MISMATCH';
  if (!sameEntity(qualification.entity, input.crm.model.entity)) return 'ENTITY_MISMATCH';
  if (qualification.entityVersion !== input.crm.model.entityVersion)
    return 'ENTITY_VERSION_CONFLICT';
  if (
    !isTimestamp(qualification.evaluatedAt) ||
    Date.parse(qualification.evaluatedAt) > Date.parse(input.evaluatedAt)
  ) {
    return 'OUT_OF_ORDER_EVALUATION';
  }
  return null;
}

function flowApplicabilityReason(input: PlanRevenueFlowInput): RevenueFlowReason | null {
  const { model } = input.crm;
  if (input.template.flowKind === 'CUSTOMER_SUCCESS') {
    return model.entity.kind === 'CUSTOMER' && model.lifecycleState === 'ACTIVE'
      ? null
      : 'FLOW_NOT_APPLICABLE';
  }

  const qualification = input.qualification;
  if (qualification === undefined) return 'QUALIFICATION_REQUIRED';
  if (qualification.stage === 'INCOMPLETE') return 'QUALIFICATION_INCOMPLETE';
  if (qualification.reviewDisposition !== 'NONE') return 'QUALIFICATION_REVIEW_REQUIRED';

  if (input.template.flowKind === 'NURTURE') {
    return model.entity.kind === 'LEAD' && qualification.stage === 'NURTURE'
      ? null
      : 'FLOW_NOT_APPLICABLE';
  }
  return model.entity.kind === 'LEAD' && qualification.stage === 'QUALIFIED'
    ? null
    : 'FLOW_NOT_APPLICABLE';
}

function policyBlockReason(
  policy: RevenueContactPolicyProjection,
  step: RevenueFlowTemplateStepProjection,
): 'CONTACT_POLICY_NOT_CURRENT' | 'CONSENT_BLOCKED' | 'PURPOSE_NOT_ALLOWED' | null {
  if (!step.externalAction) return null;
  if (!policy.current) return 'CONTACT_POLICY_NOT_CURRENT';
  if (policy.consentStatus !== 'ALLOWED') return 'CONSENT_BLOCKED';
  if (!policy.allowedPurposes.includes(step.contactPurpose)) return 'PURPOSE_NOT_ALLOWED';
  return null;
}

function addMilliseconds(timestamp: string, milliseconds: number): string {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
}

function dedupeKey(
  input: PlanRevenueFlowInput,
  step: RevenueFlowTemplateStepProjection,
  attempt: number,
): string {
  const entity = input.crm.model.entity;
  return [
    'w10d',
    input.tenantId,
    input.flowId,
    input.template.templateVersion,
    `${entity.kind}:${entity.entityId}:v${input.crm.model.entityVersion}`,
    step.stepId,
    `attempt:${attempt}`,
  ].join(':');
}

function baseRecord(input: PlanRevenueFlowInput): RevenueFlowRecord | null {
  const firstStep = input.template.steps[0];
  if (firstStep === undefined) return null;
  return {
    kind: 'REVENUE_DOMAIN_FLOW',
    schemaVersion: '1.0.0',
    tenantId: input.tenantId,
    flowId: input.flowId,
    flowKind: input.template.flowKind,
    entity: input.crm.model.entity,
    entityVersion: input.crm.model.entityVersion,
    templateReference: input.template.templateReference,
    templateVersion: input.template.templateVersion,
    state: 'ACTIVE',
    stepIndex: 0,
    attemptsForStep: 0,
    nextEligibleAt: addMilliseconds(input.evaluatedAt, firstStep.cadenceMs),
    lastDispatchObservation: 'NONE',
    updatedAt: input.evaluatedAt,
    correlation: input.correlation,
    cancellationReason: 'NONE',
    authorizesExecution: false,
    canGrantPermission: false,
  };
}

function recordWith(
  record: RevenueFlowRecord,
  changes: Partial<RevenueFlowRecord>,
  includeLastTask: boolean,
): RevenueFlowRecord {
  const merged = { ...record, ...changes };
  if (includeLastTask && merged.lastTaskDedupeKey !== undefined) return merged;
  const { lastTaskDedupeKey, ...withoutLastTask } = merged;
  void lastTaskDedupeKey;
  return withoutLastTask;
}

function existingRecordError(
  input: PlanRevenueFlowInput,
  record: RevenueFlowRecord,
): RevenueFlowError | null {
  if (
    record.kind !== 'REVENUE_DOMAIN_FLOW' ||
    record.schemaVersion !== '1.0.0' ||
    !isNonEmptyString(record.flowId) ||
    !isEntity(record.entity) ||
    !isNonNegativeInteger(record.entityVersion) ||
    !isNonNegativeInteger(record.stepIndex, MAX_TEMPLATE_STEPS) ||
    !isNonNegativeInteger(record.attemptsForStep, MAX_ATTEMPTS_PER_STEP) ||
    !isTimestamp(record.nextEligibleAt) ||
    !isTimestamp(record.updatedAt) ||
    correlationId(record.correlation) === null ||
    !['ACTIVE', 'PAUSED_POLICY', 'WAITING_RECONCILIATION', 'COMPLETED', 'CANCELLED'].includes(
      record.state,
    ) ||
    !['NONE', 'ACKNOWLEDGED', 'NO_EFFECT_CONFIRMED', 'EXECUTION_UNCERTAIN'].includes(
      record.lastDispatchObservation,
    ) ||
    !['NONE', 'USER_REQUEST', 'CONSENT_REVOKED', 'BUSINESS_CANCELLED'].includes(
      record.cancellationReason,
    ) ||
    record.authorizesExecution !== false ||
    record.canGrantPermission !== false
  ) {
    return 'EXISTING_RECORD_MALFORMED';
  }
  if (record.tenantId !== input.tenantId) return 'TENANT_MISMATCH';
  if (!correlationsMatch(record.correlation, input.correlation)) return 'CORRELATION_MISMATCH';
  if (record.flowId !== input.flowId) return 'FLOW_ID_CONFLICT';
  if (record.flowKind !== input.template.flowKind) return 'FLOW_KIND_CONFLICT';
  if (!sameEntity(record.entity, input.crm.model.entity)) return 'ENTITY_MISMATCH';
  if (record.entityVersion !== input.crm.model.entityVersion) return 'ENTITY_VERSION_CONFLICT';
  if (
    record.templateReference !== input.template.templateReference ||
    record.templateVersion !== input.template.templateVersion
  ) {
    return 'TEMPLATE_VERSION_CONFLICT';
  }
  if (Date.parse(record.updatedAt) > Date.parse(input.evaluatedAt))
    return 'OUT_OF_ORDER_EVALUATION';
  if (record.state !== 'COMPLETED' && record.stepIndex >= input.template.steps.length) {
    return 'EXISTING_RECORD_MALFORMED';
  }
  return null;
}

function plan(
  disposition: RevenueFlowPlan['disposition'],
  reason: RevenueFlowReason,
  record: RevenueFlowRecord,
  invalidatesPendingOutreach: boolean,
  task?: RevenueDomainTask,
): PlanRevenueFlowResult {
  const result: RevenueFlowPlan = {
    kind: 'REVENUE_FLOW_PLAN',
    schemaVersion: '1.0.0',
    disposition,
    reason,
    record,
    invalidatesPendingOutreach,
    authoritySemantics: 'DOMAIN_TASK_ONLY_NO_ACTION_INTENT',
    downstreamExecutionStillRequiresCurrentValidation: true,
    authorizesExecution: false,
    canGrantPermission: false,
    ...(task === undefined ? {} : { task }),
  };
  return { ok: true, plan: result };
}

function pauseForPolicy(
  input: PlanRevenueFlowInput,
  record: RevenueFlowRecord,
  reason: 'CONTACT_POLICY_NOT_CURRENT' | 'CONSENT_BLOCKED' | 'PURPOSE_NOT_ALLOWED',
): PlanRevenueFlowResult {
  const paused = recordWith(
    record,
    { state: 'PAUSED_POLICY', updatedAt: input.evaluatedAt },
    false,
  );
  return plan('ABSTAIN', reason, paused, true);
}

function applyObservation(
  input: PlanRevenueFlowInput,
  record: RevenueFlowRecord,
  observation: RevenueDispatchObservation,
): PlanRevenueFlowResult | RevenueFlowRecord {
  if (observation === 'NONE') {
    if (record.state === 'WAITING_RECONCILIATION') {
      return plan('ESCALATE', 'RECONCILIATION_REQUIRED', record, false);
    }
    if (record.lastTaskDedupeKey !== undefined) {
      return plan('WAIT', 'WAITING_FOR_OUTCOME', record, false);
    }
    return record;
  }

  if (record.lastTaskDedupeKey === undefined) {
    return { ok: false, error: 'DISPATCH_OBSERVATION_INVALID' };
  }

  if (observation === 'EXECUTION_UNCERTAIN') {
    const uncertain = recordWith(
      record,
      {
        state: 'WAITING_RECONCILIATION',
        lastDispatchObservation: observation,
        updatedAt: input.evaluatedAt,
      },
      true,
    );
    return plan('ESCALATE', 'RECONCILIATION_REQUIRED', uncertain, false);
  }

  const currentStep = input.template.steps[record.stepIndex];
  if (currentStep === undefined) {
    return { ok: false, error: 'EXISTING_RECORD_MALFORMED' };
  }
  if (observation === 'NO_EFFECT_CONFIRMED') {
    const retry = recordWith(
      record,
      {
        state: 'ACTIVE',
        nextEligibleAt: addMilliseconds(input.evaluatedAt, currentStep.cadenceMs),
        lastDispatchObservation: observation,
        updatedAt: input.evaluatedAt,
      },
      false,
    );
    if (retry.attemptsForStep >= currentStep.maxAttempts) {
      return plan('ESCALATE', 'RETRY_BUDGET_EXHAUSTED', retry, false);
    }
    return retry;
  }

  const nextIndex = record.stepIndex + 1;
  if (nextIndex >= input.template.steps.length) {
    const completed = recordWith(
      record,
      {
        state: 'COMPLETED',
        stepIndex: input.template.steps.length,
        attemptsForStep: 0,
        nextEligibleAt: input.evaluatedAt,
        lastDispatchObservation: observation,
        updatedAt: input.evaluatedAt,
      },
      false,
    );
    return plan('TERMINAL', 'FLOW_COMPLETED', completed, false);
  }

  const nextStep = input.template.steps[nextIndex];
  if (nextStep === undefined) {
    return { ok: false, error: 'EXISTING_RECORD_MALFORMED' };
  }
  return recordWith(
    record,
    {
      state: 'ACTIVE',
      stepIndex: nextIndex,
      attemptsForStep: 0,
      nextEligibleAt: addMilliseconds(input.evaluatedAt, nextStep.cadenceMs),
      lastDispatchObservation: observation,
      updatedAt: input.evaluatedAt,
    },
    false,
  );
}

export function planRevenueFlow(input: PlanRevenueFlowInput): PlanRevenueFlowResult {
  if (
    !isNonEmptyString(input?.tenantId) ||
    !isNonEmptyString(input?.flowId) ||
    !isTimestamp(input?.evaluatedAt) ||
    correlationId(input?.correlation) === null ||
    input?.crm === undefined ||
    input?.contactPolicy === undefined ||
    input?.template === undefined
  ) {
    return { ok: false, error: 'REQUEST_MALFORMED' };
  }

  if (!dispatchObservationValid(input.dispatchObservation)) {
    return { ok: false, error: 'DISPATCH_OBSERVATION_INVALID' };
  }
  if (!cancellationReasonValid(input.cancellationReason)) {
    return { ok: false, error: 'REQUEST_MALFORMED' };
  }
  if (!isCrmModelValid(input.crm.model)) return { ok: false, error: 'CRM_RECORD_MALFORMED' };
  if (!crmCurrentnessValid(input.crm)) return { ok: false, error: 'CRM_CURRENTNESS_CONFLICT' };
  const templateIssue = templateError(input.template);
  if (templateIssue !== null) return { ok: false, error: templateIssue };
  if (!contactPolicyValid(input.contactPolicy)) return { ok: false, error: 'REQUEST_MALFORMED' };

  if (
    input.crm.model.tenantId !== input.tenantId ||
    input.template.tenantId !== input.tenantId ||
    input.contactPolicy.tenantId !== input.tenantId
  ) {
    return { ok: false, error: 'TENANT_MISMATCH' };
  }
  if (input.qualification !== undefined) {
    if (!qualificationValid(input.qualification)) {
      return { ok: false, error: 'QUALIFICATION_MALFORMED' };
    }
    const boundary = qualificationBoundaryError(input, input.qualification);
    if (boundary !== null) return { ok: false, error: boundary };
  }

  if (
    Date.parse(input.crm.model.observedAt) > Date.parse(input.evaluatedAt) ||
    Date.parse(input.crm.model.projectedAt) > Date.parse(input.evaluatedAt) ||
    Date.parse(input.contactPolicy.evaluatedAt) > Date.parse(input.evaluatedAt)
  ) {
    return { ok: false, error: 'OUT_OF_ORDER_EVALUATION' };
  }

  if (input.existing !== undefined) {
    const issue = existingRecordError(input, input.existing);
    if (issue !== null) return { ok: false, error: issue };
  }

  let record: RevenueFlowRecord;
  if (input.existing !== undefined) {
    record = input.existing;
  } else {
    const createdRecord = baseRecord(input);
    if (createdRecord === null) return { ok: false, error: 'TEMPLATE_MALFORMED' };
    record = createdRecord;
  }
  if (record.state === 'COMPLETED') return plan('TERMINAL', 'FLOW_COMPLETED', record, false);
  if (record.state === 'CANCELLED') return plan('TERMINAL', 'FLOW_CANCELLED', record, false);

  const cancellation = input.cancellationReason ?? 'NONE';
  if (cancellation !== 'NONE') {
    record = recordWith(
      record,
      {
        state: 'CANCELLED',
        cancellationReason: cancellation,
        lastDispatchObservation: input.dispatchObservation ?? 'NONE',
        updatedAt: input.evaluatedAt,
      },
      false,
    );
    return plan('TERMINAL', 'FLOW_CANCELLED', record, true);
  }

  if (!input.crm.current) return plan('ABSTAIN', 'CRM_NOT_CURRENT', record, true);
  if (input.template.status !== 'READY') return plan('ABSTAIN', 'TEMPLATE_NOT_READY', record, true);

  const applicability = flowApplicabilityReason(input);
  if (applicability !== null) {
    const disposition = applicability === 'QUALIFICATION_REVIEW_REQUIRED' ? 'ESCALATE' : 'ABSTAIN';
    return plan(disposition, applicability, record, true);
  }

  const observation = input.dispatchObservation ?? 'NONE';
  if (observation === 'NONE' && record.lastTaskDedupeKey !== undefined) {
    const pendingStep = input.template.steps[record.stepIndex];
    if (pendingStep === undefined) {
      return { ok: false, error: 'EXISTING_RECORD_MALFORMED' };
    }
    const pendingPolicyBlock = policyBlockReason(input.contactPolicy, pendingStep);
    if (pendingPolicyBlock !== null) return pauseForPolicy(input, record, pendingPolicyBlock);
  }

  const observationResult = applyObservation(input, record, observation);
  if ('ok' in observationResult) return observationResult;
  record = observationResult;

  const step = input.template.steps[record.stepIndex];
  if (step === undefined) return { ok: false, error: 'EXISTING_RECORD_MALFORMED' };
  const policyBlock = policyBlockReason(input.contactPolicy, step);
  if (policyBlock !== null) return pauseForPolicy(input, record, policyBlock);

  if (record.attemptsForStep >= step.maxAttempts) {
    return plan('ESCALATE', 'RETRY_BUDGET_EXHAUSTED', record, false);
  }
  if (Date.parse(record.nextEligibleAt) > Date.parse(input.evaluatedAt)) {
    return plan('WAIT', 'NOT_YET_DUE', record, false);
  }

  const attempt = record.attemptsForStep + 1;
  const taskKey = dedupeKey(input, step, attempt);
  const task: RevenueDomainTask = {
    kind: 'REVENUE_DOMAIN_TASK',
    schemaVersion: '1.0.0',
    tenantId: input.tenantId,
    flowId: input.flowId,
    flowKind: input.template.flowKind,
    entity: input.crm.model.entity,
    entityVersion: input.crm.model.entityVersion,
    stepId: step.stepId,
    stepIndex: record.stepIndex,
    attempt,
    taskKind: step.taskKind,
    contactPurpose: step.contactPurpose,
    templateReference: input.template.templateReference,
    templateVersion: input.template.templateVersion,
    dedupeKey: taskKey,
    plannedAt: input.evaluatedAt,
    externalActionPlanned: step.externalAction,
    requiresGovernedExecution: step.externalAction,
    executionBoundary: step.externalAction
      ? 'W07_W08_CURRENT_VALIDATION_REQUIRED'
      : 'INTERNAL_DOMAIN_PREPARATION',
    createsActionIntent: false,
    authorizesExecution: false,
    canGrantPermission: false,
  };
  record = recordWith(
    record,
    {
      state: 'ACTIVE',
      attemptsForStep: attempt,
      lastTaskDedupeKey: taskKey,
      lastDispatchObservation: 'NONE',
      updatedAt: input.evaluatedAt,
    },
    true,
  );
  return plan('TASK_READY', 'TASK_CREATED', record, false, task);
}
