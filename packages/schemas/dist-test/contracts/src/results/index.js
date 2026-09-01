'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.EXECUTION_OUTCOMES =
  exports.RETRY_CLASSIFICATIONS =
  exports.ERROR_CODE_DEFINITIONS =
  exports.ERROR_CATEGORIES =
    void 0;
var error_semantics_js_1 = require('./error-semantics.js');
Object.defineProperty(exports, 'ERROR_CATEGORIES', {
  enumerable: true,
  get: function () {
    return error_semantics_js_1.ERROR_CATEGORIES;
  },
});
Object.defineProperty(exports, 'ERROR_CODE_DEFINITIONS', {
  enumerable: true,
  get: function () {
    return error_semantics_js_1.ERROR_CODE_DEFINITIONS;
  },
});
Object.defineProperty(exports, 'RETRY_CLASSIFICATIONS', {
  enumerable: true,
  get: function () {
    return error_semantics_js_1.RETRY_CLASSIFICATIONS;
  },
});
var execution_semantics_js_1 = require('./execution-semantics.js');
Object.defineProperty(exports, 'EXECUTION_OUTCOMES', {
  enumerable: true,
  get: function () {
    return execution_semantics_js_1.EXECUTION_OUTCOMES;
  },
});
