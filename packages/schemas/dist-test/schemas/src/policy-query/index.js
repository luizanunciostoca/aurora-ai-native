'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.PolicyPrecheckResultSchema =
  exports.PolicyPrecheckRequestSchema =
  exports.CurrentPolicyLookupResultSchema =
  exports.CurrentPolicyLookupRequestSchema =
    void 0;
const index_1 = require('../context/index');
const internal_1 = require('../context/internal');
const index_2 = require('../policy-engine/index');
const index_3 = require('../versioning/index');
function parseBoolean(value, label) {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean`);
  return value;
}
function parseStringArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value.map((entry, index) =>
    (0, internal_1.parseNonEmptyString)(entry, `${label}[${index}]`),
  );
}
function parseScope(value, label) {
  const parsed = parseStringArray(value, label);
  if (parsed.length === 0) throw new TypeError(`${label} must be non-empty`);
  if (new Set(parsed).size !== parsed.length) {
    throw new TypeError(`${label} must not contain duplicate entries`);
  }
  return parsed;
}
function parsePolicyReference(value, label) {
  const record = (0, internal_1.asRecord)(value, label);
  (0, internal_1.assertExactKeys)(
    record,
    ['reference', 'version'],
    ['reference', 'version'],
    label,
  );
  const reference = (0, internal_1.parseNonEmptyString)(record.reference, `${label}.reference`);
  const version = index_3.VersionSchema.parse(record.version);
  return { reference, version };
}
function parseRequiredAuthority(value) {
  const record = (0, internal_1.asRecord)(value, 'RequiredAuthorityDescriptor');
  (0, internal_1.assertExactKeys)(
    record,
    ['required', 'action', 'scope', 'subjectReference'],
    ['required'],
    'RequiredAuthorityDescriptor',
  );
  const required = parseBoolean(record.required, 'RequiredAuthorityDescriptor.required');
  if (!required) {
    if (
      record.action !== undefined ||
      record.scope !== undefined ||
      record.subjectReference !== undefined
    ) {
      throw new TypeError('non-required authority must not contain authority details');
    }
    return { required: false };
  }
  if (
    record.action === undefined ||
    record.scope === undefined ||
    record.subjectReference === undefined
  ) {
    throw new TypeError('required authority must contain action, scope and subjectReference');
  }
  return {
    required: true,
    action: (0, internal_1.parseNonEmptyString)(
      record.action,
      'RequiredAuthorityDescriptor.action',
    ),
    scope: parseScope(record.scope, 'RequiredAuthorityDescriptor.scope'),
    subjectReference: (0, internal_1.parseNonEmptyString)(
      record.subjectReference,
      'RequiredAuthorityDescriptor.subjectReference',
    ),
  };
}
function optionalStringArray(record, key, label) {
  const value = record[key];
  return value === undefined ? undefined : parseStringArray(value, label);
}
function parseConstraint(value) {
  const record = (0, internal_1.asRecord)(value, 'ApplicablePolicyConstraint');
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
    ['ruleId', 'effect', 'action', 'scope', 'consentRequired', 'authorityRequired'],
    'ApplicablePolicyConstraint',
  );
  const tenantIds = optionalStringArray(
    record,
    'tenantIds',
    'ApplicablePolicyConstraint.tenantIds',
  );
  const actorKinds = optionalStringArray(
    record,
    'actorKinds',
    'ApplicablePolicyConstraint.actorKinds',
  );
  const actorIdentityIds = optionalStringArray(
    record,
    'actorIdentityIds',
    'ApplicablePolicyConstraint.actorIdentityIds',
  );
  const subjectReferences = optionalStringArray(
    record,
    'subjectReferences',
    'ApplicablePolicyConstraint.subjectReferences',
  );
  const purposeIds = optionalStringArray(
    record,
    'purposeIds',
    'ApplicablePolicyConstraint.purposeIds',
  );
  const jurisdictions = optionalStringArray(
    record,
    'jurisdictions',
    'ApplicablePolicyConstraint.jurisdictions',
  );
  const dataClassifications = optionalStringArray(
    record,
    'dataClassifications',
    'ApplicablePolicyConstraint.dataClassifications',
  );
  return {
    ruleId: (0, internal_1.parseNonEmptyString)(record.ruleId, 'ApplicablePolicyConstraint.ruleId'),
    effect: index_2.PolicyEvaluationDecisionSchema.parse(record.effect),
    action: (0, internal_1.parseNonEmptyString)(record.action, 'ApplicablePolicyConstraint.action'),
    scope: parseScope(record.scope, 'ApplicablePolicyConstraint.scope'),
    consentRequired: parseBoolean(
      record.consentRequired,
      'ApplicablePolicyConstraint.consentRequired',
    ),
    authorityRequired: parseBoolean(
      record.authorityRequired,
      'ApplicablePolicyConstraint.authorityRequired',
    ),
    ...(tenantIds === undefined ? {} : { tenantIds }),
    ...(actorKinds === undefined ? {} : { actorKinds }),
    ...(actorIdentityIds === undefined ? {} : { actorIdentityIds }),
    ...(subjectReferences === undefined ? {} : { subjectReferences }),
    ...(purposeIds === undefined ? {} : { purposeIds }),
    ...(jurisdictions === undefined ? {} : { jurisdictions }),
    ...(dataClassifications === undefined ? {} : { dataClassifications }),
    ...(record.reasonReference === undefined
      ? {}
      : {
          reasonReference: (0, internal_1.parseNonEmptyString)(
            record.reasonReference,
            'ApplicablePolicyConstraint.reasonReference',
          ),
        }),
  };
}
function parsePrecheckEvidence(value) {
  const record = (0, internal_1.asRecord)(value, 'PolicyPrecheckEvidence');
  (0, internal_1.assertExactKeys)(
    record,
    [
      'tenantId',
      'actorIdentityId',
      'subjectReference',
      'action',
      'requestedScope',
      'matchedRuleIds',
      'inputFingerprint',
    ],
    [
      'tenantId',
      'actorIdentityId',
      'subjectReference',
      'action',
      'requestedScope',
      'matchedRuleIds',
      'inputFingerprint',
    ],
    'PolicyPrecheckEvidence',
  );
  (0, internal_1.parseNonEmptyString)(record.tenantId, 'PolicyPrecheckEvidence.tenantId');
  (0, internal_1.parseNonEmptyString)(
    record.actorIdentityId,
    'PolicyPrecheckEvidence.actorIdentityId',
  );
  (0, internal_1.parseNonEmptyString)(
    record.subjectReference,
    'PolicyPrecheckEvidence.subjectReference',
  );
  (0, internal_1.parseNonEmptyString)(record.action, 'PolicyPrecheckEvidence.action');
  parseScope(record.requestedScope, 'PolicyPrecheckEvidence.requestedScope');
  parseStringArray(record.matchedRuleIds, 'PolicyPrecheckEvidence.matchedRuleIds');
  (0, internal_1.parseNonEmptyString)(
    record.inputFingerprint,
    'PolicyPrecheckEvidence.inputFingerprint',
  );
}
exports.CurrentPolicyLookupRequestSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'CurrentPolicyLookupRequest');
  (0, internal_1.assertExactKeys)(
    record,
    ['kind', 'schemaVersion', 'expectedPolicy', 'correlation', 'evaluatedAt', 'tenant', 'actor'],
    ['kind', 'schemaVersion', 'expectedPolicy', 'correlation', 'evaluatedAt', 'tenant', 'actor'],
    'CurrentPolicyLookupRequest',
  );
  if (record.kind !== 'CurrentPolicyLookupRequest') {
    throw new TypeError('CurrentPolicyLookupRequest.kind is invalid');
  }
  index_3.ContractVersionSchema.parse(record.schemaVersion);
  parsePolicyReference(record.expectedPolicy, 'CurrentPolicyLookupRequest.expectedPolicy');
  index_1.CorrelationContextSchema.parse(record.correlation);
  index_1.Rfc3339TimestampSchema.parse(record.evaluatedAt);
  index_1.TenantContextSchema.parse(record.tenant);
  index_1.ActorRefSchema.parse(record.actor);
  return record;
});
exports.CurrentPolicyLookupResultSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'CurrentPolicyLookupResult');
  (0, internal_1.assertExactKeys)(
    record,
    [
      'kind',
      'schemaVersion',
      'expectedPolicy',
      'correlation',
      'evaluatedAt',
      'tenant',
      'actor',
      'informationalOnly',
      'authorizesExecution',
      'requiresExecutionTimeValidation',
      'found',
      'currentPolicy',
      'state',
      'snapshot',
      'versionChanged',
      'reasons',
    ],
    [
      'kind',
      'schemaVersion',
      'expectedPolicy',
      'correlation',
      'evaluatedAt',
      'tenant',
      'actor',
      'informationalOnly',
      'authorizesExecution',
      'requiresExecutionTimeValidation',
      'found',
      'reasons',
    ],
    'CurrentPolicyLookupResult',
  );
  if (record.kind !== 'CurrentPolicyLookupResult') {
    throw new TypeError('CurrentPolicyLookupResult.kind is invalid');
  }
  index_3.ContractVersionSchema.parse(record.schemaVersion);
  const expectedPolicy = parsePolicyReference(
    record.expectedPolicy,
    'CurrentPolicyLookupResult.expectedPolicy',
  );
  index_1.CorrelationContextSchema.parse(record.correlation);
  index_1.Rfc3339TimestampSchema.parse(record.evaluatedAt);
  index_1.TenantContextSchema.parse(record.tenant);
  index_1.ActorRefSchema.parse(record.actor);
  if (record.informationalOnly !== true) {
    throw new TypeError('CurrentPolicyLookupResult.informationalOnly must be true');
  }
  if (record.authorizesExecution !== false) {
    throw new TypeError('CurrentPolicyLookupResult.authorizesExecution must be false');
  }
  if (record.requiresExecutionTimeValidation !== true) {
    throw new TypeError('CurrentPolicyLookupResult.requiresExecutionTimeValidation must be true');
  }
  const found = parseBoolean(record.found, 'CurrentPolicyLookupResult.found');
  parseStringArray(record.reasons, 'CurrentPolicyLookupResult.reasons');
  if (!found) {
    if (
      record.currentPolicy !== undefined ||
      record.state !== undefined ||
      record.snapshot !== undefined ||
      record.versionChanged !== undefined
    ) {
      throw new TypeError('not-found CurrentPolicyLookupResult must not contain current policy');
    }
    return record;
  }
  if (
    record.currentPolicy === undefined ||
    record.state === undefined ||
    record.snapshot === undefined ||
    record.versionChanged === undefined
  ) {
    throw new TypeError('found CurrentPolicyLookupResult requires current policy fields');
  }
  const currentPolicy = parsePolicyReference(
    record.currentPolicy,
    'CurrentPolicyLookupResult.currentPolicy',
  );
  index_2.PolicySnapshotStateSchema.parse(record.state);
  const snapshot = index_2.PolicySnapshotSchema.parse(record.snapshot);
  parseBoolean(record.versionChanged, 'CurrentPolicyLookupResult.versionChanged');
  if (currentPolicy.reference !== expectedPolicy.reference) {
    throw new TypeError('found current policy reference must match expected reference');
  }
  if (
    snapshot.policy.reference !== currentPolicy.reference ||
    snapshot.policy.version !== currentPolicy.version
  ) {
    throw new TypeError('CurrentPolicyLookupResult snapshot/currentPolicy mismatch');
  }
  return record;
});
exports.PolicyPrecheckRequestSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'PolicyPrecheckRequest');
  (0, internal_1.assertExactKeys)(
    record,
    ['kind', 'policyEvaluation'],
    ['kind', 'policyEvaluation'],
    'PolicyPrecheckRequest',
  );
  if (record.kind !== 'PolicyPrecheckRequest') {
    throw new TypeError('PolicyPrecheckRequest.kind is invalid');
  }
  const policyEvaluation = index_2.PolicyEvaluationRequestSchema.parse(record.policyEvaluation);
  if (policyEvaluation.ownerDecision !== undefined || policyEvaluation.policyToken !== undefined) {
    throw new TypeError('PolicyPrecheckRequest must not contain executable authority evidence');
  }
  return record;
});
exports.PolicyPrecheckResultSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'PolicyPrecheckResult');
  (0, internal_1.assertExactKeys)(
    record,
    [
      'kind',
      'schemaVersion',
      'policy',
      'correlation',
      'evaluatedAt',
      'informationalOnly',
      'authorizesExecution',
      'requiresExecutionTimeValidation',
      'decision',
      'requiredAuthority',
      'approvalRequired',
      'applicableConstraints',
      'reasons',
      'reasonReferences',
      'evidence',
    ],
    [
      'kind',
      'schemaVersion',
      'policy',
      'correlation',
      'evaluatedAt',
      'informationalOnly',
      'authorizesExecution',
      'requiresExecutionTimeValidation',
      'decision',
      'requiredAuthority',
      'approvalRequired',
      'applicableConstraints',
      'reasons',
      'reasonReferences',
      'evidence',
    ],
    'PolicyPrecheckResult',
  );
  if (record.kind !== 'PolicyPrecheckResult') {
    throw new TypeError('PolicyPrecheckResult.kind is invalid');
  }
  index_3.ContractVersionSchema.parse(record.schemaVersion);
  parsePolicyReference(record.policy, 'PolicyPrecheckResult.policy');
  index_1.CorrelationContextSchema.parse(record.correlation);
  index_1.Rfc3339TimestampSchema.parse(record.evaluatedAt);
  if (record.informationalOnly !== true) {
    throw new TypeError('PolicyPrecheckResult.informationalOnly must be true');
  }
  if (record.authorizesExecution !== false) {
    throw new TypeError('PolicyPrecheckResult.authorizesExecution must be false');
  }
  if (record.requiresExecutionTimeValidation !== true) {
    throw new TypeError('PolicyPrecheckResult.requiresExecutionTimeValidation must be true');
  }
  index_2.PolicyEvaluationDecisionSchema.parse(record.decision);
  parseRequiredAuthority(record.requiredAuthority);
  parseBoolean(record.approvalRequired, 'PolicyPrecheckResult.approvalRequired');
  if (!Array.isArray(record.applicableConstraints)) {
    throw new TypeError('PolicyPrecheckResult.applicableConstraints must be an array');
  }
  record.applicableConstraints.forEach(parseConstraint);
  parseStringArray(record.reasons, 'PolicyPrecheckResult.reasons');
  parseStringArray(record.reasonReferences, 'PolicyPrecheckResult.reasonReferences');
  parsePrecheckEvidence(record.evidence);
  return record;
});
