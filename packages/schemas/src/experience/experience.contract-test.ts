// @ts-expect-error -- schemas contract harness intentionally has no @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- schemas contract harness intentionally has no @types/node.
import test from 'node:test';

import {
  AuroraExperienceStateSnapshotSchema,
  UnifiedInteractionInputSchema,
  VoiceRuntimeHealthSnapshotSchema,
} from './experience.schema.js';

const tenantId = 'ten_01JW14V0170000000000000000';
const correlationId = 'cor_01JW14V0170000000000000000';
const interactionSessionId = 'ins_01JW14V0170000000000000000';
const observedAt = '2026-09-12T22:00:00.000Z';

function unifiedInput(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'UNIFIED_INTERACTION_INPUT',
    schemaVersion: 1,
    tenantId,
    correlationId,
    interactionSessionId,
    source: 'WAKE_WORD',
    modality: 'VOICE',
    content: {
      kind: 'TEXT',
      text: 'Aurora, abra o Spotify',
      languageTag: 'pt-BR',
      speechConfidence: 0.96,
    },
    observedAt,
    dataClassification: 'INTERNAL',
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
    ...overrides,
  };
}

test('unifies wake voice and typed input without granting authority', () => {
  const voice = UnifiedInteractionInputSchema.parse(unifiedInput());
  assert.equal(voice.source, 'WAKE_WORD');
  assert.equal(voice.modality, 'VOICE');
  assert.equal(voice.authorizesExecution, false);
  assert.equal(voice.retryAuthorized, false);

  const text = UnifiedInteractionInputSchema.parse(
    unifiedInput({ source: 'TEXT_INPUT', modality: 'TEXT' }),
  );
  assert.equal(text.source, 'TEXT_INPUT');
  assert.equal(text.modality, 'TEXT');
});

test('rejects source/modality spoofing, raw audio, and authority injection', () => {
  assert.equal(
    UnifiedInteractionInputSchema.safeParse(
      unifiedInput({ source: 'TEXT_INPUT', modality: 'VOICE' }),
    ).success,
    false,
  );
  assert.equal(
    UnifiedInteractionInputSchema.safeParse(
      unifiedInput({
        content: {
          kind: 'TEXT',
          text: 'raw audio attempt',
          languageTag: 'pt-BR',
          audio: 'pcm-bytes',
        },
      }),
    ).success,
    false,
  );
  assert.equal(
    UnifiedInteractionInputSchema.safeParse(unifiedInput({ authorizesExecution: true })).success,
    false,
  );
});

test('experience projection supports speaking state but remains non-authoritative', () => {
  const snapshot = AuroraExperienceStateSnapshotSchema.parse({
    kind: 'AURORA_EXPERIENCE_STATE',
    schemaVersion: 1,
    tenantId,
    correlationId,
    interactionSessionId,
    state: 'SPEAKING',
    observedAt,
    staleAfter: '2026-09-12T22:00:05.000Z',
    reasonCode: 'TTS_ACTIVE',
    reasonReference: 'voice-runtime:tts',
    dataClassification: 'INTERNAL',
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  });
  assert.equal(snapshot.state, 'SPEAKING');
  assert.equal(snapshot.authorizesExecution, false);
});

test('execution uncertain projection requires canonical reference and freshness', () => {
  const base = {
    kind: 'AURORA_EXPERIENCE_STATE',
    schemaVersion: 1,
    tenantId,
    correlationId,
    interactionSessionId,
    state: 'EXECUTION_UNCERTAIN',
    observedAt,
    staleAfter: '2026-09-12T22:00:05.000Z',
    reasonCode: 'RECONCILIATION_PENDING',
    reasonReference: 'execution-reconciliation:exe_01JW14V0170000000000000000',
    dataClassification: 'INTERNAL',
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };

  const parsed = AuroraExperienceStateSnapshotSchema.parse(base);
  assert.equal(parsed.state, 'EXECUTION_UNCERTAIN');
  assert.equal(parsed.reasonReference, base.reasonReference);
  assert.equal(
    AuroraExperienceStateSnapshotSchema.safeParse({ ...base, reasonReference: undefined }).success,
    false,
  );
  assert.equal(
    AuroraExperienceStateSnapshotSchema.safeParse({ ...base, staleAfter: undefined }).success,
    false,
  );
});

test('experience projection rejects stale bounds before the observation', () => {
  assert.equal(
    AuroraExperienceStateSnapshotSchema.safeParse({
      kind: 'AURORA_EXPERIENCE_STATE',
      schemaVersion: 1,
      tenantId,
      correlationId,
      interactionSessionId,
      state: 'SPEAKING',
      observedAt,
      staleAfter: '2026-09-12T21:59:59.999Z',
      dataClassification: 'INTERNAL',
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    }).success,
    false,
  );
});

test('voice supervisor health rejects duplicate components and false healthy aggregate', () => {
  const base = {
    kind: 'VOICE_RUNTIME_HEALTH',
    schemaVersion: 1,
    tenantId,
    correlationId,
    interactionSessionId,
    state: 'DEGRADED',
    components: [
      { component: 'WAKE_WORD', state: 'HEALTHY' },
      {
        component: 'STT',
        state: 'DEGRADED',
        reasonCode: 'NETWORK_FALLBACK',
      },
    ],
    observedAt,
    dataClassification: 'INTERNAL',
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
  const degraded = VoiceRuntimeHealthSnapshotSchema.parse(base);
  assert.equal(degraded.state, 'DEGRADED');

  assert.equal(
    VoiceRuntimeHealthSnapshotSchema.safeParse({
      ...base,
      components: [
        { component: 'STT', state: 'DEGRADED' },
        { component: 'STT', state: 'HEALTHY' },
      ],
    }).success,
    false,
  );
  assert.equal(
    VoiceRuntimeHealthSnapshotSchema.safeParse({ ...base, state: 'HEALTHY' }).success,
    false,
  );
  assert.equal(
    VoiceRuntimeHealthSnapshotSchema.safeParse({ ...base, state: 'HEALTHY', components: [] })
      .success,
    false,
  );
  assert.equal(
    VoiceRuntimeHealthSnapshotSchema.safeParse({
      ...base,
      state: 'HEALTHY',
      components: [{ component: 'WAKE_WORD', state: 'HEALTHY' }],
    }).success,
    false,
  );

  const healthy = VoiceRuntimeHealthSnapshotSchema.parse({
    ...base,
    state: 'HEALTHY',
    components: [
      { component: 'WAKE_WORD', state: 'HEALTHY' },
      { component: 'MICROPHONE', state: 'HEALTHY' },
      { component: 'STT', state: 'HEALTHY' },
      { component: 'TTS', state: 'HEALTHY' },
      { component: 'AUDIO_FOCUS', state: 'HEALTHY' },
      { component: 'GATEWAY', state: 'HEALTHY' },
    ],
  });
  assert.equal(healthy.components.length, 6);
});
