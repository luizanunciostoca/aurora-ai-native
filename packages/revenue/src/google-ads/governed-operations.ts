import type { GoogleAdsCapabilityPlan, GoogleAdsOperation } from './contracts.js';
import type { GoogleAdsGovernedFinancialMutationPlan } from './financial-governance.js';

export type GoogleAdsExecutableOperation = Exclude<
  GoogleAdsOperation,
  'OBSERVE' | 'ACTIVATE' | 'DELETE'
>;

export interface GoogleAdsW07ExecutionProofProjection {
  readonly source: 'W07_PROVIDER_EXECUTION_PROOF';
  readonly actionIntentId: string;
  readonly currentAuthorityValidated: true;
  readonly executionEligible: true;
  readonly authorizesExecution: false;
}

export interface GoogleAdsW08OperationPrecheck {
  readonly source: 'W08_PROVIDER_PRECHECK';
  readonly tenantId: string;
  readonly providerBindingReference: string;
  readonly customerId: string;
  readonly managerCustomerId?: string;
  readonly bindingState: 'ACTIVE' | 'INACTIVE' | 'REVOKED';
  readonly verificationState: 'VERIFIED' | 'UNVERIFIED' | 'STALE';
  readonly observedAtMs: number;
  readonly validUntilMs: number;
  readonly expectedResourceState: string | null;
  readonly authorizesExecution: false;
}

export interface GoogleAdsW08GovernedWriteRequest {
  readonly source: 'W13_TO_W08_GOVERNED_WRITE';
  readonly tenantId: string;
  readonly intentId: string;
  readonly actionIntentId: string;
  readonly provider: 'GOOGLE_ADS';
  readonly providerBindingReference: string;
  readonly customerId: string;
  readonly managerCustomerId?: string;
  readonly operation: GoogleAdsExecutableOperation;
  readonly idempotencyKey: string;
  readonly payloadReference: string;
  readonly safeMode: 'PAUSED';
  readonly expectedResourceState: string | null;
  readonly executionProof: GoogleAdsW07ExecutionProofProjection;
  readonly maxProviderMutationAttempts: 1;
  readonly requiresReadback: true;
  readonly authorizesExecution: false;
}

export type GoogleAdsW08WriteResult =
  | Readonly<{
      ok: true;
      providerReference?: string;
      providerRevision?: string;
      requiresReadback: boolean;
    }>
  | Readonly<{
      ok: false;
      error:
        | 'PROVIDER_AUTHENTICATION_FAILED'
        | 'RATE_LIMITED'
        | 'QUOTA_EXHAUSTED'
        | 'PROVIDER_OUTAGE'
        | 'TRANSIENT_TRANSPORT_FAILURE'
        | 'PERMANENT_REQUEST_REJECTED'
        | 'CONFLICT'
        | 'AMBIGUOUS_WRITE';
      mutationPossible: boolean;
      retryAfterMs?: number;
      providerReference?: string;
    }>;

export interface GoogleAdsW08WritePort {
  readonly source: 'W08_GOVERNED_PROVIDER_WRITE';
  writeOnce(request: GoogleAdsW08GovernedWriteRequest): Promise<GoogleAdsW08WriteResult>;
}

export interface GoogleAdsGovernedOperationInput {
  readonly nowMs: number;
  readonly plan: GoogleAdsCapabilityPlan;
  readonly actionIntentId: string;
  readonly idempotencyKey: string;
  readonly payloadReference: string;
  readonly executionProof: GoogleAdsW07ExecutionProofProjection;
  readonly precheck: GoogleAdsW08OperationPrecheck;
  readonly financialMutation?: GoogleAdsGovernedFinancialMutationPlan;
}

export type GoogleAdsGovernedOperationBlockCode =
  | 'INVALID_PLAN'
  | 'UNSUPPORTED_ACTIVATION'
  | 'DESTRUCTIVE_OPERATION_NOT_SUPPORTED'
  | 'INVALID_REFERENCE'
  | 'EXECUTION_PROOF_MISMATCH'
  | 'PRECHECK_STALE'
  | 'PRECHECK_NOT_VERIFIED'
  | 'ACCOUNT_SCOPE_MISMATCH'
  | 'PAUSED_STATE_REQUIRED'
  | 'FINANCIAL_GOVERNANCE_REQUIRED'
  | 'FINANCIAL_GOVERNANCE_MISMATCH';

export type GoogleAdsGovernedOperationResult =
  | Readonly<{
      status: 'BLOCKED';
      code: GoogleAdsGovernedOperationBlockCode;
      authorizesExecution: false;
      canGrantRetry: false;
    }>
  | Readonly<{
      status: 'ACKNOWLEDGED_PENDING_READBACK';
      providerReference?: string;
      providerRevision?: string;
      requiresReadback: true;
      authorizesExecution: false;
      canGrantRetry: false;
    }>
  | Readonly<{
      status: 'FAILED_NOT_EXECUTED';
      error: Extract<GoogleAdsW08WriteResult, { readonly ok: false }>['error'];
      retryAfterMs?: number;
      providerReference?: string;
      retryDecisionOwner: 'W07';
      authorizesExecution: false;
      canGrantRetry: false;
    }>
  | Readonly<{
      status: 'EXECUTION_UNCERTAIN';
      error:
        | Extract<GoogleAdsW08WriteResult, { readonly ok: false }>['error']
        | 'READBACK_PROTOCOL_VIOLATION';
      providerReference?: string;
      requiresReconciliation: true;
      retryBoundary: 'W07_RECONCILE_BEFORE_RETRY';
      authorizesExecution: false;
      canGrantRetry: false;
    }>;

const FINANCIAL_OPERATIONS: readonly GoogleAdsOperation[] = ['SET_BUDGET', 'SET_BID'];

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function sameAccount(
  plan: Pick<
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
    actual.tenantId === plan.tenantId &&
    actual.providerBindingReference === plan.providerBindingReference &&
    actual.customerId === plan.customerId &&
    actual.managerCustomerId === plan.managerCustomerId
  );
}

function executableOperation(
  operation: GoogleAdsOperation,
): operation is GoogleAdsExecutableOperation {
  return operation !== 'OBSERVE' && operation !== 'ACTIVATE' && operation !== 'DELETE';
}

function validFinancialMutation(
  plan: GoogleAdsCapabilityPlan,
  financialMutation: GoogleAdsGovernedFinancialMutationPlan | undefined,
): boolean {
  if (!FINANCIAL_OPERATIONS.includes(plan.operation)) return financialMutation === undefined;
  if (!financialMutation) return false;
  return (
    financialMutation.tenantId === plan.tenantId &&
    financialMutation.intentId === plan.intentId &&
    financialMutation.operation === plan.operation &&
    financialMutation.providerBindingReference === plan.providerBindingReference &&
    financialMutation.customerId === plan.customerId &&
    financialMutation.managerCustomerId === plan.managerCustomerId &&
    financialMutation.capabilityId === plan.capability.capabilityId &&
    financialMutation.maxProviderMutationAttempts === 1 &&
    financialMutation.retryBoundary === 'W07_RECONCILE_BEFORE_RETRY' &&
    financialMutation.authorizesExecution === false &&
    financialMutation.canGrantPermission === false
  );
}

function block(code: GoogleAdsGovernedOperationBlockCode): GoogleAdsGovernedOperationResult {
  return { status: 'BLOCKED', code, authorizesExecution: false, canGrantRetry: false };
}

/**
 * W13-E composes a single paused/non-serving Google Ads mutation attempt over
 * W07 authority proof and a W08 write port. It never retries, never activates,
 * and never upgrades provider acknowledgement to verified external state.
 */
export async function executeGoogleAdsGovernedOperation(
  input: GoogleAdsGovernedOperationInput,
  transport: GoogleAdsW08WritePort,
): Promise<GoogleAdsGovernedOperationResult> {
  const { plan } = input;
  if (
    plan.boundary !== 'WRITE' ||
    !plan.requiresW07Execution ||
    !plan.requiresW08GoogleAdsBinding ||
    !plan.requiresProviderReadback ||
    plan.executionPath !== 'W07_EXECUTOR_TO_W08_GOOGLE_ADS_ADAPTER' ||
    plan.authorizesExecution !== false ||
    plan.canGrantPermission !== false
  ) {
    return block('INVALID_PLAN');
  }
  if (plan.operation === 'ACTIVATE') return block('UNSUPPORTED_ACTIVATION');
  if (plan.operation === 'DELETE') return block('DESTRUCTIVE_OPERATION_NOT_SUPPORTED');
  if (!executableOperation(plan.operation)) return block('INVALID_PLAN');
  if (
    !nonEmpty(input.actionIntentId) ||
    !nonEmpty(input.idempotencyKey) ||
    !nonEmpty(input.payloadReference)
  ) {
    return block('INVALID_REFERENCE');
  }
  if (
    input.executionProof.actionIntentId !== input.actionIntentId ||
    input.executionProof.currentAuthorityValidated !== true ||
    input.executionProof.executionEligible !== true ||
    input.executionProof.authorizesExecution !== false
  ) {
    return block('EXECUTION_PROOF_MISMATCH');
  }
  if (
    !Number.isSafeInteger(input.nowMs) ||
    input.nowMs < 0 ||
    !Number.isSafeInteger(input.precheck.observedAtMs) ||
    !Number.isSafeInteger(input.precheck.validUntilMs) ||
    input.precheck.observedAtMs > input.nowMs ||
    input.nowMs >= input.precheck.validUntilMs
  ) {
    return block('PRECHECK_STALE');
  }
  if (!sameAccount(plan, input.precheck)) return block('ACCOUNT_SCOPE_MISMATCH');
  if (input.precheck.bindingState !== 'ACTIVE' || input.precheck.verificationState !== 'VERIFIED') {
    return block('PRECHECK_NOT_VERIFIED');
  }
  if (plan.operation !== 'CREATE_PAUSED' && input.precheck.expectedResourceState !== 'PAUSED') {
    return block('PAUSED_STATE_REQUIRED');
  }
  if (FINANCIAL_OPERATIONS.includes(plan.operation) && !input.financialMutation) {
    return block('FINANCIAL_GOVERNANCE_REQUIRED');
  }
  if (!validFinancialMutation(plan, input.financialMutation)) {
    return block('FINANCIAL_GOVERNANCE_MISMATCH');
  }

  let outcome: GoogleAdsW08WriteResult;
  try {
    outcome = await transport.writeOnce({
      source: 'W13_TO_W08_GOVERNED_WRITE',
      tenantId: plan.tenantId,
      intentId: plan.intentId,
      actionIntentId: input.actionIntentId,
      provider: 'GOOGLE_ADS',
      providerBindingReference: plan.providerBindingReference,
      customerId: plan.customerId,
      ...(plan.managerCustomerId ? { managerCustomerId: plan.managerCustomerId } : {}),
      operation: plan.operation,
      idempotencyKey: input.idempotencyKey,
      payloadReference: input.payloadReference,
      safeMode: 'PAUSED',
      expectedResourceState: input.precheck.expectedResourceState,
      executionProof: input.executionProof,
      maxProviderMutationAttempts: 1,
      requiresReadback: true,
      authorizesExecution: false,
    });
  } catch {
    return {
      status: 'EXECUTION_UNCERTAIN',
      error: 'AMBIGUOUS_WRITE',
      requiresReconciliation: true,
      retryBoundary: 'W07_RECONCILE_BEFORE_RETRY',
      authorizesExecution: false,
      canGrantRetry: false,
    };
  }

  if (outcome.ok) {
    if (!outcome.requiresReadback) {
      return {
        status: 'EXECUTION_UNCERTAIN',
        error: 'READBACK_PROTOCOL_VIOLATION',
        ...(outcome.providerReference ? { providerReference: outcome.providerReference } : {}),
        requiresReconciliation: true,
        retryBoundary: 'W07_RECONCILE_BEFORE_RETRY',
        authorizesExecution: false,
        canGrantRetry: false,
      };
    }
    return {
      status: 'ACKNOWLEDGED_PENDING_READBACK',
      ...(outcome.providerReference ? { providerReference: outcome.providerReference } : {}),
      ...(outcome.providerRevision ? { providerRevision: outcome.providerRevision } : {}),
      requiresReadback: true,
      authorizesExecution: false,
      canGrantRetry: false,
    };
  }

  if (outcome.mutationPossible || outcome.error === 'AMBIGUOUS_WRITE') {
    return {
      status: 'EXECUTION_UNCERTAIN',
      error: outcome.error,
      ...(outcome.providerReference ? { providerReference: outcome.providerReference } : {}),
      requiresReconciliation: true,
      retryBoundary: 'W07_RECONCILE_BEFORE_RETRY',
      authorizesExecution: false,
      canGrantRetry: false,
    };
  }

  return {
    status: 'FAILED_NOT_EXECUTED',
    error: outcome.error,
    ...(outcome.retryAfterMs === undefined ? {} : { retryAfterMs: outcome.retryAfterMs }),
    ...(outcome.providerReference ? { providerReference: outcome.providerReference } : {}),
    retryDecisionOwner: 'W07',
    authorizesExecution: false,
    canGrantRetry: false,
  };
}
