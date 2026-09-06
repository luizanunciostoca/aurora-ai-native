import type { ActionIntent } from '@aurora/contracts/actions';
import type { ExecutionQuotaSnapshot } from './types.js';

/**
 * W03-owned durable key for the execution-attempt/quota state consumed by
 * the W07-C safeguard gate. Bound to tenant + canonical ActionIntentId +
 * executionRef so a lookup cannot cross tenants, ActionIntents or unrelated
 * execution attempts.
 */
export interface ExecutionAttemptQuotaLookup {
  readonly tenantId: ActionIntent['tenant']['tenantId'];
  readonly actionIntentId: ActionIntent['actionIntentId'];
  /** Opaque server-assigned execution context reference; not a canonical ID. */
  readonly executionRef: string;
}

/**
 * Durable snapshot materialized from `w03_execution_attempt_quota` (see
 * packages/events/src/delivery/attempt-quota.ts). No field here grants
 * authority, outcome or retry permission; `version`/`updatedAt` exist only
 * so a consumer can reject stale reads.
 */
export interface ExecutionAttemptQuotaSnapshot extends ExecutionAttemptQuotaLookup {
  readonly attemptNumber: number;
  readonly maxAttempts: number;
  readonly quota?: ExecutionQuotaSnapshot;
  readonly version: number;
  readonly updatedAt: string;
}

/**
 * W03-owned durable persistence port consumed read-only by the W07-C
 * safeguard gate. Concrete adapters (e.g. a Postgres reader over
 * `w03_execution_attempt_quota`) materialize the snapshot at the
 * composition edge. W07-C stores no ledger state itself and this port
 * never mutates state; mutation ownership stays server-side and
 * compatible with W07 reconciliation/retry ownership. No Android/wake/STT/
 * W14 ACK/device-trust input may implement or influence this port.
 */
export interface ExecutionAttemptQuotaSource {
  lookup(input: ExecutionAttemptQuotaLookup): ExecutionAttemptQuotaSnapshot | null;
}
