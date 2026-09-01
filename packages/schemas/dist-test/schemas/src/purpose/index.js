'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.PurposeContextSchema = void 0;
const internal_1 = require('../context/internal');
exports.PurposeContextSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'PurposeContext');
  (0, internal_1.assertExactKeys)(
    record,
    ['kind', 'purposeId', 'version', 'status', 'description', 'allowedDataClassifications'],
    ['kind', 'purposeId', 'version', 'status'],
    'PurposeContext',
  );
  if (record.kind !== 'PurposeContext') {
    throw new TypeError('PurposeContext.kind is invalid');
  }
  if (record.status !== 'ACTIVE' && record.status !== 'DISABLED') {
    throw new TypeError('PurposeContext.status is invalid');
  }
  (0, internal_1.parseNonEmptyString)(record.purposeId, 'purposeId');
  (0, internal_1.parseNonEmptyString)(record.version, 'version');
  return record;
});
