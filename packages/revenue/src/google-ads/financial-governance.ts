import type { GoogleAdsCapabilityPlan, GoogleAdsOperation } from './contracts.js';

export const GOOGLE_ADS_FINANCIAL_OPERATIONS = ['ACTIVATE', 'SET_BUDGET', 'SET_BID'] as const;
export type GoogleAdsFinancialOperation = (typeof GOOGLE_ADS_FINANCIAL_OPERATIONS)[number];

interface BoundedEvidence {
  readonly observedAtMs: number;
  readonly validUntilMs: number;
  readonly authorizesExecution: false;
}

export interface GoogleAdsAuthorityProjection extends BoundedEvidence {
  readonly source: 'W02_AUTHORITY_EVALUATION';
  readonly tenantId: string;
  readonly capabilityId: string;
  readonly providerBindingReference: string;
  readonly customerId: string;
  readonly managerCustomerId?: string;
  readonly operation: GoogleAdsFinancialOperation;
  readonly authorized: boolean;
  readonly approvalReference: string | null;
  readonly currency: string;
  readonly financialCeilingMicros: number;
}

export interface GoogleAdsBudgetProjection extends BoundedEvidence {
  readonly source: 'W04_BUDGET_CONTROL';
  readonly tenantId: string;
  readonly providerBindingReference: string;
  readonly customerId: string;
  readonly managerCustomerId?: string;
  readonly currency: string;
  readonly remainingMicros: number;
  readonly maxOperationMicros: number;
}

export interface GoogleAdsProviderPrecheckProjection extends BoundedEvidence {
  readonly source: 'W08_PROVIDER_PRECHECK';
  readonly tenantId: string;
  readonly providerBindingReference: string;
  readonly customerId: string;
  readonly managerCustomerId?: string;
  readonly bindingState: 'ACTIVE' | 'INACTIVE' | 'REVOKED';
  readonly verificationState: 'VERIFIED' | 'UNVERIFIED' | 'STALE';
}

export interface GoogleAdsMutationWindowProjection extends BoundedEvidence {
  readonly source: 'W04_MUTATION_BOUNDS';
  readonly tenantId: string;
  readonly providerBindingReference: string;
  readonly customerId: string;
  readonly managerCustomerId?: string;
  readonly operation: GoogleAdsFinancialOperation;
  readonly windowReference: string;
  readonly committedMutations: number;
  readonly maxMutations: number;
}

export interface GoogleAdsStrategyProjection {
  readonly source: 'W13_STRATEGY_EVIDENCE';
  readonly strategyReference: string;
  readonly confidence: number;
  readonly authorizesExecution: false;
}

export interface GoogleAdsFinancialGovernanceInput {
  readonly nowMs: number;
  readonly plan: GoogleAdsCapabilityPlan;
  readonly proposedMicros: number;
  readonly authority: GoogleAdsAuthorityProjection | null;
  readonly budget: GoogleAdsBudgetProjection | null;
  readonly precheck: GoogleAdsProviderPrecheckProjection | null;
  readonly mutationWindow: GoogleAdsMutationWindowProjection | null;
  readonly strategy?: GoogleAdsStrategyProjection;
}

export interface GoogleAdsGovernedFinancialMutationPlan {
  readonly planKind: 'W13_GOOGLE_ADS_GOVERNED_FINANCIAL_MUTATION';
  readonly tenantId: string;
  readonly intentId: string;
  readonly operation: GoogleAdsFinancialOperation;
  readonly providerBindingReference: string;
  readonly customerId: string;
  readonly managerCustomerId?: string;
  readonly capabilityId: string;
  readonly proposedMicros: number;
  readonly currency: string;
  readonly approvalReference: string;
  readonly budgetCeilingMicros: number;
  readonly remainingBudgetMicros: number;
  readonly mutationWindowReference: string;
  readonly committedMutations: number;
  readonly maxMutations: number;
  readonly strategyReference?: string;
  readonly strategyConfidence?: number;
  readonly maxProviderMutationAttempts: 1;
  readonly retryBoundary: 'W07_RECONCILE_BEFORE_RETRY';
  readonly executionPath: 'W07_EXECUTOR_TO_W08_GOOGLE_ADS_ADAPTER';
  readonly requiresCurrentW02Authority: true;
  readonly requiresCurrentW04Budget: true;
  readonly requiresCurrentW08Precheck: true;
  readonly requiresProviderReadback: true;
  readonly strategyCanWidenAuthority: false;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export type GoogleAdsFinancialGovernanceBlockCode =
  | 'INVALID_PLAN'
  | 'INVALID_AMOUNT'
  | 'INVALID_TIME_BOUNDARY'
  | 'MISSING_PRECHECK'
  | 'PRECHECK_STALE'
  | 'PRECHECK_NOT_VERIFIED'
  | 'WRONG_ACCOUNT'
  | 'MISSING_APPROVAL'
  | 'AUTHORITY_STALE'
  | 'AUTHORITY_DENIED'
  | 'AUTHORITY_SCOPE_MISMATCH'
  | 'MISSING_BUDGET_CONTROL'
  | 'BUDGET_STALE'
  | 'BUDGET_SCOPE_MISMATCH'
  | 'CURRENCY_MISMATCH'
  | 'BUDGET_CEILING_EXCEEDED'
  | 'MISSING_MUTATION_BOUND'
  | 'MUTATION_BOUND_STALE'
  | 'MUTATION_BOUND_INVALID'
  | 'MUTATION_LIMIT_EXCEEDED'
  | 'INVALID_STRATEGY_EVIDENCE';

export type GoogleAdsFinancialGovernanceResult =
  | Readonly<{ status: 'READY'; plan: GoogleAdsGovernedFinancialMutationPlan }>
  | Readonly<{ status: 'BLOCKED'; code: GoogleAdsFinancialGovernanceBlockCode }>;

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function isFinancialOperation(
  operation: GoogleAdsOperation,
): operation is GoogleAdsFinancialOperation {
  return GOOGLE_ADS_FINANCIAL_OPERATIONS.includes(operation as GoogleAdsFinancialOperation);
}

function validBoundedEvidence(evidence: BoundedEvidence, nowMs: number): boolean {
  return (
    Number.isSafeInteger(nowMs) &&
    nowMs >= 0 &&
    evidence.authorizesExecution === false &&
    Number.isSafeInteger(evidence.observedAtMs) &&
    evidence.observedAtMs >= 0 &&
    Number.isSafeInteger(evidence.validUntilMs) &&
    evidence.validUntilMs >= 0 &&
    evidence.observedAtMs <= nowMs &&
    nowMs < evidence.validUntilMs
  );
}

function sameAccount(
  expected: Pick<
    GoogleAdsCapabilityPlan,
    'tenantId' | 'providerBindingReference' | 'customerId' | 'managerCustomerId'
  >,
  actual: {
    readonly tenantId: string;
    readonly providerBindingReference: string;
    readonly customerId: string;
    readonly managerCustomerId?: string;
  },
): boolean {
  return (
    actual.tenantId === expected.tenantId &&
    actual.providerBindingReference === expected.providerBindingReference &&
    actual.customerId === expected.customerId &&
    actual.managerCustomerId === expected.managerCustomerId
  );
}

function validMicros(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validStrategy(strategy: GoogleAdsStrategyProjection): boolean {
  return (
    nonEmpty(strategy.strategyReference) &&
    Number.isFinite(strategy.confidence) &&
    strategy.confidence >= 0 &&
    strategy.confidence <= 1 &&
    strategy.authorizesExecution === false
  );
}

/**
 * W13-F composes current W02 authority, W04 budget/mutation bounds and W08
 * provider precheck evidence for a financial Google Ads mutation. It never
 * evaluates policy itself and never grants execution authority.
 */
export function prepareGoogleAdsFinancialMutation(
  input: GoogleAdsFinancialGovernanceInput,
): GoogleAdsFinancialGovernanceResult {
  const { plan } = input;
  if (
    plan.boundary !== 'WRITE' ||
    !isFinancialOperation(plan.operation) ||
    !plan.requiresCurrentApproval ||
    !plan.requiresW07Execution ||
    plan.executionPath !== 'W07_EXECUTOR_TO_W08_GOOGLE_ADS_ADAPTER' ||
    !plan.financialScope ||
    plan.authorizesExecution !== false ||
    plan.canGrantPermission !== false
  ) {
    return { status: 'BLOCKED', code: 'INVALID_PLAN' };
  }
  if (!Number.isSafeInteger(input.nowMs) || input.nowMs < 0) {
    return { status: 'BLOCKED', code: 'INVALID_TIME_BOUNDARY' };
  }
  if (!Number.isSafeInteger(input.proposedMicros) || input.proposedMicros <= 0) {
    return { status: 'BLOCKED', code: 'INVALID_AMOUNT' };
  }

  const precheck = input.precheck;
  if (!precheck) return { status: 'BLOCKED', code: 'MISSING_PRECHECK' };
  if (!validBoundedEvidence(precheck, input.nowMs)) {
    return { status: 'BLOCKED', code: 'PRECHECK_STALE' };
  }
  if (!sameAccount(plan, precheck)) return { status: 'BLOCKED', code: 'WRONG_ACCOUNT' };
  if (precheck.bindingState !== 'ACTIVE' || precheck.verificationState !== 'VERIFIED') {
    return { status: 'BLOCKED', code: 'PRECHECK_NOT_VERIFIED' };
  }

  const authority = input.authority;
  if (!authority || !authority.approvalReference || !nonEmpty(authority.approvalReference)) {
    return { status: 'BLOCKED', code: 'MISSING_APPROVAL' };
  }
  if (!validBoundedEvidence(authority, input.nowMs)) {
    return { status: 'BLOCKED', code: 'AUTHORITY_STALE' };
  }
  if (!authority.authorized) return { status: 'BLOCKED', code: 'AUTHORITY_DENIED' };
  if (!sameAccount(plan, authority)) return { status: 'BLOCKED', code: 'WRONG_ACCOUNT' };
  if (
    authority.operation !== plan.operation ||
    authority.capabilityId !== plan.capability.capabilityId
  ) {
    return { status: 'BLOCKED', code: 'AUTHORITY_SCOPE_MISMATCH' };
  }

  const budget = input.budget;
  if (!budget) return { status: 'BLOCKED', code: 'MISSING_BUDGET_CONTROL' };
  if (!validBoundedEvidence(budget, input.nowMs)) {
    return { status: 'BLOCKED', code: 'BUDGET_STALE' };
  }
  if (!sameAccount(plan, budget)) return { status: 'BLOCKED', code: 'WRONG_ACCOUNT' };
  if (
    !validMicros(authority.financialCeilingMicros) ||
    !validMicros(budget.remainingMicros) ||
    !validMicros(budget.maxOperationMicros) ||
    !validMicros(plan.financialScope.ceilingMicros)
  ) {
    return { status: 'BLOCKED', code: 'BUDGET_SCOPE_MISMATCH' };
  }
  if (
    authority.currency !== plan.financialScope.currency ||
    budget.currency !== plan.financialScope.currency
  ) {
    return { status: 'BLOCKED', code: 'CURRENCY_MISMATCH' };
  }
  if (
    input.proposedMicros > plan.financialScope.ceilingMicros ||
    input.proposedMicros > authority.financialCeilingMicros ||
    input.proposedMicros > budget.maxOperationMicros ||
    input.proposedMicros > budget.remainingMicros
  ) {
    return { status: 'BLOCKED', code: 'BUDGET_CEILING_EXCEEDED' };
  }

  const mutationWindow = input.mutationWindow;
  if (!mutationWindow) return { status: 'BLOCKED', code: 'MISSING_MUTATION_BOUND' };
  if (!validBoundedEvidence(mutationWindow, input.nowMs)) {
    return { status: 'BLOCKED', code: 'MUTATION_BOUND_STALE' };
  }
  if (!sameAccount(plan, mutationWindow) || mutationWindow.operation !== plan.operation) {
    return { status: 'BLOCKED', code: 'MUTATION_BOUND_INVALID' };
  }
  if (
    !nonEmpty(mutationWindow.windowReference) ||
    !Number.isSafeInteger(mutationWindow.committedMutations) ||
    mutationWindow.committedMutations < 0 ||
    !Number.isSafeInteger(mutationWindow.maxMutations) ||
    mutationWindow.maxMutations <= 0
  ) {
    return { status: 'BLOCKED', code: 'MUTATION_BOUND_INVALID' };
  }
  if (mutationWindow.committedMutations >= mutationWindow.maxMutations) {
    return { status: 'BLOCKED', code: 'MUTATION_LIMIT_EXCEEDED' };
  }

  if (input.strategy && !validStrategy(input.strategy)) {
    return { status: 'BLOCKED', code: 'INVALID_STRATEGY_EVIDENCE' };
  }

  return {
    status: 'READY',
    plan: {
      planKind: 'W13_GOOGLE_ADS_GOVERNED_FINANCIAL_MUTATION',
      tenantId: plan.tenantId,
      intentId: plan.intentId,
      operation: plan.operation,
      providerBindingReference: plan.providerBindingReference,
      customerId: plan.customerId,
      ...(plan.managerCustomerId ? { managerCustomerId: plan.managerCustomerId } : {}),
      capabilityId: plan.capability.capabilityId,
      proposedMicros: input.proposedMicros,
      currency: plan.financialScope.currency,
      approvalReference: authority.approvalReference,
      budgetCeilingMicros: Math.min(
        plan.financialScope.ceilingMicros,
        authority.financialCeilingMicros,
        budget.maxOperationMicros,
      ),
      remainingBudgetMicros: budget.remainingMicros,
      mutationWindowReference: mutationWindow.windowReference,
      committedMutations: mutationWindow.committedMutations,
      maxMutations: mutationWindow.maxMutations,
      ...(input.strategy
        ? {
            strategyReference: input.strategy.strategyReference,
            strategyConfidence: input.strategy.confidence,
          }
        : {}),
      maxProviderMutationAttempts: 1,
      retryBoundary: 'W07_RECONCILE_BEFORE_RETRY',
      executionPath: 'W07_EXECUTOR_TO_W08_GOOGLE_ADS_ADAPTER',
      requiresCurrentW02Authority: true,
      requiresCurrentW04Budget: true,
      requiresCurrentW08Precheck: true,
      requiresProviderReadback: true,
      strategyCanWidenAuthority: false,
      authorizesExecution: false,
      canGrantPermission: false,
    },
  };
}
