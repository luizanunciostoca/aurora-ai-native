// @ts-expect-error -- mobile-gateway harness intentionally has no @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway harness intentionally has no @types/node.
import test from 'node:test';

import type { InteractionSessionId, InteractionTurnId, TenantId } from '@aurora/contracts/ids';

import {
  InteractionSessionManager,
  type InteractionSessionIdFactory,
  type InteractionSessionStore,
  type StoredInteractionSession,
} from '../src/interaction-session/index.js';

const TENANT = 'ten_01JW14V0170000000000000000' as TenantId;
const SESSION = 'ins_01JW14V0170000000000000000' as InteractionSessionId;
const TURN = 'itr_00000000000000000000000001' as InteractionTurnId;

class RejectingCreateStore implements InteractionSessionStore {
  createAttempts = 0;
  readAttempts = 0;
  reserveTurnIdAttempts = 0;
  compareAndSwapAttempts = 0;

  read(): StoredInteractionSession | null {
    this.readAttempts += 1;
    return null;
  }

  create(): boolean {
    this.createAttempts += 1;
    return false;
  }

  reserveTurnId(): boolean {
    this.reserveTurnIdAttempts += 1;
    return false;
  }

  compareAndSwap(): boolean {
    this.compareAndSwapAttempts += 1;
    return false;
  }
}

const ids: InteractionSessionIdFactory = {
  sessionId: () => SESSION,
  turnId: () => TURN,
};

test('store create rejection fails closed without authority or persisted state', () => {
  const store = new RejectingCreateStore();
  const manager = new InteractionSessionManager(store, ids, () => 1_000);

  const openInput = {
    tenantId: TENANT,
    participant: { kind: 'DEVICE', bindingReference: 'device:sm-x820' } as const,
    modality: 'VOICE' as const,
    dataClassification: 'INTERNAL' as const,
    references: {
      artifactRefs: [],
      pendingHumanControlRequestRefs: [],
    },
  };

  const result = manager.open(openInput);
  const repeated = manager.open(openInput);

  assert.equal(result.ok, false);
  if (result.ok) throw new Error('expected store rejection');
  assert.equal(result.code, 'STORE_REJECTED');
  assert.equal(result.retryable, false);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.provesExecutionSuccess, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(repeated.ok, false);
  if (repeated.ok) throw new Error('expected repeated store rejection');
  assert.equal(repeated.code, 'STORE_REJECTED');
  assert.equal(repeated.retryable, false);
  assert.equal(repeated.authorizesExecution, false);
  assert.equal(repeated.provesExecutionSuccess, false);
  assert.equal(repeated.retryAuthorized, false);
  assert.equal(store.createAttempts, 2);
  assert.equal(store.reserveTurnIdAttempts, 0);
  assert.equal(store.compareAndSwapAttempts, 0);
  assert.equal(store.readAttempts, 0);
  assert.equal(store.read(SESSION), null);
  assert.equal(store.readAttempts, 1);
});
