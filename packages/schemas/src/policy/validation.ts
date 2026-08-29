import type {
  AuthorityConstraints,
  AuthoritySubjectReference,
  PolicyReference,
} from "@aurora/contracts/policy";

const RFC3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const CONTRACT_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

const SENSITIVE_KEYS = new Set([
  "apikey",
  "accesstoken",
  "bearertoken",
  "credential",
  "credentials",
  "password",
  "privatekey",
  "providertoken",
  "refreshtoken",
  "secret",
]);

export function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

export function assertKnownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw new TypeError(`${label} contains unsupported field: ${key}`);
    }
  }
}

export function requireNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }

  return value;
}

export function optionalNonEmptyString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return requireNonEmptyString(value, label);
}

export function requireContractVersion(value: unknown): string {
  const version = requireNonEmptyString(value, "schemaVersion");
  if (!CONTRACT_VERSION_PATTERN.test(version)) {
    throw new TypeError("schemaVersion must use major.minor.patch wire version syntax");
  }

  return version;
}

export function requireRfc3339(value: unknown, label: string): string {
  const timestamp = requireNonEmptyString(value, label);
  if (!RFC3339_PATTERN.test(timestamp) || Number.isNaN(Date.parse(timestamp))) {
    throw new TypeError(`${label} must be a valid RFC3339 timestamp`);
  }

  return timestamp;
}

export function requireOpaqueContext(value: unknown, label: string): Record<string, unknown> {
  const context = asRecord(value, label);
  if (Object.keys(context).length === 0) {
    throw new TypeError(`${label} must not be empty`);
  }

  return context;
}

export function requireSubject(value: unknown): AuthoritySubjectReference {
  const subject = asRecord(value, "subject");
  assertKnownKeys(subject, ["reference", "referenceType"], "subject");
  requireNonEmptyString(subject.reference, "subject.reference");
  optionalNonEmptyString(subject.referenceType, "subject.referenceType");
  return subject as unknown as AuthoritySubjectReference;
}

export function requireScope(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError("scope must be a non-empty array");
  }

  const scopes = value.map((entry, index) => requireNonEmptyString(entry, `scope[${index}]`));
  if (new Set(scopes).size !== scopes.length) {
    throw new TypeError("scope must not contain duplicate entries");
  }

  return scopes;
}

export function requirePolicyReference(value: unknown): PolicyReference {
  const policy = asRecord(value, "policy");
  assertKnownKeys(policy, ["reference", "version"], "policy");
  requireNonEmptyString(policy.reference, "policy.reference");
  requireNonEmptyString(policy.version, "policy.version");
  return policy as unknown as PolicyReference;
}

export function optionalConstraints(value: unknown): AuthorityConstraints | undefined {
  if (value === undefined) {
    return undefined;
  }

  const constraints = asRecord(value, "constraints");
  assertJsonCompatibleAndSecretFree(constraints, "constraints", new WeakSet<object>());
  return constraints as unknown as AuthorityConstraints;
}

function assertJsonCompatibleAndSecretFree(
  value: unknown,
  path: string,
  seen: WeakSet<object>,
): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path} contains a non-finite number`);
    }
    return;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new TypeError(`${path} must be acyclic JSON data`);
    }
    seen.add(value);
    value.forEach((entry, index) =>
      assertJsonCompatibleAndSecretFree(entry, `${path}[${index}]`, seen),
    );
    seen.delete(value);
    return;
  }

  if (typeof value === "object" && value !== null) {
    if (seen.has(value)) {
      throw new TypeError(`${path} must be acyclic JSON data`);
    }
    seen.add(value);
    for (const [key, entry] of Object.entries(value)) {
      const normalizedKey = key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      if (SENSITIVE_KEYS.has(normalizedKey)) {
        throw new TypeError(`${path} may not contain credential or secret material`);
      }
      assertJsonCompatibleAndSecretFree(entry, `${path}.${key}`, seen);
    }
    seen.delete(value);
    return;
  }

  throw new TypeError(`${path} must contain only JSON-compatible values`);
}

export function compareRfc3339(left: string, right: string): number {
  return Date.parse(left) - Date.parse(right);
}

export function parseJsonObject(serialized: string, label: string): unknown {
  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    throw new TypeError(`${label} must be valid JSON`);
  }
}
