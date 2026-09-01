'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ERROR_CODE_DEFINITIONS = exports.RETRY_CLASSIFICATIONS = exports.ERROR_CATEGORIES = void 0;
exports.ERROR_CATEGORIES = [
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
];
/**
 * Retry classifications are descriptive contract semantics, never execution
 * authority. Any retry still requires the caller's current idempotency,
 * policy, precondition, deadline and provider-safety guards.
 */
exports.RETRY_CLASSIFICATIONS = [
  'DO_NOT_RETRY',
  'RETRY_AFTER_GUARDS',
  'RETRY_AFTER_BACKOFF_AND_GUARDS',
  'RECONCILE_BEFORE_RETRY',
];
exports.ERROR_CODE_DEFINITIONS = {
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
};
