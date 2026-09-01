'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const index_1 = require('./index');
const schemaVersion = '1.0.0';
const policyVersion = '2.4.0';
const correlationId = 'cor_01J00000000000000000000000';
const tenantId = 'ten_01J00000000000000000000000';
const actorIdentityId = 'idn_01J00000000000000000000000';
const subjectIdentityId = 'idn_01J00000000000000000000002';
const evaluatedAt = '2026-08-31T18:00:00.000Z';
const policy = { reference: 'policy:toca:marketing', version: policyVersion };
const tenant = { tenantId };
const actor = { kind: 'HUMAN', identityId: actorIdentityId };
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function expectReject(name, fn) {
  let rejected = false;
  try {
    fn();
  } catch {
    rejected = true;
  }
  assert(rejected, `${name}: expected schema rejection`);
}
const snapshot = {
  kind: 'PolicySnapshot',
  policy,
  state: 'ACTIVE',
  rules: [
    {
      ruleId: 'rule.allow.publish',
      effect: 'ALLOW',
      action: 'social.publish',
      scope: ['instagram:publish'],
      tenantIds: [tenantId],
      actorKinds: ['HUMAN'],
      actorIdentityIds: [actorIdentityId],
      subjectReferences: [`identity:${subjectIdentityId}`],
      purposeIds: ['marketing'],
      jurisdictions: ['BR-BA'],
      dataClassifications: ['INTERNAL'],
      reasonReference: 'policy:toca:marketing#allow-publish',
    },
  ],
};
const policyEvaluation = {
  kind: 'PolicyEvaluationRequest',
  schemaVersion,
  policy,
  snapshot,
  correlation: { correlationId },
  evaluatedAt,
  tenant,
  tenantBoundary: {
    status: 'WITHIN_BOUNDARY',
    reason: 'BOUNDARY_CONFIRMED',
    correlationId,
    evidence: {
      evaluatedTenantId: tenantId,
      actorIdentityId,
      matchedBindingCount: 1,
      observedBindingTenantIds: [tenantId],
    },
  },
  actor,
  subject: { kind: 'IDENTITY', identityId: subjectIdentityId },
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
};
index_1.CurrentPolicyLookupRequestSchema.parse({
  kind: 'CurrentPolicyLookupRequest',
  schemaVersion,
  expectedPolicy: policy,
  correlation: { correlationId },
  evaluatedAt,
  tenant,
  actor,
});
expectReject('lookup requires tenant binding', () =>
  index_1.CurrentPolicyLookupRequestSchema.parse({
    kind: 'CurrentPolicyLookupRequest',
    schemaVersion,
    expectedPolicy: policy,
    correlation: { correlationId },
    evaluatedAt,
    actor,
  }),
);
index_1.CurrentPolicyLookupResultSchema.parse({
  kind: 'CurrentPolicyLookupResult',
  schemaVersion,
  expectedPolicy: policy,
  correlation: { correlationId },
  evaluatedAt,
  tenant,
  actor,
  informationalOnly: true,
  authorizesExecution: false,
  requiresExecutionTimeValidation: true,
  found: true,
  currentPolicy: policy,
  state: 'ACTIVE',
  snapshot,
  versionChanged: false,
  reasons: ['POLICY_FOUND'],
});
index_1.CurrentPolicyLookupResultSchema.parse({
  kind: 'CurrentPolicyLookupResult',
  schemaVersion,
  expectedPolicy: policy,
  correlation: { correlationId },
  evaluatedAt,
  tenant,
  actor,
  informationalOnly: true,
  authorizesExecution: false,
  requiresExecutionTimeValidation: true,
  found: false,
  reasons: ['POLICY_NOT_FOUND'],
});
expectReject('lookup cannot authorize execution', () =>
  index_1.CurrentPolicyLookupResultSchema.parse({
    kind: 'CurrentPolicyLookupResult',
    schemaVersion,
    expectedPolicy: policy,
    correlation: { correlationId },
    evaluatedAt,
    tenant,
    actor,
    informationalOnly: true,
    authorizesExecution: true,
    requiresExecutionTimeValidation: true,
    found: false,
    reasons: ['POLICY_NOT_FOUND'],
  }),
);
index_1.PolicyPrecheckRequestSchema.parse({ kind: 'PolicyPrecheckRequest', policyEvaluation });
expectReject('precheck rejects executable authority evidence', () =>
  index_1.PolicyPrecheckRequestSchema.parse({
    kind: 'PolicyPrecheckRequest',
    policyEvaluation: {
      ...policyEvaluation,
      policyToken: {
        kind: 'POLICY_TOKEN',
        schemaVersion,
        policyTokenId: 'ptk_01J00000000000000000000000',
        tenant,
        subject: { reference: `identity:${subjectIdentityId}` },
        action: 'social.publish',
        scope: ['instagram:publish'],
        issuedAt: '2026-08-31T17:00:00.000Z',
        expiresAt: '2026-08-31T19:00:00.000Z',
        policy,
        authorityClass: 'POLICY_RULE',
        correlation: { correlationId },
      },
    },
  }),
);
expectReject('precheck rejects confidence injection', () =>
  index_1.PolicyPrecheckRequestSchema.parse({
    kind: 'PolicyPrecheckRequest',
    policyEvaluation,
    confidence: 1,
  }),
);
index_1.PolicyPrecheckResultSchema.parse({
  kind: 'PolicyPrecheckResult',
  schemaVersion,
  policy,
  correlation: { correlationId },
  evaluatedAt,
  informationalOnly: true,
  authorizesExecution: false,
  requiresExecutionTimeValidation: true,
  decision: 'ALLOW',
  requiredAuthority: { required: false },
  approvalRequired: false,
  applicableConstraints: [
    {
      ruleId: 'rule.allow.publish',
      effect: 'ALLOW',
      action: 'social.publish',
      scope: ['instagram:publish'],
      tenantIds: [tenantId],
      actorKinds: ['HUMAN'],
      actorIdentityIds: [actorIdentityId],
      subjectReferences: [`identity:${subjectIdentityId}`],
      purposeIds: ['marketing'],
      jurisdictions: ['BR-BA'],
      dataClassifications: ['INTERNAL'],
      consentRequired: false,
      authorityRequired: false,
      reasonReference: 'policy:toca:marketing#allow-publish',
    },
  ],
  reasons: ['POLICY_ALLOWED', 'PRECHECK_INFORMATIONAL_ONLY', 'EXECUTION_VALIDATION_REQUIRED'],
  reasonReferences: ['policy:toca:marketing#allow-publish'],
  evidence: {
    tenantId,
    actorIdentityId,
    subjectReference: `identity:${subjectIdentityId}`,
    action: 'social.publish',
    requestedScope: ['instagram:publish'],
    matchedRuleIds: ['rule.allow.publish'],
    inputFingerprint: 'fnv1a64:0123456789abcdef',
  },
});
expectReject('precheck result cannot authorize execution', () =>
  index_1.PolicyPrecheckResultSchema.parse({
    kind: 'PolicyPrecheckResult',
    schemaVersion,
    policy,
    correlation: { correlationId },
    evaluatedAt,
    informationalOnly: true,
    authorizesExecution: true,
    requiresExecutionTimeValidation: true,
    decision: 'ALLOW',
    requiredAuthority: { required: false },
    approvalRequired: false,
    applicableConstraints: [],
    reasons: ['POLICY_ALLOWED'],
    reasonReferences: [],
    evidence: {
      tenantId,
      actorIdentityId,
      subjectReference: `identity:${subjectIdentityId}`,
      action: 'social.publish',
      requestedScope: ['instagram:publish'],
      matchedRuleIds: [],
      inputFingerprint: 'fnv1a64:0123456789abcdef',
    },
  }),
);
