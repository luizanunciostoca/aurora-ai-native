// @ts-expect-error -- mobile-gateway tests target Node 22 without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway tests target Node 22 without repository-wide @types/node.
import test from 'node:test';

import type { W07DeviceReceiptEvidenceIngressPort } from '../../device-receipt-ingress/types.js';
import type { VoiceCandidateIntakePort } from '../../gateway-auth/voice-candidate-network.js';
import { W14CurrentDeviceTargetBindingSource } from '../current-device-target-source.js';
import type { W14LocalGovernedDeviceDispatchPort } from '../governed-device-dispatch.js';
import { W15JLocalPhysicalHost } from '../local-physical-host.js';
import { W03PostgresExecutionAttemptQuotaSource } from '../w03-attempt-quota-source.js';
import { W03PostgresCurrentContainmentStateSource } from '../w03-containment-state.js';
import type { LocalW07IdempotencyFencePort } from '../w03-execution-fence.js';

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
      receiptEvidenceIngress,
    },
  );

  assert.strictEqual(dispatch, host.governedDeviceDispatch);
  assert.equal(typeof fence?.reserve, 'function');
  assert.equal(targets instanceof W14CurrentDeviceTargetBindingSource, true);
  assert.equal(attemptQuota instanceof W03PostgresExecutionAttemptQuotaSource, true);
  assert.equal(containment instanceof W03PostgresCurrentContainmentStateSource, true);
});
