// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- test harness intentionally relies on Node 22 built-ins without @types/node.
import test from 'node:test';

import {
  VoiceCandidateNetworkBoundary,
  type VoiceCandidateSocketContext,
} from '../voice-candidate-network.js';

const context: VoiceCandidateSocketContext = {
  tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  actorIdentityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  correlationId: 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  gatewaySessionId: 'gateway-session-1',
  connectionId: 'gateway-connection-1',
  deviceSessionId: 'device-session-1',
  deviceId: 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV',
  registrationVersion: 2,
};

const candidate = {
  commandId: 'voice:open-dashboard',
  capabilityId: 'device.app.open',
  normalizedTranscript: 'abrir painel',
  requiresW07Authorization: true,
  authorizesExecution: false,
};

test('forwards only bounded candidate plus server-derived context and sanitizes successful evaluation', () => {
  let observed: unknown = null;
  const boundary =
    new VoiceCandidateNetworkBoundary({
      evaluate: (input) => {
        observed = input;
        return {
          ok: true,
          acceptedForEvaluation: true,
          gate: { executionEligible: true, secretAuthorityEvidence: 'must-not-cross-network' },
          authorizesExecution: false,
          provesExecutionSuccess: false,
          retryAuthorized: false,
        };
      },
    });

  const response = boundary.evaluate(candidate, context);
  assert.equal(response.statusCode, 202);
  assert.deepEqual(response.body, {
    ok: true,
    acceptedForEvaluation: true,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  });
  assert.deepEqual(observed, { candidate, context });
  assert.equal(JSON.stringify(response.body).includes('secretAuthorityEvidence'), false);
  assert.equal(JSON.stringify(response.body).includes('executionEligible'), false);
});

test('rejects client-supplied identity policy trust outcome and retry fields before W07 intake', () => {
  let calls = 0;
  const boundary =
    new VoiceCandidateNetworkBoundary({
      evaluate: () => {
        calls += 1;
        return {
          ok: true,
          acceptedForEvaluation: true,
          authorizesExecution: false,
          provesExecutionSuccess: false,
          retryAuthorized: false,
        };
      },
    });

  for (const injected of [
    { tenantId: 'ten_forged' },
    { actorIdentityId: 'idn_forged' },
    { policyTokenId: 'tok_forged' },
    { deviceTrust: 'TRUSTED' },
    { serverTime: 123 },
    { provesExecutionSuccess: true },
    { retryAuthorized: true },
  ]) {
    const response = boundary.evaluate({ ...candidate, ...injected }, context);
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.authorizesExecution, false);
    assert.equal(response.body.retryAuthorized, false);
  }
  assert.equal(calls, 0);
});

test('requires the canonical negative authority flags from W15 candidate', () => {
  const boundary = new VoiceCandidateNetworkBoundary({ evaluate: () => null });
  const authorityInjected = boundary.evaluate({ ...candidate, authorizesExecution: true }, context);
  const w07Bypass = boundary.evaluate({ ...candidate, requiresW07Authorization: false }, context);
  assert.equal(authorityInjected.statusCode, 400);
  assert.equal(w07Bypass.statusCode, 400);
});

test('fails closed when authenticated context is incomplete', () => {
  let calls = 0;
  const boundary =
    new VoiceCandidateNetworkBoundary({
      evaluate: () => {
        calls += 1;
        return null;
      },
    });
  const response = boundary.evaluate(candidate, { ...context, deviceSessionId: '' });
  assert.equal(response.statusCode, 409);
  assert.equal(response.body.authorizesExecution, false);
  assert.equal(calls, 0);
});

test('rejects malformed, authority-bearing, or unavailable W07 responses without exposing details', () => {
  const malformed =
    new VoiceCandidateNetworkBoundary({
      evaluate: () => ({
        ok: true,
        acceptedForEvaluation: true,
        authorizesExecution: true,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      }),
    }).evaluate(candidate, context);
  assert.equal(malformed.statusCode, 503);
  assert.equal(malformed.body.authorizesExecution, false);

  const denied =
    new VoiceCandidateNetworkBoundary({
      evaluate: () => ({
        ok: false,
        acceptedForEvaluation: false,
        error: { code: 'CANONICAL_RESOLUTION_UNAVAILABLE', detail: 'private' },
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      }),
    }).evaluate(candidate, context);
  assert.equal(denied.statusCode, 409);
  assert.equal(JSON.stringify(denied.body).includes('private'), false);

  const unavailable =
    new VoiceCandidateNetworkBoundary({
      evaluate: () => {
        throw new Error('backend detail must not escape');
      },
    }).evaluate(candidate, context);
  assert.equal(unavailable.statusCode, 503);
  assert.equal(JSON.stringify(unavailable.body).includes('backend detail'), false);
  assert.equal(unavailable.body.retryAuthorized, false);
});
