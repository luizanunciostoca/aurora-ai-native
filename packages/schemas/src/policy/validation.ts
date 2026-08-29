import type {
  ActorRef,
  CorrelationContext,
  Rfc3339Timestamp,
  TenantContext,
} from '@aurora/contracts/context';
import type { DecisionId, PolicyTokenId } from '@aurora/contracts/ids';
import type {
  AuthorityConstraints,
  AuthoritySubjectReference,
  PolicyReference,
} from '@aurora/contracts/policy';
import type { ContractVersion, Version } from '@aurora/contracts/versioning';

interface RuntimeValidator<T> {
  parse(input: unknown): T;
}

/**
 * Validators owned by W01-D/W01-F and composed by W01-G.
 * W01-C never redefines their ID, context, timestamp or version semantics.
 */
export interface PolicySchemaDependencies {
  readonly contractVersion: RuntimeValidator<ContractVersion>;
  readonly decisionId: RuntimeValidator<DecisionId>;
  readonly policyTokenId: RuntimeValidator<PolicyTokenId>;
  readonly actor: RuntimeValidator<ActorRef>;
  readonly tenant: RuntimeValidator<TenantContext>;
  readonly correlation: RuntimeValidator<CorrelationContext>;
  readonly timestamp: RuntimeValidator<Rfc3339Timestamp>;
  readonly version: RuntimeValidator<Version>;
}

const SENSITIVE_KEY_MARKERS = [
  'apikey',
  'accesstoken',
  'bearertoken',
  'credential',
  'password',
  'privatekey',
  'providertoken',
  'refreshtoken',
  'secret',
] as const;

export function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
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
  if (typeof value !== 'string' || value.trim().length === 0) {
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

export function requireSubject(value: unknown): AuthoritySubjectReference {
  const subject = asRecord(value, 'subject');
  assertKnownKeys(subject, ['reference'], 'subject');
  return { reference: requireNonEmptyString(subject.reference, 'subject.reference') };
}

export function requireScope(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError('scope must be a non-empty array');
  }

  const scopes = value.map((entry, index) => requireNonEmptyString(entry, `scope[${index}]`));
  if (new Set(scopes).size !== scopes.length) {
    throw new TypeError('scope must not contain duplicate entries');
  }

  return scopes;
}

export function requirePolicyReference(
  value: unknown,
  versionValidator: RuntimeValidator<Version>,
): PolicyReference {
  const policy = asRecord(value, 'policy');
  assertKnownKeys(policy, ['reference', 'version'], 'policy');
  return {
    reference: requireNonEmptyString(policy.reference, 'policy.reference'),
    version: versionValidator.parse(policy.version),
  };
}

export function optionalConstraints(value: unknown): AuthorityConstraints | undefined {
  if (value === undefined) {
    return undefined;
  }

  const constraints = asRecord(value, 'constraints');
  assertJsonCompatibleAndSecretFree(constraints, 'constraints', new WeakSet<object>());
  return constraints as AuthorityConstraints;
}

function assertJsonCompatibleAndSecretFree(
  value: unknown,
  path: string,
  seen: WeakSet<object>,
): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return;
  }

  if (typeof value === 'number') {
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

  if (typeof value === 'object' && value !== null) {
    if (seen.has(value)) {
      throw new TypeError(`${path} must be acyclic JSON data`);
    }
    seen.add(value);
    for (const [key, entry] of Object.entries(value)) {
      const normalizedKey = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      if (SENSITIVE_KEY_MARKERS.some((marker) => normalizedKey.includes(marker))) {
        throw new TypeError(`${path} may not contain credential or secret material`);
      }
      assertJsonCompatibleAndSecretFree(entry, `${path}.${key}`, seen);
    }
    seen.delete(value);
    return;
  }

  throw new TypeError(`${path} must contain only JSON-compatible values`);
}

export function compareRfc3339(left: Rfc3339Timestamp, right: Rfc3339Timestamp): number {
  return Date.parse(left) - Date.parse(right);
}

export function parseJsonObject(serialized: string, label: string): unknown {
  try {
    return JSON.parse(serialized) as unknown;
  } catch {
    throw new TypeError(`${label} must be valid JSON`);
  }
}
