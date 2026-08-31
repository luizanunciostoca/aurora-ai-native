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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

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
  return { kind: 'AuthorityEvaluationRequest', policyEvaluation, ...overrides };
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

function expectInvalid(input: PolicyTokenValidationRequest, reason: string): void {
  const result = validatePolicyToken(input);
  if (result.valid) throw new Error(`expected invalid authority for ${reason}`);
  assert(result.effectiveScope.length === 0, `${reason}: invalid authority widened scope`);
  assert(result.reasons.includes(reason as never), `${reason}: reason missing`);
  assert(result.error.kind === 'CanonicalError', `${reason}: CanonicalError missing`);
}

const matrix: readonly { readonly name: string; readonly run: () => void }[] = [
  {
    name: 'valid token / least authority',
    run: () => {
      const result = validatePolicyToken(
        validationRequest(token({ scope: ['instagram:publish', 'instagram:admin'] })),
      );
      assert(result.valid, 'valid token rejected');
      assertDeepEqual(result.effectiveScope, ['instagram:publish'], 'least authority not enforced');
    },
  },
  {
    name: 'expired token',
    run: () =>
      expectInvalid(
        validationRequest(token({ expiresAt: '2026-08-31T17:59:59.000Z' as Rfc3339Timestamp })),
        'TOKEN_EXPIRED',
      ),
  },
  {
    name: 'not-yet-valid token',
    run: () =>
      expectInvalid(
        validationRequest(
          token({
            issuedAt: '2026-08-31T18:30:00.000Z' as Rfc3339Timestamp,
            expiresAt: '2026-08-31T19:30:00.000Z' as Rfc3339Timestamp,
          }),
        ),
        'TOKEN_NOT_YET_VALID',
      ),
  },
  {
    name: 'wrong tenant / cross-tenant injection',
    run: () =>
      expectInvalid(
        validationRequest(token({ tenant: { tenantId: tenantB } })),
        'TOKEN_TENANT_MISMATCH',
      ),
  },
  {
    name: 'wrong subject',
    run: () =>
      expectInvalid(
        validationRequest(token({ subject: { reference: `identity:${subjectB}` } })),
        'TOKEN_SUBJECT_MISMATCH',
      ),
  },
  {
    name: 'wrong scope',
    run: () =>
      expectInvalid(
        validationRequest(token({ scope: ['instagram:read'] })),
        'TOKEN_SCOPE_INSUFFICIENT',
      ),
  },
  {
    name: 'no scope widening',
    run: () =>
      expectInvalid(
        validationRequest(token(), {
          requestedScope: ['instagram:publish', 'instagram:admin'],
        }),
        'TOKEN_SCOPE_INSUFFICIENT',
      ),
  },
  {
    name: 'wrong action',
    run: () =>
      expectInvalid(validationRequest(token({ action: 'social.delete' })), 'TOKEN_ACTION_MISMATCH'),
  },
  {
    name: 'constraint violation',
    run: () => {
      const constraints: AuthorityConstraints = { channel: 'instagram', mode: 'publish' };
      expectInvalid(
        validationRequest(token({ constraints }), {
          operationConstraints: { channel: 'facebook', mode: 'publish' },
        }),
        'TOKEN_CONSTRAINT_VIOLATION',
      );
    },
  },
  {
    name: 'stale authority / policy version mismatch',
    run: () =>
      expectInvalid(
        validationRequest(
          token({ policy: { reference: policy.reference, version: previousPolicyVersion } }),
        ),
        'TOKEN_POLICY_VERSION_MISMATCH',
      ),
  },
  {
    name: 'policy reference mismatch',
    run: () =>
      expectInvalid(
        validationRequest(
          token({ policy: { reference: 'policy:other', version: policy.version } }),
        ),
        'TOKEN_POLICY_REFERENCE_MISMATCH',
      ),
  },
  {
    name: 'revoked authority',
    run: () => {
      const revoked = token();
      expectInvalid(
        validationRequest(revoked, { revokedPolicyTokenIds: [revoked.policyTokenId] }),
        'TOKEN_REVOKED',
      );
    },
  },
  {
    name: 'malformed subject reference',
    run: () =>
      expectInvalid(
        validationRequest(token({ subject: { reference: 'identity:' } })),
        'MALFORMED_SUBJECT_REFERENCE',
      ),
  },
  {
    name: 'provider credential injection forbidden',
    run: () => {
      const injected = { ...token(), providerSecret: 'never-credential-material' } as PolicyToken;
      expectInvalid(validationRequest(injected), 'MALFORMED_POLICY_TOKEN');
    },
  },
  {
    name: 'OwnerDecision allow compatible',
    run: () => {
      const decision = ownerDecision();
      const decisionToken = token({
        authorityClass: 'OWNER_DECISION',
        decisionReference: decision.decisionId,
      });
      const result = validatePolicyToken(
        validationRequest(decisionToken, { ownerDecision: decision }),
      );
      assert(result.valid, 'compatible OwnerDecision-backed authority rejected');
    },
  },
  {
    name: 'OwnerDecision expired',
    run: () => {
      const decision = ownerDecision({
        expiresAt: '2026-08-31T17:59:59.000Z' as Rfc3339Timestamp,
      });
      const result = evaluateAuthority(
        authorityRequest(policyRequest({ policyToken: null, ownerDecision: decision })),
      );
      assert(!result.authorized, 'expired OwnerDecision authorized operation');
      assert(result.reasons.includes('OWNER_DECISION_EXPIRED'), 'expired decision reason missing');
    },
  },
  {
    name: 'OwnerDecision denied',
    run: () => {
      const result = evaluateAuthority(
        authorityRequest(
          policyRequest({
            policyToken: null,
            ownerDecision: ownerDecision({ decision: 'DENIED' }),
          }),
        ),
      );
      assert(!result.authorized, 'DENIED OwnerDecision authorized operation');
      assert(result.reasons.includes('OWNER_DECISION_DENIED'), 'denied decision reason missing');
    },
  },
  {
    name: 'OwnerDecision revoked',
    run: () => {
      const result = evaluateAuthority(
        authorityRequest(
          policyRequest({
            policyToken: null,
            ownerDecision: ownerDecision({ decision: 'REVOKED' }),
          }),
        ),
      );
      assert(!result.authorized, 'REVOKED OwnerDecision authorized operation');
      assert(result.reasons.includes('OWNER_DECISION_REVOKED'), 'revoked decision reason missing');
    },
  },
  {
    name: 'stale OwnerDecision cannot override current policy DENY',
    run: () => {
      const denyRule: PolicyRule = { ...allowRule, ruleId: 'rule.current-deny', effect: 'DENY' };
      const result = evaluateAuthority(
        authorityRequest(
          policyRequest({
            snapshot: snapshot([denyRule]),
            policyToken: null,
            ownerDecision: ownerDecision(),
          }),
        ),
      );
      assert(!result.authorized, 'OwnerDecision overrode current policy DENY');
      assert(result.policyDecision === 'DENY', 'current policy DENY did not win');
    },
  },
  {
    name: 'wrong actor',
    run: () => {
      const result = evaluateAuthority(
        authorityRequest(
          policyRequest({
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
          }),
        ),
      );
      assert(!result.authorized, 'wrong actor authorized operation');
      assert(result.policyDecision === 'DENY', 'wrong actor did not fail closed');
    },
  },
  {
    name: 'deterministic replay',
    run: () => {
      const input = authorityRequest(policyRequest());
      const first = evaluateAuthority(input);
      const second = evaluateAuthority(input);
      assertDeepEqual(first, second, 'deterministic replay diverged');
      assert(
        first.evidence.inputFingerprint === second.evidence.inputFingerprint,
        'deterministic fingerprint diverged',
      );
    },
  },
  {
    name: 'confidence cannot create permission',
    run: () => {
      const denyRule: PolicyRule = { ...allowRule, ruleId: 'rule.deny-confidence', effect: 'DENY' };
      const base = policyRequest({ snapshot: snapshot([denyRule]) });
      const high = evaluateAuthority(
        authorityRequest({ ...base, modelConfidence: 1 } as PolicyEvaluationRequest),
      );
      const low = evaluateAuthority(
        authorityRequest({ ...base, modelConfidence: 0 } as PolicyEvaluationRequest),
      );
      assert(!high.authorized && !low.authorized, 'confidence elevated authority');
      assert(high.policyDecision === 'DENY' && low.policyDecision === 'DENY', 'DENY changed');
    },
  },
  {
    name: 'SubjectRef <-> AuthoritySubjectReference bridge',
    run: () => {
      const subject = { kind: 'IDENTITY', identityId: subjectA } as const;
      const authoritySubject = subjectRefToAuthoritySubjectReference(subject);
      assert(authoritySubject.reference === `identity:${subjectA}`, 'forward bridge mismatch');
      assertDeepEqual(
        authoritySubjectReferenceToSubjectRef(authoritySubject),
        subject,
        'inverse bridge mismatch',
      );
    },
  },
];

for (const entry of matrix) {
  try {
    entry.run();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`[W02-E] ${entry.name}: ${detail}`);
  }
}
