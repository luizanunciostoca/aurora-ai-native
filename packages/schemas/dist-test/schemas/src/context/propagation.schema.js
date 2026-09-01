'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.PropagationContextSchema = exports.PropagationMetadataSchema = void 0;
const version_schemas_1 = require('../versioning/version.schemas');
const internal_1 = require('./internal');
const correlation_schema_1 = require('./correlation.schema');
const data_classification_schema_1 = require('./data-classification.schema');
const deadline_schema_1 = require('./deadline.schema');
const identity_schema_1 = require('./identity.schema');
const tenant_schema_1 = require('./tenant.schema');
exports.PropagationMetadataSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'PropagationMetadata');
  (0, internal_1.assertExactKeys)(
    record,
    ['dataClassification', 'deadline', 'expiry'],
    ['dataClassification'],
    'PropagationMetadata',
  );
  return {
    dataClassification: data_classification_schema_1.DataClassificationSchema.parse(
      record.dataClassification,
    ),
    ...(record.deadline === undefined
      ? {}
      : { deadline: deadline_schema_1.DeadlineSchema.parse(record.deadline) }),
    ...(record.expiry === undefined
      ? {}
      : { expiry: deadline_schema_1.ExpirySchema.parse(record.expiry) }),
  };
});
exports.PropagationContextSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'PropagationContext');
  (0, internal_1.assertExactKeys)(
    record,
    ['kind', 'schemaVersion', 'tenant', 'actor', 'correlation', 'metadata'],
    ['kind', 'schemaVersion', 'tenant', 'actor', 'correlation', 'metadata'],
    'PropagationContext',
  );
  if (record.kind !== 'PROPAGATION_CONTEXT') {
    throw new TypeError('PropagationContext.kind is invalid');
  }
  return {
    kind: 'PROPAGATION_CONTEXT',
    schemaVersion: version_schemas_1.ContractVersionSchema.parse(record.schemaVersion),
    tenant: tenant_schema_1.TenantContextSchema.parse(record.tenant),
    actor: identity_schema_1.ActorRefSchema.parse(record.actor),
    correlation: correlation_schema_1.CorrelationContextSchema.parse(record.correlation),
    metadata: exports.PropagationMetadataSchema.parse(record.metadata),
  };
});
