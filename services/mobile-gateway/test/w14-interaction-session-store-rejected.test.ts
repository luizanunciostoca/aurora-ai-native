// @ts-expect-error -- mobile-gateway harness intentionally has no @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway harness intentionally has no @types/node.
import test from 'node:test';

import type {
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
const SESSION = 'ins_01JW14V0170000000000000000' as InteractionSessionId;
const TURN = 'itr_00000000000000000000000001' as InteractionTurnId;

class RejectingCreateStore implements InteractionSessionStore {
  createAttempts = 0;

  read(): StoredInteractionSession | null {
    return null;
  }

  create(): boolean {
    this.createAttempts += 1;
    return false;
  }

  reserveTurnId(): boolean {
    return false;
  }

  compareAndSwap(): boolean {
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

  const result = manager.open({
    tenantId: TENANT,
    participant: { kind: 'DEVICE', bindingReference: 'device:sm-x820' },
    modality: 'VOICE',
    dataClassification: 'INTERNAL',
    references: {
      artifactRefs: [],
      pendingHumanControlRequestRefs: [],
    },
  });

  assert.equal(result.ok, false);
  if (result.ok) throw new Error('expected store rejection');
  assert.equal(result.code, 'STORE_REJECTED');
  assert.equal(result.retryable, false);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.provesExecutionSuccess, false);
  assert.equal(result.retryAuthorized, false);
  assert.equal(store.createAttempts, 1);
  assert.equal(store.read(SESSION), null);
});
