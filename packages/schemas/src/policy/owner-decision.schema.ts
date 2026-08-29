import type { OwnerDecision } from "@aurora/contracts/policy";

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
  requireRfc3339,
  requireScope,
  requireSubject,
} from "./validation.ts";

const OWNER_DECISION_STATES = new Set(["APPROVED", "DENIED", "REVOKED", "EXPIRED"]);

const OWNER_DECISION_KEYS = [
  "kind",
  "schemaVersion",
  "decisionId",
  "subject",
  "decision",
  "actor",
  "tenant",
  "decidedAt",
  "scope",
  "constraints",
  "expiresAt",
  "correlation",
  "reason",
  "reasonReference",
  "authenticationReference",
] as const;

function parseOwnerDecision(input: unknown): OwnerDecision {
  const value = asRecord(input, "OwnerDecision");
  assertKnownKeys(value, OWNER_DECISION_KEYS, "OwnerDecision");

  if (value.kind !== "OWNER_DECISION") {
    throw new TypeError("OwnerDecision.kind must be OWNER_DECISION");
  }

  requireContractVersion(value.schemaVersion);
  requireNonEmptyString(value.decisionId, "decisionId");
  requireSubject(value.subject);

  const decision = requireNonEmptyString(value.decision, "decision");
  if (!OWNER_DECISION_STATES.has(decision)) {
    throw new TypeError(`unknown OwnerDecision decision: ${decision}`);
  }

  requireOpaqueContext(value.actor, "actor");
  requireOpaqueContext(value.tenant, "tenant");
  const decidedAt = requireRfc3339(value.decidedAt, "decidedAt");
  requireScope(value.scope);
  optionalConstraints(value.constraints);
  const expiresAt =
    value.expiresAt === undefined ? undefined : requireRfc3339(value.expiresAt, "expiresAt");
  requireOpaqueContext(value.correlation, "correlation");
  optionalNonEmptyString(value.reason, "reason");
  optionalNonEmptyString(value.reasonReference, "reasonReference");
  optionalNonEmptyString(value.authenticationReference, "authenticationReference");

  if (decision === "APPROVED" && expiresAt !== undefined && compareRfc3339(expiresAt, decidedAt) <= 0) {
    throw new TypeError("APPROVED OwnerDecision expiresAt must be later than decidedAt");
  }

  if (decision === "EXPIRED") {
    if (expiresAt === undefined) {
      throw new TypeError("EXPIRED OwnerDecision requires expiresAt");
    }
    if (compareRfc3339(expiresAt, decidedAt) > 0) {
      throw new TypeError("EXPIRED OwnerDecision expiresAt must not be later than decidedAt");
    }
  }

  return value as unknown as OwnerDecision;
}

function serializeOwnerDecision(input: unknown): string {
  return JSON.stringify(parseOwnerDecision(input));
}

function deserializeOwnerDecision(serialized: string): OwnerDecision {
  return parseOwnerDecision(parseJsonObject(serialized, "OwnerDecision serialization"));
}

export const OwnerDecisionSchema = Object.freeze({
  parse: parseOwnerDecision,
  serialize: serializeOwnerDecision,
  deserialize: deserializeOwnerDecision,
});
