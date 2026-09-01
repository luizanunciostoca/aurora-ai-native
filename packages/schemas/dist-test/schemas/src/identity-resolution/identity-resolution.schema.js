'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.IdentityResolutionResultSchema = exports.IdentityResolutionRequestSchema = void 0;
const context_1 = require('@aurora/contracts/context');
const identity_schema_1 = require('../context/identity.schema');
const internal_1 = require('../context/internal');
const id_schemas_1 = require('../ids/id.schemas');
const runtime_schema_1 = require('../results/runtime-schema');
const version_schemas_1 = require('../versioning/version.schemas');
const IDENTITY_KIND_SET = new Set(context_1.IDENTITY_KINDS);
const RESOLUTION_METHOD_SET = new Set(['CANONICAL_ID', 'EXTERNAL_BINDING']);
const FAILURE_STATUS_SET = new Set(['NOT_FOUND', 'AMBIGUOUS', 'CONFLICT']);
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
exports.IdentityResolutionRequestSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'IdentityResolutionRequest');
  (0, internal_1.assertExactKeys)(
    record,
    ['schemaVersion', 'tenantId', 'correlationId', 'subject', 'expectedKind'],
    ['schemaVersion', 'tenantId', 'correlationId', 'subject'],
    'IdentityResolutionRequest',
  );
  let expectedKind;
  if (record.expectedKind !== undefined) {
    if (typeof record.expectedKind !== 'string' || !IDENTITY_KIND_SET.has(record.expectedKind)) {
      throw new TypeError('IdentityResolutionRequest.expectedKind is invalid');
    }
    expectedKind = record.expectedKind;
  }
  return {
    schemaVersion: version_schemas_1.ContractVersionSchema.parse(record.schemaVersion),
    tenantId: id_schemas_1.TenantIdSchema.parse(record.tenantId),
    correlationId: id_schemas_1.CorrelationIdSchema.parse(record.correlationId),
    subject: identity_schema_1.SubjectRefSchema.parse(record.subject),
    ...(expectedKind === undefined ? {} : { expectedKind }),
  };
});
function parseTimestamp(value, label) {
  if (
    typeof value !== 'string' ||
    !RFC3339_PATTERN.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new TypeError(`${label} must be a valid RFC3339 timestamp`);
  }
  return value;
}
function parseEvidence(value) {
  const record = (0, internal_1.asRecord)(value, 'IdentityResolutionEvidence');
  (0, internal_1.assertExactKeys)(
    record,
    [
      'method',
      'tenantId',
      'correlationId',
      'resolvedAt',
      'normalizedReference',
      'candidateCount',
      'authorityGranted',
    ],
    [
      'method',
      'tenantId',
      'correlationId',
      'resolvedAt',
      'normalizedReference',
      'candidateCount',
      'authorityGranted',
    ],
    'IdentityResolutionEvidence',
  );
  if (typeof record.method !== 'string' || !RESOLUTION_METHOD_SET.has(record.method)) {
    throw new TypeError('IdentityResolutionEvidence.method is invalid');
  }
  if (!Number.isInteger(record.candidateCount) || record.candidateCount < 0) {
    throw new TypeError('IdentityResolutionEvidence.candidateCount must be a non-negative integer');
  }
  if (record.authorityGranted !== false) {
    throw new TypeError('IdentityResolutionEvidence.authorityGranted must be false');
  }
  return {
    method: record.method,
    tenantId: id_schemas_1.TenantIdSchema.parse(record.tenantId),
    correlationId: id_schemas_1.CorrelationIdSchema.parse(record.correlationId),
    resolvedAt: parseTimestamp(record.resolvedAt, 'IdentityResolutionEvidence.resolvedAt'),
    normalizedReference: (0, internal_1.parseNonEmptyString)(
      record.normalizedReference,
      'IdentityResolutionEvidence.normalizedReference',
    ),
    candidateCount: record.candidateCount,
    authorityGranted: false,
  };
}
function parseResolvedIdentity(value) {
  const record = (0, internal_1.asRecord)(value, 'ResolvedIdentity');
  (0, internal_1.assertExactKeys)(
    record,
    ['identityId', 'tenantId', 'kind', 'actor', 'matchedExternalIdentity'],
    ['identityId', 'tenantId', 'kind', 'actor'],
    'ResolvedIdentity',
  );
  if (typeof record.kind !== 'string' || !IDENTITY_KIND_SET.has(record.kind)) {
    throw new TypeError('ResolvedIdentity.kind is invalid');
  }
  const identityId = id_schemas_1.IdentityIdSchema.parse(record.identityId);
  const kind = record.kind;
  const actor = identity_schema_1.ActorRefSchema.parse(record.actor);
  if (actor.identityId !== identityId || actor.kind !== kind) {
    throw new TypeError('ResolvedIdentity.actor must match identityId and kind');
  }
  return {
    identityId,
    tenantId: id_schemas_1.TenantIdSchema.parse(record.tenantId),
    kind,
    actor,
    ...(record.matchedExternalIdentity === undefined
      ? {}
      : {
          matchedExternalIdentity: identity_schema_1.ExternalIdentityRefSchema.parse(
            record.matchedExternalIdentity,
          ),
        }),
  };
}
exports.IdentityResolutionResultSchema = (0, internal_1.createRuntimeSchema)((value) => {
  const record = (0, internal_1.asRecord)(value, 'IdentityResolutionResult');
  if (record.status === 'RESOLVED') {
    (0, internal_1.assertExactKeys)(
      record,
      ['status', 'identity', 'evidence'],
      ['status', 'identity', 'evidence'],
      'IdentityResolutionResult',
    );
    const evidence = parseEvidence(record.evidence);
    if (evidence.candidateCount !== 1) {
      throw new TypeError('RESOLVED identity requires exactly one candidate');
    }
    return {
      status: 'RESOLVED',
      identity: parseResolvedIdentity(record.identity),
      evidence,
    };
  }
  if (typeof record.status !== 'string' || !FAILURE_STATUS_SET.has(record.status)) {
    throw new TypeError('IdentityResolutionResult.status is invalid');
  }
  (0, internal_1.assertExactKeys)(
    record,
    ['status', 'error', 'evidence'],
    ['status', 'error', 'evidence'],
    'IdentityResolutionResult',
  );
  const errorValidation = (0, runtime_schema_1.validateCanonicalError)(record.error, {
    contractVersion: (candidate) => version_schemas_1.ContractVersionSchema.is(candidate),
    correlationId: (candidate) => id_schemas_1.CorrelationIdSchema.is(candidate),
  });
  if (!errorValidation.success) {
    throw new TypeError(
      `IdentityResolutionResult.error is invalid: ${errorValidation.issues
        .map((issue) => `${issue.path}:${issue.code}`)
        .join(',')}`,
    );
  }
  return {
    status: record.status,
    error: errorValidation.data,
    evidence: parseEvidence(record.evidence),
  };
});
