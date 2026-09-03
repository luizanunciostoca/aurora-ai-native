import type { CorrelationId, TenantId } from '@aurora/contracts';

import type { MetaAdsCapabilityPlan } from './contracts.js';

export type W12PlanningReasoningLevel = 'L0' | 'L2' | 'L4' | 'L5';
export type W12PlanningUncertainty = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
export type W12ConstraintDisposition = 'ALLOW' | 'REVIEW' | 'DENY';

export interface W12VerifiedPlanningFact {
  readonly factId: string;
  readonly tenantId: TenantId;
  readonly key: string;
  readonly value: string;
  readonly confidence: number;
  readonly sourceReference: string;
  readonly sourceRevision: string;
  readonly expectedSourceRevision: string;
  readonly provenanceReference: string;
  readonly observedAt: string;
  readonly expiresAt: string;
  readonly authorizesExecution: false;
}

export interface W12CreativeAudienceTemplate {
  readonly templateId: string;
  readonly tenantId: TenantId;
  readonly active: boolean;
  readonly creativePattern: string;
  readonly allowedAudienceTerms: readonly string[];
  readonly sourceReference: string;
  readonly sourceRevision: string;
  readonly expectedSourceRevision: string;
  readonly provenanceReference: string;
  readonly authorizesExecution: false;
}

export interface W12CreativeAudienceCandidate {
  readonly creativeText: string;
  readonly audienceTerms: readonly string[];
  readonly estimatedAudienceSize?: number;
  readonly estimatedBudgetMinor?: number;
  readonly currency?: string;
}

export interface W12CreativeAudienceConstraints {
  readonly content: W12ConstraintDisposition;
  readonly targeting: W12ConstraintDisposition;
  readonly prohibitedAudienceTerms: readonly string[];
  readonly maximumEstimatedAudienceSize?: number;
  readonly policyReference: string;
  readonly authorizesExecution: false;
}

export interface W12CreativeAudiencePlanningInput {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly planningId: string;
  readonly evaluatedAt: string;
  readonly minimumFactConfidence: number;
  readonly uncertainty: W12PlanningUncertainty;
  readonly domainPlan: MetaAdsCapabilityPlan;
  readonly facts: readonly W12VerifiedPlanningFact[];
  readonly constraints: W12CreativeAudienceConstraints;
  readonly candidate: W12CreativeAudienceCandidate;
  readonly template?: W12CreativeAudienceTemplate;
}

export interface W12AdvisoryBudgetEstimate {
  readonly estimatedMinor: number;
  readonly currency: string;
  readonly advisoryOnly: true;
  readonly canIncreaseFinancialAuthority: false;
}

export interface W12CreativeAudiencePlan {
  readonly kind: 'W12CreativeAudiencePlan';
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly planningId: string;
  readonly reasoningLevel: W12PlanningReasoningLevel;
  readonly creativeText: string;
  readonly audienceTerms: readonly string[];
  readonly evidenceReferences: readonly string[];
  readonly factIds: readonly string[];
  readonly confidenceFloor: number;
  readonly deterministicTemplateId?: string;
  readonly budgetEstimate?: W12AdvisoryBudgetEstimate;
  readonly domainIntentId: string;
  readonly domainRiskClass: MetaAdsCapabilityPlan['riskClass'];
  readonly requiresCurrentApproval: boolean;
  readonly requiresW07Execution: boolean;
  readonly authorizesExecution: false;
  readonly canGrantSpendAuthority: false;
}

export type W12CreativeAudiencePlanCode =
  | 'INVALID_INPUT'
  | 'DOMAIN_PLAN_MISMATCH'
  | 'NO_VERIFIED_FACTS'
  | 'FACT_STALE_OR_INVALID'
  | 'FACT_CONFLICT'
  | 'CONTENT_DENIED'
  | 'TARGETING_DENIED'
  | 'PROHIBITED_TARGETING_TERM'
  | 'AUDIENCE_BOUND_EXCEEDED'
  | 'TEMPLATE_INVALID'
  | 'POLICY_REVIEW_REQUIRED'
  | 'HIGH_UNCERTAINTY';

export type W12CreativeAudiencePlanResult =
  | Readonly<{ status: 'READY'; plan: W12CreativeAudiencePlan }>
  | Readonly<{
      status: 'ESCALATE';
      code: W12CreativeAudiencePlanCode;
      reasoningLevel: 'L4' | 'L5';
      authorizesExecution: false;
    }>
  | Readonly<{ status: 'BLOCKED'; code: W12CreativeAudiencePlanCode }>;

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function timestamp(value: string): number | undefined {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeTerm(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

function hasDuplicates(values: readonly string[]): boolean {
  const normalized = values.map(normalizeTerm);
  return new Set(normalized).size !== normalized.length;
}

function validConfidence(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function factsConflict(facts: readonly W12VerifiedPlanningFact[]): boolean {
  const valuesByKey = new Map<string, string>();
  for (const fact of facts) {
    const existing = valuesByKey.get(fact.key);
    if (existing !== undefined && existing !== fact.value) return true;
    valuesByKey.set(fact.key, fact.value);
  }
  return false;
}

function templateUsable(
  template: W12CreativeAudienceTemplate,
  input: W12CreativeAudiencePlanningInput,
): boolean {
  if (
    template.tenantId !== input.tenantId ||
    !template.active ||
    !nonEmpty(template.templateId) ||
    !nonEmpty(template.creativePattern) ||
    !nonEmpty(template.sourceReference) ||
    !nonEmpty(template.provenanceReference) ||
    template.sourceRevision !== template.expectedSourceRevision ||
    hasDuplicates(template.allowedAudienceTerms) ||
    template.authorizesExecution !== false
  ) {
    return false;
  }

  const allowed = new Set(template.allowedAudienceTerms.map(normalizeTerm));
  return input.candidate.audienceTerms.every((term) => allowed.has(normalizeTerm(term)));
}

function chooseReasoningLevel(
  uncertainty: W12PlanningUncertainty,
  hasTemplate: boolean,
): W12PlanningReasoningLevel {
  if (hasTemplate && (uncertainty === 'NONE' || uncertainty === 'LOW')) return 'L0';
  if (uncertainty === 'NONE' || uncertainty === 'LOW' || uncertainty === 'MEDIUM') return 'L2';
  return uncertainty === 'HIGH' ? 'L4' : 'L5';
}

function validateBudgetEstimate(
  candidate: W12CreativeAudienceCandidate,
): W12AdvisoryBudgetEstimate | undefined {
  if (candidate.estimatedBudgetMinor === undefined && candidate.currency === undefined) return undefined;
  if (
    candidate.estimatedBudgetMinor === undefined ||
    candidate.currency === undefined ||
    !Number.isSafeInteger(candidate.estimatedBudgetMinor) ||
    candidate.estimatedBudgetMinor < 0 ||
    !/^[A-Z]{3}$/.test(candidate.currency)
  ) {
    return undefined;
  }

  return {
    estimatedMinor: candidate.estimatedBudgetMinor,
    currency: candidate.currency,
    advisoryOnly: true,
    canIncreaseFinancialAuthority: false,
  };
}

/**
 * Builds a W12-C planning projection from current evidence and constraints.
 * Confidence, templates and budget estimates remain decision support only.
 */
export function planCreativeAndAudience(
  input: W12CreativeAudiencePlanningInput,
): W12CreativeAudiencePlanResult {
  const evaluatedAt = timestamp(input.evaluatedAt);
  if (
    evaluatedAt === undefined ||
    !nonEmpty(input.planningId) ||
    !validConfidence(input.minimumFactConfidence) ||
    !nonEmpty(input.candidate.creativeText) ||
    input.candidate.audienceTerms.length === 0 ||
    input.candidate.audienceTerms.some((term) => !nonEmpty(term)) ||
    hasDuplicates(input.candidate.audienceTerms) ||
    !nonEmpty(input.constraints.policyReference) ||
    input.constraints.prohibitedAudienceTerms.some((term) => !nonEmpty(term)) ||
    hasDuplicates(input.constraints.prohibitedAudienceTerms)
  ) {
    return { status: 'BLOCKED', code: 'INVALID_INPUT' };
  }

  if (
    input.domainPlan.tenantId !== input.tenantId ||
    input.domainPlan.correlationId !== input.correlationId ||
    input.domainPlan.authorizesExecution !== false ||
    input.domainPlan.canGrantPermission !== false
  ) {
    return { status: 'BLOCKED', code: 'DOMAIN_PLAN_MISMATCH' };
  }

  if (input.constraints.content === 'DENY') return { status: 'BLOCKED', code: 'CONTENT_DENIED' };
  if (input.constraints.targeting === 'DENY') {
    return { status: 'BLOCKED', code: 'TARGETING_DENIED' };
  }

  const prohibited = new Set(input.constraints.prohibitedAudienceTerms.map(normalizeTerm));
  if (input.candidate.audienceTerms.some((term) => prohibited.has(normalizeTerm(term)))) {
    return { status: 'BLOCKED', code: 'PROHIBITED_TARGETING_TERM' };
  }

  if (
    input.constraints.maximumEstimatedAudienceSize !== undefined &&
    (!Number.isSafeInteger(input.constraints.maximumEstimatedAudienceSize) ||
      input.constraints.maximumEstimatedAudienceSize < 0 ||
      input.candidate.estimatedAudienceSize === undefined ||
      !Number.isSafeInteger(input.candidate.estimatedAudienceSize) ||
      input.candidate.estimatedAudienceSize < 0 ||
      input.candidate.estimatedAudienceSize > input.constraints.maximumEstimatedAudienceSize)
  ) {
    return { status: 'BLOCKED', code: 'AUDIENCE_BOUND_EXCEEDED' };
  }

  if (input.facts.length === 0) return { status: 'BLOCKED', code: 'NO_VERIFIED_FACTS' };
  if (input.facts.some((fact) => fact.tenantId !== input.tenantId)) {
    return { status: 'BLOCKED', code: 'DOMAIN_PLAN_MISMATCH' };
  }

  const factsCurrent = input.facts.every((fact) => {
    const observedAt = timestamp(fact.observedAt);
    const expiresAt = timestamp(fact.expiresAt);
    return (
      observedAt !== undefined &&
      expiresAt !== undefined &&
      observedAt <= evaluatedAt &&
      expiresAt > evaluatedAt &&
      validConfidence(fact.confidence) &&
      fact.confidence >= input.minimumFactConfidence &&
      fact.sourceRevision === fact.expectedSourceRevision &&
      nonEmpty(fact.sourceReference) &&
      nonEmpty(fact.provenanceReference) &&
      fact.authorizesExecution === false
    );
  });
  if (!factsCurrent) {
    return {
      status: 'ESCALATE',
      code: 'FACT_STALE_OR_INVALID',
      reasoningLevel: 'L4',
      authorizesExecution: false,
    };
  }
  if (factsConflict(input.facts)) {
    return {
      status: 'ESCALATE',
      code: 'FACT_CONFLICT',
      reasoningLevel: 'L4',
      authorizesExecution: false,
    };
  }

  if (input.constraints.content === 'REVIEW' || input.constraints.targeting === 'REVIEW') {
    return {
      status: 'ESCALATE',
      code: 'POLICY_REVIEW_REQUIRED',
      reasoningLevel: 'L4',
      authorizesExecution: false,
    };
  }
  if (input.uncertainty === 'HIGH' || input.uncertainty === 'UNKNOWN') {
    return {
      status: 'ESCALATE',
      code: 'HIGH_UNCERTAINTY',
      reasoningLevel: input.uncertainty === 'HIGH' ? 'L4' : 'L5',
      authorizesExecution: false,
    };
  }

  if (input.template !== undefined && !templateUsable(input.template, input)) {
    return { status: 'BLOCKED', code: 'TEMPLATE_INVALID' };
  }

  const budgetEstimate = validateBudgetEstimate(input.candidate);
  if (
    (input.candidate.estimatedBudgetMinor !== undefined || input.candidate.currency !== undefined) &&
    budgetEstimate === undefined
  ) {
    return { status: 'BLOCKED', code: 'INVALID_INPUT' };
  }

  const evidenceReferences = [
    input.constraints.policyReference,
    ...input.facts.flatMap((fact) => [fact.provenanceReference, fact.sourceReference]),
  ];
  if (input.template !== undefined) {
    evidenceReferences.push(input.template.provenanceReference, input.template.sourceReference);
  }

  const plan: W12CreativeAudiencePlan = {
    kind: 'W12CreativeAudiencePlan',
    tenantId: input.tenantId,
    correlationId: input.correlationId,
    planningId: input.planningId,
    reasoningLevel: chooseReasoningLevel(input.uncertainty, input.template !== undefined),
    creativeText:
      input.template === undefined
        ? input.candidate.creativeText
        : input.template.creativePattern.replaceAll('{{creative}}', input.candidate.creativeText),
    audienceTerms: [...input.candidate.audienceTerms],
    evidenceReferences: [...new Set(evidenceReferences)],
    factIds: [...new Set(input.facts.map((fact) => fact.factId))],
    confidenceFloor: Math.min(...input.facts.map((fact) => fact.confidence)),
    ...(input.template !== undefined ? { deterministicTemplateId: input.template.templateId } : {}),
    ...(budgetEstimate !== undefined ? { budgetEstimate } : {}),
    domainIntentId: input.domainPlan.intentId,
    domainRiskClass: input.domainPlan.riskClass,
    requiresCurrentApproval: input.domainPlan.requiresCurrentApproval,
    requiresW07Execution: input.domainPlan.requiresW07Execution,
    authorizesExecution: false,
    canGrantSpendAuthority: false,
  };

  return { status: 'READY', plan };
}
