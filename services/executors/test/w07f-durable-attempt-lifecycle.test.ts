// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { ContractVersion } from '@aurora/contracts/versioning';

import {
  DurableExecutionAttemptLifecycle,
  classifyExecutionAmbiguity,
  type ExecutionAttemptQuotaCasPort,
  type ReconcileExecutionUncertaintyRequest,
} from '../src/reconciliation/index.js';
import type {
  ExecutionAttemptQuotaLookup,
  ExecutionAttemptQuotaSnapshot,
  ExecutionAttemptQuotaSource,
} from '../src/safeguards/index.js';

const version = '1.0.0' as ContractVersion;
const at = (value: string) => value as Rfc3339Timestamp;
const TENANT = 'tenant:alpha';
const ACTION = 'action-intent:durable-attempt';
const EXECUTION = 'exe_01ARZ3NDEKTSV4RRFFQ69G5FAV';

function intent(overrides: Record<string, unknown> = {}): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: version,
    actionIntentId: ACTION,
    capability: { capability: 'device.voice', actionType: 'DISPATCH' },
    executionTarget: {
      schemaVersion: version,
      kind: 'DEVICE',
      bindingReference: 'device:tablet',
    },
    tenant: { tenantId: TENANT },
    actor: { kind: 'HUMAN', identityId: 'identity:operator' },
    requestOrigin: { kind: 'HUMAN', identityId: 'identity:operator' },
    correlation: { correlationId: 'correlation:durable-attempt' },
    resolvedParameters: {},
    idempotency: { mode: 'REQUIRED', key: 'idem:durable-attempt' },
    preconditions: [],
    deadlineAt: at('2026-09-07T00:00:00.000Z'),
    authority: { kind: 'POLICY_TOKEN', policyTokenId: 'policy-token:durable-attempt' },
    dataClassification: 'INTERNAL',
    ...overrides,
  } as unknown as ActionIntent;
}

function snapshot(overrides: Record<string, unknown> = {}): ExecutionAttemptQuotaSnapshot {
  return {
    tenantId: TENANT,
    actionIntentId: ACTION,
    executionRef: EXECUTION,
    attemptNumber: 1,
    maxAttempts: 3,
    quota: { limit: 5, used: 1 },
    version: 7,
    updatedAt: '2026-09-06T18:00:02.500Z',
    ...overrides,
  } as unknown as ExecutionAttemptQuotaSnapshot;
}

function reconciliation(
  actionIntent = intent(),
  options: {
    readonly attemptNumber?: number;
    readonly maxAttempts?: number;
    readonly observation?: 'NO_EFFECT_CONFIRMED' | 'EFFECT_OBSERVED' | 'INDETERMINATE';
    readonly guardsSafe?: boolean;
  } = {},
): ReconcileExecutionUncertaintyRequest {
  const attemptNumber = options.attemptNumber ?? 1;
  const maxAttempts = options.maxAttempts ?? 3;
  const classified = classifyExecutionAmbiguity({
    schemaVersion: version,
    actionIntent,
    occurredAt: at('2026-09-06T18:00:00.000Z'),
    attemptNumber,
    maxAttempts,
    signal: 'ACK_WITHOUT_VERIFICATION',
    phase: 'AFTER_EXTERNAL_INVOCATION_STARTED',
  });
  assert.equal(classified.status, 'EXECUTION_UNCERTAIN');
  if (classified.status !== 'EXECUTION_UNCERTAIN') throw new Error('fixture rejected');

  const observation = options.observation ?? 'NO_EFFECT_CONFIRMED';
  const result = {
    kind: 'EXECUTION_SAFEGUARD_RESULT' as const,
    schemaVersion: version,
    actionIntentId: actionIntent.actionIntentId,
    ...(options.guardsSafe === false
      ? {
          safeToInvokeExternal: false as const,
          idempotencyReserved: false as const,
          reasons: ['IDEMPOTENCY_INFLIGHT' as const],
        }
      : {
          safeToInvokeExternal: true as const,
          idempotencyReserved: true,
          reasons: [] as const,
        }),
    authorizesExecution: false as const,
  };
  return {
    schemaVersion: version,
    actionIntent,
    uncertainty: classified.uncertainty,
    observation:
      observation === 'INDETERMINATE'
        ? {
            state: 'INDETERMINATE',
            observedAt: at('2026-09-06T18:00:02.000Z'),
            reason: 'readback unavailable',
          }
        : { state: observation, observedAt: at('2026-09-06T18:00:02.000Z') },
    retrySafeguards: {
      attemptNumber: attemptNumber + 1,
      evaluatedAt: at('2026-09-06T18:00:03.000Z'),
      result,
    },
  };
}

interface CasInput {
  readonly tenantId: string;
  readonly actionIntentId: string;
  readonly executionRef: string;
  readonly attemptNumber: number;
  readonly maxAttempts: number;
  readonly quotaLimit?: number;
  readonly quotaUsed?: number;
  readonly now: Rfc3339Timestamp;
  readonly expectedVersion: number;
}

class FakeW03Store implements ExecutionAttemptQuotaSource, ExecutionAttemptQuotaCasPort {
  current: ExecutionAttemptQuotaSnapshot | null;
  readonly lookups: ExecutionAttemptQuotaLookup[] = [];
  readonly writes: CasInput[] = [];
  throwOnRead = false;
  throwOnWrite = false;
  conflict = false;
  malformedPersisted = false;
  wrongQuotaPersisted = false;

  constructor(current: ExecutionAttemptQuotaSnapshot | null = snapshot()) {
    this.current = current;
  }

  lookup(input: ExecutionAttemptQuotaLookup): ExecutionAttemptQuotaSnapshot | null {
    this.lookups.push(input);
    if (this.throwOnRead) throw new Error('read unavailable');
    return this.current;
  }

  compareAndSwap(input: CasInput): ExecutionAttemptQuotaSnapshot | null {
    this.writes.push(input);
    if (this.throwOnWrite) throw new Error('write unavailable');
    if (this.conflict || this.current === null || input.expectedVersion !== this.current.version) {
      return null;
    }
    const next = snapshot({
      tenantId: input.tenantId,
      actionIntentId: input.actionIntentId,
      executionRef: input.executionRef,
      attemptNumber: input.attemptNumber,
      maxAttempts: input.maxAttempts,
      quota:
        input.quotaLimit === undefined || input.quotaUsed === undefined
          ? undefined
          : { limit: input.quotaLimit, used: input.quotaUsed },
      version: input.expectedVersion + 1,
      updatedAt: input.now,
    });
    this.current = this.malformedPersisted
      ? snapshot({ ...next, version: 99 })
      : this.wrongQuotaPersisted
        ? snapshot({ ...next, quota: { limit: 5, used: 99 } })
        : next;
    return this.current;
  }
}

function lifecycle(store: FakeW03Store): DurableExecutionAttemptLifecycle {
  return new DurableExecutionAttemptLifecycle({
    source: store,
    persistence: store,
    maxAgeMs: 60_000,
  });
}

function request(actionIntent = intent(), overrides: Record<string, unknown> = {}) {
  return {
    actionIntent,
    executionRef: EXECUTION,
    expectedVersion: 7,
    evaluatedAt: at('2026-09-06T18:00:04.000Z'),
    reconciliation: reconciliation(actionIntent),
    ...overrides,
  };
}

test('advances exactly one durable attempt only after W07-F no-effect reconciliation and fresh guards', () => {
  const store = new FakeW03Store();
  const result = lifecycle(store).reconcileAndAdvance(request());

  assert.deepEqual(result, {
    status: 'ADVANCED',
    attemptNumber: 2,
    maxAttempts: 3,
    version: 8,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  });
  assert.equal(store.lookups.length, 1);
  assert.deepEqual(store.writes, [
    {
      tenantId: TENANT,
      actionIntentId: ACTION,
      executionRef: EXECUTION,
      attemptNumber: 2,
      maxAttempts: 3,
      quotaLimit: 5,
      quotaUsed: 2,
      now: '2026-09-06T18:00:04.000Z',
      expectedVersion: 7,
    },
  ]);
});

test('blind, indeterminate and guard-blocked retries never reach W03 CAS', () => {
  const cases = [
    reconciliation(intent(), { observation: 'INDETERMINATE' }),
    reconciliation(intent(), { guardsSafe: false }),
  ];
  for (const evidence of cases) {
    const store = new FakeW03Store();
    const result = lifecycle(store).reconcileAndAdvance(
      request(intent(), { reconciliation: evidence }),
    );
    assert.equal(result.status, 'REJECTED');
    assert.equal(
      result.status === 'REJECTED' ? result.reason : '',
      'RECONCILIATION_NOT_RETRY_ELIGIBLE',
    );
    assert.equal(store.writes.length, 0);
  }

  const store = new FakeW03Store();
  const noObservation = reconciliation();
  const result = lifecycle(store).reconcileAndAdvance(
    request(intent(), { reconciliation: { ...noObservation, observation: undefined } }),
  );
  assert.equal(result.status, 'REJECTED');
  assert.equal(store.writes.length, 0);
});

test('tenant, ActionIntent, executionRef and durable version remain bound before mutation', () => {
  const otherIntent = intent({ actionIntentId: 'action-intent:other' });
  const cases = [
    request(intent(), { reconciliation: reconciliation(otherIntent) }),
    request(intent(), { executionRef: 'bad execution ref' }),
    request(intent(), { expectedVersion: 8 }),
  ];
  for (const candidate of cases) {
    const store = new FakeW03Store();
    const result = lifecycle(store).reconcileAndAdvance(candidate);
    assert.equal(result.status, 'REJECTED');
    assert.equal(store.writes.length, 0);
  }
});

test('stale, absent and unavailable current state fail closed without a write', () => {
  const unavailableStore = new FakeW03Store();
  unavailableStore.throwOnRead = true;
  const stores = [
    new FakeW03Store(snapshot({ updatedAt: '2026-09-06T17:00:00.000Z' })),
    new FakeW03Store(null),
    unavailableStore,
  ];
  for (const store of stores) {
    const result = lifecycle(store).reconcileAndAdvance(request());
    assert.equal(result.status, 'REJECTED');
    assert.equal(result.authorizesExecution, false);
    assert.equal(result.provesExecutionSuccess, false);
    assert.equal(result.retryAuthorized, false);
    assert.equal(store.writes.length, 0);
  }
});

test('attempt and quota ceilings block lifecycle advancement', () => {
  const cases = [
    {
      state: snapshot({ attemptNumber: 3, maxAttempts: 3 }),
      evidence: reconciliation(intent(), { attemptNumber: 3, maxAttempts: 3 }),
    },
    {
      state: snapshot({ quota: { limit: 5, used: 5 } }),
      evidence: reconciliation(),
    },
  ];
  for (const candidate of cases) {
    const store = new FakeW03Store(candidate.state);
    const result = lifecycle(store).reconcileAndAdvance(
      request(intent(), { reconciliation: candidate.evidence }),
    );
    assert.equal(result.status, 'REJECTED');
    assert.equal(store.writes.length, 0);
  }
});

test('quota increment is atomic with attempt advance and may consume the final bounded unit', () => {
  const store = new FakeW03Store(snapshot({ quota: { limit: 2, used: 1 } }));
  const result = lifecycle(store).reconcileAndAdvance(request());
  assert.equal(result.status, 'ADVANCED');
  assert.equal(store.writes.length, 1);
  assert.equal(store.writes[0]?.attemptNumber, 2);
  assert.equal(store.writes[0]?.quotaLimit, 2);
  assert.equal(store.writes[0]?.quotaUsed, 2);
  assert.deepEqual(store.current?.quota, { limit: 2, used: 2 });
});

test('retry guards must be newer than the durable row and not future-dated to lifecycle time', () => {
  const staleGuardStore = new FakeW03Store(snapshot({ updatedAt: '2026-09-06T18:00:03.500Z' }));
  const staleGuard = lifecycle(staleGuardStore).reconcileAndAdvance(request());
  assert.equal(staleGuard.status, 'REJECTED');
  assert.equal(
    staleGuard.status === 'REJECTED' ? staleGuard.reason : '',
    'RETRY_GUARDS_STATE_STALE',
  );
  assert.equal(staleGuardStore.writes.length, 0);

  const actionIntent = intent();
  const futureEvidence = reconciliation(actionIntent);
  const futureGuardStore = new FakeW03Store();
  const futureGuard = lifecycle(futureGuardStore).reconcileAndAdvance(
    request(actionIntent, {
      reconciliation: {
        ...futureEvidence,
        retrySafeguards: {
          ...futureEvidence.retrySafeguards,
          evaluatedAt: at('2026-09-06T18:00:05.000Z'),
        },
      },
    }),
  );
  assert.equal(futureGuard.status, 'REJECTED');
  assert.equal(
    futureGuard.status === 'REJECTED' ? futureGuard.reason : '',
    'RETRY_GUARDS_STATE_STALE',
  );
  assert.equal(futureGuardStore.writes.length, 0);
});

test('CAS conflict, outage and malformed persisted echoes fail closed and never authorize retry', () => {
  const conflictStore = new FakeW03Store();
  conflictStore.conflict = true;
  const unavailableStore = new FakeW03Store();
  unavailableStore.throwOnWrite = true;
  const malformedStore = new FakeW03Store();
  malformedStore.malformedPersisted = true;
  const wrongQuotaStore = new FakeW03Store();
  wrongQuotaStore.wrongQuotaPersisted = true;
  const stores = [conflictStore, unavailableStore, malformedStore, wrongQuotaStore];
  const reasons = [
    'PERSISTENCE_CONFLICT',
    'PERSISTENCE_UNAVAILABLE',
    'PERSISTED_STATE_MALFORMED',
    'PERSISTED_STATE_MALFORMED',
  ];

  stores.forEach((store, index) => {
    const result = lifecycle(store).reconcileAndAdvance(request());
    assert.equal(result.status, 'REJECTED');
    assert.equal(result.status === 'REJECTED' ? result.reason : '', reasons[index]);
    assert.equal(result.authorizesExecution, false);
    assert.equal(result.provesExecutionSuccess, false);
    assert.equal(result.retryAuthorized, false);
  });
});

test('effect observation seals the durable row at the current attempt without claiming success', () => {
  const store = new FakeW03Store();
  const result = lifecycle(store).reconcileAndSealTerminal(
    request(intent(), {
      reconciliation: reconciliation(intent(), { observation: 'EFFECT_OBSERVED' }),
    }),
  );
  assert.deepEqual(result, {
    status: 'SEALED',
    attemptNumber: 1,
    maxAttempts: 1,
    version: 8,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  });
  assert.equal(store.writes[0]?.attemptNumber, 1);
  assert.equal(store.writes[0]?.maxAttempts, 1);
});

test('attempt-limit terminal state may be sealed, while transient guard blockage may not', () => {
  const terminalStore = new FakeW03Store(snapshot({ attemptNumber: 3, maxAttempts: 3 }));
  const terminal = lifecycle(terminalStore).reconcileAndSealTerminal(
    request(intent(), {
      reconciliation: reconciliation(intent(), { attemptNumber: 3, maxAttempts: 3 }),
    }),
  );
  assert.equal(terminal.status, 'SEALED');

  const transientStore = new FakeW03Store();
  const transient = lifecycle(transientStore).reconcileAndSealTerminal(
    request(intent(), { reconciliation: reconciliation(intent(), { guardsSafe: false }) }),
  );
  assert.equal(transient.status, 'REJECTED');
  assert.equal(
    transient.status === 'REJECTED' ? transient.reason : '',
    'RECONCILIATION_NOT_TERMINAL',
  );
  assert.equal(transientStore.writes.length, 0);
});

test('freshness bound is mandatory and has no artificial default', () => {
  const store = new FakeW03Store();
  assert.throws(
    () => new DurableExecutionAttemptLifecycle({ source: store, persistence: store, maxAgeMs: 0 }),
    /freshness bound/u,
  );
});
