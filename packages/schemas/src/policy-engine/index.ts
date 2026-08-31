import type {
  PolicyEvaluationDecision,
  PolicyEvaluationRequest,
  PolicyEvaluationResult,
  PolicyRule,
  PolicySnapshot,
  PolicySnapshotState,
} from '@aurora/contracts/policy-engine';
import {
  asRecord,
  assertExactKeys,
  createRuntimeSchema,
  parseNonEmptyString,
} from '../context/internal';

const DECISIONS = new Set<string>(['ALLOW', 'DENY', 'REQUIRE_APPROVAL']);
const SNAPSHOT_STATES = new Set<string>(['ACTIVE', 'UNKNOWN']);

function parseStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value.map((item, index) => parseNonEmptyString(item, `${label}[${index}]`));
}

export const PolicyEvaluationDecisionSchema = createRuntimeSchema<PolicyEvaluationDecision>(
  (value: unknown) => {
    if (typeof value !== 'string' || !DECISIONS.has(value)) {
      throw new TypeError('PolicyEvaluationDecision is invalid');
    }
    return value as PolicyEvaluationDecision;
  },
);

export const PolicySnapshotStateSchema = createRuntimeSchema<PolicySnapshotState>(
  (value: unknown) => {
    if (typeof value !== 'string' || !SNAPSHOT_STATES.has(value)) {
      throw new TypeError('PolicySnapshotState is invalid');
    }
    return value as PolicySnapshotState;
  },
);

export const PolicyRuleSchema = createRuntimeSchema<PolicyRule>((value: unknown) => {
  const record = asRecord(value, 'PolicyRule');
  assertExactKeys(
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
  parseNonEmptyString(record.ruleId, 'PolicyRule.ruleId');
  PolicyEvaluationDecisionSchema.parse(record.effect);
  parseNonEmptyString(record.action, 'PolicyRule.action');
  parseStringArray(record.scope, 'PolicyRule.scope');
  for (const key of [
    'tenantIds',
    'actorKinds',
    'actorIdentityIds',
    'subjectReferences',
    'purposeIds',
    'jurisdictions',
    'dataClassifications',
  ] as const) {
    if (record[key] !== undefined) parseStringArray(record[key], `PolicyRule.${key}`);
  }
  for (const key of ['consentRequired', 'authorityRequired'] as const) {
    if (record[key] !== undefined && typeof record[key] !== 'boolean') {
      throw new TypeError(`PolicyRule.${key} must be boolean`);
    }
  }
  if (record.reasonReference !== undefined) {
    parseNonEmptyString(record.reasonReference, 'PolicyRule.reasonReference');
  }
  return value as PolicyRule;
});

export const PolicySnapshotSchema = createRuntimeSchema<PolicySnapshot>((value: unknown) => {
  const record = asRecord(value, 'PolicySnapshot');
  assertExactKeys(
    record,
    ['kind', 'policy', 'state', 'rules'],
    ['kind', 'policy', 'state', 'rules'],
    'PolicySnapshot',
  );
  if (record.kind !== 'PolicySnapshot') throw new TypeError('PolicySnapshot.kind is invalid');
  const policy = asRecord(record.policy, 'PolicySnapshot.policy');
  assertExactKeys(
    policy,
    ['reference', 'version'],
    ['reference', 'version'],
    'PolicySnapshot.policy',
  );
  parseNonEmptyString(policy.reference, 'PolicySnapshot.policy.reference');
  parseNonEmptyString(policy.version, 'PolicySnapshot.policy.version');
  PolicySnapshotStateSchema.parse(record.state);
  if (!Array.isArray(record.rules)) throw new TypeError('PolicySnapshot.rules must be an array');
  record.rules.forEach((rule) => PolicyRuleSchema.parse(rule));
  return value as PolicySnapshot;
});

export const PolicyEvaluationRequestSchema = createRuntimeSchema<PolicyEvaluationRequest>(
  (value: unknown) => {
    const record = asRecord(value, 'PolicyEvaluationRequest');
    assertExactKeys(
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
    parseNonEmptyString(record.schemaVersion, 'PolicyEvaluationRequest.schemaVersion');
    parseNonEmptyString(record.evaluatedAt, 'PolicyEvaluationRequest.evaluatedAt');
    parseNonEmptyString(record.action, 'PolicyEvaluationRequest.action');
    parseStringArray(record.requestedScope, 'PolicyEvaluationRequest.requestedScope');
    PolicySnapshotSchema.parse(record.snapshot);
    for (const key of [
      'policy',
      'correlation',
      'tenant',
      'tenantBoundary',
      'actor',
      'subject',
      'purpose',
      'jurisdiction',
    ] as const) {
      asRecord(record[key], `PolicyEvaluationRequest.${key}`);
    }
    if (
      record.jurisdictionRestrictions !== undefined &&
      !Array.isArray(record.jurisdictionRestrictions)
    ) {
      throw new TypeError('PolicyEvaluationRequest.jurisdictionRestrictions must be an array');
    }
    return value as PolicyEvaluationRequest;
  },
);

export const PolicyEvaluationResultSchema = createRuntimeSchema<PolicyEvaluationResult>(
  (value: unknown) => {
    const record = asRecord(value, 'PolicyEvaluationResult');
    assertExactKeys(
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
    if (record.kind !== 'PolicyEvaluationResult')
      throw new TypeError('PolicyEvaluationResult.kind is invalid');
    const decision = PolicyEvaluationDecisionSchema.parse(record.decision);
    parseNonEmptyString(record.schemaVersion, 'PolicyEvaluationResult.schemaVersion');
    parseNonEmptyString(record.evaluatedAt, 'PolicyEvaluationResult.evaluatedAt');
    parseStringArray(record.reasons, 'PolicyEvaluationResult.reasons');
    asRecord(record.policy, 'PolicyEvaluationResult.policy');
    asRecord(record.correlation, 'PolicyEvaluationResult.correlation');
    asRecord(record.evidence, 'PolicyEvaluationResult.evidence');
    if (decision === 'DENY' && record.error === undefined) {
      throw new TypeError('PolicyEvaluationResult DENY requires CanonicalError');
    }
    if (decision !== 'DENY' && record.error !== undefined) {
      throw new TypeError('PolicyEvaluationResult non-DENY must not carry error');
    }
    return value as PolicyEvaluationResult;
  },
);
