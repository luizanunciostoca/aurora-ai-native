import type { CorrelationContext, TenantContext } from '../context/index.js';
import type { OwnerDecisionId, PolicyTokenId } from '../ids/index.js';
import type { ContractVersion } from '../versioning/index.js';

import type {
  AuthorityClass,
  AuthorityConstraints,
  AuthorityScope,
  AuthoritySubjectReference,
  PolicyReference,
} from './authority-primitives.js';

export const POLICY_TOKEN_KIND = 'POLICY_TOKEN' as const;

/**
 * Portable authorization result already evaluated by the future Policy Core.
 *
 * A PolicyToken is not a provider credential, contains no secret, and carries
 * no model-confidence field. Model confidence can never elevate authority.
 * W01-C defines this contract only; issuing/evaluating tokens belongs to W02.
 */
export interface PolicyToken {
  readonly kind: typeof POLICY_TOKEN_KIND;
  readonly schemaVersion: ContractVersion;
  readonly policyTokenId: PolicyTokenId;
  readonly tenant: TenantContext;
  readonly subject: AuthoritySubjectReference;
  /** Opaque governed action identifier; W01-C does not reinterpret it. */
  readonly action: string;
  readonly scope: AuthorityScope;
  /** RFC3339 timestamp validated by @aurora/schemas. */
  readonly issuedAt: string;
  /**
   * RFC3339 timestamp; must be later than issuedAt and can be invalidated at a
   * supplied evaluation time.
   */
  readonly expiresAt: string;
  readonly policy: PolicyReference;
  readonly constraints?: AuthorityConstraints;
  readonly authorityClass: AuthorityClass;
  readonly correlation: CorrelationContext;
  readonly decisionReference?: OwnerDecisionId;
}
