import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { TenantId } from '@aurora/contracts/ids';

import {
  resolveDurableContainmentState,
  type DurableContainmentStateSource,
} from './durable-containment-state.js';
import {
  transitionDurableCircuit,
  transitionDurableKillSwitch,
  type DurableCircuitTransitionResult,
  type DurableContainmentStoredState,
  type DurableContainmentWritePort,
  type DurableKillSwitchTransitionResult,
} from './durable-containment-transitions.js';
import type { DurableHalfOpenProbePort } from './durable-half-open-probe.js';
import type { ReconciliationResult } from '../reconciliation/types.js';
import type {
  CircuitEvent,
  FailureContainmentSnapshot,
  KillSwitchCommand,
  RecoveryGate,
} from './types.js';

export interface W07ContainmentCircuitLifecycleRequest {
  readonly tenantId: TenantId;
  readonly circuitKey: string;
  readonly observedAt: Rfc3339Timestamp;
  readonly event: CircuitEvent;
  readonly failureThreshold: number;
  readonly recoveryAfterMs: number;
  readonly probeActionIntentId?: ActionIntent['actionIntentId'];
  readonly probeLeaseExpiresAt?: Rfc3339Timestamp;
}

export interface W07ContainmentKillSwitchLifecycleRequest {
  readonly tenantId: TenantId;
  readonly circuitKey: string;
  readonly changedAt: Rfc3339Timestamp;
  readonly command: KillSwitchCommand;
  readonly recoveryGate: RecoveryGate;
}

interface W07OperationalContainmentRequestBase {
  readonly tenantId: TenantId;
  readonly circuitKey: string;
  readonly observedAt: Rfc3339Timestamp;
  readonly authorizesExecution: false;
}

export interface W07DependencyHealthObservation {
  readonly kind: 'SERVER_DEPENDENCY_HEALTH_OBSERVATION';
  readonly tenantId: TenantId;
  readonly circuitKey: string;
  readonly observedAt: Rfc3339Timestamp;
  readonly health: FailureContainmentSnapshot['dependencyHealth'];
  readonly authorizesExecution: false;
}

export type W07ContainmentOperationalLifecycleRequest =
  | (W07OperationalContainmentRequestBase & Readonly<{ readonly command: 'REQUEST_CANCELLATION' }>)
  | (W07OperationalContainmentRequestBase &
      Readonly<{
        readonly command: 'CLEAR_CANCELLATION';
        readonly reconciliationGate: 'COMPLETED' | 'NOT_COMPLETED';
      }>)
  | (W07OperationalContainmentRequestBase &
      Readonly<{ readonly command: 'BEGIN_IN_FLIGHT' | 'END_IN_FLIGHT' }>)
  | (W07OperationalContainmentRequestBase &
      Readonly<{
        readonly command: 'UPDATE_DEPENDENCY_HEALTH';
        readonly observation: W07DependencyHealthObservation;
      }>)
  | (W07OperationalContainmentRequestBase &
      Readonly<{
        readonly command: 'ADVANCE_RETRY_DEPTH';
        readonly actionIntentId: ActionIntent['actionIntentId'];
        readonly expectedRetryDepth: number;
        readonly retryEligibility: ReconciliationResult;
      }>)
  | (W07OperationalContainmentRequestBase &
      Readonly<{
        readonly command: 'RESET_RETRY_DEPTH';
        readonly actionIntentId: ActionIntent['actionIntentId'];
        readonly terminalReconciliation: ReconciliationResult;
      }>);

export type W07ContainmentOperationalTransitionReason =
  | 'COMMAND_INVALID'
  | 'RECONCILIATION_NOT_COMPLETE'
  | 'IN_FLIGHT_LIMIT_REACHED'
  | 'IN_FLIGHT_UNDERFLOW'
  | 'DEPENDENCY_OBSERVATION_INVALID'
  | 'RETRY_ELIGIBILITY_INVALID'
  | 'RETRY_DEPTH_STALE'
  | 'RETRY_DEPTH_LIMIT_REACHED'
  | 'TERMINAL_RECONCILIATION_INVALID';

export type W07ContainmentOperationalTransitionResult =
  | Readonly<{
      ok: true;
      disposition: 'STATE_UPDATED' | 'STATE_UNCHANGED';
      version: number;
      snapshot: FailureContainmentSnapshot;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>
  | Readonly<{
      ok: false;
      code: 'STATE_UNAVAILABLE' | 'STATE_CONFLICT' | 'TRANSITION_REJECTED' | 'PROOF_REJECTED';
      reasons?: readonly W07ContainmentOperationalTransitionReason[];
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>;

export interface W07ContainmentLifecyclePort {
  transitionCircuit(input: W07ContainmentCircuitLifecycleRequest): DurableCircuitTransitionResult;
  transitionKillSwitch(
    input: W07ContainmentKillSwitchLifecycleRequest,
  ): DurableKillSwitchTransitionResult;
  transitionOperational(
    input: W07ContainmentOperationalLifecycleRequest,
  ): W07ContainmentOperationalTransitionResult;
}

export interface W07DurableContainmentLifecycleConfig {
  readonly source: DurableContainmentStateSource;
  readonly store: DurableContainmentWritePort;
  readonly halfOpenProbeFence: DurableHalfOpenProbePort;
}

/**
 * Server-side W07-G containment lifecycle coordinator.
 *
 * W07 computes every state transition before W03 persists it. The separate W03 lease is used only
 * to serialize the canonical HALF_OPEN probe owner. This port is intentionally not an HTTP/device
 * surface and no result can grant execution authority, prove an outcome or authorize retry.
 */
export class W07DurableContainmentLifecycleCoordinator implements W07ContainmentLifecyclePort {
  readonly #source: DurableContainmentStateSource;
  readonly #store: DurableContainmentWritePort;
  readonly #halfOpenProbeFence: DurableHalfOpenProbePort;

  constructor(config: W07DurableContainmentLifecycleConfig) {
    this.#source = config.source;
    this.#store = config.store;
    this.#halfOpenProbeFence = config.halfOpenProbeFence;
  }

  transitionCircuit(input: W07ContainmentCircuitLifecycleRequest): DurableCircuitTransitionResult {
    try {
      return transitionDurableCircuit({
        ...input,
        source: this.#source,
        store: this.#store,
        probeFence: this.#halfOpenProbeFence,
      });
    } catch {
      return {
        ok: false,
        code: 'STATE_UNAVAILABLE',
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      };
    }
  }

  transitionKillSwitch(
    input: W07ContainmentKillSwitchLifecycleRequest,
  ): DurableKillSwitchTransitionResult {
    try {
      return transitionDurableKillSwitch({
        ...input,
        source: this.#source,
        store: this.#store,
      });
    } catch {
      return {
        ok: false,
        code: 'STATE_UNAVAILABLE',
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      };
    }
  }

  transitionOperational(
    input: W07ContainmentOperationalLifecycleRequest,
  ): W07ContainmentOperationalTransitionResult {
    try {
      return transitionDurableOperationalContainment({
        ...input,
        source: this.#source,
        store: this.#store,
      });
    } catch {
      return operationalFailure('STATE_UNAVAILABLE');
    }
  }
}

function operationalFailure(
  code: Extract<W07ContainmentOperationalTransitionResult, { ok: false }>['code'],
  reasons?: readonly W07ContainmentOperationalTransitionReason[],
): W07ContainmentOperationalTransitionResult {
  return {
    ok: false,
    code,
    ...(reasons === undefined ? {} : { reasons }),
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

function storedState(snapshot: FailureContainmentSnapshot): DurableContainmentStoredState {
  return {
    circuit: {
      state: snapshot.circuit.state,
      consecutiveFailures: snapshot.circuit.consecutiveFailures,
      ...(snapshot.circuit.openedAt === undefined ? {} : { openedAt: snapshot.circuit.openedAt }),
    },
    killSwitch: snapshot.killSwitch,
    dependencyHealth: snapshot.dependencyHealth,
    cancellationRequested: snapshot.cancellationRequested,
    currentInFlight: snapshot.currentInFlight,
    maxInFlight: snapshot.maxInFlight,
    retryDepth: snapshot.retryDepth,
    maxRetryDepth: snapshot.maxRetryDepth,
  };
}

function eligibleRetryProof(
  proof: ReconciliationResult,
  actionIntentId: ActionIntent['actionIntentId'],
  currentRetryDepth: number,
): boolean {
  return (
    proof.kind === 'EXECUTION_RECONCILIATION_RESULT' &&
    proof.actionIntentId === actionIntentId &&
    proof.state === 'NO_EFFECT_CONFIRMED_RETRY_ELIGIBLE' &&
    proof.reconciliationRequired === false &&
    proof.retryEligibleAfterFreshGuards === true &&
    Array.isArray(proof.reasons) &&
    proof.reasons.length === 0 &&
    proof.nextAttemptNumber === currentRetryDepth + 2 &&
    proof.authorizesExecution === false
  );
}

function terminalReconciliationProof(
  proof: ReconciliationResult,
  actionIntentId: ActionIntent['actionIntentId'],
): boolean {
  return (
    proof.kind === 'EXECUTION_RECONCILIATION_RESULT' &&
    proof.actionIntentId === actionIntentId &&
    (proof.state === 'EFFECT_OBSERVED' || proof.state === 'NO_EFFECT_CONFIRMED_RETRY_BLOCKED') &&
    proof.reconciliationRequired === false &&
    proof.retryEligibleAfterFreshGuards === false &&
    proof.nextAttemptNumber === undefined &&
    proof.authorizesExecution === false
  );
}

function dependencyObservationMatches(
  request: Extract<
    W07ContainmentOperationalLifecycleRequest,
    { command: 'UPDATE_DEPENDENCY_HEALTH' }
  >,
): boolean {
  const observation = request.observation;
  return (
    observation.kind === 'SERVER_DEPENDENCY_HEALTH_OBSERVATION' &&
    observation.tenantId === request.tenantId &&
    observation.circuitKey === request.circuitKey &&
    observation.observedAt === request.observedAt &&
    (observation.health === 'HEALTHY' ||
      observation.health === 'DEGRADED' ||
      observation.health === 'UNAVAILABLE') &&
    observation.authorizesExecution === false
  );
}

function unchanged(
  version: number,
  snapshot: FailureContainmentSnapshot,
): W07ContainmentOperationalTransitionResult {
  return {
    ok: true,
    disposition: 'STATE_UNCHANGED',
    version,
    snapshot,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

/**
 * Applies W07-owned operational containment transitions to the canonical W03 CAS record.
 *
 * Commands and proofs are server-side facts only. A W07-F retry-eligibility result is required to
 * advance retry depth, but remains non-authoritative: this transition neither executes nor grants
 * a retry. Reset and cancellation clearing require explicit completed reconciliation evidence.
 */
export function transitionDurableOperationalContainment(
  input: W07ContainmentOperationalLifecycleRequest & {
    readonly source: DurableContainmentStateSource;
    readonly store: DurableContainmentWritePort;
  },
): W07ContainmentOperationalTransitionResult {
  if (input.authorizesExecution !== false) {
    return operationalFailure('TRANSITION_REJECTED', ['COMMAND_INVALID']);
  }
  const resolved = resolveDurableContainmentState(
    {
      tenantId: input.tenantId,
      circuitKey: input.circuitKey,
      evaluatedAt: input.observedAt,
    },
    input.source,
  );
  if (resolved.status !== 'RESOLVED') return operationalFailure('STATE_UNAVAILABLE');

  const current = resolved.record;
  let snapshot: FailureContainmentSnapshot;
  switch (input.command) {
    case 'REQUEST_CANCELLATION':
      if (current.snapshot.cancellationRequested)
        return unchanged(current.version, current.snapshot);
      snapshot = { ...current.snapshot, cancellationRequested: true };
      break;
    case 'CLEAR_CANCELLATION':
      if (input.reconciliationGate !== 'COMPLETED') {
        return operationalFailure('PROOF_REJECTED', ['RECONCILIATION_NOT_COMPLETE']);
      }
      if (!current.snapshot.cancellationRequested)
        return unchanged(current.version, current.snapshot);
      snapshot = { ...current.snapshot, cancellationRequested: false };
      break;
    case 'BEGIN_IN_FLIGHT':
      if (current.snapshot.currentInFlight >= current.snapshot.maxInFlight) {
        return operationalFailure('TRANSITION_REJECTED', ['IN_FLIGHT_LIMIT_REACHED']);
      }
      snapshot = { ...current.snapshot, currentInFlight: current.snapshot.currentInFlight + 1 };
      break;
    case 'END_IN_FLIGHT':
      if (current.snapshot.currentInFlight === 0) {
        return operationalFailure('TRANSITION_REJECTED', ['IN_FLIGHT_UNDERFLOW']);
      }
      snapshot = { ...current.snapshot, currentInFlight: current.snapshot.currentInFlight - 1 };
      break;
    case 'UPDATE_DEPENDENCY_HEALTH':
      if (!dependencyObservationMatches(input)) {
        return operationalFailure('PROOF_REJECTED', ['DEPENDENCY_OBSERVATION_INVALID']);
      }
      if (current.snapshot.dependencyHealth === input.observation.health) {
        return unchanged(current.version, current.snapshot);
      }
      snapshot = { ...current.snapshot, dependencyHealth: input.observation.health };
      break;
    case 'ADVANCE_RETRY_DEPTH':
      if (
        !eligibleRetryProof(
          input.retryEligibility,
          input.actionIntentId,
          current.snapshot.retryDepth,
        )
      ) {
        return operationalFailure('PROOF_REJECTED', ['RETRY_ELIGIBILITY_INVALID']);
      }
      if (
        !Number.isSafeInteger(input.expectedRetryDepth) ||
        input.expectedRetryDepth < 0 ||
        input.expectedRetryDepth !== current.snapshot.retryDepth
      ) {
        return operationalFailure('STATE_CONFLICT', ['RETRY_DEPTH_STALE']);
      }
      if (current.snapshot.retryDepth >= current.snapshot.maxRetryDepth) {
        return operationalFailure('TRANSITION_REJECTED', ['RETRY_DEPTH_LIMIT_REACHED']);
      }
      snapshot = { ...current.snapshot, retryDepth: current.snapshot.retryDepth + 1 };
      break;
    case 'RESET_RETRY_DEPTH':
      if (!terminalReconciliationProof(input.terminalReconciliation, input.actionIntentId)) {
        return operationalFailure('PROOF_REJECTED', ['TERMINAL_RECONCILIATION_INVALID']);
      }
      if (current.snapshot.retryDepth === 0) return unchanged(current.version, current.snapshot);
      snapshot = { ...current.snapshot, retryDepth: 0 };
      break;
    default:
      return operationalFailure('TRANSITION_REJECTED', ['COMMAND_INVALID']);
  }

  let write;
  try {
    write = input.store.compareAndSet({
      tenantId: input.tenantId,
      circuitKey: input.circuitKey,
      expectedVersion: current.version,
      state: storedState(snapshot),
      updatedAt: input.observedAt,
      authorizesExecution: false,
    });
  } catch {
    return operationalFailure('STATE_UNAVAILABLE');
  }
  if (!write.ok) {
    return operationalFailure(
      write.code === 'VERSION_CONFLICT' ? 'STATE_CONFLICT' : 'STATE_UNAVAILABLE',
    );
  }
  return {
    ok: true,
    disposition: 'STATE_UPDATED',
    version: write.version,
    snapshot,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}
