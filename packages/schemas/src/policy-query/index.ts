import { POLICY_EVALUATION_REASONS } from '@aurora/contracts/policy-engine';

import { CorrelationContextSchema, Rfc3339TimestampSchema } from '../context/index';
import {
  asRecord,
  assertExactKeys,
  createRuntimeSchema,
  parseNonEmptyString,
} from '../context/internal';
import {
  PolicyEvaluationDecisionSchema,
  PolicyEvaluationRequestSchema,
  PolicySnapshotSchema,
  PolicySnapshotStateSchema,
} from '../policy-engine/index';
import { ContractVersionSchema, VersionSchema } from '../versioning/index';

/**
 * W02-F leaf schemas remain structurally bound to the canonical policy-query
 * contract while PB4 still owns public package publication. This avoids
 * consuming an unpublished subpath during the leaf acceptance build. PB4 must
 * replace this structural bridge with the published contract boundary.
 */
const POLICY_QUERY_REASONS = [
  'POLICY_FOUND',
  'POLICY_NOT_FOUND',
  'POLICY_REFERENCE_MISMATCH',
  'POLICY_VERSION_CHANGED',
  'PRECHECK_INFORMATIONAL_ONLY',
  'EXECUTION_VALIDATION_REQUIRED',
] as const;

type ParsedPolicyObject = Readonly<Record<string, unknown>>;

type RequiredAuthorityDescriptor =
  | {
      readonly required: false;
    }
  | {
      readonly required: true;
      readonly action: string;
      readonly scope: readonly string[];
      readonly subjectReference: string;
    };

interface ApplicablePolicyConstraint {
  readonly ruleId: string;
  readonly effect: 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL';
  readonly action: string;
  readonly scope: readonly string[];
  readonly tenantIds?: readonly string[];
  readonly actorKinds?: readonly string[];
  readonly actorIdentityIds?: readonly string[];
  readonly subjectReferences?: readonly string[];
  readonly purposeIds?: readonly string[];
  readonly jurisdictions?: readonly string[];
  readonly dataClassifications?: readonly string[];
  readonly consentRequired: boolean;
  readonly authorityRequired: boolean;
  readonly reasonReference?: string;
}

const QUERY_REASON_SET = new Set<string>(POLICY_QUERY_REASONS);
const PRECHECK_REASON_SET = new Set<string>([
  ...POLICY_QUERY_REASONS,
  ...POLICY_EVALUATION_REASONS,
]);

function parseBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean`);
  return value;
}

function parseStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value.map((entry, index) => parseNonEmptyString(entry, `${label}[${index}]`));
}

function parseScope(value: unknown, label: string): readonly string[] {
  const parsed = parseStringArray(value, label);
  if (parsed.length === 0) throw new TypeError(`${label} must be non-empty`);
  if (new Set(parsed).size !== parsed.length) {
    throw new TypeError(`${label} must not contain duplicate entries`);
  }
  return parsed;
}

function parsePolicyReference(value: unknown, label: string) {
  const record = asRecord(value, label);
  assertExactKeys(record, ['reference', 'version'], ['reference', 'version'], label);
  const reference = parseNonEmptyString(record.reference, `${label}.reference`);
  const version = VersionSchema.parse(record.version);
  return { reference, version };
}

function parseReasons(
  value: unknown,
  label: string,
  allowed: ReadonlySet<string>,
): readonly string[] {
  const reasons = parseStringArray(value, label);
  for (const reason of reasons) {
    if (!allowed.has(reason)) throw new TypeError(`${label} contains unsupported reason: ${reason}`);
  }
  return reasons;
}

function parseRequiredAuthority(value: unknown): RequiredAuthorityDescriptor {
  const record = asRecord(value, 'RequiredAuthorityDescriptor');
  assertExactKeys(
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
    action: parseNonEmptyString(record.action, 'RequiredAuthorityDescriptor.action'),
    scope: parseScope(record.scope, 'RequiredAuthorityDescriptor.scope'),
    subjectReference: parseNonEmptyString(
      record.subjectReference,
      'RequiredAuthorityDescriptor.subjectReference',
    ),
  };
}

function parseConstraint(value: unknown): ApplicablePolicyConstraint {
  const record = asRecord(value, 'ApplicablePolicyConstraint');
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
    ['ruleId', 'effect', 'action', 'scope', 'consentRequired', 'authorityRequired'],
    'ApplicablePolicyConstraint',
  );
  const result = {
    ruleId: parseNonEmptyString(record.ruleId, 'ApplicablePolicyConstraint.ruleId'),
    effect: PolicyEvaluationDecisionSchema.parse(record.effect),
    action: parseNonEmptyString(record.action, 'ApplicablePolicyConstraint.action'),
    scope: parseScope(record.scope, 'ApplicablePolicyConstraint.scope'),
    consentRequired: parseBoolean(
      record.consentRequired,
      'ApplicablePolicyConstraint.consentRequired',
    ),
    authorityRequired: parseBoolean(
      record.authorityRequired,
      'ApplicablePolicyConstraint.authorityRequired',
    ),
    ...(record.tenantIds === undefined
      ? {}
      : { tenantIds: parseStringArray(record.tenantIds, 'ApplicablePolicyConstraint.tenantIds') }),
    ...(record.actorKinds === undefined
      ? {}
      : { actorKinds: parseStringArray(record.actorKinds, 'ApplicablePolicyConstraint.actorKinds') }),
    ...(record.actorIdentityIds === undefined
      ? {}
      : {
          actorIdentityIds: parseStringArray(
            record.actorIdentityIds,
            'ApplicablePolicyConstraint.actorIdentityIds',
          ),
        }),
    ...(record.subjectReferences === undefined
      ? {}
      : {
          subjectReferences: parseStringArray(
            record.subjectReferences,
            'ApplicablePolicyConstraint.subjectReferences',
          ),
        }),
    ...(record.purposeIds === undefined
      ? {}
      : { purposeIds: parseStringArray(record.purposeIds, 'ApplicablePolicyConstraint.purposeIds') }),
    ...(record.jurisdictions === undefined
      ? {}
      : {
          jurisdictions: parseStringArray(
            record.jurisdictions,
            'ApplicablePolicyConstraint.jurisdictions',
          ),
        }),
    ...(record.dataClassifications === undefined
      ? {}
      : {
          dataClassifications: parseStringArray(
            record.dataClassifications,
            'ApplicablePolicyConstraint.dataClassifications',
          ),
        }),
    ...(record.reasonReference === undefined
      ? {}
      : {
          reasonReference: parseNonEmptyString(
            record.reasonReference,
            'ApplicablePolicyConstraint.reasonReference',
          ),
        }),
  };
  return result as ApplicablePolicyConstraint;
}

function parsePrecheckEvidence(value: unknown): void {
  const record = asRecord(value, 'PolicyPrecheckEvidence');
  assertExactKeys(
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
  parseNonEmptyString(record.tenantId, 'PolicyPrecheckEvidence.tenantId');
  parseNonEmptyString(record.actorIdentityId, 'PolicyPrecheckEvidence.actorIdentityId');
  parseNonEmptyString(record.subjectReference, 'PolicyPrecheckEvidence.subjectReference');
  parseNonEmptyString(record.action, 'PolicyPrecheckEvidence.action');
  parseScope(record.requestedScope, 'PolicyPrecheckEvidence.requestedScope');
  parseStringArray(record.matchedRuleIds, 'PolicyPrecheckEvidence.matchedRuleIds');
  parseNonEmptyString(record.inputFingerprint, 'PolicyPrecheckEvidence.inputFingerprint');
}

export const CurrentPolicyLookupRequestSchema = createRuntimeSchema<ParsedPolicyObject>(
  (value: unknown) => {
    const record = asRecord(value, 'CurrentPolicyLookupRequest');
    assertExactKeys(
      record,
      ['kind', 'schemaVersion', 'expectedPolicy', 'correlation', 'evaluatedAt'],
      ['kind', 'schemaVersion', 'expectedPolicy', 'correlation', 'evaluatedAt'],
      'CurrentPolicyLookupRequest',
    );
    if (record.kind !== 'CurrentPolicyLookupRequest') {
      throw new TypeError('CurrentPolicyLookupRequest.kind is invalid');
    }
    ContractVersionSchema.parse(record.schemaVersion);
    parsePolicyReference(record.expectedPolicy, 'CurrentPolicyLookupRequest.expectedPolicy');
    CorrelationContextSchema.parse(record.correlation);
    Rfc3339TimestampSchema.parse(record.evaluatedAt);
    return record;
  },
);

export const CurrentPolicyLookupResultSchema = createRuntimeSchema<ParsedPolicyObject>(
  (value: unknown) => {
    const record = asRecord(value, 'CurrentPolicyLookupResult');
    assertExactKeys(
      record,
      [
        'kind',
        'schemaVersion',
        'expectedPolicy',
        'correlation',
        'evaluatedAt',
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
    ContractVersionSchema.parse(record.schemaVersion);
    const expectedPolicy = parsePolicyReference(
      record.expectedPolicy,
      'CurrentPolicyLookupResult.expectedPolicy',
    );
    CorrelationContextSchema.parse(record.correlation);
    Rfc3339TimestampSchema.parse(record.evaluatedAt);
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
    parseReasons(record.reasons, 'CurrentPolicyLookupResult.reasons', QUERY_REASON_SET);
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
    PolicySnapshotStateSchema.parse(record.state);
    const snapshot = PolicySnapshotSchema.parse(record.snapshot);
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
  },
);

export const PolicyPrecheckRequestSchema = createRuntimeSchema<ParsedPolicyObject>(
  (value: unknown) => {
    const record = asRecord(value, 'PolicyPrecheckRequest');
    assertExactKeys(
      record,
      ['kind', 'policyEvaluation'],
      ['kind', 'policyEvaluation'],
      'PolicyPrecheckRequest',
    );
    if (record.kind !== 'PolicyPrecheckRequest') {
      throw new TypeError('PolicyPrecheckRequest.kind is invalid');
    }
    const policyEvaluation = PolicyEvaluationRequestSchema.parse(record.policyEvaluation);
    if (policyEvaluation.ownerDecision !== undefined || policyEvaluation.policyToken !== undefined) {
      throw new TypeError('PolicyPrecheckRequest must not contain executable authority evidence');
    }
    return record;
  },
);

export const PolicyPrecheckResultSchema = createRuntimeSchema<ParsedPolicyObject>(
  (value: unknown) => {
    const record = asRecord(value, 'PolicyPrecheckResult');
    assertExactKeys(
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
    ContractVersionSchema.parse(record.schemaVersion);
    parsePolicyReference(record.policy, 'PolicyPrecheckResult.policy');
    CorrelationContextSchema.parse(record.correlation);
    Rfc3339TimestampSchema.parse(record.evaluatedAt);
    if (record.informationalOnly !== true) {
      throw new TypeError('PolicyPrecheckResult.informationalOnly must be true');
    }
    if (record.authorizesExecution !== false) {
      throw new TypeError('PolicyPrecheckResult.authorizesExecution must be false');
    }
    if (record.requiresExecutionTimeValidation !== true) {
      throw new TypeError('PolicyPrecheckResult.requiresExecutionTimeValidation must be true');
    }
    PolicyEvaluationDecisionSchema.parse(record.decision);
    parseRequiredAuthority(record.requiredAuthority);
    parseBoolean(record.approvalRequired, 'PolicyPrecheckResult.approvalRequired');
    if (!Array.isArray(record.applicableConstraints)) {
      throw new TypeError('PolicyPrecheckResult.applicableConstraints must be an array');
    }
    record.applicableConstraints.forEach(parseConstraint);
    parseReasons(record.reasons, 'PolicyPrecheckResult.reasons', PRECHECK_REASON_SET);
    parseStringArray(record.reasonReferences, 'PolicyPrecheckResult.reasonReferences');
    parsePrecheckEvidence(record.evidence);
    return record;
  },
);
