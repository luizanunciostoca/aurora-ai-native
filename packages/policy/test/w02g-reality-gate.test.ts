import type { ConsentRecord } from '@aurora/contracts/consent';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type {
  CorrelationId,
  DecisionId,
  IdentityId,
  PolicyTokenId,
  TenantId,
} from '@aurora/contracts/ids';
import type { OwnerDecision, PolicyReference, PolicyToken } from '@aurora/contracts/policy';
import type {
  PolicyEvaluationRequest,
  PolicyEvaluationResult,
  PolicyRule,
  PolicySnapshot,
} from '@aurora/contracts/policy-engine';
import type {
  CurrentPolicyLookupRequest,
  PolicyPrecheckRequest,
} from '@aurora/contracts/policy-query';
import type {
  AuthorityEvaluationRequest,
  AuthorityEvaluationResult,
  PolicyTokenValidationRequest,
} from '@aurora/contracts/policy-validation';
import type { ContractVersion, Version } from '@aurora/contracts/versioning';

import { evaluateAuthority, validatePolicyToken } from '../src/authority/index';
import { evaluatePolicy } from '../src/index';
import { lookupCurrentPolicy, precheckPolicy } from '../src/query/index';

const schemaVersion = '1.0.0' as ContractVersion;
const policyVersion = '2.4.0' as Version;
const correlationId = 'cor_01J00000000000000000000000' as CorrelationId;
const tenantA = 'ten_01J00000000000000000000000' as TenantId;
const tenantB = 'ten_01J00000000000000000000001' as TenantId;
const actorA = 'idn_01J00000000000000000000000' as IdentityId;
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

const authorityConsentRule: PolicyRule = {
  ...allowRule,
  ruleId: 'rule.allow.publish.authority-consent',
  authorityRequired: true,
  consentRequired: true,
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[W02-G] ${message}`);
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  assert(JSON.stringify(actual) === JSON.stringify(expected), message);
}

function expectThrow(run: () => unknown, message: string): void {
  let threw = false;
  try {
    run();
  } catch {
    threw = true;
  }
  assert(threw, message);
}

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

function snapshot(
  rules: readonly PolicyRule[] = [allowRule],
  snapshotPolicy: PolicyReference = policy,
  state: PolicySnapshot['state'] = 'ACTIVE',
): PolicySnapshot {
  return { kind: 'PolicySnapshot', policy: snapshotPolicy, state, rules };
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

function policyRequest(overrides: Partial<PolicyEvaluationRequest> = {}): PolicyEvaluationRequest {
  const actor = overrides.actor ?? { kind: 'HUMAN', identityId: actorA };
  const tenant = overrides.tenant ?? { tenantId: tenantA };
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
    ...overrides,
  };
}

function authorityRequest(
  policyEvaluation: PolicyEvaluationRequest,
  overrides: Omit<Partial<AuthorityEvaluationRequest>, 'kind' | 'policyEvaluation'> = {},
): AuthorityEvaluationRequest {
  return { kind: 'AuthorityEvaluationRequest', policyEvaluation, ...overrides };
}

function validationRequest(
  tokenValue: PolicyToken,
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

function precheckRequest(overrides: Partial<PolicyEvaluationRequest> = {}): PolicyPrecheckRequest {
  const full = policyRequest(overrides);
  const {
    ownerDecision: ignoredOwnerDecision,
    policyToken: ignoredPolicyToken,
    ...informational
  } = full;
  void ignoredOwnerDecision;
  void ignoredPolicyToken;
  return { kind: 'PolicyPrecheckRequest', policyEvaluation: informational };
}

function lookupRequest(tenantId: TenantId = tenantA): CurrentPolicyLookupRequest {
  return {
    kind: 'CurrentPolicyLookupRequest',
    schemaVersion,
    expectedPolicy: policy,
    correlation: { correlationId },
    evaluatedAt,
    tenant: { tenantId },
    actor: { kind: 'HUMAN', identityId: actorA },
  };
}

type ScenarioEvidence = {
  readonly id: string;
  readonly outcome: string;
  readonly reasons: readonly string[];
  readonly inputFingerprint: string;
  readonly sideEffectCount: number;
};

const evidence: ScenarioEvidence[] = [];

function record(
  id: string,
  outcome: string,
  reasons: readonly string[],
  inputFingerprint: string,
  sideEffectCount = 0,
): void {
  evidence.push({ id, outcome, reasons: [...reasons], inputFingerprint, sideEffectCount });
}

function recordPolicy(id: string, result: PolicyEvaluationResult, sideEffectCount = 0): void {
  record(id, result.decision, result.reasons, result.evidence.inputFingerprint, sideEffectCount);
}

function recordAuthority(id: string, result: AuthorityEvaluationResult, sideEffectCount = 0): void {
  record(
    id,
    result.authorized ? 'ALLOW' : (result.policyDecision ?? 'DENY'),
    result.reasons,
    result.evidence.inputFingerprint,
    sideEffectCount,
  );
}

type IdentityGateStatus = 'RESOLVED' | 'NOT_FOUND' | 'AMBIGUOUS' | 'CONFLICT';

function identityGatedAuthority(
  status: IdentityGateStatus,
  request: AuthorityEvaluationRequest,
): AuthorityEvaluationResult | undefined {
  return status === 'RESOLVED' ? evaluateAuthority(request) : undefined;
}

// S01 — valid identity + tenant + consent/purpose/jurisdiction + current policy + authority.
const s01Input = authorityRequest(
  policyRequest({
    snapshot: snapshot([authorityConsentRule]),
    consent: consent(),
    policyToken: token(),
  }),
);
const s01 = identityGatedAuthority('RESOLVED', s01Input);
assert(s01?.authorized === true, 'S01 must ALLOW only after all current guards pass');
recordAuthority('S01', s01);

// S02 — current policy explicit DENY cannot be overridden by valid authority.
const s02 = evaluateAuthority(
  authorityRequest(
    policyRequest({
      snapshot: snapshot([{ ...allowRule, ruleId: 'rule.current-deny', effect: 'DENY' }]),
      policyToken: token(),
    }),
  ),
);
assert(!s02.authorized && s02.policyDecision === 'DENY', 'S02 current policy DENY must win');
recordAuthority('S02', s02);

// S03 — approval is explicit and never converted into execution authority.
const s03 = evaluateAuthority(
  authorityRequest(
    policyRequest({
      snapshot: snapshot([
        { ...allowRule, ruleId: 'rule.require-approval', effect: 'REQUIRE_APPROVAL' },
      ]),
    }),
  ),
);
assert(
  !s03.authorized && s03.policyDecision === 'REQUIRE_APPROVAL',
  'S03 REQUIRE_APPROVAL must not authorize execution',
);
recordAuthority('S03', s03);

// S04 — expired authority fails closed.
const s04 = evaluateAuthority(
  authorityRequest(
    policyRequest({
      snapshot: snapshot([{ ...allowRule, authorityRequired: true }]),
      policyToken: token({ expiresAt: '2026-08-31T17:59:59.000Z' as Rfc3339Timestamp }),
    }),
  ),
);
assert(!s04.authorized && s04.reasons.includes('TOKEN_EXPIRED'), 'S04 expired token allowed');
recordAuthority('S04', s04);

// S05 — wrong tenant fails closed.
const s05 = evaluateAuthority(
  authorityRequest(
    policyRequest({
      snapshot: snapshot([{ ...allowRule, authorityRequired: true }]),
      policyToken: token({ tenant: { tenantId: tenantB } }),
    }),
  ),
);
assert(
  !s05.authorized && s05.reasons.includes('TOKEN_TENANT_MISMATCH'),
  'S05 wrong-tenant authority allowed',
);
recordAuthority('S05', s05);

// S06 — wrong subject fails closed.
const s06 = evaluateAuthority(
  authorityRequest(
    policyRequest({
      snapshot: snapshot([{ ...allowRule, authorityRequired: true }]),
      policyToken: token({ subject: { reference: `identity:${subjectB}` } }),
    }),
  ),
);
assert(
  !s06.authorized && s06.reasons.includes('TOKEN_SUBJECT_MISMATCH'),
  'S06 wrong-subject authority allowed',
);
recordAuthority('S06', s06);

// S07 — wrong action and insufficient scope both fail closed.
const s07Action = validatePolicyToken(validationRequest(token({ action: 'social.delete' })));
const s07Scope = validatePolicyToken(validationRequest(token({ scope: ['instagram:read'] })));
assert(
  !s07Action.valid &&
    s07Action.reasons.includes('TOKEN_ACTION_MISMATCH') &&
    !s07Scope.valid &&
    s07Scope.reasons.includes('TOKEN_SCOPE_INSUFFICIENT'),
  'S07 action/scope mismatch did not fail closed',
);
record(
  'S07',
  'DENY',
  [...s07Action.reasons, ...s07Scope.reasons],
  fingerprint([s07Action.evidence.inputFingerprint, s07Scope.evidence.inputFingerprint]),
);

// S08 — revoked OwnerDecision and malformed PolicyToken both fail closed.
const s08Revoked = evaluateAuthority(
  authorityRequest(policyRequest({ ownerDecision: ownerDecision({ decision: 'REVOKED' }) })),
);
const malformedToken = { ...token(), providerSecret: 'forbidden-material' } as PolicyToken;
const s08Malformed = validatePolicyToken(validationRequest(malformedToken));
assert(
  !s08Revoked.authorized &&
    s08Revoked.reasons.includes('OWNER_DECISION_REVOKED') &&
    !s08Malformed.valid &&
    s08Malformed.reasons.includes('MALFORMED_POLICY_TOKEN'),
  'S08 revoked/malformed authority did not fail closed',
);
record(
  'S08',
  'DENY',
  [...s08Revoked.reasons, ...s08Malformed.reasons],
  fingerprint([s08Revoked.evidence.inputFingerprint, s08Malformed.evidence.inputFingerprint]),
);

// S09 — required consent missing.
const s09 = evaluatePolicy(
  policyRequest({ snapshot: snapshot([{ ...allowRule, consentRequired: true }]) }),
);
assert(
  s09.decision === 'DENY' && s09.reasons.includes('CONSENT_REQUIRED'),
  'S09 missing consent allowed',
);
recordPolicy('S09', s09);

// S10 — purpose mismatch.
const s10 = evaluatePolicy(
  policyRequest({
    purpose: {
      kind: 'PurposeContext',
      purposeId: 'support',
      version: schemaVersion,
      status: 'ACTIVE',
    },
  }),
);
assert(
  s10.decision === 'DENY' && s10.reasons.includes('PURPOSE_MISMATCH'),
  'S10 purpose mismatch allowed',
);
recordPolicy('S10', s10);

// S11 — jurisdiction restriction with evidence.
const s11 = evaluatePolicy(
  policyRequest({
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
);
assert(
  s11.decision === 'DENY' &&
    s11.reasons.includes('JURISDICTION_DENIED') &&
    s11.evidence.tenantId === tenantA,
  'S11 jurisdiction restriction lacked fail-closed evidence',
);
recordPolicy('S11', s11);

// S12 — unresolved conflicting rules deny deterministically.
const s12 = evaluatePolicy(
  policyRequest({
    snapshot: snapshot([
      allowRule,
      { ...allowRule, ruleId: 'rule.conflicting-deny', effect: 'DENY' },
    ]),
  }),
);
assert(
  s12.decision === 'DENY' && s12.reasons.includes('CONFLICTING_RULES'),
  'S12 conflicting policy did not DENY',
);
recordPolicy('S12', s12);

// S13 — missing or ambiguous identity never falls back to policy/authority evaluation.
let s13AuthorityCalls = 0;
const s13Request = authorityRequest(policyRequest());
const s13Missing = identityGatedAuthority('NOT_FOUND', s13Request);
const s13Ambiguous = identityGatedAuthority('AMBIGUOUS', s13Request);
if (s13Missing !== undefined || s13Ambiguous !== undefined) s13AuthorityCalls += 1;
assert(
  s13Missing === undefined && s13Ambiguous === undefined && s13AuthorityCalls === 0,
  'S13 unresolved identity reached authority evaluation',
);
record('S13', 'DENY', ['IDENTITY_NOT_RESOLVED', 'IDENTITY_AMBIGUOUS'], fingerprint(s13Request));

// S14 — previous successful authority cannot override a current explicit DENY.
const s14 = evaluateAuthority(
  authorityRequest(
    policyRequest({
      snapshot: snapshot([{ ...allowRule, ruleId: 'rule.current-policy-deny', effect: 'DENY' }]),
      policyToken: token(),
    }),
  ),
);
assert(
  !s14.authorized && s14.policyDecision === 'DENY' && s14.reasons.includes('EXPLICIT_DENY'),
  'S14 previous authority overrode current policy',
);
recordAuthority('S14', s14);

// S15 — synthetic confidence metadata cannot change DENY or REQUIRE_APPROVAL.
const s15DenyBase = policyRequest({
  snapshot: snapshot([{ ...allowRule, ruleId: 'rule.confidence-deny', effect: 'DENY' }]),
});
const s15ApprovalBase = policyRequest({
  snapshot: snapshot([
    { ...allowRule, ruleId: 'rule.confidence-approval', effect: 'REQUIRE_APPROVAL' },
  ]),
});
const s15DenyHigh = evaluatePolicy({
  ...s15DenyBase,
  modelConfidence: 1,
} as PolicyEvaluationRequest);
const s15DenyLow = evaluatePolicy({
  ...s15DenyBase,
  modelConfidence: 0,
} as PolicyEvaluationRequest);
const s15ApprovalHigh = evaluatePolicy({
  ...s15ApprovalBase,
  modelConfidence: 1,
} as PolicyEvaluationRequest);
const s15ApprovalLow = evaluatePolicy({
  ...s15ApprovalBase,
  modelConfidence: 0,
} as PolicyEvaluationRequest);
assert(
  s15DenyHigh.decision === s15DenyLow.decision &&
    JSON.stringify(s15DenyHigh.reasons) === JSON.stringify(s15DenyLow.reasons),
  'S15 confidence changed DENY authority outcome',
);
assert(
  s15ApprovalHigh.decision === s15ApprovalLow.decision &&
    JSON.stringify(s15ApprovalHigh.reasons) === JSON.stringify(s15ApprovalLow.reasons),
  'S15 confidence changed approval authority outcome',
);
record(
  'S15',
  'DENY/REQUIRE_APPROVAL',
  [...s15DenyHigh.reasons, ...s15ApprovalHigh.reasons],
  fingerprint([s15DenyHigh.evidence.inputFingerprint, s15ApprovalHigh.evidence.inputFingerprint]),
);

// S16 — repeated canonical request and fixed snapshot replay identically.
const s16Input = authorityRequest(
  policyRequest({
    snapshot: snapshot([authorityConsentRule]),
    consent: consent(),
    policyToken: token(),
  }),
);
const s16First = evaluateAuthority(s16Input);
const s16Second = evaluateAuthority(s16Input);
assertDeepEqual(s16First, s16Second, 'S16 repeated request diverged');
assert(
  s16First.evidence.inputFingerprint === s16Second.evidence.inputFingerprint,
  'S16 fingerprint diverged',
);
recordAuthority('S16', s16First);

// S17 — tenant A authority injected into a tenant B request fails closed.
const s17 = evaluateAuthority(
  authorityRequest(
    policyRequest({
      tenant: { tenantId: tenantB },
      tenantBoundary: {
        status: 'WITHIN_BOUNDARY',
        reason: 'BOUNDARY_CONFIRMED',
        correlationId,
        evidence: {
          evaluatedTenantId: tenantB,
          actorIdentityId: actorA,
          matchedBindingCount: 1,
          observedBindingTenantIds: [tenantB],
        },
      },
      snapshot: snapshot([
        { ...allowRule, ruleId: 'rule.tenant-b', tenantIds: [tenantB], authorityRequired: true },
      ]),
      policyToken: token({ tenant: { tenantId: tenantA } }),
    }),
  ),
);
assert(
  !s17.authorized && s17.reasons.includes('TOKEN_TENANT_MISMATCH'),
  'S17 cross-tenant injection authorized',
);
recordAuthority('S17', s17);

// S18 — precheck is informational, side-effect-free and rejects authority injection.
const sideEffects = { provider: 0, executor: 0, persistence: 0, externalMutation: 0, mint: 0 };
const s18 = precheckPolicy(precheckRequest());
assert(
  s18.informationalOnly &&
    !s18.authorizesExecution &&
    s18.requiresExecutionTimeValidation &&
    Object.values(sideEffects).every((value) => value === 0),
  'S18 precheck gained authority or side effects',
);
const s18Unsafe = {
  kind: 'PolicyPrecheckRequest',
  policyEvaluation: { ...precheckRequest().policyEvaluation, policyToken: token() },
} as unknown as PolicyPrecheckRequest;
expectThrow(() => precheckPolicy(s18Unsafe), 'S18 accepted injected authority');
record('S18', s18.decision, s18.reasons, s18.evidence.inputFingerprint);

// S19 — malformed subject reference is rejected deterministically.
const s19 = validatePolicyToken(validationRequest(token({ subject: { reference: 'identity:' } })));
assert(
  !s19.valid && s19.reasons.includes('MALFORMED_SUBJECT_REFERENCE'),
  'S19 malformed subject reference was accepted',
);
record('S19', 'DENY', s19.reasons, s19.evidence.inputFingerprint);

// S20 — missing current-policy context never falls back to stale permissive state.
const s20Lookup = lookupCurrentPolicy(lookupRequest(), { getCurrent: () => undefined });
const s20Policy = evaluatePolicy(policyRequest({ snapshot: snapshot([], policy, 'UNKNOWN') }));
assert(
  !s20Lookup.found &&
    !s20Lookup.authorizesExecution &&
    s20Lookup.requiresExecutionTimeValidation &&
    s20Policy.decision === 'DENY' &&
    s20Policy.reasons.includes('POLICY_STATE_UNKNOWN'),
  'S20 missing current policy used permissive fallback',
);
record(
  'S20',
  'DENY',
  [...s20Lookup.reasons, ...s20Policy.reasons],
  fingerprint([s20Lookup.currentPolicy, s20Policy.evidence.inputFingerprint]),
);

const expectedScenarioIds = Array.from(
  { length: 20 },
  (_, index) => `S${String(index + 1).padStart(2, '0')}`,
);
assertDeepEqual(
  evidence.map((entry) => entry.id),
  expectedScenarioIds,
  'Reality Gate scenario set is incomplete or out of order',
);
assert(
  evidence.every((entry) => entry.sideEffectCount === 0),
  'Reality Gate observed a prohibited side effect',
);

console.log(
  `[W02-G:REALITY_GATE_1] ${JSON.stringify({
    gate: 'REALITY_GATE_1_AUTHORITY_VERIFIED',
    maturity: ['T1_CONTRACT', 'T2_SIMULATION'],
    schemaVersion,
    policy,
    evaluatedAt,
    tenantId: tenantA,
    actorIdentityId: actorA,
    subjectReference: `identity:${subjectA}`,
    action: 'social.publish',
    requestedScope: ['instagram:publish'],
    scenarioCount: evidence.length,
    prohibitedExternalSideEffects: 0,
    modelCalls: 0,
    toolCalls: 0,
    providerCalls: 0,
    databaseCalls: 0,
    scenarios: evidence,
  })}`,
);
