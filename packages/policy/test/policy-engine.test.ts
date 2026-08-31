import type { ConsentRecord } from '@aurora/contracts/consent';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { CorrelationId, DecisionId, IdentityId, PolicyTokenId, TenantId } from '@aurora/contracts/ids';
import type { OwnerDecision, PolicyReference, PolicyToken } from '@aurora/contracts/policy';
import type { PolicyEvaluationRequest, PolicyRule, PolicySnapshot } from '@aurora/contracts/policy-engine';
import type { ContractVersion, Version } from '@aurora/contracts/versioning';
import { evaluatePolicy, toAuthoritySubjectReference } from '../src/index';

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
  reasonReference: 'policy:toca:marketing#allow-publish',
};

function snapshot(rules: readonly PolicyRule[] = [allowRule]): PolicySnapshot {
  return { kind: 'PolicySnapshot', policy, state: 'ACTIVE', rules };
}

function consent(overrides: Partial<ConsentRecord> = {}): ConsentRecord {
  return {
    kind: 'ConsentRecord',
    schemaVersion,
    reference: { kind: 'CONSENT_RECORD', reference: 'consent:subject-a', version: schemaVersion },
    tenantId: tenantA,
    subject: { kind: 'IDENTITY', identityId: subjectA },
    status: 'ACTIVE',
    grantedAt: '2026-08-01T00:00:00.000Z' as Rfc3339Timestamp,
    expiresAt: '2026-12-31T23:59:59.000Z' as Rfc3339Timestamp,
    scope: { purposeIds: ['marketing'], jurisdictions: ['BR-BA'] },
    provenance: {
      source: 'crm',
      reference: 'crm-consent-100',
      capturedAt: '2026-08-01T00:00:00.000Z' as Rfc3339Timestamp,
    },
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

function policyToken(overrides: Partial<PolicyToken> = {}): PolicyToken {
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

function request(overrides: Partial<PolicyEvaluationRequest> = {}): PolicyEvaluationRequest {
  return {
    kind: 'PolicyEvaluationRequest',
    schemaVersion,
    policy,
    snapshot: snapshot(),
    correlation: { correlationId },
    evaluatedAt,
    tenant: { tenantId: tenantA },
    tenantBoundary: {
      status: 'WITHIN_BOUNDARY',
      reason: 'BOUNDARY_CONFIRMED',
      correlationId,
      evidence: {
        evaluatedTenantId: tenantA,
        actorIdentityId: actorA,
        matchedBindingCount: 1,
        observedBindingTenantIds: [tenantA],
      },
    },
    actor: { kind: 'HUMAN', identityId: actorA },
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
    ...overrides,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertDecision(
  name: string,
  input: PolicyEvaluationRequest,
  expected: 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL',
  expectedReason?: string,
): void {
  const result = evaluatePolicy(input);
  assert(result.decision === expected, `${name}: expected ${expected}, got ${result.decision}`);
  if (expectedReason) {
    assert(result.reasons.includes(expectedReason as never), `${name}: missing reason ${expectedReason}`);
  }
  if (expected === 'DENY') {
    assert(result.decision === 'DENY' && result.error.kind === 'CanonicalError', `${name}: DENY must carry CanonicalError`);
  }
}

const consentRule: PolicyRule = { ...allowRule, ruleId: 'rule.allow.consent', consentRequired: true };
const authorityRule: PolicyRule = { ...allowRule, ruleId: 'rule.allow.authority', authorityRequired: true };

const cases: readonly {
  readonly name: string;
  readonly input: PolicyEvaluationRequest;
  readonly expected: 'ALLOW' | 'DENY' | 'REQUIRE_APPROVAL';
  readonly reason?: string;
}[] = [
  { name: 'allow', input: request(), expected: 'ALLOW', reason: 'POLICY_ALLOWED' },
  {
    name: 'explicit deny',
    input: request({ snapshot: snapshot([{ ...allowRule, effect: 'DENY', ruleId: 'rule.deny.publish' }]) }),
    expected: 'DENY',
    reason: 'EXPLICIT_DENY',
  },
  {
    name: 'missing rule',
    input: request({ action: 'ads.delete' }),
    expected: 'DENY',
    reason: 'NO_APPLICABLE_RULE',
  },
  {
    name: 'conflicting rule',
    input: request({
      snapshot: snapshot([allowRule, { ...allowRule, ruleId: 'rule.deny.same', effect: 'DENY' }]),
    }),
    expected: 'DENY',
    reason: 'CONFLICTING_RULES',
  },
  {
    name: 'require approval outranks allow',
    input: request({
      snapshot: snapshot([
        allowRule,
        { ...allowRule, ruleId: 'rule.approval.publish', effect: 'REQUIRE_APPROVAL' },
      ]),
    }),
    expected: 'REQUIRE_APPROVAL',
    reason: 'APPROVAL_REQUIRED',
  },
  {
    name: 'wrong tenant',
    input: request({
      tenant: { tenantId: tenantB },
    }),
    expected: 'DENY',
    reason: 'TENANT_BOUNDARY_DENIED',
  },
  {
    name: 'wrong actor',
    input: request({ actor: { kind: 'HUMAN', identityId: actorB } }),
    expected: 'DENY',
    reason: 'TENANT_BOUNDARY_DENIED',
  },
  {
    name: 'wrong subject',
    input: request({ subject: { kind: 'IDENTITY', identityId: subjectB } }),
    expected: 'DENY',
    reason: 'SUBJECT_NOT_ALLOWED',
  },
  {
    name: 'missing consent',
    input: request({ snapshot: snapshot([consentRule]) }),
    expected: 'DENY',
    reason: 'CONSENT_REQUIRED',
  },
  {
    name: 'purpose mismatch',
    input: request({
      purpose: {
        kind: 'PurposeContext',
        purposeId: 'support',
        version: schemaVersion,
        status: 'ACTIVE',
      },
    }),
    expected: 'DENY',
    reason: 'PURPOSE_MISMATCH',
  },
  {
    name: 'expired authority',
    input: request({
      policyToken: policyToken({ expiresAt: '2026-08-31T17:59:59.000Z' as Rfc3339Timestamp }),
    }),
    expected: 'DENY',
    reason: 'AUTHORITY_EXPIRED',
  },
  {
    name: 'insufficient scope',
    input: request({ policyToken: policyToken({ scope: ['instagram:read'] }) }),
    expected: 'DENY',
    reason: 'AUTHORITY_SCOPE_INSUFFICIENT',
  },
  {
    name: 'policy version mismatch',
    input: request({
      snapshot: {
        ...snapshot(),
        policy: { reference: policy.reference, version: previousPolicyVersion },
      },
    }),
    expected: 'DENY',
    reason: 'POLICY_VERSION_MISMATCH',
  },
  {
    name: 'unknown policy state',
    input: request({ snapshot: { ...snapshot(), state: 'UNKNOWN' } }),
    expected: 'DENY',
    reason: 'POLICY_STATE_UNKNOWN',
  },
  {
    name: 'missing authority',
    input: request({ snapshot: snapshot([authorityRule]) }),
    expected: 'DENY',
    reason: 'AUTHORITY_REQUIRED',
  },
  {
    name: 'valid owner authority',
    input: request({ snapshot: snapshot([authorityRule]), ownerDecision: ownerDecision() }),
    expected: 'ALLOW',
    reason: 'POLICY_ALLOWED',
  },
  {
    name: 'agent cannot self-authorize',
    input: request({
      ownerDecision: ownerDecision({ actor: { kind: 'AGENT', identityId: actorA } }),
    }),
    expected: 'DENY',
    reason: 'AGENT_AUTHORITY_FORBIDDEN',
  },
  {
    name: 'missing consent purpose',
    input: request({
      snapshot: snapshot([consentRule]),
      consent: consent({ scope: { purposeIds: ['support'], jurisdictions: ['BR-BA'] } }),
    }),
    expected: 'DENY',
    reason: 'PURPOSE_MISMATCH',
  },
  {
    name: 'jurisdiction restriction',
    input: request({
      jurisdictionRestrictions: [
        {
          kind: 'JurisdictionRestriction',
          jurisdiction: 'BR-BA',
          effect: 'DENY',
          purposeIds: ['marketing'],
          reasonReference: 'legal:br-ba:marketing-stop',
          version: schemaVersion,
        },
      ],
    }),
    expected: 'DENY',
    reason: 'JURISDICTION_DENIED',
  },
];

for (const entry of cases) {
  assertDecision(entry.name, entry.input, entry.expected, entry.reason);
}

const consentAllow = request({ snapshot: snapshot([consentRule]), consent: consent() });
assertDecision('valid consent', consentAllow, 'ALLOW', 'POLICY_ALLOWED');

const tokenAllow = request({ snapshot: snapshot([authorityRule]), policyToken: policyToken() });
assertDecision('valid policy token', tokenAllow, 'ALLOW', 'POLICY_ALLOWED');

const replayInput = request({ snapshot: snapshot([consentRule]), consent: consent(), policyToken: policyToken() });
const replayA = evaluatePolicy(replayInput);
const replayB = evaluatePolicy(replayInput);
assert(JSON.stringify(replayA) === JSON.stringify(replayB), 'same canonical input + policy version must replay identically');
assert(replayA.evidence.inputFingerprint === replayB.evidence.inputFingerprint, 'replay fingerprint must be stable');

const orderedA = evaluatePolicy(request({ snapshot: snapshot([allowRule, { ...allowRule, ruleId: 'rule.approval', effect: 'REQUIRE_APPROVAL' }]) }));
const orderedB = evaluatePolicy(request({ snapshot: snapshot([{ ...allowRule, ruleId: 'rule.approval', effect: 'REQUIRE_APPROVAL' }, allowRule]) }));
assert(orderedA.decision === orderedB.decision, 'rule insertion order must not change authority decision');
assert(JSON.stringify(orderedA.reasons) === JSON.stringify(orderedB.reasons), 'rule insertion order must not change reason semantics');

const subjectReference = toAuthoritySubjectReference({ kind: 'IDENTITY', identityId: subjectA });
assert(subjectReference === `identity:${subjectA}`, 'SubjectRef bridge must be explicit and deterministic');

const base = request();
const highConfidence = evaluatePolicy({ ...base, modelConfidence: 1 } as PolicyEvaluationRequest);
const lowConfidence = evaluatePolicy({ ...base, modelConfidence: 0 } as PolicyEvaluationRequest);
assert(highConfidence.decision === lowConfidence.decision, 'model confidence must not influence authority');
assert(highConfidence.decision === 'ALLOW', 'confidence-independent allow fixture must remain allowed');

// @ts-expect-error model confidence is intentionally outside the canonical policy request contract.
const forbiddenIntelligenceField: PolicyEvaluationRequest = { ...base, modelConfidence: 0.99 };
void forbiddenIntelligenceField;
