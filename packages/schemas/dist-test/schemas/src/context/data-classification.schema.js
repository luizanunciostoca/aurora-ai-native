'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.DataClassificationSchema = void 0;
const context_1 = require('@aurora/contracts/context');
const internal_1 = require('./internal');
const DATA_CLASSIFICATION_SET = new Set(context_1.DATA_CLASSIFICATIONS);
exports.DataClassificationSchema = (0, internal_1.createRuntimeSchema)((value) => {
  if (typeof value !== 'string' || !DATA_CLASSIFICATION_SET.has(value)) {
    throw new TypeError('DataClassification is invalid');
  }
  return value;
});
