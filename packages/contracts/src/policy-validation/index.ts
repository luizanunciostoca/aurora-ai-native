import type {
  ActorRef,
  CorrelationContext,
  DataClassification,
  Rfc3339Timestamp,
  SubjectRef,
  TenantContext,
} from '../context/index';
import type { CorrelationId, IdentityId, PolicyTokenId, TenantId } from '../ids/types';
import type {
  AuthorityConstraints,
  AuthorityScope,
  OwnerDecision,
  PolicyReference,
  PolicyToken,
} from '../policy/index';
import type {
  PolicyEvaluationDecision,
  PolicyEvaluationReason,
  PolicyEvaluationRequest,
  PolicyEvaluationResult,
} from '../policy-engine/index';
import type { CanonicalError } from '../results/error-semantics';
import type { ContractVersion } from '../versioning/types';

/**
 * W02-E reasons describe authority-evidence validation only. Current-policy
 * reasons remain owned by W02-D and are composed through PolicyEvaluationReason.
 */
export const AUTHORITY_VALIDATION_REASONS = [
  'MALFORMED_POLICY_TOKEN',
  'MALFORMED_SUBJECT_REFERENCE',
  'TOKEN_NOT_YET_VALID',
  'TOKEN_EXPIRED',
  'TOKEN_REVOKED',
  'TOKEN_STALE',
  'TOKEN_TENANT_MISMATCH',
  'TOKEN_SUBJECT_MISMATCH',
  'TOKEN_SCOPE_INSUFFICIENT',
  'TOKEN_ACTION_MISMATCH',
  'TOKEN_CONSTRAINT_VIOLATION',
  'TOKEN_POLICY_REFERENCE_MISMATCH',
  'TOKEN_POLICY_VERSION_MISMATCH',
  'TOKEN_CORRELATION_MISMATCH',
  'OWNER_DECISION_REQUIRED',
  'OWNER_DECISION_MALFORMED',
  'OWNER_DECISION_REFERENCE_MISMATCH',
  'OWNER_DECISION_NOT_YET_VALID',
  'OWNER_DECISION_EXPIRED',
  'OWNER_DECISION_DENIED',
  'OWNER_DECISION_REVOKED',
  'OWNER_DECISION_TENANT_MISMATCH',
  'OWNER_DECISION_ACTOR_MISMATCH',
  'OWNER_DECISION_SUBJECT_MISMATCH',
  'OWNER_DECISION_SCOPE_INSUFFICIENT',
  'OWNER_DECISION_CONSTRAINT_VIOLATION',
  'OWNER_DECISION_CORRELATION_MISMATCH',
  'AGENT_SELF_AUTHORIZATION_FORBIDDEN',
] as const;

export type AuthorityValidationReason = (typeof AUTHORITY_VALIDATION_REASONS)[number];
export type AuthorityEvaluationReason = AuthorityValidationReason | PolicyEvaluationReason;

export interface PolicyTokenValidationRequest {
  readonly kind: 'PolicyTokenValidationRequest';
  readonly schemaVersion: ContractVersion;
  readonly token: PolicyToken;
  readonly evaluatedAt: Rfc3339Timestamp;
  readonly correlation: CorrelationContext;
  readonly tenant: TenantContext;
  readonly actor: ActorRef;
  readonly subject: SubjectRef;
  readonly action: string;
  readonly requestedScope: AuthorityScope;
  /** Current policy reference/version, never the token's stale snapshot by default. */
  readonly policy: PolicyReference;
  /**
   * Operation facts that must satisfy all opaque authority constraints exactly.
   * W02-E deliberately does not invent domain-specific comparison semantics.
   */
  readonly operationConstraints?: AuthorityConstraints;
  /** Required when the token derives authority from an OwnerDecision. */
  readonly ownerDecision?: OwnerDecision;
  /** Deterministic revocation snapshot supplied by the caller; W02-E persists nothing. */
  readonly revokedPolicyTokenIds?: readonly PolicyTokenId[];
  /** Correlation binding is opt-in because portable authority may span request correlations. */
  readonly requireCorrelationMatch?: boolean;
}

export interface PolicyTokenValidationEvidence {
  readonly policyTokenId?: PolicyTokenId;
  readonly tenantId: TenantId;
  readonly actorIdentityId: IdentityId;
  readonly subjectReference: string;
  readonly action: string;
  readonly requestedScope: AuthorityScope;
  readonly effectiveScope: AuthorityScope;
  readonly currentPolicy: PolicyReference;
  readonly inputFingerprint: string;
}

type AuthorityValidationError = CanonicalError<ContractVersion, CorrelationId, DataClassification>;

interface PolicyTokenValidationResultBase {
  readonly kind: 'PolicyTokenValidationResult';
  readonly schemaVersion: ContractVersion;
  readonly correlation: CorrelationContext;
  readonly evaluatedAt: Rfc3339Timestamp;
  readonly currentPolicy: PolicyReference;
  readonly reasons: readonly AuthorityValidationReason[];
  readonly evidence: PolicyTokenValidationEvidence;
}

export type PolicyTokenValidationResult =
  | (PolicyTokenValidationResultBase & {
      readonly valid: true;
      /** Least authority: only the requested subset is returned, never the full token scope. */
      readonly effectiveScope: AuthorityScope;
      readonly error?: never;
    })
  | (PolicyTokenValidationResultBase & {
      readonly valid: false;
      readonly effectiveScope: readonly [];
      readonly error: AuthorityValidationError;
    });

/**
 * Full execution-time authority evaluation input. It composes the accepted
 * W02-D PolicyEvaluationRequest so identity, tenant, consent, purpose,
 * jurisdiction, current policy and authority are evaluated together.
 */
export interface AuthorityEvaluationRequest {
  readonly kind: 'AuthorityEvaluationRequest';
  readonly policyEvaluation: PolicyEvaluationRequest;
  readonly operationConstraints?: AuthorityConstraints;
  readonly revokedPolicyTokenIds?: readonly PolicyTokenId[];
  readonly requireCorrelationMatch?: boolean;
}

export interface AuthorityEvaluationEvidence {
  readonly tenantId: TenantId;
  readonly actorIdentityId: IdentityId;
  readonly subjectReference: string;
  readonly action: string;
  readonly requestedScope: AuthorityScope;
  readonly effectiveScope: AuthorityScope;
  readonly currentPolicy: PolicyReference;
  readonly inputFingerprint: string;
}

interface AuthorityEvaluationResultBase {
  readonly kind: 'AuthorityEvaluationResult';
  readonly schemaVersion: ContractVersion;
  readonly correlation: CorrelationContext;
  readonly evaluatedAt: Rfc3339Timestamp;
  readonly currentPolicy: PolicyReference;
  readonly authorized: boolean;
  readonly effectiveScope: AuthorityScope;
  readonly reasons: readonly AuthorityEvaluationReason[];
  readonly evidence: AuthorityEvaluationEvidence;
  readonly tokenValidation?: PolicyTokenValidationResult;
  /** Absent only when malformed authority prevents safe invocation of W02-D. */
  readonly policyDecision?: PolicyEvaluationDecision;
  readonly policyResult?: PolicyEvaluationResult;
}

export type AuthorityEvaluationResult =
  | (AuthorityEvaluationResultBase & {
      readonly authorized: true;
      readonly effectiveScope: AuthorityScope;
      readonly policyDecision: 'ALLOW';
      readonly policyResult: PolicyEvaluationResult & { readonly decision: 'ALLOW' };
      readonly error?: never;
    })
  | (AuthorityEvaluationResultBase & {
      readonly authorized: false;
      readonly effectiveScope: readonly [];
      readonly error: AuthorityValidationError;
    });
