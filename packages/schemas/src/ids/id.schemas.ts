import type {
  ActionIntentId,
  CausationId,
  CommandId,
  CorrelationId,
  DecisionId,
  EventId,
  EvidenceId,
  ExecutionId,
  IdentityId,
  PolicyTokenId,
  ProviderExternalId,
  ReceiptId,
  TenantId,
} from '../../../contracts/src/ids/types';
import { ID_NAMESPACE_REGISTRY } from '../../../registries/src/ids/id-namespace.registry';

export interface StringSchema<T extends string> {
  is(value: unknown): value is T;
  parse(value: unknown): T;
  serialize(value: T): string;
}

const CROCKFORD_ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function makeCanonicalIdSchema<T extends string>(prefix: string): StringSchema<T> {
  const is = (value: unknown): value is T => {
    if (typeof value !== 'string') return false;
    const separatorIndex = value.indexOf('_');
    if (separatorIndex !== prefix.length) return false;
    if (value.slice(0, separatorIndex) !== prefix) return false;
    return CROCKFORD_ULID_PATTERN.test(value.slice(separatorIndex + 1));
  };

  return Object.freeze({
    is,
    parse(value: unknown): T {
      if (!is(value)) {
        throw new TypeError(`Expected canonical ${prefix}_<ULID> identifier`);
      }
      return value;
    },
    serialize(value: T): string {
      if (!is(value)) {
        throw new TypeError(`Cannot serialize invalid canonical ${prefix}_<ULID> identifier`);
      }
      return value;
    },
  });
}

export const TenantIdSchema = makeCanonicalIdSchema<TenantId>(
  ID_NAMESPACE_REGISTRY.TenantId.prefix,
);
export const IdentityIdSchema = makeCanonicalIdSchema<IdentityId>(
  ID_NAMESPACE_REGISTRY.IdentityId.prefix,
);
export const CorrelationIdSchema = makeCanonicalIdSchema<CorrelationId>(
  ID_NAMESPACE_REGISTRY.CorrelationId.prefix,
);
export const CausationIdSchema = makeCanonicalIdSchema<CausationId>(
  ID_NAMESPACE_REGISTRY.CausationId.prefix,
);
export const CommandIdSchema = makeCanonicalIdSchema<CommandId>(
  ID_NAMESPACE_REGISTRY.CommandId.prefix,
);
export const EventIdSchema = makeCanonicalIdSchema<EventId>(
  ID_NAMESPACE_REGISTRY.EventId.prefix,
);
export const ActionIntentIdSchema = makeCanonicalIdSchema<ActionIntentId>(
  ID_NAMESPACE_REGISTRY.ActionIntentId.prefix,
);
export const ReceiptIdSchema = makeCanonicalIdSchema<ReceiptId>(
  ID_NAMESPACE_REGISTRY.ReceiptId.prefix,
);
export const EvidenceIdSchema = makeCanonicalIdSchema<EvidenceId>(
  ID_NAMESPACE_REGISTRY.EvidenceId.prefix,
);
export const DecisionIdSchema = makeCanonicalIdSchema<DecisionId>(
  ID_NAMESPACE_REGISTRY.DecisionId.prefix,
);
export const PolicyTokenIdSchema = makeCanonicalIdSchema<PolicyTokenId>(
  ID_NAMESPACE_REGISTRY.PolicyTokenId.prefix,
);
export const ExecutionIdSchema = makeCanonicalIdSchema<ExecutionId>(
  ID_NAMESPACE_REGISTRY.ExecutionId.prefix,
);

/** @deprecated Use DecisionIdSchema. */
export const OwnerDecisionIdSchema = DecisionIdSchema;

export const ProviderExternalIdSchema: StringSchema<ProviderExternalId> = Object.freeze({
  is(value: unknown): value is ProviderExternalId {
    return typeof value === 'string' && value.length > 0 && value.trim().length > 0;
  },
  parse(value: unknown): ProviderExternalId {
    if (!ProviderExternalIdSchema.is(value)) {
      throw new TypeError('Expected non-empty provider-owned external identifier');
    }
    return value;
  },
  serialize(value: ProviderExternalId): string {
    if (!ProviderExternalIdSchema.is(value)) {
      throw new TypeError('Cannot serialize empty provider-owned external identifier');
    }
    return value;
  },
});
