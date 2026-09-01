'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.TenantContextSchema =
  exports.PropagationMetadataSchema =
  exports.PropagationContextSchema =
  exports.SubjectRefSchema =
  exports.IdentityKindSchema =
  exports.ExternalIdentityRefSchema =
  exports.ActorRefSchema =
  exports.Rfc3339TimestampSchema =
  exports.ExpirySchema =
  exports.DeadlineSchema =
  exports.DataClassificationSchema =
  exports.CausationRefSchema =
  exports.CorrelationContextSchema =
    void 0;
var correlation_schema_js_1 = require('./correlation.schema.js');
Object.defineProperty(exports, 'CorrelationContextSchema', {
  enumerable: true,
  get: function () {
    return correlation_schema_js_1.CorrelationContextSchema;
  },
});
Object.defineProperty(exports, 'CausationRefSchema', {
  enumerable: true,
  get: function () {
    return correlation_schema_js_1.CausationRefSchema;
  },
});
var data_classification_schema_js_1 = require('./data-classification.schema.js');
Object.defineProperty(exports, 'DataClassificationSchema', {
  enumerable: true,
  get: function () {
    return data_classification_schema_js_1.DataClassificationSchema;
  },
});
var deadline_schema_js_1 = require('./deadline.schema.js');
Object.defineProperty(exports, 'DeadlineSchema', {
  enumerable: true,
  get: function () {
    return deadline_schema_js_1.DeadlineSchema;
  },
});
Object.defineProperty(exports, 'ExpirySchema', {
  enumerable: true,
  get: function () {
    return deadline_schema_js_1.ExpirySchema;
  },
});
Object.defineProperty(exports, 'Rfc3339TimestampSchema', {
  enumerable: true,
  get: function () {
    return deadline_schema_js_1.Rfc3339TimestampSchema;
  },
});
var identity_schema_js_1 = require('./identity.schema.js');
Object.defineProperty(exports, 'ActorRefSchema', {
  enumerable: true,
  get: function () {
    return identity_schema_js_1.ActorRefSchema;
  },
});
Object.defineProperty(exports, 'ExternalIdentityRefSchema', {
  enumerable: true,
  get: function () {
    return identity_schema_js_1.ExternalIdentityRefSchema;
  },
});
Object.defineProperty(exports, 'IdentityKindSchema', {
  enumerable: true,
  get: function () {
    return identity_schema_js_1.IdentityKindSchema;
  },
});
Object.defineProperty(exports, 'SubjectRefSchema', {
  enumerable: true,
  get: function () {
    return identity_schema_js_1.SubjectRefSchema;
  },
});
var propagation_schema_js_1 = require('./propagation.schema.js');
Object.defineProperty(exports, 'PropagationContextSchema', {
  enumerable: true,
  get: function () {
    return propagation_schema_js_1.PropagationContextSchema;
  },
});
Object.defineProperty(exports, 'PropagationMetadataSchema', {
  enumerable: true,
  get: function () {
    return propagation_schema_js_1.PropagationMetadataSchema;
  },
});
var tenant_schema_js_1 = require('./tenant.schema.js');
Object.defineProperty(exports, 'TenantContextSchema', {
  enumerable: true,
  get: function () {
    return tenant_schema_js_1.TenantContextSchema;
  },
});
