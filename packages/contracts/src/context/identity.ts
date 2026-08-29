import type { IdentityId, ProviderExternalId } from '../ids/types.js';

export const IDENTITY_KINDS = ['HUMAN', 'AGENT', 'SERVICE', 'SYSTEM'] as const;

export type IdentityKind = (typeof IDENTITY_KINDS)[number];

/**
 * Provider-owned identity reference. The external identifier remains opaque and
 * is explicitly distinct from Aurora internal canonical IDs.
 */
export interface ExternalIdentityRef {
  readonly kind: 'EXTERNAL_IDENTITY';
  readonly provider: string;
  readonly externalId: ProviderExternalId;
}

interface ActorRefBase<TKind extends IdentityKind> {
  readonly kind: TKind;
  readonly identityId: IdentityId;
  readonly externalIdentity?: ExternalIdentityRef;
}

export type HumanActorRef = ActorRefBase<'HUMAN'>;
export type AgentActorRef = ActorRefBase<'AGENT'>;
export type ServiceActorRef = ActorRefBase<'SERVICE'>;
export type SystemActorRef = ActorRefBase<'SYSTEM'>;

export type ActorRef =
  | HumanActorRef
  | AgentActorRef
  | ServiceActorRef
  | SystemActorRef;

export interface IdentitySubjectRef {
  readonly kind: 'IDENTITY';
  readonly identityId: IdentityId;
}

export interface ExternalIdentitySubjectRef {
  readonly kind: 'EXTERNAL_IDENTITY';
  readonly externalIdentity: ExternalIdentityRef;
}

/**
 * Shared identity subject reference only.
 * Domain-specific subjects remain owned by their domain contracts and may compose
 * this union rather than widening canonical identity IDs to arbitrary strings.
 */
export type SubjectRef = IdentitySubjectRef | ExternalIdentitySubjectRef;
