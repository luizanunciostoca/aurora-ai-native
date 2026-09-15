// @ts-expect-error -- mobile-gateway tests target Node 22 without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway tests target Node 22 without repository-wide @types/node.
import test from 'node:test';

import type { W07DeviceReceiptEvidenceIngressPort } from '../../device-receipt-ingress/types.js';
import type { VoiceCandidateIntakePort } from '../../gateway-auth/voice-candidate-network.js';
import { W14CurrentDeviceTargetBindingSource } from '../current-device-target-source.js';
import type { W14LocalGovernedDeviceDispatchPort } from '../governed-device-dispatch.js';
import {
  W15JLocalPhysicalHost,
  type LocalW07AttemptLifecyclePort,
  type LocalW07ContainmentLifecyclePort,
} from '../local-physical-host.js';
import { W03PostgresExecutionAttemptQuotaCas } from '../w03-attempt-quota-cas.js';
import { W03PostgresExecutionAttemptQuotaSource } from '../w03-attempt-quota-source.js';
import { W03PostgresCurrentContainmentStateSource } from '../w03-containment-state.js';
import { W03PostgresContainmentStateStore } from '../w03-containment-state-write.js';
import type { LocalW07IdempotencyFencePort } from '../w03-execution-fence.js';
import { W03PostgresHalfOpenProbeLease } from '../w03-half-open-probe-lease.js';

const voiceIntake: VoiceCandidateIntakePort = {
  evaluate: () => ({ ok: false, authorizesExecution: false, retryAuthorized: false }),
};

const receiptEvidenceIngress: W07DeviceReceiptEvidenceIngressPort = {
  observe: () => ({
    ok: false,
    code: 'UNAVAILABLE',
    retryable: true,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  }),
};

test('factory receives current W14/W03 owners including durable attempt quota and containment', () => {
  let dispatch: W14LocalGovernedDeviceDispatchPort | null = null;
  let fence: LocalW07IdempotencyFencePort | null = null;
  let targets: W14CurrentDeviceTargetBindingSource | null = null;
  let attemptQuota: W03PostgresExecutionAttemptQuotaSource | null = null;
  let containment: W03PostgresCurrentContainmentStateSource | null = null;
  let lifecycleAttemptQuota: W03PostgresExecutionAttemptQuotaSource | null = null;
  let attemptQuotaWrite: W03PostgresExecutionAttemptQuotaCas | null = null;
  let lifecycleContainment: W03PostgresCurrentContainmentStateSource | null = null;
  let containmentWrite: W03PostgresContainmentStateStore | null = null;
  let probeLease: W03PostgresHalfOpenProbeLease | null = null;
  let circuitTransitions = 0;
  let killSwitchTransitions = 0;
  let operationalTransitions = 0;
  let attemptAdvances = 0;
  let attemptSeals = 0;

  const lifecycle: LocalW07ContainmentLifecyclePort = {
    transitionCircuit: () => {
      circuitTransitions += 1;
      return {
        ok: false,
        code: 'STATE_UNAVAILABLE',
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      };
    },
    transitionKillSwitch: () => {
      killSwitchTransitions += 1;
      return {
        ok: false,
        code: 'STATE_UNAVAILABLE',
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      };
    },
    transitionOperational: () => {
      operationalTransitions += 1;
      return {
        ok: false,
        code: 'STATE_UNAVAILABLE',
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      };
    },
  };

  const attemptLifecycle: LocalW07AttemptLifecyclePort = {
    reconcileAndAdvance: () => {
      attemptAdvances += 1;
      return {
        status: 'REJECTED',
        reason: 'PERSISTENCE_UNAVAILABLE',
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      };
    },
    reconcileAndSealTerminal: () => {
      attemptSeals += 1;
      return {
        status: 'REJECTED',
        reason: 'PERSISTENCE_UNAVAILABLE',
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      };
    },
  };

  const host = new W15JLocalPhysicalHost(
    {
      databaseUrl: 'postgresql://unused.invalid/aurora_physical',
      gatewayPort: 0,
      bootstrapPort: 0,
      clock: () => 1_788_670_000_000,
    },
    {
      createVoiceIntake: (
        w14Dispatch,
        idempotencyFence,
        targetBindings,
        attemptQuotaState,
        containmentState,
      ) => {
        dispatch = w14Dispatch;
        fence = idempotencyFence;
        targets = targetBindings;
        attemptQuota = attemptQuotaState;
        containment = containmentState;
        return voiceIntake;
      },
      createContainmentLifecycle: (containmentState, containmentStore, halfOpenProbeFence) => {
        lifecycleContainment = containmentState;
        containmentWrite = containmentStore;
        probeLease = halfOpenProbeFence;
        return lifecycle;
      },
      createAttemptLifecycle: (attemptQuotaState, attemptQuotaPersistence) => {
        lifecycleAttemptQuota = attemptQuotaState;
        attemptQuotaWrite = attemptQuotaPersistence;
        return attemptLifecycle;
      },
      receiptEvidenceIngress,
    },
  );

  assert.strictEqual(dispatch, host.governedDeviceDispatch);
  assert.equal(typeof fence?.reserve, 'function');
  assert.equal(targets instanceof W14CurrentDeviceTargetBindingSource, true);
  assert.equal(attemptQuota instanceof W03PostgresExecutionAttemptQuotaSource, true);
  assert.equal(containment instanceof W03PostgresCurrentContainmentStateSource, true);
  assert.strictEqual(lifecycleContainment, containment);
  assert.equal(containmentWrite instanceof W03PostgresContainmentStateStore, true);
  assert.equal(probeLease instanceof W03PostgresHalfOpenProbeLease, true);
  assert.strictEqual(lifecycleAttemptQuota, attemptQuota);
  assert.equal(attemptQuotaWrite instanceof W03PostgresExecutionAttemptQuotaCas, true);

  const circuit = host.transitionContainmentCircuit({
    tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    circuitKey: 'device:camera:local',
    observedAt: '2026-09-06T00:00:01.000Z',
    event: 'FAILURE',
    failureThreshold: 2,
    recoveryAfterMs: 60_000,
  });
  const kill = host.transitionContainmentKillSwitch({
    tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    circuitKey: 'device:camera:local',
    changedAt: '2026-09-06T00:00:02.000Z',
    command: 'DEACTIVATE',
    recoveryGate: 'NOT_VALIDATED',
  });
  const operational = host.transitionContainmentOperational({
    tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    circuitKey: 'device:camera:local',
    observedAt: '2026-09-06T00:00:03.000Z',
    command: 'REQUEST_CANCELLATION',
    authorizesExecution: false,
  });
  const attemptAdvance = host.reconcileAndAdvanceExecutionAttempt({});
  const attemptSeal = host.reconcileAndSealExecutionAttempt({});
  assert.equal(circuitTransitions, 1);
  assert.equal(killSwitchTransitions, 1);
  assert.equal(operationalTransitions, 1);
  assert.equal(attemptAdvances, 1);
  assert.equal(attemptSeals, 1);
  assert.equal(circuit.authorizesExecution, false);
  assert.equal(circuit.provesExecutionSuccess, false);
  assert.equal(circuit.retryAuthorized, false);
  assert.equal(kill.authorizesExecution, false);
  assert.equal(kill.provesExecutionSuccess, false);
  assert.equal(kill.retryAuthorized, false);
  assert.equal(operational.authorizesExecution, false);
  assert.equal(operational.provesExecutionSuccess, false);
  assert.equal(operational.retryAuthorized, false);
  assert.equal(attemptAdvance.authorizesExecution, false);
  assert.equal(attemptAdvance.provesExecutionSuccess, false);
  assert.equal(attemptAdvance.retryAuthorized, false);
  assert.equal(attemptSeal.authorizesExecution, false);
  assert.equal(attemptSeal.provesExecutionSuccess, false);
  assert.equal(attemptSeal.retryAuthorized, false);
});

test('evaluation-only host keeps server containment mutation surface fail-closed', () => {
  const host = new W15JLocalPhysicalHost(
    {
      databaseUrl: 'postgresql://unused.invalid/aurora_physical',
      gatewayPort: 0,
      bootstrapPort: 0,
      clock: () => 1_788_670_000_000,
    },
    { voiceIntake, receiptEvidenceIngress },
  );

  const result = host.transitionContainmentKillSwitch({
    tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    circuitKey: 'device:camera:local',
    changedAt: '2026-09-06T00:00:02.000Z',
    command: 'ACTIVATE',
    recoveryGate: 'NOT_REQUIRED',
  });
  assert.equal(result.ok, false);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.provesExecutionSuccess, false);
  assert.equal(result.retryAuthorized, false);

  const operational = host.transitionContainmentOperational({
    tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    circuitKey: 'device:camera:local',
    observedAt: '2026-09-06T00:00:03.000Z',
    command: 'BEGIN_IN_FLIGHT',
    authorizesExecution: false,
  });
  assert.equal(operational.ok, false);
  assert.equal(operational.authorizesExecution, false);
  assert.equal(operational.provesExecutionSuccess, false);
  assert.equal(operational.retryAuthorized, false);

  const attempt = host.reconcileAndAdvanceExecutionAttempt({});
  assert.equal(attempt.status, 'REJECTED');
  assert.equal(attempt.authorizesExecution, false);
  assert.equal(attempt.provesExecutionSuccess, false);
  assert.equal(attempt.retryAuthorized, false);
});
