import type { CanonicalError } from './error-semantics';

/**
 * Canonical execution outcome vocabulary owned exclusively by W01-E.
 *
 * VERIFIED is the only state that proves the intended external effect.
 * EXECUTED_ACKNOWLEDGED must never be treated as VERIFIED.
 * EXECUTION_UNCERTAIN must never be collapsed into FAILED.
 */
export const EXECUTION_OUTCOMES = [
  'NOT_ATTEMPTED',
  'REJECTED',
  'EXECUTED_ACKNOWLEDGED',
  'EXECUTION_UNCERTAIN',
  'VERIFIED',
  'FAILED',
] as const;

export type ExecutionOutcome = (typeof EXECUTION_OUTCOMES)[number];

interface ExecutionResultBase<TContractVersion, TCorrelationId> {
  readonly kind: 'ExecutionResult';
  readonly schemaVersion: TContractVersion;
  readonly correlationId: TCorrelationId;
  /** RFC3339 time at which this result fact was recorded. */
  readonly timestamp: string;
}

export interface NotAttemptedExecutionResult<
  TContractVersion,
  TCorrelationId,
> extends ExecutionResultBase<TContractVersion, TCorrelationId> {
  readonly outcome: 'NOT_ATTEMPTED';
  readonly error?: never;
}

export interface RejectedExecutionResult<
  TContractVersion,
  TCorrelationId,
  TDataClassification = never,
> extends ExecutionResultBase<TContractVersion, TCorrelationId> {
  /** Rejected before an external side effect was attempted. */
  readonly outcome: 'REJECTED';
  readonly error: CanonicalError<TContractVersion, TCorrelationId, TDataClassification>;
}

export interface AcknowledgedExecutionResult<
  TContractVersion,
  TCorrelationId,
> extends ExecutionResultBase<TContractVersion, TCorrelationId> {
  /**
   * Execution/provider acknowledgement exists, but evidence is insufficient to
   * claim the intended external state is verified.
   */
  readonly outcome: 'EXECUTED_ACKNOWLEDGED';
  readonly error?: never;
}

export interface UncertainExecutionResult<
  TContractVersion,
  TCorrelationId,
  TDataClassification = never,
> extends ExecutionResultBase<TContractVersion, TCorrelationId> {
  /**
   * An external write may have occurred, but available evidence cannot prove
   * final state. Reconciliation/readback is required before equivalent retry.
   */
  readonly outcome: 'EXECUTION_UNCERTAIN';
  readonly error: CanonicalError<TContractVersion, TCorrelationId, TDataClassification> & {
    readonly code: 'EXECUTION_UNCERTAIN';
    readonly category: 'EXECUTION_UNCERTAIN';
    readonly retryability: 'RECONCILE_BEFORE_RETRY';
  };
}

export interface VerifiedExecutionResult<
  TContractVersion,
  TCorrelationId,
> extends ExecutionResultBase<TContractVersion, TCorrelationId> {
  /** Sufficient authoritative evidence proves the intended external effect. */
  readonly outcome: 'VERIFIED';
  readonly error?: never;
}

export interface FailedExecutionResult<
  TContractVersion,
  TCorrelationId,
  TDataClassification = never,
> extends ExecutionResultBase<TContractVersion, TCorrelationId> {
  /**
   * Sufficient evidence proves the intended execution did not succeed or a
   * terminal failure is known. Ambiguous writes are not FAILED.
   */
  readonly outcome: 'FAILED';
  readonly error: CanonicalError<TContractVersion, TCorrelationId, TDataClassification> & {
    readonly code: Exclude<
      CanonicalError<TContractVersion, TCorrelationId, TDataClassification>['code'],
      'EXECUTION_UNCERTAIN'
    >;
    readonly category: Exclude<
      CanonicalError<TContractVersion, TCorrelationId, TDataClassification>['category'],
      'EXECUTION_UNCERTAIN'
    >;
    readonly retryability: Exclude<
      CanonicalError<TContractVersion, TCorrelationId, TDataClassification>['retryability'],
      'RECONCILE_BEFORE_RETRY'
    >;
  };
}

export type ExecutionResult<TContractVersion, TCorrelationId, TDataClassification = never> =
  | NotAttemptedExecutionResult<TContractVersion, TCorrelationId>
  | RejectedExecutionResult<TContractVersion, TCorrelationId, TDataClassification>
  | AcknowledgedExecutionResult<TContractVersion, TCorrelationId>
  | UncertainExecutionResult<TContractVersion, TCorrelationId, TDataClassification>
  | VerifiedExecutionResult<TContractVersion, TCorrelationId>
  | FailedExecutionResult<TContractVersion, TCorrelationId, TDataClassification>;
