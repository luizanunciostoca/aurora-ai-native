import {
  POLICY_QUERY_REASONS,
  type ApplicablePolicyConstraint,
  type CurrentPolicyLookupRequest,
  type CurrentPolicyLookupResult,
  type PolicyPrecheckRequest,
  type PolicyPrecheckResult,
  type RequiredAuthorityDescriptor,
} from '@aurora/contracts/policy-query';
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
  return value.map((entry, index) =>
    parseNonEmptyString(entry, `${label}[${index}]`),
  );
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
  assertExactKeys(
    record,
    ['reference', 'version'],
    ['reference', 'version'],
    label,
  );
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
    if (!allowed.has(reason)) {
      throw new TypeError(`${label} contains unsupported reason: ${reason}`);
    }
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
  const required = parseBoolean(
    record.required,
    'RequiredAuthorityDescriptor.required',
  );
  if (!required) {
    if (
      record.action !== undefined ||
      record.scope !== undefined ||
      record.subjectReference !== undefined
    ) {
      throw new TypeError(
        'non-required authority must not contain authority details',
      );
    }
    return { required: false };
  }
  if (
    record.action === undefined ||
    record.scope === undefined ||
    record.subjectReference === undefined
  ) {
    throw new TypeError(
      'required authority must contain action, scope and subjectReference',
    );
  }
  return {
    required: true,
    action: parseNonEmptyString(
      record.action,
      'RequiredAuthorityDescriptor.action',
    ),
    scope: parseScope(record.scope, 'RequiredAuthorityDescriptor.scope'),
    subjectReference: parseNonEmptyString(
      record.subjectReference,
      'RequiredAuthorityDescriptor.subjectReference',
    ),
  };
}

function optionalStringArray(
  record: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
): readonly string[] | undefined {
  const value = record[key];
  return value === undefined ? undefined : parseStringArray(value, label);
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
    [
      'ruleId',
      'effect',
      'action',
      'scope',
      'consentRequired',
      'authorityRequired',
    ],
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
    ruleId: parseNonEmptyString(
      record.ruleId,
      'ApplicablePolicyConstraint.ruleId',
    ),
    effect: PolicyEvaluationDecisionSchema.parse(record.effect),
    action: parseNonEmptyString(
      record.action,
      'ApplicablePolicyConstraint.action',
    ),
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
          reasonReference: parseNonEmptyString(
            record.reasonReference,
            'ApplicablePolicyConstraint.reasonReference',
          ),
        }),
  } as ApplicablePolicyConstraint;
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
  parseNonEmptyString(
    record.actorIdentityId,
    'PolicyPrecheckEvidence.actorIdentityId',
  );
  parseNonEmptyString(
    record.subjectReference,
    'PolicyPrecheckEvidence.subjectReference',
  );
  parseNonEmptyString(record.action, 'PolicyPrecheckEvidence.action');
  parseScope(record.requestedScope, 'PolicyPrecheckEvidence.requestedScope');
  parseStringArray(
    record.matchedRuleIds,
    'PolicyPrecheckEvidence.matchedRuleIds',
  );
  parseNonEmptyString(
    record.inputFingerprint,
    'PolicyPrecheckEvidence.inputFingerprint',
  );
}

export const CurrentPolicyLookupRequestSchema =
  createRuntimeSchema<CurrentPolicyLookupRequest>((value: unknown) => {
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
    parsePolicyReference(
      record.expectedPolicy,
      'CurrentPolicyLookupRequest.expectedPolicy',
    );
    CorrelationContextSchema.parse(record.correlation);
    Rfc3339TimestampSchema.parse(record.evaluatedAt);
    return record as unknown as CurrentPolicyLookupRequest;
  });

export const CurrentPolicyLookupResultSchema =
  createRuntimeSchema<CurrentPolicyLookupResult>((value: unknown) => {
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
      throw new TypeError(
        'CurrentPolicyLookupResult.informationalOnly must be true',
      );
    }
    if (record.authorizesExecution !== false) {
      throw new TypeError(
        'CurrentPolicyLookupResult.authorizesExecution must be false',
      );
    }
    if (record.requiresExecutionTimeValidation !== true) {
      throw new TypeError(
        'CurrentPolicyLookupResult.requiresExecutionTimeValidation must be true',
      );
    }
    const found = parseBoolean(record.found, 'CurrentPolicyLookupResult.found');
    parseReasons(
      record.reasons,
      'CurrentPolicyLookupResult.reasons',
      QUERY_REASON_SET,
    );

    if (!found) {
      if (
        record.currentPolicy !== undefined ||
        record.state !== undefined ||
        record.snapshot !== undefined ||
        record.versionChanged !== undefined
      ) {
        throw new TypeError(
          'not-found CurrentPolicyLookupResult must not contain current policy',
        );
      }
      return record as unknown as CurrentPolicyLookupResult;
    }

    if (
      record.currentPolicy === undefined ||
      record.state === undefined ||
      record.snapshot === undefined ||
      record.versionChanged === undefined
    ) {
      throw new TypeError(
        'found CurrentPolicyLookupResult requires current policy fields',
      );
    }

    const currentPolicy = parsePolicyReference(
      record.currentPolicy,
      'CurrentPolicyLookupResult.currentPolicy',
    );
    PolicySnapshotStateSchema.parse(record.state);
    const snapshot = PolicySnapshotSchema.parse(record.snapshot);
    parseBoolean(
      record.versionChanged,
      'CurrentPolicyLookupResult.versionChanged',
    );
    if (currentPolicy.reference !== expectedPolicy.reference) {
      throw new TypeError(
        'found current policy reference must match expected reference',
      );
    }
    if (
      snapshot.policy.reference !== currentPolicy.reference ||
      snapshot.policy.version !== currentPolicy.version
    ) {
      throw new TypeError(
        'CurrentPolicyLookupResult snapshot/currentPolicy mismatch',
      );
    }
    return record as unknown as CurrentPolicyLookupResult;
  });

export const PolicyPrecheckRequestSchema =
  createRuntimeSchema<PolicyPrecheckRequest>((value: unknown) => {
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
    const policyEvaluation = PolicyEvaluationRequestSchema.parse(
      record.policyEvaluation,
    );
    if (
      policyEvaluation.ownerDecision !== undefined ||
      policyEvaluation.policyToken !== undefined
    ) {
      throw new TypeError(
        'PolicyPrecheckRequest must not contain executable authority evidence',
      );
    }
    return record as unknown as PolicyPrecheckRequest;
  });

export const PolicyPrecheckResultSchema =
  createRuntimeSchema<PolicyPrecheckResult>((value: unknown) => {
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
      throw new TypeError(
        'PolicyPrecheckResult.authorizesExecution must be false',
      );
    }
    if (record.requiresExecutionTimeValidation !== true) {
      throw new TypeError(
        'PolicyPrecheckResult.requiresExecutionTimeValidation must be true',
      );
    }
    PolicyEvaluationDecisionSchema.parse(record.decision);
    parseRequiredAuthority(record.requiredAuthority);
    parseBoolean(
      record.approvalRequired,
      'PolicyPrecheckResult.approvalRequired',
    );
    if (!Array.isArray(record.applicableConstraints)) {
      throw new TypeError(
        'PolicyPrecheckResult.applicableConstraints must be an array',
      );
    }
    record.applicableConstraints.forEach(parseConstraint);
    parseReasons(
      record.reasons,
      'PolicyPrecheckResult.reasons',
      PRECHECK_REASON_SET,
    );
    parseStringArray(
      record.reasonReferences,
      'PolicyPrecheckResult.reasonReferences',
    );
    parsePrecheckEvidence(record.evidence);
    return record as unknown as PolicyPrecheckResult;
  });
