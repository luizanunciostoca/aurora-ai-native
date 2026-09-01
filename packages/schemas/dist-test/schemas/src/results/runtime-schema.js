'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.validateCanonicalError = validateCanonicalError;
exports.validateExecutionResult = validateExecutionResult;
const results_1 = require('@aurora/contracts/results');
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const PUBLIC_SECRET_PATTERNS = [
  /-----BEGIN [^-\r\n]*PRIVATE KEY-----/i,
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_=.-]{8,}/i,
  /(?:^|\s)at\s+[^\s]+\s*\([^\r\n]+:\d+:\d+\)/,
];
const FORBIDDEN_DETAIL_KEY_PARTS = [
  'authorization',
  'cookie',
  'password',
  'passwd',
  'secret',
  'token',
  'apikey',
  'credential',
  'privatekey',
  'stack',
  'rawresponse',
  'providerpayload',
];
const CANONICAL_ERROR_FIELDS = new Set([
  'kind',
  'schemaVersion',
  'code',
  'category',
  'message',
  'retryability',
  'correlationId',
  'cause',
  'details',
  'timestamp',
  'classification',
]);
const EXECUTION_RESULT_FIELDS = new Set([
  'kind',
  'schemaVersion',
  'outcome',
  'correlationId',
  'timestamp',
  'error',
]);
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function normalizeDetailKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}
function containsUnsafePublicText(value) {
  return PUBLIC_SECRET_PATTERNS.some((pattern) => pattern.test(value));
}
function isRfc3339Timestamp(value) {
  return (
    typeof value === 'string' && RFC3339_PATTERN.test(value) && Number.isFinite(Date.parse(value))
  );
}
function pushUnknownFields(input, allowed, path, issues) {
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      issues.push({
        code: 'UNKNOWN_FIELD',
        path: `${path}.${key}`,
        message: 'Unknown public contract field is not allowed.',
      });
    }
  }
}
function validateSafeDetailValue(value, path, issues, depth = 0) {
  if (depth > 4) {
    issues.push({
      code: 'UNSAFE_DETAIL',
      path,
      message: 'Error detail nesting exceeds the public safety limit.',
    });
    return false;
  }
  if (value === null || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return true;
    issues.push({ code: 'UNSAFE_DETAIL', path, message: 'Non-finite numbers are not allowed.' });
    return false;
  }
  if (typeof value === 'string') {
    if (value.length <= 2048 && !containsUnsafePublicText(value)) return true;
    issues.push({
      code: 'UNSAFE_DETAIL',
      path,
      message: 'Detail text is too long or contains unsafe credential/stack material.',
    });
    return false;
  }
  if (Array.isArray(value)) {
    if (value.length > 32) {
      issues.push({
        code: 'UNSAFE_DETAIL',
        path,
        message: 'Error detail arrays may contain at most 32 values.',
      });
      return false;
    }
    let valid = true;
    for (let index = 0; index < value.length; index += 1) {
      if (!validateSafeDetailValue(value[index], `${path}[${index}]`, issues, depth + 1)) {
        valid = false;
      }
    }
    return valid;
  }
  if (!isRecord(value)) {
    issues.push({
      code: 'UNSAFE_DETAIL',
      path,
      message: 'Only JSON-safe structured detail values are allowed.',
    });
    return false;
  }
  const entries = Object.entries(value);
  if (entries.length > 32) {
    issues.push({
      code: 'UNSAFE_DETAIL',
      path,
      message: 'Error detail objects may contain at most 32 fields.',
    });
    return false;
  }
  let valid = true;
  for (const [key, nested] of entries) {
    const normalized = normalizeDetailKey(key);
    if (FORBIDDEN_DETAIL_KEY_PARTS.some((part) => normalized.includes(part))) {
      issues.push({
        code: 'UNSAFE_DETAIL',
        path: `${path}.${key}`,
        message:
          'Secret-bearing, raw-provider or stack fields are forbidden in public error details.',
      });
      valid = false;
      continue;
    }
    if (!validateSafeDetailValue(nested, `${path}.${key}`, issues, depth + 1)) {
      valid = false;
    }
  }
  return valid;
}
function validateCauseReference(value, path, issues) {
  if (!isRecord(value)) {
    issues.push({ code: 'INVALID_CAUSE_REFERENCE', path, message: 'Cause must be an object.' });
    return;
  }
  const keys = Object.keys(value);
  if (keys.some((key) => key !== 'kind' && key !== 'reference')) {
    issues.push({
      code: 'INVALID_CAUSE_REFERENCE',
      path,
      message: 'Cause contains unsupported fields.',
    });
  }
  if (!['ERROR', 'DEPENDENCY', 'PROVIDER', 'REQUEST'].includes(String(value.kind))) {
    issues.push({
      code: 'INVALID_CAUSE_REFERENCE',
      path: `${path}.kind`,
      message: 'Unknown cause kind.',
    });
  }
  if (
    typeof value.reference !== 'string' ||
    value.reference.length < 1 ||
    value.reference.length > 256 ||
    containsUnsafePublicText(value.reference)
  ) {
    issues.push({
      code: 'INVALID_CAUSE_REFERENCE',
      path: `${path}.reference`,
      message: 'Cause reference must be a short, safe, non-secret opaque reference.',
    });
  }
}
function validateCanonicalError(input, primitives) {
  const issues = [];
  if (!isRecord(input)) {
    return {
      success: false,
      issues: [{ code: 'INVALID_TYPE', path: '$', message: 'CanonicalError must be an object.' }],
    };
  }
  pushUnknownFields(input, CANONICAL_ERROR_FIELDS, '$', issues);
  if (input.kind !== 'CanonicalError') {
    issues.push({ code: 'INVALID_LITERAL', path: '$.kind', message: 'Expected CanonicalError.' });
  }
  if (!primitives.contractVersion(input.schemaVersion)) {
    issues.push({
      code: 'UNSUPPORTED_VERSION',
      path: '$.schemaVersion',
      message: 'Unsupported canonical contract version.',
    });
  }
  if (!primitives.correlationId(input.correlationId)) {
    issues.push({
      code: 'INVALID_CORRELATION',
      path: '$.correlationId',
      message: 'Invalid canonical correlation identifier.',
    });
  }
  const code = typeof input.code === 'string' ? input.code : '';
  const definition = results_1.ERROR_CODE_DEFINITIONS[code];
  if (!definition) {
    issues.push({
      code: 'UNKNOWN_ERROR_CODE',
      path: '$.code',
      message: 'Unknown canonical error code.',
    });
  } else {
    if (input.category !== definition.category) {
      issues.push({
        code: 'ERROR_POLICY_MISMATCH',
        path: '$.category',
        message: 'Error category does not match the canonical code definition.',
      });
    }
    if (input.retryability !== definition.retryability) {
      issues.push({
        code: 'ERROR_POLICY_MISMATCH',
        path: '$.retryability',
        message: 'Retry classification does not match the canonical code definition.',
      });
    }
  }
  if (
    typeof input.message !== 'string' ||
    input.message.length < 1 ||
    input.message.length > 512 ||
    containsUnsafePublicText(input.message)
  ) {
    issues.push({
      code: 'UNSAFE_PUBLIC_TEXT',
      path: '$.message',
      message:
        'Public error message must be short, sanitized and free of credential/stack material.',
    });
  }
  if (!isRfc3339Timestamp(input.timestamp)) {
    issues.push({
      code: 'INVALID_TIMESTAMP',
      path: '$.timestamp',
      message: 'Timestamp must be a valid RFC3339 instant.',
    });
  }
  if (input.cause !== undefined) {
    validateCauseReference(input.cause, '$.cause', issues);
  }
  if (input.details !== undefined) {
    validateSafeDetailValue(input.details, '$.details', issues);
  }
  if (input.classification !== undefined) {
    if (!primitives.dataClassification) {
      issues.push({
        code: 'CLASSIFICATION_VALIDATOR_REQUIRED',
        path: '$.classification',
        message: 'A canonical W01-D data-classification validator is required for this field.',
      });
    } else if (!primitives.dataClassification(input.classification)) {
      issues.push({
        code: 'INVALID_CLASSIFICATION',
        path: '$.classification',
        message: 'Invalid canonical data classification.',
      });
    }
  }
  if (issues.length > 0) return { success: false, issues };
  return {
    success: true,
    data: input,
  };
}
function validateExecutionResult(input, primitives) {
  const issues = [];
  if (!isRecord(input)) {
    return {
      success: false,
      issues: [{ code: 'INVALID_TYPE', path: '$', message: 'ExecutionResult must be an object.' }],
    };
  }
  pushUnknownFields(input, EXECUTION_RESULT_FIELDS, '$', issues);
  if (input.kind !== 'ExecutionResult') {
    issues.push({ code: 'INVALID_LITERAL', path: '$.kind', message: 'Expected ExecutionResult.' });
  }
  const versionValid = primitives.contractVersion(input.schemaVersion);
  if (!versionValid) {
    issues.push({
      code: 'UNSUPPORTED_VERSION',
      path: '$.schemaVersion',
      message: 'Unsupported canonical contract version.',
    });
  }
  const correlationValid = primitives.correlationId(input.correlationId);
  if (!correlationValid) {
    issues.push({
      code: 'INVALID_CORRELATION',
      path: '$.correlationId',
      message: 'Invalid canonical correlation identifier.',
    });
  }
  if (!isRfc3339Timestamp(input.timestamp)) {
    issues.push({
      code: 'INVALID_TIMESTAMP',
      path: '$.timestamp',
      message: 'Timestamp must be a valid RFC3339 instant.',
    });
  }
  const outcome = typeof input.outcome === 'string' ? input.outcome : '';
  if (!results_1.EXECUTION_OUTCOMES.includes(outcome)) {
    issues.push({
      code: 'INVALID_LITERAL',
      path: '$.outcome',
      message: 'Unknown canonical execution outcome.',
    });
  }
  const requiresError = ['REJECTED', 'EXECUTION_UNCERTAIN', 'FAILED'].includes(outcome);
  const forbidsError = ['NOT_ATTEMPTED', 'EXECUTED_ACKNOWLEDGED', 'VERIFIED'].includes(outcome);
  if (requiresError && input.error === undefined) {
    issues.push({
      code: 'INVALID_OUTCOME_SEMANTICS',
      path: '$.error',
      message: `${outcome} requires a canonical error payload.`,
    });
  }
  if (forbidsError && input.error !== undefined) {
    issues.push({
      code: 'INVALID_OUTCOME_SEMANTICS',
      path: '$.error',
      message: `${outcome} must not carry an error payload.`,
    });
  }
  if (input.error !== undefined) {
    const errorValidation = validateCanonicalError(input.error, primitives);
    if (!errorValidation.success) {
      for (const issue of errorValidation.issues) {
        issues.push({ ...issue, path: `$.error${issue.path.slice(1)}` });
      }
    } else {
      const error = errorValidation.data;
      if (versionValid && !Object.is(error.schemaVersion, input.schemaVersion)) {
        issues.push({
          code: 'VERSION_MISMATCH',
          path: '$.error.schemaVersion',
          message: 'Nested error must propagate the execution result schemaVersion.',
        });
      }
      if (correlationValid && !Object.is(error.correlationId, input.correlationId)) {
        issues.push({
          code: 'CORRELATION_MISMATCH',
          path: '$.error.correlationId',
          message: 'Nested error must propagate the execution result correlationId.',
        });
      }
      if (
        outcome === 'EXECUTION_UNCERTAIN' &&
        (error.code !== 'EXECUTION_UNCERTAIN' ||
          error.category !== 'EXECUTION_UNCERTAIN' ||
          error.retryability !== 'RECONCILE_BEFORE_RETRY')
      ) {
        issues.push({
          code: 'INVALID_OUTCOME_SEMANTICS',
          path: '$.error',
          message:
            'EXECUTION_UNCERTAIN requires the canonical uncertain error and RECONCILE_BEFORE_RETRY.',
        });
      }
      if (
        outcome === 'FAILED' &&
        (error.code === 'EXECUTION_UNCERTAIN' ||
          error.category === 'EXECUTION_UNCERTAIN' ||
          error.retryability === 'RECONCILE_BEFORE_RETRY')
      ) {
        issues.push({
          code: 'INVALID_OUTCOME_SEMANTICS',
          path: '$.error',
          message: 'FAILED must never encode unresolved execution uncertainty.',
        });
      }
    }
  }
  if (issues.length > 0) return { success: false, issues };
  return {
    success: true,
    data: input,
  };
}
