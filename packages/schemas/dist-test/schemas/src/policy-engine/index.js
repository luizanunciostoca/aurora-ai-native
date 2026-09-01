'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.PolicyEvaluationResultSchema =
  exports.PolicyEvaluationRequestSchema =
  exports.PolicySnapshotSchema =
  exports.PolicyRuleSchema =
  exports.PolicySnapshotStateSchema =
  exports.PolicyEvaluationDecisionSchema =
    void 0;
const internal_1 = require('../context/internal');
const DECISIONS = new Set(['ALLOW', 'DENY', 'REQUIRE_APPROVAL']);
const SNAPSHOT_STATES = new Set(['ACTIVE', 'UNKNOWN']);
function parseStringArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value.map((item, index) =>
    (0, internal_1.parseNonEmptyString)(item, `${label}[${index}]`),
  );
}
exports.PolicyEvaluationDecisionSchema = (0, internal_1.createRuntimeSchema)((value) => {
  if (typeof value !== 'string' || !DECISIONS.has(value)) {
    throw new TypeError('PolicyEvaluationDecision is invalid');
  }
  return value;
});
exports.PolicySnapshotStateSchema = (0, internal_1.createRuntimeSchema)((value) => {
  if (typeof value !== 'string' || !SNAPSHOT_STATES.has(value)) {
    throw new TypeError('PolicySnapshotState is invalid');
  }
  return value;
});
exports.PolicyRuleSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'PolicyRule');
  (0, internal_1.assertExactKeys)(
    record,
    [
      'ruleId',
      'effect',
      'action',
      'scope',
      'tenantIds',
      'actorKinds',
      'actorIdentityIds',
      'subjectReferences',
      'purposeIds',
      'jurisdictions',
      'dataClassifications',
      'consentRequired',
      'authorityRequired',
      'reasonReference',
    ],
    ['ruleId', 'effect', 'action', 'scope'],
    'PolicyRule',
  );
  (0, internal_1.parseNonEmptyString)(record.ruleId, 'PolicyRule.ruleId');
  exports.PolicyEvaluationDecisionSchema.parse(record.effect);
  (0, internal_1.parseNonEmptyString)(record.action, 'PolicyRule.action');
  parseStringArray(record.scope, 'PolicyRule.scope');
  for (const key of [
    'tenantIds',
    'actorKinds',
    'actorIdentityIds',
    'subjectReferences',
    'purposeIds',
    'jurisdictions',
    'dataClassifications',
  ]) {
    if (record[key] !== undefined) parseStringArray(record[key], `PolicyRule.${key}`);
  }
  for (const key of ['consentRequired', 'authorityRequired']) {
    if (record[key] !== undefined && typeof record[key] !== 'boolean') {
      throw new TypeError(`PolicyRule.${key} must be boolean`);
    }
  }
  if (record.reasonReference !== undefined) {
    (0, internal_1.parseNonEmptyString)(record.reasonReference, 'PolicyRule.reasonReference');
  }
  return record;
});
exports.PolicySnapshotSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'PolicySnapshot');
  (0, internal_1.assertExactKeys)(
    record,
    ['kind', 'policy', 'state', 'rules'],
    ['kind', 'policy', 'state', 'rules'],
    'PolicySnapshot',
  );
  if (record.kind !== 'PolicySnapshot') throw new TypeError('PolicySnapshot.kind is invalid');
  const policy = (0, internal_1.asRecord)(record.policy, 'PolicySnapshot.policy');
  (0, internal_1.assertExactKeys)(
    policy,
    ['reference', 'version'],
    ['reference', 'version'],
    'PolicySnapshot.policy',
  );
  (0, internal_1.parseNonEmptyString)(policy.reference, 'PolicySnapshot.policy.reference');
  (0, internal_1.parseNonEmptyString)(policy.version, 'PolicySnapshot.policy.version');
  exports.PolicySnapshotStateSchema.parse(record.state);
  if (!Array.isArray(record.rules)) throw new TypeError('PolicySnapshot.rules must be an array');
  record.rules.forEach((rule) => exports.PolicyRuleSchema.parse(rule));
  return record;
});
exports.PolicyEvaluationRequestSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'PolicyEvaluationRequest');
  (0, internal_1.assertExactKeys)(
    record,
    [
      'kind',
      'schemaVersion',
      'policy',
      'snapshot',
      'correlation',
      'evaluatedAt',
      'tenant',
      'tenantBoundary',
      'actor',
      'subject',
      'action',
      'requestedScope',
      'purpose',
      'jurisdiction',
      'jurisdictionRestrictions',
      'dataClassification',
      'consent',
      'ownerDecision',
      'policyToken',
    ],
    [
      'kind',
      'schemaVersion',
      'policy',
      'snapshot',
      'correlation',
      'evaluatedAt',
      'tenant',
      'tenantBoundary',
      'actor',
      'subject',
      'action',
      'requestedScope',
      'purpose',
      'jurisdiction',
    ],
    'PolicyEvaluationRequest',
  );
  if (record.kind !== 'PolicyEvaluationRequest') {
    throw new TypeError('PolicyEvaluationRequest.kind is invalid');
  }
  (0, internal_1.parseNonEmptyString)(
    record.schemaVersion,
    'PolicyEvaluationRequest.schemaVersion',
  );
  (0, internal_1.parseNonEmptyString)(record.evaluatedAt, 'PolicyEvaluationRequest.evaluatedAt');
  (0, internal_1.parseNonEmptyString)(record.action, 'PolicyEvaluationRequest.action');
  parseStringArray(record.requestedScope, 'PolicyEvaluationRequest.requestedScope');
  exports.PolicySnapshotSchema.parse(record.snapshot);
  for (const key of [
    'policy',
    'correlation',
    'tenant',
    'tenantBoundary',
    'actor',
    'subject',
    'purpose',
    'jurisdiction',
  ]) {
    (0, internal_1.asRecord)(record[key], `PolicyEvaluationRequest.${key}`);
  }
  if (
    record.jurisdictionRestrictions !== undefined &&
    !Array.isArray(record.jurisdictionRestrictions)
  ) {
    throw new TypeError('PolicyEvaluationRequest.jurisdictionRestrictions must be an array');
  }
  return record;
});
exports.PolicyEvaluationResultSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'PolicyEvaluationResult');
  (0, internal_1.assertExactKeys)(
    record,
    [
      'kind',
      'schemaVersion',
      'decision',
      'policy',
      'correlation',
      'evaluatedAt',
      'reasons',
      'evidence',
      'error',
    ],
    [
      'kind',
      'schemaVersion',
      'decision',
      'policy',
      'correlation',
      'evaluatedAt',
      'reasons',
      'evidence',
    ],
    'PolicyEvaluationResult',
  );
  if (record.kind !== 'PolicyEvaluationResult') {
    throw new TypeError('PolicyEvaluationResult.kind is invalid');
  }
  const decision = exports.PolicyEvaluationDecisionSchema.parse(record.decision);
  (0, internal_1.parseNonEmptyString)(record.schemaVersion, 'PolicyEvaluationResult.schemaVersion');
  (0, internal_1.parseNonEmptyString)(record.evaluatedAt, 'PolicyEvaluationResult.evaluatedAt');
  parseStringArray(record.reasons, 'PolicyEvaluationResult.reasons');
  (0, internal_1.asRecord)(record.policy, 'PolicyEvaluationResult.policy');
  (0, internal_1.asRecord)(record.correlation, 'PolicyEvaluationResult.correlation');
  (0, internal_1.asRecord)(record.evidence, 'PolicyEvaluationResult.evidence');
  if (decision === 'DENY' && record.error === undefined) {
    throw new TypeError('PolicyEvaluationResult DENY requires CanonicalError');
  }
  if (decision !== 'DENY' && record.error !== undefined) {
    throw new TypeError('PolicyEvaluationResult non-DENY must not carry error');
  }
  return record;
});
