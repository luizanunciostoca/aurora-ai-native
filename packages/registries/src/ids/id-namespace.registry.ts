export type IdNamespaceLifecycle = 'ACTIVE' | 'RESERVED';
export type IdGenerationRule = 'PRODUCER_ULID' | 'NOT_YET_DEFINED';

export interface IdNamespaceRegistryEntry {
  readonly prefix: string;
  readonly lifecycle: IdNamespaceLifecycle;
  readonly generation: IdGenerationRule;
  readonly wireFormat: 'PREFIXED_ULID';
  readonly notes: string;
}

function active<const Prefix extends string>(prefix: Prefix, notes: string) {
  return {
    prefix,
    lifecycle: 'ACTIVE',
    generation: 'PRODUCER_ULID',
    wireFormat: 'PREFIXED_ULID',
    notes,
  } as const;
}

function reserved<const Prefix extends string>(prefix: Prefix, notes: string) {
  return {
    prefix,
    lifecycle: 'RESERVED',
    generation: 'NOT_YET_DEFINED',
    wireFormat: 'PREFIXED_ULID',
    notes,
  } as const;
}

/** Static namespace authority for Aurora-internal IDs. */
export const ID_NAMESPACE_REGISTRY = {
  TenantId: active('ten', 'Canonical tenant identity.'),
  IdentityId: active('idn', 'Canonical identity reference; no identity graph in W01-F.'),
  CorrelationId: active('cor', 'Cross-boundary correlation identity.'),
  CausationId: active('cau', 'Opaque causal-reference identity.'),
  CommandId: active('cmd', 'Canonical command identity.'),
  EventId: active('evt', 'Canonical event identity.'),
  ActionIntentId: active('act', 'Canonical resolved action-intent identity.'),
  ReceiptId: active('rcp', 'Canonical execution receipt identity.'),
  EvidenceId: active('evd', 'Canonical evidence identity.'),
  DecisionId: active(
    'odc',
    'Canonical decision identity; preserves the prior OwnerDecisionId namespace.',
  ),
  PolicyTokenId: active('ptk', 'Canonical policy-token identity.'),
  ExecutionId: active('exe', 'Canonical execution identity.'),
  CapabilityId: reserved('cap', 'Future Capability Registry namespace only.'),
  ProfileId: reserved('prf', 'Future agent/profile registry namespace only.'),
  WorkflowId: reserved('wfl', 'Future governed workflow namespace only.'),
  ExecutorId: reserved('xtr', 'Future executor registry namespace only.'),
  ProviderId: reserved('prv', 'Future Aurora-internal provider namespace only.'),
} as const satisfies Record<string, IdNamespaceRegistryEntry>;

export type ActiveIdNamespaceName =
  | 'TenantId'
  | 'IdentityId'
  | 'CorrelationId'
  | 'CausationId'
  | 'CommandId'
  | 'EventId'
  | 'ActionIntentId'
  | 'ReceiptId'
  | 'EvidenceId'
  | 'DecisionId'
  | 'PolicyTokenId'
  | 'ExecutionId';

export const ID_TYPE_DEPRECATIONS = {
  OwnerDecisionId: {
    successor: 'DecisionId',
    reason: 'Canonical public naming was standardized without a wire-format change.',
    removalCondition: 'Remove only after all governed consumers use DecisionId.',
    wireChange: false,
  },
} as const;

export const PROVIDER_IDENTIFIER_POLICY = {
  internalFutureType: 'ProviderId',
  internalFuturePrefix: ID_NAMESPACE_REGISTRY.ProviderId.prefix,
  externalType: 'ProviderExternalId',
  externalFormat: 'PROVIDER_OWNED_OPAQUE',
  rule: 'ProviderExternalId never substitutes for an Aurora internal canonical ID.',
} as const;
