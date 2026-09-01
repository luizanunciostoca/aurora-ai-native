'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const receipt_schema_1 = require('./receipt.schema');
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function expectThrows(fn, contains) {
  try {
    fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(contains), `expected error containing "${contains}", got "${message}"`);
    return;
  }
  throw new Error(`expected function to throw: ${contains}`);
}
const prefixed = (prefix, input) => {
  if (typeof input !== 'string' || !input.startsWith(`${prefix}_`)) {
    throw new TypeError(`expected ${prefix}_ prefixed ID`);
  }
  return input;
};
const canonicalOutcomes = new Set([
  'NOT_ATTEMPTED',
  'REJECTED',
  'EXECUTED_ACKNOWLEDGED',
  'EXECUTION_UNCERTAIN',
  'VERIFIED',
  'FAILED',
]);
const dependencies = {
  parseContractVersion(input) {
    if (input !== '1.0.0') throw new TypeError('unsupported ContractVersion');
    return input;
  },
  parseReceiptId: (input) => prefixed('rcp', input),
  parseActionIntentId: (input) => prefixed('act', input),
  parseExecutionId: (input) => prefixed('exe', input),
  parseCorrelationContext(input) {
    if (input === null || typeof input !== 'object') throw new TypeError('invalid correlation');
    prefixed('cor', input.correlationId);
    return input;
  },
  parseExecutionOutcome(input) {
    if (!canonicalOutcomes.has(String(input))) {
      throw new TypeError('unsupported ExecutionOutcome');
    }
    return input;
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
  executionOutcome: 'EXECUTED_ACKNOWLEDGED',
  correlation: { correlationId: 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAZ' },
  rawProviderDataReference: {
    system: 'object-store',
    reference: 'provider/meta/receipt-456.json',
  },
  metadata: { responseClass: 'provider-ack' },
};
const parsed = receipt_schema_1.ReceiptSchema.parse(validReceipt, dependencies);
assert(
  parsed.actionIntentId === validReceipt.actionIntentId,
  'Receipt must link to canonical ActionIntent',
);
assert(
  parsed.executionOutcome === 'EXECUTED_ACKNOWLEDGED',
  'Receipt provider acknowledgement must not imply VERIFIED external state',
);
const roundTrip = receipt_schema_1.ReceiptSchema.parse(
  JSON.parse(JSON.stringify(parsed)),
  dependencies,
);
assert(
  JSON.stringify(roundTrip) === JSON.stringify(parsed),
  'Receipt serialization round trip must be stable',
);
const withoutIntent = JSON.parse(JSON.stringify(validReceipt));
delete withoutIntent.actionIntentId;
expectThrows(
  () => receipt_schema_1.ReceiptSchema.parse(withoutIntent, dependencies),
  'actionIntentId: missing required field',
);
expectThrows(
  () =>
    receipt_schema_1.ReceiptSchema.parse(
      { ...validReceipt, externalEffectVerified: true },
      dependencies,
    ),
  'externalEffectVerified: unknown field',
);
expectThrows(
  () =>
    receipt_schema_1.ReceiptSchema.parse(
      { ...validReceipt, executionOutcome: 'SUCCEEDED' },
      dependencies,
    ),
  'unsupported ExecutionOutcome',
);
expectThrows(
  () => receipt_schema_1.ReceiptSchema.parse({ ...validReceipt, attempt: 0 }, dependencies),
  'expected positive safe integer',
);
expectThrows(
  () =>
    receipt_schema_1.ReceiptSchema.parse(
      { ...validReceipt, returnedAt: '2026-08-29T23:19:59-03:00' },
      dependencies,
    ),
  'cannot precede attemptedAt',
);
expectThrows(
  () =>
    receipt_schema_1.ReceiptSchema.parse(
      { ...validReceipt, attemptedAt: 'not-a-time' },
      dependencies,
    ),
  'expected valid RFC3339 timestamp',
);
expectThrows(
  () =>
    receipt_schema_1.ReceiptSchema.parse(
      { ...validReceipt, correlation: { correlationId: 'invalid-correlation' } },
      dependencies,
    ),
  'expected cor_ prefixed ID',
);
