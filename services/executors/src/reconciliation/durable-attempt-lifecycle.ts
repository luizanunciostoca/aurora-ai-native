import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';

import {
  resolveCurrentAttemptQuotaSnapshot,
  type AttemptQuotaRejectionReason,
  type ExecutionAttemptQuotaSnapshot,
  type ExecutionAttemptQuotaSource,
} from '../safeguards/index.js';
import { reconcileExecutionUncertainty } from './reconciliation.js';
import type { ReconcileExecutionUncertaintyRequest, ReconciliationResult } from './types.js';

const EXECUTION_REF = /^[A-Za-z0-9._:/+-]{1,256}$/u;

/**
 * Structural W03 mutation port. Its implementation must execute the existing
 * `buildCompareAndSwapExecutionAttemptQuotaStatement` from
 * `packages/events/src/delivery/attempt-quota.ts`; W07 owns every semantic
 * decision made before this port, while W03 only persists the resulting row.
 */
export interface ExecutionAttemptQuotaCasPort {
  compareAndSwap(input: {
    readonly tenantId: ActionIntent['tenant']['tenantId'];
    readonly actionIntentId: ActionIntent['actionIntentId'];
    readonly executionRef: string;
    readonly attemptNumber: number;
    readonly maxAttempts: number;
    readonly quotaLimit?: number;
    readonly quotaUsed?: number;
    readonly now: Rfc3339Timestamp;
    readonly expectedVersion: number;
  }): ExecutionAttemptQuotaSnapshot | null;
}

export interface DurableExecutionAttemptLifecycleConfig {
  readonly source: ExecutionAttemptQuotaSource;
  readonly persistence: ExecutionAttemptQuotaCasPort;
  /** Required owner-approved freshness bound; no default is supplied. */
  readonly maxAgeMs: number;
}

interface DurableExecutionAttemptLifecycleRequest {
  readonly actionIntent: ActionIntent;
  /** Server-preissued execution identity, never supplied by Android/STT/ACK. */
  readonly executionRef: string;
  readonly expectedVersion: number;
  readonly evaluatedAt: Rfc3339Timestamp;
  /** W07-F request; this coordinator re-evaluates it instead of trusting a result-shaped claim. */
  readonly reconciliation: ReconcileExecutionUncertaintyRequest;
}

export type AttemptLifecycleRejectionReason =
  | 'REQUEST_INVALID'
  | 'RECONCILIATION_CONTEXT_MISMATCH'
  | 'RECONCILIATION_NOT_RETRY_ELIGIBLE'
  | 'RECONCILIATION_NOT_TERMINAL'
  | 'RETRY_GUARDS_STATE_STALE'
  | 'CURRENT_ATTEMPT_MISMATCH'
  | 'ATTEMPT_LIMIT_REACHED'
  | 'QUOTA_EXHAUSTED'
  | 'VERSION_MISMATCH'
  | 'PERSISTENCE_CONFLICT'
  | 'PERSISTENCE_UNAVAILABLE'
  | 'PERSISTED_STATE_MALFORMED'
  | `CURRENT_${AttemptQuotaRejectionReason}`;

interface AttemptLifecycleInvariantResult {
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
}

export type AttemptAdvanceResult =
  | (AttemptLifecycleInvariantResult &
      Readonly<{
        readonly status: 'ADVANCED';
        readonly attemptNumber: number;
        readonly maxAttempts: number;
        readonly version: number;
      }>)
  | (AttemptLifecycleInvariantResult &
      Readonly<{ readonly status: 'REJECTED'; readonly reason: AttemptLifecycleRejectionReason }>);

export type AttemptTerminalResult =
  | (AttemptLifecycleInvariantResult &
      Readonly<{
        readonly status: 'SEALED';
        readonly attemptNumber: number;
        readonly maxAttempts: number;
        readonly version: number;
      }>)
  | (AttemptLifecycleInvariantResult &
      Readonly<{ readonly status: 'REJECTED'; readonly reason: AttemptLifecycleRejectionReason }>);

const INVARIANTS: AttemptLifecycleInvariantResult = Object.freeze({
  authorizesExecution: false,
  provesExecutionSuccess: false,
  retryAuthorized: false,
});

function rejected<T extends AttemptAdvanceResult | AttemptTerminalResult>(
  reason: AttemptLifecycleRejectionReason,
): T {
  return { status: 'REJECTED', reason, ...INVARIANTS } as T;
}

function requestContextMatches(request: DurableExecutionAttemptLifecycleRequest): boolean {
  try {
    const reconciliation = request.reconciliation;
    return (
      typeof request.evaluatedAt === 'string' &&
      EXECUTION_REF.test(request.executionRef) &&
      Number.isSafeInteger(request.expectedVersion) &&
      request.expectedVersion >= 1 &&
      reconciliation.schemaVersion === request.actionIntent.schemaVersion &&
      reconciliation.actionIntent.actionIntentId === request.actionIntent.actionIntentId &&
      reconciliation.actionIntent.tenant.tenantId === request.actionIntent.tenant.tenantId &&
      reconciliation.actionIntent.correlation.correlationId ===
        request.actionIntent.correlation.correlationId
    );
  } catch {
    return false;
  }
}

function quotaWithinBounds(snapshot: ExecutionAttemptQuotaSnapshot): boolean {
  return (
    snapshot.quota === undefined ||
    (Number.isSafeInteger(snapshot.quota.limit) &&
      Number.isSafeInteger(snapshot.quota.used) &&
      snapshot.quota.used < snapshot.quota.limit)
  );
}

function sameQuota(
  left: ExecutionAttemptQuotaSnapshot['quota'],
  right: ExecutionAttemptQuotaSnapshot['quota'],
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.limit === right.limit && left.used === right.used;
}

function validatePersisted(
  persisted: unknown,
  current: ExecutionAttemptQuotaSnapshot,
  attemptNumber: number,
  maxAttempts: number,
  expectedQuota: ExecutionAttemptQuotaSnapshot['quota'],
  evaluatedAt: string,
): ExecutionAttemptQuotaSnapshot | null {
  const verified = resolveCurrentAttemptQuotaSnapshot({
    source: { lookup: () => persisted as ExecutionAttemptQuotaSnapshot | null },
    lookup: {
      tenantId: current.tenantId,
      actionIntentId: current.actionIntentId,
      executionRef: current.executionRef,
    },
    now: evaluatedAt,
    maxAgeMs: 1,
  });
  if (verified.status === 'REJECTED') return null;
  const snapshot = verified.snapshot;
  const persistedAt = Date.parse(snapshot.updatedAt);
  const expectedAt = Date.parse(evaluatedAt);
  if (
    snapshot.attemptNumber !== attemptNumber ||
    snapshot.maxAttempts !== maxAttempts ||
    !sameQuota(snapshot.quota, expectedQuota) ||
    snapshot.version !== current.version + 1 ||
    !Number.isFinite(persistedAt) ||
    persistedAt !== expectedAt
  ) {
    return null;
  }
  return snapshot;
}

function reconciliationMatchesCurrent(
  result: ReconciliationResult,
  request: DurableExecutionAttemptLifecycleRequest,
  current: ExecutionAttemptQuotaSnapshot,
): boolean {
  return (
    result.schemaVersion === request.actionIntent.schemaVersion &&
    result.actionIntentId === request.actionIntent.actionIntentId &&
    request.reconciliation.uncertainty.actionIntentId === request.actionIntent.actionIntentId &&
    request.reconciliation.uncertainty.attemptNumber === current.attemptNumber &&
    request.reconciliation.uncertainty.maxAttempts === current.maxAttempts
  );
}

function retryGuardsCoverCurrent(
  request: DurableExecutionAttemptLifecycleRequest,
  current: ExecutionAttemptQuotaSnapshot,
): boolean {
  const guards = request.reconciliation.retrySafeguards;
  if (guards === undefined) return false;
  const currentAt = Date.parse(current.updatedAt);
  const guardsAt = Date.parse(guards.evaluatedAt);
  const lifecycleAt = Date.parse(request.evaluatedAt);
  return (
    Number.isFinite(currentAt) &&
    Number.isFinite(guardsAt) &&
    Number.isFinite(lifecycleAt) &&
    currentAt <= guardsAt &&
    guardsAt <= lifecycleAt
  );
}

/**
 * W07-F/W07-C-owned durable lifecycle over the W03 CAS persistence primitive.
 * It re-reads current state, re-runs reconciliation, and only then requests a
 * fenced W03 write. No return value grants execution or retry permission.
 */
export class DurableExecutionAttemptLifecycle {
  readonly #source: ExecutionAttemptQuotaSource;
  readonly #persistence: ExecutionAttemptQuotaCasPort;
  readonly #maxAgeMs: number;

  constructor(config: DurableExecutionAttemptLifecycleConfig) {
    if (!Number.isSafeInteger(config.maxAgeMs) || config.maxAgeMs < 1) {
      throw new Error('Execution-attempt lifecycle freshness bound is invalid.');
    }
    this.#source = config.source;
    this.#persistence = config.persistence;
    this.#maxAgeMs = config.maxAgeMs;
  }

  #current(
    request: DurableExecutionAttemptLifecycleRequest,
  ):
    | Readonly<{ status: 'RESOLVED'; snapshot: ExecutionAttemptQuotaSnapshot }>
    | Readonly<{ status: 'REJECTED'; reason: AttemptLifecycleRejectionReason }> {
    if (!requestContextMatches(request)) {
      return { status: 'REJECTED', reason: 'REQUEST_INVALID' };
    }
    const resolved = resolveCurrentAttemptQuotaSnapshot({
      source: this.#source,
      lookup: {
        tenantId: request.actionIntent.tenant.tenantId,
        actionIntentId: request.actionIntent.actionIntentId,
        executionRef: request.executionRef,
      },
      now: request.evaluatedAt,
      maxAgeMs: this.#maxAgeMs,
    });
    if (resolved.status === 'REJECTED') {
      return { status: 'REJECTED', reason: `CURRENT_${resolved.reason}` };
    }
    if (resolved.snapshot.version !== request.expectedVersion) {
      return { status: 'REJECTED', reason: 'VERSION_MISMATCH' };
    }
    return resolved;
  }

  #persist(
    request: DurableExecutionAttemptLifecycleRequest,
    current: ExecutionAttemptQuotaSnapshot,
    attemptNumber: number,
    maxAttempts: number,
    quota: ExecutionAttemptQuotaSnapshot['quota'],
  ): ExecutionAttemptQuotaSnapshot | AttemptLifecycleRejectionReason {
    let persisted: ExecutionAttemptQuotaSnapshot | null;
    try {
      persisted = this.#persistence.compareAndSwap({
        tenantId: current.tenantId,
        actionIntentId: current.actionIntentId,
        executionRef: current.executionRef,
        attemptNumber,
        maxAttempts,
        ...(quota === undefined ? {} : { quotaLimit: quota.limit, quotaUsed: quota.used }),
        now: request.evaluatedAt,
        expectedVersion: current.version,
      });
    } catch {
      return 'PERSISTENCE_UNAVAILABLE';
    }
    if (persisted === null) return 'PERSISTENCE_CONFLICT';
    return (
      validatePersisted(
        persisted,
        current,
        attemptNumber,
        maxAttempts,
        quota,
        request.evaluatedAt,
      ) ?? 'PERSISTED_STATE_MALFORMED'
    );
  }

  reconcileAndAdvance(request: DurableExecutionAttemptLifecycleRequest): AttemptAdvanceResult {
    const currentResult = this.#current(request);
    if (currentResult.status === 'REJECTED') {
      return rejected<AttemptAdvanceResult>(currentResult.reason);
    }
    const current = currentResult.snapshot;
    let reconciliation: ReconciliationResult;
    try {
      reconciliation = reconcileExecutionUncertainty(request.reconciliation);
    } catch {
      return rejected<AttemptAdvanceResult>('RECONCILIATION_CONTEXT_MISMATCH');
    }
    if (!reconciliationMatchesCurrent(reconciliation, request, current)) {
      return rejected<AttemptAdvanceResult>('RECONCILIATION_CONTEXT_MISMATCH');
    }
    if (
      reconciliation.state !== 'NO_EFFECT_CONFIRMED_RETRY_ELIGIBLE' ||
      reconciliation.reconciliationRequired ||
      !reconciliation.retryEligibleAfterFreshGuards ||
      reconciliation.nextAttemptNumber !== current.attemptNumber + 1
    ) {
      return rejected<AttemptAdvanceResult>('RECONCILIATION_NOT_RETRY_ELIGIBLE');
    }
    if (!retryGuardsCoverCurrent(request, current)) {
      return rejected<AttemptAdvanceResult>('RETRY_GUARDS_STATE_STALE');
    }
    if (current.attemptNumber >= current.maxAttempts) {
      return rejected<AttemptAdvanceResult>('ATTEMPT_LIMIT_REACHED');
    }
    if (!quotaWithinBounds(current)) {
      return rejected<AttemptAdvanceResult>('QUOTA_EXHAUSTED');
    }
    const nextAttempt = current.attemptNumber + 1;
    const nextQuota =
      current.quota === undefined
        ? undefined
        : { limit: current.quota.limit, used: current.quota.used + 1 };
    const persisted = this.#persist(request, current, nextAttempt, current.maxAttempts, nextQuota);
    if (typeof persisted === 'string') return rejected<AttemptAdvanceResult>(persisted);
    return {
      status: 'ADVANCED',
      attemptNumber: persisted.attemptNumber,
      maxAttempts: persisted.maxAttempts,
      version: persisted.version,
      ...INVARIANTS,
    };
  }

  /**
   * Durably seals the existing row with the current attempt as its effective
   * ceiling. This is the only terminal marker representable by the accepted
   * schema without a migration; it is allowed only after W07-F observes the
   * effect or confirms the configured attempt ceiling was reached.
   */
  reconcileAndSealTerminal(
    request: DurableExecutionAttemptLifecycleRequest,
  ): AttemptTerminalResult {
    const currentResult = this.#current(request);
    if (currentResult.status === 'REJECTED') {
      return rejected<AttemptTerminalResult>(currentResult.reason);
    }
    const current = currentResult.snapshot;
    let reconciliation: ReconciliationResult;
    try {
      reconciliation = reconcileExecutionUncertainty(request.reconciliation);
    } catch {
      return rejected<AttemptTerminalResult>('RECONCILIATION_CONTEXT_MISMATCH');
    }
    if (!reconciliationMatchesCurrent(reconciliation, request, current)) {
      return rejected<AttemptTerminalResult>('RECONCILIATION_CONTEXT_MISMATCH');
    }
    const effectObserved = reconciliation.state === 'EFFECT_OBSERVED';
    const attemptCeilingReached =
      reconciliation.state === 'NO_EFFECT_CONFIRMED_RETRY_BLOCKED' &&
      reconciliation.reasons.includes('RETRY_ATTEMPT_LIMIT_REACHED') &&
      current.attemptNumber === current.maxAttempts;
    if (!effectObserved && !attemptCeilingReached) {
      return rejected<AttemptTerminalResult>('RECONCILIATION_NOT_TERMINAL');
    }
    const persisted = this.#persist(
      request,
      current,
      current.attemptNumber,
      current.attemptNumber,
      current.quota,
    );
    if (typeof persisted === 'string') return rejected<AttemptTerminalResult>(persisted);
    return {
      status: 'SEALED',
      attemptNumber: persisted.attemptNumber,
      maxAttempts: persisted.maxAttempts,
      version: persisted.version,
      ...INVARIANTS,
    };
  }
}
