import type {
  ExecutionAttemptQuotaLookup,
  ExecutionAttemptQuotaSnapshot,
  ExecutionAttemptQuotaSource,
} from './attempt-quota-source.js';
import type { ExecutionQuotaSnapshot } from './types.js';

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export type AttemptQuotaRejectionReason =
  | 'LOOKUP_INVALID'
  | 'TIME_INVALID'
  | 'SOURCE_UNAVAILABLE'
  | 'STATE_ABSENT'
  | 'STATE_MALFORMED'
  | 'CONTEXT_MISMATCH'
  | 'STATE_STALE';

export type AttemptQuotaResolution =
  | Readonly<{
      readonly status: 'RESOLVED';
      readonly attemptNumber: number;
      readonly maxAttempts: number;
      readonly quota?: ExecutionQuotaSnapshot;
    }>
  | Readonly<{ readonly status: 'REJECTED'; readonly reason: AttemptQuotaRejectionReason }>;

export interface ResolveCurrentAttemptQuotaInput {
  readonly source: ExecutionAttemptQuotaSource;
  readonly lookup: ExecutionAttemptQuotaLookup;
  readonly now: string;
  /**
   * Maximum age (ms) a durable row may have before it is treated as stale.
   * Required: there is no implicit default that would permit an
   * unboundedly old read to pass silently.
   */
  readonly maxAgeMs: number;
}

function parseTime(value: unknown): number | undefined {
  if (typeof value !== 'string' || !RFC3339.test(value)) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isValidQuotaShape(value: unknown): value is ExecutionQuotaSnapshot {
  if (!isPlainObject(value)) return false;
  const { limit, used } = value;
  return (
    Number.isInteger(limit) &&
    (limit as number) >= 1 &&
    Number.isInteger(used) &&
    (used as number) >= 0
  );
}

function isValidSnapshotShape(value: unknown): value is ExecutionAttemptQuotaSnapshot {
  if (!isPlainObject(value)) return false;
  const {
    tenantId,
    actionIntentId,
    executionRef,
    attemptNumber,
    maxAttempts,
    quota,
    version,
    updatedAt,
  } = value;
  if (
    !isNonEmptyString(tenantId) ||
    !isNonEmptyString(actionIntentId) ||
    !isNonEmptyString(executionRef)
  ) {
    return false;
  }
  if (!Number.isInteger(attemptNumber) || (attemptNumber as number) < 1) return false;
  if (!Number.isInteger(maxAttempts) || (maxAttempts as number) < 1) return false;
  if (!Number.isInteger(version) || (version as number) < 1) return false;
  if (typeof updatedAt !== 'string') return false;
  if (quota !== undefined && !isValidQuotaShape(quota)) return false;
  return true;
}

/**
 * Fail-closed W07-C resolver over the W03-owned durable execution-attempt/
 * quota source. Re-reads on every call (no caching of a prior verdict),
 * binds `tenantId + actionIntentId + executionRef`, and rejects instead of
 * inventing defaults (e.g. `attempt=1`/`maxAttempts=3`) whenever the source
 * is unavailable, the row is absent, the shape is malformed, the context
 * does not match the requested key, or the row is older than `maxAgeMs`.
 * This function only resolves the *shape* of the current counters; the
 * ATTEMPT_LIMIT_REACHED/QUOTA_EXHAUSTED verdicts remain owned by
 * `evaluateExecutionSafeguards`, and no retry/authority permission is ever
 * produced here.
 */
export function resolveCurrentAttemptQuota(
  input: ResolveCurrentAttemptQuotaInput,
): AttemptQuotaResolution {
  if (!isPlainObject(input) || typeof input.source !== 'object' || input.source === null) {
    return { status: 'REJECTED', reason: 'LOOKUP_INVALID' };
  }
  const { source, lookup, now, maxAgeMs } = input;
  if (
    !isPlainObject(lookup) ||
    !isNonEmptyString(lookup.tenantId) ||
    !isNonEmptyString(lookup.actionIntentId) ||
    !isNonEmptyString(lookup.executionRef)
  ) {
    return { status: 'REJECTED', reason: 'LOOKUP_INVALID' };
  }
  if (!Number.isInteger(maxAgeMs) || maxAgeMs < 1) {
    return { status: 'REJECTED', reason: 'LOOKUP_INVALID' };
  }
  const nowMs = parseTime(now);
  if (nowMs === undefined) return { status: 'REJECTED', reason: 'TIME_INVALID' };

  let snapshot: ExecutionAttemptQuotaSnapshot | null;
  try {
    snapshot = (source as ExecutionAttemptQuotaSource).lookup(
      lookup as ExecutionAttemptQuotaLookup,
    );
  } catch {
    return { status: 'REJECTED', reason: 'SOURCE_UNAVAILABLE' };
  }
  if (snapshot === null || snapshot === undefined) {
    return { status: 'REJECTED', reason: 'STATE_ABSENT' };
  }
  if (!isValidSnapshotShape(snapshot)) {
    return { status: 'REJECTED', reason: 'STATE_MALFORMED' };
  }
  if (
    snapshot.tenantId !== lookup.tenantId ||
    snapshot.actionIntentId !== lookup.actionIntentId ||
    snapshot.executionRef !== lookup.executionRef
  ) {
    return { status: 'REJECTED', reason: 'CONTEXT_MISMATCH' };
  }
  const updatedAtMs = parseTime(snapshot.updatedAt);
  if (updatedAtMs === undefined) return { status: 'REJECTED', reason: 'STATE_MALFORMED' };
  if (updatedAtMs > nowMs || nowMs - updatedAtMs > maxAgeMs) {
    return { status: 'REJECTED', reason: 'STATE_STALE' };
  }

  return {
    status: 'RESOLVED',
    attemptNumber: snapshot.attemptNumber,
    maxAttempts: snapshot.maxAttempts,
    ...(snapshot.quota === undefined ? {} : { quota: snapshot.quota }),
  };
}
