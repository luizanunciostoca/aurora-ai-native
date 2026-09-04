import type {
  MetaAdsCapabilityPlan,
  MetaAdsOperation,
  MetaAdsResourceKind,
} from './contracts.js';
import type { MetaAdsGovernedFinancialMutationPlan } from './financial-governance.js';

export type MetaAdsManagedResourceKind = Extract<
  MetaAdsResourceKind,
  'CAMPAIGN' | 'AD_SET' | 'AD'
>;

export type MetaAdsExecutableOperation = Exclude<
  MetaAdsOperation,
  'OBSERVE' | 'ACTIVATE' | 'DELETE'
>;

export interface MetaAdsW07ExecutionProofProjection {
  readonly source: 'W07_PROVIDER_EXECUTION_PROOF';
  readonly actionIntentId: string;
  readonly currentAuthorityValidated: true;
  readonly executionEligible: true;
  readonly authorizesExecution: false;
}

export interface MetaAdsW08OperationPrecheck {
  readonly source: 'W08_PROVIDER_PRECHECK';
  readonly tenantId: string;
  readonly providerBindingReference: string;
  readonly adAccountExternalId: string;
  readonly bindingState: 'ACTIVE' | 'INACTIVE' | 'REVOKED';
  readonly verificationState: 'VERIFIED' | 'UNVERIFIED' | 'STALE';
  readonly observedAtMs: number;
  readonly validUntilMs: number;
  readonly expectedResourceState: string | null;
  readonly authorizesExecution: false;
}

export interface MetaAdsW08GovernedWriteRequest {
  readonly source: 'W12_TO_W08_GOVERNED_WRITE';
  readonly tenantId: string;
  readonly intentId: string;
  readonly actionIntentId: string;
  readonly provider: 'META_ADS';
  readonly providerBindingReference: string;
  readonly adAccountExternalId: string;
  readonly resourceKind: MetaAdsManagedResourceKind;
  readonly operation: MetaAdsExecutableOperation;
  readonly idempotencyKey: string;
  readonly payloadReference: string;
  readonly safeMode: 'PAUSED';
  readonly expectedResourceState: string | null;
  readonly executionProof: MetaAdsW07ExecutionProofProjection;
  readonly maxProviderMutationAttempts: 1;
  readonly requiresReadback: true;
  readonly authorizesExecution: false;
}

export type MetaAdsW08WriteResult =
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

export interface MetaAdsW08WritePort {
  readonly source: 'W08_GOVERNED_PROVIDER_WRITE';
  writeOnce(request: MetaAdsW08GovernedWriteRequest): Promise<MetaAdsW08WriteResult>;
}

export interface MetaAdsGovernedOperationInput {
  readonly nowMs: number;
  readonly plan: MetaAdsCapabilityPlan;
  readonly actionIntentId: string;
  readonly idempotencyKey: string;
  readonly payloadReference: string;
  readonly executionProof: MetaAdsW07ExecutionProofProjection;
  readonly precheck: MetaAdsW08OperationPrecheck;
  readonly financialMutation?: MetaAdsGovernedFinancialMutationPlan;
}

export type MetaAdsGovernedOperationBlockCode =
  | 'INVALID_PLAN'
  | 'UNSUPPORTED_RESOURCE_KIND'
  | 'UNSUPPORTED_ACTIVATION'
  | 'DESTRUCTIVE_OPERATION_NOT_SUPPORTED'
  | 'INVALID_REFERENCE'
  | 'W08_WRITE_PORT_REQUIRED'
  | 'EXECUTION_PROOF_MISMATCH'
  | 'PRECHECK_PROTOCOL_MISMATCH'
  | 'PRECHECK_STALE'
  | 'PRECHECK_NOT_VERIFIED'
  | 'ACCOUNT_SCOPE_MISMATCH'
  | 'EXPECTED_STATE_MISMATCH'
  | 'PAUSED_STATE_REQUIRED'
  | 'FINANCIAL_GOVERNANCE_REQUIRED'
  | 'FINANCIAL_GOVERNANCE_MISMATCH';

export type MetaAdsGovernedOperationResult =
  | Readonly<{
      status: 'BLOCKED';
      code: MetaAdsGovernedOperationBlockCode;
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
      error: Extract<MetaAdsW08WriteResult, { readonly ok: false }>['error'];
      retryAfterMs?: number;
      providerReference?: string;
      retryDecisionOwner: 'W07';
      authorizesExecution: false;
      canGrantRetry: false;
    }>
  | Readonly<{
      status: 'EXECUTION_UNCERTAIN';
      error:
        | Extract<MetaAdsW08WriteResult, { readonly ok: false }>['error']
        | 'READBACK_PROTOCOL_VIOLATION';
      providerReference?: string;
      requiresReconciliation: true;
      retryBoundary: 'W07_RECONCILE_BEFORE_RETRY';
      authorizesExecution: false;
      canGrantRetry: false;
    }>;

const FINANCIAL_EXECUTABLE_OPERATIONS: readonly MetaAdsOperation[] = [
  'SET_BUDGET',
  'SET_BID',
  'WIDEN_TARGETING',
];

const PAUSED_PRECONDITION_OPERATIONS: readonly MetaAdsOperation[] = [
  'UPDATE_METADATA',
  'SET_BUDGET',
  'SET_BID',
  'WIDEN_TARGETING',
];

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function sameAccount(
  plan: Pick<
    MetaAdsCapabilityPlan,
    'tenantId' | 'providerBindingReference' | 'adAccountExternalId'
  >,
  actual: {
    readonly tenantId: string;
    readonly providerBindingReference: string;
    readonly adAccountExternalId: string;
  },
): boolean {
  return (
    actual.tenantId === plan.tenantId &&
    actual.providerBindingReference === plan.providerBindingReference &&
    actual.adAccountExternalId === plan.adAccountExternalId
  );
}

function managedResourceKind(
  resourceKind: MetaAdsResourceKind,
): resourceKind is MetaAdsManagedResourceKind {
  return resourceKind === 'CAMPAIGN' || resourceKind === 'AD_SET' || resourceKind === 'AD';
}

function executableOperation(
  operation: MetaAdsOperation,
): operation is MetaAdsExecutableOperation {
  return operation !== 'OBSERVE' && operation !== 'ACTIVATE' && operation !== 'DELETE';
}

function validFinancialMutation(
  plan: MetaAdsCapabilityPlan,
  financialMutation: MetaAdsGovernedFinancialMutationPlan | undefined,
): boolean {
  if (!FINANCIAL_EXECUTABLE_OPERATIONS.includes(plan.operation)) {
    return financialMutation === undefined;
  }
  if (!financialMutation) return false;
  return (
    financialMutation.tenantId === plan.tenantId &&
    financialMutation.intentId === plan.intentId &&
    financialMutation.operation === plan.operation &&
    financialMutation.providerBindingReference === plan.providerBindingReference &&
    financialMutation.adAccountExternalId === plan.adAccountExternalId &&
    financialMutation.capabilityId === plan.capability.capabilityId &&
    financialMutation.maxProviderMutationAttempts === 1 &&
    financialMutation.retryBoundary === 'W07_RECONCILE_BEFORE_RETRY' &&
    financialMutation.requiresW07Execution === true &&
    financialMutation.requiresW08MetaBinding === true &&
    financialMutation.requiresProviderReadback === true &&
    Number.isSafeInteger(financialMutation.proposedFinancialExposureMinor) &&
    financialMutation.proposedFinancialExposureMinor >= 0 &&
    Number.isSafeInteger(financialMutation.effectiveCeilingMinor) &&
    financialMutation.effectiveCeilingMinor >= financialMutation.proposedFinancialExposureMinor &&
    financialMutation.authorizesExecution === false &&
    financialMutation.canGrantPermission === false
  );
}

function block(code: MetaAdsGovernedOperationBlockCode): MetaAdsGovernedOperationResult {
  return { status: 'BLOCKED', code, authorizesExecution: false, canGrantRetry: false };
}

/**
 * W12-D composes exactly one paused/non-serving Meta Ads write over accepted
 * W07 execution proof and the W08 governed provider port. It never retries,
 * never activates, and never upgrades provider acknowledgement into verified
 * external state. Ambiguous outcomes remain W07/W08 reconciliation work.
 */
export async function executeMetaAdsGovernedOperation(
  input: MetaAdsGovernedOperationInput,
  transport: MetaAdsW08WritePort,
): Promise<MetaAdsGovernedOperationResult> {
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
    plan.canGrantPermission !== false
  ) {
    return block('INVALID_PLAN');
  }
  if (!managedResourceKind(plan.resourceKind)) return block('UNSUPPORTED_RESOURCE_KIND');
  if (plan.operation === 'ACTIVATE') return block('UNSUPPORTED_ACTIVATION');
  if (plan.operation === 'DELETE') return block('DESTRUCTIVE_OPERATION_NOT_SUPPORTED');
  if (!executableOperation(plan.operation)) return block('INVALID_PLAN');
  if (plan.operation === 'CREATE_PAUSED' && !plan.pausedFirst) return block('INVALID_PLAN');
  if (transport.source !== 'W08_GOVERNED_PROVIDER_WRITE') return block('W08_WRITE_PORT_REQUIRED');
  if (
    !nonEmpty(input.actionIntentId) ||
    !nonEmpty(input.idempotencyKey) ||
    !nonEmpty(input.payloadReference)
  ) {
    return block('INVALID_REFERENCE');
  }
  if (
    input.executionProof.source !== 'W07_PROVIDER_EXECUTION_PROOF' ||
    input.executionProof.actionIntentId !== input.actionIntentId ||
    input.executionProof.currentAuthorityValidated !== true ||
    input.executionProof.executionEligible !== true ||
    input.executionProof.authorizesExecution !== false
  ) {
    return block('EXECUTION_PROOF_MISMATCH');
  }
  if (
    input.precheck.source !== 'W08_PROVIDER_PRECHECK' ||
    input.precheck.authorizesExecution !== false
  ) {
    return block('PRECHECK_PROTOCOL_MISMATCH');
  }
  if (
    !Number.isSafeInteger(input.nowMs) ||
    input.nowMs < 0 ||
    !Number.isSafeInteger(input.precheck.observedAtMs) ||
    !Number.isSafeInteger(input.precheck.validUntilMs) ||
    input.precheck.observedAtMs < 0 ||
    input.precheck.observedAtMs > input.nowMs ||
    input.nowMs >= input.precheck.validUntilMs
  ) {
    return block('PRECHECK_STALE');
  }
  if (!sameAccount(plan, input.precheck)) return block('ACCOUNT_SCOPE_MISMATCH');
  if (input.precheck.bindingState !== 'ACTIVE' || input.precheck.verificationState !== 'VERIFIED') {
    return block('PRECHECK_NOT_VERIFIED');
  }
  if (
    plan.operation !== 'CREATE_PAUSED' &&
    plan.expectedProviderState !== undefined &&
    input.precheck.expectedResourceState !== plan.expectedProviderState
  ) {
    return block('EXPECTED_STATE_MISMATCH');
  }
  if (
    PAUSED_PRECONDITION_OPERATIONS.includes(plan.operation) &&
    input.precheck.expectedResourceState !== 'PAUSED'
  ) {
    return block('PAUSED_STATE_REQUIRED');
  }
  if (FINANCIAL_EXECUTABLE_OPERATIONS.includes(plan.operation) && !input.financialMutation) {
    return block('FINANCIAL_GOVERNANCE_REQUIRED');
  }
  if (!validFinancialMutation(plan, input.financialMutation)) {
    return block('FINANCIAL_GOVERNANCE_MISMATCH');
  }

  let outcome: MetaAdsW08WriteResult;
  try {
    outcome = await transport.writeOnce({
      source: 'W12_TO_W08_GOVERNED_WRITE',
      tenantId: plan.tenantId,
      intentId: plan.intentId,
      actionIntentId: input.actionIntentId,
      provider: 'META_ADS',
      providerBindingReference: plan.providerBindingReference,
      adAccountExternalId: plan.adAccountExternalId,
      resourceKind: plan.resourceKind,
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
