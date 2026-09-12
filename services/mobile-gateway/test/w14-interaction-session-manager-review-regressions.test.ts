// @ts-expect-error -- mobile-gateway harness intentionally has no @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway harness intentionally has no @types/node.
import test from 'node:test';

import type {
  CorrelationId,
  InteractionSessionId,
  InteractionTurnId,
  TenantId,
} from '@aurora/contracts/ids';

import {
  InteractionSessionManager,
  asRfc3339Timestamp,
  type InteractionSessionIdFactory,
  type InteractionSessionStore,
  type StoredInteractionSession,
} from '../src/interaction-session/index.js';

const TENANT = 'ten_01JW14V017REVIEW0000000000' as TenantId;
const CORRELATION = 'cor_01JW14V017REVIEW0000000000' as CorrelationId;
const SESSION = 'ins_01JW14V017REVIEW0000000000' as InteractionSessionId;
const PARTICIPANT = Object.freeze({
  kind: 'DEVICE' as const,
  bindingReference: 'device:sm-x820:review-regression',
});
const REFERENCES = Object.freeze({
  artifactRefs: Object.freeze([]),
  pendingHumanControlRequestRefs: Object.freeze([]),
});

class MemoryStore implements InteractionSessionStore {
  readonly records = new Map<InteractionSessionId, StoredInteractionSession>();
  readonly reservedTurnIds = new Set<InteractionTurnId>();

  read(interactionSessionId: InteractionSessionId): StoredInteractionSession | null {
    return this.records.get(interactionSessionId) ?? null;
  }

  create(initial: StoredInteractionSession): boolean {
    if (this.records.has(initial.session.interactionSessionId)) return false;
    this.records.set(initial.session.interactionSessionId, initial);
    return true;
  }

  reserveTurnId(interactionTurnId: InteractionTurnId): boolean {
    if (this.reservedTurnIds.has(interactionTurnId)) return false;
    this.reservedTurnIds.add(interactionTurnId);
    return true;
  }

  compareAndSwap(
    interactionSessionId: InteractionSessionId,
    expectedRevision: number,
    next: StoredInteractionSession,
  ): boolean {
    const current = this.records.get(interactionSessionId);
    if (current === undefined || current.revision !== expectedRevision) return false;
    this.records.set(interactionSessionId, next);
    return true;
  }
}

function ids(): InteractionSessionIdFactory {
  let turn = 0;
  return {
    sessionId: () => SESSION,
    turnId: () => {
      turn += 1;
      return `itr_${String(turn).padStart(26, '0')}` as InteractionTurnId;
    },
  };
}

function binding() {
  return {
    interactionSessionId: SESSION,
    tenantId: TENANT,
    participant: PARTICIPANT,
  };
}

function open(manager: InteractionSessionManager) {
  return manager.open({
    tenantId: TENANT,
    participant: PARTICIPANT,
    modality: 'VOICE',
    dataClassification: 'INTERNAL',
    references: REFERENCES,
  });
}

function append(
  manager: InteractionSessionManager,
  content: unknown = { kind: 'TEXT', text: 'oi' },
) {
  return manager.appendTurn({
    ...binding(),
    role: 'USER',
    modality: 'VOICE',
    correlationId: CORRELATION,
    dataClassification: 'INTERNAL',
    content: content as Parameters<InteractionSessionManager['appendTurn']>[0]['content'],
    references: REFERENCES,
  });
}

function expectSuccess(
  result: ReturnType<InteractionSessionManager['current']>,
): StoredInteractionSession {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(`unexpected manager failure: ${result.code}`);
  return result.value;
}

function expectError(result: ReturnType<InteractionSessionManager['current']>, code: string): void {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error('expected manager failure');
  assert.equal(result.code, code);
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.provesExecutionSuccess, false);
}

test('sub-millisecond stored timestamps never regress when the wall clock stays at the same millisecond', () => {
  const store = new MemoryStore();
  const manager = new InteractionSessionManager(store, ids(), () => 1_000);
  const opened = expectSuccess(open(manager));

  store.records.set(SESSION, {
    revision: opened.revision,
    session: {
      ...opened.session,
      updatedAt: '1970-01-01T00:00:01.000000900Z',
    },
  } as StoredInteractionSession);

  const appended = expectSuccess(append(manager));
  assert.equal(appended.session.updatedAt, '1970-01-01T00:00:01.000000900Z');
  assert.equal(appended.session.turns[0]?.occurredAt, '1970-01-01T00:00:01.000000900Z');
});

test('canonical reference and text-content runtime validation rejects malformed typed input before persistence', () => {
  const store = new MemoryStore();
  const manager = new InteractionSessionManager(store, ids(), () => 1_000);

  const invalidOpen = manager.open({
    tenantId: TENANT,
    participant: PARTICIPANT,
    modality: 'VOICE',
    dataClassification: 'INTERNAL',
    references: {
      artifactRefs: ['duplicate', 'duplicate'],
      pendingHumanControlRequestRefs: [],
    },
  });
  expectError(invalidOpen, 'INVALID_INPUT');
  assert.equal(store.records.size, 0);

  expectSuccess(open(manager));
  expectError(append(manager, { kind: 'TEXT', text: '', speechConfidence: 2 }), 'INVALID_INPUT');
  assert.equal(store.reservedTurnIds.size, 0);
  assert.equal(expectSuccess(manager.current(binding())).revision, 1);
});

test('manager returns a deep-owned immutable snapshot even when the persistence adapter returns mutable data', () => {
  const store = new MemoryStore();
  const manager = new InteractionSessionManager(store, ids(), () => 1_000);
  const opened = expectSuccess(open(manager));

  const mutableArtifacts: string[] = ['artifact:original'];
  const mutablePending: string[] = [];
  const mutableSession = {
    ...opened.session,
    participant: { kind: 'DEVICE' as const, bindingReference: PARTICIPANT.bindingReference },
    resume: { resumable: false as const },
    references: {
      artifactRefs: mutableArtifacts,
      pendingHumanControlRequestRefs: mutablePending,
    },
    turns: [],
  };
  store.records.set(SESSION, {
    revision: opened.revision,
    session: mutableSession,
  } as unknown as StoredInteractionSession);

  const snapshot = expectSuccess(manager.current(binding()));
  mutableArtifacts.push('artifact:mutated-after-read');
  mutablePending.push('human-control:mutated-after-read');
  mutableSession.participant.bindingReference = 'device:mutated-after-read';

  assert.deepEqual(snapshot.session.references.artifactRefs, ['artifact:original']);
  assert.deepEqual(snapshot.session.references.pendingHumanControlRequestRefs, []);
  assert.equal(snapshot.session.participant.kind, 'DEVICE');
  if (snapshot.session.participant.kind !== 'DEVICE')
    throw new Error('expected device participant');
  assert.equal(snapshot.session.participant.bindingReference, PARTICIPANT.bindingReference);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.session), true);
  assert.equal(Object.isFrozen(snapshot.session.references), true);
  assert.equal(Object.isFrozen(snapshot.session.references.artifactRefs), true);
});

test('observed resume expiry is persisted so later wall-clock regression cannot reopen the window', () => {
  const store = new MemoryStore();
  let now = 1_000;
  const manager = new InteractionSessionManager(store, ids(), () => now);
  expectSuccess(open(manager));
  expectSuccess(manager.suspend({ ...binding(), resumeWindowMs: 1_000 }));

  now = 2_000;
  expectError(manager.resume(binding()), 'RESUME_EXPIRED');
  const expired = expectSuccess(manager.current(binding()));
  assert.equal(expired.revision, 3);
  assert.equal(expired.session.state, 'SUSPENDED');
  assert.deepEqual(expired.session.resume, { resumable: false });

  now = 1_500;
  expectError(manager.resume(binding()), 'RESUME_EXPIRED');
  assert.equal(expectSuccess(manager.current(binding())).revision, 3);
});

test('pre-1970 four-digit RFC3339 instants remain valid manager clock values', () => {
  assert.equal(asRfc3339Timestamp(-1_000), '1969-12-31T23:59:59.000Z');
  const manager = new InteractionSessionManager(new MemoryStore(), ids(), () => -1_000);
  const opened = expectSuccess(open(manager));
  assert.equal(opened.session.createdAt, '1969-12-31T23:59:59.000Z');
  assert.equal(opened.session.updatedAt, '1969-12-31T23:59:59.000Z');
});

test('invalid deserialized persistence state fails closed instead of escaping as a mutable contract object', () => {
  const store = new MemoryStore();
  const manager = new InteractionSessionManager(store, ids(), () => 1_000);
  const opened = expectSuccess(open(manager));
  store.records.set(SESSION, {
    revision: opened.revision,
    session: {
      ...opened.session,
      references: {
        artifactRefs: ['duplicate', 'duplicate'],
        pendingHumanControlRequestRefs: [],
      },
    },
  } as StoredInteractionSession);

  expectError(manager.current(binding()), 'STORE_INVALID');
});
