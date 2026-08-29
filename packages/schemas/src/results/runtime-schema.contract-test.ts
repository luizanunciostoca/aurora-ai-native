import {
  ERROR_CODE_DEFINITIONS,
  EXECUTION_OUTCOMES,
  type CanonicalError,
  type ErrorCode,
  type ExecutionResult,
  type RetryClassification,
} from '../../../contracts/src/results';
import {
  validateCanonicalError,
  validateExecutionResult,
  type ResultsPrimitiveValidators,
  type ResultsValidationResult,
} from './runtime-schema';

type TestContractVersion = '1.0.0';
type TestCorrelationId = `cor_${string}`;
type TestClassification = 'INTERNAL' | 'CONFIDENTIAL';

const primitives: ResultsPrimitiveValidators<
  TestContractVersion,
  TestCorrelationId,
  TestClassification
> = {
  contractVersion: (value): value is TestContractVersion => value === '1.0.0',
  correlationId: (value): value is TestCorrelationId =>
    typeof value === 'string' && /^cor_[A-Za-z0-9_-]{3,64}$/.test(value),
  dataClassification: (value): value is TestClassification =>
    value === 'INTERNAL' || value === 'CONFIDENTIAL',
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`W01-E contract test failed: ${message}`);
}

function assertSuccess<T>(result: ResultsValidationResult<T>, message: string): T {
  assert(result.success, message);
  return result.data;
}

function assertFailureCode<T>(
  result: ResultsValidationResult<T>,
  code: string,
  message: string,
): void {
  assert(!result.success, `${message}: expected failure`);
  assert(result.issues.some((issue) => issue.code === code), `${message}: missing ${code}`);
}

function makeError(
  code: ErrorCode = 'VALIDATION_ERROR',
  correlationId: TestCorrelationId = 'cor_test_001',
): CanonicalError<TestContractVersion, TestCorrelationId, TestClassification> {
  const definition = ERROR_CODE_DEFINITIONS[code];
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

function testKnownCodes(): void {
  for (const code of Object.keys(ERROR_CODE_DEFINITIONS) as ErrorCode[]) {
    assertSuccess(validateCanonicalError(makeError(code), primitives), `known code ${code}`);
  }

  const unknown = { ...makeError(), code: 'SOMETHING_NEW' };
  assertFailureCode(
    validateCanonicalError(unknown, primitives),
    'UNKNOWN_ERROR_CODE',
    'unknown error code must fail closed',
  );
}

function testUnknownVersion(): void {
  const unknownVersion = { ...makeError(), schemaVersion: '2.0.0' };
  assertFailureCode(
    validateCanonicalError(unknownVersion, primitives),
    'UNSUPPORTED_VERSION',
    'unknown wire version',
  );
}

function testUnsafeDetailHandling(): void {
  const unsafeDetail = {
    ...makeError(),
    details: { authorization: 'Bearer super-secret-token-value' },
  };
  assertFailureCode(
    validateCanonicalError(unsafeDetail, primitives),
    'UNSAFE_DETAIL',
    'authorization detail must be rejected',
  );

  const stackLeak = {
    ...makeError(),
    stack: 'Error: provider failed\n    at executor (/srv/app.js:10:2)',
  };
  assertFailureCode(
    validateCanonicalError(stackLeak, primitives),
    'UNKNOWN_FIELD',
    'stack trace top-level field must be rejected',
  );

  const unsafeMessage = {
    ...makeError(),
    message: 'Provider rejected Authorization: Bearer abcdefghijklmnop',
  };
  assertFailureCode(
    validateCanonicalError(unsafeMessage, primitives),
    'UNSAFE_PUBLIC_TEXT',
    'credential-like public message must be rejected',
  );
}

function testRetryClassification(): void {
  for (const code of Object.keys(ERROR_CODE_DEFINITIONS) as ErrorCode[]) {
    const canonical = makeError(code);
    assertSuccess(validateCanonicalError(canonical, primitives), `${code} canonical retry policy`);

    const alternatives: RetryClassification[] = [
      'DO_NOT_RETRY',
      'RETRY_AFTER_GUARDS',
      'RETRY_AFTER_BACKOFF_AND_GUARDS',
      'RECONCILE_BEFORE_RETRY',
    ];
    const wrong = alternatives.find((candidate) => candidate !== canonical.retryability);
    assert(wrong !== undefined, `${code} must have an alternative retry class for negative test`);

    assertFailureCode(
      validateCanonicalError({ ...canonical, retryability: wrong }, primitives),
      'ERROR_POLICY_MISMATCH',
      `${code} wrong retry classification`,
    );
  }

  assert(
    ERROR_CODE_DEFINITIONS.EXECUTION_UNCERTAIN.retryability === 'RECONCILE_BEFORE_RETRY',
    'EXECUTION_UNCERTAIN must require reconciliation before retry',
  );
  assert(
    ERROR_CODE_DEFINITIONS.TIMEOUT_BEFORE_EXECUTION.retryability === 'RETRY_AFTER_GUARDS',
    'only timeout explicitly known to be before execution may be retry-eligible without uncertainty',
  );
}

function testUncertainState(): void {
  const uncertainError = makeError('EXECUTION_UNCERTAIN');
  const uncertain: ExecutionResult<TestContractVersion, TestCorrelationId, TestClassification> = {
    kind: 'ExecutionResult',
    schemaVersion: '1.0.0',
    outcome: 'EXECUTION_UNCERTAIN',
    correlationId: 'cor_test_001',
    timestamp: '2026-08-29T23:31:00Z',
    error: uncertainError,
  };
  assertSuccess(validateExecutionResult(uncertain, primitives), 'valid uncertain execution state');

  const uncertainAsFailed = { ...uncertain, outcome: 'FAILED' };
  assertFailureCode(
    validateExecutionResult(uncertainAsFailed, primitives),
    'INVALID_OUTCOME_SEMANTICS',
    'uncertainty must never collapse into FAILED',
  );

  const wrongUncertainError = makeError('INTERNAL_ERROR');
  const uncertainWithWrongError = { ...uncertain, error: wrongUncertainError };
  assertFailureCode(
    validateExecutionResult(uncertainWithWrongError, primitives),
    'INVALID_OUTCOME_SEMANTICS',
    'uncertain outcome requires canonical uncertain error',
  );
}

function testOutcomeVocabulary(): void {
  const expected = [
    'NOT_ATTEMPTED',
    'REJECTED',
    'EXECUTED_ACKNOWLEDGED',
    'EXECUTION_UNCERTAIN',
    'VERIFIED',
    'FAILED',
  ];
  assert(JSON.stringify(EXECUTION_OUTCOMES) === JSON.stringify(expected), 'canonical outcome vocabulary');

  const unknownOutcome = {
    kind: 'ExecutionResult',
    schemaVersion: '1.0.0',
    outcome: 'SUCCEEDED_BUT_UNVERIFIED',
    correlationId: 'cor_test_001',
    timestamp: '2026-08-29T23:31:00Z',
  };
  assertFailureCode(
    validateExecutionResult(unknownOutcome, primitives),
    'INVALID_LITERAL',
    'unknown execution outcome must fail closed',
  );
}

function testSerialization(): void {
  const original = makeError('DEPENDENCY_UNAVAILABLE');
  const serialized = JSON.stringify(original);
  const parsed: unknown = JSON.parse(serialized);
  const validated = assertSuccess(
    validateCanonicalError(parsed, primitives),
    'serialized CanonicalError round trip',
  );
  assert(JSON.stringify(validated) === serialized, 'CanonicalError round trip must preserve wire shape');

  const result: ExecutionResult<TestContractVersion, TestCorrelationId, TestClassification> = {
    kind: 'ExecutionResult',
    schemaVersion: '1.0.0',
    outcome: 'REJECTED',
    correlationId: 'cor_test_001',
    timestamp: '2026-08-29T23:32:00Z',
    error: makeError('POLICY_DENIED'),
  };
  const resultWire = JSON.stringify(result);
  assertSuccess(
    validateExecutionResult(JSON.parse(resultWire) as unknown, primitives),
    'serialized ExecutionResult round trip',
  );
}

function testCorrelationPropagation(): void {
  const result = {
    kind: 'ExecutionResult',
    schemaVersion: '1.0.0',
    outcome: 'REJECTED',
    correlationId: 'cor_parent_001',
    timestamp: '2026-08-29T23:33:00Z',
    error: makeError('POLICY_DENIED', 'cor_child_002'),
  };
  assertFailureCode(
    validateExecutionResult(result, primitives),
    'CORRELATION_MISMATCH',
    'nested error must propagate parent correlation id',
  );
}

function run(): void {
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
