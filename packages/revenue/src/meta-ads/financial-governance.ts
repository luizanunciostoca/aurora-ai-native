import type { TenantId } from '@aurora/contracts';

import type { MetaAdsCapabilityPlan, MetaAdsOperation } from './contracts.js';

export const META_ADS_FINANCIAL_OPERATIONS = [
  'ACTIVATE',
  'SET_BUDGET',
  'SET_BID',
  'WIDEN_TARGETING',
] as const satisfies readonly MetaAdsOperation[];
export type MetaAdsFinancialOperation = (typeof META_ADS_FINANCIAL_OPERATIONS)[number];

interface MetaAdsScopedEvidence {
  readonly tenantId: TenantId;
  readonly providerBindingReference: string;
  readonly adAccountExternalId: string;
}

export interface MetaAdsW08FinancialPrecheck extends MetaAdsScopedEvidence {
  readonly source: 'W08_PROVIDER_PRECHECK';
  readonly bindingState: 'ACTIVE' | 'INACTIVE' | 'REVOKED';
  readonly verificationState: 'VERIFIED' | 'UNVERIFIED' | 'STALE';
  readonly observedAtMs: number;
  readonly validUntilMs: number;
  readonly authorizesExecution: false;
}

export interface MetaAdsW02AuthorityProjection extends MetaAdsScopedEvidence {
  readonly source: 'W02_AUTHORITY_EVALUATION';
  readonly capabilityId: string;
  readonly operation: MetaAdsFinancialOperation;
  readonly authorized: boolean;
  readonly approvalReference?: string;
  readonly currency: string;
  readonly financialCeilingMinor: number;
  readonly observedAtMs: number;
  readonly validUntilMs: number;
  readonly authorizesExecution: false;
}

export interface MetaAdsW04BudgetProjection extends MetaAdsScopedEvidence {
  readonly source: 'W04_BUDGET_CONTROL';
  readonly currency: string;
  readonly remainingMinor: number;
  readonly maxOperationMinor: number;
  readonly observedAtMs: number;
  readonly validUntilMs: number;
  readonly authorizesExecution: false;
}

export interface MetaAdsW04MutationBounds extends MetaAdsScopedEvidence {
  readonly source: 'W04_MUTATION_BOUNDS';
  readonly operation: MetaAdsFinancialOperation;
  readonly windowReference: string;
  readonly committedMutations: number;
  readonly maxMutations: number;
  readonly observedAtMs: number;
  readonly validUntilMs: number;
  readonly authorizesExecution: false;
}

export interface MetaAdsOptimizationAdvisory {
  readonly source: 'W12_OPTIMIZATION_DECISION_SUPPORT';
  readonly confidenceBps: number;
  readonly expectedBenefitMinor: number;
  readonly latencyBudgetMs: number;
  readonly authorizesExecution: false;
}

export interface MetaAdsFinancialGovernanceInput {
  readonly nowMs: number;
  readonly plan: MetaAdsCapabilityPlan;
  readonly proposedFinancialExposureMinor: number;
  readonly precheck: MetaAdsW08FinancialPrecheck;
  readonly authority: MetaAdsW02AuthorityProjection;
  readonly budget: MetaAdsW04BudgetProjection;
  readonly mutationWindow: MetaAdsW04MutationBounds;
  readonly optimizationAdvisory?: MetaAdsOptimizationAdvisory;
}

export interface MetaAdsGovernedFinancialMutationPlan extends MetaAdsScopedEvidence {
  readonly planKind: 'W12_META_ADS_GOVERNED_FINANCIAL_MUTATION';
  readonly intentId: string;
  readonly capabilityId: string;
  readonly operation: MetaAdsFinancialOperation;
  readonly approvalReference: string;
  readonly currency: string;
  readonly proposedFinancialExposureMinor: number;
  readonly effectiveCeilingMinor: number;
  readonly mutationWindowReference: string;
  readonly maxProviderMutationAttempts: 1;
  readonly retryBoundary: 'W07_RECONCILE_BEFORE_RETRY';
  readonly requiresW07Execution: true;
  readonly requiresW08MetaBinding: true;
  readonly requiresProviderReadback: true;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export type MetaAdsFinancialGovernanceBlockCode =
  | 'INVALID_PLAN'
  | 'UNSUPPORTED_OPERATION'
  | 'INVALID_FINANCIAL_EXPOSURE'
  | 'PRECHECK_STALE'
  | 'PRECHECK_NOT_VERIFIED'
  | 'ACCOUNT_SCOPE_MISMATCH'
  | 'AUTHORITY_STALE'
  | 'AUTHORITY_DENIED'
  | 'APPROVAL_REQUIRED'
  | 'AUTHORITY_SCOPE_MISMATCH'
  | 'BUDGET_STALE'
  | 'BUDGET_SCOPE_MISMATCH'
  | 'BUDGET_CEILING_EXCEEDED'
  | 'PLAN_CEILING_EXCEEDED'
  | 'MUTATION_WINDOW_STALE'
  | 'MUTATION_SCOPE_MISMATCH'
  | 'MUTATION_WINDOW_EXHAUSTED';

export type MetaAdsFinancialGovernanceResult =
  | Readonly<{ status: 'READY'; plan: MetaAdsGovernedFinancialMutationPlan }>
  | Readonly<{ status: 'BLOCKED'; code: MetaAdsFinancialGovernanceBlockCode }>;

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function fresh(nowMs: number, observedAtMs: number, validUntilMs: number): boolean {
  return (
    Number.isSafeInteger(nowMs) &&
    Number.isSafeInteger(observedAtMs) &&
    Number.isSafeInteger(validUntilMs) &&
    nowMs >= 0 &&
    observedAtMs >= 0 &&
    observedAtMs <= nowMs &&
    nowMs < validUntilMs
  );
}

function scopedToPlan(plan: MetaAdsCapabilityPlan, evidence: MetaAdsScopedEvidence): boolean {
  return (
    evidence.tenantId === plan.tenantId &&
    evidence.providerBindingReference === plan.providerBindingReference &&
    evidence.adAccountExternalId === plan.adAccountExternalId
  );
}

function isFinancialOperation(operation: MetaAdsOperation): operation is MetaAdsFinancialOperation {
  return META_ADS_FINANCIAL_OPERATIONS.includes(operation as MetaAdsFinancialOperation);
}

function validMoney(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validAdvisory(advisory: MetaAdsOptimizationAdvisory | undefined): boolean {
  if (!advisory) return true;
  return (
    Number.isInteger(advisory.confidenceBps) &&
    advisory.confidenceBps >= 0 &&
    advisory.confidenceBps <= 10_000 &&
    validMoney(advisory.expectedBenefitMinor) &&
    Number.isSafeInteger(advisory.latencyBudgetMs) &&
    advisory.latencyBudgetMs >= 0 &&
    advisory.authorizesExecution === false
  );
}

export function prepareMetaAdsFinancialMutation(
  input: MetaAdsFinancialGovernanceInput,
): MetaAdsFinancialGovernanceResult {
  const { plan } = input;
  if (
    plan.planKind !== 'W12_META_ADS_DOMAIN_CAPABILITY_PLAN' ||
    plan.boundary !== 'WRITE' ||
    !plan.requiresCurrentApproval ||
    !plan.requiresW07Execution ||
    !plan.requiresW08MetaBinding ||
    !plan.requiresProviderReadback ||
    plan.executionPath !== 'W07_EXECUTOR_TO_W08_META_ADAPTER' ||
    plan.authorizesExecution !== false ||
    plan.canGrantPermission !== false ||
    !plan.financialScope
  ) {
    return { status: 'BLOCKED', code: 'INVALID_PLAN' };
  }
  if (!isFinancialOperation(plan.operation)) {
    return { status: 'BLOCKED', code: 'UNSUPPORTED_OPERATION' };
  }
  if (
    !validMoney(input.proposedFinancialExposureMinor) ||
    !validAdvisory(input.optimizationAdvisory)
  ) {
    return { status: 'BLOCKED', code: 'INVALID_FINANCIAL_EXPOSURE' };
  }
  if (!fresh(input.nowMs, input.precheck.observedAtMs, input.precheck.validUntilMs)) {
    return { status: 'BLOCKED', code: 'PRECHECK_STALE' };
  }
  if (!scopedToPlan(plan, input.precheck)) {
    return { status: 'BLOCKED', code: 'ACCOUNT_SCOPE_MISMATCH' };
  }
  if (input.precheck.bindingState !== 'ACTIVE' || input.precheck.verificationState !== 'VERIFIED') {
    return { status: 'BLOCKED', code: 'PRECHECK_NOT_VERIFIED' };
  }
  if (!fresh(input.nowMs, input.authority.observedAtMs, input.authority.validUntilMs)) {
    return { status: 'BLOCKED', code: 'AUTHORITY_STALE' };
  }
  if (!scopedToPlan(plan, input.authority)) {
    return { status: 'BLOCKED', code: 'AUTHORITY_SCOPE_MISMATCH' };
  }
  if (
    input.authority.capabilityId !== plan.capability.capabilityId ||
    input.authority.operation !== plan.operation ||
    input.authority.currency !== plan.financialScope.currency
  ) {
    return { status: 'BLOCKED', code: 'AUTHORITY_SCOPE_MISMATCH' };
  }
  if (!input.authority.authorized) return { status: 'BLOCKED', code: 'AUTHORITY_DENIED' };
  if (!input.authority.approvalReference || !nonEmpty(input.authority.approvalReference)) {
    return { status: 'BLOCKED', code: 'APPROVAL_REQUIRED' };
  }
  if (!fresh(input.nowMs, input.budget.observedAtMs, input.budget.validUntilMs)) {
    return { status: 'BLOCKED', code: 'BUDGET_STALE' };
  }
  if (!scopedToPlan(plan, input.budget) || input.budget.currency !== plan.financialScope.currency) {
    return { status: 'BLOCKED', code: 'BUDGET_SCOPE_MISMATCH' };
  }
  if (
    !validMoney(input.budget.remainingMinor) ||
    !validMoney(input.budget.maxOperationMinor) ||
    input.proposedFinancialExposureMinor > input.budget.remainingMinor ||
    input.proposedFinancialExposureMinor > input.budget.maxOperationMinor
  ) {
    return { status: 'BLOCKED', code: 'BUDGET_CEILING_EXCEEDED' };
  }
  if (
    !validMoney(plan.financialScope.ceilingMinor) ||
    !validMoney(input.authority.financialCeilingMinor) ||
    input.proposedFinancialExposureMinor > plan.financialScope.ceilingMinor ||
    input.proposedFinancialExposureMinor > input.authority.financialCeilingMinor
  ) {
    return { status: 'BLOCKED', code: 'PLAN_CEILING_EXCEEDED' };
  }
  if (!fresh(input.nowMs, input.mutationWindow.observedAtMs, input.mutationWindow.validUntilMs)) {
    return { status: 'BLOCKED', code: 'MUTATION_WINDOW_STALE' };
  }
  if (
    !scopedToPlan(plan, input.mutationWindow) ||
    input.mutationWindow.operation !== plan.operation ||
    !nonEmpty(input.mutationWindow.windowReference)
  ) {
    return { status: 'BLOCKED', code: 'MUTATION_SCOPE_MISMATCH' };
  }
  if (
    !Number.isSafeInteger(input.mutationWindow.committedMutations) ||
    !Number.isSafeInteger(input.mutationWindow.maxMutations) ||
    input.mutationWindow.committedMutations < 0 ||
    input.mutationWindow.maxMutations <= 0 ||
    input.mutationWindow.committedMutations >= input.mutationWindow.maxMutations
  ) {
    return { status: 'BLOCKED', code: 'MUTATION_WINDOW_EXHAUSTED' };
  }

  const effectiveCeilingMinor = Math.min(
    plan.financialScope.ceilingMinor,
    input.authority.financialCeilingMinor,
    input.budget.remainingMinor,
    input.budget.maxOperationMinor,
  );
  return {
    status: 'READY',
    plan: Object.freeze({
      planKind: 'W12_META_ADS_GOVERNED_FINANCIAL_MUTATION',
      tenantId: plan.tenantId,
      intentId: plan.intentId,
      capabilityId: plan.capability.capabilityId,
      providerBindingReference: plan.providerBindingReference,
      adAccountExternalId: plan.adAccountExternalId,
      operation: plan.operation,
      approvalReference: input.authority.approvalReference,
      currency: plan.financialScope.currency,
      proposedFinancialExposureMinor: input.proposedFinancialExposureMinor,
      effectiveCeilingMinor,
      mutationWindowReference: input.mutationWindow.windowReference,
      maxProviderMutationAttempts: 1,
      retryBoundary: 'W07_RECONCILE_BEFORE_RETRY',
      requiresW07Execution: true,
      requiresW08MetaBinding: true,
      requiresProviderReadback: true,
      authorizesExecution: false,
      canGrantPermission: false,
    }),
  };
}
