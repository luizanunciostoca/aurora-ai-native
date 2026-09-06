import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';

import type { ExecutionQuotaSnapshot } from './types.js';

/**
 * Server-owned current execution-attempt/quota snapshot for one tenant-scoped
 * ActionIntent. This is ActionIntent execution-attempt state, never W03
 * EventEnvelope delivery-transport `attempt_count`/`maxAttempts` and never an
 * Android/wake/STT/router-confidence/W14-ACK/device-trust supplied value.
 */
export interface ExecutionAttemptQuotaSnapshot {
  readonly attemptNumber: number;
  readonly maxAttempts: number;
  readonly quota?: ExecutionQuotaSnapshot;
  /** This state constrains execution; it never grants authority or retry. */
  readonly authorizesExecution: false;
}

/**
 * Lookup key binds tenant + ActionIntent execution context, not event fan-out.
 * The execution reference scopes the attempt/quota counter to one ActionIntent
 * execution context; it is not a W03 event/outbox identifier.
 */
export interface ExecutionAttemptQuotaLookup {
  readonly tenantId: ActionIntent['tenant']['tenantId'];
  readonly actionIntentId: ActionIntent['actionIntentId'];
  readonly executionRef: string;
  readonly evaluatedAt: Rfc3339Timestamp;
}

/**
 * Port to the canonical server-owned execution-attempt/quota source. The source
 * is re-read at the W07-C safeguard gate; it must be current and tenant-scoped.
 * A `null` return, a throw, malformed state or a lookup/context mismatch all
 * fail closed. No default attempt/quota is fabricated.
 *
 * The source never grants retry eligibility: W07-F reconciliation remains the
 * owner of retry decisions, and a snapshot is an input to the gate, not a
 * retry permission.
 */
export interface ExecutionAttemptQuotaSource {
  resolveCurrent(lookup: ExecutionAttemptQuotaLookup): ExecutionAttemptQuotaSnapshot | null;
}

export type ExecutionAttemptQuotaRejectionReason =
  | 'ATTEMPT_QUOTA_SOURCE_UNAVAILABLE'
  | 'ATTEMPT_QUOTA_STATE_MALFORMED'
  | 'ATTEMPT_QUOTA_TENANT_MISMATCH'
  | 'ATTEMPT_QUOTA_TIME_INVALID';

export type ExecutionAttemptQuotaResolution =
  | Readonly<{
      readonly status: 'RESOLVED';
      readonly snapshot: ExecutionAttemptQuotaSnapshot;
      /** Resolved state constrains the gate; it never authorizes execution/retry. */
      readonly authorizesExecution: false;
    }>
  | Readonly<{
      readonly status: 'REJECTED';
      readonly reasons: readonly ExecutionAttemptQuotaRejectionReason[];
      readonly authorizesExecution: false;
    }>;
