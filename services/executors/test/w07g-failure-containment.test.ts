// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { ContractVersion } from '@aurora/contracts/versioning';

import {
  evaluateFailureContainment,
  transitionCircuit,
  transitionKillSwitch,
} from '../src/failure-containment/index.js';
import type {
  CircuitSnapshot,
  FailureContainmentSnapshot,
  KillSwitchSnapshot,
} from '../src/failure-containment/index.js';

const version = '1.0.0' as ContractVersion;
const at = (value: string) => value as Rfc3339Timestamp;

const actionIntent = {
  kind: 'ACTION_INTENT',
  schemaVersion: version,
  actionIntentId: 'action-intent:containment',
  capability: { capability: 'social.publish', actionType: 'PUBLISH' },
  tenant: { tenantId: 'tenant:alpha' },
  actor: { kind: 'HUMAN', identityId: 'identity:operator' },
  requestOrigin: { kind: 'HUMAN', identityId: 'identity:operator' },
  correlation: { correlationId: 'correlation:containment' },
  resolvedParameters: {},
  idempotency: { mode: 'REQUIRED', key: 'idem:containment' },
  preconditions: [],
  deadlineAt: at('2026-09-01T20:00:00Z'),
  authority: { kind: 'POLICY_TOKEN', policyTokenId: 'policy-token:containment' },
  dataClassification: 'INTERNAL',
} as unknown as ActionIntent;

function circuit(overrides: Partial<CircuitSnapshot> = {}): CircuitSnapshot {
  return {
    state: 'CLOSED',
    consecutiveFailures: 0,
    halfOpenProbeInFlight: false,
    ...overrides,
  };
}

function killSwitch(overrides: Partial<KillSwitchSnapshot> = {}): KillSwitchSnapshot {
  return {
    state: 'INACTIVE',
    changedAt: at('2026-09-01T17:00:00Z'),
    ...overrides,
  };
}

function snapshot(overrides: Partial<FailureContainmentSnapshot> = {}): FailureContainmentSnapshot {
  return {
    circuit: circuit(),
    killSwitch: killSwitch(),
    dependencyHealth: 'HEALTHY',
    cancellationRequested: false,
    currentInFlight: 0,
    maxInFlight: 4,
    retryDepth: 0,
    maxRetryDepth: 3,
    ...overrides,
  };
}

test('healthy containment passes only to other guards and never grants authority', () => {
  const result = evaluateFailureContainment({
    schemaVersion: version,
    actionIntent,
    evaluatedAt: at('2026-09-01T18:00:00Z'),
    phase: 'PRE_EXTERNAL',
    snapshot: snapshot(),
  });
  assert.equal(result.mayProceedToOtherGuards, true);
  assert.equal(result.degradedMode, false);
  assert.equal(result.authorizesExecution, false);
  assert.deepEqual(result.reasons, []);
});

test('kill switch cannot be bypassed by FAST lane, confidence, urgency or router request', () => {
  const result = evaluateFailureContainment({
    schemaVersion: version,
    actionIntent,
    evaluatedAt: at('2026-09-01T18:00:00Z'),
    phase: 'PRE_EXTERNAL',
    snapshot: snapshot({ killSwitch: killSwitch({ state: 'ACTIVE' }) }),
    nonAuthoritativeSignals: {
      lane: 'FAST',
      confidence: 1,
      urgency: 1,
      routerOverrideRequested: true,
    },
  });
  assert.equal(result.mayProceedToOtherGuards, false);
  assert.deepEqual(result.reasons, ['KILL_SWITCH_ACTIVE']);
  assert.equal(result.authorizesExecution, false);
});

test('queued cancellation stops before external invocation', () => {
  const result = evaluateFailureContainment({
    schemaVersion: version,
    actionIntent,
    evaluatedAt: at('2026-09-01T18:00:00Z'),
    phase: 'QUEUED',
    snapshot: snapshot({ cancellationRequested: true }),
  });
  assert.equal(result.mayProceedToOtherGuards, false);
  assert.equal(result.cancellationDisposition, 'STOP_BEFORE_EXTERNAL');
  assert.equal(result.requiresReconciliationHandoff, false);
  assert.deepEqual(result.reasons, ['CANCELLATION_REQUESTED']);
});

test('in-flight cancellation requires reconciliation instead of claiming cancellation success', () => {
  const result = evaluateFailureContainment({
    schemaVersion: version,
    actionIntent,
    evaluatedAt: at('2026-09-01T18:00:00Z'),
    phase: 'IN_FLIGHT',
    snapshot: snapshot({ cancellationRequested: true }),
  });
  assert.equal(result.cancellationDisposition, 'RECONCILE_IN_FLIGHT');
  assert.equal(result.requiresReconciliationHandoff, true);
  assert.equal(result.mayProceedToOtherGuards, false);
  assert.deepEqual(result.reasons, [
    'CANCELLATION_REQUESTED',
    'IN_FLIGHT_CANCELLATION_REQUIRES_RECONCILIATION',
  ]);
});

test('overload, unavailable dependency and retry-depth limit block cascading execution', () => {
  const result = evaluateFailureContainment({
    schemaVersion: version,
    actionIntent,
    evaluatedAt: at('2026-09-01T18:00:00Z'),
    phase: 'PRE_EXTERNAL',
    snapshot: snapshot({
      dependencyHealth: 'UNAVAILABLE',
      currentInFlight: 4,
      retryDepth: 3,
    }),
  });
  assert.equal(result.mayProceedToOtherGuards, false);
  assert.deepEqual(result.reasons, [
    'CASCADING_RETRY_LIMIT_REACHED',
    'DEPENDENCY_UNAVAILABLE',
    'OVERLOAD_LIMIT_REACHED',
  ]);
});

test('degraded dependency remains explicit without becoming authority', () => {
  const result = evaluateFailureContainment({
    schemaVersion: version,
    actionIntent,
    evaluatedAt: at('2026-09-01T18:00:00Z'),
    phase: 'PRE_EXTERNAL',
    snapshot: snapshot({ dependencyHealth: 'DEGRADED' }),
  });
  assert.equal(result.degradedMode, true);
  assert.equal(result.mayProceedToOtherGuards, true);
  assert.equal(result.authorizesExecution, false);
});

test('circuit opens exactly at the configured consecutive failure threshold', () => {
  const first = transitionCircuit({
    snapshot: circuit(),
    event: 'FAILURE',
    observedAt: at('2026-09-01T18:00:00Z'),
    failureThreshold: 2,
    recoveryAfterMs: 1000,
  });
  assert.equal(first.accepted, true);
  assert.equal(first.snapshot.state, 'CLOSED');
  assert.equal(first.snapshot.consecutiveFailures, 1);

  const second = transitionCircuit({
    snapshot: first.snapshot,
    event: 'FAILURE',
    observedAt: at('2026-09-01T18:00:01Z'),
    failureThreshold: 2,
    recoveryAfterMs: 1000,
  });
  assert.equal(second.snapshot.state, 'OPEN');
  assert.equal(second.snapshot.openedAt, at('2026-09-01T18:00:01Z'));
  assert.equal(second.authorizesExecution, false);
});

test('open circuit cannot recover before window and becomes HALF_OPEN after window', () => {
  const open = circuit({
    state: 'OPEN',
    consecutiveFailures: 3,
    openedAt: at('2026-09-01T18:00:00Z'),
  });
  const early = transitionCircuit({
    snapshot: open,
    event: 'RECOVERY_WINDOW_ELAPSED',
    observedAt: at('2026-09-01T18:00:00.500Z'),
    failureThreshold: 2,
    recoveryAfterMs: 1000,
  });
  const ready = transitionCircuit({
    snapshot: open,
    event: 'RECOVERY_WINDOW_ELAPSED',
    observedAt: at('2026-09-01T18:00:01Z'),
    failureThreshold: 2,
    recoveryAfterMs: 1000,
  });
  assert.equal(early.accepted, false);
  assert.deepEqual(early.reasons, ['RECOVERY_WINDOW_NOT_ELAPSED']);
  assert.equal(ready.accepted, true);
  assert.equal(ready.snapshot.state, 'HALF_OPEN');
});

test('HALF_OPEN permits one fenced probe and blocks another concurrent probe', () => {
  const halfOpen = circuit({ state: 'HALF_OPEN', consecutiveFailures: 2 });
  const started = transitionCircuit({
    snapshot: halfOpen,
    event: 'HALF_OPEN_PROBE_STARTED',
    observedAt: at('2026-09-01T18:00:02Z'),
    failureThreshold: 2,
    recoveryAfterMs: 1000,
  });
  const duplicate = transitionCircuit({
    snapshot: started.snapshot,
    event: 'HALF_OPEN_PROBE_STARTED',
    observedAt: at('2026-09-01T18:00:02.100Z'),
    failureThreshold: 2,
    recoveryAfterMs: 1000,
  });
  assert.equal(started.accepted, true);
  assert.equal(started.snapshot.halfOpenProbeInFlight, true);
  assert.equal(duplicate.accepted, false);
  assert.deepEqual(duplicate.reasons, ['HALF_OPEN_PROBE_ALREADY_IN_FLIGHT']);

  const gate = evaluateFailureContainment({
    schemaVersion: version,
    actionIntent,
    evaluatedAt: at('2026-09-01T18:00:02.200Z'),
    phase: 'PRE_EXTERNAL',
    snapshot: snapshot({ circuit: started.snapshot }),
  });
  assert.equal(gate.mayProceedToOtherGuards, false);
  assert.deepEqual(gate.reasons, ['HALF_OPEN_PROBE_IN_FLIGHT']);
});

test('HALF_OPEN success closes circuit and failure reopens it', () => {
  const halfOpen = circuit({
    state: 'HALF_OPEN',
    consecutiveFailures: 2,
    halfOpenProbeInFlight: true,
  });
  const success = transitionCircuit({
    snapshot: halfOpen,
    event: 'SUCCESS',
    observedAt: at('2026-09-01T18:00:03Z'),
    failureThreshold: 2,
    recoveryAfterMs: 1000,
  });
  const failure = transitionCircuit({
    snapshot: halfOpen,
    event: 'FAILURE',
    observedAt: at('2026-09-01T18:00:03Z'),
    failureThreshold: 2,
    recoveryAfterMs: 1000,
  });
  assert.equal(success.snapshot.state, 'CLOSED');
  assert.equal(success.snapshot.consecutiveFailures, 0);
  assert.equal(failure.snapshot.state, 'OPEN');
  assert.equal(failure.snapshot.consecutiveFailures, 3);
});

test('kill switch activation is fail-safe and deactivation requires governed recovery validation', () => {
  const initial = killSwitch();
  const activated = transitionKillSwitch({
    snapshot: initial,
    command: 'ACTIVATE',
    changedAt: at('2026-09-01T18:00:00Z'),
    recoveryGate: 'NOT_REQUIRED',
  });
  assert.equal(activated.accepted, true);
  assert.equal(activated.snapshot.state, 'ACTIVE');

  const rejected = transitionKillSwitch({
    snapshot: activated.snapshot,
    command: 'DEACTIVATE',
    changedAt: at('2026-09-01T18:01:00Z'),
    recoveryGate: 'NOT_VALIDATED',
  });
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.snapshot.state, 'ACTIVE');
  assert.deepEqual(rejected.reasons, ['KILL_SWITCH_RECOVERY_NOT_VALIDATED']);

  const recovered = transitionKillSwitch({
    snapshot: activated.snapshot,
    command: 'DEACTIVATE',
    changedAt: at('2026-09-01T18:02:00Z'),
    recoveryGate: 'VALIDATED',
  });
  assert.equal(recovered.accepted, true);
  assert.equal(recovered.snapshot.state, 'INACTIVE');
  assert.equal(recovered.authorizesExecution, false);
});

test('invalid containment config and timestamp fail closed', () => {
  const gate = evaluateFailureContainment({
    schemaVersion: version,
    actionIntent,
    evaluatedAt: at('not-a-time'),
    phase: 'PRE_EXTERNAL',
    snapshot: snapshot({ maxInFlight: 0 }),
  });
  assert.equal(gate.mayProceedToOtherGuards, false);
  assert.deepEqual(gate.reasons, ['INVALID_CONTAINMENT_CONFIG', 'INVALID_TIME']);

  const transition = transitionCircuit({
    snapshot: circuit(),
    event: 'FAILURE',
    observedAt: at('2026-09-01T18:00:00Z'),
    failureThreshold: 0,
    recoveryAfterMs: -1,
  });
  assert.equal(transition.accepted, false);
  assert.deepEqual(transition.reasons, ['INVALID_CIRCUIT_CONFIG']);
});
