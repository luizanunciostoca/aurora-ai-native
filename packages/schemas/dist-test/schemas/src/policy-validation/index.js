'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.AuthorityEvaluationResultSchema =
  exports.AuthorityEvaluationRequestSchema =
  exports.PolicyTokenValidationResultSchema =
  exports.PolicyTokenValidationRequestSchema =
    void 0;
const index_1 = require('../context/index');
const internal_1 = require('../context/internal');
const index_2 = require('../ids/index');
const index_3 = require('../policy/index');
const validation_1 = require('../policy/validation');
const index_4 = require('../policy-engine/index');
const index_5 = require('../versioning/index');
const policyDependencies = {
  contractVersion: index_5.ContractVersionSchema,
  decisionId: index_2.DecisionIdSchema,
  policyTokenId: index_2.PolicyTokenIdSchema,
  actor: index_1.ActorRefSchema,
  tenant: index_1.TenantContextSchema,
  correlation: index_1.CorrelationContextSchema,
  timestamp: index_1.Rfc3339TimestampSchema,
  version: index_5.VersionSchema,
};
const PolicyTokenWireSchema = (0, index_3.createPolicyTokenSchema)(policyDependencies);
const OwnerDecisionWireSchema = (0, index_3.createOwnerDecisionSchema)(policyDependencies);
function parseScope(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty array`);
  }
  const parsed = value.map((entry, index) =>
    (0, internal_1.parseNonEmptyString)(entry, `${label}[${index}]`),
  );
  if (new Set(parsed).size !== parsed.length) {
    throw new TypeError(`${label} must not contain duplicate entries`);
  }
  return parsed;
}
function parseStringArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value.map((entry, index) =>
    (0, internal_1.parseNonEmptyString)(entry, `${label}[${index}]`),
  );
}
function parsePolicyReference(value, label) {
  const record = (0, internal_1.asRecord)(value, label);
  (0, internal_1.assertExactKeys)(
    record,
    ['reference', 'version'],
    ['reference', 'version'],
    label,
  );
  (0, internal_1.parseNonEmptyString)(record.reference, `${label}.reference`);
  index_5.VersionSchema.parse(record.version);
}
function parseBoolean(value, label) {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean`);
  return value;
}
function parseRevocationIds(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value.map((entry) => index_2.PolicyTokenIdSchema.parse(entry));
}
function parseCanonicalError(value, label) {
  const record = (0, internal_1.asRecord)(value, label);
  for (const required of [
    'kind',
    'schemaVersion',
    'code',
    'category',
    'message',
    'retryability',
    'correlationId',
    'timestamp',
  ]) {
    if (!(required in record))
      throw new TypeError(`${label} is missing required field: ${required}`);
  }
  if (record.kind !== 'CanonicalError') throw new TypeError(`${label}.kind is invalid`);
  (0, internal_1.parseNonEmptyString)(record.schemaVersion, `${label}.schemaVersion`);
  (0, internal_1.parseNonEmptyString)(record.code, `${label}.code`);
  (0, internal_1.parseNonEmptyString)(record.category, `${label}.category`);
  (0, internal_1.parseNonEmptyString)(record.message, `${label}.message`);
  (0, internal_1.parseNonEmptyString)(record.retryability, `${label}.retryability`);
  (0, internal_1.parseNonEmptyString)(record.correlationId, `${label}.correlationId`);
  index_1.Rfc3339TimestampSchema.parse(record.timestamp);
}
function parseTokenValidationEvidence(value) {
  const record = (0, internal_1.asRecord)(value, 'PolicyTokenValidationEvidence');
  (0, internal_1.assertExactKeys)(
    record,
    [
      'policyTokenId',
      'tenantId',
      'actorIdentityId',
      'subjectReference',
      'action',
      'requestedScope',
      'effectiveScope',
      'currentPolicy',
      'inputFingerprint',
    ],
    [
      'tenantId',
      'actorIdentityId',
      'subjectReference',
      'action',
      'requestedScope',
      'effectiveScope',
      'currentPolicy',
      'inputFingerprint',
    ],
    'PolicyTokenValidationEvidence',
  );
  if (record.policyTokenId !== undefined) index_2.PolicyTokenIdSchema.parse(record.policyTokenId);
  (0, internal_1.parseNonEmptyString)(record.tenantId, 'PolicyTokenValidationEvidence.tenantId');
  (0, internal_1.parseNonEmptyString)(
    record.actorIdentityId,
    'PolicyTokenValidationEvidence.actorIdentityId',
  );
  (0, internal_1.parseNonEmptyString)(
    record.subjectReference,
    'PolicyTokenValidationEvidence.subjectReference',
  );
  (0, internal_1.parseNonEmptyString)(record.action, 'PolicyTokenValidationEvidence.action');
  parseScope(record.requestedScope, 'PolicyTokenValidationEvidence.requestedScope');
  if (!Array.isArray(record.effectiveScope)) {
    throw new TypeError('PolicyTokenValidationEvidence.effectiveScope must be an array');
  }
  record.effectiveScope.forEach((entry, index) =>
    (0, internal_1.parseNonEmptyString)(
      entry,
      `PolicyTokenValidationEvidence.effectiveScope[${index}]`,
    ),
  );
  parsePolicyReference(record.currentPolicy, 'PolicyTokenValidationEvidence.currentPolicy');
  (0, internal_1.parseNonEmptyString)(
    record.inputFingerprint,
    'PolicyTokenValidationEvidence.inputFingerprint',
  );
}
function parseAuthorityEvaluationEvidence(value) {
  const record = (0, internal_1.asRecord)(value, 'AuthorityEvaluationEvidence');
  (0, internal_1.assertExactKeys)(
    record,
    [
      'tenantId',
      'actorIdentityId',
      'subjectReference',
      'action',
      'requestedScope',
      'effectiveScope',
      'currentPolicy',
      'inputFingerprint',
    ],
    [
      'tenantId',
      'actorIdentityId',
      'subjectReference',
      'action',
      'requestedScope',
      'effectiveScope',
      'currentPolicy',
      'inputFingerprint',
    ],
    'AuthorityEvaluationEvidence',
  );
  (0, internal_1.parseNonEmptyString)(record.tenantId, 'AuthorityEvaluationEvidence.tenantId');
  (0, internal_1.parseNonEmptyString)(
    record.actorIdentityId,
    'AuthorityEvaluationEvidence.actorIdentityId',
  );
  (0, internal_1.parseNonEmptyString)(
    record.subjectReference,
    'AuthorityEvaluationEvidence.subjectReference',
  );
  (0, internal_1.parseNonEmptyString)(record.action, 'AuthorityEvaluationEvidence.action');
  parseScope(record.requestedScope, 'AuthorityEvaluationEvidence.requestedScope');
  if (!Array.isArray(record.effectiveScope)) {
    throw new TypeError('AuthorityEvaluationEvidence.effectiveScope must be an array');
  }
  record.effectiveScope.forEach((entry, index) =>
    (0, internal_1.parseNonEmptyString)(
      entry,
      `AuthorityEvaluationEvidence.effectiveScope[${index}]`,
    ),
  );
  parsePolicyReference(record.currentPolicy, 'AuthorityEvaluationEvidence.currentPolicy');
  (0, internal_1.parseNonEmptyString)(
    record.inputFingerprint,
    'AuthorityEvaluationEvidence.inputFingerprint',
  );
}
exports.PolicyTokenValidationRequestSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'PolicyTokenValidationRequest');
  (0, internal_1.assertExactKeys)(
    record,
    [
      'kind',
      'schemaVersion',
      'token',
      'evaluatedAt',
      'correlation',
      'tenant',
      'actor',
      'subject',
      'action',
      'requestedScope',
      'policy',
      'operationConstraints',
      'ownerDecision',
      'revokedPolicyTokenIds',
      'requireCorrelationMatch',
    ],
    [
      'kind',
      'schemaVersion',
      'token',
      'evaluatedAt',
      'correlation',
      'tenant',
      'actor',
      'subject',
      'action',
      'requestedScope',
      'policy',
    ],
    'PolicyTokenValidationRequest',
  );
  if (record.kind !== 'PolicyTokenValidationRequest') {
    throw new TypeError('PolicyTokenValidationRequest.kind is invalid');
  }
  index_5.ContractVersionSchema.parse(record.schemaVersion);
  PolicyTokenWireSchema.parse(record.token);
  index_1.Rfc3339TimestampSchema.parse(record.evaluatedAt);
  index_1.CorrelationContextSchema.parse(record.correlation);
  index_1.TenantContextSchema.parse(record.tenant);
  index_1.ActorRefSchema.parse(record.actor);
  index_1.SubjectRefSchema.parse(record.subject);
  (0, internal_1.parseNonEmptyString)(record.action, 'PolicyTokenValidationRequest.action');
  parseScope(record.requestedScope, 'PolicyTokenValidationRequest.requestedScope');
  parsePolicyReference(record.policy, 'PolicyTokenValidationRequest.policy');
  if (record.operationConstraints !== undefined)
    (0, validation_1.optionalConstraints)(record.operationConstraints);
  if (record.ownerDecision !== undefined) OwnerDecisionWireSchema.parse(record.ownerDecision);
  if (record.revokedPolicyTokenIds !== undefined) {
    parseRevocationIds(
      record.revokedPolicyTokenIds,
      'PolicyTokenValidationRequest.revokedPolicyTokenIds',
    );
  }
  if (record.requireCorrelationMatch !== undefined) {
    parseBoolean(
      record.requireCorrelationMatch,
      'PolicyTokenValidationRequest.requireCorrelationMatch',
    );
  }
  return record;
});
exports.PolicyTokenValidationResultSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'PolicyTokenValidationResult');
  (0, internal_1.assertExactKeys)(
    record,
    [
      'kind',
      'schemaVersion',
      'valid',
      'correlation',
      'evaluatedAt',
      'currentPolicy',
      'effectiveScope',
      'reasons',
      'evidence',
      'error',
    ],
    [
      'kind',
      'schemaVersion',
      'valid',
      'correlation',
      'evaluatedAt',
      'currentPolicy',
      'effectiveScope',
      'reasons',
      'evidence',
    ],
    'PolicyTokenValidationResult',
  );
  if (record.kind !== 'PolicyTokenValidationResult') {
    throw new TypeError('PolicyTokenValidationResult.kind is invalid');
  }
  index_5.ContractVersionSchema.parse(record.schemaVersion);
  const valid = parseBoolean(record.valid, 'PolicyTokenValidationResult.valid');
  index_1.CorrelationContextSchema.parse(record.correlation);
  index_1.Rfc3339TimestampSchema.parse(record.evaluatedAt);
  parsePolicyReference(record.currentPolicy, 'PolicyTokenValidationResult.currentPolicy');
  if (!Array.isArray(record.effectiveScope)) {
    throw new TypeError('PolicyTokenValidationResult.effectiveScope must be an array');
  }
  record.effectiveScope.forEach((entry, index) =>
    (0, internal_1.parseNonEmptyString)(
      entry,
      `PolicyTokenValidationResult.effectiveScope[${index}]`,
    ),
  );
  parseStringArray(record.reasons, 'PolicyTokenValidationResult.reasons');
  parseTokenValidationEvidence(record.evidence);
  if (valid && record.error !== undefined) {
    throw new TypeError('valid PolicyTokenValidationResult must not carry error');
  }
  if (!valid) {
    if (record.effectiveScope.length !== 0) {
      throw new TypeError('invalid PolicyTokenValidationResult effectiveScope must be empty');
    }
    if (record.error === undefined) {
      throw new TypeError('invalid PolicyTokenValidationResult requires CanonicalError');
    }
    parseCanonicalError(record.error, 'PolicyTokenValidationResult.error');
  }
  return record;
});
exports.AuthorityEvaluationRequestSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'AuthorityEvaluationRequest');
  (0, internal_1.assertExactKeys)(
    record,
    [
      'kind',
      'policyEvaluation',
      'operationConstraints',
      'revokedPolicyTokenIds',
      'requireCorrelationMatch',
    ],
    ['kind', 'policyEvaluation'],
    'AuthorityEvaluationRequest',
  );
  if (record.kind !== 'AuthorityEvaluationRequest') {
    throw new TypeError('AuthorityEvaluationRequest.kind is invalid');
  }
  const policyEvaluation = index_4.PolicyEvaluationRequestSchema.parse(record.policyEvaluation);
  if (policyEvaluation.policyToken !== undefined) {
    PolicyTokenWireSchema.parse(policyEvaluation.policyToken);
  }
  if (policyEvaluation.ownerDecision !== undefined) {
    OwnerDecisionWireSchema.parse(policyEvaluation.ownerDecision);
  }
  if (record.operationConstraints !== undefined)
    (0, validation_1.optionalConstraints)(record.operationConstraints);
  if (record.revokedPolicyTokenIds !== undefined) {
    parseRevocationIds(
      record.revokedPolicyTokenIds,
      'AuthorityEvaluationRequest.revokedPolicyTokenIds',
    );
  }
  if (record.requireCorrelationMatch !== undefined) {
    parseBoolean(
      record.requireCorrelationMatch,
      'AuthorityEvaluationRequest.requireCorrelationMatch',
    );
  }
  return record;
});
exports.AuthorityEvaluationResultSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'AuthorityEvaluationResult');
  (0, internal_1.assertExactKeys)(
    record,
    [
      'kind',
      'schemaVersion',
      'authorized',
      'correlation',
      'evaluatedAt',
      'currentPolicy',
      'effectiveScope',
      'reasons',
      'evidence',
      'tokenValidation',
      'policyDecision',
      'policyResult',
      'error',
    ],
    [
      'kind',
      'schemaVersion',
      'authorized',
      'correlation',
      'evaluatedAt',
      'currentPolicy',
      'effectiveScope',
      'reasons',
      'evidence',
    ],
    'AuthorityEvaluationResult',
  );
  if (record.kind !== 'AuthorityEvaluationResult') {
    throw new TypeError('AuthorityEvaluationResult.kind is invalid');
  }
  index_5.ContractVersionSchema.parse(record.schemaVersion);
  const authorized = parseBoolean(record.authorized, 'AuthorityEvaluationResult.authorized');
  index_1.CorrelationContextSchema.parse(record.correlation);
  index_1.Rfc3339TimestampSchema.parse(record.evaluatedAt);
  parsePolicyReference(record.currentPolicy, 'AuthorityEvaluationResult.currentPolicy');
  if (!Array.isArray(record.effectiveScope)) {
    throw new TypeError('AuthorityEvaluationResult.effectiveScope must be an array');
  }
  record.effectiveScope.forEach((entry, index) =>
    (0, internal_1.parseNonEmptyString)(
      entry,
      `AuthorityEvaluationResult.effectiveScope[${index}]`,
    ),
  );
  parseStringArray(record.reasons, 'AuthorityEvaluationResult.reasons');
  parseAuthorityEvaluationEvidence(record.evidence);
  if (record.tokenValidation !== undefined) {
    exports.PolicyTokenValidationResultSchema.parse(record.tokenValidation);
  }
  if (record.policyDecision !== undefined) {
    index_4.PolicyEvaluationDecisionSchema.parse(record.policyDecision);
  }
  if (record.policyResult !== undefined) {
    index_4.PolicyEvaluationResultSchema.parse(record.policyResult);
  }
  if (authorized) {
    if (record.effectiveScope.length === 0) {
      throw new TypeError('authorized AuthorityEvaluationResult requires non-empty effectiveScope');
    }
    if (record.policyDecision !== 'ALLOW') {
      throw new TypeError('authorized AuthorityEvaluationResult requires policyDecision ALLOW');
    }
    const policyResult = index_4.PolicyEvaluationResultSchema.parse(record.policyResult);
    if (policyResult.decision !== 'ALLOW') {
      throw new TypeError('authorized AuthorityEvaluationResult requires ALLOW policyResult');
    }
    if (record.error !== undefined) {
      throw new TypeError('authorized AuthorityEvaluationResult must not carry error');
    }
  } else {
    if (record.effectiveScope.length !== 0) {
      throw new TypeError('unauthorized AuthorityEvaluationResult effectiveScope must be empty');
    }
    if (record.error === undefined) {
      throw new TypeError('unauthorized AuthorityEvaluationResult requires CanonicalError');
    }
    parseCanonicalError(record.error, 'AuthorityEvaluationResult.error');
  }
  return record;
});
