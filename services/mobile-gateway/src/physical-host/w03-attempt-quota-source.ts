import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { ActionIntentId, TenantId } from '@aurora/contracts/ids';

import type { W03SyncSqlExecutor } from './w03-postgres-reservations.js';

const TENANT_ID = /^ten_[0-9A-HJKMNP-TV-Z]{26}$/u;
const ACTION_INTENT_ID = /^act_[0-9A-HJKMNP-TV-Z]{26}$/u;
const EXECUTION_REF = /^[A-Za-z0-9._:/+-]{1,256}$/u;

const SELECT_CURRENT_SQL = String.raw`
SELECT
  tenant_id,
  action_intent_id,
  execution_ref,
  attempt_number,
  max_attempts,
  COALESCE(quota_limit::text, '-'),
  COALESCE(quota_used::text, '-'),
  version,
  floor(extract(epoch FROM updated_at) * 1000)::bigint
FROM w03_execution_attempt_quota
WHERE tenant_id = :'tenant_id'
  AND action_intent_id = :'action_intent_id'
  AND execution_ref = :'execution_ref'
LIMIT 1;
`.trim();

export interface W03ExecutionAttemptQuotaLookup {
  readonly tenantId: TenantId;
  readonly actionIntentId: ActionIntentId;
  readonly executionRef: string;
}

export interface W03ExecutionAttemptQuotaSnapshot extends W03ExecutionAttemptQuotaLookup {
  readonly attemptNumber: number;
  readonly maxAttempts: number;
  readonly quota?: Readonly<{ readonly limit: number; readonly used: number }>;
  readonly version: number;
  readonly updatedAt: Rfc3339Timestamp;
}

function positiveInteger(value: string | undefined): number | null {
  if (value === undefined || !/^[0-9]{1,16}$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
}

function nonNegativeInteger(value: string | undefined): number | null {
  if (value === undefined || !/^[0-9]{1,16}$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function parseW03ExecutionAttemptQuotaSnapshot(
  output: string,
): W03ExecutionAttemptQuotaSnapshot | null {
  const lines = output.trim().split(/\r?\n/u).filter(Boolean);
  if (lines.length !== 1) return null;
  const fields = lines[0]?.split('\t') ?? [];
  if (fields.length !== 9) return null;
  const [
    tenantId,
    actionIntentId,
    executionRef,
    attemptRaw,
    maxAttemptsRaw,
    quotaLimitRaw,
    quotaUsedRaw,
    versionRaw,
    updatedAtRaw,
  ] = fields;
  if (
    typeof tenantId !== 'string' ||
    !TENANT_ID.test(tenantId) ||
    typeof actionIntentId !== 'string' ||
    !ACTION_INTENT_ID.test(actionIntentId) ||
    typeof executionRef !== 'string' ||
    !EXECUTION_REF.test(executionRef)
  ) {
    return null;
  }
  const attemptNumber = positiveInteger(attemptRaw);
  const maxAttempts = positiveInteger(maxAttemptsRaw);
  const version = positiveInteger(versionRaw);
  const updatedAtMs = nonNegativeInteger(updatedAtRaw);
  if (attemptNumber === null || maxAttempts === null || version === null || updatedAtMs === null) {
    return null;
  }
  if (attemptNumber > maxAttempts) return null;
  const quotaAbsent = quotaLimitRaw === '-' && quotaUsedRaw === '-';
  const quotaPresent = quotaLimitRaw !== '-' && quotaUsedRaw !== '-';
  if (!quotaAbsent && !quotaPresent) return null;
  const quotaLimit = quotaPresent ? positiveInteger(quotaLimitRaw) : null;
  const quotaUsed = quotaPresent ? nonNegativeInteger(quotaUsedRaw) : null;
  if (quotaPresent && (quotaLimit === null || quotaUsed === null)) return null;
  if (quotaLimit !== null && quotaUsed !== null && quotaUsed > quotaLimit) return null;

  return {
    tenantId: tenantId as TenantId,
    actionIntentId: actionIntentId as ActionIntentId,
    executionRef,
    attemptNumber,
    maxAttempts,
    ...(quotaLimit === null || quotaUsed === null
      ? {}
      : { quota: Object.freeze({ limit: quotaLimit, used: quotaUsed }) }),
    version,
    updatedAt: new Date(updatedAtMs).toISOString() as Rfc3339Timestamp,
  };
}

/**
 * LOCAL/W03 read adapter for the W07-C durable attempt/quota source.
 *
 * It reads only server-owned state from `w03_execution_attempt_quota`; missing, malformed or
 * unavailable state returns null and therefore fails closed at W07. It never creates attempts,
 * decides retry eligibility, grants authority or consumes Android/wake/STT/W14-ACK truth.
 */
export class W03PostgresExecutionAttemptQuotaSource {
  readonly #sql: W03SyncSqlExecutor;

  constructor(sql: W03SyncSqlExecutor) {
    this.#sql = sql;
  }

  lookup(input: W03ExecutionAttemptQuotaLookup): W03ExecutionAttemptQuotaSnapshot | null {
    if (
      !TENANT_ID.test(input.tenantId) ||
      !ACTION_INTENT_ID.test(input.actionIntentId) ||
      !EXECUTION_REF.test(input.executionRef)
    ) {
      return null;
    }
    try {
      const snapshot = parseW03ExecutionAttemptQuotaSnapshot(
        this.#sql.query({
          sql: SELECT_CURRENT_SQL,
          variables: {
            tenant_id: input.tenantId,
            action_intent_id: input.actionIntentId,
            execution_ref: input.executionRef,
          },
        }),
      );
      if (
        snapshot === null ||
        snapshot.tenantId !== input.tenantId ||
        snapshot.actionIntentId !== input.actionIntentId ||
        snapshot.executionRef !== input.executionRef
      ) {
        return null;
      }
      return snapshot;
    } catch {
      return null;
    }
  }
}
