'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.PolicyTokenSchema = void 0;
exports.createPolicyTokenSchema = createPolicyTokenSchema;
const validation_1 = require('./validation');
const AUTHORITY_CLASSES = new Set(['OWNER_DECISION', 'POLICY_RULE']);
const POLICY_TOKEN_KEYS = [
  'kind',
  'schemaVersion',
  'policyTokenId',
  'tenant',
  'subject',
  'action',
  'scope',
  'issuedAt',
  'expiresAt',
  'policy',
  'constraints',
  'authorityClass',
  'correlation',
  'decisionReference',
];
function createPolicyTokenSchema(dependencies) {
  const parse = (input) => {
    const value = (0, validation_1.asRecord)(input, 'PolicyToken');
    (0, validation_1.assertKnownKeys)(value, POLICY_TOKEN_KEYS, 'PolicyToken');
    if (value.kind !== 'POLICY_TOKEN') {
      throw new TypeError('PolicyToken.kind must be POLICY_TOKEN');
    }
    const authorityClassValue = (0, validation_1.requireNonEmptyString)(
      value.authorityClass,
      'authorityClass',
    );
    if (!AUTHORITY_CLASSES.has(authorityClassValue)) {
      throw new TypeError(`unknown PolicyToken authorityClass: ${authorityClassValue}`);
    }
    const authorityClass = authorityClassValue;
    const issuedAt = dependencies.timestamp.parse(value.issuedAt);
    const expiresAt = dependencies.timestamp.parse(value.expiresAt);
    const constraints = (0, validation_1.optionalConstraints)(value.constraints);
    const decisionReference =
      value.decisionReference === undefined
        ? undefined
        : dependencies.decisionId.parse(value.decisionReference);
    if ((0, validation_1.compareRfc3339)(expiresAt, issuedAt) <= 0) {
      throw new TypeError('PolicyToken.expiresAt must be later than issuedAt');
    }
    if (authorityClass === 'OWNER_DECISION' && decisionReference === undefined) {
      throw new TypeError('OWNER_DECISION PolicyToken requires decisionReference');
    }
    return {
      kind: 'POLICY_TOKEN',
      schemaVersion: dependencies.contractVersion.parse(value.schemaVersion),
      policyTokenId: dependencies.policyTokenId.parse(value.policyTokenId),
      tenant: dependencies.tenant.parse(value.tenant),
      subject: (0, validation_1.requireSubject)(value.subject),
      action: (0, validation_1.requireNonEmptyString)(value.action, 'action'),
      scope: (0, validation_1.requireScope)(value.scope),
      issuedAt,
      expiresAt,
      policy: (0, validation_1.requirePolicyReference)(value.policy, dependencies.version),
      ...(constraints === undefined ? {} : { constraints }),
      authorityClass,
      correlation: dependencies.correlation.parse(value.correlation),
      ...(decisionReference === undefined ? {} : { decisionReference }),
    };
  };
  const parseAt = (input, at) => {
    const token = parse(input);
    const evaluationAt = dependencies.timestamp.parse(at);
    if ((0, validation_1.compareRfc3339)(token.expiresAt, evaluationAt) <= 0) {
      throw new TypeError('PolicyToken is expired at evaluationAt');
    }
    return token;
  };
  return Object.freeze({
    parse,
    parseAt,
    serialize: (input) => JSON.stringify(parse(input)),
    deserialize: (serialized) =>
      parse((0, validation_1.parseJsonObject)(serialized, 'PolicyToken serialization')),
  });
}
/** W01-G composes this factory with accepted W01-D/F validators. */
exports.PolicyTokenSchema = Object.freeze({ create: createPolicyTokenSchema });
