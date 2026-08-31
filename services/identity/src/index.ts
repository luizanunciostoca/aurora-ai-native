import type { ExternalIdentityRef, SubjectRef } from '@aurora/contracts/context';
import type { CorrelationId } from '@aurora/contracts/ids';
import {
  ERROR_CODE_DEFINITIONS,
  type CanonicalError,
  type ErrorCode,
} from '@aurora/contracts/results';
import type { ContractVersion } from '@aurora/contracts/versioning';
import type {
  IdentityResolutionEvidence,
  IdentityResolutionRecord,
  IdentityResolutionRequest,
  IdentityResolutionResult,
  ResolvedIdentity,
} from '@aurora/contracts/identity-resolution';

function externalKey(reference: ExternalIdentityRef): string {
  return `${reference.provider}:${reference.externalId}`;
}

function subjectKey(subject: SubjectRef): string {
  return subject.kind === 'IDENTITY'
    ? `identity:${subject.identityId}`
    : `external:${externalKey(subject.externalIdentity)}`;
}

function errorFor(
  code: ErrorCode,
  message: string,
  schemaVersion: ContractVersion,
  correlationId: CorrelationId,
  timestamp: string,
): CanonicalError<ContractVersion, CorrelationId> {
  const definition = ERROR_CODE_DEFINITIONS[code];
  return {
    kind: 'CanonicalError',
    schemaVersion,
    code,
    category: definition.category,
    message,
    retryability: definition.retryability,
    correlationId,
    timestamp,
  };
}

export class DeterministicIdentityResolver {
  readonly #records: readonly IdentityResolutionRecord[];
  readonly #now: () => string;

  constructor(records: readonly IdentityResolutionRecord[], now: () => string) {
    this.#records = [...records];
    this.#now = now;
  }

  resolve(request: IdentityResolutionRequest): IdentityResolutionResult {
    const timestamp = this.#now();
    const method = request.subject.kind === 'IDENTITY' ? 'CANONICAL_ID' : 'EXTERNAL_BINDING';
    const inTenant = this.#records.filter((record) => record.tenantId === request.tenantId);
    const candidates = this.#findCandidates(request.subject, inTenant);
    const evidence = this.#evidence(request, method, timestamp, candidates.length);

    if (candidates.length === 0) {
      const existsInOtherTenant = this.#findCandidates(request.subject, this.#records).length > 0;
      return {
        status: existsInOtherTenant ? 'CONFLICT' : 'NOT_FOUND',
        error: errorFor(
          existsInOtherTenant ? 'FORBIDDEN' : 'NOT_FOUND',
          existsInOtherTenant
            ? 'Identity reference is not valid for the requested tenant'
            : 'Identity reference was not found',
          request.schemaVersion,
          request.correlationId,
          timestamp,
        ),
        evidence,
      };
    }

    if (candidates.length > 1) {
      return {
        status: 'AMBIGUOUS',
        error: errorFor(
          'CONFLICT',
          'Identity reference resolves to multiple canonical identities',
          request.schemaVersion,
          request.correlationId,
          timestamp,
        ),
        evidence,
      };
    }

    const record = candidates[0];
    if (record === undefined) throw new Error('Unreachable identity candidate state');

    if (request.expectedKind !== undefined && record.kind !== request.expectedKind) {
      return {
        status: 'CONFLICT',
        error: errorFor(
          'CONFLICT',
          'Resolved identity kind does not match the requested kind',
          request.schemaVersion,
          request.correlationId,
          timestamp,
        ),
        evidence,
      };
    }

    const matchedExternalIdentity =
      request.subject.kind === 'EXTERNAL_IDENTITY' ? request.subject.externalIdentity : undefined;
    const identity: ResolvedIdentity = {
      identityId: record.identityId,
      tenantId: record.tenantId,
      kind: record.kind,
      actor: {
        kind: record.kind,
        identityId: record.identityId,
        ...(matchedExternalIdentity === undefined
          ? {}
          : { externalIdentity: matchedExternalIdentity }),
      },
      ...(matchedExternalIdentity === undefined ? {} : { matchedExternalIdentity }),
    };

    return { status: 'RESOLVED', identity, evidence };
  }

  #findCandidates(
    subject: SubjectRef,
    source: readonly IdentityResolutionRecord[],
  ): IdentityResolutionRecord[] {
    if (subject.kind === 'IDENTITY') {
      return source.filter((record) => record.identityId === subject.identityId);
    }
    const key = externalKey(subject.externalIdentity);
    return source.filter((record) =>
      (record.externalIdentities ?? []).some((reference) => externalKey(reference) === key),
    );
  }

  #evidence(
    request: IdentityResolutionRequest,
    method: IdentityResolutionEvidence['method'],
    timestamp: string,
    candidateCount: number,
  ): IdentityResolutionEvidence {
    return {
      method,
      tenantId: request.tenantId,
      correlationId: request.correlationId,
      resolvedAt: timestamp,
      normalizedReference: subjectKey(request.subject),
      candidateCount,
      authorityGranted: false,
    };
  }
}
