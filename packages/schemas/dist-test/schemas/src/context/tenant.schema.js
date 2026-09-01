'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.TenantContextSchema = void 0;
const id_schemas_1 = require('../ids/id.schemas');
const internal_1 = require('./internal');
exports.TenantContextSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'TenantContext');
  (0, internal_1.assertExactKeys)(record, ['tenantId'], ['tenantId'], 'TenantContext');
  return { tenantId: id_schemas_1.TenantIdSchema.parse(record.tenantId) };
});
