import type { ActionIntent } from '@aurora/contracts/actions';

import type {
  ExecutionAttemptQuotaLookup,
  ExecutionAttemptQuotaRejectionReason,
  ExecutionAttemptQuotaResolution,
  ExecutionAttemptQuotaSnapshot,
  ExecutionAttemptQuotaSource,
} from './attempt-quota-source.js';

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
/** Bounded, trimmed, non-empty execution reference; not a W03 event/outbox id. */
const EXECUTION_REF = /^[A-Za-z0-9._:/+-]{1,256}$/u;

function parseTime(value: string): number | undefined {
  if (!RFC3339.test(value)) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function boundedText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim();
}

function validLookup(lookup: ExecutionAttemptQuotaLookup): boolean {
  return (
    boundedText(lookup.tenantId) &&
    boundedText(lookup.actionIntentId) &&
    EXECUTION_REF.test(lookup.executionRef)
  );
}

function validSnapshot(snapshot: ExecutionAttemptQuotaSnapshot): boolean {
  if (
    snapshot.authorizesExecution !== false ||
    !Number.isSafeInteger(snapshot.attemptNumber) ||
    snapshot.attemptNumber < 1 ||
    !Number.isSafeInteger(snapshot.maxAttempts) ||
    snapshot.maxAttempts < 1
  ) {
    return false;
  }
  if (snapshot.quota === undefined) return true;
  const { limit, used } = snapshot.quota;
  return Number.isSafeInteger(limit) && limit > 0 && Number.isSafeInteger(used) && used >= 0;
}

function rejected(
  ...reasons: readonly ExecutionAttemptQuotaRejectionReason[]
): ExecutionAttemptQuotaResolution {
  return {
    status: 'REJECTED',
    reasons: [...new Set(reasons)].sort() as readonly ExecutionAttemptQuotaRejectionReason[],
    authorizesExecution: false,
  };
}

/**
 * Fail-closed read of the canonical server-owned execution-attempt/quota source
 * at the W07-C safeguard gate. The source is the sole owner of the current
 * tenant + ActionIntent-scoped attempt/quota value; this resolver never invents
 * a default such as attempt=1/maxAttempts=3.
 *
 * Fails closed (`REJECTED`) before any source read when the evaluation time is
 * invalid, when the lookup reference is malformed (empty/untrimmed ids or an
 * executionRef outside the bounded reference shape), or when the lookup
 * `tenantId`/`actionIntentId` do not match the ActionIntent execution context.
 * After the lookup is validated, fails closed when the source is absent, throws
 * (outage), returns no record (state absence) or returns malformed state. The
 * result never grants authority or retry eligibility.
 */
export function resolveCurrentAttemptQuota(
  lookup: ExecutionAttemptQuotaLookup,
  actionIntent: ActionIntent,
  source: ExecutionAttemptQuotaSource | undefined,
): ExecutionAttemptQuotaResolution {
  if (parseTime(lookup.evaluatedAt) === undefined) {
    return rejected('ATTEMPT_QUOTA_TIME_INVALID');
  }
  if (!validLookup(lookup)) {
    return rejected('ATTEMPT_QUOTA_LOOKUP_INVALID');
  }
  if (
    lookup.tenantId !== actionIntent.tenant.tenantId ||
    lookup.actionIntentId !== actionIntent.actionIntentId
  ) {
    return rejected('ATTEMPT_QUOTA_CONTEXT_MISMATCH');
  }
  if (source === undefined) {
    return rejected('ATTEMPT_QUOTA_SOURCE_UNAVAILABLE');
  }

  let snapshot: ExecutionAttemptQuotaSnapshot | null;
  try {
    snapshot = source.resolveCurrent(lookup);
  } catch {
    return rejected('ATTEMPT_QUOTA_SOURCE_UNAVAILABLE');
  }
  if (snapshot === null) {
    return rejected('ATTEMPT_QUOTA_SOURCE_UNAVAILABLE');
  }
  if (!validSnapshot(snapshot)) {
    return rejected('ATTEMPT_QUOTA_STATE_MALFORMED');
  }

  return { status: 'RESOLVED', snapshot, authorizesExecution: false };
}
