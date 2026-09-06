import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { TenantId } from '@aurora/contracts/ids';

import { transitionCircuit, transitionKillSwitch } from './failure-containment.js';
import {
  resolveDurableContainmentState,
  type DurableContainmentStateSource,
} from './durable-containment-state.js';
import {
  releaseDurableHalfOpenProbe,
  reserveDurableHalfOpenProbe,
  type DurableHalfOpenProbePort,
} from './durable-half-open-probe.js';
import type {
  CircuitEvent,
  CircuitTransitionReason,
  FailureContainmentSnapshot,
  KillSwitchCommand,
  KillSwitchTransitionReason,
  RecoveryGate,
} from './types.js';

export interface DurableContainmentStoredState {
  readonly circuit: Readonly<{
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    consecutiveFailures: number;
    openedAt?: Rfc3339Timestamp;
  }>;
  readonly killSwitch: FailureContainmentSnapshot['killSwitch'];
  readonly dependencyHealth: FailureContainmentSnapshot['dependencyHealth'];
  readonly cancellationRequested: boolean;
  readonly currentInFlight: number;
  readonly maxInFlight: number;
  readonly retryDepth: number;
  readonly maxRetryDepth: number;
}

export interface DurableContainmentCompareAndSetRequest {
  readonly tenantId: TenantId;
  readonly circuitKey: string;
  readonly expectedVersion: number;
  readonly state: DurableContainmentStoredState;
  readonly updatedAt: Rfc3339Timestamp;
  readonly authorizesExecution: false;
}

export type DurableContainmentCompareAndSetResult =
  | Readonly<{
      ok: true;
      disposition: 'UPDATED';
      version: number;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>
  | Readonly<{
      ok: false;
      code: 'VERSION_CONFLICT' | 'NOT_FOUND' | 'MALFORMED' | 'UNAVAILABLE';
      currentVersion?: number;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>;

export interface DurableContainmentWritePort {
  compareAndSet(
    input: DurableContainmentCompareAndSetRequest,
  ): DurableContainmentCompareAndSetResult;
}

export type DurableCircuitTransitionResult =
  | Readonly<{
      ok: true;
      disposition: 'STATE_UPDATED' | 'HALF_OPEN_PROBE_RESERVED';
      version: number;
      circuit: FailureContainmentSnapshot['circuit'];
      probeLeaseCleanupRequired: boolean;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>
  | Readonly<{
      ok: false;
      code: 'STATE_UNAVAILABLE' | 'TRANSITION_REJECTED' | 'PROBE_FENCE_REJECTED' | 'STATE_CONFLICT';
      reasons?: readonly CircuitTransitionReason[];
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>;

export type DurableKillSwitchTransitionResult =
  | Readonly<{
      ok: true;
      version: number;
      killSwitch: FailureContainmentSnapshot['killSwitch'];
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>
  | Readonly<{
      ok: false;
      code: 'STATE_UNAVAILABLE' | 'TRANSITION_REJECTED' | 'STATE_CONFLICT';
      reasons?: readonly KillSwitchTransitionReason[];
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>;

function circuitFailure(
  code: Extract<DurableCircuitTransitionResult, { ok: false }>['code'],
  reasons?: readonly CircuitTransitionReason[],
): DurableCircuitTransitionResult {
  return {
    ok: false,
    code,
    ...(reasons === undefined ? {} : { reasons }),
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

function killFailure(
  code: Extract<DurableKillSwitchTransitionResult, { ok: false }>['code'],
  reasons?: readonly KillSwitchTransitionReason[],
): DurableKillSwitchTransitionResult {
  return {
    ok: false,
    code,
    ...(reasons === undefined ? {} : { reasons }),
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

function storedState(
  snapshot: FailureContainmentSnapshot,
  circuit: FailureContainmentSnapshot['circuit'] = snapshot.circuit,
): DurableContainmentStoredState {
  return {
    circuit: {
      state: circuit.state,
      consecutiveFailures: circuit.consecutiveFailures,
      ...(circuit.openedAt === undefined ? {} : { openedAt: circuit.openedAt }),
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

function readCurrent(input: {
  readonly tenantId: TenantId;
  readonly circuitKey: string;
  readonly observedAt: Rfc3339Timestamp;
  readonly source: DurableContainmentStateSource;
}) {
  const resolved = resolveDurableContainmentState(
    {
      tenantId: input.tenantId,
      circuitKey: input.circuitKey,
      evaluatedAt: input.observedAt,
    },
    input.source,
  );
  return resolved.status === 'RESOLVED' ? resolved.record : null;
}

/**
 * Runs the accepted W07-G circuit state machine before any durable write.
 *
 * HALF_OPEN probe ownership is fenced by the separate W03 lease port. The containment table stores
 * only circuit state/counts; it never duplicates the probe owner. A failed CAS never grants retry.
 */
export function transitionDurableCircuit(input: {
  readonly tenantId: TenantId;
  readonly circuitKey: string;
  readonly observedAt: Rfc3339Timestamp;
  readonly event: CircuitEvent;
  readonly failureThreshold: number;
  readonly recoveryAfterMs: number;
  readonly probeActionIntentId?: ActionIntent['actionIntentId'];
  readonly probeLeaseExpiresAt?: Rfc3339Timestamp;
  readonly source: DurableContainmentStateSource;
  readonly store: DurableContainmentWritePort;
  readonly probeFence?: DurableHalfOpenProbePort;
}): DurableCircuitTransitionResult {
  const current = readCurrent(input);
  if (current === null) return circuitFailure('STATE_UNAVAILABLE');

  const transition = transitionCircuit({
    snapshot: current.snapshot.circuit,
    event: input.event,
    observedAt: input.observedAt,
    failureThreshold: input.failureThreshold,
    recoveryAfterMs: input.recoveryAfterMs,
    ...(input.probeActionIntentId === undefined
      ? {}
      : { probeActionIntentId: input.probeActionIntentId }),
  });
  if (!transition.accepted) return circuitFailure('TRANSITION_REJECTED', transition.reasons);

  if (input.event === 'HALF_OPEN_PROBE_STARTED') {
    if (
      input.probeFence === undefined ||
      input.probeActionIntentId === undefined ||
      input.probeLeaseExpiresAt === undefined
    ) {
      return circuitFailure('PROBE_FENCE_REJECTED');
    }
    const fenced = reserveDurableHalfOpenProbe(
      {
        tenantId: input.tenantId,
        circuitKey: input.circuitKey,
        probeActionIntentId: input.probeActionIntentId,
        observedAt: input.observedAt,
        leaseExpiresAt: input.probeLeaseExpiresAt,
        authorizesExecution: false,
      },
      input.probeFence,
    );
    if (!fenced.ok) return circuitFailure('PROBE_FENCE_REJECTED');
    return {
      ok: true,
      disposition: 'HALF_OPEN_PROBE_RESERVED',
      version: current.version,
      circuit: transition.snapshot,
      probeLeaseCleanupRequired: false,
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    };
  }

  const write = input.store.compareAndSet({
    tenantId: input.tenantId,
    circuitKey: input.circuitKey,
    expectedVersion: current.version,
    state: storedState(current.snapshot, transition.snapshot),
    updatedAt: input.observedAt,
    authorizesExecution: false,
  });
  if (!write.ok) return circuitFailure('STATE_CONFLICT');

  let probeLeaseCleanupRequired = false;
  if (
    current.snapshot.circuit.state === 'HALF_OPEN' &&
    current.snapshot.circuit.halfOpenProbeInFlight &&
    current.snapshot.circuit.halfOpenProbeActionIntentId !== undefined &&
    (input.event === 'SUCCESS' || input.event === 'FAILURE')
  ) {
    if (input.probeFence === undefined) {
      probeLeaseCleanupRequired = true;
    } else {
      const released = releaseDurableHalfOpenProbe(
        {
          tenantId: input.tenantId,
          circuitKey: input.circuitKey,
          probeActionIntentId: current.snapshot.circuit.halfOpenProbeActionIntentId,
          observedAt: input.observedAt,
          authorizesExecution: false,
        },
        input.probeFence,
      );
      probeLeaseCleanupRequired = !released.ok;
    }
  }

  return {
    ok: true,
    disposition: 'STATE_UPDATED',
    version: write.version,
    circuit: transition.snapshot,
    probeLeaseCleanupRequired,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

/** Executes the canonical W07-G kill-switch transition, then persists it by optimistic CAS. */
export function transitionDurableKillSwitch(input: {
  readonly tenantId: TenantId;
  readonly circuitKey: string;
  readonly changedAt: Rfc3339Timestamp;
  readonly command: KillSwitchCommand;
  readonly recoveryGate: RecoveryGate;
  readonly source: DurableContainmentStateSource;
  readonly store: DurableContainmentWritePort;
}): DurableKillSwitchTransitionResult {
  const current = readCurrent({
    tenantId: input.tenantId,
    circuitKey: input.circuitKey,
    observedAt: input.changedAt,
    source: input.source,
  });
  if (current === null) return killFailure('STATE_UNAVAILABLE');

  const transition = transitionKillSwitch({
    snapshot: current.snapshot.killSwitch,
    command: input.command,
    changedAt: input.changedAt,
    recoveryGate: input.recoveryGate,
  });
  if (!transition.accepted) return killFailure('TRANSITION_REJECTED', transition.reasons);

  const write = input.store.compareAndSet({
    tenantId: input.tenantId,
    circuitKey: input.circuitKey,
    expectedVersion: current.version,
    state: {
      ...storedState(current.snapshot),
      killSwitch: transition.snapshot,
    },
    updatedAt: input.changedAt,
    authorizesExecution: false,
  });
  if (!write.ok) return killFailure('STATE_CONFLICT');

  return {
    ok: true,
    version: write.version,
    killSwitch: transition.snapshot,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}
