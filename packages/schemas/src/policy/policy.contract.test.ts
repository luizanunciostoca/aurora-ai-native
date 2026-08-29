import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  ActorRef,
  CorrelationContext,
  Rfc3339Timestamp,
  TenantContext,
} from '@aurora/contracts/context';
import type { DecisionId, PolicyTokenId } from '@aurora/contracts/ids';
import type { ContractVersion, Version } from '@aurora/contracts/versioning';

import { OwnerDecisionSchema, PolicyTokenSchema } from './index';
import type { PolicySchemaDependencies } from './index';

function parseNonEmptyBranded<T extends string>(value: unknown, label: string): T {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${label} invalid`);
  }
  return value as T;
}

const dependencies: PolicySchemaDependencies = {
  contractVersion: {
    parse: (value) => {
      if (value !== '1.0.0') throw new TypeError('unsupported schemaVersion');
      return value as ContractVersion;
    },
  },
  decisionId: { parse: (value) => parseNonEmptyBranded<DecisionId>(value, 'decisionId') },
  policyTokenId: {
    parse: (value) => parseNonEmptyBranded<PolicyTokenId>(value, 'policyTokenId'),
  },
  actor: {
    parse: (value) => {
      if (typeof value !== 'object' || value === null || !('identityId' in value)) {
        throw new TypeError('actor invalid');
      }
      return value as ActorRef;
    },
  },
  tenant: {
    parse: (value) => {
      if (typeof value !== 'object' || value === null || !('tenantId' in value)) {
        throw new TypeError('tenant invalid');
      }
      return value as TenantContext;
    },
  },
  correlation: {
    parse: (value) => {
      if (typeof value !== 'object' || value === null || !('correlationId' in value)) {
        throw new TypeError('correlation invalid');
      }
      return value as CorrelationContext;
    },
  },
  timestamp: {
    parse: (value) => {
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        throw new TypeError('timestamp invalid');
      }
      return value as Rfc3339Timestamp;
    },
  },
  version: { parse: (value) => parseNonEmptyBranded<Version>(value, 'version') },
};

const OwnerDecisionValidator = OwnerDecisionSchema.create(dependencies);
const PolicyTokenValidator = PolicyTokenSchema.create(dependencies);

const VALID_TENANT_ID = 'ten_01J00000000000000000000000';
const OTHER_TENANT_ID = 'ten_01J00000000000000000000001';
const VALID_IDENTITY_ID = 'idn_01J00000000000000000000000';
const VALID_CORRELATION_ID = 'cor_01J00000000000000000000000';
const VALID_DECISION_ID = 'odc_01J00000000000000000000000';
const VALID_POLICY_TOKEN_ID = 'ptk_01J00000000000000000000000';

const tenantA = { tenantId: VALID_TENANT_ID };
const tenantB = { tenantId: OTHER_TENANT_ID };
const actor = { identityId: VALID_IDENTITY_ID, kind: 'HUMAN' };
const correlation = { correlationId: VALID_CORRELATION_ID };

function ownerDecision(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'OWNER_DECISION',
    schemaVersion: '1.0.0',
    decisionId: VALID_DECISION_ID,
    subject: { reference: 'action:publish-campaign' },
    decision: 'APPROVED',
    actor,
    tenant: tenantA,
    decidedAt: '2026-08-29T20:00:00-03:00',
    scope: ['campaign:publish'],
    constraints: { maxBudgetBrl: 5000 },
    expiresAt: '2026-08-29T22:00:00-03:00',
    correlation,
    reasonReference: 'approval-request:42',
    authenticationReference: 'step-up:42',
    ...overrides,
  };
}

function policyToken(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'POLICY_TOKEN',
    schemaVersion: '1.0.0',
    policyTokenId: VALID_POLICY_TOKEN_ID,
    tenant: tenantA,
    subject: { reference: 'action:publish-campaign' },
    action: 'campaign.publish',
    scope: ['campaign:publish'],
    issuedAt: '2026-08-29T20:01:00-03:00',
    expiresAt: '2026-08-29T20:31:00-03:00',
    policy: { reference: 'policy:marketing-write', version: '1.0.0' },
    constraints: { maxBudgetBrl: 5000 },
    authorityClass: 'OWNER_DECISION',
    correlation,
    decisionReference: VALID_DECISION_ID,
    ...overrides,
  };
}

test('OwnerDecision accepts canonical states and round-trips serialization', () => {
  const parsed = OwnerDecisionValidator.parse(ownerDecision());
  assert.equal(parsed.decision, 'APPROVED');
  assert.deepEqual(
    OwnerDecisionValidator.deserialize(OwnerDecisionValidator.serialize(parsed)),
    parsed,
  );
});

test('OwnerDecision rejects unknown decision state', () => {
  assert.throws(() => OwnerDecisionValidator.parse(ownerDecision({ decision: 'MAYBE' })), /unknown/);
});

test('OwnerDecision rejects missing subject', () => {
  const value = ownerDecision();
  delete value.subject;
  assert.throws(() => OwnerDecisionValidator.parse(value), /subject/);
});

test('OwnerDecision rejects missing or empty authority scope', () => {
  assert.throws(() => OwnerDecisionValidator.parse(ownerDecision({ scope: [] })), /scope/);
  const value = ownerDecision();
  delete value.scope;
  assert.throws(() => OwnerDecisionValidator.parse(value), /scope/);
});

test('OwnerDecision EXPIRED state requires a non-future expiry', () => {
  assert.throws(
    () =>
      OwnerDecisionValidator.parse(
        ownerDecision({ decision: 'EXPIRED', expiresAt: undefined }),
      ),
    /requires expiresAt/,
  );
  assert.doesNotThrow(() =>
    OwnerDecisionValidator.parse(
      ownerDecision({ decision: 'EXPIRED', expiresAt: '2026-08-29T19:59:59-03:00' }),
    ),
  );
});

test('PolicyToken can be invalidated deterministically when expired', () => {
  assert.throws(
    () => PolicyTokenValidator.parseAt(policyToken(), '2026-08-29T20:31:00-03:00'),
    /expired/,
  );
  assert.equal(
    PolicyTokenValidator.parseAt(policyToken(), '2026-08-29T20:30:59-03:00').policyTokenId,
    VALID_POLICY_TOKEN_ID,
  );
});

test('tenant mismatch remains structurally detectable', () => {
  const decision = OwnerDecisionValidator.parse(ownerDecision());
  const token = PolicyTokenValidator.parse(policyToken({ tenant: tenantB }));
  assert.notDeepEqual(decision.tenant, token.tenant);
});

test('PolicyToken rejects missing subject and missing authority scope', () => {
  const missingSubject = policyToken();
  delete missingSubject.subject;
  assert.throws(() => PolicyTokenValidator.parse(missingSubject), /subject/);
  assert.throws(() => PolicyTokenValidator.parse(policyToken({ scope: [] })), /scope/);
});

test('PolicyToken delegates wire-version behavior to the canonical dependency', () => {
  assert.throws(
    () => PolicyTokenValidator.parse(policyToken({ schemaVersion: '2.0.0' })),
    /schemaVersion/,
  );
  assert.equal(PolicyTokenValidator.parse(policyToken()).schemaVersion, '1.0.0');
});

test('PolicyToken round-trips serialization', () => {
  const parsed = PolicyTokenValidator.parse(policyToken());
  assert.deepEqual(
    PolicyTokenValidator.deserialize(PolicyTokenValidator.serialize(parsed)),
    parsed,
  );
});

test('PolicyToken rejects unknown authority class', () => {
  assert.throws(
    () => PolicyTokenValidator.parse(policyToken({ authorityClass: 'MODEL_CONFIDENCE' })),
    /unknown/,
  );
});

test('PolicyToken rejects implicit authority, credentials, confidence and execution state', () => {
  assert.throws(
    () => PolicyTokenValidator.parse(policyToken({ providerCredential: 'x' })),
    /unsupported field/,
  );
  assert.throws(
    () => PolicyTokenValidator.parse(policyToken({ confidence: 0.99 })),
    /unsupported field/,
  );
  assert.throws(
    () => PolicyTokenValidator.parse(policyToken({ executionStatus: 'SUCCEEDED' })),
    /unsupported field/,
  );
  assert.throws(
    () =>
      PolicyTokenValidator.parse(
        policyToken({ constraints: { nestedClientSecret: 'secret-value' } }),
      ),
    /credential or secret material/,
  );
});

test('OWNER_DECISION authority class requires an explicit decision reference', () => {
  assert.throws(
    () => PolicyTokenValidator.parse(policyToken({ decisionReference: undefined })),
    /requires decisionReference/,
  );
});
