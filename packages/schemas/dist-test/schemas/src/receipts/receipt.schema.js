'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ReceiptSchema = void 0;
const internal_validation_1 = require('../actions/internal-validation');
function parse(input, dependencies) {
  const record = (0, internal_validation_1.asRecord)(input, 'Receipt');
  (0, internal_validation_1.exactKeys)(
    record,
    [
      'kind',
      'schemaVersion',
      'receiptId',
      'actionIntentId',
      'executionId',
      'executor',
      'provider',
      'attempt',
      'attemptedAt',
      'acknowledgedAt',
      'returnedAt',
      'providerReference',
      'executionOutcome',
      'correlation',
      'rawProviderDataReference',
      'metadata',
    ],
    [
      'kind',
      'schemaVersion',
      'receiptId',
      'actionIntentId',
      'executor',
      'provider',
      'attempt',
      'attemptedAt',
      'correlation',
    ],
    'Receipt',
  );
  if (record.kind !== 'RECEIPT') throw new TypeError('Receipt.kind: expected RECEIPT');
  if (!Number.isSafeInteger(record.attempt) || record.attempt < 1) {
    throw new TypeError('Receipt.attempt: expected positive safe integer');
  }
  const executor = (0, internal_validation_1.asRecord)(record.executor, 'Receipt.executor');
  (0, internal_validation_1.exactKeys)(
    executor,
    ['executor', 'instanceReference'],
    ['executor'],
    'Receipt.executor',
  );
  const provider = (0, internal_validation_1.asRecord)(record.provider, 'Receipt.provider');
  (0, internal_validation_1.exactKeys)(
    provider,
    ['provider', 'accountReference'],
    ['provider'],
    'Receipt.provider',
  );
  const attemptedAt = (0, internal_validation_1.timestamp)(
    record.attemptedAt,
    'Receipt.attemptedAt',
  );
  const acknowledgedAt =
    record.acknowledgedAt === undefined
      ? undefined
      : (0, internal_validation_1.timestamp)(record.acknowledgedAt, 'Receipt.acknowledgedAt');
  const returnedAt =
    record.returnedAt === undefined
      ? undefined
      : (0, internal_validation_1.timestamp)(record.returnedAt, 'Receipt.returnedAt');
  if (acknowledgedAt && Date.parse(acknowledgedAt) < Date.parse(attemptedAt)) {
    throw new TypeError('Receipt.acknowledgedAt: cannot precede attemptedAt');
  }
  if (returnedAt && Date.parse(returnedAt) < Date.parse(attemptedAt)) {
    throw new TypeError('Receipt.returnedAt: cannot precede attemptedAt');
  }
  if (acknowledgedAt && returnedAt && Date.parse(returnedAt) < Date.parse(acknowledgedAt)) {
    throw new TypeError('Receipt.returnedAt: cannot precede acknowledgedAt');
  }
  const instanceReference = (0, internal_validation_1.optionalNonEmptyString)(
    executor.instanceReference,
    'Receipt.executor.instanceReference',
    512,
  );
  const accountReference = (0, internal_validation_1.optionalNonEmptyString)(
    provider.accountReference,
    'Receipt.provider.accountReference',
    512,
  );
  const executionId =
    record.executionId === undefined
      ? undefined
      : dependencies.parseExecutionId(record.executionId);
  const providerReference =
    record.providerReference === undefined
      ? undefined
      : (0, internal_validation_1.externalReference)(
          record.providerReference,
          'Receipt.providerReference',
        );
  const executionOutcome =
    record.executionOutcome === undefined
      ? undefined
      : dependencies.parseExecutionOutcome(record.executionOutcome);
  const rawProviderDataReference =
    record.rawProviderDataReference === undefined
      ? undefined
      : (0, internal_validation_1.externalReference)(
          record.rawProviderDataReference,
          'Receipt.rawProviderDataReference',
        );
  const metadata =
    record.metadata === undefined
      ? undefined
      : (0, internal_validation_1.restrictedMetadata)(record.metadata, 'Receipt.metadata');
  return {
    kind: 'RECEIPT',
    schemaVersion: dependencies.parseContractVersion(record.schemaVersion),
    receiptId: dependencies.parseReceiptId(record.receiptId),
    actionIntentId: dependencies.parseActionIntentId(record.actionIntentId),
    ...(executionId === undefined ? {} : { executionId }),
    executor: {
      executor: (0, internal_validation_1.nonEmptyString)(
        executor.executor,
        'Receipt.executor.executor',
        256,
      ),
      ...(instanceReference === undefined ? {} : { instanceReference }),
    },
    provider: {
      provider: (0, internal_validation_1.nonEmptyString)(
        provider.provider,
        'Receipt.provider.provider',
        128,
      ),
      ...(accountReference === undefined ? {} : { accountReference }),
    },
    attempt: record.attempt,
    attemptedAt,
    ...(acknowledgedAt === undefined ? {} : { acknowledgedAt }),
    ...(returnedAt === undefined ? {} : { returnedAt }),
    ...(providerReference === undefined ? {} : { providerReference }),
    ...(executionOutcome === undefined ? {} : { executionOutcome }),
    correlation: dependencies.parseCorrelationContext(record.correlation),
    ...(rawProviderDataReference === undefined ? {} : { rawProviderDataReference }),
    ...(metadata === undefined ? {} : { metadata }),
  };
}
exports.ReceiptSchema = Object.freeze({ parse });
