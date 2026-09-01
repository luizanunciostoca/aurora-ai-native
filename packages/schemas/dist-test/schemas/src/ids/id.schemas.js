'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.ProviderExternalIdSchema =
  exports.OwnerDecisionIdSchema =
  exports.ExecutionIdSchema =
  exports.PolicyTokenIdSchema =
  exports.DecisionIdSchema =
  exports.EvidenceIdSchema =
  exports.ReceiptIdSchema =
  exports.ActionIntentIdSchema =
  exports.EventIdSchema =
  exports.CommandIdSchema =
  exports.CausationIdSchema =
  exports.CorrelationIdSchema =
  exports.IdentityIdSchema =
  exports.TenantIdSchema =
    void 0;
const ids_1 = require('@aurora/registries/ids');
const CROCKFORD_ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
function makeCanonicalIdSchema(prefix) {
  const is = (value) => {
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
    parse(value) {
      if (!is(value)) {
        throw new TypeError(`Expected canonical ${prefix}_<ULID> identifier`);
      }
      return value;
    },
    serialize(value) {
      if (!is(value)) {
        throw new TypeError(`Cannot serialize invalid canonical ${prefix}_<ULID> identifier`);
      }
      return value;
    },
  });
}
const ids = ids_1.ID_NAMESPACE_REGISTRY;
const makeIdSchema = makeCanonicalIdSchema;
exports.TenantIdSchema = makeIdSchema(ids.TenantId.prefix);
exports.IdentityIdSchema = makeIdSchema(ids.IdentityId.prefix);
exports.CorrelationIdSchema = makeIdSchema(ids.CorrelationId.prefix);
exports.CausationIdSchema = makeIdSchema(ids.CausationId.prefix);
exports.CommandIdSchema = makeIdSchema(ids.CommandId.prefix);
exports.EventIdSchema = makeIdSchema(ids.EventId.prefix);
exports.ActionIntentIdSchema = makeIdSchema(ids.ActionIntentId.prefix);
exports.ReceiptIdSchema = makeIdSchema(ids.ReceiptId.prefix);
exports.EvidenceIdSchema = makeIdSchema(ids.EvidenceId.prefix);
exports.DecisionIdSchema = makeIdSchema(ids.DecisionId.prefix);
exports.PolicyTokenIdSchema = makeIdSchema(ids.PolicyTokenId.prefix);
exports.ExecutionIdSchema = makeIdSchema(ids.ExecutionId.prefix);
/** @deprecated Use DecisionIdSchema. */
exports.OwnerDecisionIdSchema = exports.DecisionIdSchema;
exports.ProviderExternalIdSchema = Object.freeze({
  is(value) {
    return typeof value === 'string' && value.length > 0 && value.trim().length > 0;
  },
  parse(value) {
    if (!exports.ProviderExternalIdSchema.is(value)) {
      throw new TypeError('Expected non-empty provider-owned external identifier');
    }
    return value;
  },
  serialize(value) {
    if (!exports.ProviderExternalIdSchema.is(value)) {
      throw new TypeError('Cannot serialize empty provider-owned external identifier');
    }
    return value;
  },
});
