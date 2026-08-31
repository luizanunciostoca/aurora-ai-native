import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';
import type {
  CurrentPolicyLookupRequest,
  PolicyPrecheckRequest,
} from '@aurora/contracts/policy-query';
import type { PolicyReference } from '@aurora/contracts/policy';
import type {
  PolicyEvaluationRequest,
  PolicyRule,
  PolicySnapshot,
} from '@aurora/contracts/policy-engine';
import type { ContractVersion, Version } from '@aurora/contracts/versioning';

import { lookupCurrentPolicy } from './current-policy';
import { precheckPolicy } from './precheck';

const schemaVersion = '1.0.0' as ContractVersion;
const policyVersion = '2.4.0' as Version;
const previousPolicyVersion = '2.3.0' as Version;
const correlationId = 'cor_01J00000000000000000000000' as CorrelationId;
const tenantA = 'ten_01J00000000000000000000000' as TenantId;
const actorA = 'idn_01J00000000000000000000000' as IdentityId;
const subjectA = 'idn_01J00000000000000000000002' as IdentityId;
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

function snapshot(
  rules: readonly PolicyRule[] = [allowRule],
  snapshotPolicy: PolicyReference = policy,
): PolicySnapshot {
  return { kind: 'PolicySnapshot', policy: snapshotPolicy, state: 'ACTIVE', rules };
}

function evaluation(
  overrides: Partial<PolicyEvaluationRequest> = {},
): PolicyPrecheckRequest['policyEvaluation'] {
  const base: PolicyEvaluationRequest = {
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
  const { ownerDecision, policyToken, ...informational } = base;
  void ownerDecision;
  void policyToken;
  return informational;
}

function precheck(
  overrides: Partial<PolicyEvaluationRequest> = {},
): PolicyPrecheckRequest {
  return { kind: 'PolicyPrecheckRequest', policyEvaluation: evaluation(overrides) };
}

function lookupRequest(expectedPolicy: PolicyReference = policy): CurrentPolicyLookupRequest {
  return {
    kind: 'CurrentPolicyLookupRequest',
    schemaVersion,
    expectedPolicy,
    correlation: { correlationId },
    evaluatedAt,
  };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectThrow(name: string, fn: () => unknown): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw, `${name}: expected throw`);
}

const lookupFound = lookupCurrentPolicy(lookupRequest(), {
  getCurrent: () => snapshot(),
});
assert(lookupFound.found, 'lookup found: expected current policy');
assert(lookupFound.currentPolicy.version === policyVersion, 'lookup found: wrong current version');
assert(lookupFound.authorizesExecution === false, 'lookup found: must never authorize execution');
assert(
  lookupFound.requiresExecutionTimeValidation === true,
  'lookup found: execution-time validation must remain required',
);

const newerPolicy: PolicyReference = {
  reference: policy.reference,
  version: '2.5.0' as Version,
};
const lookupChanged = lookupCurrentPolicy(lookupRequest(), {
  getCurrent: () => snapshot([allowRule], newerPolicy),
});
assert(lookupChanged.found, 'lookup version drift: expected found');
assert(lookupChanged.versionChanged, 'lookup version drift: expected versionChanged');
assert(
  lookupChanged.reasons.includes('POLICY_VERSION_CHANGED'),
  'lookup version drift: missing reason',
);

const lookupMissing = lookupCurrentPolicy(lookupRequest(), { getCurrent: () => undefined });
assert(!lookupMissing.found, 'lookup missing: expected not found');
assert(lookupMissing.reasons.includes('POLICY_NOT_FOUND'), 'lookup missing: missing reason');

const lookupMismatched = lookupCurrentPolicy(lookupRequest(), {
  getCurrent: () =>
    snapshot([allowRule], { reference: 'policy:other', version: policyVersion }),
});
assert(!lookupMismatched.found, 'lookup mismatch: expected fail closed');
assert(
  lookupMismatched.reasons.includes('POLICY_REFERENCE_MISMATCH'),
  'lookup mismatch: missing reason',
);

const allowed = precheckPolicy(precheck());
assert(allowed.decision === 'ALLOW', 'precheck allow: expected ALLOW');
assert(allowed.authorizesExecution === false, 'precheck allow: must not authorize execution');
assert(allowed.informationalOnly === true, 'precheck allow: must be informational');
assert(
  allowed.requiresExecutionTimeValidation === true,
  'precheck allow: must require execution-time validation',
);
assert(!allowed.requiredAuthority.required, 'precheck allow: authority should not be required');
assert(!allowed.approvalRequired, 'precheck allow: approval should not be required');
assert(allowed.applicableConstraints.length === 1, 'precheck allow: expected one constraint');
assert(
  allowed.applicableConstraints[0]?.reasonReference ===
    'policy:toca:marketing#allow-publish',
  'precheck allow: reason reference missing',
);

const authorityRule: PolicyRule = {
  ...allowRule,
  ruleId: 'rule.allow.authority',
  authorityRequired: true,
};
const authorityRequired = precheckPolicy(
  precheck({ snapshot: snapshot([authorityRule]) }),
);
assert(authorityRequired.decision === 'DENY', 'authority precheck: expected DENY without authority');
assert(
  authorityRequired.reasons.includes('AUTHORITY_REQUIRED'),
  'authority precheck: missing AUTHORITY_REQUIRED',
);
assert(
  authorityRequired.requiredAuthority.required,
  'authority precheck: required authority descriptor missing',
);
if (authorityRequired.requiredAuthority.required) {
  assert(
    authorityRequired.requiredAuthority.scope[0] === 'instagram:publish',
    'authority precheck: wrong required scope',
  );
}
assert(
  authorityRequired.authorizesExecution === false,
  'authority precheck: descriptive authority must not authorize',
);

const approvalRule: PolicyRule = {
  ...allowRule,
  ruleId: 'rule.require.approval',
  effect: 'REQUIRE_APPROVAL',
};
const approval = precheckPolicy(precheck({ snapshot: snapshot([approvalRule]) }));
assert(approval.decision === 'REQUIRE_APPROVAL', 'approval precheck: wrong decision');
assert(approval.approvalRequired, 'approval precheck: approvalRequired must be true');
assert(approval.authorizesExecution === false, 'approval precheck: must not authorize');

const denyRule: PolicyRule = { ...allowRule, ruleId: 'rule.deny.publish', effect: 'DENY' };
const denied = precheckPolicy(precheck({ snapshot: snapshot([denyRule]) }));
assert(denied.decision === 'DENY', 'deny precheck: expected DENY');
assert(denied.reasons.includes('EXPLICIT_DENY'), 'deny precheck: missing explicit deny');

const stale = precheckPolicy(
  precheck({
    snapshot: snapshot([allowRule], {
      reference: policy.reference,
      version: previousPolicyVersion,
    }),
  }),
);
assert(stale.decision === 'DENY', 'stale precheck: expected DENY');
assert(
  stale.reasons.includes('POLICY_VERSION_MISMATCH'),
  'stale precheck: current policy mismatch must be visible',
);
assert(stale.authorizesExecution === false, 'stale precheck: must not authorize');

const firstReplay = precheckPolicy(precheck());
const secondReplay = precheckPolicy(precheck());
assert(
  firstReplay.evidence.inputFingerprint === secondReplay.evidence.inputFingerprint,
  'deterministic replay: fingerprint mismatch',
);
assert(
  JSON.stringify(firstReplay) === JSON.stringify(secondReplay),
  'deterministic replay: normalized result mismatch',
);

const unsafeRequest = {
  kind: 'PolicyPrecheckRequest',
  policyEvaluation: {
    ...evaluation(),
    policyToken: {
      kind: 'POLICY_TOKEN',
    },
  },
} as unknown as PolicyPrecheckRequest;
expectThrow('runtime authority evidence guard', () => precheckPolicy(unsafeRequest));

const confidenceInjected = {
  ...precheck(),
  confidence: 1,
} as PolicyPrecheckRequest & { confidence: number };
const confidenceResult = precheckPolicy(confidenceInjected);
assert(
  confidenceResult.decision === allowed.decision &&
    confidenceResult.authorizesExecution === false,
  'confidence injection must not create permission',
);
