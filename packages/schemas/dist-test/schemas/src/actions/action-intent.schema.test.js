'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const action_intent_schema_1 = require('./action-intent.schema');
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
const dependencies = {
  parseContractVersion(input) {
    if (input !== '1.0.0') throw new TypeError('unsupported ContractVersion');
    return input;
  },
  parseActionIntentId: (input) => prefixed('act', input),
  parseTenantContext(input) {
    if (input === null || typeof input !== 'object') throw new TypeError('invalid tenant');
    prefixed('ten', input.tenantId);
    return input;
  },
  parseActorRef(input) {
    if (input === null || typeof input !== 'object') throw new TypeError('invalid actor');
    const value = input;
    prefixed('idn', value.identityId);
    if (!['HUMAN', 'AGENT', 'SERVICE', 'SYSTEM'].includes(String(value.kind))) {
      throw new TypeError('invalid actor kind');
    }
    return input;
  },
  parseCorrelationContext(input) {
    if (input === null || typeof input !== 'object') throw new TypeError('invalid correlation');
    const value = input;
    prefixed('cor', value.correlationId);
    return input;
  },
  parseDataClassification(input) {
    if (!['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'].includes(String(input))) {
      throw new TypeError('invalid classification');
    }
    return input;
  },
  parsePolicyTokenId: (input) => prefixed('ptk', input),
  parseDecisionId: (input) => prefixed('dec', input),
};
const validIntent = {
  kind: 'ACTION_INTENT',
  schemaVersion: '1.0.0',
  actionIntentId: 'act_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  capability: { capability: 'instagram.comment.reply', actionType: 'CREATE_REPLY' },
  providerBinding: {
    provider: 'meta',
    targetType: 'comment',
    targetReference: 'comment-123',
  },
  tenant: { tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAW' },
  actor: { identityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAX', kind: 'AGENT' },
  requestOrigin: { identityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAY', kind: 'HUMAN' },
  correlation: { correlationId: 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAZ' },
  resolvedParameters: { text: 'Obrigado!', postId: 'post-123' },
  idempotency: { mode: 'REQUIRED', key: 'instagram:comment-123:reply-v1' },
  preconditions: [{ preconditionType: 'COMMENT_EXISTS', parameters: { commentId: 'comment-123' } }],
  expectedState: { stateType: 'REPLY_PRESENT', value: { commentId: 'comment-123' } },
  deadlineAt: '2026-08-29T23:30:00-03:00',
  authority: { kind: 'POLICY_TOKEN', policyTokenId: 'ptk_test' },
  executionClassification: {
    riskClassificationRef: 'risk:external-write',
    sideEffectClassificationRef: 'side-effect:write-external',
  },
  dataClassification: 'INTERNAL',
  metadata: { source: 'control-plane', retryable: false },
};
const parsed = action_intent_schema_1.ActionIntentSchema.parse(validIntent, dependencies);
assert(
  parsed.actionIntentId === validIntent.actionIntentId,
  'valid ActionIntent must retain canonical ID',
);
assert(
  parsed.tenant.tenantId === validIntent.tenant.tenantId,
  'ActionIntent must retain canonical tenant context',
);
assert(parsed.idempotency.mode === 'REQUIRED', 'valid ActionIntent must retain idempotency mode');
const roundTrip = action_intent_schema_1.ActionIntentSchema.parse(
  JSON.parse(JSON.stringify(parsed)),
  dependencies,
);
assert(
  JSON.stringify(roundTrip) === JSON.stringify(parsed),
  'ActionIntent serialization round trip must be stable',
);
expectThrows(
  () =>
    action_intent_schema_1.ActionIntentSchema.parse(
      { ...validIntent, resolvedParameters: ['ambiguous', 'array'] },
      dependencies,
    ),
  'resolvedParameters: expected object',
);
expectThrows(
  () =>
    action_intent_schema_1.ActionIntentSchema.parse(
      { ...validIntent, idempotency: { mode: 'REQUIRED' } },
      dependencies,
    ),
  'idempotency.key: missing required field',
);
expectThrows(
  () =>
    action_intent_schema_1.ActionIntentSchema.parse(
      { ...validIntent, authority: { ...validIntent.authority, grantedAuthority: 'ADMIN' } },
      dependencies,
    ),
  'grantedAuthority: unknown field',
);
const ownerDecisionIntent = action_intent_schema_1.ActionIntentSchema.parse(
  {
    ...validIntent,
    authority: { kind: 'OWNER_DECISION', decisionId: 'dec_01ARZ3NDEKTSV4RRFFQ69G5FB1' },
  },
  dependencies,
);
assert(
  ownerDecisionIntent.authority.kind === 'OWNER_DECISION',
  'OwnerDecision authority must use canonical DecisionId',
);
expectThrows(
  () =>
    action_intent_schema_1.ActionIntentSchema.parse(
      { ...validIntent, schemaVersion: '2.0.0' },
      dependencies,
    ),
  'unsupported ContractVersion',
);
expectThrows(
  () =>
    action_intent_schema_1.ActionIntentSchema.parse(
      { ...validIntent, correlation: { correlationId: 'not-canonical' } },
      dependencies,
    ),
  'expected cor_ prefixed ID',
);
expectThrows(
  () =>
    action_intent_schema_1.ActionIntentSchema.parse(
      { ...validIntent, deadlineAt: 'tomorrow' },
      dependencies,
    ),
  'expected valid RFC3339 timestamp',
);
expectThrows(
  () =>
    action_intent_schema_1.ActionIntentSchema.parse(
      { ...validIntent, tenantId: validIntent.tenant.tenantId },
      dependencies,
    ),
  'tenantId: unknown field',
);
expectThrows(
  () =>
    action_intent_schema_1.ActionIntentSchema.parse(
      { ...validIntent, unexpected: true },
      dependencies,
    ),
  'unexpected: unknown field',
);
