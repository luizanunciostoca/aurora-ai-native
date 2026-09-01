'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const results_1 = require('@aurora/contracts/results');
const runtime_schema_1 = require('./runtime-schema');
const primitives = {
  contractVersion: (value) => value === '1.0.0',
  correlationId: (value) => typeof value === 'string' && /^cor_[A-Za-z0-9_-]{3,64}$/.test(value),
  dataClassification: (value) => value === 'INTERNAL' || value === 'CONFIDENTIAL',
};
function assert(condition, message) {
  if (!condition) throw new Error(`W01-E contract test failed: ${message}`);
}
function assertSuccess(result, message) {
  assert(result.success, message);
  return result.data;
}
function assertFailureCode(result, code, message) {
  assert(!result.success, `${message}: expected failure`);
  assert(
    result.issues.some((issue) => issue.code === code),
    `${message}: missing ${code}`,
  );
}
function makeError(code = 'VALIDATION_ERROR', correlationId = 'cor_test_001') {
  const definition = results_1.ERROR_CODE_DEFINITIONS[code];
  return {
    kind: 'CanonicalError',
    schemaVersion: '1.0.0',
    code,
    category: definition.category,
    message: 'A safe public error message.',
    retryability: definition.retryability,
    correlationId,
    timestamp: '2026-08-29T23:30:00Z',
    classification: 'INTERNAL',
    details: { field: 'displayName', count: 1, nested: { safe: true } },
  };
}
function testKnownCodes() {
  for (const code of Object.keys(results_1.ERROR_CODE_DEFINITIONS)) {
    assertSuccess(
      (0, runtime_schema_1.validateCanonicalError)(makeError(code), primitives),
      `known code ${code}`,
    );
  }
  const unknown = { ...makeError(), code: 'SOMETHING_NEW' };
  assertFailureCode(
    (0, runtime_schema_1.validateCanonicalError)(unknown, primitives),
    'UNKNOWN_ERROR_CODE',
    'unknown error code must fail closed',
  );
}
function testUnknownVersion() {
  const unknownVersion = { ...makeError(), schemaVersion: '2.0.0' };
  assertFailureCode(
    (0, runtime_schema_1.validateCanonicalError)(unknownVersion, primitives),
    'UNSUPPORTED_VERSION',
    'unknown wire version',
  );
}
function testUnsafeDetailHandling() {
  const unsafeDetail = {
    ...makeError(),
    details: { authorization: 'Bearer super-secret-token-value' },
  };
  assertFailureCode(
    (0, runtime_schema_1.validateCanonicalError)(unsafeDetail, primitives),
    'UNSAFE_DETAIL',
    'authorization detail must be rejected',
  );
  const stackLeak = {
    ...makeError(),
    stack: 'Error: provider failed\n    at executor (/srv/app.js:10:2)',
  };
  assertFailureCode(
    (0, runtime_schema_1.validateCanonicalError)(stackLeak, primitives),
    'UNKNOWN_FIELD',
    'stack trace top-level field must be rejected',
  );
  const unsafeMessage = {
    ...makeError(),
    message: 'Provider rejected Authorization: Bearer abcdefghijklmnop',
  };
  assertFailureCode(
    (0, runtime_schema_1.validateCanonicalError)(unsafeMessage, primitives),
    'UNSAFE_PUBLIC_TEXT',
    'credential-like public message must be rejected',
  );
}
function testRetryClassification() {
  for (const code of Object.keys(results_1.ERROR_CODE_DEFINITIONS)) {
    const canonical = makeError(code);
    assertSuccess(
      (0, runtime_schema_1.validateCanonicalError)(canonical, primitives),
      `${code} canonical retry policy`,
    );
    const alternatives = [
      'DO_NOT_RETRY',
      'RETRY_AFTER_GUARDS',
      'RETRY_AFTER_BACKOFF_AND_GUARDS',
      'RECONCILE_BEFORE_RETRY',
    ];
    const wrong = alternatives.find((candidate) => candidate !== canonical.retryability);
    assert(wrong !== undefined, `${code} must have an alternative retry class for negative test`);
    assertFailureCode(
      (0, runtime_schema_1.validateCanonicalError)(
        { ...canonical, retryability: wrong },
        primitives,
      ),
      'ERROR_POLICY_MISMATCH',
      `${code} wrong retry classification`,
    );
  }
  assert(
    results_1.ERROR_CODE_DEFINITIONS.EXECUTION_UNCERTAIN.retryability === 'RECONCILE_BEFORE_RETRY',
    'EXECUTION_UNCERTAIN must require reconciliation before retry',
  );
  assert(
    results_1.ERROR_CODE_DEFINITIONS.TIMEOUT_BEFORE_EXECUTION.retryability === 'RETRY_AFTER_GUARDS',
    'only timeout explicitly known to be before execution may be retry-eligible without uncertainty',
  );
}
function testUncertainState() {
  const uncertainError = {
    ...makeError('EXECUTION_UNCERTAIN'),
    code: 'EXECUTION_UNCERTAIN',
    category: 'EXECUTION_UNCERTAIN',
    retryability: 'RECONCILE_BEFORE_RETRY',
  };
  const uncertain = {
    kind: 'ExecutionResult',
    schemaVersion: '1.0.0',
    outcome: 'EXECUTION_UNCERTAIN',
    correlationId: 'cor_test_001',
    timestamp: '2026-08-29T23:31:00Z',
    error: uncertainError,
  };
  assertSuccess(
    (0, runtime_schema_1.validateExecutionResult)(uncertain, primitives),
    'valid uncertain execution state',
  );
  const uncertainAsFailed = { ...uncertain, outcome: 'FAILED' };
  assertFailureCode(
    (0, runtime_schema_1.validateExecutionResult)(uncertainAsFailed, primitives),
    'INVALID_OUTCOME_SEMANTICS',
    'uncertainty must never collapse into FAILED',
  );
  const wrongUncertainError = makeError('INTERNAL_ERROR');
  const uncertainWithWrongError = { ...uncertain, error: wrongUncertainError };
  assertFailureCode(
    (0, runtime_schema_1.validateExecutionResult)(uncertainWithWrongError, primitives),
    'INVALID_OUTCOME_SEMANTICS',
    'uncertain outcome requires canonical uncertain error',
  );
}
function testOutcomeVocabulary() {
  const expected = [
    'NOT_ATTEMPTED',
    'REJECTED',
    'EXECUTED_ACKNOWLEDGED',
    'EXECUTION_UNCERTAIN',
    'VERIFIED',
    'FAILED',
  ];
  assert(
    JSON.stringify(results_1.EXECUTION_OUTCOMES) === JSON.stringify(expected),
    'canonical outcome vocabulary',
  );
  const unknownOutcome = {
    kind: 'ExecutionResult',
    schemaVersion: '1.0.0',
    outcome: 'SUCCEEDED_BUT_UNVERIFIED',
    correlationId: 'cor_test_001',
    timestamp: '2026-08-29T23:31:00Z',
  };
  assertFailureCode(
    (0, runtime_schema_1.validateExecutionResult)(unknownOutcome, primitives),
    'INVALID_LITERAL',
    'unknown execution outcome must fail closed',
  );
}
function testSerialization() {
  const original = makeError('DEPENDENCY_UNAVAILABLE');
  const serialized = JSON.stringify(original);
  const parsed = JSON.parse(serialized);
  const validated = assertSuccess(
    (0, runtime_schema_1.validateCanonicalError)(parsed, primitives),
    'serialized CanonicalError round trip',
  );
  assert(
    JSON.stringify(validated) === serialized,
    'CanonicalError round trip must preserve wire shape',
  );
  const result = {
    kind: 'ExecutionResult',
    schemaVersion: '1.0.0',
    outcome: 'REJECTED',
    correlationId: 'cor_test_001',
    timestamp: '2026-08-29T23:32:00Z',
    error: makeError('POLICY_DENIED'),
  };
  const resultWire = JSON.stringify(result);
  assertSuccess(
    (0, runtime_schema_1.validateExecutionResult)(JSON.parse(resultWire), primitives),
    'serialized ExecutionResult round trip',
  );
}
function testCorrelationPropagation() {
  const result = {
    kind: 'ExecutionResult',
    schemaVersion: '1.0.0',
    outcome: 'REJECTED',
    correlationId: 'cor_parent_001',
    timestamp: '2026-08-29T23:33:00Z',
    error: makeError('POLICY_DENIED', 'cor_child_002'),
  };
  assertFailureCode(
    (0, runtime_schema_1.validateExecutionResult)(result, primitives),
    'CORRELATION_MISMATCH',
    'nested error must propagate parent correlation id',
  );
}
function run() {
  testKnownCodes();
  testUnknownVersion();
  testUnsafeDetailHandling();
  testRetryClassification();
  testUncertainState();
  testOutcomeVocabulary();
  testSerialization();
  testCorrelationPropagation();
  console.log('W01-E contract tests: PASS');
}
run();
