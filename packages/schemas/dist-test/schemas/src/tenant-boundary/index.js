'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.TenantBoundaryContextSchema =
  exports.TenantBoundaryCheckSchema =
  exports.TenantBindingKindSchema =
  exports.IdentityTenantBindingSchema =
  exports.checkTenantBoundary =
    void 0;
var check_1 = require('./check');
Object.defineProperty(exports, 'checkTenantBoundary', {
  enumerable: true,
  get: function () {
    return check_1.checkTenantBoundary;
  },
});
var tenant_boundary_schema_1 = require('./tenant-boundary.schema');
Object.defineProperty(exports, 'IdentityTenantBindingSchema', {
  enumerable: true,
  get: function () {
    return tenant_boundary_schema_1.IdentityTenantBindingSchema;
  },
});
Object.defineProperty(exports, 'TenantBindingKindSchema', {
  enumerable: true,
  get: function () {
    return tenant_boundary_schema_1.TenantBindingKindSchema;
  },
});
Object.defineProperty(exports, 'TenantBoundaryCheckSchema', {
  enumerable: true,
  get: function () {
    return tenant_boundary_schema_1.TenantBoundaryCheckSchema;
  },
});
Object.defineProperty(exports, 'TenantBoundaryContextSchema', {
  enumerable: true,
  get: function () {
    return tenant_boundary_schema_1.TenantBoundaryContextSchema;
  },
});
