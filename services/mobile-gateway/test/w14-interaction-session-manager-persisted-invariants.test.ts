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
  type InteractionSessionManagerResult,
  type InteractionSessionStore,
  type StoredInteractionSession,
} from '../src/interaction-session/index.js';

const TENANT = 'ten_01JW14V0170000000000000000' as TenantId;
const CORRELATION = 'cor_01JW14V0170000000000000000' as CorrelationId;
const SESSION = 'ins_01JW14V0170000000000000000' as InteractionSessionId;
const PARTICIPANT = Object.freeze({
  kind: 'DEVICE' as const,
  bindingReference: 'device:sm-x820:persisted-invariants',
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

function expectSuccess(result: InteractionSessionManagerResult): StoredInteractionSession {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error(`unexpected manager failure: ${result.code}`);
  return result.value;
}

function expectStoreInvalid(result: InteractionSessionManagerResult): void {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error('expected persisted state to fail closed');
  assert.equal(result.code, 'STORE_INVALID');
  assert.equal(result.retryAuthorized, false);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.provesExecutionSuccess, false);
}

function open(manager: InteractionSessionManager, dataClassification = 'INTERNAL' as const) {
  return expectSuccess(
    manager.open({
      tenantId: TENANT,
      participant: PARTICIPANT,
      modality: 'VOICE',
      dataClassification,
      references: REFERENCES,
    }),
  );
}

function append(
  manager: InteractionSessionManager,
  dataClassification: 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED',
) {
  return expectSuccess(
    manager.appendTurn({
      ...binding(),
      role: 'USER',
      modality: 'VOICE',
      correlationId: CORRELATION,
      dataClassification,
      content: { kind: 'TEXT', text: `turn:${dataClassification}` },
      references: REFERENCES,
    }),
  );
}

test('persisted RFC3339 offsets cannot move an otherwise four-digit local timestamp outside the canonical UTC range', () => {
  const store = new MemoryStore();
  const manager = new InteractionSessionManager(store, ids(), () => 1_000);
  const opened = open(manager);
  store.records.set(SESSION, {
    revision: opened.revision,
    session: {
      ...opened.session,
      createdAt: '9999-12-31T23:30:00-14:00',
      updatedAt: '9999-12-31T23:30:00-14:00',
    },
  } as StoredInteractionSession);

  expectStoreInvalid(manager.current(binding()));
});

test('persisted resumable state must be suspended and must carry an expiry', () => {
  const store = new MemoryStore();
  const manager = new InteractionSessionManager(store, ids(), () => 1_000);
  const opened = open(manager);

  store.records.set(SESSION, {
    revision: opened.revision,
    session: {
      ...opened.session,
      resume: {
        resumable: true,
        resumableUntil: '1970-01-01T00:00:02.000Z',
      },
    },
  } as StoredInteractionSession);
  expectStoreInvalid(manager.current(binding()));

  store.records.set(SESSION, {
    revision: opened.revision,
    session: {
      ...opened.session,
      state: 'SUSPENDED',
      resume: { resumable: true },
    },
  } as StoredInteractionSession);
  expectStoreInvalid(manager.current(binding()));
});

test('persisted sessions reject duplicate canonical turn identities', () => {
  const store = new MemoryStore();
  const manager = new InteractionSessionManager(store, ids(), () => 1_000);
  open(manager);
  append(manager, 'INTERNAL');
  const twoTurns = append(manager, 'INTERNAL');
  const firstTurn = twoTurns.session.turns[0];
  const secondTurn = twoTurns.session.turns[1];
  assert.ok(firstTurn !== undefined && secondTurn !== undefined);

  store.records.set(SESSION, {
    revision: twoTurns.revision,
    session: {
      ...twoTurns.session,
      turns: [firstTurn, { ...secondTurn, interactionTurnId: firstTurn.interactionTurnId }],
    },
  } as StoredInteractionSession);

  expectStoreInvalid(manager.current(binding()));
});

test('persisted classification history must be monotonic and session classification must equal the highest observed turn', () => {
  const downgradeStore = new MemoryStore();
  const downgradeManager = new InteractionSessionManager(downgradeStore, ids(), () => 1_000);
  open(downgradeManager);
  append(downgradeManager, 'CONFIDENTIAL');
  const restricted = append(downgradeManager, 'RESTRICTED');
  const firstTurn = restricted.session.turns[0];
  const secondTurn = restricted.session.turns[1];
  assert.ok(firstTurn !== undefined && secondTurn !== undefined);

  downgradeStore.records.set(SESSION, {
    revision: restricted.revision,
    session: {
      ...restricted.session,
      dataClassification: 'INTERNAL',
      turns: [firstTurn, { ...secondTurn, dataClassification: 'INTERNAL' }],
    },
  } as StoredInteractionSession);
  expectStoreInvalid(downgradeManager.current(binding()));

  const mismatchStore = new MemoryStore();
  const mismatchManager = new InteractionSessionManager(mismatchStore, ids(), () => 1_000);
  open(mismatchManager);
  const highTurn = append(mismatchManager, 'RESTRICTED');
  mismatchStore.records.set(SESSION, {
    revision: highTurn.revision,
    session: { ...highTurn.session, dataClassification: 'INTERNAL' },
  } as StoredInteractionSession);
  expectStoreInvalid(mismatchManager.current(binding()));
});
