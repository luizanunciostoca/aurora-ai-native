export {
  ERROR_CATEGORIES,
  ERROR_CODE_DEFINITIONS,
  RETRY_CLASSIFICATIONS,
} from './error-semantics.js';
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
} from './error-semantics.js';

export { EXECUTION_OUTCOMES } from './execution-semantics.js';
export type {
  AcknowledgedExecutionResult,
  ExecutionOutcome,
  ExecutionResult,
  FailedExecutionResult,
  NotAttemptedExecutionResult,
  RejectedExecutionResult,
  UncertainExecutionResult,
  VerifiedExecutionResult,
} from './execution-semantics.js';
