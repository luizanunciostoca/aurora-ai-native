import type {
  ActorRef,
  CorrelationContext,
  DataClassification,
  TenantContext,
} from '@aurora/contracts/context';
import type {
  ActionIntentId,
  DecisionId,
  EvidenceId,
  ExecutionId,
  PolicyTokenId,
  ReceiptId,
} from '@aurora/contracts/ids';
import type { ExecutionOutcome } from '@aurora/contracts/results';
import type { ContractVersion } from '@aurora/contracts/versioning';
import { ActionIntentSchema, type ActionIntentSchemaDependencies } from '../actions';
import { EvidenceSchema, type EvidenceSchemaDependencies } from '../evidence';
import { ReceiptSchema, type ReceiptSchemaDependencies } from '../receipts';
import { ExecutionTargetReferenceSchema } from './execution-target-reference.schema';

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

const parseContractVersion = (input: unknown): ContractVersion => {
  if (input !== '1.0.0') throw new TypeError('unsupported ContractVersion');
  return input as ContractVersion;
};

const prefixed = <T>(prefix: string, input: unknown): T => {
  if (typeof input !== 'string' || !input.startsWith(`${prefix}_`)) {
    throw new TypeError(`expected ${prefix}_ prefixed ID`);
  }
  return input as T;
};

const parseCorrelationContext = (input: unknown): CorrelationContext => {
  if (input === null || typeof input !== 'object') throw new TypeError('invalid correlation');
  prefixed('cor', (input as { correlationId?: unknown }).correlationId);
  return input as CorrelationContext;
};

const actionDependencies: ActionIntentSchemaDependencies = {
  parseContractVersion,
  parseActionIntentId: (input) => prefixed<ActionIntentId>('act', input),
  parseTenantContext(input) {
    if (input === null || typeof input !== 'object') throw new TypeError('invalid tenant');
    prefixed('ten', (input as { tenantId?: unknown }).tenantId);
    return input as TenantContext;
  },
  parseActorRef(input) {
    if (input === null || typeof input !== 'object') throw new TypeError('invalid actor');
    prefixed('idn', (input as { identityId?: unknown }).identityId);
    return input as ActorRef;
  },
  parseCorrelationContext,
  parseDataClassification: (input) => input as DataClassification,
  parsePolicyTokenId: (input) => prefixed<PolicyTokenId>('ptk', input),
  parseDecisionId: (input) => prefixed<DecisionId>('dec', input),
};

const canonicalOutcomes = new Set([
  'NOT_ATTEMPTED',
  'REJECTED',
  'EXECUTED_ACKNOWLEDGED',
  'EXECUTION_UNCERTAIN',
  'VERIFIED',
  'FAILED',
]);

const receiptDependencies: ReceiptSchemaDependencies = {
  parseContractVersion,
  parseReceiptId: (input) => prefixed<ReceiptId>('rcp', input),
  parseActionIntentId: (input) => prefixed<ActionIntentId>('act', input),
  parseExecutionId: (input) => prefixed<ExecutionId>('exe', input),
  parseCorrelationContext,
  parseExecutionOutcome(input) {
    if (!canonicalOutcomes.has(String(input))) throw new TypeError('unsupported ExecutionOutcome');
    return input as ExecutionOutcome;
  },
};

const evidenceDependencies: EvidenceSchemaDependencies = {
  parseContractVersion,
  parseEvidenceId: (input) => prefixed<EvidenceId>('evd', input),
  parseActionIntentId: (input) => prefixed<ActionIntentId>('act', input),
  parseReceiptId: (input) => prefixed<ReceiptId>('rcp', input),
  parseExecutionId: (input) => prefixed<ExecutionId>('exe', input),
  parseActorRef: (input) => input as ActorRef,
  parseCorrelationContext,
  parseDataClassification: (input) => input as DataClassification,
};

const providerTarget = {
  schemaVersion: '1.0.0',
  kind: 'PROVIDER',
  provider: 'meta',
  targetType: 'comment',
  targetReference: 'comment-123',
  accountReference: 'page-123',
} as const;
const deviceTarget = {
  schemaVersion: '1.0.0',
  kind: 'DEVICE',
  bindingReference: 'device-binding:tablet-primary',
} as const;

const parsedDevice = ExecutionTargetReferenceSchema.parse(deviceTarget, { parseContractVersion });
assert(parsedDevice.kind === 'DEVICE', 'DEVICE target must parse without provider identity');
const parsedProvider = ExecutionTargetReferenceSchema.parse(providerTarget, { parseContractVersion });
assert(parsedProvider.kind === 'PROVIDER', 'PROVIDER target must preserve provider provenance');
expectThrows(
  () =>
    ExecutionTargetReferenceSchema.parse(
      { ...deviceTarget, provider: 'fake-provider' },
      { parseContractVersion },
    ),
  'provider: unknown field',
);
expectThrows(
  () =>
    ExecutionTargetReferenceSchema.parse(
      { ...deviceTarget, credential: 'secret' },
      { parseContractVersion },
    ),
  'credential: unknown field',
);
expectThrows(
  () =>
    ExecutionTargetReferenceSchema.parse(
      {
        schemaVersion: '1.0.0',
        kind: 'LOCAL_SERVICE',
        bindingReference: 'local-service:renderer',
        command: 'rm -rf /',
      },
      { parseContractVersion },
    ),
  'command: unknown field',
);

const baseIntent = {
  kind: 'ACTION_INTENT',
  schemaVersion: '1.0.0',
  actionIntentId: 'act_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  capability: { capability: 'example.action', actionType: 'EXECUTE' },
  tenant: { tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAW' },
  actor: { identityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAX', kind: 'AGENT' },
  requestOrigin: { identityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAY', kind: 'HUMAN' },
  correlation: { correlationId: 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAZ' },
  resolvedParameters: {},
  idempotency: { mode: 'REQUIRED', key: 'w07a:test' },
  preconditions: [],
  deadlineAt: '2026-09-01T16:00:00Z',
  authority: { kind: 'POLICY_TOKEN', policyTokenId: 'ptk_test' },
  dataClassification: 'INTERNAL',
} as const;

const legacyIntentInput = {
  ...baseIntent,
  providerBinding: { provider: 'meta', targetType: 'comment', targetReference: 'comment-123' },
};
const legacyIntent = ActionIntentSchema.parse(legacyIntentInput, actionDependencies);
assert(legacyIntent.executionTarget === undefined, 'legacy provider ActionIntent must round-trip unchanged');
assert(
  JSON.stringify(ActionIntentSchema.parse(JSON.parse(JSON.stringify(legacyIntent)), actionDependencies)) ===
    JSON.stringify(legacyIntent),
  'legacy ActionIntent serialization must remain stable',
);
const deviceIntent = ActionIntentSchema.parse(
  { ...baseIntent, executionTarget: deviceTarget },
  actionDependencies,
);
assert(deviceIntent.executionTarget?.kind === 'DEVICE', 'ActionIntent must accept DEVICE target');
const matchingProviderIntent = ActionIntentSchema.parse(
  {
    ...legacyIntentInput,
    executionTarget: {
      schemaVersion: '1.0.0',
      kind: 'PROVIDER',
      provider: 'meta',
      targetType: 'comment',
      targetReference: 'comment-123',
    },
  },
  actionDependencies,
);
assert(matchingProviderIntent.executionTarget?.kind === 'PROVIDER', 'matching legacy/new PROVIDER refs parse');
expectThrows(
  () =>
    ActionIntentSchema.parse(
      { ...legacyIntentInput, executionTarget: deviceTarget },
      actionDependencies,
    ),
  'conflicts with legacy providerBinding',
);
expectThrows(
  () =>
    ActionIntentSchema.parse(
      {
        ...legacyIntentInput,
        executionTarget: { ...providerTarget, targetReference: 'different-comment' },
      },
      actionDependencies,
    ),
  'conflicts with legacy providerBinding',
);

const baseReceipt = {
  kind: 'RECEIPT',
  schemaVersion: '1.0.0',
  receiptId: 'rcp_01ARZ3NDEKTSV4RRFFQ69G5FB1',
  actionIntentId: baseIntent.actionIntentId,
  executor: { executor: 'generic-executor' },
  attempt: 1,
  attemptedAt: '2026-09-01T15:10:00Z',
  correlation: baseIntent.correlation,
} as const;
const legacyReceipt = ReceiptSchema.parse(
  { ...baseReceipt, provider: { provider: 'meta', accountReference: 'page-123' } },
  receiptDependencies,
);
assert('provider' in legacyReceipt, 'legacy provider Receipt must remain parseable');
const deviceReceipt = ReceiptSchema.parse(
  { ...baseReceipt, executionTarget: deviceTarget },
  receiptDependencies,
);
assert(deviceReceipt.executionTarget?.kind === 'DEVICE', 'DEVICE Receipt must not require fake provider');
expectThrows(
  () =>
    ReceiptSchema.parse(
      { ...baseReceipt, executionTarget: deviceTarget, provider: { provider: 'fake' } },
      receiptDependencies,
    ),
  'forbidden for non-PROVIDER executionTarget',
);
expectThrows(
  () =>
    ReceiptSchema.parse(
      {
        ...baseReceipt,
        executionTarget: deviceTarget,
        providerReference: { system: 'provider', reference: 'fake' },
      },
      receiptDependencies,
    ),
  'provider-specific references forbidden',
);
expectThrows(
  () =>
    ReceiptSchema.parse(
      {
        ...baseReceipt,
        executionTarget: providerTarget,
        provider: { provider: 'google', accountReference: 'page-123' },
      },
      receiptDependencies,
    ),
  'conflicts with PROVIDER executionTarget',
);

const baseEvidence = {
  kind: 'EVIDENCE',
  schemaVersion: '1.0.0',
  evidenceId: 'evd_01ARZ3NDEKTSV4RRFFQ69G5FC1',
  subject: { kind: 'RECEIPT', receiptId: baseReceipt.receiptId },
  evidenceType: 'READBACK',
  capturedAt: '2026-09-01T15:11:00Z',
  correlation: baseIntent.correlation,
  verification: { state: 'UNVERIFIED' },
  provenance: { sourceReference: { system: 'executor', reference: 'w07a-test' } },
  dataClassification: 'INTERNAL',
} as const;
const legacyEvidence = EvidenceSchema.parse(
  {
    ...baseEvidence,
    source: { sourceType: 'PROVIDER_READBACK', provider: 'meta' },
  },
  evidenceDependencies,
);
assert(legacyEvidence.source.sourceType === 'PROVIDER_READBACK', 'legacy provider evidence parses');
const targetEvidence = EvidenceSchema.parse(
  {
    ...baseEvidence,
    evidenceType: 'EXECUTION_RECEIPT',
    source: { sourceType: 'TARGET_READBACK', executionTarget: deviceTarget },
  },
  evidenceDependencies,
);
assert(targetEvidence.source.executionTarget?.kind === 'DEVICE', 'generic target evidence preserves target');
expectThrows(
  () =>
    EvidenceSchema.parse(
      { ...baseEvidence, source: { sourceType: 'TARGET_READBACK' } },
      evidenceDependencies,
    ),
  'required for TARGET_READBACK',
);
expectThrows(
  () =>
    EvidenceSchema.parse(
      {
        ...baseEvidence,
        source: { sourceType: 'TARGET_READBACK', executionTarget: deviceTarget, provider: 'fake' },
      },
      evidenceDependencies,
    ),
  'only valid for PROVIDER_READBACK',
);
expectThrows(
  () =>
    EvidenceSchema.parse(
      {
        ...baseEvidence,
        source: { sourceType: 'PROVIDER_READBACK', executionTarget: deviceTarget },
      },
      evidenceDependencies,
    ),
  'requires PROVIDER target',
);
