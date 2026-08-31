import type { ActorRef, Rfc3339Timestamp } from '@aurora/contracts/context';
import type {
  AuthorityConstraints,
  OwnerDecision,
  PolicyToken,
} from '@aurora/contracts/policy';

const POLICY_TOKEN_KEYS = new Set([
  'kind',
  'schemaVersion',
  'policyTokenId',
  'tenant',
  'subject',
  'action',
  'scope',
  'issuedAt',
  'expiresAt',
  'policy',
  'constraints',
  'authorityClass',
  'correlation',
  'decisionReference',
]);

const OWNER_DECISION_KEYS = new Set([
  'kind',
  'schemaVersion',
  'decisionId',
  'subject',
  'decision',
  'actor',
  'tenant',
  'decidedAt',
  'scope',
  'constraints',
  'expiresAt',
  'correlation',
  'reason',
  'reasonReference',
  'authenticationReference',
]);

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

export function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as Readonly<Record<string, unknown>>;
}

function hasOnlyKeys(record: Readonly<Record<string, unknown>>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(record).every((key) => allowed.has(key));
}

export function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function validTimestamp(value: unknown): value is Rfc3339Timestamp {
  return nonEmptyString(value) && Number.isFinite(Date.parse(value));
}

export function validScope(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(nonEmptyString) &&
    new Set(value).size === value.length
  );
}

function safeConstraintValue(value: unknown, seen: WeakSet<object>): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) {
    if (seen.has(value)) return false;
    seen.add(value);
    const safe = value.every((entry) => safeConstraintValue(entry, seen));
    seen.delete(value);
    return safe;
  }
  const record = asRecord(value);
  if (!record) return false;
  if (seen.has(record)) return false;
  seen.add(record);
  for (const [key, entry] of Object.entries(record)) {
    const normalizedKey = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    if (SENSITIVE_KEY_MARKERS.some((marker) => normalizedKey.includes(marker))) {
      seen.delete(record);
      return false;
    }
    if (!safeConstraintValue(entry, seen)) {
      seen.delete(record);
      return false;
    }
  }
  seen.delete(record);
  return true;
}

function validConstraints(value: unknown): boolean {
  if (value === undefined) return true;
  const record = asRecord(value);
  return record !== undefined && safeConstraintValue(record, new WeakSet<object>());
}

function validPolicyReference(value: unknown): boolean {
  const record = asRecord(value);
  return record !== undefined && nonEmptyString(record.reference) && nonEmptyString(record.version);
}

function validTenant(value: unknown): boolean {
  const record = asRecord(value);
  return record !== undefined && Object.keys(record).length === 1 && nonEmptyString(record.tenantId);
}

function validCorrelation(value: unknown): boolean {
  const record = asRecord(value);
  if (!record || !nonEmptyString(record.correlationId)) return false;
  if (!Object.keys(record).every((key) => key === 'correlationId' || key === 'causation')) return false;
  if (record.causation === undefined) return true;
  const causation = asRecord(record.causation);
  return (
    causation !== undefined &&
    Object.keys(causation).length === 1 &&
    nonEmptyString(causation.causationId)
  );
}

function validActor(value: unknown): value is ActorRef {
  const record = asRecord(value);
  if (!record || !['HUMAN', 'AGENT', 'SERVICE', 'SYSTEM'].includes(String(record.kind))) return false;
  if (!nonEmptyString(record.identityId)) return false;
  if (
    !Object.keys(record).every(
      (key) => key === 'kind' || key === 'identityId' || key === 'externalIdentity',
    )
  ) {
    return false;
  }
  if (record.externalIdentity === undefined) return true;
  const external = asRecord(record.externalIdentity);
  return (
    external !== undefined &&
    external.kind === 'EXTERNAL_IDENTITY' &&
    nonEmptyString(external.provider) &&
    nonEmptyString(external.externalId) &&
    Object.keys(external).every((key) => ['kind', 'provider', 'externalId'].includes(key))
  );
}

function structurallyValidSubjectReference(value: unknown): boolean {
  const record = asRecord(value);
  return (
    record !== undefined &&
    Object.keys(record).length === 1 &&
    nonEmptyString(record.reference)
  );
}

export function validPolicyTokenShape(value: unknown): value is PolicyToken {
  const token = asRecord(value);
  if (!token || !hasOnlyKeys(token, POLICY_TOKEN_KEYS)) return false;
  if (token.kind !== 'POLICY_TOKEN') return false;
  if (!nonEmptyString(token.schemaVersion) || !nonEmptyString(token.policyTokenId)) return false;
  if (!validTenant(token.tenant) || !structurallyValidSubjectReference(token.subject)) return false;
  if (!nonEmptyString(token.action) || !validScope(token.scope)) return false;
  if (!validTimestamp(token.issuedAt) || !validTimestamp(token.expiresAt)) return false;
  if (Date.parse(token.expiresAt) <= Date.parse(token.issuedAt)) return false;
  if (!validPolicyReference(token.policy) || !validConstraints(token.constraints)) return false;
  if (!['OWNER_DECISION', 'POLICY_RULE'].includes(String(token.authorityClass))) return false;
  if (!validCorrelation(token.correlation)) return false;
  if (token.decisionReference !== undefined && !nonEmptyString(token.decisionReference)) return false;
  if (token.authorityClass === 'OWNER_DECISION' && !nonEmptyString(token.decisionReference)) return false;
  return true;
}

export function validOwnerDecisionShape(value: unknown): value is OwnerDecision {
  const decision = asRecord(value);
  if (!decision || !hasOnlyKeys(decision, OWNER_DECISION_KEYS)) return false;
  if (decision.kind !== 'OWNER_DECISION') return false;
  if (!nonEmptyString(decision.schemaVersion) || !nonEmptyString(decision.decisionId)) return false;
  if (!structurallyValidSubjectReference(decision.subject) || !validActor(decision.actor)) return false;
  if (!validTenant(decision.tenant) || !validTimestamp(decision.decidedAt)) return false;
  if (!validScope(decision.scope) || !validConstraints(decision.constraints)) return false;
  if (!['APPROVED', 'DENIED', 'REVOKED', 'EXPIRED'].includes(String(decision.decision))) return false;
  if (decision.expiresAt !== undefined && !validTimestamp(decision.expiresAt)) return false;
  if (
    decision.decision === 'APPROVED' &&
    decision.expiresAt !== undefined &&
    Date.parse(decision.expiresAt) <= Date.parse(decision.decidedAt)
  ) {
    return false;
  }
  if (!validCorrelation(decision.correlation)) return false;
  for (const key of ['reason', 'reasonReference', 'authenticationReference'] as const) {
    if (decision[key] !== undefined && !nonEmptyString(decision[key])) return false;
  }
  return true;
}

export function stableJson(value: unknown, seen: WeakSet<object> = new WeakSet<object>()): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (seen.has(value)) return JSON.stringify('[Circular]');
  seen.add(value);
  const serialized = Array.isArray(value)
    ? `[${value.map((item) => stableJson(item, seen)).join(',')}]`
    : `{${Object.keys(value as Readonly<Record<string, unknown>>)
        .sort()
        .map(
          (key) =>
            `${JSON.stringify(key)}:${stableJson(
              (value as Readonly<Record<string, unknown>>)[key],
              seen,
            )}`,
        )
        .join(',')}}`;
  seen.delete(value);
  return serialized;
}

export function fingerprint(value: unknown): string {
  const input = stableJson(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

export function uniqueSorted<T extends string>(values: readonly T[]): readonly T[] {
  return [...new Set(values)].sort() as readonly T[];
}

export function scopeCovers(granted: readonly string[], requested: readonly string[]): boolean {
  const grantedSet = new Set(granted);
  return requested.every((scope) => grantedSet.has(scope));
}

export function constraintsSatisfied(
  authorityConstraints: AuthorityConstraints | undefined,
  operationConstraints: AuthorityConstraints | undefined,
): boolean {
  if (authorityConstraints === undefined) return true;
  if (operationConstraints === undefined) return false;
  return Object.entries(authorityConstraints).every(
    ([key, value]) =>
      Object.prototype.hasOwnProperty.call(operationConstraints, key) &&
      stableJson(value) === stableJson(operationConstraints[key]),
  );
}

export function sameActor(left: ActorRef, right: ActorRef): boolean {
  if (left.kind !== right.kind || left.identityId !== right.identityId) return false;
  if (!left.externalIdentity && !right.externalIdentity) return true;
  if (!left.externalIdentity || !right.externalIdentity) return false;
  return (
    left.externalIdentity.provider === right.externalIdentity.provider &&
    left.externalIdentity.externalId === right.externalIdentity.externalId
  );
}
