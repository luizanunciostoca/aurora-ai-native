import type { ActorRef, Rfc3339Timestamp, SubjectRef } from '@aurora/contracts/context';
import type { AuthorityConstraints, OwnerDecision } from '@aurora/contracts/policy';
import type {
  AuthorityValidationReason,
  PolicyTokenValidationRequest,
  PolicyTokenValidationResult,
} from '@aurora/contracts/policy-validation';

import { toAuthoritySubjectReference } from '../index';
import {
  constraintsSatisfied,
  fingerprint,
  sameActor,
  scopeCovers,
  uniqueSorted,
  validOwnerDecisionShape,
  validPolicyTokenShape,
} from './internal';
import { authoritySubjectReferenceToSubjectRef } from './subject-bridge';

export interface OwnerDecisionValidationContext {
  readonly evaluatedAt: Rfc3339Timestamp;
  readonly correlation: PolicyTokenValidationRequest['correlation'];
  readonly tenant: PolicyTokenValidationRequest['tenant'];
  readonly actor: ActorRef;
  readonly subject: SubjectRef;
  readonly requestedScope: readonly string[];
  readonly operationConstraints?: AuthorityConstraints;
  readonly requireCorrelationMatch?: boolean;
}

export function ownerDecisionReasons(
  context: OwnerDecisionValidationContext,
  decision: OwnerDecision | undefined,
  required: boolean,
): readonly AuthorityValidationReason[] {
  if (decision === undefined) return required ? ['OWNER_DECISION_REQUIRED'] : [];
  if (!validOwnerDecisionShape(decision)) return ['OWNER_DECISION_MALFORMED'];

  const reasons: AuthorityValidationReason[] = [];
  if (decision.actor.kind === 'AGENT') reasons.push('AGENT_SELF_AUTHORIZATION_FORBIDDEN');
  if (Date.parse(decision.decidedAt) > Date.parse(context.evaluatedAt)) {
    reasons.push('OWNER_DECISION_NOT_YET_VALID');
  }
  if (
    decision.expiresAt !== undefined &&
    Date.parse(decision.expiresAt) <= Date.parse(context.evaluatedAt)
  ) {
    reasons.push('OWNER_DECISION_EXPIRED');
  }
  if (decision.decision === 'DENIED') reasons.push('OWNER_DECISION_DENIED');
  if (decision.decision === 'REVOKED') reasons.push('OWNER_DECISION_REVOKED');
  if (decision.decision === 'EXPIRED') reasons.push('OWNER_DECISION_EXPIRED');
  if (decision.tenant.tenantId !== context.tenant.tenantId) {
    reasons.push('OWNER_DECISION_TENANT_MISMATCH');
  }
  if (!sameActor(decision.actor, context.actor)) reasons.push('OWNER_DECISION_ACTOR_MISMATCH');
  if (decision.subject.reference !== toAuthoritySubjectReference(context.subject)) {
    reasons.push('OWNER_DECISION_SUBJECT_MISMATCH');
  }
  if (!scopeCovers(decision.scope, context.requestedScope)) {
    reasons.push('OWNER_DECISION_SCOPE_INSUFFICIENT');
  }
  if (!constraintsSatisfied(decision.constraints, context.operationConstraints)) {
    reasons.push('OWNER_DECISION_CONSTRAINT_VIOLATION');
  }
  if (
    context.requireCorrelationMatch === true &&
    decision.correlation.correlationId !== context.correlation.correlationId
  ) {
    reasons.push('OWNER_DECISION_CORRELATION_MISMATCH');
  }
  return uniqueSorted(reasons);
}

export function makeAuthorityValidationError(
  request: PolicyTokenValidationRequest,
  reasons: readonly AuthorityValidationReason[],
): NonNullable<PolicyTokenValidationResult['error']> {
  const malformed = reasons.some(
    (reason) => reason === 'MALFORMED_POLICY_TOKEN' || reason === 'MALFORMED_SUBJECT_REFERENCE',
  );
  const conflict = reasons.some(
    (reason) =>
      reason === 'TOKEN_STALE' ||
      reason === 'TOKEN_POLICY_REFERENCE_MISMATCH' ||
      reason === 'TOKEN_POLICY_VERSION_MISMATCH',
  );
  return {
    kind: 'CanonicalError',
    schemaVersion: request.schemaVersion,
    code: malformed ? 'VALIDATION_ERROR' : conflict ? 'CONFLICT' : 'FORBIDDEN',
    category: malformed ? 'VALIDATION' : conflict ? 'CONFLICT' : 'AUTHORIZATION',
    message: 'Presented authority is invalid, inapplicable, or insufficient.',
    retryability: conflict ? 'RETRY_AFTER_GUARDS' : 'DO_NOT_RETRY',
    correlationId: request.correlation.correlationId,
    timestamp: request.evaluatedAt,
    details: {
      reasons: [...reasons],
      policyReference: request.policy.reference,
      policyVersion: request.policy.version,
      action: request.action,
    },
  };
}

function validationEvidence(
  request: PolicyTokenValidationRequest,
  effectiveScope: readonly string[],
  includeTokenId: boolean,
) {
  return {
    ...(includeTokenId ? { policyTokenId: request.token.policyTokenId } : {}),
    tenantId: request.tenant.tenantId,
    actorIdentityId: request.actor.identityId,
    subjectReference: toAuthoritySubjectReference(request.subject),
    action: request.action,
    requestedScope: request.requestedScope,
    effectiveScope,
    currentPolicy: request.policy,
    inputFingerprint: fingerprint(request),
  };
}

/**
 * Deterministic, fail-closed PolicyToken validation. No clock, persistence,
 * provider, network, model, planner or credential exchange is consulted.
 */
export function validatePolicyToken(
  request: PolicyTokenValidationRequest,
): PolicyTokenValidationResult {
  if (!validPolicyTokenShape(request.token)) {
    const reasons: readonly AuthorityValidationReason[] = ['MALFORMED_POLICY_TOKEN'];
    return {
      kind: 'PolicyTokenValidationResult',
      schemaVersion: request.schemaVersion,
      valid: false,
      correlation: request.correlation,
      evaluatedAt: request.evaluatedAt,
      currentPolicy: request.policy,
      effectiveScope: [],
      reasons,
      evidence: validationEvidence(request, [], false),
      error: makeAuthorityValidationError(request, reasons),
    };
  }

  const token = request.token;
  const reasons: AuthorityValidationReason[] = [];
  if (authoritySubjectReferenceToSubjectRef(token.subject) === undefined) {
    reasons.push('MALFORMED_SUBJECT_REFERENCE');
  }
  if (Date.parse(token.issuedAt) > Date.parse(request.evaluatedAt)) {
    reasons.push('TOKEN_NOT_YET_VALID');
  }
  if (Date.parse(token.expiresAt) <= Date.parse(request.evaluatedAt)) reasons.push('TOKEN_EXPIRED');
  if (request.revokedPolicyTokenIds?.includes(token.policyTokenId)) reasons.push('TOKEN_REVOKED');
  if (token.tenant.tenantId !== request.tenant.tenantId) reasons.push('TOKEN_TENANT_MISMATCH');
  if (token.subject.reference !== toAuthoritySubjectReference(request.subject)) {
    reasons.push('TOKEN_SUBJECT_MISMATCH');
  }
  if (!scopeCovers(token.scope, request.requestedScope)) reasons.push('TOKEN_SCOPE_INSUFFICIENT');
  if (token.action !== request.action) reasons.push('TOKEN_ACTION_MISMATCH');
  if (!constraintsSatisfied(token.constraints, request.operationConstraints)) {
    reasons.push('TOKEN_CONSTRAINT_VIOLATION');
  }
  if (token.policy.reference !== request.policy.reference) {
    reasons.push('TOKEN_POLICY_REFERENCE_MISMATCH', 'TOKEN_STALE');
  }
  if (token.policy.version !== request.policy.version) {
    reasons.push('TOKEN_POLICY_VERSION_MISMATCH', 'TOKEN_STALE');
  }
  if (
    request.requireCorrelationMatch === true &&
    token.correlation.correlationId !== request.correlation.correlationId
  ) {
    reasons.push('TOKEN_CORRELATION_MISMATCH');
  }

  const requiresOwnerDecision = token.authorityClass === 'OWNER_DECISION';
  reasons.push(...ownerDecisionReasons(request, request.ownerDecision, requiresOwnerDecision));
  if (
    request.ownerDecision !== undefined &&
    validOwnerDecisionShape(request.ownerDecision) &&
    token.decisionReference !== undefined &&
    token.decisionReference !== request.ownerDecision.decisionId
  ) {
    reasons.push('OWNER_DECISION_REFERENCE_MISMATCH');
  }

  const normalized = uniqueSorted(reasons);
  if (normalized.length > 0) {
    return {
      kind: 'PolicyTokenValidationResult',
      schemaVersion: request.schemaVersion,
      valid: false,
      correlation: request.correlation,
      evaluatedAt: request.evaluatedAt,
      currentPolicy: request.policy,
      effectiveScope: [],
      reasons: normalized,
      evidence: validationEvidence(request, [], true),
      error: makeAuthorityValidationError(request, normalized),
    };
  }

  const effectiveScope = [...request.requestedScope];
  return {
    kind: 'PolicyTokenValidationResult',
    schemaVersion: request.schemaVersion,
    valid: true,
    correlation: request.correlation,
    evaluatedAt: request.evaluatedAt,
    currentPolicy: request.policy,
    effectiveScope,
    reasons: [],
    evidence: validationEvidence(request, effectiveScope, true),
  };
}
