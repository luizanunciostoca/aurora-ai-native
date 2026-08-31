import type {
  ActorRef,
  CorrelationContext,
  DataClassification,
  Rfc3339Timestamp,
  SubjectRef,
  TenantContext,
} from '../context/index.js';
import type { CorrelationId, IdentityId, TenantId } from '../ids/types.js';
import type { ConsentRecord } from '../consent/index.js';
import type { JurisdictionContext, JurisdictionRestriction } from '../jurisdiction/index.js';
import type {
  AuthorityScope,
  OwnerDecision,
  PolicyReference,
  PolicyToken,
} from '../policy/index.js';
import type { PurposeContext } from '../purpose/index.js';
import type { CanonicalError } from '../results/error-semantics.js';
import type { TenantBoundaryDecision } from '../tenant-boundary/types.js';
import type { ContractVersion } from '../versioning/types.js';

export const POLICY_EVALUATION_DECISIONS = ['ALLOW', 'DENY', 'REQUIRE_APPROVAL'] as const;
export type PolicyEvaluationDecision = (typeof POLICY_EVALUATION_DECISIONS)[number];

export const POLICY_SNAPSHOT_STATES = ['ACTIVE', 'UNKNOWN'] as const;
export type PolicySnapshotState = (typeof POLICY_SNAPSHOT_STATES)[number];

export const POLICY_EVALUATION_REASONS = [
  'POLICY_ALLOWED',
  'APPROVAL_REQUIRED',
  'EXPLICIT_DENY',
  'NO_APPLICABLE_RULE',
  'CONFLICTING_RULES',
  'POLICY_STATE_UNKNOWN',
  'POLICY_VERSION_MISMATCH',
  'TENANT_BOUNDARY_DENIED',
  'ACTOR_NOT_ALLOWED',
  'SUBJECT_NOT_ALLOWED',
  'PURPOSE_DISABLED',
  'PURPOSE_MISMATCH',
  'CONSENT_REQUIRED',
  'CONSENT_EXPIRED',
  'CONSENT_REVOKED',
  'CONSENT_SUBJECT_MISMATCH',
  'CONSENT_JURISDICTION_MISMATCH',
  'CONSENT_PROVENANCE_MISSING',
  'JURISDICTION_DENIED',
  'DATA_CLASSIFICATION_NOT_ALLOWED',
  'AUTHORITY_REQUIRED',
  'AUTHORITY_EXPIRED',
  'AUTHORITY_REVOKED',
  'AUTHORITY_DENIED',
  'AUTHORITY_TENANT_MISMATCH',
  'AUTHORITY_ACTOR_MISMATCH',
  'AUTHORITY_SUBJECT_MISMATCH',
  'AUTHORITY_SCOPE_INSUFFICIENT',
  'AUTHORITY_ACTION_MISMATCH',
  'AUTHORITY_POLICY_MISMATCH',
  'AGENT_AUTHORITY_FORBIDDEN',
] as const;
export type PolicyEvaluationReason = (typeof POLICY_EVALUATION_REASONS)[number];

/**
 * A policy rule answers only whether a governed action MAY happen. It does not
 * choose goals, content, budgets, providers, plans, routes, or model behavior.
 * Rule ordering is intentionally non-semantic; the engine applies fixed effect
 * precedence (DENY > REQUIRE_APPROVAL > ALLOW).
 */
export interface PolicyRule {
  readonly ruleId: string;
  readonly effect: PolicyEvaluationDecision;
  readonly action: string;
  readonly scope: AuthorityScope;
  readonly tenantIds?: readonly TenantId[];
  readonly actorKinds?: readonly ActorRef['kind'][];
  readonly actorIdentityIds?: readonly IdentityId[];
  /** Canonical authority-subject reference strings produced by the policy core bridge. */
  readonly subjectReferences?: readonly string[];
  readonly purposeIds?: readonly string[];
  readonly jurisdictions?: readonly string[];
  readonly dataClassifications?: readonly DataClassification[];
  readonly consentRequired?: boolean;
  readonly authorityRequired?: boolean;
  readonly reasonReference?: string;
}

export interface PolicySnapshot {
  readonly kind: 'PolicySnapshot';
  readonly policy: PolicyReference;
  readonly state: PolicySnapshotState;
  readonly rules: readonly PolicyRule[];
}

export interface PolicyEvaluationRequest {
  readonly kind: 'PolicyEvaluationRequest';
  readonly schemaVersion: ContractVersion;
  readonly policy: PolicyReference;
  readonly snapshot: PolicySnapshot;
  readonly correlation: CorrelationContext;
  readonly evaluatedAt: Rfc3339Timestamp;
  readonly tenant: TenantContext;
  readonly tenantBoundary: TenantBoundaryDecision;
  readonly actor: ActorRef;
  readonly subject: SubjectRef;
  readonly action: string;
  readonly requestedScope: AuthorityScope;
  readonly purpose: PurposeContext;
  readonly jurisdiction: JurisdictionContext;
  readonly jurisdictionRestrictions?: readonly JurisdictionRestriction[];
  readonly dataClassification?: DataClassification;
  readonly consent?: ConsentRecord;
  readonly ownerDecision?: OwnerDecision;
  readonly policyToken?: PolicyToken;
}

export interface PolicyEvaluationEvidence {
  readonly policy: PolicyReference;
  readonly tenantId: TenantId;
  readonly actorIdentityId: IdentityId;
  readonly subjectReference: string;
  readonly action: string;
  readonly requestedScope: AuthorityScope;
  readonly matchedRuleIds: readonly string[];
  readonly reasonReferences: readonly string[];
  readonly inputFingerprint: string;
}

type PolicyEvaluationError = CanonicalError<ContractVersion, CorrelationId, DataClassification>;

interface PolicyEvaluationResultBase {
  readonly kind: 'PolicyEvaluationResult';
  readonly schemaVersion: ContractVersion;
  readonly policy: PolicyReference;
  readonly correlation: CorrelationContext;
  readonly evaluatedAt: Rfc3339Timestamp;
  readonly reasons: readonly PolicyEvaluationReason[];
  readonly evidence: PolicyEvaluationEvidence;
}

export type PolicyEvaluationResult =
  | (PolicyEvaluationResultBase & {
      readonly decision: 'ALLOW';
      readonly error?: never;
    })
  | (PolicyEvaluationResultBase & {
      readonly decision: 'REQUIRE_APPROVAL';
      readonly error?: never;
    })
  | (PolicyEvaluationResultBase & {
      readonly decision: 'DENY';
      readonly error: PolicyEvaluationError;
    });
