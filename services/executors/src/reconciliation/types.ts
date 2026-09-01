import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { FailedExecutionResult, UncertainExecutionResult } from '@aurora/contracts/results';
import type { ContractVersion } from '@aurora/contracts/versioning';

import type { CaptureReadbackEvidenceResult } from '../readback/index.js';
import type { ExecutionSafeguardResult } from '../safeguards/index.js';

export type ExecutionAmbiguitySignal =
  | 'TIMEOUT'
  | 'CONNECTION_LOST'
  | 'ACK_WITHOUT_VERIFICATION'
  | 'READBACK_UNKNOWN'
  | 'READBACK_MISMATCH';

export type ExternalInvocationPhase =
  'BEFORE_EXTERNAL_INVOCATION' | 'AFTER_EXTERNAL_INVOCATION_STARTED';

export interface ClassifyExecutionAmbiguityRequest {
  readonly schemaVersion: ContractVersion;
  readonly actionIntent: ActionIntent;
  readonly occurredAt: Rfc3339Timestamp;
  readonly attemptNumber: number;
  readonly maxAttempts: number;
  readonly signal: ExecutionAmbiguitySignal;
  readonly phase: ExternalInvocationPhase;
}

export type ExecutionUncertainFact = UncertainExecutionResult<
  ContractVersion,
  ActionIntent['correlation']['correlationId'],
  ActionIntent['dataClassification']
>;

export type KnownPreExecutionFailureFact = FailedExecutionResult<
  ContractVersion,
  ActionIntent['correlation']['correlationId'],
  ActionIntent['dataClassification']
>;

export interface ExecutionUncertaintyRecord {
  readonly kind: 'EXECUTION_UNCERTAINTY_RECORD';
  readonly schemaVersion: ContractVersion;
  readonly actionIntentId: ActionIntent['actionIntentId'];
  readonly correlationId: ActionIntent['correlation']['correlationId'];
  readonly occurredAt: Rfc3339Timestamp;
  readonly attemptNumber: number;
  readonly maxAttempts: number;
  readonly signal: ExecutionAmbiguitySignal;
  readonly executionResult: ExecutionUncertainFact;
  readonly authorizesExecution: false;
}

export type AmbiguityClassificationReason =
  'INVALID_TIME' | 'ATTEMPT_INVALID' | 'ATTEMPT_LIMIT_INVALID' | 'SIGNAL_PHASE_INCOMPATIBLE';

export type ExecutionAmbiguityClassification =
  | Readonly<{
      status: 'REJECTED';
      reasons: readonly AmbiguityClassificationReason[];
      authorizesExecution: false;
    }>
  | Readonly<{
      status: 'KNOWN_PRE_EXECUTION_FAILURE';
      executionResult: KnownPreExecutionFailureFact;
      reconciliationRequired: false;
      retryRequiresFreshGuards: true;
      authorizesExecution: false;
    }>
  | Readonly<{
      status: 'EXECUTION_UNCERTAIN';
      uncertainty: ExecutionUncertaintyRecord;
      reconciliationRequired: true;
      retryAllowedBeforeReconciliation: false;
      authorizesExecution: false;
    }>;

export type ReconciliationObservation =
  | Readonly<{
      state: 'EFFECT_OBSERVED';
      observedAt: Rfc3339Timestamp;
      reference?: string;
    }>
  | Readonly<{
      state: 'NO_EFFECT_CONFIRMED';
      observedAt: Rfc3339Timestamp;
      reference?: string;
    }>
  | Readonly<{
      state: 'INDETERMINATE';
      observedAt: Rfc3339Timestamp;
      reason: string;
      reference?: string;
    }>;

export interface RetrySafeguardEvidence {
  /** Must be the W07-C evaluation for the next equivalent attempt. */
  readonly attemptNumber: number;
  /** Must be at or after the no-effect reconciliation observation. */
  readonly evaluatedAt: Rfc3339Timestamp;
  readonly result: ExecutionSafeguardResult;
}

export interface ReconcileExecutionUncertaintyRequest {
  readonly schemaVersion: ContractVersion;
  readonly actionIntent: ActionIntent;
  readonly uncertainty: ExecutionUncertaintyRecord;
  readonly observation?: ReconciliationObservation;
  /** Fresh W07-C safeguards for the next equivalent attempt, when retry is considered. */
  readonly retrySafeguards?: RetrySafeguardEvidence;
}

export type ReconciliationReason =
  | 'RECONCILIATION_REQUIRED'
  | 'RECONCILIATION_SCHEMA_MISMATCH'
  | 'RECONCILIATION_ACTION_INTENT_MISMATCH'
  | 'RECONCILIATION_CORRELATION_MISMATCH'
  | 'RECONCILIATION_TIME_INVALID'
  | 'RECONCILIATION_TIME_ORDER_INVALID'
  | 'EFFECT_ALREADY_OBSERVED'
  | 'RECONCILIATION_INDETERMINATE'
  | 'RETRY_ATTEMPT_LIMIT_REACHED'
  | 'RETRY_GUARDS_REQUIRED'
  | 'RETRY_GUARDS_TIME_INVALID'
  | 'RETRY_GUARDS_STALE'
  | 'RETRY_GUARDS_ATTEMPT_MISMATCH'
  | 'RETRY_GUARDS_BLOCKED';

export type ReconciliationResult = Readonly<{
  kind: 'EXECUTION_RECONCILIATION_RESULT';
  schemaVersion: ContractVersion;
  actionIntentId: ActionIntent['actionIntentId'];
  state:
    | 'STILL_UNCERTAIN'
    | 'EFFECT_OBSERVED'
    | 'NO_EFFECT_CONFIRMED_RETRY_BLOCKED'
    | 'NO_EFFECT_CONFIRMED_RETRY_ELIGIBLE';
  reasons: readonly ReconciliationReason[];
  reconciliationRequired: boolean;
  retryEligibleAfterFreshGuards: boolean;
  nextAttemptNumber?: number;
  /** W07-F can make retry eligibility explicit but never authorizes the retry itself. */
  authorizesExecution: false;
}>;

export type ReadbackReconciliationHint = Readonly<{
  state: 'EFFECT_OBSERVED' | 'INDETERMINATE';
  reason: 'READBACK_MATCH_OBSERVED' | 'READBACK_NOT_SUFFICIENT_TO_RESOLVE';
  /** A readback hint never promotes Evidence to VERIFIED and never authorizes execution. */
  authorizesExecution: false;
}>;

export type ReadbackResultForReconciliation = CaptureReadbackEvidenceResult;
