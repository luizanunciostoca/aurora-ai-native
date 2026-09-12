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
  type InteractionSessionIdFactory,
  type InteractionSessionStore,
  type StoredInteractionSession,
} from '../src/interaction-session/index.js';

const TENANT = 'ten_01JW14V0170000000000000000' as TenantId;
const CORRELATION = 'cor_01JW14V0170000000000000000' as CorrelationId;
const SESSION = 'ins_01JW14V0170000000000000000' as InteractionSessionId;
const REFERENCES = Object.freeze({
  artifactRefs: Object.freeze([]),
  pendingHumanControlRequestRefs: Object.freeze([]),
});

class MemoryStore implements InteractionSessionStore {
  readonly records = new Map<InteractionSessionId, StoredInteractionSession>();
  rejectCreate = false;
  rejectNextCas = false;

  read(interactionSessionId: InteractionSessionId): StoredInteractionSession | null {
    return this.records.get(interactionSessionId) ?? null;
  }

  create(initial: StoredInteractionSession): boolean {
    if (this.rejectCreate || this.records.has(initial.session.interactionSessionId)) return false;
    this.records.set(initial.session.interactionSessionId, initial);
    return true;
  }

  compareAndSwap(
    interactionSessionId: InteractionSessionId,
    expectedRevision: number,
    next: StoredInteractionSession,
  ): boolean {
    if (this.rejectNextCas) {
      this.rejectNextCas = false;
      return false;
    }
    const current = this.records.get(interactionSessionId);
    if (current === undefined || current.revision !== expectedRevision) return false;
    this.records.set(interactionSessionId, next);
    return true;
  }
}

function turnId(index: number): InteractionTurnId {
  return `itr_${String(index).padStart(26, '0')}` as InteractionTurnId;
}

function ids(turns: readonly InteractionTurnId[] = []): InteractionSessionIdFactory {
  let turnIndex = 0;
  return {
    sessionId: () => SESSION,
    turnId: () => turns[turnIndex++] ?? turnId(turnIndex),
  };
}

function open(
  manager: InteractionSessionManager,
  dataClassification: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED' = 'INTERNAL',
) {
  return manager.open({
    tenantId: TENANT,
    participant: { kind: 'DEVICE', bindingReference: 'device:sm-x820' },
    modality: 'VOICE',
    dataClassification,
    references: REFERENCES,
  });
}

function append(
  manager: InteractionSessionManager,
  overrides: Partial<Parameters<InteractionSessionManager['appendTurn']>[0]> = {},
) {
  return manager.appendTurn({
    interactionSessionId: SESSION,
    role: 'USER',
    modality: 'VOICE',
    correlationId: CORRELATION,
    dataClassification: 'INTERNAL',
    content: { kind: 'TEXT', text: 'Aurora, ajuste o volume.', languageTag: 'pt-BR' },
    references: REFERENCES,
    ...overrides,
  });
}

function expectError(result: ReturnType<InteractionSessionManager['current']>, code: string): void {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error('expected manager failure');
  assert.equal(result.code, code);
  assert.equal(result.retryable, false);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.provesExecutionSuccess, false);
  assert.equal(result.retryAuthorized, false);
}

function expectSuccess(
  result: ReturnType<InteractionSessionManager['current']>,
): StoredInteractionSession {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(`unexpected manager failure: ${result.code}`);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.provesExecutionSuccess, false);
  assert.equal(result.retryAuthorized, false);
  return result.value;
}

test('W14 interaction manager opens and appends ordered non-authoritative turns', () => {
  const store = new MemoryStore();
  let now = 1_000;
  const manager = new InteractionSessionManager(store, ids(), () => now);

  const opened = expectSuccess(open(manager));
  assert.equal(opened.revision, 1);
  assert.equal(opened.session.state, 'ACTIVE');
  assert.equal(opened.session.turns.length, 0);

  now = 2_000;
  const first = expectSuccess(append(manager));
  now = 3_000;
  const second = expectSuccess(append(manager, { role: 'AURORA' }));

  assert.equal(first.revision, 2);
  assert.equal(second.revision, 3);
  assert.deepEqual(
    second.session.turns.map((turn) => turn.sequence),
    [1, 2],
  );
  assert.equal(second.session.turns[0]?.authorizesExecution, false);
  assert.equal(second.session.turns[1]?.provesExecutionSuccess, false);
  assert.equal(second.session.turns[1]?.retryAuthorized, false);
});

test('classification escalates monotonically and later downgrade is rejected', () => {
  const store = new MemoryStore();
  const manager = new InteractionSessionManager(store, ids(), () => 1_000);
  expectSuccess(open(manager, 'INTERNAL'));

  const restricted = expectSuccess(append(manager, { dataClassification: 'RESTRICTED' }));
  assert.equal(restricted.session.dataClassification, 'RESTRICTED');

  expectError(append(manager, { dataClassification: 'CONFIDENTIAL' }), 'CLASSIFICATION_DOWNGRADE');
  assert.equal(expectSuccess(manager.current(SESSION)).revision, 2);
});

test('fixed-modality session rejects incompatible turn modality', () => {
  const manager = new InteractionSessionManager(new MemoryStore(), ids(), () => 1_000);
  expectSuccess(open(manager));
  expectError(append(manager, { modality: 'TEXT' }), 'MODALITY_MISMATCH');
});

test('duplicate generated turn identity fails closed without mutating the store', () => {
  const duplicate = turnId(7);
  const store = new MemoryStore();
  const manager = new InteractionSessionManager(store, ids([duplicate, duplicate]), () => 1_000);
  expectSuccess(open(manager));
  expectSuccess(append(manager));
  expectError(append(manager), 'ID_COLLISION');
  assert.equal(expectSuccess(manager.current(SESSION)).session.turns.length, 1);
});

test('CAS conflict is surfaced and never silently overwrites newer continuity state', () => {
  const store = new MemoryStore();
  const manager = new InteractionSessionManager(store, ids(), () => 1_000);
  expectSuccess(open(manager));
  store.rejectNextCas = true;
  expectError(append(manager), 'REVISION_CONFLICT');
  assert.equal(expectSuccess(manager.current(SESSION)).revision, 1);
});

test('suspend and resume preserve bounded cursor continuity', () => {
  const store = new MemoryStore();
  let now = 1_000;
  const manager = new InteractionSessionManager(store, ids(), () => now);
  expectSuccess(open(manager));
  now = 2_000;
  const turn = expectSuccess(append(manager)).session.turns[0];
  assert.ok(turn);

  now = 3_000;
  const suspended = expectSuccess(
    manager.suspend({ interactionSessionId: SESSION, resumeWindowMs: 2_000 }),
  );
  assert.equal(suspended.session.state, 'SUSPENDED');
  assert.equal(suspended.session.resume.resumable, true);
  assert.equal(suspended.session.resume.resumeAfterTurnId, turn.interactionTurnId);
  assert.equal(suspended.session.resume.resumableUntil, '1970-01-01T00:00:05.000Z');

  now = 4_000;
  const resumed = expectSuccess(manager.resume({ interactionSessionId: SESSION }));
  assert.equal(resumed.session.state, 'ACTIVE');
  assert.deepEqual(resumed.session.resume, { resumable: false });
});

test('expired and invalid resume windows fail closed', () => {
  const store = new MemoryStore();
  let now = 1_000;
  const manager = new InteractionSessionManager(store, ids(), () => now);
  expectSuccess(open(manager));
  expectError(
    manager.suspend({ interactionSessionId: SESSION, resumeWindowMs: 999 }),
    'INVALID_RESUME_WINDOW',
  );
  expectSuccess(manager.suspend({ interactionSessionId: SESSION, resumeWindowMs: 1_000 }));
  now = 2_000;
  expectError(manager.resume({ interactionSessionId: SESSION }), 'RESUME_EXPIRED');
});

test('turn limit is enforced by writer even before schema validation', () => {
  const store = new MemoryStore();
  let now = 1_000;
  const manager = new InteractionSessionManager(store, ids(), () => now++);
  expectSuccess(open(manager));
  for (let index = 0; index < 128; index += 1) {
    expectSuccess(append(manager));
  }
  expectError(append(manager), 'TURN_LIMIT_REACHED');
  assert.equal(expectSuccess(manager.current(SESSION)).session.turns.length, 128);
});

test('clock regression cannot move session or turn timestamps backwards', () => {
  const store = new MemoryStore();
  let now = 5_000;
  const manager = new InteractionSessionManager(store, ids(), () => now);
  const opened = expectSuccess(open(manager));
  now = 4_000;
  const appended = expectSuccess(append(manager));
  assert.equal(appended.session.updatedAt, opened.session.updatedAt);
  assert.equal(appended.session.turns[0]?.occurredAt, opened.session.updatedAt);
});

test('end is terminal and idempotent without creating authority', () => {
  const store = new MemoryStore();
  const manager = new InteractionSessionManager(store, ids(), () => 1_000);
  expectSuccess(open(manager));
  const ended = expectSuccess(manager.end({ interactionSessionId: SESSION }));
  const repeated = expectSuccess(manager.end({ interactionSessionId: SESSION }));
  assert.equal(ended.session.state, 'ENDED');
  assert.equal(repeated.revision, ended.revision);
  expectError(append(manager), 'SESSION_NOT_ACTIVE');
});
