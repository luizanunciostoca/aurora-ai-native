import type {
  ActorRef,
  CorrelationContext,
  DataClassification,
  Rfc3339Timestamp,
  TenantContext,
} from '../context/index';
import type { IdentityId, TenantId } from '../ids/types';
import type { AuthorityScope, PolicyReference } from '../policy/index';
import type {
  PolicyEvaluationDecision,
  PolicyEvaluationReason,
  PolicyEvaluationRequest,
  PolicySnapshot,
  PolicySnapshotState,
} from '../policy-engine/index';
import type { ContractVersion } from '../versioning/types';

export const POLICY_QUERY_REASONS = [
  'POLICY_FOUND',
  'POLICY_NOT_FOUND',
  'POLICY_REFERENCE_MISMATCH',
  'POLICY_VERSION_CHANGED',
  'PRECHECK_INFORMATIONAL_ONLY',
  'EXECUTION_VALIDATION_REQUIRED',
] as const;

export type PolicyQueryReason = (typeof POLICY_QUERY_REASONS)[number];
export type PolicyPrecheckReason = PolicyQueryReason | PolicyEvaluationReason;

/**
 * Current-policy lookup is point-in-time information only. Tenant and actor
 * context are mandatory so an adapter cannot silently turn this API into a
 * reference-only cross-tenant lookup.
 */
export interface CurrentPolicyLookupRequest {
  readonly kind: 'CurrentPolicyLookupRequest';
  readonly schemaVersion: ContractVersion;
  readonly expectedPolicy: PolicyReference;
  readonly correlation: CorrelationContext;
  readonly evaluatedAt: Rfc3339Timestamp;
  readonly tenant: TenantContext;
  readonly actor: ActorRef;
}

interface CurrentPolicyLookupResultBase {
  readonly kind: 'CurrentPolicyLookupResult';
  readonly schemaVersion: ContractVersion;
  readonly expectedPolicy: PolicyReference;
  readonly correlation: CorrelationContext;
  readonly evaluatedAt: Rfc3339Timestamp;
  readonly tenant: TenantContext;
  readonly actor: ActorRef;
  readonly informationalOnly: true;
  readonly authorizesExecution: false;
  readonly requiresExecutionTimeValidation: true;
  readonly reasons: readonly PolicyQueryReason[];
}

export type CurrentPolicyLookupResult =
  | (CurrentPolicyLookupResultBase & {
      readonly found: true;
      readonly currentPolicy: PolicyReference;
      readonly state: PolicySnapshotState;
      readonly snapshot: PolicySnapshot;
      readonly versionChanged: boolean;
    })
  | (CurrentPolicyLookupResultBase & {
      readonly found: false;
      readonly currentPolicy?: never;
      readonly state?: never;
      readonly snapshot?: never;
      readonly versionChanged?: never;
    });

/**
 * Precheck deliberately excludes executable authority evidence. OwnerDecision
 * and PolicyToken belong to W02-E execution-time authority validation, not to
 * informational planning/routing queries.
 */
export type InformationalPolicyEvaluationRequest = Omit<
  PolicyEvaluationRequest,
  'ownerDecision' | 'policyToken'
> & {
  readonly ownerDecision?: never;
  readonly policyToken?: never;
};

export interface PolicyPrecheckRequest {
  readonly kind: 'PolicyPrecheckRequest';
  readonly policyEvaluation: InformationalPolicyEvaluationRequest;
}

export type RequiredAuthorityDescriptor =
  | {
      readonly required: false;
    }
  | {
      readonly required: true;
      readonly action: string;
      readonly scope: AuthorityScope;
      readonly subjectReference: string;
    };

/**
 * Read-only projection of constraints already present on an applicable W02-D
 * PolicyRule. It creates no new policy semantics and grants no authority.
 */
export interface ApplicablePolicyConstraint {
  readonly ruleId: string;
  readonly effect: PolicyEvaluationDecision;
  readonly action: string;
  readonly scope: AuthorityScope;
  readonly tenantIds?: readonly TenantId[];
  readonly actorKinds?: readonly ActorRef['kind'][];
  readonly actorIdentityIds?: readonly IdentityId[];
  readonly subjectReferences?: readonly string[];
  readonly purposeIds?: readonly string[];
  readonly jurisdictions?: readonly string[];
  readonly dataClassifications?: readonly DataClassification[];
  readonly consentRequired: boolean;
  readonly authorityRequired: boolean;
  readonly reasonReference?: string;
}

export interface PolicyPrecheckEvidence {
  readonly tenantId: TenantId;
  readonly actorIdentityId: IdentityId;
  readonly subjectReference: string;
  readonly action: string;
  readonly requestedScope: AuthorityScope;
  readonly matchedRuleIds: readonly string[];
  readonly inputFingerprint: string;
}

/**
 * Informational policy result for planning, routing and UI explanation.
 * authorizesExecution is structurally false: consumers must perform current
 * policy + W02-E authority validation again at the execution boundary.
 */
export interface PolicyPrecheckResult {
  readonly kind: 'PolicyPrecheckResult';
  readonly schemaVersion: ContractVersion;
  readonly policy: PolicyReference;
  readonly correlation: CorrelationContext;
  readonly evaluatedAt: Rfc3339Timestamp;
  readonly informationalOnly: true;
  readonly authorizesExecution: false;
  readonly requiresExecutionTimeValidation: true;
  readonly decision: PolicyEvaluationDecision;
  readonly requiredAuthority: RequiredAuthorityDescriptor;
  readonly approvalRequired: boolean;
  readonly applicableConstraints: readonly ApplicablePolicyConstraint[];
  readonly reasons: readonly PolicyPrecheckReason[];
  readonly reasonReferences: readonly string[];
  readonly evidence: PolicyPrecheckEvidence;
}
