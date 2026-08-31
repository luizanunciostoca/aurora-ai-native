import type { ExternalIdentityRef, SubjectRef } from '@aurora/contracts/context';
import type { CorrelationId } from '@aurora/contracts/ids';
import {
  ERROR_CODE_DEFINITIONS,
  type CanonicalError,
  type ErrorCode,
} from '@aurora/contracts/results';
import type { ContractVersion } from '@aurora/contracts/versioning';
import type {
  IdentityBindingRecord,
  IdentityResolutionEvidence,
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
  readonly #bindings: readonly IdentityBindingRecord[];
  readonly #now: () => string;

  constructor(
    bindings: readonly IdentityBindingRecord[],
    now: () => string = () => new Date().toISOString(),
  ) {
    this.#bindings = [...bindings];
    this.#now = now;
  }

  resolve(request: IdentityResolutionRequest): IdentityResolutionResult {
    const timestamp = this.#now();
    const method = request.subject.kind === 'IDENTITY' ? 'CANONICAL_ID' : 'EXTERNAL_BINDING';
    const inTenant = this.#bindings.filter((binding) => binding.tenantId === request.tenantId);
    const candidates = this.#findCandidates(request.subject, inTenant);
    const evidence = this.#evidence(request, method, timestamp, candidates.length);

    if (candidates.length === 0) {
      const existsInOtherTenant = this.#findCandidates(request.subject, this.#bindings).length > 0;
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

    const binding = candidates[0];
    if (binding === undefined) throw new Error('Unreachable identity candidate state');

    if (request.expectedKind !== undefined && binding.kind !== request.expectedKind) {
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
      identityId: binding.identityId,
      tenantId: binding.tenantId,
      kind: binding.kind,
      actor: {
        kind: binding.kind,
        identityId: binding.identityId,
        ...(matchedExternalIdentity === undefined ? {} : { externalIdentity: matchedExternalIdentity }),
      },
      ...(matchedExternalIdentity === undefined ? {} : { matchedExternalIdentity }),
    };

    return { status: 'RESOLVED', identity, evidence };
  }

  #findCandidates(
    subject: SubjectRef,
    source: readonly IdentityBindingRecord[],
  ): IdentityBindingRecord[] {
    if (subject.kind === 'IDENTITY') {
      return source.filter((binding) => binding.identityId === subject.identityId);
    }
    const key = externalKey(subject.externalIdentity);
    return source.filter((binding) =>
      (binding.externalIdentities ?? []).some((reference) => externalKey(reference) === key),
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
