// @ts-expect-error -- mobile-gateway test harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway test harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type {
  VoiceCandidateIntakePort,
  VoiceCandidateSocketContext,
} from '../src/gateway-auth/voice-candidate-network.js';
import type { GovernedVoiceProjection } from '../src/gateway-auth/voice-projection-network.js';
import { withCurrentVoiceProjection } from '../src/physical-host/voice-projection-intake-adapter.js';

const CONTEXT: VoiceCandidateSocketContext = {
  tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  actorIdentityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  correlationId: 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  gatewaySessionId: 'gateway-session-1',
  connectionId: 'connection-1',
  deviceSessionId: 'device-session-1',
  deviceId: 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  registrationVersion: 2,
};

const PROJECTION = {
  kind: 'GOVERNED_VOICE_PROJECTION',
  activeTenantId: CONTEXT.tenantId,
  registry: {
    registryKind: 'AURORA_CANONICAL_CAPABILITY_REGISTRY',
    registryVersion: '1.0.0',
    observedAtMs: 100,
    expiresAtMs: 1_000,
    provenance: {
      sourceRef: 'w04:dp5:projection',
      contentSha256: 'a'.repeat(64),
    },
    entries: [],
  },
  vocabulary: {
    vocabularyVersion: '1.0.0',
    observedAtMs: 100,
    expiresAtMs: 1_000,
    provenance: {
      sourceRef: 'w15g:dp5:vocabulary',
      contentSha256: 'b'.repeat(64),
    },
    bindings: [],
  },
  nativeBindings: [],
  authorizesExecution: false,
  provesExecutionSuccess: false,
  retryAuthorized: false,
} as unknown as GovernedVoiceProjection;

test('delegates W07 evaluation and current execution authorization unchanged while adding projection', () => {
  let evaluateCalls = 0;
  let authorizationCalls = 0;
  let projectionCalls = 0;
  const intake: VoiceCandidateIntakePort = {
    evaluate: (input) => {
      evaluateCalls += 1;
      return { observedCommandId: input.candidate.commandId };
    },
    currentExecutionAuthorization: (input) => {
      authorizationCalls += 1;
      return {
        kind: 'W07_DEVICE_EXECUTION_AUTHORIZATION',
        executionId: input.executionId,
        tenantId: input.context.tenantId,
        deviceId: input.context.deviceId,
        capabilityId: 'audio.volume.set',
        targetKind: 'DEVICE',
        authoritySource: 'W07_CURRENT_EXECUTION_AUTHORITY',
        actionId: 'AUDIO_VOLUME_STEP_UP',
        arguments: {},
        authorizedAtMs: 500,
        expiresAtMs: 600,
        authorizesExecution: true,
        cancelled: false,
      };
    },
  };
  const wrapped = withCurrentVoiceProjection(intake, {
    current: ({ context, nowMs }) => {
      projectionCalls += 1;
      assert.equal(context, CONTEXT);
      assert.equal(nowMs, 550);
      return PROJECTION;
    },
  });

  const evaluated = wrapped.evaluate({
    candidate: {
      commandId: 'volume-up',
      capabilityId: 'audio.volume.set',
      normalizedTranscript: 'aumentar volume',
      requiresW07Authorization: true,
      authorizesExecution: false,
    },
    context: CONTEXT,
  }) as { observedCommandId: string };
  assert.equal(evaluated.observedCommandId, 'volume-up');
  assert.equal(evaluateCalls, 1);

  assert.equal(wrapped.currentProjection?.({ context: CONTEXT, nowMs: 550 }), PROJECTION);
  assert.equal(projectionCalls, 1);

  const authorization = wrapped.currentExecutionAuthorization?.({
    commandId: 'volume-up',
    executionId: 'exe_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    context: CONTEXT,
    nowMs: 550,
  });
  assert.equal(authorization?.actionId, 'AUDIO_VOLUME_STEP_UP');
  assert.equal(authorization?.authorizesExecution, true);
  assert.equal(authorizationCalls, 1);
});

test('does not invent current execution authorization when the W07 intake has none', () => {
  const wrapped = withCurrentVoiceProjection(
    { evaluate: () => ({ ok: false }) },
    { current: () => PROJECTION },
  );
  assert.equal(wrapped.currentExecutionAuthorization, undefined);
  assert.equal(wrapped.currentProjection?.({ context: CONTEXT, nowMs: 550 }), PROJECTION);
});

test('rejects invalid intake or projection source composition', () => {
  assert.throws(
    () => withCurrentVoiceProjection({} as VoiceCandidateIntakePort, { current: () => PROJECTION }),
    /valid W07 intake/u,
  );
  assert.throws(
    () =>
      withCurrentVoiceProjection(
        { evaluate: () => ({}) },
        {} as { current: () => GovernedVoiceProjection | null },
      ),
    /valid projection source/u,
  );
});
