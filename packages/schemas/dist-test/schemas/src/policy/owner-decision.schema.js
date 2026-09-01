'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.OwnerDecisionSchema = void 0;
exports.createOwnerDecisionSchema = createOwnerDecisionSchema;
const validation_1 = require('./validation');
const OWNER_DECISION_STATES = new Set(['APPROVED', 'DENIED', 'REVOKED', 'EXPIRED']);
const OWNER_DECISION_KEYS = [
  'kind',
  'schemaVersion',
  'decisionId',
  'subject',
  'decision',
  'actor',
  'tenant',
  'decidedAt',
  'scope',
  'constraints',
  'expiresAt',
  'correlation',
  'reason',
  'reasonReference',
  'authenticationReference',
];
function createOwnerDecisionSchema(dependencies) {
  const parse = (input) => {
    const value = (0, validation_1.asRecord)(input, 'OwnerDecision');
    (0, validation_1.assertKnownKeys)(value, OWNER_DECISION_KEYS, 'OwnerDecision');
    if (value.kind !== 'OWNER_DECISION') {
      throw new TypeError('OwnerDecision.kind must be OWNER_DECISION');
    }
    const decisionValue = (0, validation_1.requireNonEmptyString)(value.decision, 'decision');
    if (!OWNER_DECISION_STATES.has(decisionValue)) {
      throw new TypeError(`unknown OwnerDecision decision: ${decisionValue}`);
    }
    const decision = decisionValue;
    const decidedAt = dependencies.timestamp.parse(value.decidedAt);
    const expiresAt =
      value.expiresAt === undefined ? undefined : dependencies.timestamp.parse(value.expiresAt);
    const constraints = (0, validation_1.optionalConstraints)(value.constraints);
    const reason = (0, validation_1.optionalNonEmptyString)(value.reason, 'reason');
    const reasonReference = (0, validation_1.optionalNonEmptyString)(
      value.reasonReference,
      'reasonReference',
    );
    const authenticationReference = (0, validation_1.optionalNonEmptyString)(
      value.authenticationReference,
      'authenticationReference',
    );
    if (
      decision === 'APPROVED' &&
      expiresAt !== undefined &&
      (0, validation_1.compareRfc3339)(expiresAt, decidedAt) <= 0
    ) {
      throw new TypeError('APPROVED OwnerDecision expiresAt must be later than decidedAt');
    }
    if (decision === 'EXPIRED') {
      if (expiresAt === undefined) {
        throw new TypeError('EXPIRED OwnerDecision requires expiresAt');
      }
      if ((0, validation_1.compareRfc3339)(expiresAt, decidedAt) > 0) {
        throw new TypeError('EXPIRED OwnerDecision expiresAt must not be later than decidedAt');
      }
    }
    return {
      kind: 'OWNER_DECISION',
      schemaVersion: dependencies.contractVersion.parse(value.schemaVersion),
      decisionId: dependencies.decisionId.parse(value.decisionId),
      subject: (0, validation_1.requireSubject)(value.subject),
      decision,
      actor: dependencies.actor.parse(value.actor),
      tenant: dependencies.tenant.parse(value.tenant),
      decidedAt,
      scope: (0, validation_1.requireScope)(value.scope),
      ...(constraints === undefined ? {} : { constraints }),
      ...(expiresAt === undefined ? {} : { expiresAt }),
      correlation: dependencies.correlation.parse(value.correlation),
      ...(reason === undefined ? {} : { reason }),
      ...(reasonReference === undefined ? {} : { reasonReference }),
      ...(authenticationReference === undefined ? {} : { authenticationReference }),
    };
  };
  return Object.freeze({
    parse,
    serialize: (input) => JSON.stringify(parse(input)),
    deserialize: (serialized) =>
      parse((0, validation_1.parseJsonObject)(serialized, 'OwnerDecision serialization')),
  });
}
/** W01-G composes this factory with accepted W01-D/F validators. */
exports.OwnerDecisionSchema = Object.freeze({ create: createOwnerDecisionSchema });
