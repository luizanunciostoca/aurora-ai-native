import assert from "node:assert/strict";
import test from "node:test";

import { OwnerDecisionSchema, PolicyTokenSchema } from "./index.ts";

const tenantA = { tenantId: "ten_01ARZ3NDEKTSV4RRFFQ69G5FAV" };
const tenantB = { tenantId: "ten_01BXZ3NDEKTSV4RRFFQ69G5FAV" };
const actor = { identityId: "idn_01ARZ3NDEKTSV4RRFFQ69G5FAV", kind: "HUMAN" };
const correlation = { correlationId: "cor_01ARZ3NDEKTSV4RRFFQ69G5FAV" };

function ownerDecision(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "OWNER_DECISION",
    schemaVersion: "1.0.0",
    decisionId: "odc_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    subject: { reference: "action:publish-campaign", referenceType: "ACTION" },
    decision: "APPROVED",
    actor,
    tenant: tenantA,
    decidedAt: "2026-08-29T20:00:00-03:00",
    scope: ["campaign:publish"],
    constraints: { maxBudgetBrl: 5000 },
    expiresAt: "2026-08-29T22:00:00-03:00",
    correlation,
    reasonReference: "approval-request:42",
    authenticationReference: "step-up:42",
    ...overrides,
  };
}

function policyToken(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "POLICY_TOKEN",
    schemaVersion: "1.0.0",
    policyTokenId: "ptk_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    tenant: tenantA,
    subject: { reference: "action:publish-campaign", referenceType: "ACTION" },
    action: "campaign.publish",
    scope: ["campaign:publish"],
    issuedAt: "2026-08-29T20:01:00-03:00",
    expiresAt: "2026-08-29T20:31:00-03:00",
    policy: { reference: "policy:marketing-write", version: "2026-08-29" },
    constraints: { maxBudgetBrl: 5000 },
    authorityClass: "OWNER_DECISION",
    correlation,
    decisionReference: "odc_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    ...overrides,
  };
}

test("OwnerDecision accepts canonical states and round-trips serialization", () => {
  const parsed = OwnerDecisionSchema.parse(ownerDecision());
  assert.equal(parsed.decision, "APPROVED");
  assert.deepEqual(
    OwnerDecisionSchema.deserialize(OwnerDecisionSchema.serialize(parsed)),
    parsed,
  );
});

test("OwnerDecision rejects unknown decision state", () => {
  assert.throws(() => OwnerDecisionSchema.parse(ownerDecision({ decision: "MAYBE" })), /unknown/);
});

test("OwnerDecision rejects missing subject", () => {
  const value = ownerDecision();
  delete value.subject;
  assert.throws(() => OwnerDecisionSchema.parse(value), /subject/);
});

test("OwnerDecision rejects missing or empty authority scope", () => {
  assert.throws(() => OwnerDecisionSchema.parse(ownerDecision({ scope: [] })), /scope/);
  const value = ownerDecision();
  delete value.scope;
  assert.throws(() => OwnerDecisionSchema.parse(value), /scope/);
});

test("PolicyToken can be invalidated deterministically when expired", () => {
  assert.throws(
    () => PolicyTokenSchema.parseAt(policyToken(), "2026-08-29T20:31:00-03:00"),
    /expired/,
  );
  assert.equal(
    PolicyTokenSchema.parseAt(policyToken(), "2026-08-29T20:30:59-03:00").policyTokenId,
    "ptk_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  );
});

test("tenant mismatch remains structurally detectable", () => {
  const decision = OwnerDecisionSchema.parse(ownerDecision());
  const token = PolicyTokenSchema.parse(policyToken({ tenant: tenantB }));
  assert.notDeepEqual(decision.tenant, token.tenant);
});

test("PolicyToken rejects missing subject and missing authority scope", () => {
  const missingSubject = policyToken();
  delete missingSubject.subject;
  assert.throws(() => PolicyTokenSchema.parse(missingSubject), /subject/);

  assert.throws(() => PolicyTokenSchema.parse(policyToken({ scope: [] })), /scope/);
});

test("PolicyToken rejects malformed wire version and preserves a valid version", () => {
  assert.throws(() => PolicyTokenSchema.parse(policyToken({ schemaVersion: "v1" })), /schemaVersion/);
  assert.equal(PolicyTokenSchema.parse(policyToken()).schemaVersion, "1.0.0");
});

test("PolicyToken round-trips serialization", () => {
  const parsed = PolicyTokenSchema.parse(policyToken());
  assert.deepEqual(PolicyTokenSchema.deserialize(PolicyTokenSchema.serialize(parsed)), parsed);
});

test("PolicyToken does not accept provider credentials, secrets, model confidence or execution state", () => {
  assert.throws(() => PolicyTokenSchema.parse(policyToken({ providerCredential: "x" })), /unsupported field/);
  assert.throws(() => PolicyTokenSchema.parse(policyToken({ confidence: 0.99 })), /unsupported field/);
  assert.throws(() => PolicyTokenSchema.parse(policyToken({ executionStatus: "SUCCEEDED" })), /unsupported field/);
  assert.throws(
    () => PolicyTokenSchema.parse(policyToken({ constraints: { accessToken: "secret-value" } })),
    /credential or secret material/,
  );
});

test("OWNER_DECISION authority class requires an explicit decision reference", () => {
  assert.throws(
    () => PolicyTokenSchema.parse(policyToken({ decisionReference: undefined })),
    /requires decisionReference/,
  );
});
