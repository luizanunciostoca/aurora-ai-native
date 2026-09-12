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
  MAX_RFC3339_TIMESTAMP_MS,
  InteractionSessionManager,
  asRfc3339Timestamp,
  type InteractionSessionIdFactory,
  type InteractionSessionStore,
  type StoredInteractionSession,
} from '../src/interaction-session/index.js';

const TENANT = 'ten_01JW14V0170000000000000000' as TenantId;
const TENANT_B = 'ten_01JW14V0170000000000000001' as TenantId;
const CORRELATION = 'cor_01JW14V0170000000000000000' as CorrelationId;
const SESSION = 'ins_01JW14V0170000000000000000' as InteractionSessionId;
const SESSION_B = 'ins_01JW14V0170000000000000001' as InteractionSessionId;
const PARTICIPANT = Object.freeze({
  kind: 'DEVICE' as const,
  bindingReference: 'device:sm-x820',
});
const OTHER_PARTICIPANT = Object.freeze({
  kind: 'DEVICE' as const,
  bindingReference: 'device:other',
});
const REFERENCES = Object.freeze({
  artifactRefs: Object.freeze([]),
  pendingHumanControlRequestRefs: Object.freeze([]),
});

class MemoryStore implements InteractionSessionStore {
  readonly records = new Map<InteractionSessionId, StoredInteractionSession>();
  readonly reservedTurnIds = new Set<InteractionTurnId>();
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

function ids(
  turns: readonly InteractionTurnId[] = [],
  sessions: readonly InteractionSessionId[] = [SESSION],
): InteractionSessionIdFactory {
  let sessionIndex = 0;
  let turnIndex = 0;
  return {
    sessionId: () => sessions[sessionIndex++] ?? SESSION,
    turnId: () => {
      const current = turnIndex;
      turnIndex += 1;
      return turns[current] ?? turnId(current + 1);
    },
  };
}

function binding(interactionSessionId: InteractionSessionId = SESSION) {
  return {
    interactionSessionId,
    tenantId: TENANT,
    participant: PARTICIPANT,
  };
}

function open(
  manager: InteractionSessionManager,
  dataClassification: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED' = 'INTERNAL',
) {
  return manager.open({
    tenantId: TENANT,
    participant: PARTICIPANT,
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
    ...binding(),
    role: 'USER',
    modality: 'VOICE',
    correlationId: CORRELATION,
    dataClassification: 'INTERNAL',
    content: { kind: 'TEXT', text: 'Aurora, ajuste o volume.', languageTag: 'pt-BR' },
    references: REFERENCES,
    ...overrides,
  });
}

function expectError(
  result: ReturnType<InteractionSessionManager['current']>,
  code: string,
  retryable = false,
): void {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error('expected manager failure');
  assert.equal(result.code, code);
  assert.equal(result.retryable, retryable);
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

test('tenant and participant bindings protect reads and mutations', () => {
  const store = new MemoryStore();
  const manager = new InteractionSessionManager(store, ids(), () => 1_000);
  expectSuccess(open(manager));

  expectError(manager.current({ ...binding(), tenantId: TENANT_B }), 'TENANT_MISMATCH');
  expectError(
    append(manager, { participant: OTHER_PARTICIPANT }),
    'PARTICIPANT_MISMATCH',
  );
  assert.equal(expectSuccess(manager.current(binding())).revision, 1);
});

test('caller-owned participant, references and turn content cannot mutate stored state', () => {
  const store = new MemoryStore();
  const manager = new InteractionSessionManager(store, ids(), () => 1_000);
  const artifactRefs = ['artifact:one'];
  const pendingRefs = ['human-control:one'];
  const mutableParticipant = { kind: 'DEVICE' as const, bindingReference: 'device:mutable' };
  const opened = expectSuccess(
    manager.open({
      tenantId: TENANT,
      participant: mutableParticipant,
      modality: 'VOICE',
      dataClassification: 'INTERNAL',
      references: {
        artifactRefs,
        pendingHumanControlRequestRefs: pendingRefs,
      },
    }),
  );

  mutableParticipant.bindingReference = 'device:mutated';
  artifactRefs.push('artifact:mutated');
  pendingRefs.push('human-control:mutated');
  assert.equal(opened.session.participant.kind, 'DEVICE');
  if (opened.session.participant.kind !== 'DEVICE') throw new Error('expected device participant');
  assert.equal(opened.session.participant.bindingReference, 'device:mutable');
  assert.deepEqual(opened.session.references.artifactRefs, ['artifact:one']);
  assert.deepEqual(opened.session.references.pendingHumanControlRequestRefs, ['human-control:one']);
  assert.equal(Object.isFrozen(opened.session.participant), true);
  assert.equal(Object.isFrozen(opened.session.references), true);
  assert.equal(Object.isFrozen(opened.session.references.artifactRefs), true);

  const turnArtifacts = ['turn-artifact:one'];
  const content = { kind: 'TEXT' as const, text: 'texto original', languageTag: 'pt-BR' };
  const appended = expectSuccess(
    append(manager, {
      content,
      references: {
        artifactRefs: turnArtifacts,
        pendingHumanControlRequestRefs: [],
      },
    }),
  );
  content.text = 'texto mutado';
  turnArtifacts.push('turn-artifact:mutated');
  assert.equal(appended.session.turns[0]?.content.text, 'texto original');
  assert.deepEqual(appended.session.turns[0]?.references.artifactRefs, ['turn-artifact:one']);
  assert.equal(Object.isFrozen(appended.session.turns[0]?.content), true);
  assert.equal(Object.isFrozen(appended.session.turns[0]?.references.artifactRefs), true);
});

test('classification escalates monotonically and later downgrade is rejected', () => {
  const store = new MemoryStore();
  const manager = new InteractionSessionManager(store, ids(), () => 1_000);
  expectSuccess(open(manager, 'INTERNAL'));

  const restricted = expectSuccess(append(manager, { dataClassification: 'RESTRICTED' }));
  assert.equal(restricted.session.dataClassification, 'RESTRICTED');

  expectError(append(manager, { dataClassification: 'CONFIDENTIAL' }), 'CLASSIFICATION_DOWNGRADE');
  assert.equal(expectSuccess(manager.current(binding())).revision, 2);
});

test('fixed-modality session rejects incompatible turn modality', () => {
  const manager = new InteractionSessionManager(new MemoryStore(), ids(), () => 1_000);
  expectSuccess(open(manager));
  expectError(append(manager, { modality: 'TEXT' }), 'MODALITY_MISMATCH');
});

test('duplicate generated turn identity fails closed across interaction sessions', () => {
  const duplicate = turnId(7);
  const store = new MemoryStore();
  const manager = new InteractionSessionManager(
    store,
    ids([duplicate, duplicate], [SESSION, SESSION_B]),
    () => 1_000,
  );
  expectSuccess(open(manager));
  expectSuccess(append(manager));
  expectSuccess(open(manager));
  expectError(append(manager, { interactionSessionId: SESSION_B }), 'ID_COLLISION');
  assert.equal(expectSuccess(manager.current(binding(SESSION_B))).session.turns.length, 0);
});

test('CAS conflict is recoverable only after guards and never grants retry authority', () => {
  const store = new MemoryStore();
  const manager = new InteractionSessionManager(store, ids(), () => 1_000);
  expectSuccess(open(manager));
  store.rejectNextCas = true;
  expectError(append(manager), 'REVISION_CONFLICT', true);
  assert.equal(expectSuccess(manager.current(binding())).revision, 1);
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
    manager.suspend({ ...binding(), resumeWindowMs: 2_000 }),
  );
  assert.equal(suspended.session.state, 'SUSPENDED');
  assert.equal(suspended.session.resume.resumable, true);
  assert.equal(suspended.session.resume.resumeAfterTurnId, turn.interactionTurnId);
  assert.equal(suspended.session.resume.resumableUntil, '1970-01-01T00:00:05.000Z');

  now = 4_000;
  const resumed = expectSuccess(manager.resume(binding()));
  assert.equal(resumed.session.state, 'ACTIVE');
  assert.deepEqual(resumed.session.resume, { resumable: false });
});

test('expired and invalid resume windows fail closed', () => {
  const store = new MemoryStore();
  let now = 1_000;
  const manager = new InteractionSessionManager(store, ids(), () => now);
  expectSuccess(open(manager));
  expectError(
    manager.suspend({ ...binding(), resumeWindowMs: 999 }),
    'INVALID_RESUME_WINDOW',
  );
  expectSuccess(manager.suspend({ ...binding(), resumeWindowMs: 1_000 }));
  now = 2_000;
  expectError(manager.resume(binding()), 'RESUME_EXPIRED');
});

test('RFC3339 timestamp helper and manager reject extended-year timestamps', () => {
  assert.equal(
    asRfc3339Timestamp(MAX_RFC3339_TIMESTAMP_MS),
    '9999-12-31T23:59:59.999Z',
  );
  assert.throws(
    () => asRfc3339Timestamp(MAX_RFC3339_TIMESTAMP_MS + 1),
    /four-digit RFC3339 range/,
  );
  const manager = new InteractionSessionManager(
    new MemoryStore(),
    ids(),
    () => MAX_RFC3339_TIMESTAMP_MS + 1,
  );
  assert.throws(() => open(manager), /canonical RFC3339 range/);
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
  assert.equal(expectSuccess(manager.current(binding())).session.turns.length, 128);
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
  const ended = expectSuccess(manager.end(binding()));
  const repeated = expectSuccess(manager.end(binding()));
  assert.equal(ended.session.state, 'ENDED');
  assert.equal(repeated.revision, ended.revision);
  expectError(append(manager), 'SESSION_NOT_ACTIVE');
});
