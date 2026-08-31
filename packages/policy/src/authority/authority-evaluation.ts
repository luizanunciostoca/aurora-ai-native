import type { PolicyEvaluationResult } from '@aurora/contracts/policy-engine';
import type {
  AuthorityEvaluationReason,
  AuthorityEvaluationRequest,
  AuthorityEvaluationResult,
  AuthorityValidationReason,
  PolicyTokenValidationRequest,
} from '@aurora/contracts/policy-validation';

import { evaluatePolicy, toAuthoritySubjectReference } from '../index';
import { fingerprint, uniqueSorted } from './internal';
import {
  makeAuthorityValidationError,
  ownerDecisionReasons,
  type OwnerDecisionValidationContext,
  validatePolicyToken,
} from './token-validation';

function makeValidationRequest(
  request: AuthorityEvaluationRequest,
): PolicyTokenValidationRequest | undefined {
  const policy = request.policyEvaluation;
  if (policy.policyToken === undefined) return undefined;
  return {
    kind: 'PolicyTokenValidationRequest',
    schemaVersion: policy.schemaVersion,
    token: policy.policyToken,
    evaluatedAt: policy.evaluatedAt,
    correlation: policy.correlation,
    tenant: policy.tenant,
    actor: policy.actor,
    subject: policy.subject,
    action: policy.action,
    requestedScope: policy.requestedScope,
    policy: policy.policy,
    ...(request.operationConstraints === undefined
      ? {}
      : { operationConstraints: request.operationConstraints }),
    ...(policy.ownerDecision === undefined ? {} : { ownerDecision: policy.ownerDecision }),
    ...(request.revokedPolicyTokenIds === undefined
      ? {}
      : { revokedPolicyTokenIds: request.revokedPolicyTokenIds }),
    ...(request.requireCorrelationMatch === undefined
      ? {}
      : { requireCorrelationMatch: request.requireCorrelationMatch }),
  };
}

function standaloneOwnerReasons(
  request: AuthorityEvaluationRequest,
): readonly AuthorityValidationReason[] {
  const policy = request.policyEvaluation;
  if (policy.ownerDecision === undefined) return [];
  const context: OwnerDecisionValidationContext = {
    evaluatedAt: policy.evaluatedAt,
    correlation: policy.correlation,
    tenant: policy.tenant,
    actor: policy.actor,
    subject: policy.subject,
    requestedScope: policy.requestedScope,
    ...(request.operationConstraints === undefined
      ? {}
      : { operationConstraints: request.operationConstraints }),
    ...(request.requireCorrelationMatch === undefined
      ? {}
      : { requireCorrelationMatch: request.requireCorrelationMatch }),
  };
  return ownerDecisionReasons(context, policy.ownerDecision, false);
}

function evaluationError(
  request: AuthorityEvaluationRequest,
  reasons: readonly AuthorityEvaluationReason[],
  policyResult?: PolicyEvaluationResult,
): NonNullable<AuthorityEvaluationResult['error']> {
  if (policyResult?.decision === 'DENY') return policyResult.error;
  const validationRequest = makeValidationRequest(request);
  if (validationRequest !== undefined) {
    const validationReasons = reasons.filter((reason): reason is AuthorityValidationReason =>
      !policyResult?.reasons.includes(reason as never),
    );
    if (validationReasons.length > 0) {
      return makeAuthorityValidationError(validationRequest, validationReasons);
    }
  }
  return {
    kind: 'CanonicalError',
    schemaVersion: request.policyEvaluation.schemaVersion,
    code: 'FORBIDDEN',
    category: 'AUTHORIZATION',
    message:
      policyResult?.decision === 'REQUIRE_APPROVAL'
        ? 'Current policy requires approval before authority is sufficient.'
        : 'Authority evaluation denied the requested operation.',
    retryability: 'DO_NOT_RETRY',
    correlationId: request.policyEvaluation.correlation.correlationId,
    timestamp: request.policyEvaluation.evaluatedAt,
    details: {
      reasons: [...reasons],
      policyReference: request.policyEvaluation.policy.reference,
      policyVersion: request.policyEvaluation.policy.version,
      action: request.policyEvaluation.action,
    },
  };
}

function evaluationEvidence(request: AuthorityEvaluationRequest, effectiveScope: readonly string[]) {
  const policy = request.policyEvaluation;
  return {
    tenantId: policy.tenant.tenantId,
    actorIdentityId: policy.actor.identityId,
    subjectReference: toAuthoritySubjectReference(policy.subject),
    action: policy.action,
    requestedScope: policy.requestedScope,
    effectiveScope,
    currentPolicy: policy.policy,
    inputFingerprint: fingerprint(request),
  };
}

/**
 * Canonical authority decision evaluation. Current W02-D policy always wins;
 * stale/invalid presented authority can only reduce permission, never widen it.
 */
export function evaluateAuthority(request: AuthorityEvaluationRequest): AuthorityEvaluationResult {
  const policy = request.policyEvaluation;
  const tokenRequest = makeValidationRequest(request);
  const tokenValidation = tokenRequest === undefined ? undefined : validatePolicyToken(tokenRequest);
  const ownerReasons = standaloneOwnerReasons(request);

  const malformedToken = tokenValidation?.reasons.includes('MALFORMED_POLICY_TOKEN') === true;
  const malformedOwner = ownerReasons.includes('OWNER_DECISION_MALFORMED');
  if (malformedToken || malformedOwner) {
    const reasons = uniqueSorted<AuthorityEvaluationReason>([
      ...(tokenValidation?.reasons ?? []),
      ...ownerReasons,
    ]);
    return {
      kind: 'AuthorityEvaluationResult',
      schemaVersion: policy.schemaVersion,
      authorized: false,
      correlation: policy.correlation,
      evaluatedAt: policy.evaluatedAt,
      currentPolicy: policy.policy,
      effectiveScope: [],
      reasons,
      evidence: evaluationEvidence(request, []),
      ...(tokenValidation === undefined ? {} : { tokenValidation }),
      error: evaluationError(request, reasons),
    };
  }

  const policyResult = evaluatePolicy(policy);
  const reasons = uniqueSorted<AuthorityEvaluationReason>([
    ...(tokenValidation?.reasons ?? []),
    ...ownerReasons,
    ...policyResult.reasons,
  ]);
  const validationValid = tokenValidation?.valid !== false && ownerReasons.length === 0;
  const authorized = validationValid && policyResult.decision === 'ALLOW';

  if (!authorized) {
    return {
      kind: 'AuthorityEvaluationResult',
      schemaVersion: policy.schemaVersion,
      authorized: false,
      correlation: policy.correlation,
      evaluatedAt: policy.evaluatedAt,
      currentPolicy: policy.policy,
      effectiveScope: [],
      reasons,
      evidence: evaluationEvidence(request, []),
      ...(tokenValidation === undefined ? {} : { tokenValidation }),
      policyDecision: policyResult.decision,
      policyResult,
      error: evaluationError(request, reasons, policyResult),
    };
  }

  const effectiveScope = [...policy.requestedScope];
  return {
    kind: 'AuthorityEvaluationResult',
    schemaVersion: policy.schemaVersion,
    authorized: true,
    correlation: policy.correlation,
    evaluatedAt: policy.evaluatedAt,
    currentPolicy: policy.policy,
    effectiveScope,
    reasons,
    evidence: evaluationEvidence(request, effectiveScope),
    ...(tokenValidation === undefined ? {} : { tokenValidation }),
    policyDecision: 'ALLOW',
    policyResult,
  };
}
