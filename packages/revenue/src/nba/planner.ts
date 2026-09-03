import type {
  NbaCapabilityPlanProjection,
  NbaContextProjection,
  NbaIntelligenceRouteProjection,
  NbaVerifiedFact,
  NextBestActionCandidate,
  NextBestActionEvidence,
  NextBestActionPlan,
  NextBestActionPlanningInput,
  NextBestActionPlanningResult,
  NextBestActionReason,
  NextBestActionRule,
} from './types.js';

const MAX_IDENTIFIER_LENGTH = 1_024;
const MAX_RATIONALE_LENGTH = 4_096;
const MAX_FACTS = 128;
const MAX_RULES = 64;
const MAX_CANDIDATES = 32;
const MAX_RULE_REFERENCES = 32;

function isNonEmptyString(value: unknown, maxLength = MAX_IDENTIFIER_LENGTH): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isTimestamp(value: unknown): value is string {
  return isNonEmptyString(value, 128) && Number.isFinite(Date.parse(value));
}

function isBps(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 10_000;
}

function isPositiveInteger(value: unknown, maximum: number): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= maximum;
}

function hasUniqueStrings(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function isStringArray(
  value: unknown,
  maximum: number,
  allowEmpty = true,
): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length <= maximum &&
    (allowEmpty || value.length > 0) &&
    value.every((item) => isNonEmptyString(item)) &&
    hasUniqueStrings(value)
  );
}

function sameEntity(
  left: Readonly<{ kind: string; entityId: string }>,
  right: Readonly<{ kind: string; entityId: string }>,
): boolean {
  return left.kind === right.kind && left.entityId === right.entityId;
}

function factIsValid(fact: NbaVerifiedFact): boolean {
  return (
    isNonEmptyString(fact?.tenantId) &&
    isNonEmptyString(fact?.key, 256) &&
    (fact.status === 'VERIFIED_CURRENT' ||
      fact.status === 'STALE' ||
      fact.status === 'CONFLICTED' ||
      fact.status === 'UNKNOWN') &&
    isNonEmptyString(fact.sourceSystem) &&
    isNonEmptyString(fact.sourceRevision) &&
    isTimestamp(fact.observedAt) &&
    (fact.sourceReference === undefined || isNonEmptyString(fact.sourceReference))
  );
}

function ruleIsValid(rule: NextBestActionRule): boolean {
  const entityKinds = ['LEAD', 'CUSTOMER', 'CONVERSATION'];
  const qualificationStages = ['QUALIFIED', 'NURTURE', 'UNQUALIFIED', 'INCOMPLETE'];
  const lifecycleStates = [
    'NEW',
    'ENGAGED',
    'QUALIFIED',
    'CONVERTED',
    'ACTIVE',
    'INACTIVE',
    'OPEN',
    'PENDING',
    'CLOSED',
    'MERGED',
  ];
  const actionTypes = [
    'REQUEST_INFORMATION',
    'PREPARE_NURTURE_TOUCH',
    'PREPARE_SALES_HANDOFF',
    'PREPARE_CUSTOMER_SUCCESS_CHECK_IN',
    'PREPARE_CONVERSATION_FOLLOW_UP',
    'NO_ACTION',
  ];
  return (
    isNonEmptyString(rule?.ruleId) &&
    actionTypes.includes(rule.actionType) &&
    Array.isArray(rule.entityKinds) &&
    rule.entityKinds.length > 0 &&
    rule.entityKinds.length <= 3 &&
    rule.entityKinds.every((item) => entityKinds.includes(item)) &&
    hasUniqueStrings(rule.entityKinds) &&
    Array.isArray(rule.lifecycleStates) &&
    rule.lifecycleStates.length > 0 &&
    rule.lifecycleStates.length <= lifecycleStates.length &&
    rule.lifecycleStates.every((item) => lifecycleStates.includes(item)) &&
    hasUniqueStrings(rule.lifecycleStates) &&
    Array.isArray(rule.qualificationStages) &&
    rule.qualificationStages.length > 0 &&
    rule.qualificationStages.length <= qualificationStages.length &&
    rule.qualificationStages.every((item) => qualificationStages.includes(item)) &&
    hasUniqueStrings(rule.qualificationStages) &&
    isStringArray(rule.requiredFactKeys, MAX_RULE_REFERENCES) &&
    isBps(rule.priorityBps) &&
    (rule.impact === 'INTERNAL_PREPARATION' || rule.impact === 'EXTERNAL_SIDE_EFFECT') &&
    isNonEmptyString(rule.rationale, MAX_RATIONALE_LENGTH) &&
    isStringArray(rule.provenanceReferences, MAX_RULE_REFERENCES, false)
  );
}

function crmIsValid(input: NextBestActionPlanningInput): boolean {
  const { crm } = input;
  return (
    crm !== undefined &&
    typeof crm.current === 'boolean' &&
    Array.isArray(crm.currentnessReasons) &&
    isNonEmptyString(crm.model?.tenantId) &&
    isNonEmptyString(crm.model?.entity?.entityId) &&
    (crm.model.entity.kind === 'LEAD' ||
      crm.model.entity.kind === 'CUSTOMER' ||
      crm.model.entity.kind === 'CONVERSATION') &&
    Number.isSafeInteger(crm.model.entityVersion) &&
    crm.model.entityVersion >= 1 &&
    isNonEmptyString(crm.model.sourceRevision) &&
    isTimestamp(crm.model.observedAt) &&
    isTimestamp(crm.model.projectedAt) &&
    crm.model.authorizesExecution === false &&
    crm.model.canGrantPermission === false
  );
}

function qualificationIsValid(input: NextBestActionPlanningInput): boolean {
  const { qualification } = input;
  return (
    qualification?.kind === 'REVENUE_QUALIFICATION_EVALUATION' &&
    qualification.schemaVersion === '1.0.0' &&
    isNonEmptyString(qualification.tenantId) &&
    isNonEmptyString(qualification.entity?.entityId) &&
    Number.isSafeInteger(qualification.entityVersion) &&
    qualification.entityVersion >= 1 &&
    isNonEmptyString(qualification.ruleSetVersion) &&
    isTimestamp(qualification.evaluatedAt) &&
    (qualification.scoreBps === null || isBps(qualification.scoreBps)) &&
    isBps(qualification.coverageBps) &&
    Array.isArray(qualification.missingCriticalFeatures) &&
    qualification.authorizesExecution === false &&
    qualification.canGrantPermission === false
  );
}

function capabilityPlanIsValid(plan: NbaCapabilityPlanProjection): boolean {
  return (
    plan?.source === 'W04_CAPABILITY_PLAN' &&
    isNonEmptyString(plan.tenantId) &&
    isNonEmptyString(plan.correlationId) &&
    isNonEmptyString(plan.planReference) &&
    isNonEmptyString(plan.registryVersion) &&
    (plan.status === 'READY' || plan.status === 'BLOCKED') &&
    isNonEmptyString(plan.capabilityId) &&
    isNonEmptyString(plan.budget?.budgetReference) &&
    (plan.budget.state === 'WITHIN_BUDGET' ||
      plan.budget.state === 'DEGRADED' ||
      plan.budget.state === 'EXHAUSTED') &&
    (plan.budget.action === 'CONTINUE_OPTIONAL' ||
      plan.budget.action === 'DEGRADE_OPTIONAL' ||
      plan.budget.action === 'STOP_OPTIONAL' ||
      plan.budget.action === 'HOLD') &&
    plan.budget.canSkipMandatoryValidation === false &&
    plan.budget.authorizesExecution === false &&
    plan.authorizesExecution === false &&
    plan.canGrantPermission === false
  );
}

function routeIsValid(route: NbaIntelligenceRouteProjection): boolean {
  return (
    route?.source === 'W05_INTELLIGENCE_ROUTE' &&
    isNonEmptyString(route.tenantId) &&
    isNonEmptyString(route.correlationId) &&
    isNonEmptyString(route.routeReference) &&
    isNonEmptyString(route.routeVersion) &&
    (route.status === 'SELECTED' || route.status === 'ABSTAINED') &&
    (route.family === undefined ||
      route.family === 'DETERMINISTIC' ||
      route.family === 'MODEL' ||
      route.family === 'SPECIALIST' ||
      route.family === 'HUMAN') &&
    isNonEmptyString(route.confidence?.evaluationReference) &&
    (route.confidence.scoreBps === null || isBps(route.confidence.scoreBps)) &&
    (route.confidence.disposition === 'PROCEED_WITH_EVIDENCE' ||
      route.confidence.disposition === 'VERIFY' ||
      route.confidence.disposition === 'ESCALATE' ||
      route.confidence.disposition === 'ABSTAIN') &&
    isNonEmptyString(route.confidence.calibrationInterfaceVersion) &&
    route.confidence.authorizesExecution === false &&
    route.confidence.canGrantPermission === false &&
    route.authorizesExecution === false &&
    route.canGrantPermission === false
  );
}

function contextIsValid(context: NbaContextProjection): boolean {
  return (
    context?.source === 'W06_MINIMAL_CONTEXT_PACKAGE' &&
    isNonEmptyString(context.tenantId) &&
    isNonEmptyString(context.correlationId) &&
    isNonEmptyString(context.packageReference) &&
    isNonEmptyString(context.packageVersion) &&
    isTimestamp(context.compiledAt) &&
    typeof context.current === 'boolean' &&
    isStringArray(context.conflictingSourceReferences, MAX_RULE_REFERENCES) &&
    context.authorizesExecution === false &&
    context.canGrantPermission === false
  );
}

function baseRequestIsValid(input: NextBestActionPlanningInput): boolean {
  return (
    isNonEmptyString(input?.tenantId) &&
    isNonEmptyString(input?.correlation?.correlationId) &&
    isTimestamp(input?.evaluatedAt) &&
    isNonEmptyString(input?.ruleSetVersion) &&
    (input?.reasoningMode === 'DETERMINISTIC' || input?.reasoningMode === 'ROUTED') &&
    Array.isArray(input?.facts) &&
    input.facts.length <= MAX_FACTS &&
    Array.isArray(input?.rules) &&
    input.rules.length > 0 &&
    input.rules.length <= MAX_RULES &&
    isPositiveInteger(input?.maxCandidates, MAX_CANDIDATES)
  );
}

function buildEvidence(input: NextBestActionPlanningInput): NextBestActionEvidence {
  return {
    crmSourceRevision: input.crm.model.sourceRevision,
    crmEntityVersion: input.crm.model.entityVersion,
    qualificationRuleSetVersion: input.qualification.ruleSetVersion,
    qualificationStage: input.qualification.stage,
    qualificationScoreBps: input.qualification.scoreBps,
    qualificationReviewDisposition: input.qualification.reviewDisposition,
    capabilityPlanReference: input.capabilityPlan.planReference,
    capabilityRegistryVersion: input.capabilityPlan.registryVersion,
    budgetReference: input.capabilityPlan.budget.budgetReference,
    budgetState: input.capabilityPlan.budget.state,
    budgetAction: input.capabilityPlan.budget.action,
    contextPackageReference: input.context.packageReference,
    contextPackageVersion: input.context.packageVersion,
    ...(input.route === undefined
      ? {}
      : {
          routeReference: input.route.routeReference,
          routeVersion: input.route.routeVersion,
          confidenceEvaluationReference: input.route.confidence.evaluationReference,
          confidenceScoreBps: input.route.confidence.scoreBps,
          confidenceDisposition: input.route.confidence.disposition,
        }),
  };
}

function plan(
  input: NextBestActionPlanningInput,
  disposition: NextBestActionPlan['disposition'],
  reason: NextBestActionReason,
  candidates: readonly NextBestActionCandidate[] = [],
): NextBestActionPlanningResult {
  return {
    ok: true,
    plan: {
      kind: 'REVENUE_NEXT_BEST_ACTION_PLAN',
      schemaVersion: '1.0.0',
      tenantId: input.tenantId,
      correlation: {
        correlationId: input.correlation.correlationId,
        ...(input.correlation.causation === undefined
          ? {}
          : { causation: { causationId: input.correlation.causation.causationId } }),
      },
      entity: {
        kind: input.qualification.entity.kind,
        entityId: input.qualification.entity.entityId,
      },
      entityVersion: input.qualification.entityVersion,
      evaluatedAt: input.evaluatedAt,
      ruleSetVersion: input.ruleSetVersion,
      disposition,
      reason,
      candidates,
      evidence: buildEvidence(input),
      authoritySemantics: 'DOMAIN_CANDIDATE_ONLY_NO_ACTION_INTENT',
      downstreamExecutionStillRequiresCurrentValidation: true,
      authorizesExecution: false,
      canGrantPermission: false,
    },
  };
}

function applicable(rule: NextBestActionRule, input: NextBestActionPlanningInput): boolean {
  return (
    rule.entityKinds.includes(input.crm.model.entity.kind) &&
    rule.lifecycleStates.includes(input.crm.model.lifecycleState) &&
    rule.qualificationStages.includes(input.qualification.stage)
  );
}

function factsAreCurrent(rule: NextBestActionRule, facts: Map<string, NbaVerifiedFact>): boolean {
  return rule.requiredFactKeys.every((key) => facts.get(key)?.status === 'VERIFIED_CURRENT');
}

function candidate(rule: NextBestActionRule): NextBestActionCandidate {
  return {
    candidateId: `nba:${rule.ruleId}`,
    actionType: rule.actionType,
    rankBps: rule.priorityBps,
    impact: rule.impact,
    rationale: rule.rationale,
    requiredFactKeys: [...rule.requiredFactKeys].sort(),
    provenanceReferences: [...rule.provenanceReferences].sort(),
    requiresGovernedExecution: rule.impact === 'EXTERNAL_SIDE_EFFECT',
    createsActionIntent: false,
    authorizesExecution: false,
    canGrantPermission: false,
  };
}

export function planNextBestActions(
  input: NextBestActionPlanningInput,
): NextBestActionPlanningResult {
  if (!baseRequestIsValid(input)) return { ok: false, error: 'REQUEST_MALFORMED' };
  if (!crmIsValid(input)) return { ok: false, error: 'CRM_MALFORMED' };
  if (!qualificationIsValid(input)) return { ok: false, error: 'QUALIFICATION_MALFORMED' };
  if (!capabilityPlanIsValid(input.capabilityPlan)) {
    return { ok: false, error: 'CONTROL_PROJECTION_MALFORMED' };
  }
  if (input.route !== undefined && !routeIsValid(input.route)) {
    return { ok: false, error: 'ROUTE_PROJECTION_MALFORMED' };
  }
  if (!contextIsValid(input.context)) {
    return { ok: false, error: 'CONTEXT_PROJECTION_MALFORMED' };
  }

  if (
    input.crm.model.tenantId !== input.tenantId ||
    input.qualification.tenantId !== input.tenantId ||
    input.capabilityPlan.tenantId !== input.tenantId ||
    input.context.tenantId !== input.tenantId ||
    (input.route !== undefined && input.route.tenantId !== input.tenantId)
  ) {
    return { ok: false, error: 'TENANT_MISMATCH' };
  }
  if (
    input.capabilityPlan.correlationId !== input.correlation.correlationId ||
    input.context.correlationId !== input.correlation.correlationId ||
    (input.route !== undefined && input.route.correlationId !== input.correlation.correlationId)
  ) {
    return { ok: false, error: 'CORRELATION_MISMATCH' };
  }
  if (!sameEntity(input.crm.model.entity, input.qualification.entity)) {
    return { ok: false, error: 'ENTITY_MISMATCH' };
  }
  if (input.crm.model.entityVersion !== input.qualification.entityVersion) {
    return { ok: false, error: 'ENTITY_VERSION_CONFLICT' };
  }

  const facts = new Map<string, NbaVerifiedFact>();
  for (const fact of input.facts) {
    if (!factIsValid(fact)) return { ok: false, error: 'REQUEST_MALFORMED' };
    if (fact.tenantId !== input.tenantId) return { ok: false, error: 'TENANT_MISMATCH' };
    if (Date.parse(fact.observedAt) > Date.parse(input.evaluatedAt)) {
      return { ok: false, error: 'FACT_FUTURE_OBSERVATION' };
    }
    if (facts.has(fact.key)) return { ok: false, error: 'FACT_DUPLICATE' };
    facts.set(fact.key, fact);
  }

  const ruleIds = new Set<string>();
  for (const rule of input.rules) {
    if (!ruleIsValid(rule)) return { ok: false, error: 'REQUEST_MALFORMED' };
    if (ruleIds.has(rule.ruleId)) return { ok: false, error: 'RULE_DUPLICATE' };
    ruleIds.add(rule.ruleId);
  }

  if (!input.crm.current || input.crm.currentnessReasons.length > 0) {
    return plan(input, 'ABSTAIN', 'CRM_NOT_CURRENT');
  }
  if (input.qualification.stage === 'INCOMPLETE' || input.qualification.scoreBps === null) {
    return plan(input, 'ABSTAIN', 'QUALIFICATION_INCOMPLETE');
  }
  if (input.qualification.reviewDisposition !== 'NONE') {
    return plan(input, 'ESCALATE', 'QUALIFICATION_REVIEW_REQUIRED');
  }
  if (input.capabilityPlan.status === 'BLOCKED') {
    return plan(input, 'ABSTAIN', 'CAPABILITY_PLAN_BLOCKED');
  }
  if (
    input.capabilityPlan.budget.state === 'EXHAUSTED' ||
    input.capabilityPlan.budget.action === 'STOP_OPTIONAL' ||
    input.capabilityPlan.budget.action === 'HOLD'
  ) {
    return plan(input, 'ABSTAIN', 'BUDGET_RESTRICTED');
  }
  if (!input.context.current) return plan(input, 'ABSTAIN', 'CONTEXT_NOT_CURRENT');
  if (input.context.conflictingSourceReferences.length > 0) {
    return plan(input, 'ESCALATE', 'CONTEXT_CONFLICT');
  }
  if (input.reasoningMode === 'ROUTED' && input.route === undefined) {
    return plan(input, 'ABSTAIN', 'ROUTE_REQUIRED');
  }
  if (input.route?.status === 'ABSTAINED' || input.route?.confidence.disposition === 'ABSTAIN') {
    return plan(input, 'ABSTAIN', 'ROUTE_ABSTAINED');
  }
  if (
    input.route?.confidence.disposition === 'VERIFY' ||
    input.route?.confidence.disposition === 'ESCALATE'
  ) {
    return plan(input, 'ESCALATE', 'ROUTE_CONFIDENCE_REQUIRES_REVIEW');
  }

  const applicableRules = input.rules.filter((rule) => applicable(rule, input));
  if (applicableRules.length === 0) return plan(input, 'ABSTAIN', 'NO_APPLICABLE_RULE');

  const ranked = applicableRules
    .filter((rule) => factsAreCurrent(rule, facts))
    .map(candidate)
    .sort(
      (left, right) =>
        right.rankBps - left.rankBps || left.candidateId.localeCompare(right.candidateId),
    )
    .slice(0, input.maxCandidates);
  if (ranked.length === 0) return plan(input, 'ABSTAIN', 'REQUIRED_FACT_UNAVAILABLE');
  if (ranked[0]?.impact === 'EXTERNAL_SIDE_EFFECT') {
    return plan(input, 'ESCALATE', 'EXTERNAL_SIDE_EFFECT_REQUIRES_GOVERNED_FLOW', ranked);
  }
  return plan(input, 'SELECTED', 'CANDIDATES_RANKED', ranked);
}
