import type { ActorRef, ExternalIdentityRef, IdentityKind, SubjectRef } from '../context/identity';
import type { CorrelationId, IdentityId, TenantId } from '../ids/types';
import type { CanonicalError } from '../results/error-semantics';
import type { ContractVersion } from '../versioning/types';

export const IDENTITY_RESOLUTION_STATUSES = ['RESOLVED', 'NOT_FOUND', 'AMBIGUOUS', 'CONFLICT'] as const;
export type IdentityResolutionStatus = (typeof IDENTITY_RESOLUTION_STATUSES)[number];

export const IDENTITY_RESOLUTION_METHODS = ['CANONICAL_ID', 'EXTERNAL_BINDING'] as const;
export type IdentityResolutionMethod = (typeof IDENTITY_RESOLUTION_METHODS)[number];

export interface IdentityResolutionRequest {
  readonly schemaVersion: ContractVersion;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly subject: SubjectRef;
  readonly expectedKind?: IdentityKind;
}

export interface IdentityResolutionEvidence {
  readonly method: IdentityResolutionMethod;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly resolvedAt: string;
  readonly normalizedReference: string;
  readonly candidateCount: number;
  readonly authorityGranted: false;
}

export interface ResolvedIdentity {
  readonly identityId: IdentityId;
  readonly tenantId: TenantId;
  readonly kind: IdentityKind;
  readonly actor: ActorRef;
  readonly matchedExternalIdentity?: ExternalIdentityRef;
}

export interface IdentityResolutionSuccess {
  readonly status: 'RESOLVED';
  readonly identity: ResolvedIdentity;
  readonly evidence: IdentityResolutionEvidence;
}

export interface IdentityResolutionFailure {
  readonly status: Exclude<IdentityResolutionStatus, 'RESOLVED'>;
  readonly error: CanonicalError<ContractVersion, CorrelationId>;
  readonly evidence: IdentityResolutionEvidence;
}

export type IdentityResolutionResult = IdentityResolutionSuccess | IdentityResolutionFailure;

export interface IdentityBindingRecord {
  readonly tenantId: TenantId;
  readonly identityId: IdentityId;
  readonly kind: IdentityKind;
  readonly externalIdentities?: readonly ExternalIdentityRef[];
}
