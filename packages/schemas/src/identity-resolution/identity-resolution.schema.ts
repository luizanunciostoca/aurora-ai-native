import { IDENTITY_KINDS, type IdentityKind } from '@aurora/contracts/context';
import type { CorrelationId, TenantId } from '@aurora/contracts/ids';
import type {
  IdentityResolutionEvidence,
  IdentityResolutionResult,
  ResolvedIdentity,
} from '@aurora/contracts/identity-resolution';
import type { ContractVersion } from '@aurora/contracts/versioning';
import {
  ActorRefSchema,
  ExternalIdentityRefSchema,
  SubjectRefSchema,
} from '../context/identity.schema';
import {
  asRecord,
  assertExactKeys,
  createRuntimeSchema,
  parseNonEmptyString,
} from '../context/internal';
import { CorrelationIdSchema, IdentityIdSchema, TenantIdSchema } from '../ids/id.schemas';
import { validateCanonicalError } from '../results/runtime-schema';
import { ContractVersionSchema } from '../versioning/version.schemas';

const IDENTITY_KIND_SET = new Set<string>(IDENTITY_KINDS);
const RESOLUTION_METHOD_SET = new Set(['CANONICAL_ID', 'EXTERNAL_BINDING']);
const FAILURE_STATUS_SET = new Set(['NOT_FOUND', 'AMBIGUOUS', 'CONFLICT']);
const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export interface ParsedIdentityResolutionRequest {
  readonly schemaVersion: ContractVersion;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly subject: ReturnType<typeof SubjectRefSchema.parse>;
  readonly expectedKind?: IdentityKind;
}

export const IdentityResolutionRequestSchema = createRuntimeSchema<ParsedIdentityResolutionRequest>(
  (value: unknown) => {
    const record = asRecord(value, 'IdentityResolutionRequest');
    assertExactKeys(
      record,
      ['schemaVersion', 'tenantId', 'correlationId', 'subject', 'expectedKind'],
      ['schemaVersion', 'tenantId', 'correlationId', 'subject'],
      'IdentityResolutionRequest',
    );

    let expectedKind: IdentityKind | undefined;
    if (record.expectedKind !== undefined) {
      if (typeof record.expectedKind !== 'string' || !IDENTITY_KIND_SET.has(record.expectedKind)) {
        throw new TypeError('IdentityResolutionRequest.expectedKind is invalid');
      }
      expectedKind = record.expectedKind as IdentityKind;
    }

    return {
      schemaVersion: ContractVersionSchema.parse(record.schemaVersion),
      tenantId: TenantIdSchema.parse(record.tenantId),
      correlationId: CorrelationIdSchema.parse(record.correlationId),
      subject: SubjectRefSchema.parse(record.subject),
      ...(expectedKind === undefined ? {} : { expectedKind }),
    };
  },
);

function parseTimestamp(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    !RFC3339_PATTERN.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new TypeError(`${label} must be a valid RFC3339 timestamp`);
  }
  return value;
}

function parseEvidence(value: unknown): IdentityResolutionEvidence {
  const record = asRecord(value, 'IdentityResolutionEvidence');
  assertExactKeys(
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
  if (!Number.isInteger(record.candidateCount) || (record.candidateCount as number) < 0) {
    throw new TypeError('IdentityResolutionEvidence.candidateCount must be a non-negative integer');
  }
  if (record.authorityGranted !== false) {
    throw new TypeError('IdentityResolutionEvidence.authorityGranted must be false');
  }

  return {
    method: record.method as IdentityResolutionEvidence['method'],
    tenantId: TenantIdSchema.parse(record.tenantId),
    correlationId: CorrelationIdSchema.parse(record.correlationId),
    resolvedAt: parseTimestamp(record.resolvedAt, 'IdentityResolutionEvidence.resolvedAt'),
    normalizedReference: parseNonEmptyString(
      record.normalizedReference,
      'IdentityResolutionEvidence.normalizedReference',
    ),
    candidateCount: record.candidateCount as number,
    authorityGranted: false,
  };
}

function parseResolvedIdentity(value: unknown): ResolvedIdentity {
  const record = asRecord(value, 'ResolvedIdentity');
  assertExactKeys(
    record,
    ['identityId', 'tenantId', 'kind', 'actor', 'matchedExternalIdentity'],
    ['identityId', 'tenantId', 'kind', 'actor'],
    'ResolvedIdentity',
  );
  if (typeof record.kind !== 'string' || !IDENTITY_KIND_SET.has(record.kind)) {
    throw new TypeError('ResolvedIdentity.kind is invalid');
  }

  const identityId = IdentityIdSchema.parse(record.identityId);
  const kind = record.kind as IdentityKind;
  const actor = ActorRefSchema.parse(record.actor);
  if (actor.identityId !== identityId || actor.kind !== kind) {
    throw new TypeError('ResolvedIdentity.actor must match identityId and kind');
  }

  return {
    identityId,
    tenantId: TenantIdSchema.parse(record.tenantId),
    kind,
    actor,
    ...(record.matchedExternalIdentity === undefined
      ? {}
      : {
          matchedExternalIdentity: ExternalIdentityRefSchema.parse(record.matchedExternalIdentity),
        }),
  };
}

export const IdentityResolutionResultSchema = createRuntimeSchema<IdentityResolutionResult>(
  (value: unknown) => {
    const record = asRecord(value, 'IdentityResolutionResult');
    if (record.status === 'RESOLVED') {
      assertExactKeys(
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
    assertExactKeys(
      record,
      ['status', 'error', 'evidence'],
      ['status', 'error', 'evidence'],
      'IdentityResolutionResult',
    );

    const errorValidation = validateCanonicalError(record.error, {
      contractVersion: (candidate: unknown): candidate is ContractVersion =>
        ContractVersionSchema.is(candidate),
      correlationId: (candidate: unknown): candidate is CorrelationId =>
        CorrelationIdSchema.is(candidate),
    });
    if (!errorValidation.success) {
      throw new TypeError(
        `IdentityResolutionResult.error is invalid: ${errorValidation.issues
          .map((issue) => `${issue.path}:${issue.code}`)
          .join(',')}`,
      );
    }

    return {
      status: record.status as Exclude<IdentityResolutionResult['status'], 'RESOLVED'>,
      error: errorValidation.data,
      evidence: parseEvidence(record.evidence),
    };
  },
);
