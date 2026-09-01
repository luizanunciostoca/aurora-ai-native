import type { CorrelationContext } from '@aurora/contracts/context';
import type { ExecutionTargetReference } from '@aurora/contracts/execution-target';
import type { ActionIntentId, ExecutionId, ReceiptId } from '@aurora/contracts/ids';
import type { Receipt, ReceiptProviderReference } from '@aurora/contracts/receipts';
import type { ExecutionOutcome } from '@aurora/contracts/results';
import type { ContractVersion } from '@aurora/contracts/versioning';
import { ExecutionTargetReferenceSchema } from '../execution-target';
import {
  asRecord,
  exactKeys,
  externalReference,
  nonEmptyString,
  optionalNonEmptyString,
  restrictedMetadata,
  timestamp,
  type DependencyParser,
} from '../actions/internal-validation';

export interface ReceiptSchemaDependencies {
  readonly parseContractVersion: DependencyParser<ContractVersion>;
  readonly parseReceiptId: DependencyParser<ReceiptId>;
  readonly parseActionIntentId: DependencyParser<ActionIntentId>;
  readonly parseExecutionId: DependencyParser<ExecutionId>;
  readonly parseCorrelationContext: DependencyParser<CorrelationContext>;
  readonly parseExecutionOutcome: DependencyParser<ExecutionOutcome>;
}

function parseProvider(input: unknown, path: string): ReceiptProviderReference {
  const provider = asRecord(input, path);
  exactKeys(provider, ['provider', 'accountReference'], ['provider'], path);
  const accountReference = optionalNonEmptyString(
    provider.accountReference,
    `${path}.accountReference`,
    512,
  );
  return {
    provider: nonEmptyString(provider.provider, `${path}.provider`, 128),
    ...(accountReference === undefined ? {} : { accountReference }),
  };
}

function validateTargetProviderCompatibility(
  target: ExecutionTargetReference | undefined,
  provider: ReceiptProviderReference | undefined,
  providerReferencePresent: boolean,
  rawProviderDataReferencePresent: boolean,
): void {
  if (!target) {
    if (!provider) {
      throw new TypeError('Receipt.provider: required for legacy receipt without executionTarget');
    }
    return;
  }
  if (target.kind !== 'PROVIDER') {
    if (provider) {
      throw new TypeError('Receipt.provider: forbidden for non-PROVIDER executionTarget');
    }
    if (providerReferencePresent || rawProviderDataReferencePresent) {
      throw new TypeError(
        'Receipt: provider-specific references forbidden for non-PROVIDER executionTarget',
      );
    }
    return;
  }
  if (provider && provider.provider !== target.provider) {
    throw new TypeError('Receipt.provider: conflicts with PROVIDER executionTarget');
  }
  if (
    provider?.accountReference !== undefined &&
    target.accountReference !== undefined &&
    provider.accountReference !== target.accountReference
  ) {
    throw new TypeError('Receipt.provider.accountReference: conflicts with executionTarget');
  }
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
      'executionTarget',
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
  const instanceReference = optionalNonEmptyString(
    executor.instanceReference,
    'Receipt.executor.instanceReference',
    512,
  );
  const provider =
    record.provider === undefined ? undefined : parseProvider(record.provider, 'Receipt.provider');
  const executionTarget =
    record.executionTarget === undefined
      ? undefined
      : ExecutionTargetReferenceSchema.parse(
          record.executionTarget,
          { parseContractVersion: dependencies.parseContractVersion },
          'Receipt.executionTarget',
        );

  const attemptedAt = timestamp(record.attemptedAt, 'Receipt.attemptedAt');
  const acknowledgedAt =
    record.acknowledgedAt === undefined
      ? undefined
      : timestamp(record.acknowledgedAt, 'Receipt.acknowledgedAt');
  const returnedAt =
    record.returnedAt === undefined
      ? undefined
      : timestamp(record.returnedAt, 'Receipt.returnedAt');
  if (acknowledgedAt && Date.parse(acknowledgedAt) < Date.parse(attemptedAt)) {
    throw new TypeError('Receipt.acknowledgedAt: cannot precede attemptedAt');
  }
  if (returnedAt && Date.parse(returnedAt) < Date.parse(attemptedAt)) {
    throw new TypeError('Receipt.returnedAt: cannot precede attemptedAt');
  }
  if (
    acknowledgedAt &&
    returnedAt &&
    Date.parse(returnedAt) < Date.parse(acknowledgedAt)
  ) {
    throw new TypeError('Receipt.returnedAt: cannot precede acknowledgedAt');
  }

  validateTargetProviderCompatibility(
    executionTarget,
    provider,
    record.providerReference !== undefined,
    record.rawProviderDataReference !== undefined,
  );

  const executionId =
    record.executionId === undefined
      ? undefined
      : dependencies.parseExecutionId(record.executionId);
  const providerReference =
    record.providerReference === undefined
      ? undefined
      : externalReference(record.providerReference, 'Receipt.providerReference');
  const executionOutcome =
    record.executionOutcome === undefined
      ? undefined
      : dependencies.parseExecutionOutcome(record.executionOutcome);
  const rawProviderDataReference =
    record.rawProviderDataReference === undefined
      ? undefined
      : externalReference(record.rawProviderDataReference, 'Receipt.rawProviderDataReference');
  const metadata =
    record.metadata === undefined
      ? undefined
      : restrictedMetadata(record.metadata, 'Receipt.metadata');

  const base = {
    kind: 'RECEIPT' as const,
    schemaVersion: dependencies.parseContractVersion(record.schemaVersion),
    receiptId: dependencies.parseReceiptId(record.receiptId),
    actionIntentId: dependencies.parseActionIntentId(record.actionIntentId),
    ...(executionId === undefined ? {} : { executionId }),
    executor: {
      executor: nonEmptyString(executor.executor, 'Receipt.executor.executor', 256),
      ...(instanceReference === undefined ? {} : { instanceReference }),
    },
    attempt: record.attempt as number,
    attemptedAt,
    ...(acknowledgedAt === undefined ? {} : { acknowledgedAt }),
    ...(returnedAt === undefined ? {} : { returnedAt }),
    ...(executionOutcome === undefined ? {} : { executionOutcome }),
    correlation: dependencies.parseCorrelationContext(record.correlation),
    ...(metadata === undefined ? {} : { metadata }),
  };

  if (executionTarget === undefined) {
    if (!provider) throw new TypeError('Receipt.provider: required for legacy receipt');
    return {
      ...base,
      provider,
      ...(providerReference === undefined ? {} : { providerReference }),
      ...(rawProviderDataReference === undefined ? {} : { rawProviderDataReference }),
    };
  }

  return {
    ...base,
    executionTarget,
    ...(provider === undefined ? {} : { provider }),
    ...(providerReference === undefined ? {} : { providerReference }),
    ...(rawProviderDataReference === undefined ? {} : { rawProviderDataReference }),
  };
}

export const ReceiptSchema = Object.freeze({ parse });
