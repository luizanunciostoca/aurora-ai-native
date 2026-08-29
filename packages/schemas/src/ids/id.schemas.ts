import type { ActionIntentId } from '../../../contracts/src/ids/types';
import type { CausationId } from '../../../contracts/src/ids/types';
import type { CommandId } from '../../../contracts/src/ids/types';
import type { CorrelationId } from '../../../contracts/src/ids/types';
import type { DecisionId } from '../../../contracts/src/ids/types';
import type { EventId } from '../../../contracts/src/ids/types';
import type { EvidenceId } from '../../../contracts/src/ids/types';
import type { ExecutionId } from '../../../contracts/src/ids/types';
import type { IdentityId } from '../../../contracts/src/ids/types';
import type { PolicyTokenId } from '../../../contracts/src/ids/types';
import type { ProviderExternalId } from '../../../contracts/src/ids/types';
import type { ReceiptId } from '../../../contracts/src/ids/types';
import type { TenantId } from '../../../contracts/src/ids/types';
import { ID_NAMESPACE_REGISTRY } from '../../../registries/src/ids/id-namespace.registry';

export interface StringSchema<T extends string> {
  is(value: unknown): value is T;
  parse(value: unknown): T;
  serialize(value: T): string;
}

const CROCKFORD_ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

function makeCanonicalIdSchema<T extends string>(prefix: string): StringSchema<T> {
  const is = (value: unknown): value is T => {
    if (typeof value !== 'string') {
      return false;
    }
    const separatorIndex = value.indexOf('_');
    if (separatorIndex !== prefix.length) {
      return false;
    }
    if (value.slice(0, separatorIndex) !== prefix) {
      return false;
    }
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

const ids = ID_NAMESPACE_REGISTRY;
const makeIdSchema = makeCanonicalIdSchema;

export const TenantIdSchema = makeIdSchema<TenantId>(ids.TenantId.prefix);
export const IdentityIdSchema = makeIdSchema<IdentityId>(ids.IdentityId.prefix);
export const CorrelationIdSchema = makeIdSchema<CorrelationId>(ids.CorrelationId.prefix);
export const CausationIdSchema = makeIdSchema<CausationId>(ids.CausationId.prefix);
export const CommandIdSchema = makeIdSchema<CommandId>(ids.CommandId.prefix);
export const EventIdSchema = makeIdSchema<EventId>(ids.EventId.prefix);
export const ActionIntentIdSchema = makeIdSchema<ActionIntentId>(ids.ActionIntentId.prefix);
export const ReceiptIdSchema = makeIdSchema<ReceiptId>(ids.ReceiptId.prefix);
export const EvidenceIdSchema = makeIdSchema<EvidenceId>(ids.EvidenceId.prefix);
export const DecisionIdSchema = makeIdSchema<DecisionId>(ids.DecisionId.prefix);
export const PolicyTokenIdSchema = makeIdSchema<PolicyTokenId>(ids.PolicyTokenId.prefix);
export const ExecutionIdSchema = makeIdSchema<ExecutionId>(ids.ExecutionId.prefix);

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
