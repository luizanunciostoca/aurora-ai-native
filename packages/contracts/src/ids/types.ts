declare const auroraCanonicalIdBrand: unique symbol;
declare const auroraProviderExternalIdBrand: unique symbol;

export type CanonicalIdName =
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

export type CanonicalId<Name extends CanonicalIdName> = string & {
  readonly [auroraCanonicalIdBrand]: Name;
};

export type TenantId = CanonicalId<'TenantId'>;
export type IdentityId = CanonicalId<'IdentityId'>;
export type CorrelationId = CanonicalId<'CorrelationId'>;
export type CausationId = CanonicalId<'CausationId'>;
export type CommandId = CanonicalId<'CommandId'>;
export type EventId = CanonicalId<'EventId'>;
export type ActionIntentId = CanonicalId<'ActionIntentId'>;
export type ReceiptId = CanonicalId<'ReceiptId'>;
export type EvidenceId = CanonicalId<'EvidenceId'>;
export type DecisionId = CanonicalId<'DecisionId'>;
export type PolicyTokenId = CanonicalId<'PolicyTokenId'>;
export type ExecutionId = CanonicalId<'ExecutionId'>;

/**
 * Compatibility-only source alias for the coordinator-era name.
 *
 * @deprecated Use DecisionId. The serialized namespace remains `odc_<ULID>`;
 * no second ID identity or namespace is created.
 */
export type OwnerDecisionId = DecisionId;

export type InternalCanonicalId =
  | TenantId
  | IdentityId
  | CorrelationId
  | CausationId
  | CommandId
  | EventId
  | ActionIntentId
  | ReceiptId
  | EvidenceId
  | DecisionId
  | PolicyTokenId
  | ExecutionId;

/**
 * Provider-owned opaque identifier. It is intentionally NOT an Aurora
 * CanonicalId and therefore does not use Aurora's `<prefix>_<ULID>` format.
 */
export type ProviderExternalId = string & {
  readonly [auroraProviderExternalIdBrand]: 'ProviderExternalId';
};
