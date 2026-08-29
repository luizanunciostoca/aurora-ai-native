import type { PolicyToken } from "@aurora/contracts/policy";

import {
  asRecord,
  assertKnownKeys,
  compareRfc3339,
  optionalConstraints,
  optionalNonEmptyString,
  parseJsonObject,
  requireContractVersion,
  requireNonEmptyString,
  requireOpaqueContext,
  requirePolicyReference,
  requireRfc3339,
  requireScope,
  requireSubject,
} from "./validation.ts";

const AUTHORITY_CLASSES = new Set(["OWNER_DECISION", "POLICY_GRANT"]);

const POLICY_TOKEN_KEYS = [
  "kind",
  "schemaVersion",
  "policyTokenId",
  "tenant",
  "subject",
  "action",
  "scope",
  "issuedAt",
  "expiresAt",
  "policy",
  "constraints",
  "authorityClass",
  "correlation",
  "decisionReference",
] as const;

function parsePolicyToken(input: unknown): PolicyToken {
  const value = asRecord(input, "PolicyToken");
  assertKnownKeys(value, POLICY_TOKEN_KEYS, "PolicyToken");

  if (value.kind !== "POLICY_TOKEN") {
    throw new TypeError("PolicyToken.kind must be POLICY_TOKEN");
  }

  requireContractVersion(value.schemaVersion);
  requireNonEmptyString(value.policyTokenId, "policyTokenId");
  requireOpaqueContext(value.tenant, "tenant");
  requireSubject(value.subject);
  requireNonEmptyString(value.action, "action");
  requireScope(value.scope);
  const issuedAt = requireRfc3339(value.issuedAt, "issuedAt");
  const expiresAt = requireRfc3339(value.expiresAt, "expiresAt");
  requirePolicyReference(value.policy);
  optionalConstraints(value.constraints);

  const authorityClass = requireNonEmptyString(value.authorityClass, "authorityClass");
  if (!AUTHORITY_CLASSES.has(authorityClass)) {
    throw new TypeError(`unknown PolicyToken authorityClass: ${authorityClass}`);
  }

  requireOpaqueContext(value.correlation, "correlation");
  const decisionReference = optionalNonEmptyString(value.decisionReference, "decisionReference");

  if (compareRfc3339(expiresAt, issuedAt) <= 0) {
    throw new TypeError("PolicyToken.expiresAt must be later than issuedAt");
  }

  if (authorityClass === "OWNER_DECISION" && decisionReference === undefined) {
    throw new TypeError("OWNER_DECISION PolicyToken requires decisionReference");
  }

  return value as unknown as PolicyToken;
}

function parsePolicyTokenAt(input: unknown, at: string): PolicyToken {
  const token = parsePolicyToken(input);
  const evaluationAt = requireRfc3339(at, "evaluationAt");
  if (compareRfc3339(token.expiresAt, evaluationAt) <= 0) {
    throw new TypeError("PolicyToken is expired at evaluationAt");
  }

  return token;
}

function serializePolicyToken(input: unknown): string {
  return JSON.stringify(parsePolicyToken(input));
}

function deserializePolicyToken(serialized: string): PolicyToken {
  return parsePolicyToken(parseJsonObject(serialized, "PolicyToken serialization"));
}

export const PolicyTokenSchema = Object.freeze({
  parse: parsePolicyToken,
  parseAt: parsePolicyTokenAt,
  serialize: serializePolicyToken,
  deserialize: deserializePolicyToken,
});
