import type { ActionIntent } from '@aurora/contracts/actions';
import type { ExecutionQuotaSnapshot } from './types.js';

/**
 * W07-C-owned lookup key, structurally identical to the W03-owned
 * `ExecutionAttemptQuotaKey` in `packages/events/src/delivery/attempt-quota.ts`
 * by design (both bind tenant + canonical ActionIntentId + executionRef so a
 * lookup/row cannot cross tenants, ActionIntents or unrelated execution
 * attempts). The two are declared independently rather than imported from a
 * single module because `packages/events/src/index.ts` is an explicit
 * coordinator-owned publication surface ("Parallel W03 leaf tasks must not
 * edit this file; exports are reconciled only after independent
 * acceptance."): this task is not authorized to make services/executors
 * consume packages/events as a published dependency ahead of that
 * reconciliation. Both types derive their tenant/ActionIntentId fields from
 * the same canonical `@aurora/contracts` source, so no new ID vocabulary is
 * introduced here.
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
