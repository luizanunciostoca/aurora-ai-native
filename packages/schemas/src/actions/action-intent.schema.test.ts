import type {
  ActionIntentId,
  OwnerDecisionId,
  PolicyTokenId,
  TenantId,
} from '../../../contracts/src/ids/index.js';
import type {
  CorrelationContext,
  DataClassification,
  IdentityReference,
} from '../../../contracts/src/context/index.js';
import type { ContractVersion } from '../../../contracts/src/versioning/index.js';
import { ActionIntentSchema, type ActionIntentSchemaDependencies } from './action-intent.schema.js';

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

const dependencies: ActionIntentSchemaDependencies = {
  parseContractVersion(input) {
    if (input !== '1.0.0') throw new TypeError('unsupported ContractVersion');
    return input as ContractVersion;
  },
  parseActionIntentId: (input) => prefixed<ActionIntentId>('act', input),
  parseTenantId: (input) => prefixed<TenantId>('ten', input),
  parseIdentityReference(input) {
    if (input === null || typeof input !== 'object') throw new TypeError('invalid identity');
    const value = input as { identityId?: unknown; kind?: unknown };
    prefixed('idn', value.identityId);
    if (!['HUMAN', 'AGENT', 'SERVICE', 'SYSTEM'].includes(String(value.kind))) {
      throw new TypeError('invalid identity kind');
    }
    return input as IdentityReference;
  },
  parseCorrelationContext(input) {
    if (input === null || typeof input !== 'object') throw new TypeError('invalid correlation');
    const value = input as { correlationId?: unknown };
    prefixed('cor', value.correlationId);
    return input as CorrelationContext;
  },
  parseDataClassification(input) {
    if (!['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'].includes(String(input))) {
      throw new TypeError('invalid classification');
    }
    return input as DataClassification;
  },
  parsePolicyTokenId: (input) => prefixed<PolicyTokenId>('ptk', input),
  parseOwnerDecisionId: (input) => prefixed<OwnerDecisionId>('odc', input),
};

const validIntent = {
  kind: 'ACTION_INTENT',
  schemaVersion: '1.0.0',
  actionIntentId: 'act_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  capability: { capability: 'instagram.comment.reply', actionType: 'CREATE_REPLY' },
  providerBinding: { provider: 'meta', targetType: 'comment', targetReference: 'comment-123' },
  tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAW',
  actor: { identityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAX', kind: 'AGENT' },
  requestOrigin: { identityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAY', kind: 'HUMAN' },
  correlation: { correlationId: 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAZ' },
  resolvedParameters: { text: 'Obrigado!', postId: 'post-123' },
  idempotency: { mode: 'REQUIRED', key: 'instagram:comment-123:reply-v1' },
  preconditions: [{ preconditionType: 'COMMENT_EXISTS', parameters: { commentId: 'comment-123' } }],
  expectedState: { stateType: 'REPLY_PRESENT', value: { commentId: 'comment-123' } },
  deadlineAt: '2026-08-29T23:30:00-03:00',
  authority: { kind: 'POLICY_TOKEN', policyTokenId: 'ptk_01ARZ3NDEKTSV4RRFFQ69G5FB0' },
  executionClassification: {
    riskClassificationRef: 'risk:external-write',
    sideEffectClassificationRef: 'side-effect:write-external',
  },
  dataClassification: 'INTERNAL',
  metadata: { source: 'control-plane', retryable: false },
} as const;

const parsed = ActionIntentSchema.parse(validIntent, dependencies);
assert(
  parsed.actionIntentId === validIntent.actionIntentId,
  'valid ActionIntent must retain canonical ID',
);
assert(parsed.idempotency.mode === 'REQUIRED', 'valid ActionIntent must retain idempotency mode');

const roundTrip = ActionIntentSchema.parse(JSON.parse(JSON.stringify(parsed)), dependencies);
assert(
  JSON.stringify(roundTrip) === JSON.stringify(parsed),
  'ActionIntent serialization round trip must be stable',
);

expectThrows(
  () =>
    ActionIntentSchema.parse(
      { ...validIntent, resolvedParameters: ['ambiguous', 'array'] },
      dependencies,
    ),
  'resolvedParameters: expected object',
);

expectThrows(
  () =>
    ActionIntentSchema.parse({ ...validIntent, idempotency: { mode: 'REQUIRED' } }, dependencies),
  'idempotency.key: missing required field',
);

expectThrows(
  () =>
    ActionIntentSchema.parse(
      { ...validIntent, authority: { ...validIntent.authority, grantedAuthority: 'ADMIN' } },
      dependencies,
    ),
  'grantedAuthority: unknown field',
);

expectThrows(
  () => ActionIntentSchema.parse({ ...validIntent, schemaVersion: '2.0.0' }, dependencies),
  'unsupported ContractVersion',
);

expectThrows(
  () =>
    ActionIntentSchema.parse(
      { ...validIntent, correlation: { correlationId: 'not-canonical' } },
      dependencies,
    ),
  'expected cor_ prefixed ID',
);

expectThrows(
  () => ActionIntentSchema.parse({ ...validIntent, deadlineAt: 'tomorrow' }, dependencies),
  'expected valid RFC3339 timestamp',
);

expectThrows(
  () => ActionIntentSchema.parse({ ...validIntent, unexpected: true }, dependencies),
  'unexpected: unknown field',
);
