import {
  buildCompareAndSwapExecutionAttemptQuotaStatement,
  type ExecutionAttemptQuotaCompareAndSwapInput,
  type SqlStatement,
} from '@aurora/events/delivery';

import type { W03ExecutionAttemptQuotaSnapshot } from './w03-attempt-quota-source.js';
import { parseW03ExecutionAttemptQuotaSnapshot } from './w03-attempt-quota-source.js';
import type { W03SyncSqlExecutor } from './w03-postgres-reservations.js';

const POSITIONAL_PARAMETER = /\$([1-9][0-9]*)/gu;
const TENANT_ID = /^ten_[0-9A-HJKMNP-TV-Z]{26}$/u;
const ACTION_INTENT_ID = /^act_[0-9A-HJKMNP-TV-Z]{26}$/u;
const EXECUTION_REF = /^[A-Za-z0-9._:/+-]{1,256}$/u;

function canonicalInput(input: ExecutionAttemptQuotaCompareAndSwapInput): boolean {
  const timestamp = Date.parse(input.now);
  const quotaAbsent = input.quotaLimit === undefined && input.quotaUsed === undefined;
  const quotaPresent = input.quotaLimit !== undefined && input.quotaUsed !== undefined;
  return (
    TENANT_ID.test(input.tenantId) &&
    ACTION_INTENT_ID.test(input.actionIntentId) &&
    EXECUTION_REF.test(input.executionRef) &&
    Number.isSafeInteger(input.attemptNumber) &&
    input.attemptNumber >= 1 &&
    Number.isSafeInteger(input.maxAttempts) &&
    input.maxAttempts >= input.attemptNumber &&
    Number.isSafeInteger(input.expectedVersion) &&
    input.expectedVersion >= 1 &&
    Number.isSafeInteger(timestamp) &&
    new Date(timestamp).toISOString() === input.now &&
    (quotaAbsent ||
      (quotaPresent &&
        Number.isSafeInteger(input.quotaLimit) &&
        input.quotaLimit >= 1 &&
        Number.isSafeInteger(input.quotaUsed) &&
        input.quotaUsed >= 0 &&
        input.quotaUsed <= input.quotaLimit))
  );
}

function adaptCanonicalStatement(statement: SqlStatement): {
  readonly sql: string;
  readonly variables: Readonly<Record<string, string>>;
} {
  const used = new Set<number>();
  const variables: Record<string, string> = {};
  const mutation = statement.text.replace(
    POSITIONAL_PARAMETER,
    (_placeholder, indexRaw: string) => {
      const index = Number(indexRaw);
      if (!Number.isSafeInteger(index) || index < 1 || index > statement.values.length) {
        throw new Error('Canonical W03 attempt CAS contains an invalid positional parameter.');
      }
      used.add(index);
      const value = statement.values[index - 1];
      if (value === null) return 'NULL';
      if (typeof value !== 'string' && typeof value !== 'number') {
        throw new Error('Canonical W03 attempt CAS contains an unsupported parameter.');
      }
      const key = `cas_${index}`;
      variables[key] = String(value);
      return `:'${key}'`;
    },
  );
  if (used.size !== statement.values.length) {
    throw new Error('Canonical W03 attempt CAS did not bind every supplied parameter.');
  }
  const withoutTerminator = mutation.trim().replace(/;$/u, '');
  return {
    sql: String.raw`
WITH changed AS (
${withoutTerminator}
)
SELECT tenant_id, action_intent_id, execution_ref, attempt_number, max_attempts,
       COALESCE(quota_limit::text, '-'), COALESCE(quota_used::text, '-'), version,
       floor(extract(epoch FROM updated_at) * 1000)::bigint
FROM changed;
`.trim(),
    variables,
  };
}

/**
 * W03 Postgres CAS adapter for the W07-owned execution-attempt lifecycle.
 *
 * The update is always produced by the canonical W03 statement builder. This
 * adapter only maps its positional parameters to psql variables and normalizes
 * the returned timestamp for the existing fail-closed read parser.
 */
export class W03PostgresExecutionAttemptQuotaCas {
  readonly #sql: W03SyncSqlExecutor;

  constructor(sql: W03SyncSqlExecutor) {
    this.#sql = sql;
  }

  compareAndSwap(
    input: ExecutionAttemptQuotaCompareAndSwapInput,
  ): W03ExecutionAttemptQuotaSnapshot | null {
    if (!canonicalInput(input)) return null;
    try {
      const request = adaptCanonicalStatement(
        buildCompareAndSwapExecutionAttemptQuotaStatement(input),
      );
      return parseW03ExecutionAttemptQuotaSnapshot(this.#sql.query(request));
    } catch {
      return null;
    }
  }
}
