import type { ActionIntentId, ExecutionId, ReceiptId } from '../../../contracts/src/ids/index.js';
import type { CorrelationContext } from '../../../contracts/src/context/index.js';
import type { ExecutionOutcome } from '../../../contracts/src/results/index.js';
import type { ContractVersion } from '../../../contracts/src/versioning/index.js';
import { ReceiptSchema, type ReceiptSchemaDependencies } from './receipt.schema.js';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectThrows(fn: () => unknown, contains: string): void {
  try {
    fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(contains), `expected error containing "${contains}", got "${message}"`);
    return;
  }
  throw new Error(`expected function to throw: ${contains}`);
}

const prefixed = <T>(prefix: string, input: unknown): T => {
  if (typeof input !== 'string' || !input.startsWith(`${prefix}_`)) {
    throw new TypeError(`expected ${prefix}_ prefixed ID`);
  }
  return input as T;
};

const dependencies: ReceiptSchemaDependencies = {
  parseContractVersion(input) {
    if (input !== '1.0.0') throw new TypeError('unsupported ContractVersion');
    return input as ContractVersion;
  },
  parseReceiptId: (input) => prefixed<ReceiptId>('rcp', input),
  parseActionIntentId: (input) => prefixed<ActionIntentId>('act', input),
  parseExecutionId: (input) => prefixed<ExecutionId>('exe', input),
  parseCorrelationContext(input) {
    if (input === null || typeof input !== 'object') throw new TypeError('invalid correlation');
    prefixed('cor', (input as { correlationId?: unknown }).correlationId);
    return input as CorrelationContext;
  },
  parseExecutionOutcome(input) {
    if (!['SUCCEEDED', 'FAILED', 'REJECTED', 'CANCELLED', 'EXECUTION_UNCERTAIN'].includes(String(input))) {
      throw new TypeError('unsupported ExecutionOutcome');
    }
    return input as ExecutionOutcome;
  },
};

const validReceipt = {
  kind: 'RECEIPT',
  schemaVersion: '1.0.0',
  receiptId: 'rcp_01ARZ3NDEKTSV4RRFFQ69G5FB1',
  actionIntentId: 'act_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  executionId: 'exe_01ARZ3NDEKTSV4RRFFQ69G5FB2',
  executor: { executor: 'meta-write-executor', instanceReference: 'instance-a' },
  provider: { provider: 'meta', accountReference: 'page-123' },
  attempt: 1,
  attemptedAt: '2026-08-29T23:20:00-03:00',
  acknowledgedAt: '2026-08-29T23:20:01-03:00',
  returnedAt: '2026-08-29T23:20:02-03:00',
  providerReference: { system: 'meta', reference: 'reply-456' },
  executionOutcome: 'SUCCEEDED',
  correlation: { correlationId: 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAZ' },
  rawProviderDataReference: { system: 'object-store', reference: 'provider/meta/receipt-456.json' },
  metadata: { responseClass: 'provider-ack' },
} as const;

const parsed = ReceiptSchema.parse(validReceipt, dependencies);
assert(parsed.actionIntentId === validReceipt.actionIntentId, 'Receipt must link to canonical ActionIntent');
assert(parsed.executionOutcome === 'SUCCEEDED', 'Receipt must reuse canonical execution outcome semantics');

const roundTrip = ReceiptSchema.parse(JSON.parse(JSON.stringify(parsed)), dependencies);
assert(JSON.stringify(roundTrip) === JSON.stringify(parsed), 'Receipt serialization round trip must be stable');

const withoutIntent = JSON.parse(JSON.stringify(validReceipt)) as Record<string, unknown>;
delete withoutIntent.actionIntentId;
expectThrows(() => ReceiptSchema.parse(withoutIntent, dependencies), 'actionIntentId: missing required field');

expectThrows(
  () => ReceiptSchema.parse({ ...validReceipt, externalEffectVerified: true }, dependencies),
  'externalEffectVerified: unknown field',
);

expectThrows(
  () => ReceiptSchema.parse({ ...validReceipt, executionOutcome: 'VERIFIED' }, dependencies),
  'unsupported ExecutionOutcome',
);

expectThrows(
  () => ReceiptSchema.parse({ ...validReceipt, attempt: 0 }, dependencies),
  'expected positive safe integer',
);

expectThrows(
  () =>
    ReceiptSchema.parse(
      { ...validReceipt, returnedAt: '2026-08-29T23:19:59-03:00' },
      dependencies,
    ),
  'cannot precede attemptedAt',
);

expectThrows(
  () => ReceiptSchema.parse({ ...validReceipt, attemptedAt: 'not-a-time' }, dependencies),
  'expected valid RFC3339 timestamp',
);

expectThrows(
  () =>
    ReceiptSchema.parse(
      { ...validReceipt, correlation: { correlationId: 'invalid-correlation' } },
      dependencies,
    ),
  'expected cor_ prefixed ID',
);

