export type IdNamespaceLifecycle = 'ACTIVE' | 'RESERVED';
export type IdGenerationRule = 'PRODUCER_ULID' | 'NOT_YET_DEFINED';

export interface IdNamespaceRegistryEntry {
  readonly prefix: string;
  readonly lifecycle: IdNamespaceLifecycle;
  readonly generation: IdGenerationRule;
  readonly wireFormat: 'PREFIXED_ULID';
  readonly notes: string;
}

/**
 * Static namespace authority for Aurora-internal IDs.
 *
 * RESERVED entries allocate a namespace only; they do not implement the
 * future registry or domain object that may eventually consume it.
 */
export const ID_NAMESPACE_REGISTRY = {
  TenantId: {
    prefix: 'ten',
    lifecycle: 'ACTIVE',
    generation: 'PRODUCER_ULID',
    wireFormat: 'PREFIXED_ULID',
    notes: 'Canonical tenant identity.',
  },
  IdentityId: {
    prefix: 'idn',
    lifecycle: 'ACTIVE',
    generation: 'PRODUCER_ULID',
    wireFormat: 'PREFIXED_ULID',
    notes: 'Canonical identity reference; identity graph is outside W01-F.',
  },
  CorrelationId: {
    prefix: 'cor',
    lifecycle: 'ACTIVE',
    generation: 'PRODUCER_ULID',
    wireFormat: 'PREFIXED_ULID',
    notes: 'Cross-boundary correlation identity.',
  },
  CausationId: {
    prefix: 'cau',
    lifecycle: 'ACTIVE',
    generation: 'PRODUCER_ULID',
    wireFormat: 'PREFIXED_ULID',
    notes: 'Identity for a causal reference when represented as an opaque ID.',
  },
  CommandId: {
    prefix: 'cmd',
    lifecycle: 'ACTIVE',
    generation: 'PRODUCER_ULID',
    wireFormat: 'PREFIXED_ULID',
    notes: 'Canonical command identity.',
  },
  EventId: {
    prefix: 'evt',
    lifecycle: 'ACTIVE',
    generation: 'PRODUCER_ULID',
    wireFormat: 'PREFIXED_ULID',
    notes: 'Canonical event identity.',
  },
  ActionIntentId: {
    prefix: 'act',
    lifecycle: 'ACTIVE',
    generation: 'PRODUCER_ULID',
    wireFormat: 'PREFIXED_ULID',
    notes: 'Canonical resolved action-intent identity.',
  },
  ReceiptId: {
    prefix: 'rcp',
    lifecycle: 'ACTIVE',
    generation: 'PRODUCER_ULID',
    wireFormat: 'PREFIXED_ULID',
    notes: 'Canonical execution receipt identity.',
  },
  EvidenceId: {
    prefix: 'evd',
    lifecycle: 'ACTIVE',
    generation: 'PRODUCER_ULID',
    wireFormat: 'PREFIXED_ULID',
    notes: 'Canonical evidence identity.',
  },
  DecisionId: {
    prefix: 'odc',
    lifecycle: 'ACTIVE',
    generation: 'PRODUCER_ULID',
    wireFormat: 'PREFIXED_ULID',
    notes:
      'Canonical decision identity. Prefix `odc` is preserved from the prior OwnerDecisionId policy.',
  },
  PolicyTokenId: {
    prefix: 'ptk',
    lifecycle: 'ACTIVE',
    generation: 'PRODUCER_ULID',
    wireFormat: 'PREFIXED_ULID',
    notes: 'Canonical policy-token identity.',
  },
  ExecutionId: {
    prefix: 'exe',
    lifecycle: 'ACTIVE',
    generation: 'PRODUCER_ULID',
    wireFormat: 'PREFIXED_ULID',
    notes: 'Canonical execution identity reserved by W01 coordinator architecture.',
  },
  CapabilityId: {
    prefix: 'cap',
    lifecycle: 'RESERVED',
    generation: 'NOT_YET_DEFINED',
    wireFormat: 'PREFIXED_ULID',
    notes: 'Namespace reservation only; W01-F does not populate the Capability Registry.',
  },
  ProfileId: {
    prefix: 'prf',
    lifecycle: 'RESERVED',
    generation: 'NOT_YET_DEFINED',
    wireFormat: 'PREFIXED_ULID',
    notes: 'Namespace reservation for future agent/profile registry identities.',
  },
  WorkflowId: {
    prefix: 'wfl',
    lifecycle: 'RESERVED',
    generation: 'NOT_YET_DEFINED',
    wireFormat: 'PREFIXED_ULID',
    notes: 'Namespace reservation for future governed workflow identities.',
  },
  ExecutorId: {
    prefix: 'xtr',
    lifecycle: 'RESERVED',
    generation: 'NOT_YET_DEFINED',
    wireFormat: 'PREFIXED_ULID',
    notes: 'Namespace reservation for future executor registry identities.',
  },
  ProviderId: {
    prefix: 'prv',
    lifecycle: 'RESERVED',
    generation: 'NOT_YET_DEFINED',
    wireFormat: 'PREFIXED_ULID',
    notes:
      'Future Aurora-internal provider identity only. Provider-owned IDs remain ProviderExternalId.',
  },
} as const satisfies Record<string, IdNamespaceRegistryEntry>;

export type ActiveIdNamespaceName = {
  [Name in keyof typeof ID_NAMESPACE_REGISTRY]: (typeof ID_NAMESPACE_REGISTRY)[Name]['lifecycle'] extends 'ACTIVE'
    ? Name
    : never;
}[keyof typeof ID_NAMESPACE_REGISTRY];

export const ID_TYPE_DEPRECATIONS = {
  OwnerDecisionId: {
    successor: 'DecisionId',
    reason:
      'W01-F standardized the canonical public name while preserving the existing `odc` wire namespace.',
    removalCondition:
      'Remove the source alias only in a coordinated breaking package change after all consumers use DecisionId.',
    wireChange: false,
  },
} as const;

export const PROVIDER_IDENTIFIER_POLICY = {
  internalFutureType: 'ProviderId',
  internalFuturePrefix: ID_NAMESPACE_REGISTRY.ProviderId.prefix,
  externalType: 'ProviderExternalId',
  externalFormat: 'PROVIDER_OWNED_OPAQUE',
  rule:
    'ProviderExternalId must never be treated as, parsed as, or substituted for an Aurora internal canonical ID.',
} as const;
