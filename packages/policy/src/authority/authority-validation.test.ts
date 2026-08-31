import assert from 'node:assert/strict';
import test from 'node:test';

import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type {
  CorrelationId,
  DecisionId,
  IdentityId,
  PolicyTokenId,
  TenantId,
} from '@aurora/contracts/ids';
import type {
  AuthorityConstraints,
  OwnerDecision,
  PolicyReference,
  PolicyToken,
} from '@aurora/contracts/policy';
import type {
  PolicyEvaluationRequest,
  PolicyRule,
  PolicySnapshot,
} from '@aurora/contracts/policy-engine';
import type {
  AuthorityEvaluationRequest,
  PolicyTokenValidationRequest,
} from '@aurora/contracts/policy-validation';
import type { ContractVersion, Version } from '@aurora/contracts/versioning';

import {
  authoritySubjectReferenceToSubjectRef,
  evaluateAuthority,
  subjectRefToAuthoritySubjectReference,
  validatePolicyToken,
} from './index';

const schemaVersion = '1.0.0' as ContractVersion;
const policyVersion = '2.4.0' as Version;
const previousPolicyVersion = '2.3.0' as Version;
const correlationId = 'cor_01J00000000000000000000000' as CorrelationId;
const tenantA = 'ten_01J00000000000000000000000' as TenantId;
const tenantB = 'ten_01J00000000000000000000001' as TenantId;
const actorA = 'idn_01J00000000000000000000000' as IdentityId;
const actorB = 'idn_01J00000000000000000000001' as IdentityId;
const subjectA = 'idn_01J00000000000000000000002' as IdentityId;
const subjectB = 'idn_01J00000000000000000000003' as IdentityId;
const evaluatedAt = '2026-08-31T18:00:00.000Z' as Rfc3339Timestamp;
const policy: PolicyReference = { reference: 'policy:toca:marketing', version: policyVersion };

const allowRule: PolicyRule = {
  ruleId: 'rule.allow.publish',
  effect: 'ALLOW',
  action: 'social.publish',
  scope: ['instagram:publish'],
  tenantIds: [tenantA],
  actorKinds: ['HUMAN'],
  actorIdentityIds: [actorA],
  subjectReferences: [`identity:${subjectA}`],
  purposeIds: ['marketing'],
  jurisdictions: ['BR-BA'],
  dataClassifications: ['INTERNAL'],
  authorityRequired: true,
  reasonReference: 'policy:toca:marketing#allow-publish',
};

function snapshot(rules: readonly PolicyRule[] = [allowRule]): PolicySnapshot {
  return { kind: 'PolicySnapshot', policy, state: 'ACTIVE', rules };
}

function token(overrides: Partial<PolicyToken> = {}): PolicyToken {
  return {
    kind: 'POLICY_TOKEN',
    schemaVersion,
    policyTokenId: 'ptk_01J00000000000000000000000' as PolicyTokenId,
    tenant: { tenantId: tenantA },
    subject: { reference: `identity:${subjectA}` },
    action: 'social.publish',
    scope: ['instagram:publish'],
    issuedAt: '2026-08-31T17:00:00.000Z' as Rfc3339Timestamp,
    expiresAt: '2026-08-31T19:00:00.000Z' as Rfc3339Timestamp,
    policy,
    authorityClass: 'POLICY_RULE',
    correlation: { correlationId },
    ...overrides,
  };
}

function ownerDecision(overrides: Partial<OwnerDecision> = {}): OwnerDecision {
  return {
    kind: 'OWNER_DECISION',
    schemaVersion,
    decisionId: 'odc_01J00000000000000000000000' as DecisionId,
    subject: { reference: `identity:${subjectA}` },
    decision: 'APPROVED',
    actor: { kind: 'HUMAN', identityId: actorA },
    tenant: { tenantId: tenantA },
    decidedAt: '2026-08-31T17:00:00.000Z' as Rfc3339Timestamp,
    scope: ['instagram:publish'],
    expiresAt: '2026-08-31T19:00:00.000Z' as Rfc3339Timestamp,
    correlation: { correlationId },
    ...overrides,
  };
}

type PolicyRequestOverrides = Omit<
  Partial<PolicyEvaluationRequest>,
  'policyToken' | 'ownerDecision'
> & {
  readonly policyToken?: PolicyToken | null;
  readonly ownerDecision?: OwnerDecision | null;
};

function policyRequest(overrides: PolicyRequestOverrides = {}): PolicyEvaluationRequest {
  const { policyToken: tokenOverride, ownerDecision: decisionOverride, ...rest } = overrides;
  const actor = rest.actor ?? { kind: 'HUMAN', identityId: actorA };
  const tenant = rest.tenant ?? { tenantId: tenantA };
  const resolvedToken = tokenOverride === undefined ? token() : tokenOverride;
  return {
    kind: 'PolicyEvaluationRequest',
    schemaVersion,
    policy,
    snapshot: snapshot(),
    correlation: { correlationId },
    evaluatedAt,
    tenant,
    tenantBoundary: {
      status: 'WITHIN_BOUNDARY',
      reason: 'BOUNDARY_CONFIRMED',
      correlationId,
      evidence: {
        evaluatedTenantId: tenant.tenantId,
        actorIdentityId: actor.identityId,
        matchedBindingCount: 1,
        observedBindingTenantIds: [tenant.tenantId],
      },
    },
    actor,
    subject: { kind: 'IDENTITY', identityId: subjectA },
    action: 'social.publish',
    requestedScope: ['instagram:publish'],
    purpose: {
      kind: 'PurposeContext',
      purposeId: 'marketing',
      version: schemaVersion,
      status: 'ACTIVE',
      allowedDataClassifications: ['PUBLIC', 'INTERNAL'],
    },
    jurisdiction: { kind: 'JurisdictionContext', jurisdiction: 'BR-BA', version: schemaVersion },
    dataClassification: 'INTERNAL',
    ...rest,
    ...(resolvedToken === null ? {} : { policyToken: resolvedToken }),
    ...(decisionOverride === undefined || decisionOverride === null
      ? {}
      : { ownerDecision: decisionOverride }),
  };
}

function authorityRequest(
  policyEvaluation: PolicyEvaluationRequest = policyRequest(),
  overrides: Omit<Partial<AuthorityEvaluationRequest>, 'kind' | 'policyEvaluation'> = {},
): AuthorityEvaluationRequest {
  return {
    kind: 'AuthorityEvaluationRequest',
    policyEvaluation,
    ...overrides,
  };
}

function validationRequest(
  tokenValue: PolicyToken = token(),
  overrides: Partial<PolicyTokenValidationRequest> = {},
): PolicyTokenValidationRequest {
  return {
    kind: 'PolicyTokenValidationRequest',
    schemaVersion,
    token: tokenValue,
    evaluatedAt,
    correlation: { correlationId },
    tenant: { tenantId: tenantA },
    actor: { kind: 'HUMAN', identityId: actorA },
    subject: { kind: 'IDENTITY', identityId: subjectA },
    action: 'social.publish',
    requestedScope: ['instagram:publish'],
    policy,
    ...overrides,
  };
}

function expectInvalid(
  input: PolicyTokenValidationRequest,
  reason: string,
): ReturnType<typeof validatePolicyToken> {
  const result = validatePolicyToken(input);
  assert.equal(result.valid, false);
  assert.equal(result.effectiveScope.length, 0);
  assert.ok(result.reasons.includes(reason as never), `missing reason ${reason}`);
  assert.equal(result.error.kind, 'CanonicalError');
  return result;
}

test('valid token yields only requested least-authority scope', () => {
  const result = validatePolicyToken(
    validationRequest(token({ scope: ['instagram:publish', 'instagram:admin'] })),
  );
  assert.equal(result.valid, true);
  assert.deepEqual(result.effectiveScope, ['instagram:publish']);
  assert.deepEqual(result.evidence.effectiveScope, ['instagram:publish']);
});

test('expired token fails closed', () => {
  expectInvalid(
    validationRequest(
      token({ expiresAt: '2026-08-31T17:59:59.000Z' as Rfc3339Timestamp }),
    ),
    'TOKEN_EXPIRED',
  );
});

test('not-yet-valid token uses issuedAt as frozen W01 lower validity bound', () => {
  expectInvalid(
    validationRequest(
      token({
        issuedAt: '2026-08-31T18:30:00.000Z' as Rfc3339Timestamp,
        expiresAt: '2026-08-31T19:30:00.000Z' as Rfc3339Timestamp,
      }),
    ),
    'TOKEN_NOT_YET_VALID',
  );
});

test('wrong tenant and cross-tenant injection fail closed', () => {
  const result = expectInvalid(
    validationRequest(token({ tenant: { tenantId: tenantB } })),
    'TOKEN_TENANT_MISMATCH',
  );
  assert.equal(result.valid, false);
});

test('wrong subject fails closed', () => {
  expectInvalid(
    validationRequest(token({ subject: { reference: `identity:${subjectB}` } })),
    'TOKEN_SUBJECT_MISMATCH',
  );
});

test('wrong scope and scope widening fail closed', () => {
  expectInvalid(validationRequest(token({ scope: ['instagram:read'] })), 'TOKEN_SCOPE_INSUFFICIENT');
  const widened = expectInvalid(
    validationRequest(token(), { requestedScope: ['instagram:publish', 'instagram:admin'] }),
    'TOKEN_SCOPE_INSUFFICIENT',
  );
  assert.deepEqual(widened.effectiveScope, []);
});

test('wrong action fails closed', () => {
  expectInvalid(validationRequest(token({ action: 'social.delete' })), 'TOKEN_ACTION_MISMATCH');
});

test('opaque constraint mismatch fails closed without inventing domain semantics', () => {
  const constraints: AuthorityConstraints = { channel: 'instagram', mode: 'publish' };
  expectInvalid(
    validationRequest(token({ constraints }), {
      operationConstraints: { channel: 'facebook', mode: 'publish' },
    }),
    'TOKEN_CONSTRAINT_VIOLATION',
  );
});

test('stale policy version fails closed', () => {
  const result = expectInvalid(
    validationRequest(
      token({ policy: { reference: policy.reference, version: previousPolicyVersion } }),
    ),
    'TOKEN_POLICY_VERSION_MISMATCH',
  );
  assert.ok(result.reasons.includes('TOKEN_STALE'));
});

test('policy reference mismatch fails closed', () => {
  const result = expectInvalid(
    validationRequest(
      token({ policy: { reference: 'policy:other', version: policy.version } }),
    ),
    'TOKEN_POLICY_REFERENCE_MISMATCH',
  );
  assert.ok(result.reasons.includes('TOKEN_STALE'));
});

test('revoked token fails closed using explicit deterministic revocation snapshot', () => {
  const revoked = token();
  expectInvalid(
    validationRequest(revoked, { revokedPolicyTokenIds: [revoked.policyTokenId] }),
    'TOKEN_REVOKED',
  );
});

test('malformed authority subject reference fails closed', () => {
  const malformed = token({ subject: { reference: 'identity:' } });
  expectInvalid(validationRequest(malformed), 'MALFORMED_SUBJECT_REFERENCE');
});

test('provider secret injection is malformed rather than authority', () => {
  const injected = { ...token(), providerSecret: 'never-credential-material' } as PolicyToken;
  expectInvalid(validationRequest(injected), 'MALFORMED_POLICY_TOKEN');
});

test('OwnerDecision-backed token requires compatible decision', () => {
  const decision = ownerDecision();
  const decisionToken = token({
    authorityClass: 'OWNER_DECISION',
    decisionReference: decision.decisionId,
  });
  const result = validatePolicyToken(validationRequest(decisionToken, { ownerDecision: decision }));
  assert.equal(result.valid, true);
});

test('expired OwnerDecision fails closed', () => {
  const decision = ownerDecision({ expiresAt: '2026-08-31T17:59:59.000Z' as Rfc3339Timestamp });
  const result = evaluateAuthority(
    authorityRequest(policyRequest({ policyToken: null, ownerDecision: decision })),
  );
  assert.equal(result.authorized, false);
  assert.ok(result.reasons.includes('OWNER_DECISION_EXPIRED'));
});

test('denied and revoked OwnerDecision fail closed', () => {
  for (const state of ['DENIED', 'REVOKED'] as const) {
    const decision = ownerDecision({ decision: state });
    const result = evaluateAuthority(
      authorityRequest(policyRequest({ policyToken: null, ownerDecision: decision })),
    );
    assert.equal(result.authorized, false);
    assert.ok(
      result.reasons.includes(
        state === 'DENIED' ? 'OWNER_DECISION_DENIED' : 'OWNER_DECISION_REVOKED',
      ),
    );
  }
});

test('current-policy DENY wins over otherwise valid OwnerDecision', () => {
  const denyRule: PolicyRule = { ...allowRule, ruleId: 'rule.current-deny', effect: 'DENY' };
  const request = policyRequest({
    snapshot: snapshot([denyRule]),
    policyToken: null,
    ownerDecision: ownerDecision(),
  });
  const result = evaluateAuthority(authorityRequest(request));
  assert.equal(result.authorized, false);
  assert.equal(result.policyDecision, 'DENY');
  assert.ok(result.reasons.includes('EXPLICIT_DENY'));
});

test('wrong actor cannot be rescued by a structurally valid token', () => {
  const request = policyRequest({
    actor: { kind: 'HUMAN', identityId: actorB },
    tenantBoundary: {
      status: 'WITHIN_BOUNDARY',
      reason: 'BOUNDARY_CONFIRMED',
      correlationId,
      evidence: {
        evaluatedTenantId: tenantA,
        actorIdentityId: actorB,
        matchedBindingCount: 1,
        observedBindingTenantIds: [tenantA],
      },
    },
  });
  const result = evaluateAuthority(authorityRequest(request));
  assert.equal(result.authorized, false);
  assert.equal(result.policyDecision, 'DENY');
  assert.ok(result.reasons.includes('ACTOR_NOT_ALLOWED'));
});

test('deterministic replay returns byte-equivalent authority results', () => {
  const request = authorityRequest(policyRequest());
  const first = evaluateAuthority(request);
  const second = evaluateAuthority(request);
  assert.deepEqual(first, second);
  assert.equal(first.evidence.inputFingerprint, second.evidence.inputFingerprint);
});

test('model confidence cannot create permission', () => {
  const denyRule: PolicyRule = { ...allowRule, ruleId: 'rule.deny-confidence', effect: 'DENY' };
  const base = policyRequest({ snapshot: snapshot([denyRule]) });
  const high = evaluateAuthority(
    authorityRequest({ ...base, modelConfidence: 1 } as PolicyEvaluationRequest),
  );
  const low = evaluateAuthority(
    authorityRequest({ ...base, modelConfidence: 0 } as PolicyEvaluationRequest),
  );
  assert.equal(high.authorized, false);
  assert.equal(low.authorized, false);
  assert.equal(high.policyDecision, 'DENY');
  assert.equal(low.policyDecision, 'DENY');
});

test('explicit SubjectRef bridge round-trips canonical identity references', () => {
  const subject = { kind: 'IDENTITY', identityId: subjectA } as const;
  const authoritySubject = subjectRefToAuthoritySubjectReference(subject);
  assert.equal(authoritySubject.reference, `identity:${subjectA}`);
  assert.deepEqual(authoritySubjectReferenceToSubjectRef(authoritySubject), subject);
});
