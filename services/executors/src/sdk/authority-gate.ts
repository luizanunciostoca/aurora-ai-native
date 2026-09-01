import type { ActionAuthorityReference, ActionIntent } from '@aurora/contracts/actions';
import type {
  AuthorityEvaluationRequest,
  AuthorityEvaluationResult,
} from '@aurora/contracts/policy-validation';
import type { ContractVersion } from '@aurora/contracts/versioning';

import type {
  ExecutorAuthorityGateReason,
  ExecutorAuthorityGateRequest,
  ExecutorAuthorityGateResult,
} from './types.js';

function uniqueSorted(
  reasons: readonly ExecutorAuthorityGateReason[],
): readonly ExecutorAuthorityGateReason[] {
  return [...new Set(reasons)].sort() as readonly ExecutorAuthorityGateReason[];
}

function sameActor(
  intent: ActionIntent['actor'],
  evaluation: AuthorityEvaluationRequest['policyEvaluation']['actor'],
): boolean {
  if (intent.kind !== evaluation.kind || intent.identityId !== evaluation.identityId) return false;
  if (intent.externalIdentity === undefined && evaluation.externalIdentity === undefined) {
    return true;
  }
  if (intent.externalIdentity === undefined || evaluation.externalIdentity === undefined) {
    return false;
  }
  return (
    intent.externalIdentity.provider === evaluation.externalIdentity.provider &&
    intent.externalIdentity.externalId === evaluation.externalIdentity.externalId
  );
}

function subjectReference(
  subject: AuthorityEvaluationRequest['policyEvaluation']['subject'],
): string {
  if (subject.kind === 'IDENTITY') return `identity:${subject.identityId}`;
  return `external:${subject.externalIdentity.provider}:${subject.externalIdentity.externalId}`;
}

function sameScope(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.every((entry, index) => entry === normalizedRight[index]);
}

function authorityReferenceMatches(
  reference: ActionAuthorityReference,
  evaluation: AuthorityEvaluationRequest,
): boolean {
  const policy = evaluation.policyEvaluation;
  const tokenId = policy.policyToken?.policyTokenId;
  const decisionId = policy.ownerDecision?.decisionId;

  switch (reference.kind) {
    case 'POLICY_TOKEN':
      return tokenId === reference.policyTokenId;
    case 'OWNER_DECISION':
      return decisionId === reference.decisionId;
    case 'POLICY_AND_OWNER_DECISION':
      return tokenId === reference.policyTokenId && decisionId === reference.decisionId;
  }
}

function requestBindingReasons(
  schemaVersion: ContractVersion,
  actionIntent: ActionIntent,
  evaluation: AuthorityEvaluationRequest,
): readonly ExecutorAuthorityGateReason[] {
  const policy = evaluation.policyEvaluation;
  const reasons: ExecutorAuthorityGateReason[] = [];

  if (
    actionIntent.kind !== 'ACTION_INTENT' ||
    evaluation.kind !== 'AuthorityEvaluationRequest' ||
    schemaVersion !== actionIntent.schemaVersion ||
    actionIntent.schemaVersion !== policy.schemaVersion ||
    actionIntent.tenant.tenantId !== policy.tenant.tenantId ||
    actionIntent.correlation.correlationId !== policy.correlation.correlationId ||
    actionIntent.capability.actionType !== policy.action ||
    !sameActor(actionIntent.actor, policy.actor)
  ) {
    reasons.push('AUTHORITY_CONTEXT_MISMATCH');
  }

  if (!authorityReferenceMatches(actionIntent.authority, evaluation)) {
    reasons.push('AUTHORITY_REFERENCE_MISMATCH');
  }

  return uniqueSorted(reasons);
}

function resultMatchesCurrentRequest(
  result: AuthorityEvaluationResult,
  evaluation: AuthorityEvaluationRequest,
): boolean {
  const policy = evaluation.policyEvaluation;
  const policyResult = result.policyResult;
  const expectedSubjectReference = subjectReference(policy.subject);

  if (
    result.kind !== 'AuthorityEvaluationResult' ||
    result.schemaVersion !== policy.schemaVersion ||
    result.correlation.correlationId !== policy.correlation.correlationId ||
    result.evaluatedAt !== policy.evaluatedAt ||
    result.currentPolicy.reference !== policy.policy.reference ||
    result.currentPolicy.version !== policy.policy.version ||
    result.evidence.tenantId !== policy.tenant.tenantId ||
    result.evidence.actorIdentityId !== policy.actor.identityId ||
    result.evidence.subjectReference !== expectedSubjectReference ||
    result.evidence.action !== policy.action ||
    result.evidence.currentPolicy.reference !== policy.policy.reference ||
    result.evidence.currentPolicy.version !== policy.policy.version ||
    !sameScope(result.evidence.requestedScope, policy.requestedScope) ||
    !sameScope(result.effectiveScope, result.evidence.effectiveScope)
  ) {
    return false;
  }

  if (!result.authorized) {
    return result.effectiveScope.length === 0 && result.evidence.effectiveScope.length === 0;
  }

  if (
    result.policyDecision !== 'ALLOW' ||
    policyResult === undefined ||
    policyResult.decision !== 'ALLOW' ||
    policyResult.schemaVersion !== policy.schemaVersion ||
    policyResult.correlation.correlationId !== policy.correlation.correlationId ||
    policyResult.evaluatedAt !== policy.evaluatedAt ||
    policyResult.policy.reference !== policy.policy.reference ||
    policyResult.policy.version !== policy.policy.version ||
    policyResult.evidence.tenantId !== policy.tenant.tenantId ||
    policyResult.evidence.actorIdentityId !== policy.actor.identityId ||
    policyResult.evidence.subjectReference !== expectedSubjectReference ||
    policyResult.evidence.action !== policy.action ||
    !sameScope(policyResult.evidence.requestedScope, policy.requestedScope) ||
    !sameScope(result.effectiveScope, policy.requestedScope)
  ) {
    return false;
  }

  if (policy.policyToken !== undefined) {
    if (
      result.tokenValidation?.valid !== true ||
      result.tokenValidation.evidence.policyTokenId !== policy.policyToken.policyTokenId ||
      !sameScope(result.tokenValidation.effectiveScope, policy.requestedScope)
    ) {
      return false;
    }
  }

  return true;
}

function denied(
  request: ExecutorAuthorityGateRequest,
  reasons: readonly ExecutorAuthorityGateReason[],
  authorityResult?: AuthorityEvaluationResult,
): ExecutorAuthorityGateResult {
  return {
    kind: 'EXECUTOR_AUTHORITY_GATE',
    schemaVersion: request.schemaVersion,
    actionIntentId: request.actionIntent.actionIntentId,
    authorizesExecution: false,
    currentAuthorityValidated: false,
    executionEligible: false,
    reasons: uniqueSorted(reasons),
    ...(authorityResult === undefined ? {} : { authorityResult }),
  };
}

/**
 * W07-B execution boundary. Every eligible result is derived from a fresh,
 * explicitly supplied W02 AuthorityEvaluationRequest and the required canonical
 * current-authority validation port. Planner lane, confidence, precheck and
 * ExecutionBudget signals are never consulted for permission.
 */
export function validateExecutorAuthority(
  request: ExecutorAuthorityGateRequest,
): ExecutorAuthorityGateResult {
  const bindingReasons = requestBindingReasons(
    request.schemaVersion,
    request.actionIntent,
    request.authorityEvaluation,
  );
  if (bindingReasons.length > 0) return denied(request, bindingReasons);

  let result: AuthorityEvaluationResult;
  try {
    result = request.validateCurrentAuthority(request.authorityEvaluation);
  } catch {
    return denied(request, ['CURRENT_AUTHORITY_VALIDATOR_FAILED']);
  }

  if (!resultMatchesCurrentRequest(result, request.authorityEvaluation)) {
    return denied(request, ['CURRENT_AUTHORITY_RESULT_MISMATCH'], result);
  }

  if (!result.authorized || result.policyDecision !== 'ALLOW') {
    return denied(request, ['CURRENT_AUTHORITY_DENIED'], result);
  }

  return {
    kind: 'EXECUTOR_AUTHORITY_GATE',
    schemaVersion: request.schemaVersion,
    actionIntentId: request.actionIntent.actionIntentId,
    authorizesExecution: false,
    currentAuthorityValidated: true,
    executionEligible: true,
    reasons: [],
    authorityResult: result,
  };
}
