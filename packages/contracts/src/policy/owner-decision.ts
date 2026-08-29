import type {
  ActorRef,
  CorrelationContext,
  Rfc3339Timestamp,
  TenantContext,
} from '../context';
import type { DecisionId } from '../ids/types';
import type { ContractVersion } from '../versioning/types';

import type {
  AuthorityConstraints,
  AuthorityScope,
  AuthoritySubjectReference,
  OwnerDecisionState,
} from './authority-primitives';

export const OWNER_DECISION_KIND = 'OWNER_DECISION' as const;

/**
 * Auditable authorized/human decision over an explicit subject and scope.
 *
 * REVOKED is the canonical withdrawal state for previously granted authority;
 * CANCELLED is intentionally excluded because cancellation is a request or
 * workflow lifecycle concept, not an authority decision outcome.
 *
 * This record is authorization evidence only. It never means an external side
 * effect was executed.
 */
export interface OwnerDecision {
  readonly kind: typeof OWNER_DECISION_KIND;
  readonly schemaVersion: ContractVersion;
  readonly decisionId: DecisionId;
  readonly subject: AuthoritySubjectReference;
  readonly decision: OwnerDecisionState;
  readonly actor: ActorRef;
  readonly tenant: TenantContext;
  readonly decidedAt: Rfc3339Timestamp;
  readonly scope: AuthorityScope;
  readonly constraints?: AuthorityConstraints;
  readonly expiresAt?: Rfc3339Timestamp;
  readonly correlation: CorrelationContext;
  readonly reason?: string;
  readonly reasonReference?: string;
  /** Opaque reference to authentication/step-up evidence; never credential material. */
  readonly authenticationReference?: string;
}
