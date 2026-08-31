import type {
  ApplicablePolicyConstraint,
  PolicyPrecheckReason,
  PolicyPrecheckRequest,
  PolicyPrecheckResult,
  RequiredAuthorityDescriptor,
} from '@aurora/contracts/policy-query';
import type {
  PolicyEvaluationRequest,
  PolicyRule,
} from '@aurora/contracts/policy-engine';

import { evaluatePolicy, toAuthoritySubjectReference } from '../index';
import { fingerprint, uniqueSorted } from './internal';

function toConstraint(rule: PolicyRule): ApplicablePolicyConstraint {
  return {
    ruleId: rule.ruleId,
    effect: rule.effect,
    action: rule.action,
    scope: rule.scope,
    ...(rule.tenantIds === undefined ? {} : { tenantIds: rule.tenantIds }),
    ...(rule.actorKinds === undefined ? {} : { actorKinds: rule.actorKinds }),
    ...(rule.actorIdentityIds === undefined
      ? {}
      : { actorIdentityIds: rule.actorIdentityIds }),
    ...(rule.subjectReferences === undefined
      ? {}
      : { subjectReferences: rule.subjectReferences }),
    ...(rule.purposeIds === undefined ? {} : { purposeIds: rule.purposeIds }),
    ...(rule.jurisdictions === undefined ? {} : { jurisdictions: rule.jurisdictions }),
    ...(rule.dataClassifications === undefined
      ? {}
      : { dataClassifications: rule.dataClassifications }),
    consentRequired: rule.consentRequired === true,
    authorityRequired: rule.authorityRequired === true,
    ...(rule.reasonReference === undefined ? {} : { reasonReference: rule.reasonReference }),
  };
}

function matchedRules(
  policy: PolicyEvaluationRequest,
  matchedRuleIds: readonly string[],
): readonly PolicyRule[] {
  const byId = new Map(policy.snapshot.rules.map((rule) => [rule.ruleId, rule] as const));
  return matchedRuleIds
    .map((ruleId) => byId.get(ruleId))
    .filter((rule): rule is PolicyRule => rule !== undefined);
}

function requiredAuthority(
  policy: PolicyEvaluationRequest,
  rules: readonly PolicyRule[],
  reasons: readonly string[],
): RequiredAuthorityDescriptor {
  const required =
    rules.some((rule) => rule.authorityRequired === true) ||
    reasons.includes('AUTHORITY_REQUIRED');
  if (!required) return { required: false };
  return {
    required: true,
    action: policy.action,
    scope: [...policy.requestedScope],
    subjectReference: toAuthoritySubjectReference(policy.subject),
  };
}

/**
 * Informational-only current-policy precheck. Presented authority evidence is
 * forbidden even for callers that bypass runtime schemas. The result can help
 * planners/routers escalate verification, but it can never authorize execution.
 */
export function precheckPolicy(request: PolicyPrecheckRequest): PolicyPrecheckResult {
  const policy = request.policyEvaluation as PolicyEvaluationRequest;
  if (policy.ownerDecision !== undefined || policy.policyToken !== undefined) {
    throw new TypeError(
      'Policy precheck must not contain OwnerDecision or PolicyToken authority evidence',
    );
  }

  const policyResult = evaluatePolicy(policy);
  const rules = matchedRules(policy, policyResult.evidence.matchedRuleIds);
  const reasons = uniqueSorted<PolicyPrecheckReason>([
    ...policyResult.reasons,
    'PRECHECK_INFORMATIONAL_ONLY',
    'EXECUTION_VALIDATION_REQUIRED',
  ]);

  return {
    kind: 'PolicyPrecheckResult',
    schemaVersion: policy.schemaVersion,
    policy: policy.policy,
    correlation: policy.correlation,
    evaluatedAt: policy.evaluatedAt,
    informationalOnly: true,
    authorizesExecution: false,
    requiresExecutionTimeValidation: true,
    decision: policyResult.decision,
    requiredAuthority: requiredAuthority(policy, rules, policyResult.reasons),
    approvalRequired:
      policyResult.decision === 'REQUIRE_APPROVAL' ||
      policyResult.reasons.includes('APPROVAL_REQUIRED'),
    applicableConstraints: rules.map(toConstraint),
    reasons,
    reasonReferences: policyResult.evidence.reasonReferences,
    evidence: {
      tenantId: policy.tenant.tenantId,
      actorIdentityId: policy.actor.identityId,
      subjectReference: toAuthoritySubjectReference(policy.subject),
      action: policy.action,
      requestedScope: policy.requestedScope,
      matchedRuleIds: policyResult.evidence.matchedRuleIds,
      inputFingerprint: fingerprint(request),
    },
  };
}
