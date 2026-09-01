'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.createPolicyTokenSchema =
  exports.PolicyTokenSchema =
  exports.createOwnerDecisionSchema =
  exports.OwnerDecisionSchema =
    void 0;
var owner_decision_schema_1 = require('./owner-decision.schema');
Object.defineProperty(exports, 'OwnerDecisionSchema', {
  enumerable: true,
  get: function () {
    return owner_decision_schema_1.OwnerDecisionSchema;
  },
});
Object.defineProperty(exports, 'createOwnerDecisionSchema', {
  enumerable: true,
  get: function () {
    return owner_decision_schema_1.createOwnerDecisionSchema;
  },
});
var policy_token_schema_1 = require('./policy-token.schema');
Object.defineProperty(exports, 'PolicyTokenSchema', {
  enumerable: true,
  get: function () {
    return policy_token_schema_1.PolicyTokenSchema;
  },
});
Object.defineProperty(exports, 'createPolicyTokenSchema', {
  enumerable: true,
  get: function () {
    return policy_token_schema_1.createPolicyTokenSchema;
  },
});
