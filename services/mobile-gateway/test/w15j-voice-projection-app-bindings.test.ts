import assert from 'node:assert/strict';
// @ts-expect-error -- Node 22 built-in in repository test harness.
import test from 'node:test';

import {
  VoiceProjectionNetworkBoundary,
  type GovernedVoiceProjection,
  type VoiceProjectionSocketContext,
} from '../src/gateway-auth/voice-projection-network.js';

const NOW = 1_000;
const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const SIGNER = 'a'.repeat(64);

function context(): VoiceProjectionSocketContext {
  return {
    tenantId: TENANT,
    actorIdentityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    correlationId: 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    gatewaySessionId: 'gws_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    connectionId: 'conn-1',
    deviceSessionId: 'dss_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    deviceId: 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    registrationVersion: 2,
  };
}

function projection(signer = SIGNER): GovernedVoiceProjection {
  return {
    kind: 'GOVERNED_VOICE_PROJECTION',
    activeTenantId: TENANT,
    registry: {
      registryKind: 'AURORA_CANONICAL_CAPABILITY_REGISTRY',
      registryVersion: '1.0.0',
      observedAtMs: 900,
      expiresAtMs: 2_000,
      provenance: { sourceRef: 'w04:dp5', contentSha256: 'b'.repeat(64) },
      entries: [
        {
          capabilityId: 'app.open',
          tenantId: TENANT,
          supportedTargetKinds: ['DEVICE'],
          currentAvailability: 'CURRENT_AVAILABLE',
          riskClass: 'LOW',
          observedAtMs: 900,
          expiresAtMs: 2_000,
        },
      ],
    },
    vocabulary: {
      vocabularyVersion: '1.0.0',
      observedAtMs: 900,
      expiresAtMs: 2_000,
      provenance: { sourceRef: 'w15g:dp5', contentSha256: 'c'.repeat(64) },
      bindings: [{ commandId: 'cmd_app_1', phrases: ['abrir aurora'], capabilityId: 'app.open' }],
    },
    nativeBindings: [
      {
        capabilityId: 'app.open',
        minApiLevel: 26,
        requiredFeatures: [],
        requiredPermissions: [],
        maxSnapshotAgeMs: 30_000,
      },
    ],
    appBindings: [
      {
        appId: 'aurora.local',
        packageName: 'ai.aurora.device.local',
        trustedSignerSha256: [signer],
        routes: [
          {
            routeId: 'aurora-main',
            kind: 'INTENT',
            action: 'android.intent.action.MAIN',
            supportsReadback: true,
          },
        ],
        maxSnapshotAgeMs: 30_000,
      },
    ],
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

test('authenticated projection carries bounded non-authoritative app binding', () => {
  const boundary = new VoiceProjectionNetworkBoundary({ current: () => projection() });
  const response = boundary.current(context(), NOW);
  assert.equal(response.statusCode, 200);
  const value = response.body.value as GovernedVoiceProjection;
  assert.equal(value.appBindings?.[0]?.appId, 'aurora.local');
  assert.equal(value.appBindings?.[0]?.trustedSignerSha256[0], SIGNER);
  assert.equal(value.authorizesExecution, false);
  assert.equal(value.retryAuthorized, false);
});

test('malformed signer binding fails closed at W14 projection boundary', () => {
  const boundary = new VoiceProjectionNetworkBoundary({
    current: () => projection(SIGNER.toUpperCase()),
  });
  const response = boundary.current(context(), NOW);
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body.voiceProjectionError, {
    code: 'VOICE_PROJECTION_PROTOCOL_VIOLATION',
  });
  assert.equal(response.body.authorizesExecution, false);
});
