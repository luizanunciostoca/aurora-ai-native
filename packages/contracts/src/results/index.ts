export {
  ERROR_CATEGORIES,
  ERROR_CODE_DEFINITIONS,
  RETRY_CLASSIFICATIONS,
} from './error-semantics.ts';
export type {
  AuroraError,
  CanonicalError,
  ErrorCategory,
  ErrorCauseKind,
  ErrorCauseReference,
  ErrorCode,
  RetryClassification,
  SafeErrorDetails,
  SafeErrorDetailValue,
} from './error-semantics.ts';

export { EXECUTION_OUTCOMES } from './execution-semantics.ts';
export type {
  AcknowledgedExecutionResult,
  ExecutionOutcome,
  ExecutionResult,
  FailedExecutionResult,
  NotAttemptedExecutionResult,
  RejectedExecutionResult,
  UncertainExecutionResult,
  VerifiedExecutionResult,
} from './execution-semantics.ts';
