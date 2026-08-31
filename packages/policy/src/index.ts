import { evaluateConsent } from '@aurora/contracts/consent';
import type { ActorRef, SubjectRef } from '@aurora/contracts/context';
import type {
  PolicyEvaluationReason,
  PolicyEvaluationRequest,
  PolicyEvaluationResult,
  PolicyRule,
} from '@aurora/contracts/policy-engine';
import type { OwnerDecision, PolicyReference, PolicyToken } from '@aurora/contracts/policy';

const EFFECT_RANK = {
  ALLOW: 1,
  REQUIRE_APPROVAL: 2,
  DENY: 3,
} as const;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function fingerprint(value: unknown): string {
  const input = stableJson(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

function samePolicy(a: PolicyReference, b: PolicyReference): boolean {
  return a.reference === b.reference && a.version === b.version;
}

function sameActor(a: ActorRef, b: ActorRef): boolean {
  if (a.kind !== b.kind || a.identityId !== b.identityId) return false;
  if (!a.externalIdentity && !b.externalIdentity) return true;
  if (!a.externalIdentity || !b.externalIdentity) return false;
  return (
    a.externalIdentity.provider === b.externalIdentity.provider &&
    a.externalIdentity.externalId === b.externalIdentity.externalId
  );
}

export function toAuthoritySubjectReference(subject: SubjectRef): string {
  if (subject.kind === 'IDENTITY') return `identity:${subject.identityId}`;
  return `external:${subject.externalIdentity.provider}:${subject.externalIdentity.externalId}`;
}

function scopeCovers(granted: readonly string[], requested: readonly string[]): boolean {
  const grantedSet = new Set(granted);
  return requested.every((scope) => grantedSet.has(scope));
}

function uniqueSorted<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)].sort() as readonly T[];
}

function deny(
  request: PolicyEvaluationRequest,
  reasons: readonly PolicyEvaluationReason[],
  matchedRules: readonly PolicyRule[] = [],
): PolicyEvaluationResult {
  const normalizedReasons = uniqueSorted(reasons);
  const matchedRuleIds = uniqueSorted(matchedRules.map((rule) => rule.ruleId));
  const reasonReferences = uniqueSorted(
    matchedRules.flatMap((rule) => (rule.reasonReference ? [rule.reasonReference] : [])),
  );
  const subjectReference = toAuthoritySubjectReference(request.subject);
  return {
    kind: 'PolicyEvaluationResult',
    schemaVersion: request.schemaVersion,
    decision: 'DENY',
    policy: request.policy,
    correlation: request.correlation,
    evaluatedAt: request.evaluatedAt,
    reasons: normalizedReasons,
    evidence: {
      policy: request.policy,
      tenantId: request.tenant.tenantId,
      actorIdentityId: request.actor.identityId,
      subjectReference,
      action: request.action,
      requestedScope: request.requestedScope,
      matchedRuleIds,
      reasonReferences,
      inputFingerprint: fingerprint(request),
    },
    error: {
      kind: 'CanonicalError',
      schemaVersion: request.schemaVersion,
      code: normalizedReasons.includes('POLICY_VERSION_MISMATCH') ? 'CONFLICT' : 'POLICY_DENIED',
      category: normalizedReasons.includes('POLICY_VERSION_MISMATCH') ? 'CONFLICT' : 'POLICY_DENIED',
      message: 'Policy evaluation denied the requested action.',
      retryability: normalizedReasons.includes('POLICY_VERSION_MISMATCH')
        ? 'RETRY_AFTER_GUARDS'
        : 'DO_NOT_RETRY',
      correlationId: request.correlation.correlationId,
      timestamp: request.evaluatedAt,
      ...(request.dataClassification === undefined
        ? {}
        : { classification: request.dataClassification }),
      details: {
        reasons: normalizedReasons,
        policyReference: request.policy.reference,
        policyVersion: request.policy.version,
        action: request.action,
      },
    },
  };
}

function succeed(
  request: PolicyEvaluationRequest,
  decision: 'ALLOW' | 'REQUIRE_APPROVAL',
  reasons: readonly PolicyEvaluationReason[],
  matchedRules: readonly PolicyRule[],
): PolicyEvaluationResult {
  const subjectReference = toAuthoritySubjectReference(request.subject);
  return {
    kind: 'PolicyEvaluationResult',
    schemaVersion: request.schemaVersion,
    decision,
    policy: request.policy,
    correlation: request.correlation,
    evaluatedAt: request.evaluatedAt,
    reasons: uniqueSorted(reasons),
    evidence: {
      policy: request.policy,
      tenantId: request.tenant.tenantId,
      actorIdentityId: request.actor.identityId,
      subjectReference,
      action: request.action,
      requestedScope: request.requestedScope,
      matchedRuleIds: uniqueSorted(matchedRules.map((rule) => rule.ruleId)),
      reasonReferences: uniqueSorted(
        matchedRules.flatMap((rule) => (rule.reasonReference ? [rule.reasonReference] : [])),
      ),
      inputFingerprint: fingerprint(request),
    },
  };
}

function validateOwnerDecision(
  request: PolicyEvaluationRequest,
  decision: OwnerDecision,
): readonly PolicyEvaluationReason[] {
  const reasons: PolicyEvaluationReason[] = [];
  if (decision.actor.kind === 'AGENT') reasons.push('AGENT_AUTHORITY_FORBIDDEN');
  if (decision.tenant.tenantId !== request.tenant.tenantId) reasons.push('AUTHORITY_TENANT_MISMATCH');
  if (!sameActor(decision.actor, request.actor)) reasons.push('AUTHORITY_ACTOR_MISMATCH');
  if (decision.subject.reference !== toAuthoritySubjectReference(request.subject)) {
    reasons.push('AUTHORITY_SUBJECT_MISMATCH');
  }
  if (!scopeCovers(decision.scope, request.requestedScope)) reasons.push('AUTHORITY_SCOPE_INSUFFICIENT');
  if (decision.expiresAt && decision.expiresAt <= request.evaluatedAt) reasons.push('AUTHORITY_EXPIRED');
  if (decision.decision === 'DENIED') reasons.push('AUTHORITY_DENIED');
  if (decision.decision === 'REVOKED') reasons.push('AUTHORITY_REVOKED');
  if (decision.decision === 'EXPIRED') reasons.push('AUTHORITY_EXPIRED');
  return uniqueSorted(reasons);
}

function validatePolicyToken(
  request: PolicyEvaluationRequest,
  token: PolicyToken,
): readonly PolicyEvaluationReason[] {
  const reasons: PolicyEvaluationReason[] = [];
  if (token.tenant.tenantId !== request.tenant.tenantId) reasons.push('AUTHORITY_TENANT_MISMATCH');
  if (token.subject.reference !== toAuthoritySubjectReference(request.subject)) {
    reasons.push('AUTHORITY_SUBJECT_MISMATCH');
  }
  if (token.action !== request.action) reasons.push('AUTHORITY_ACTION_MISMATCH');
  if (!scopeCovers(token.scope, request.requestedScope)) reasons.push('AUTHORITY_SCOPE_INSUFFICIENT');
  if (token.expiresAt <= request.evaluatedAt) reasons.push('AUTHORITY_EXPIRED');
  if (!samePolicy(token.policy, request.policy)) reasons.push('AUTHORITY_POLICY_MISMATCH');
  return uniqueSorted(reasons);
}

function ruleMatchesBase(request: PolicyEvaluationRequest, rule: PolicyRule): boolean {
  const subjectReference = toAuthoritySubjectReference(request.subject);
  return (
    rule.action === request.action &&
    scopeCovers(rule.scope, request.requestedScope) &&
    (!rule.tenantIds || rule.tenantIds.includes(request.tenant.tenantId)) &&
    (!rule.actorKinds || rule.actorKinds.includes(request.actor.kind)) &&
    (!rule.actorIdentityIds || rule.actorIdentityIds.includes(request.actor.identityId)) &&
    (!rule.subjectReferences || rule.subjectReferences.includes(subjectReference)) &&
    (!rule.purposeIds || rule.purposeIds.includes(request.purpose.purposeId)) &&
    (!rule.jurisdictions || rule.jurisdictions.includes(request.jurisdiction.jurisdiction)) &&
    (!rule.dataClassifications ||
      (request.dataClassification !== undefined &&
        rule.dataClassifications.includes(request.dataClassification)))
  );
}

function nearMatchReason(
  request: PolicyEvaluationRequest,
  rules: readonly PolicyRule[],
): PolicyEvaluationReason {
  const actionRules = rules.filter((rule) => rule.action === request.action);
  if (actionRules.length === 0) return 'NO_APPLICABLE_RULE';
  if (actionRules.some((rule) => rule.actorKinds && !rule.actorKinds.includes(request.actor.kind))) {
    return 'ACTOR_NOT_ALLOWED';
  }
  if (
    actionRules.some(
      (rule) => rule.actorIdentityIds && !rule.actorIdentityIds.includes(request.actor.identityId),
    )
  ) {
    return 'ACTOR_NOT_ALLOWED';
  }
  const subjectReference = toAuthoritySubjectReference(request.subject);
  if (
    actionRules.some(
      (rule) => rule.subjectReferences && !rule.subjectReferences.includes(subjectReference),
    )
  ) {
    return 'SUBJECT_NOT_ALLOWED';
  }
  if (actionRules.some((rule) => rule.purposeIds && !rule.purposeIds.includes(request.purpose.purposeId))) {
    return 'PURPOSE_MISMATCH';
  }
  if (
    actionRules.some(
      (rule) =>
        rule.dataClassifications &&
        (request.dataClassification === undefined ||
          !rule.dataClassifications.includes(request.dataClassification)),
    )
  ) {
    return 'DATA_CLASSIFICATION_NOT_ALLOWED';
  }
  return 'NO_APPLICABLE_RULE';
}

function consentFailureReason(reason: string): PolicyEvaluationReason {
  switch (reason) {
    case 'CONSENT_REQUIRED':
      return 'CONSENT_REQUIRED';
    case 'CONSENT_EXPIRED':
      return 'CONSENT_EXPIRED';
    case 'CONSENT_REVOKED':
      return 'CONSENT_REVOKED';
    case 'PURPOSE_MISMATCH':
      return 'PURPOSE_MISMATCH';
    case 'JURISDICTION_MISMATCH':
      return 'CONSENT_JURISDICTION_MISMATCH';
    case 'SUBJECT_MISMATCH':
      return 'CONSENT_SUBJECT_MISMATCH';
    case 'MISSING_PROVENANCE':
      return 'CONSENT_PROVENANCE_MISSING';
    default:
      return 'CONSENT_REQUIRED';
  }
}

/**
 * Pure policy evaluation. No model output, confidence, planner state, provider,
 * database, clock, randomness, or network input is consulted. Time is explicit
 * in request.evaluatedAt, making replay deterministic.
 */
export function evaluatePolicy(request: PolicyEvaluationRequest): PolicyEvaluationResult {
  if (request.snapshot.state !== 'ACTIVE') return deny(request, ['POLICY_STATE_UNKNOWN']);
  if (!samePolicy(request.policy, request.snapshot.policy)) {
    return deny(request, ['POLICY_VERSION_MISMATCH']);
  }
  if (
    request.tenantBoundary.status !== 'WITHIN_BOUNDARY' ||
    request.tenantBoundary.correlationId !== request.correlation.correlationId ||
    request.tenantBoundary.evidence.evaluatedTenantId !== request.tenant.tenantId ||
    request.tenantBoundary.evidence.actorIdentityId !== request.actor.identityId
  ) {
    return deny(request, ['TENANT_BOUNDARY_DENIED']);
  }
  if (request.purpose.status !== 'ACTIVE') return deny(request, ['PURPOSE_DISABLED']);
  if (
    request.dataClassification !== undefined &&
    request.purpose.allowedDataClassifications &&
    !request.purpose.allowedDataClassifications.includes(request.dataClassification)
  ) {
    return deny(request, ['DATA_CLASSIFICATION_NOT_ALLOWED']);
  }

  const jurisdictionDenied = request.jurisdictionRestrictions?.some(
    (restriction) =>
      restriction.jurisdiction === request.jurisdiction.jurisdiction &&
      restriction.effect === 'DENY' &&
      (!restriction.purposeIds || restriction.purposeIds.includes(request.purpose.purposeId)),
  );
  if (jurisdictionDenied) return deny(request, ['JURISDICTION_DENIED']);

  const authorityReasons = [
    ...(request.ownerDecision ? validateOwnerDecision(request, request.ownerDecision) : []),
    ...(request.policyToken ? validatePolicyToken(request, request.policyToken) : []),
  ];
  if (authorityReasons.length > 0) return deny(request, authorityReasons);

  const matchedRules = request.snapshot.rules.filter((rule) => ruleMatchesBase(request, rule));
  if (matchedRules.length === 0) {
    return deny(request, [nearMatchReason(request, request.snapshot.rules)]);
  }

  if (matchedRules.some((rule) => rule.consentRequired)) {
    const consentResult = evaluateConsent({
      schemaVersion: request.schemaVersion,
      correlationId: request.correlation.correlationId,
      tenantId: request.tenant.tenantId,
      subject: request.subject,
      purpose: request.purpose,
      jurisdiction: request.jurisdiction,
      evaluatedAt: request.evaluatedAt,
      ...(request.consent === undefined ? {} : { consent: request.consent }),
    });
    if (!consentResult.satisfied) {
      return deny(request, [consentFailureReason(consentResult.reason)], matchedRules);
    }
  }

  if (
    matchedRules.some((rule) => rule.authorityRequired) &&
    request.ownerDecision === undefined &&
    request.policyToken === undefined
  ) {
    return deny(request, ['AUTHORITY_REQUIRED'], matchedRules);
  }

  const effects = uniqueSorted(matchedRules.map((rule) => rule.effect));
  const highestEffect = [...effects].sort((a, b) => EFFECT_RANK[b] - EFFECT_RANK[a])[0];
  if (highestEffect === undefined) return deny(request, ['NO_APPLICABLE_RULE']);

  if (highestEffect === 'DENY') {
    return deny(
      request,
      effects.length > 1 ? ['EXPLICIT_DENY', 'CONFLICTING_RULES'] : ['EXPLICIT_DENY'],
      matchedRules,
    );
  }
  if (highestEffect === 'REQUIRE_APPROVAL') {
    return succeed(request, 'REQUIRE_APPROVAL', ['APPROVAL_REQUIRED'], matchedRules);
  }
  return succeed(request, 'ALLOW', ['POLICY_ALLOWED'], matchedRules);
}
