import type { CorrelationContext, IdentityReference, TenantContext } from "../context/index.js";
import type { OwnerDecisionId } from "../ids/index.js";
import type { ContractVersion } from "../versioning/index.js";

import type {
  AuthorityConstraints,
  AuthorityScope,
  AuthoritySubjectReference,
  OwnerDecisionState,
} from "./authority-primitives.js";

export const OWNER_DECISION_KIND = "OWNER_DECISION" as const;

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
  readonly decisionId: OwnerDecisionId;
  readonly subject: AuthoritySubjectReference;
  readonly decision: OwnerDecisionState;
  readonly actor: IdentityReference;
  readonly tenant: TenantContext;
  /** RFC3339 timestamp validated by @aurora/schemas. */
  readonly decidedAt: string;
  readonly scope: AuthorityScope;
  readonly constraints?: AuthorityConstraints;
  /** RFC3339 timestamp validated by @aurora/schemas when present. */
  readonly expiresAt?: string;
  readonly correlation: CorrelationContext;
  readonly reason?: string;
  readonly reasonReference?: string;
  /** Opaque reference to authentication/step-up evidence; never credential material. */
  readonly authenticationReference?: string;
}
