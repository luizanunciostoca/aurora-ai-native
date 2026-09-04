// @ts-expect-error -- W14 mobile-gateway harness intentionally uses Node 22 built-ins without @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- W14 mobile-gateway harness intentionally uses Node 22 built-ins without @types/node.
import test from 'node:test';

import type { CommandId, CorrelationId, EventId, TenantId } from '@aurora/contracts/ids';

import { ProgressCancellationProjectionManager } from '../manager.js';
import type {
  ProgressCancellationCommandView,
  ProgressCancellationPort,
  ProgressCancellationPortResult,
  ProgressCancellationPortSuccess,
  ProgressCancellationSessionView,
  ProgressObservationVerificationInput,
  ProgressObservationVerificationResult,
  ProgressObservationVerifier,
} from '../types.js';

const NOW = 1_788_510_000_000;
const TENANT_A = 'ten_01JW14CABCDA00000000000000' as TenantId;
const TENANT_B = 'ten_01JW14CABCDB00000000000000' as TenantId;
const CORRELATION_A = 'cor_01JW14CABCDC00000000000000' as CorrelationId;
const CORRELATION_B = 'cor_01JW14CABCDD00000000000000' as CorrelationId;
const COMMAND_A = 'cmd_01JW14CABCDE00000000000000' as CommandId;
const EVENT_1 = 'evt_01JW14CABCDF00000000000000' as EventId;
const EVENT_2 = 'evt_01JW14CABCDG00000000000000' as EventId;
const EVENT_3 = 'evt_01JW14CABCDH00000000000000' as EventId;
const EVENT_4 = 'evt_01JW14CABCDJ00000000000000' as EventId;

class FixtureVerifier implements ProgressObservationVerifier {
  reject = false;
  throwOnVerify = false;

  verify(input: ProgressObservationVerificationInput): ProgressObservationVerificationResult {
    if (this.throwOnVerify) throw new Error('fixture verifier unavailable');
    if (this.reject) {
      return {
        ok: false,
        code: 'SOURCE_BINDING_MISMATCH',
        retryable: false,
        authorizesExecution: false,
      };
    }
    return {
      ok: true,
      verifiedAtMs: input.nowMs,
      sourceRevision: `rev:${input.observationId}`,
      authorizesExecution: false,
    };
  }
}

class FixtureCancellationPort implements ProgressCancellationPort {
  session: ProgressCancellationSessionView = {
    gatewaySessionId: 'session:w14c:alpha',
    gatewayConnectionId: 'connection:w14c:1',
    state: 'OPEN',
    tenantId: TENANT_A,
    correlationId: CORRELATION_A,
    authorizesExecution: false,
    canGrantPermission: false,
  };
  command: ProgressCancellationCommandView = {
    commandId: COMMAND_A,
    correlationId: CORRELATION_A,
    state: 'RUNNING',
    authorizesExecution: false,
    provesExecutionSuccess: false,
    externalStateVerified: false,
  };
  cancellationCalls = 0;
  rejectCancellation = false;

  getSession(): ProgressCancellationPortResult<ProgressCancellationSessionView> {
    return { ok: true, value: this.session, authorizesExecution: false };
  }

  requestCancellation(
    input: unknown,
  ): ProgressCancellationPortResult<ProgressCancellationPortSuccess> {
    this.cancellationCalls += 1;
    if (this.rejectCancellation) {
      return {
        ok: false,
        error: {
          code: 'GATEWAY_CONNECTION_MISMATCH',
          message: 'fixture rejection',
          retryable: false,
        },
        authorizesExecution: false,
      };
    }
    const nowMs = (input as { nowMs: number }).nowMs;
    const alreadyRequested = this.command.cancelRequestedAtMs !== undefined;
    this.command = {
      ...this.command,
      state: 'CANCEL_REQUESTED',
      cancelRequestedAtMs: this.command.cancelRequestedAtMs ?? nowMs,
    };
    return {
      ok: true,
      value: {
        disposition: alreadyRequested ? 'ALREADY_REQUESTED' : 'CANCEL_REQUESTED',
        command: this.command,
      },
      authorizesExecution: false,
    };
  }
}

function observation(
  observationId: EventId,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    observationId,
    source: 'W04_DAG_STATE',
    sourceReference: 'goal-graph:lane-a',
    tenantId: TENANT_A,
    correlationId: CORRELATION_A,
    scope: 'LANE',
    subjectId: 'lane:w14c:a',
    state: 'RUNNING',
    observedAtMs: NOW,
    nowMs: NOW + 1,
    safeSummary: 'Lane processing is in progress.',
    reasonCode: 'WORK_IN_PROGRESS',
    evidenceRefs: ['evd:w14c:1'],
    completedUnits: 2,
    totalUnits: 4,
    ...overrides,
  };
}

function cancellationInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tenantId: TENANT_A,
    correlationId: CORRELATION_A,
    gatewaySessionId: 'session:w14c:alpha',
    gatewayConnectionId: 'connection:w14c:1',
    commandId: COMMAND_A,
    nowMs: NOW + 10,
    ...overrides,
  };
}

function setup(
  config: ConstructorParameters<typeof ProgressCancellationProjectionManager>[2] = {},
) {
  const verifier = new FixtureVerifier();
  const port = new FixtureCancellationPort();
  const manager = new ProgressCancellationProjectionManager(verifier, port, config);
  return { verifier, port, manager };
}

test('records verified safe progress and replays from a reconnect cursor', () => {
  const { manager } = setup();
  const first = manager.recordProgress(observation(EVENT_1));
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.value.frame.sequence, 1);
  assert.equal(first.value.frame.percentComplete, 50);
  assert.equal(first.value.frame.privateReasoningIncluded, false);
  assert.equal(first.value.frame.authorizesExecution, false);
  assert.equal(first.value.stream.sourceOfTruth, 'CANONICAL_UPSTREAM_PROJECTION');

  const second = manager.recordProgress(
    observation(EVENT_2, {
      state: 'WAITING',
      observedAtMs: NOW + 2,
      nowMs: NOW + 3,
      safeSummary: 'Lane is waiting for a canonical upstream dependency.',
      completedUnits: 3,
    }),
  );
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.value.frame.sequence, 2);

  const replay = manager.replayProgress({
    tenantId: TENANT_A,
    correlationId: CORRELATION_A,
    scope: 'LANE',
    subjectId: 'lane:w14c:a',
    afterSequence: 1,
  });
  assert.equal(replay.ok, true);
  if (!replay.ok) return;
  assert.deepEqual(
    replay.value.frames.map((frame) => frame.sequence),
    [2],
  );
  assert.equal(replay.value.latestSequence, 2);
  assert.equal(replay.value.hasMore, false);
  assert.equal(replay.value.authorizesExecution, false);
});

test('deduplicates exact observations and fails closed on conflicting reuse', () => {
  const { manager } = setup();
  const input = observation(EVENT_1);
  const first = manager.recordProgress(input);
  const duplicate = manager.recordProgress({ ...input });
  assert.equal(first.ok, true);
  assert.equal(duplicate.ok, true);
  if (!duplicate.ok) return;
  assert.equal(duplicate.value.disposition, 'DUPLICATE_OBSERVATION');
  assert.equal(duplicate.value.frame.sequence, 1);

  const conflict = manager.recordProgress(
    observation(EVENT_1, { safeSummary: 'Conflicting observation reuse.' }),
  );
  assert.equal(conflict.ok, false);
  if (conflict.ok) return;
  assert.equal(conflict.error.code, 'OBSERVATION_CONFLICT');
});

test('rejects private reasoning, extra fields and unverified canonical sources', () => {
  const { manager, verifier } = setup();
  const privateReasoning = manager.recordProgress(
    observation(EVENT_1, { safeSummary: 'Private reasoning: hidden internal path.' }),
  );
  assert.equal(privateReasoning.ok, false);
  if (!privateReasoning.ok) assert.equal(privateReasoning.error.code, 'MALFORMED_REQUEST');

  const extraField = manager.recordProgress(
    observation(EVENT_2, { chainOfThought: 'must never cross the gateway' }),
  );
  assert.equal(extraField.ok, false);
  if (!extraField.ok) assert.equal(extraField.error.code, 'MALFORMED_REQUEST');

  verifier.reject = true;
  const rejected = manager.recordProgress(observation(EVENT_3));
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.equal(rejected.error.code, 'SOURCE_REJECTED');
    assert.equal(rejected.authorizesExecution, false);
    assert.equal(rejected.retryAuthorized, false);
  }
});

test('fails closed when canonical source verification is unavailable', () => {
  const { manager, verifier } = setup();
  verifier.throwOnVerify = true;
  const result = manager.recordProgress(observation(EVENT_1));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'SOURCE_REJECTED');
    assert.equal(result.error.retryable, true);
    assert.equal(result.retryAuthorized, false);
  }
});

test('bounds replay history and reports expired reconnect cursors instead of skipping data', () => {
  const { manager } = setup({ maxHistoryPerStream: 2, maxRememberedObservationsPerStream: 4 });
  for (const [index, eventId] of [EVENT_1, EVENT_2, EVENT_3].entries()) {
    const result = manager.recordProgress(
      observation(eventId, {
        observedAtMs: NOW + index,
        nowMs: NOW + index + 1,
        safeSummary: `Progress frame ${index + 1}.`,
      }),
    );
    assert.equal(result.ok, true);
  }

  const expired = manager.replayProgress({
    tenantId: TENANT_A,
    correlationId: CORRELATION_A,
    scope: 'LANE',
    subjectId: 'lane:w14c:a',
    afterSequence: 0,
  });
  assert.equal(expired.ok, false);
  if (!expired.ok) assert.equal(expired.error.code, 'REPLAY_CURSOR_EXPIRED');

  const replay = manager.replayProgress({
    tenantId: TENANT_A,
    correlationId: CORRELATION_A,
    scope: 'LANE',
    subjectId: 'lane:w14c:a',
    afterSequence: 1,
    limit: 1,
  });
  assert.equal(replay.ok, true);
  if (!replay.ok) return;
  assert.deepEqual(
    replay.value.frames.map((frame) => frame.sequence),
    [2],
  );
  assert.equal(replay.value.hasMore, true);
});

test('revalidates tenant correlation and connection before cancellation', () => {
  const { manager, port } = setup();
  const wrongTenant = manager.requestCancellation(cancellationInput({ tenantId: TENANT_B }));
  assert.equal(wrongTenant.ok, false);
  if (!wrongTenant.ok) assert.equal(wrongTenant.error.code, 'CANCELLATION_BINDING_MISMATCH');
  assert.equal(port.cancellationCalls, 0);

  const wrongCorrelation = manager.requestCancellation(
    cancellationInput({ correlationId: CORRELATION_B }),
  );
  assert.equal(wrongCorrelation.ok, false);
  if (!wrongCorrelation.ok) {
    assert.equal(wrongCorrelation.error.code, 'CANCELLATION_BINDING_MISMATCH');
  }
  assert.equal(port.cancellationCalls, 0);

  const wrongConnection = manager.requestCancellation(
    cancellationInput({ gatewayConnectionId: 'connection:w14c:wrong' }),
  );
  assert.equal(wrongConnection.ok, false);
  if (!wrongConnection.ok) {
    assert.equal(wrongConnection.error.code, 'CANCELLATION_BINDING_MISMATCH');
  }
  assert.equal(port.cancellationCalls, 0);
});

test('delegates cancellation idempotently without claiming execution outcome authority', () => {
  const { manager, port } = setup();
  const first = manager.requestCancellation(cancellationInput());
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.value.disposition, 'CANCEL_REQUESTED');
  assert.equal(first.value.state, 'CANCEL_REQUESTED');
  assert.equal(first.value.effect, 'REQUEST_ONLY_NOT_EXECUTION_PROOF');
  assert.equal(first.value.outcomeAuthority, 'W07_ONLY');
  assert.equal(first.value.provesExecutionPrevented, false);
  assert.equal(first.value.authorizesExecution, false);
  assert.equal(first.value.retryAuthorized, false);

  const second = manager.requestCancellation(cancellationInput({ nowMs: NOW + 11 }));
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.value.disposition, 'ALREADY_REQUESTED');
  assert.equal(second.value.cancelRequestedAtMs, first.value.cancelRequestedAtMs);
  assert.equal(port.cancellationCalls, 2);
});

test('marks late completion after cancellation for W07 reconciliation instead of rewriting it', () => {
  const { manager } = setup();
  const cancelled = manager.requestCancellation(cancellationInput());
  assert.equal(cancelled.ok, true);

  const progress = manager.recordProgress(
    observation(EVENT_1, {
      source: 'W14_B_REALTIME_COMMAND',
      sourceReference: 'realtime:command-a',
      scope: 'COMMAND',
      subjectId: COMMAND_A,
      state: 'COMPLETED',
      observedAtMs: NOW + 20,
      nowMs: NOW + 21,
      safeSummary: 'Command completion was observed after cancellation was requested.',
      reasonCode: 'LATE_COMPLETION',
      evidenceRefs: ['evd:w14c:late-completion'],
      completedUnits: 1,
      totalUnits: 1,
    }),
  );
  assert.equal(progress.ok, true);
  if (!progress.ok) return;
  assert.equal(progress.value.frame.state, 'COMPLETED');
  assert.equal(progress.value.frame.afterCancellationRequest, true);
  assert.equal(progress.value.frame.lateCompletionAfterCancellation, true);
  assert.equal(progress.value.frame.requiresW07Reconciliation, true);
  assert.equal(progress.value.frame.provesExecutionSuccess, false);
});

test('preserves UNCERTAIN as a reconciliation-required projection', () => {
  const { manager } = setup();
  const result = manager.recordProgress(
    observation(EVENT_1, {
      source: 'W07_EXECUTION_OBSERVATION',
      sourceReference: 'execution:uncertain-a',
      scope: 'COMMAND',
      subjectId: COMMAND_A,
      state: 'UNCERTAIN',
      safeSummary: 'Provider effect remains uncertain pending reconciliation.',
      reasonCode: 'EXECUTION_UNCERTAIN',
      evidenceRefs: ['evd:w14c:uncertain'],
      completedUnits: 0,
      totalUnits: 1,
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.frame.state, 'UNCERTAIN');
  assert.equal(result.value.frame.requiresW07Reconciliation, true);
  assert.equal(result.value.frame.authorizesExecution, false);
  assert.equal(result.value.frame.provesExecutionSuccess, false);
});

test('does not evict active streams when bounded capacity is exhausted', () => {
  const { manager } = setup({ maxStreams: 1 });
  const first = manager.recordProgress(observation(EVENT_1));
  assert.equal(first.ok, true);

  const blocked = manager.recordProgress(
    observation(EVENT_2, {
      correlationId: CORRELATION_B,
      subjectId: 'lane:w14c:b',
      safeSummary: 'Second active stream.',
    }),
  );
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.error.code, 'STREAM_CAPACITY');
    assert.equal(blocked.error.retryable, true);
    assert.equal(blocked.retryAuthorized, false);
  }

  const terminal = manager.recordProgress(
    observation(EVENT_3, {
      state: 'COMPLETED',
      observedAtMs: NOW + 2,
      nowMs: NOW + 3,
      safeSummary: 'First stream completed.',
      completedUnits: 4,
      totalUnits: 4,
    }),
  );
  assert.equal(terminal.ok, true);

  const replacement = manager.recordProgress(
    observation(EVENT_4, {
      correlationId: CORRELATION_B,
      subjectId: 'lane:w14c:b',
      observedAtMs: NOW + 4,
      nowMs: NOW + 5,
      safeSummary: 'Second stream starts after terminal eviction.',
    }),
  );
  assert.equal(replacement.ok, true);
});

test('never converts an upstream cancellation rejection into retry authority', () => {
  const { manager, port } = setup();
  port.rejectCancellation = true;
  const result = manager.requestCancellation(cancellationInput());
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'CANCELLATION_UPSTREAM_REJECTED');
    assert.equal(result.error.upstreamCode, 'GATEWAY_CONNECTION_MISMATCH');
    assert.equal(result.authorizesExecution, false);
    assert.equal(result.retryAuthorized, false);
  }
});
