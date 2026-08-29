export const ERROR_CATEGORIES = [
  'VALIDATION',
  'AUTHENTICATION',
  'AUTHORIZATION',
  'POLICY_DENIED',
  'NOT_FOUND',
  'CONFLICT',
  'PRECONDITION_FAILED',
  'RATE_LIMITED',
  'DEPENDENCY_FAILURE',
  'TIMEOUT',
  'EXECUTION_UNCERTAIN',
  'INTERNAL',
] as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];

/**
 * Retry classifications are descriptive contract semantics, never execution
 * authority. Any retry still requires the caller's current idempotency,
 * policy, precondition, deadline and provider-safety guards.
 */
export const RETRY_CLASSIFICATIONS = [
  'DO_NOT_RETRY',
  'RETRY_AFTER_GUARDS',
  'RETRY_AFTER_BACKOFF_AND_GUARDS',
  'RECONCILE_BEFORE_RETRY',
] as const;

export type RetryClassification = (typeof RETRY_CLASSIFICATIONS)[number];

export const ERROR_CODE_DEFINITIONS = {
  VALIDATION_ERROR: {
    category: 'VALIDATION',
    retryability: 'DO_NOT_RETRY',
  },
  UNAUTHENTICATED: {
    category: 'AUTHENTICATION',
    retryability: 'DO_NOT_RETRY',
  },
  FORBIDDEN: {
    category: 'AUTHORIZATION',
    retryability: 'DO_NOT_RETRY',
  },
  POLICY_DENIED: {
    category: 'POLICY_DENIED',
    retryability: 'DO_NOT_RETRY',
  },
  NOT_FOUND: {
    category: 'NOT_FOUND',
    retryability: 'DO_NOT_RETRY',
  },
  CONFLICT: {
    category: 'CONFLICT',
    retryability: 'RETRY_AFTER_GUARDS',
  },
  PRECONDITION_FAILED: {
    category: 'PRECONDITION_FAILED',
    retryability: 'DO_NOT_RETRY',
  },
  RATE_LIMITED: {
    category: 'RATE_LIMITED',
    retryability: 'RETRY_AFTER_BACKOFF_AND_GUARDS',
  },
  DEPENDENCY_FAILURE: {
    category: 'DEPENDENCY_FAILURE',
    retryability: 'DO_NOT_RETRY',
  },
  DEPENDENCY_UNAVAILABLE: {
    category: 'DEPENDENCY_FAILURE',
    retryability: 'RETRY_AFTER_BACKOFF_AND_GUARDS',
  },
  TIMEOUT_BEFORE_EXECUTION: {
    category: 'TIMEOUT',
    retryability: 'RETRY_AFTER_GUARDS',
  },
  EXECUTION_UNCERTAIN: {
    category: 'EXECUTION_UNCERTAIN',
    retryability: 'RECONCILE_BEFORE_RETRY',
  },
  INTERNAL_ERROR: {
    category: 'INTERNAL',
    retryability: 'DO_NOT_RETRY',
  },
} as const satisfies Record<
  string,
  {
    readonly category: ErrorCategory;
    readonly retryability: RetryClassification;
  }
>;

export type ErrorCode = keyof typeof ERROR_CODE_DEFINITIONS;

export type ErrorCauseKind = 'ERROR' | 'DEPENDENCY' | 'PROVIDER' | 'REQUEST';

export interface ErrorCauseReference {
  readonly kind: ErrorCauseKind;
  /** Safe, opaque, non-secret reference. Never a raw provider payload. */
  readonly reference: string;
}

export type SafeErrorDetailValue =
  | string
  | number
  | boolean
  | null
  | readonly SafeErrorDetailValue[]
  | { readonly [key: string]: SafeErrorDetailValue };

export type SafeErrorDetails = Readonly<Record<string, SafeErrorDetailValue>>;

/**
 * Canonical public error payload.
 *
 * External primitives are generic deliberately: W01-F owns ContractVersion
 * and CorrelationId, while W01-D owns data-classification semantics. W01-E
 * must compose those authorities without redefining them locally.
 */
export interface CanonicalError<TContractVersion, TCorrelationId, TDataClassification = never> {
  readonly kind: 'CanonicalError';
  readonly schemaVersion: TContractVersion;
  readonly code: ErrorCode;
  readonly category: ErrorCategory;
  /** Sanitized/public-safe message only. Never a stack trace or raw provider response. */
  readonly message: string;
  readonly retryability: RetryClassification;
  readonly correlationId: TCorrelationId;
  readonly cause?: ErrorCauseReference;
  /** Safe structured diagnostics only; schema validation rejects secret-bearing material. */
  readonly details?: SafeErrorDetails;
  /** RFC3339 timestamp. */
  readonly timestamp: string;
  /** Optional W01-D data classification when that primitive is part of the enclosing boundary. */
  readonly classification?: TDataClassification;
}

/** Architecture-compatible alias retained as the error payload's domain name. */
export type AuroraError<
  TContractVersion,
  TCorrelationId,
  TDataClassification = never,
> = CanonicalError<TContractVersion, TCorrelationId, TDataClassification>;
