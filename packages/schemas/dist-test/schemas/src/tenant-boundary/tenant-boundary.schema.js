'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.TenantBoundaryCheckSchema =
  exports.TenantBoundaryContextSchema =
  exports.IdentityTenantBindingSchema =
  exports.TenantBindingKindSchema =
    void 0;
const identity_schema_1 = require('../context/identity.schema');
const internal_1 = require('../context/internal');
const id_schemas_1 = require('../ids/id.schemas');
const TENANT_BINDING_KIND_VALUES = ['MEMBER', 'SYSTEM', 'EXTERNAL'];
const BINDING_KIND_SET = new Set(TENANT_BINDING_KIND_VALUES);
exports.TenantBindingKindSchema = (0, internal_1.createRuntimeSchema)((value) => {
  if (typeof value !== 'string' || !BINDING_KIND_SET.has(value)) {
    throw new TypeError('TenantBindingKind is invalid');
  }
  return value;
});
exports.IdentityTenantBindingSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'IdentityTenantBinding');
  (0, internal_1.assertExactKeys)(
    record,
    ['tenantId', 'identityId', 'identityKind', 'bindingKind', 'externalIdentity'],
    ['tenantId', 'identityId', 'identityKind', 'bindingKind'],
    'IdentityTenantBinding',
  );
  const identityKind = identity_schema_1.ActorRefSchema.parse({
    kind: record.identityKind,
    identityId: record.identityId,
  }).kind;
  return {
    tenantId: id_schemas_1.TenantIdSchema.parse(record.tenantId),
    identityId: id_schemas_1.IdentityIdSchema.parse(record.identityId),
    identityKind,
    bindingKind: exports.TenantBindingKindSchema.parse(record.bindingKind),
    ...(record.externalIdentity === undefined
      ? {}
      : {
          externalIdentity: identity_schema_1.ExternalIdentityRefSchema.parse(
            record.externalIdentity,
          ),
        }),
  };
});
exports.TenantBoundaryContextSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'TenantBoundaryContext');
  (0, internal_1.assertExactKeys)(
    record,
    ['tenantId', 'actor', 'subject', 'correlationId'],
    ['tenantId', 'actor', 'subject', 'correlationId'],
    'TenantBoundaryContext',
  );
  return {
    tenantId: id_schemas_1.TenantIdSchema.parse(record.tenantId),
    actor: identity_schema_1.ActorRefSchema.parse(record.actor),
    subject: identity_schema_1.SubjectRefSchema.parse(record.subject),
    correlationId: id_schemas_1.CorrelationIdSchema.parse(record.correlationId),
  };
});
function parseArray(value, label, parse) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array`);
  }
  return value.map(parse);
}
exports.TenantBoundaryCheckSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'TenantBoundaryCheck');
  (0, internal_1.assertExactKeys)(
    record,
    ['context', 'knownTenantIds', 'bindings'],
    ['context', 'knownTenantIds', 'bindings'],
    'TenantBoundaryCheck',
  );
  return {
    context: exports.TenantBoundaryContextSchema.parse(record.context),
    knownTenantIds: parseArray(record.knownTenantIds, 'knownTenantIds', (item) =>
      id_schemas_1.TenantIdSchema.parse(item),
    ),
    bindings: parseArray(record.bindings, 'bindings', (item) =>
      exports.IdentityTenantBindingSchema.parse(item),
    ),
  };
});
