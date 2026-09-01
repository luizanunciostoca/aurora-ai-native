import type { ActionIntent } from '@aurora/contracts/actions';
import type {
  AuthorityEvaluationRequest,
  AuthorityEvaluationResult,
} from '@aurora/contracts/policy-validation';
import type { ContractVersion } from '@aurora/contracts/versioning';

/**
 * Required execution-time authority dependency. The concrete adapter must bind
 * this port to the canonical W02 current-policy/authority evaluator. W07-B does
 * not implement, cache or replace Policy Engine semantics.
 */
export type CurrentAuthorityValidator = (
  request: AuthorityEvaluationRequest,
) => AuthorityEvaluationResult;

/** Informational planner/router signals. They are intentionally non-authoritative. */
export interface NonAuthoritativeExecutionSignals {
  readonly lane?: 'FAST' | 'GOVERNED' | string;
  readonly confidence?: number;
  readonly precheckReference?: string;
  readonly executionBudgetReference?: string;
}

export interface ExecutorAuthorityGateRequest {
  readonly schemaVersion: ContractVersion;
  readonly actionIntent: ActionIntent;
  /** Fresh execution-time request containing current policy snapshot and authority evidence. */
  readonly authorityEvaluation: AuthorityEvaluationRequest;
  readonly validateCurrentAuthority: CurrentAuthorityValidator;
  readonly nonAuthoritativeSignals?: NonAuthoritativeExecutionSignals;
}

export type ExecutorAuthorityGateReason =
  | 'AUTHORITY_CONTEXT_MISMATCH'
  | 'AUTHORITY_REFERENCE_MISMATCH'
  | 'CURRENT_AUTHORITY_DENIED'
  | 'CURRENT_AUTHORITY_RESULT_MISMATCH'
  | 'CURRENT_AUTHORITY_VALIDATOR_FAILED';

interface ExecutorAuthorityGateResultBase {
  readonly kind: 'EXECUTOR_AUTHORITY_GATE';
  readonly schemaVersion: ContractVersion;
  readonly actionIntentId: ActionIntent['actionIntentId'];
  /** This gate never performs a side effect and never mints independent authority. */
  readonly authorizesExecution: false;
}

export type ExecutorAuthorityGateResult =
  | (ExecutorAuthorityGateResultBase & {
      readonly currentAuthorityValidated: true;
      readonly executionEligible: true;
      readonly reasons: readonly [];
      readonly authorityResult: AuthorityEvaluationResult & { readonly authorized: true };
    })
  | (ExecutorAuthorityGateResultBase & {
      readonly currentAuthorityValidated: false;
      readonly executionEligible: false;
      readonly reasons: readonly ExecutorAuthorityGateReason[];
      readonly authorityResult?: AuthorityEvaluationResult;
    });
