'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.SubjectRefSchema =
  exports.ActorRefSchema =
  exports.ExternalIdentityRefSchema =
  exports.IdentityKindSchema =
    void 0;
const context_1 = require('@aurora/contracts/context');
const id_schemas_1 = require('../ids/id.schemas');
const internal_1 = require('./internal');
const IDENTITY_KIND_SET = new Set(context_1.IDENTITY_KINDS);
exports.IdentityKindSchema = (0, internal_1.createRuntimeSchema)((value) => {
  if (typeof value !== 'string' || !IDENTITY_KIND_SET.has(value)) {
    throw new TypeError('IdentityKind is invalid');
  }
  return value;
});
exports.ExternalIdentityRefSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'ExternalIdentityRef');
  (0, internal_1.assertExactKeys)(
    record,
    ['kind', 'provider', 'externalId'],
    ['kind', 'provider', 'externalId'],
    'ExternalIdentityRef',
  );
  if (record.kind !== 'EXTERNAL_IDENTITY') {
    throw new TypeError('ExternalIdentityRef.kind is invalid');
  }
  return {
    kind: 'EXTERNAL_IDENTITY',
    provider: (0, internal_1.parseNonEmptyString)(record.provider, 'ExternalIdentityRef.provider'),
    externalId: id_schemas_1.ProviderExternalIdSchema.parse(record.externalId),
  };
});
exports.ActorRefSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'ActorRef');
  (0, internal_1.assertExactKeys)(
    record,
    ['kind', 'identityId', 'externalIdentity'],
    ['kind', 'identityId'],
    'ActorRef',
  );
  return {
    kind: exports.IdentityKindSchema.parse(record.kind),
    identityId: id_schemas_1.IdentityIdSchema.parse(record.identityId),
    ...(record.externalIdentity === undefined
      ? {}
      : { externalIdentity: exports.ExternalIdentityRefSchema.parse(record.externalIdentity) }),
  };
});
exports.SubjectRefSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'SubjectRef');
  if (record.kind === 'IDENTITY') {
    (0, internal_1.assertExactKeys)(
      record,
      ['kind', 'identityId'],
      ['kind', 'identityId'],
      'SubjectRef',
    );
    return {
      kind: 'IDENTITY',
      identityId: id_schemas_1.IdentityIdSchema.parse(record.identityId),
    };
  }
  if (record.kind === 'EXTERNAL_IDENTITY') {
    (0, internal_1.assertExactKeys)(
      record,
      ['kind', 'externalIdentity'],
      ['kind', 'externalIdentity'],
      'SubjectRef',
    );
    return {
      kind: 'EXTERNAL_IDENTITY',
      externalIdentity: exports.ExternalIdentityRefSchema.parse(record.externalIdentity),
    };
  }
  throw new TypeError('SubjectRef.kind is invalid');
});
