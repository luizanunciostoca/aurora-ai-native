// @ts-expect-error -- executor tests target Node 22 without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor tests target Node 22 without repository-wide @types/node.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { TenantId } from '@aurora/contracts/ids';
import type { ContractVersion } from '@aurora/contracts/versioning';

import { W07DurableContainmentLifecycleCoordinator } from '../src/failure-containment/durable-containment-lifecycle.js';
import type {
  DurableContainmentStateLookup,
  DurableContainmentStateRecord,
  DurableContainmentStateSource,
} from '../src/failure-containment/durable-containment-state.js';
import type {
  DurableContainmentCompareAndSetRequest,
  DurableContainmentCompareAndSetResult,
  DurableContainmentStoredState,
  DurableContainmentWritePort,
} from '../src/failure-containment/durable-containment-transitions.js';
import type {
  DurableHalfOpenProbePort,
  DurableHalfOpenProbePortResult,
  DurableHalfOpenProbeReleaseRequest,
  DurableHalfOpenProbeRequest,
} from '../src/failure-containment/durable-half-open-probe.js';
import type { ReconciliationResult } from '../src/reconciliation/types.js';

const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId;
const CIRCUIT = 'device:camera:local';
const PROBE = 'act_01ARZ3NDEKTSV4RRFFQ69G5FAV' as ActionIntent['actionIntentId'];
const VERSION = '1.0.0' as ContractVersion;

function at(seconds: number): Rfc3339Timestamp {
  return new Date(Date.UTC(2026, 8, 6, 0, 0, seconds)).toISOString() as Rfc3339Timestamp;
}

function bounded(result: {
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
}): void {
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.provesExecutionSuccess, false);
  assert.equal(result.retryAuthorized, false);
}

function reconciliation(
  state: ReconciliationResult['state'],
  overrides: Partial<ReconciliationResult> = {},
): ReconciliationResult {
  const retryEligible = state === 'NO_EFFECT_CONFIRMED_RETRY_ELIGIBLE';
  return {
    kind: 'EXECUTION_RECONCILIATION_RESULT',
    schemaVersion: VERSION,
    actionIntentId: PROBE,
    state,
    reasons: [],
    reconciliationRequired: state === 'STILL_UNCERTAIN',
    retryEligibleAfterFreshGuards: retryEligible,
    ...(retryEligible ? { nextAttemptNumber: 2 } : {}),
    authorizesExecution: false,
    ...overrides,
  };
}

class StatefulContainmentOwner
  implements DurableContainmentStateSource, DurableContainmentWritePort, DurableHalfOpenProbePort
{
  record: DurableContainmentStateRecord = {
    tenantId: TENANT,
    circuitKey: CIRCUIT,
    version: 1,
    updatedAt: at(0),
    snapshot: {
      circuit: { state: 'CLOSED', consecutiveFailures: 0, halfOpenProbeInFlight: false },
      killSwitch: { state: 'INACTIVE', changedAt: at(0) },
      dependencyHealth: 'HEALTHY',
      cancellationRequested: false,
      currentInFlight: 0,
      maxInFlight: 2,
      retryDepth: 0,
      maxRetryDepth: 2,
    },
    authorizesExecution: false,
  };
  probeOwner: ActionIntent['actionIntentId'] | null = null;
  probeExpiry: Rfc3339Timestamp | null = null;
  releaseCalls = 0;
  forceConflict = false;
  throwOnWrite = false;

  resolveCurrent(lookup: DurableContainmentStateLookup): DurableContainmentStateRecord | null {
    if (lookup.tenantId !== TENANT || lookup.circuitKey !== CIRCUIT) return null;
    const probeOwner = this.probeOwner;
    const probeActive = this.record.snapshot.circuit.state === 'HALF_OPEN' && probeOwner !== null;
    return {
      ...this.record,
      snapshot: {
        ...this.record.snapshot,
        circuit: {
          ...this.record.snapshot.circuit,
          halfOpenProbeInFlight: probeActive,
          ...(probeActive && probeOwner !== null
            ? { halfOpenProbeActionIntentId: probeOwner }
            : {}),
        },
      },
    };
  }

  compareAndSet(
    input: DurableContainmentCompareAndSetRequest,
  ): DurableContainmentCompareAndSetResult {
    if (this.throwOnWrite) throw new Error('postgres unavailable');
    if (this.forceConflict || input.expectedVersion !== this.record.version) {
      return {
        ok: false,
        code: 'VERSION_CONFLICT',
        currentVersion: this.record.version,
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      };
    }
    this.record = {
      tenantId: TENANT,
      circuitKey: CIRCUIT,
      version: this.record.version + 1,
      updatedAt: input.updatedAt,
      snapshot: this.snapshot(input.state),
      authorizesExecution: false,
    };
    return {
      ok: true,
      disposition: 'UPDATED',
      version: this.record.version,
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    };
  }

  reserve(input: DurableHalfOpenProbeRequest): DurableHalfOpenProbePortResult {
    if (this.probeOwner !== null && this.probeOwner !== input.probeActionIntentId) {
      return this.probeFailure('OWNED_BY_OTHER');
    }
    const disposition = this.probeOwner === null ? 'ACQUIRED' : 'ALREADY_OWNED';
    this.probeOwner = input.probeActionIntentId;
    this.probeExpiry = input.leaseExpiresAt;
    return this.probeSuccess(disposition, input);
  }

  heartbeat(input: DurableHalfOpenProbeRequest): DurableHalfOpenProbePortResult {
    if (this.probeOwner !== input.probeActionIntentId) {
      return this.probeFailure('NOT_CURRENT_OWNER');
    }
    this.probeExpiry = input.leaseExpiresAt;
    return this.probeSuccess('RENEWED', input);
  }

  release(input: DurableHalfOpenProbeReleaseRequest): DurableHalfOpenProbePortResult {
    if (this.probeOwner !== input.probeActionIntentId) {
      return this.probeFailure('NOT_CURRENT_OWNER');
    }
    this.probeOwner = null;
    this.probeExpiry = null;
    this.releaseCalls += 1;
    return {
      ok: true,
      disposition: 'RELEASED',
      circuitKey: input.circuitKey,
      probeActionIntentId: input.probeActionIntentId,
      leaseReference: `w03-lease:w07g:half-open:${input.circuitKey}`,
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    };
  }

  private snapshot(
    state: DurableContainmentStoredState,
  ): DurableContainmentStateRecord['snapshot'] {
    return {
      circuit: {
        ...state.circuit,
        halfOpenProbeInFlight: false,
      },
      killSwitch: state.killSwitch,
      dependencyHealth: state.dependencyHealth,
      cancellationRequested: state.cancellationRequested,
      currentInFlight: state.currentInFlight,
      maxInFlight: state.maxInFlight,
      retryDepth: state.retryDepth,
      maxRetryDepth: state.maxRetryDepth,
    };
  }

  private probeFailure(
    code: 'OWNED_BY_OTHER' | 'NOT_CURRENT_OWNER',
  ): DurableHalfOpenProbePortResult {
    return {
      ok: false,
      code,
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    };
  }

  private probeSuccess(
    disposition: 'ACQUIRED' | 'ALREADY_OWNED' | 'RENEWED',
    input: DurableHalfOpenProbeRequest,
  ): DurableHalfOpenProbePortResult {
    return {
      ok: true,
      disposition,
      circuitKey: input.circuitKey,
      probeActionIntentId: input.probeActionIntentId,
      leaseReference: `w03-lease:w07g:half-open:${input.circuitKey}`,
      expiresAt: input.leaseExpiresAt,
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    };
  }
}

test('coordinates CLOSED failures, recovery, one HALF_OPEN probe and successful cleanup', () => {
  const owner = new StatefulContainmentOwner();
  const lifecycle = new W07DurableContainmentLifecycleCoordinator({
    source: owner,
    store: owner,
    halfOpenProbeFence: owner,
  });
  const common = {
    tenantId: TENANT,
    circuitKey: CIRCUIT,
    failureThreshold: 2,
    recoveryAfterMs: 60_000,
  };

  const firstFailure = lifecycle.transitionCircuit({
    ...common,
    observedAt: at(1),
    event: 'FAILURE',
  });
  assert.equal(firstFailure.ok, true);
  bounded(firstFailure);
  assert.equal(owner.record.snapshot.circuit.state, 'CLOSED');
  assert.equal(owner.record.snapshot.circuit.consecutiveFailures, 1);

  const secondFailure = lifecycle.transitionCircuit({
    ...common,
    observedAt: at(2),
    event: 'FAILURE',
  });
  assert.equal(secondFailure.ok, true);
  bounded(secondFailure);
  assert.equal(owner.record.snapshot.circuit.state, 'OPEN');

  const recovery = lifecycle.transitionCircuit({
    ...common,
    observedAt: at(62),
    event: 'RECOVERY_WINDOW_ELAPSED',
  });
  assert.equal(recovery.ok, true);
  bounded(recovery);
  assert.equal(owner.record.snapshot.circuit.state, 'HALF_OPEN');

  const reserved = lifecycle.transitionCircuit({
    ...common,
    observedAt: at(63),
    event: 'HALF_OPEN_PROBE_STARTED',
    probeActionIntentId: PROBE,
    probeLeaseExpiresAt: at(93),
  });
  assert.equal(reserved.ok, true);
  if (!reserved.ok) throw new Error('probe must be reserved');
  assert.equal(reserved.disposition, 'HALF_OPEN_PROBE_RESERVED');
  bounded(reserved);
  assert.equal(owner.probeOwner, PROBE);

  const success = lifecycle.transitionCircuit({
    ...common,
    observedAt: at(64),
    event: 'SUCCESS',
    probeActionIntentId: PROBE,
  });
  assert.equal(success.ok, true);
  bounded(success);
  assert.equal(owner.record.snapshot.circuit.state, 'CLOSED');
  assert.equal(owner.releaseCalls, 1);
  assert.equal(owner.probeOwner, null);
});

test('kill switch deactivation requires validated recovery and all outcomes remain non-authoritative', () => {
  const owner = new StatefulContainmentOwner();
  const lifecycle = new W07DurableContainmentLifecycleCoordinator({
    source: owner,
    store: owner,
    halfOpenProbeFence: owner,
  });

  const activated = lifecycle.transitionKillSwitch({
    tenantId: TENANT,
    circuitKey: CIRCUIT,
    changedAt: at(1),
    command: 'ACTIVATE',
    recoveryGate: 'NOT_REQUIRED',
  });
  assert.equal(activated.ok, true);
  bounded(activated);
  assert.equal(owner.record.snapshot.killSwitch.state, 'ACTIVE');

  const rejected = lifecycle.transitionKillSwitch({
    tenantId: TENANT,
    circuitKey: CIRCUIT,
    changedAt: at(2),
    command: 'DEACTIVATE',
    recoveryGate: 'NOT_VALIDATED',
  });
  assert.equal(rejected.ok, false);
  bounded(rejected);
  assert.equal(owner.record.snapshot.killSwitch.state, 'ACTIVE');

  const deactivated = lifecycle.transitionKillSwitch({
    tenantId: TENANT,
    circuitKey: CIRCUIT,
    changedAt: at(3),
    command: 'DEACTIVATE',
    recoveryGate: 'VALIDATED',
  });
  assert.equal(deactivated.ok, true);
  bounded(deactivated);
  assert.equal(owner.record.snapshot.killSwitch.state, 'INACTIVE');
});

test('source outage, CAS conflict and writer outage fail closed without retry authority', () => {
  const owner = new StatefulContainmentOwner();
  const lifecycle = new W07DurableContainmentLifecycleCoordinator({
    source: owner,
    store: owner,
    halfOpenProbeFence: owner,
  });

  owner.forceConflict = true;
  const conflict = lifecycle.transitionCircuit({
    tenantId: TENANT,
    circuitKey: CIRCUIT,
    observedAt: at(1),
    event: 'FAILURE',
    failureThreshold: 2,
    recoveryAfterMs: 60_000,
  });
  assert.equal(conflict.ok, false);
  if (conflict.ok) throw new Error('CAS conflict must fail');
  assert.equal(conflict.code, 'STATE_CONFLICT');
  bounded(conflict);

  owner.forceConflict = false;
  owner.throwOnWrite = true;
  const writerOutage = lifecycle.transitionCircuit({
    tenantId: TENANT,
    circuitKey: CIRCUIT,
    observedAt: at(2),
    event: 'FAILURE',
    failureThreshold: 2,
    recoveryAfterMs: 60_000,
  });
  assert.equal(writerOutage.ok, false);
  if (writerOutage.ok) throw new Error('writer outage must fail');
  assert.equal(writerOutage.code, 'STATE_UNAVAILABLE');
  bounded(writerOutage);

  const unavailable = new W07DurableContainmentLifecycleCoordinator({
    source: {
      resolveCurrent: () => {
        throw new Error('read outage');
      },
    },
    store: owner,
    halfOpenProbeFence: owner,
  }).transitionKillSwitch({
    tenantId: TENANT,
    circuitKey: CIRCUIT,
    changedAt: at(3),
    command: 'ACTIVATE',
    recoveryGate: 'NOT_REQUIRED',
  });
  assert.equal(unavailable.ok, false);
  if (unavailable.ok) throw new Error('source outage must fail');
  assert.equal(unavailable.code, 'STATE_UNAVAILABLE');
  bounded(unavailable);
});

test('operational cancellation clearing requires an explicit completed reconciliation gate', () => {
  const owner = new StatefulContainmentOwner();
  const lifecycle = new W07DurableContainmentLifecycleCoordinator({
    source: owner,
    store: owner,
    halfOpenProbeFence: owner,
  });
  const common = {
    tenantId: TENANT,
    circuitKey: CIRCUIT,
    authorizesExecution: false as const,
  };

  const requested = lifecycle.transitionOperational({
    ...common,
    observedAt: at(1),
    command: 'REQUEST_CANCELLATION',
  });
  assert.equal(requested.ok, true);
  bounded(requested);
  assert.equal(owner.record.snapshot.cancellationRequested, true);

  const rejected = lifecycle.transitionOperational({
    ...common,
    observedAt: at(2),
    command: 'CLEAR_CANCELLATION',
    reconciliationGate: 'NOT_COMPLETED',
  });
  assert.equal(rejected.ok, false);
  if (rejected.ok) throw new Error('incomplete reconciliation must reject clearing');
  assert.equal(rejected.code, 'PROOF_REJECTED');
  bounded(rejected);
  assert.equal(owner.record.snapshot.cancellationRequested, true);

  const cleared = lifecycle.transitionOperational({
    ...common,
    observedAt: at(3),
    command: 'CLEAR_CANCELLATION',
    reconciliationGate: 'COMPLETED',
  });
  assert.equal(cleared.ok, true);
  bounded(cleared);
  assert.equal(owner.record.snapshot.cancellationRequested, false);
});

test('operational in-flight transitions reject overflow and underflow', () => {
  const owner = new StatefulContainmentOwner();
  const lifecycle = new W07DurableContainmentLifecycleCoordinator({
    source: owner,
    store: owner,
    halfOpenProbeFence: owner,
  });
  const transition = (command: 'BEGIN_IN_FLIGHT' | 'END_IN_FLIGHT', seconds: number) =>
    lifecycle.transitionOperational({
      tenantId: TENANT,
      circuitKey: CIRCUIT,
      observedAt: at(seconds),
      command,
      authorizesExecution: false,
    });

  assert.equal(transition('BEGIN_IN_FLIGHT', 1).ok, true);
  assert.equal(transition('BEGIN_IN_FLIGHT', 2).ok, true);
  const overflow = transition('BEGIN_IN_FLIGHT', 3);
  assert.equal(overflow.ok, false);
  if (overflow.ok) throw new Error('in-flight overflow must reject');
  assert.equal(overflow.code, 'TRANSITION_REJECTED');
  bounded(overflow);
  assert.equal(owner.record.snapshot.currentInFlight, 2);

  assert.equal(transition('END_IN_FLIGHT', 4).ok, true);
  assert.equal(transition('END_IN_FLIGHT', 5).ok, true);
  const underflow = transition('END_IN_FLIGHT', 6);
  assert.equal(underflow.ok, false);
  if (underflow.ok) throw new Error('in-flight underflow must reject');
  assert.equal(underflow.code, 'TRANSITION_REJECTED');
  bounded(underflow);
  assert.equal(owner.record.snapshot.currentInFlight, 0);
});

test('dependency health changes only from a matching server-side observation', () => {
  const owner = new StatefulContainmentOwner();
  const lifecycle = new W07DurableContainmentLifecycleCoordinator({
    source: owner,
    store: owner,
    halfOpenProbeFence: owner,
  });
  const base = {
    tenantId: TENANT,
    circuitKey: CIRCUIT,
    observedAt: at(1),
    command: 'UPDATE_DEPENDENCY_HEALTH' as const,
    authorizesExecution: false as const,
  };

  const rejected = lifecycle.transitionOperational({
    ...base,
    observation: {
      kind: 'SERVER_DEPENDENCY_HEALTH_OBSERVATION',
      tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAA' as TenantId,
      circuitKey: CIRCUIT,
      observedAt: at(1),
      health: 'UNAVAILABLE',
      authorizesExecution: false,
    },
  });
  assert.equal(rejected.ok, false);
  if (rejected.ok) throw new Error('wrong-tenant observation must reject');
  assert.equal(rejected.code, 'PROOF_REJECTED');
  bounded(rejected);
  assert.equal(owner.record.snapshot.dependencyHealth, 'HEALTHY');

  const updated = lifecycle.transitionOperational({
    ...base,
    observation: {
      kind: 'SERVER_DEPENDENCY_HEALTH_OBSERVATION',
      tenantId: TENANT,
      circuitKey: CIRCUIT,
      observedAt: at(1),
      health: 'UNAVAILABLE',
      authorizesExecution: false,
    },
  });
  assert.equal(updated.ok, true);
  bounded(updated);
  assert.equal(owner.record.snapshot.dependencyHealth, 'UNAVAILABLE');
});

test('retry depth requires bound W07-F eligibility and resets only after terminal reconciliation', () => {
  const owner = new StatefulContainmentOwner();
  const lifecycle = new W07DurableContainmentLifecycleCoordinator({
    source: owner,
    store: owner,
    halfOpenProbeFence: owner,
  });
  const advance = (
    seconds: number,
    expectedRetryDepth: number,
    retryEligibility: ReconciliationResult,
  ) =>
    lifecycle.transitionOperational({
      tenantId: TENANT,
      circuitKey: CIRCUIT,
      observedAt: at(seconds),
      command: 'ADVANCE_RETRY_DEPTH',
      actionIntentId: PROBE,
      expectedRetryDepth,
      retryEligibility,
      authorizesExecution: false,
    });

  const wrongIntent = advance(
    1,
    0,
    reconciliation('NO_EFFECT_CONFIRMED_RETRY_ELIGIBLE', {
      actionIntentId: 'act_01ARZ3NDEKTSV4RRFFQ69G5FAA' as ActionIntent['actionIntentId'],
    }),
  );
  assert.equal(wrongIntent.ok, false);
  if (wrongIntent.ok) throw new Error('unbound W07-F proof must reject');
  assert.equal(wrongIntent.code, 'PROOF_REJECTED');
  bounded(wrongIntent);

  const first = advance(1, 0, reconciliation('NO_EFFECT_CONFIRMED_RETRY_ELIGIBLE'));
  assert.equal(first.ok, true);
  bounded(first);
  assert.equal(owner.record.snapshot.retryDepth, 1);

  const stale = advance(
    2,
    0,
    reconciliation('NO_EFFECT_CONFIRMED_RETRY_ELIGIBLE', { nextAttemptNumber: 3 }),
  );
  assert.equal(stale.ok, false);
  if (stale.ok) throw new Error('stale expected retry depth must conflict');
  assert.equal(stale.code, 'STATE_CONFLICT');
  bounded(stale);

  assert.equal(
    advance(2, 1, reconciliation('NO_EFFECT_CONFIRMED_RETRY_ELIGIBLE', { nextAttemptNumber: 3 }))
      .ok,
    true,
  );
  const limit = advance(
    3,
    2,
    reconciliation('NO_EFFECT_CONFIRMED_RETRY_ELIGIBLE', { nextAttemptNumber: 4 }),
  );
  assert.equal(limit.ok, false);
  if (limit.ok) throw new Error('retry-depth overflow must reject');
  assert.equal(limit.code, 'TRANSITION_REJECTED');
  bounded(limit);

  const nonterminalReset = lifecycle.transitionOperational({
    tenantId: TENANT,
    circuitKey: CIRCUIT,
    observedAt: at(3),
    command: 'RESET_RETRY_DEPTH',
    actionIntentId: PROBE,
    terminalReconciliation: reconciliation('NO_EFFECT_CONFIRMED_RETRY_ELIGIBLE'),
    authorizesExecution: false,
  });
  assert.equal(nonterminalReset.ok, false);
  if (nonterminalReset.ok) throw new Error('retry-eligible reconciliation is not terminal');
  assert.equal(nonterminalReset.code, 'PROOF_REJECTED');
  bounded(nonterminalReset);

  const reset = lifecycle.transitionOperational({
    tenantId: TENANT,
    circuitKey: CIRCUIT,
    observedAt: at(3),
    command: 'RESET_RETRY_DEPTH',
    actionIntentId: PROBE,
    terminalReconciliation: reconciliation('EFFECT_OBSERVED'),
    authorizesExecution: false,
  });
  assert.equal(reset.ok, true);
  bounded(reset);
  assert.equal(owner.record.snapshot.retryDepth, 0);
});

test('operational source outage, CAS conflict and writer outage fail closed', () => {
  const owner = new StatefulContainmentOwner();
  const lifecycle = new W07DurableContainmentLifecycleCoordinator({
    source: owner,
    store: owner,
    halfOpenProbeFence: owner,
  });
  const request = {
    tenantId: TENANT,
    circuitKey: CIRCUIT,
    observedAt: at(1),
    command: 'REQUEST_CANCELLATION' as const,
    authorizesExecution: false as const,
  };

  owner.forceConflict = true;
  const conflict = lifecycle.transitionOperational(request);
  assert.equal(conflict.ok, false);
  if (conflict.ok) throw new Error('CAS conflict must fail');
  assert.equal(conflict.code, 'STATE_CONFLICT');
  bounded(conflict);

  owner.forceConflict = false;
  owner.throwOnWrite = true;
  const writeOutage = lifecycle.transitionOperational(request);
  assert.equal(writeOutage.ok, false);
  if (writeOutage.ok) throw new Error('write outage must fail');
  assert.equal(writeOutage.code, 'STATE_UNAVAILABLE');
  bounded(writeOutage);

  const readOutage = new W07DurableContainmentLifecycleCoordinator({
    source: { resolveCurrent: () => null },
    store: owner,
    halfOpenProbeFence: owner,
  }).transitionOperational(request);
  assert.equal(readOutage.ok, false);
  if (readOutage.ok) throw new Error('missing state must fail');
  assert.equal(readOutage.code, 'STATE_UNAVAILABLE');
  bounded(readOutage);
});
