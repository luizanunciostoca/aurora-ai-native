'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.POLICY_TOKEN_KIND =
  exports.OWNER_DECISION_KIND =
  exports.OWNER_DECISION_STATES =
  exports.AUTHORITY_CLASSES =
    void 0;
var authority_primitives_1 = require('./authority-primitives');
Object.defineProperty(exports, 'AUTHORITY_CLASSES', {
  enumerable: true,
  get: function () {
    return authority_primitives_1.AUTHORITY_CLASSES;
  },
});
Object.defineProperty(exports, 'OWNER_DECISION_STATES', {
  enumerable: true,
  get: function () {
    return authority_primitives_1.OWNER_DECISION_STATES;
  },
});
var owner_decision_1 = require('./owner-decision');
Object.defineProperty(exports, 'OWNER_DECISION_KIND', {
  enumerable: true,
  get: function () {
    return owner_decision_1.OWNER_DECISION_KIND;
  },
});
var policy_token_1 = require('./policy-token');
Object.defineProperty(exports, 'POLICY_TOKEN_KIND', {
  enumerable: true,
  get: function () {
    return policy_token_1.POLICY_TOKEN_KIND;
  },
});
