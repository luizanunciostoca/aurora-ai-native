import type { Receipt } from '../../../contracts/src/receipts/index.js';
import type { ActionIntentId, ExecutionId, ReceiptId } from '../../../contracts/src/ids/index.js';
import type { CorrelationContext } from '../../../contracts/src/context/index.js';
import type { ExecutionOutcome } from '../../../contracts/src/results/index.js';
import type { ContractVersion } from '../../../contracts/src/versioning/index.js';
import {
  asRecord,
  exactKeys,
  externalReference,
  nonEmptyString,
  optionalNonEmptyString,
  restrictedMetadata,
  timestamp,
  type DependencyParser,
} from '../actions/internal-validation.js';

export interface ReceiptSchemaDependencies {
  readonly parseContractVersion: DependencyParser<ContractVersion>;
  readonly parseReceiptId: DependencyParser<ReceiptId>;
  readonly parseActionIntentId: DependencyParser<ActionIntentId>;
  readonly parseExecutionId: DependencyParser<ExecutionId>;
  readonly parseCorrelationContext: DependencyParser<CorrelationContext>;
  readonly parseExecutionOutcome: DependencyParser<ExecutionOutcome>;
}

function parse(input: unknown, dependencies: ReceiptSchemaDependencies): Receipt {
  const record = asRecord(input, 'Receipt');
  exactKeys(
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
  if (!Number.isSafeInteger(record.attempt) || (record.attempt as number) < 1) {
    throw new TypeError('Receipt.attempt: expected positive safe integer');
  }

  const executor = asRecord(record.executor, 'Receipt.executor');
  exactKeys(executor, ['executor', 'instanceReference'], ['executor'], 'Receipt.executor');
  const provider = asRecord(record.provider, 'Receipt.provider');
  exactKeys(provider, ['provider', 'accountReference'], ['provider'], 'Receipt.provider');

  const attemptedAt = timestamp(record.attemptedAt, 'Receipt.attemptedAt');
  const acknowledgedAt =
    record.acknowledgedAt === undefined
      ? undefined
      : timestamp(record.acknowledgedAt, 'Receipt.acknowledgedAt');
  const returnedAt =
    record.returnedAt === undefined ? undefined : timestamp(record.returnedAt, 'Receipt.returnedAt');
  if (acknowledgedAt && Date.parse(acknowledgedAt) < Date.parse(attemptedAt)) {
    throw new TypeError('Receipt.acknowledgedAt: cannot precede attemptedAt');
  }
  if (returnedAt && Date.parse(returnedAt) < Date.parse(attemptedAt)) {
    throw new TypeError('Receipt.returnedAt: cannot precede attemptedAt');
  }
  if (acknowledgedAt && returnedAt && Date.parse(returnedAt) < Date.parse(acknowledgedAt)) {
    throw new TypeError('Receipt.returnedAt: cannot precede acknowledgedAt');
  }

  return {
    kind: 'RECEIPT',
    schemaVersion: dependencies.parseContractVersion(record.schemaVersion),
    receiptId: dependencies.parseReceiptId(record.receiptId),
    actionIntentId: dependencies.parseActionIntentId(record.actionIntentId),
    executionId:
      record.executionId === undefined ? undefined : dependencies.parseExecutionId(record.executionId),
    executor: {
      executor: nonEmptyString(executor.executor, 'Receipt.executor.executor', 256),
      instanceReference: optionalNonEmptyString(
        executor.instanceReference,
        'Receipt.executor.instanceReference',
        512,
      ),
    },
    provider: {
      provider: nonEmptyString(provider.provider, 'Receipt.provider.provider', 128),
      accountReference: optionalNonEmptyString(
        provider.accountReference,
        'Receipt.provider.accountReference',
        512,
      ),
    },
    attempt: record.attempt as number,
    attemptedAt,
    acknowledgedAt,
    returnedAt,
    providerReference:
      record.providerReference === undefined
        ? undefined
        : externalReference(record.providerReference, 'Receipt.providerReference'),
    executionOutcome:
      record.executionOutcome === undefined
        ? undefined
        : dependencies.parseExecutionOutcome(record.executionOutcome),
    correlation: dependencies.parseCorrelationContext(record.correlation),
    rawProviderDataReference:
      record.rawProviderDataReference === undefined
        ? undefined
        : externalReference(record.rawProviderDataReference, 'Receipt.rawProviderDataReference'),
    metadata:
      record.metadata === undefined ? undefined : restrictedMetadata(record.metadata, 'Receipt.metadata'),
  } as Receipt;
}

export const ReceiptSchema = Object.freeze({ parse });
