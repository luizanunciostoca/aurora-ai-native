import type { ActionIntentId, TenantId } from '@aurora/contracts';
import type { SqlStatement } from './types';

const SAFE_EXECUTION_REF = /^[A-Za-z0-9._:/+-]{1,256}$/u;

/**
 * W03-owned durable key for the execution-attempt/quota state consumed by the
 * W07-C safeguard gate. Bound to tenant + canonical ActionIntentId +
 * executionRef so a valid row cannot be misread across tenants, ActionIntents
 * or unrelated execution attempts.
 */
export interface ExecutionAttemptQuotaKey {
  readonly tenantId: TenantId;
  readonly actionIntentId: ActionIntentId;
  /** Opaque server-assigned execution context reference; not a canonical ID. */
  readonly executionRef: string;
}

export interface ExecutionAttemptQuotaWrite extends ExecutionAttemptQuotaKey {
  readonly attemptNumber: number;
  readonly maxAttempts: number;
  readonly quotaLimit?: number;
  readonly quotaUsed?: number;
  readonly now: string;
}

/**
 * Optimistic-concurrency write: only succeeds against the currently-read
 * version. This is a full-row replace: `quotaLimit`/`quotaUsed` must be the
 * complete current quota state (or both omitted to clear it), not a partial
 * patch - an omitted quota here clears any existing quota rather than
 * preserving it.
 */
export interface ExecutionAttemptQuotaCompareAndSwapInput extends ExecutionAttemptQuotaWrite {
  readonly expectedVersion: number;
}

export interface ExecutionAttemptQuotaRecord extends ExecutionAttemptQuotaKey {
  readonly attemptNumber: number;
  readonly maxAttempts: number;
  readonly quotaLimit: number | null;
  readonly quotaUsed: number | null;
  readonly version: number;
  readonly updatedAt: string;
}

function requireNonEmpty(value: string, name: string): string {
  if (!value.trim()) throw new Error(`${name} must be non-empty`);
  return value;
}

function requireExecutionRef(value: string): string {
  if (!SAFE_EXECUTION_REF.test(value)) {
    throw new Error('executionRef must contain 1-256 safe characters');
  }
  return value;
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function requireOptionalQuotaPair(limit: number | undefined, used: number | undefined): void {
  if ((limit === undefined) !== (used === undefined)) {
    throw new Error('quotaLimit and quotaUsed must both be present or both be absent');
  }
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error('quotaLimit must be a positive integer');
  }
  if (used !== undefined && (!Number.isInteger(used) || used < 0)) {
    throw new Error('quotaUsed must be a non-negative integer');
  }
}

export const SELECT_EXECUTION_ATTEMPT_QUOTA_SQL = `
SELECT tenant_id, action_intent_id, execution_ref, attempt_number, max_attempts,
       quota_limit, quota_used, version, updated_at
FROM w03_execution_attempt_quota
WHERE tenant_id = $1 AND action_intent_id = $2 AND execution_ref = $3;
`.trim();

export function buildSelectExecutionAttemptQuotaStatement(
  key: ExecutionAttemptQuotaKey,
): SqlStatement {
  return {
    text: SELECT_EXECUTION_ATTEMPT_QUOTA_SQL,
    values: [
      requireNonEmpty(key.tenantId, 'tenantId'),
      requireNonEmpty(key.actionIntentId, 'actionIntentId'),
      requireExecutionRef(key.executionRef),
    ],
  };
}

/**
 * Creates the initial durable row for a tenant + ActionIntent + executionRef.
 * Never fabricates attempt/quota values: the caller (W07-owned execution
 * orchestration, never Android/wake/STT/W14 ACK/device-trust input) supplies
 * the explicit first-attempt state.
 */
export const INSERT_EXECUTION_ATTEMPT_QUOTA_SQL = `
INSERT INTO w03_execution_attempt_quota (
  tenant_id, action_intent_id, execution_ref, attempt_number, max_attempts,
  quota_limit, quota_used, version, created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8::timestamptz, $8::timestamptz)
ON CONFLICT (tenant_id, action_intent_id, execution_ref) DO NOTHING
RETURNING tenant_id, action_intent_id, execution_ref, attempt_number, max_attempts,
          quota_limit, quota_used, version, updated_at;
`.trim();

export function buildInsertExecutionAttemptQuotaStatement(
  input: ExecutionAttemptQuotaWrite,
): SqlStatement {
  requireOptionalQuotaPair(input.quotaLimit, input.quotaUsed);
  return {
    text: INSERT_EXECUTION_ATTEMPT_QUOTA_SQL,
    values: [
      requireNonEmpty(input.tenantId, 'tenantId'),
      requireNonEmpty(input.actionIntentId, 'actionIntentId'),
      requireExecutionRef(input.executionRef),
      requirePositiveInteger(input.attemptNumber, 'attemptNumber'),
      requirePositiveInteger(input.maxAttempts, 'maxAttempts'),
      input.quotaLimit ?? null,
      input.quotaUsed ?? null,
      requireNonEmpty(input.now, 'now'),
    ],
  };
}

/**
 * Optimistic-concurrency mutation: only the writer holding the current
 * `version` can advance the durable attempt/quota state. A stale writer
 * affects zero rows instead of silently clobbering newer state. Version is
 * the sole fencing condition - `updated_at` is not part of the `WHERE`
 * clause, so a caller cannot confuse a legitimate version match with a
 * clock-skew rejection (the read-side resolver independently rejects
 * future-dated/stale snapshots; this statement only records the write-time
 * `now` value). This statement only persists counters/quota; it grants no
 * authority, outcome or retry permission and does not itself decide retry
 * eligibility - that remains W07 reconciliation/retry-owned.
 *
 * This is a full-row replace, not a partial patch: every call must supply
 * the complete current `quotaLimit`/`quotaUsed` pair (or omit both to clear
 * quota tracking). A caller that only wants to advance `attemptNumber` must
 * still re-supply the quota values it read alongside `expectedVersion`;
 * omitting quota here silently clears it rather than preserving the prior
 * value.
 */
export const COMPARE_AND_SWAP_EXECUTION_ATTEMPT_QUOTA_SQL = `
UPDATE w03_execution_attempt_quota
SET attempt_number = $4,
    max_attempts = $5,
    quota_limit = $6,
    quota_used = $7,
    version = version + 1,
    updated_at = $8::timestamptz
WHERE tenant_id = $1
  AND action_intent_id = $2
  AND execution_ref = $3
  AND version = $9
RETURNING tenant_id, action_intent_id, execution_ref, attempt_number, max_attempts,
          quota_limit, quota_used, version, updated_at;
`.trim();

export function buildCompareAndSwapExecutionAttemptQuotaStatement(
  input: ExecutionAttemptQuotaCompareAndSwapInput,
): SqlStatement {
  requireOptionalQuotaPair(input.quotaLimit, input.quotaUsed);
  return {
    text: COMPARE_AND_SWAP_EXECUTION_ATTEMPT_QUOTA_SQL,
    values: [
      requireNonEmpty(input.tenantId, 'tenantId'),
      requireNonEmpty(input.actionIntentId, 'actionIntentId'),
      requireExecutionRef(input.executionRef),
      requirePositiveInteger(input.attemptNumber, 'attemptNumber'),
      requirePositiveInteger(input.maxAttempts, 'maxAttempts'),
      input.quotaLimit ?? null,
      input.quotaUsed ?? null,
      requireNonEmpty(input.now, 'now'),
      requirePositiveInteger(input.expectedVersion, 'expectedVersion'),
    ],
  };
}
