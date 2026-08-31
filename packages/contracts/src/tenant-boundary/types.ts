import type { ActorRef, ExternalIdentityRef, IdentityKind, SubjectRef } from '../context/identity';
import type { CorrelationId, IdentityId, TenantId } from '../ids/types';

export const TENANT_BINDING_KINDS = ['MEMBER', 'SYSTEM', 'EXTERNAL'] as const;
export type TenantBindingKind = (typeof TENANT_BINDING_KINDS)[number];

export interface IdentityTenantBinding {
  readonly tenantId: TenantId;
  readonly identityId: IdentityId;
  readonly identityKind: IdentityKind;
  readonly bindingKind: TenantBindingKind;
  readonly externalIdentity?: ExternalIdentityRef;
}

export interface TenantBoundaryContext {
  readonly tenantId: TenantId;
  readonly actor: ActorRef;
  readonly subject: SubjectRef;
  readonly correlationId: CorrelationId;
}

export interface TenantBoundaryCheck {
  readonly context: TenantBoundaryContext;
  readonly knownTenantIds: readonly TenantId[];
  readonly bindings: readonly IdentityTenantBinding[];
}

export const TENANT_BOUNDARY_REASONS = [
  'BOUNDARY_CONFIRMED',
  'TENANT_UNKNOWN',
  'IDENTITY_NOT_BOUND',
  'CROSS_TENANT_IDENTITY',
  'SUBJECT_MISMATCH',
  'EXTERNAL_IDENTITY_MISMATCH',
  'BINDING_KIND_MISMATCH',
  'BINDING_AMBIGUOUS',
] as const;
export type TenantBoundaryReason = (typeof TENANT_BOUNDARY_REASONS)[number];

export type TenantBoundaryStatus = 'WITHIN_BOUNDARY' | 'OUTSIDE_BOUNDARY';

export interface TenantBoundaryEvidence {
  readonly evaluatedTenantId: TenantId;
  readonly actorIdentityId: IdentityId;
  readonly matchedBindingCount: number;
  readonly observedBindingTenantIds: readonly TenantId[];
}

export interface TenantBoundaryDecision {
  readonly status: TenantBoundaryStatus;
  readonly reason: TenantBoundaryReason;
  readonly correlationId: CorrelationId;
  readonly evidence: TenantBoundaryEvidence;
}
