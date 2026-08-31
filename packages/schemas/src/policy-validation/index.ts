import type {
  AuthorityEvaluationRequest,
  AuthorityEvaluationResult,
  PolicyTokenValidationRequest,
  PolicyTokenValidationResult,
} from '@aurora/contracts/policy-validation';

import {
  ActorRefSchema,
  CorrelationContextSchema,
  Rfc3339TimestampSchema,
  SubjectRefSchema,
  TenantContextSchema,
} from '../context/index.js';
import {
  asRecord,
  assertExactKeys,
  createRuntimeSchema,
  parseNonEmptyString,
} from '../context/internal.js';
import { DecisionIdSchema, PolicyTokenIdSchema } from '../ids/index.js';
import {
  createOwnerDecisionSchema,
  createPolicyTokenSchema,
} from '../policy/index.js';
import { optionalConstraints } from '../policy/validation.js';
import {
  PolicyEvaluationDecisionSchema,
  PolicyEvaluationRequestSchema,
  PolicyEvaluationResultSchema,
} from '../policy-engine/index.js';
import { ContractVersionSchema, VersionSchema } from '../versioning/index.js';

const policyDependencies = {
  contractVersion: ContractVersionSchema,
  decisionId: DecisionIdSchema,
  policyTokenId: PolicyTokenIdSchema,
  actor: ActorRefSchema,
  tenant: TenantContextSchema,
  correlation: CorrelationContextSchema,
  timestamp: Rfc3339TimestampSchema,
  version: VersionSchema,
};

const PolicyTokenWireSchema = createPolicyTokenSchema(policyDependencies);
const OwnerDecisionWireSchema = createOwnerDecisionSchema(policyDependencies);

function parseScope(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty array`);
  }
  const parsed = value.map((entry, index) => parseNonEmptyString(entry, `${label}[${index}]`));
  if (new Set(parsed).size !== parsed.length) {
    throw new TypeError(`${label} must not contain duplicate entries`);
  }
  return parsed;
}

function parseStringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value.map((entry, index) => parseNonEmptyString(entry, `${label}[${index}]`));
}

function parsePolicyReference(value: unknown, label: string): void {
  const record = asRecord(value, label);
  assertExactKeys(record, ['reference', 'version'], ['reference', 'version'], label);
  parseNonEmptyString(record.reference, `${label}.reference`);
  VersionSchema.parse(record.version);
}

function parseBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be boolean`);
  return value;
}

function parseRevocationIds(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value.map((entry) => PolicyTokenIdSchema.parse(entry));
}

function parseCanonicalError(value: unknown, label: string): void {
  const record = asRecord(value, label);
  for (const required of [
    'kind',
    'schemaVersion',
    'code',
    'category',
    'message',
    'retryability',
    'correlationId',
    'timestamp',
  ] as const) {
    if (!(required in record)) throw new TypeError(`${label} is missing required field: ${required}`);
  }
  if (record.kind !== 'CanonicalError') throw new TypeError(`${label}.kind is invalid`);
  parseNonEmptyString(record.schemaVersion, `${label}.schemaVersion`);
  parseNonEmptyString(record.code, `${label}.code`);
  parseNonEmptyString(record.category, `${label}.category`);
  parseNonEmptyString(record.message, `${label}.message`);
  parseNonEmptyString(record.retryability, `${label}.retryability`);
  parseNonEmptyString(record.correlationId, `${label}.correlationId`);
  Rfc3339TimestampSchema.parse(record.timestamp);
}

function parseTokenValidationEvidence(value: unknown): void {
  const record = asRecord(value, 'PolicyTokenValidationEvidence');
  assertExactKeys(
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
  if (record.policyTokenId !== undefined) PolicyTokenIdSchema.parse(record.policyTokenId);
  parseNonEmptyString(record.tenantId, 'PolicyTokenValidationEvidence.tenantId');
  parseNonEmptyString(record.actorIdentityId, 'PolicyTokenValidationEvidence.actorIdentityId');
  parseNonEmptyString(record.subjectReference, 'PolicyTokenValidationEvidence.subjectReference');
  parseNonEmptyString(record.action, 'PolicyTokenValidationEvidence.action');
  parseScope(record.requestedScope, 'PolicyTokenValidationEvidence.requestedScope');
  if (!Array.isArray(record.effectiveScope)) {
    throw new TypeError('PolicyTokenValidationEvidence.effectiveScope must be an array');
  }
  record.effectiveScope.forEach((entry, index) =>
    parseNonEmptyString(entry, `PolicyTokenValidationEvidence.effectiveScope[${index}]`),
  );
  parsePolicyReference(record.currentPolicy, 'PolicyTokenValidationEvidence.currentPolicy');
  parseNonEmptyString(record.inputFingerprint, 'PolicyTokenValidationEvidence.inputFingerprint');
}

function parseAuthorityEvaluationEvidence(value: unknown): void {
  const record = asRecord(value, 'AuthorityEvaluationEvidence');
  assertExactKeys(
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
  parseNonEmptyString(record.tenantId, 'AuthorityEvaluationEvidence.tenantId');
  parseNonEmptyString(record.actorIdentityId, 'AuthorityEvaluationEvidence.actorIdentityId');
  parseNonEmptyString(record.subjectReference, 'AuthorityEvaluationEvidence.subjectReference');
  parseNonEmptyString(record.action, 'AuthorityEvaluationEvidence.action');
  parseScope(record.requestedScope, 'AuthorityEvaluationEvidence.requestedScope');
  if (!Array.isArray(record.effectiveScope)) {
    throw new TypeError('AuthorityEvaluationEvidence.effectiveScope must be an array');
  }
  record.effectiveScope.forEach((entry, index) =>
    parseNonEmptyString(entry, `AuthorityEvaluationEvidence.effectiveScope[${index}]`),
  );
  parsePolicyReference(record.currentPolicy, 'AuthorityEvaluationEvidence.currentPolicy');
  parseNonEmptyString(record.inputFingerprint, 'AuthorityEvaluationEvidence.inputFingerprint');
}

export const PolicyTokenValidationRequestSchema = createRuntimeSchema<PolicyTokenValidationRequest>(
  (value: unknown) => {
    const record = asRecord(value, 'PolicyTokenValidationRequest');
    assertExactKeys(
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
    ContractVersionSchema.parse(record.schemaVersion);
    PolicyTokenWireSchema.parse(record.token);
    Rfc3339TimestampSchema.parse(record.evaluatedAt);
    CorrelationContextSchema.parse(record.correlation);
    TenantContextSchema.parse(record.tenant);
    ActorRefSchema.parse(record.actor);
    SubjectRefSchema.parse(record.subject);
    parseNonEmptyString(record.action, 'PolicyTokenValidationRequest.action');
    parseScope(record.requestedScope, 'PolicyTokenValidationRequest.requestedScope');
    parsePolicyReference(record.policy, 'PolicyTokenValidationRequest.policy');
    if (record.operationConstraints !== undefined) optionalConstraints(record.operationConstraints);
    if (record.ownerDecision !== undefined) OwnerDecisionWireSchema.parse(record.ownerDecision);
    if (record.revokedPolicyTokenIds !== undefined) {
      parseRevocationIds(record.revokedPolicyTokenIds, 'PolicyTokenValidationRequest.revokedPolicyTokenIds');
    }
    if (record.requireCorrelationMatch !== undefined) {
      parseBoolean(record.requireCorrelationMatch, 'PolicyTokenValidationRequest.requireCorrelationMatch');
    }
    return record as unknown as PolicyTokenValidationRequest;
  },
);

export const PolicyTokenValidationResultSchema = createRuntimeSchema<PolicyTokenValidationResult>(
  (value: unknown) => {
    const record = asRecord(value, 'PolicyTokenValidationResult');
    assertExactKeys(
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
    ContractVersionSchema.parse(record.schemaVersion);
    const valid = parseBoolean(record.valid, 'PolicyTokenValidationResult.valid');
    CorrelationContextSchema.parse(record.correlation);
    Rfc3339TimestampSchema.parse(record.evaluatedAt);
    parsePolicyReference(record.currentPolicy, 'PolicyTokenValidationResult.currentPolicy');
    if (!Array.isArray(record.effectiveScope)) {
      throw new TypeError('PolicyTokenValidationResult.effectiveScope must be an array');
    }
    record.effectiveScope.forEach((entry, index) =>
      parseNonEmptyString(entry, `PolicyTokenValidationResult.effectiveScope[${index}]`),
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
    return record as unknown as PolicyTokenValidationResult;
  },
);

export const AuthorityEvaluationRequestSchema = createRuntimeSchema<AuthorityEvaluationRequest>(
  (value: unknown) => {
    const record = asRecord(value, 'AuthorityEvaluationRequest');
    assertExactKeys(
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
    const policyEvaluation = PolicyEvaluationRequestSchema.parse(record.policyEvaluation);
    if (policyEvaluation.policyToken !== undefined) {
      PolicyTokenWireSchema.parse(policyEvaluation.policyToken);
    }
    if (policyEvaluation.ownerDecision !== undefined) {
      OwnerDecisionWireSchema.parse(policyEvaluation.ownerDecision);
    }
    if (record.operationConstraints !== undefined) optionalConstraints(record.operationConstraints);
    if (record.revokedPolicyTokenIds !== undefined) {
      parseRevocationIds(record.revokedPolicyTokenIds, 'AuthorityEvaluationRequest.revokedPolicyTokenIds');
    }
    if (record.requireCorrelationMatch !== undefined) {
      parseBoolean(record.requireCorrelationMatch, 'AuthorityEvaluationRequest.requireCorrelationMatch');
    }
    return record as unknown as AuthorityEvaluationRequest;
  },
);

export const AuthorityEvaluationResultSchema = createRuntimeSchema<AuthorityEvaluationResult>(
  (value: unknown) => {
    const record = asRecord(value, 'AuthorityEvaluationResult');
    assertExactKeys(
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
    ContractVersionSchema.parse(record.schemaVersion);
    const authorized = parseBoolean(record.authorized, 'AuthorityEvaluationResult.authorized');
    CorrelationContextSchema.parse(record.correlation);
    Rfc3339TimestampSchema.parse(record.evaluatedAt);
    parsePolicyReference(record.currentPolicy, 'AuthorityEvaluationResult.currentPolicy');
    if (!Array.isArray(record.effectiveScope)) {
      throw new TypeError('AuthorityEvaluationResult.effectiveScope must be an array');
    }
    record.effectiveScope.forEach((entry, index) =>
      parseNonEmptyString(entry, `AuthorityEvaluationResult.effectiveScope[${index}]`),
    );
    parseStringArray(record.reasons, 'AuthorityEvaluationResult.reasons');
    parseAuthorityEvaluationEvidence(record.evidence);
    if (record.tokenValidation !== undefined) {
      PolicyTokenValidationResultSchema.parse(record.tokenValidation);
    }
    if (record.policyDecision !== undefined) {
      PolicyEvaluationDecisionSchema.parse(record.policyDecision);
    }
    if (record.policyResult !== undefined) {
      PolicyEvaluationResultSchema.parse(record.policyResult);
    }
    if (authorized) {
      if (record.effectiveScope.length === 0) {
        throw new TypeError('authorized AuthorityEvaluationResult requires non-empty effectiveScope');
      }
      if (record.policyDecision !== 'ALLOW') {
        throw new TypeError('authorized AuthorityEvaluationResult requires policyDecision ALLOW');
      }
      const policyResult = PolicyEvaluationResultSchema.parse(record.policyResult);
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
    return record as unknown as AuthorityEvaluationResult;
  },
);
