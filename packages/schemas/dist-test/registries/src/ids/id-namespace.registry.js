'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.PROVIDER_IDENTIFIER_POLICY =
  exports.ID_TYPE_DEPRECATIONS =
  exports.ID_NAMESPACE_REGISTRY =
    void 0;
function active(prefix, notes) {
  return {
    prefix,
    lifecycle: 'ACTIVE',
    generation: 'PRODUCER_ULID',
    wireFormat: 'PREFIXED_ULID',
    notes,
  };
}
function reserved(prefix, notes) {
  return {
    prefix,
    lifecycle: 'RESERVED',
    generation: 'NOT_YET_DEFINED',
    wireFormat: 'PREFIXED_ULID',
    notes,
  };
}
/** Static namespace authority for Aurora-internal IDs. */
exports.ID_NAMESPACE_REGISTRY = {
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
};
exports.ID_TYPE_DEPRECATIONS = {
  OwnerDecisionId: {
    successor: 'DecisionId',
    reason: 'Canonical public naming was standardized without a wire-format change.',
    removalCondition: 'Remove only after all governed consumers use DecisionId.',
    wireChange: false,
  },
};
exports.PROVIDER_IDENTIFIER_POLICY = {
  internalFutureType: 'ProviderId',
  internalFuturePrefix: exports.ID_NAMESPACE_REGISTRY.ProviderId.prefix,
  externalType: 'ProviderExternalId',
  externalFormat: 'PROVIDER_OWNED_OPAQUE',
  rule: 'ProviderExternalId never substitutes for an Aurora internal canonical ID.',
};
