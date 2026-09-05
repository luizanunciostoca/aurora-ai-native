// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import { Buffer } from 'node:buffer';
// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import { generateKeyPairSync, sign } from 'node:crypto';
// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import { Agent, request as httpRequest } from 'node:http';
// @ts-expect-error -- mobile-gateway harness uses Node 22 built-ins without repository-wide @types/node.
import test from 'node:test';

import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';

import type { W07DeviceReceiptEvidenceIngressPort } from '../../device-receipt-ingress/types.js';
import type { AuthenticatedGatewayBootstrapPrincipal } from '../../gateway-auth/gateway-bootstrap.js';
import type { VoiceCandidateIntakePort } from '../../gateway-auth/voice-candidate-network.js';
import { W15JLocalPhysicalHost } from '../local-physical-host.js';

const NOW = 1_788_631_000_000;
const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId;
const ACTOR = 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV' as IdentityId;
const CORRELATION = 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CorrelationId;
const DEVICE_ID = 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const DEVICE_SESSION_ID = 'device-session:same-socket-voice';
const COMMAND_ID = 'cmd_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const CAPABILITY_ID = 'camera.open';

interface HttpResponseLike {
  readonly statusCode?: number;
  setEncoding(encoding: 'utf8'): void;
  on(event: 'data', listener: (chunk: string) => void): this;
  on(event: 'end', listener: () => void): this;
}

interface HttpRequestLike {
  on(event: 'error', listener: (error: Error) => void): this;
  end(body: string): void;
}

interface AgentLike {
  destroy(): void;
}

interface PostedResponse {
  readonly statusCode: number;
  readonly body: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function postJson(
  port: number,
  path: string,
  body: unknown,
  agent: object,
): Promise<PostedResponse> {
  const rawBody = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'POST',
        agent,
        headers: {
          connection: 'keep-alive',
          'content-type': 'application/json',
          'content-length': new TextEncoder().encode(rawBody).byteLength,
        },
      },
      (incoming: HttpResponseLike) => {
        let raw = '';
        incoming.setEncoding('utf8');
        incoming.on('data', (chunk) => {
          raw += chunk;
        });
        incoming.on('end', () => {
          try {
            resolve({ statusCode: incoming.statusCode ?? 0, body: JSON.parse(raw) as unknown });
          } catch (error) {
            reject(error instanceof Error ? error : new Error('response JSON parse failed'));
          }
        });
      },
    ) as HttpRequestLike;
    outgoing.on('error', reject);
    outgoing.end(rawBody);
  });
}

function successfulValue(response: PostedResponse): Record<string, unknown> {
  assert.equal(response.statusCode, 200);
  assert.equal(isRecord(response.body), true);
  if (!isRecord(response.body) || response.body.ok !== true || !isRecord(response.body.value)) {
    throw new Error('expected wrapped successful value');
  }
  return response.body.value;
}

function successfulRecord(response: PostedResponse): Record<string, unknown> {
  assert.equal(response.statusCode, 200);
  assert.equal(isRecord(response.body), true);
  if (!isRecord(response.body) || response.body.ok !== true) {
    throw new Error('expected successful manager record');
  }
  return response.body;
}

function proofFactory() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const exported = publicKey.export({ format: 'der', type: 'spki' });
  const spki = Buffer.from(exported).toString('base64url');
  return (message: string): string => {
    const signature = sign('sha256', Buffer.from(message, 'utf8'), privateKey).toString('base64url');
    return Buffer.from(JSON.stringify({ v: '1', alg: 'ES256', spki, signature }), 'utf8').toString(
      'base64url',
    );
  };
}

function registrationMessage(input: {
  readonly gatewaySessionId: string;
  readonly connectionId: string;
  readonly generation: number;
}): string {
  return [
    'AURORA_DEVICE_REGISTRATION_V1',
    input.gatewaySessionId,
    input.connectionId,
    String(input.generation),
    DEVICE_ID,
    TENANT,
    ACTOR,
    CORRELATION,
  ].join('\n');
}

function attestationMessage(input: {
  readonly gatewaySessionId: string;
  readonly connectionId: string;
  readonly generation: number;
  readonly registrationVersion: number;
}): string {
  return [
    'AURORA_DEVICE_ATTESTATION_V1',
    input.gatewaySessionId,
    input.connectionId,
    String(input.generation),
    DEVICE_ID,
    String(input.registrationVersion),
    DEVICE_SESSION_ID,
    '-',
  ].join('\n');
}

const principal: AuthenticatedGatewayBootstrapPrincipal = {
  tenantId: TENANT,
  actor: { kind: 'HUMAN', identityId: ACTOR },
  correlationId: CORRELATION,
  deviceId: DEVICE_ID,
  deviceSessionId: DEVICE_SESSION_ID,
  authenticatedAtMs: NOW - 1_000,
  authenticationExpiresAtMs: NOW + 120_000,
  authenticationReference: 'upstream-auth:same-socket-voice',
  authorizesExecution: false,
  canGrantPermission: false,
};

const receiptEvidenceIngress: W07DeviceReceiptEvidenceIngressPort = {
  observe: () => ({
    ok: false,
    code: 'UNUSED_IN_VOICE_TEST',
    retryable: false,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  }),
};

test('real bootstrap gateway crypto registration trust and voice route share one authenticated W14 socket', async () => {
  let observedVoice: unknown = null;
  const voiceIntake: VoiceCandidateIntakePort = {
    evaluate: (input) => {
      observedVoice = input;
      return {
        ok: true,
        acceptedForEvaluation: true,
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      };
    },
  };
  const host = new W15JLocalPhysicalHost(
    {
      databaseUrl: 'postgresql://unused.invalid/aurora_same_socket_voice',
      gatewayPort: 0,
      bootstrapPort: 0,
      clock: () => NOW,
    },
    { voiceIntake, receiptEvidenceIngress },
  );
  const staged = host.stageBootstrap(principal);
  assert.equal(staged.ok, true);
  if (!staged.ok) throw new Error('bootstrap stage failed');

  const address = await host.start();
  const bootstrapAgent = new Agent({ keepAlive: false }) as AgentLike;
  const gatewayAgent = new Agent({ keepAlive: true, maxSockets: 1 }) as AgentLike;
  const signProof = proofFactory();

  try {
    const exchange = await postJson(
      address.bootstrap.port,
      address.bootstrap.path,
      { bootstrapReference: staged.value.bootstrapReference },
      bootstrapAgent,
    );
    const grant = successfulValue(exchange);
    assert.equal(typeof grant.gatewaySessionId, 'string');
    assert.equal(typeof grant.credential, 'string');
    const gatewaySessionId = String(grant.gatewaySessionId);

    const opened = await postJson(
      address.gateway.port,
      '/v1/gateway/sessions/open',
      {
        protocolVersion: '1.0',
        sessionId: gatewaySessionId,
        credential: grant.credential,
        tenantId: grant.tenantId,
        actor: grant.actor,
        correlation: { correlationId: grant.correlationId },
      },
      gatewayAgent,
    );
    const gateway = successfulValue(opened);
    const connectionId = String(gateway.connectionId);
    const generation = Number(gateway.generation);
    assert.equal(generation, 1);
    assert.equal(gateway.authorizesExecution, false);

    const registered = await postJson(
      address.gateway.port,
      '/v1/device/registrations/register',
      {
        deviceId: DEVICE_ID,
        proof: signProof(registrationMessage({ gatewaySessionId, connectionId, generation })),
      },
      gatewayAgent,
    );
    const registeredResult = successfulRecord(registered);
    assert.equal(isRecord(registeredResult.record), true);
    if (!isRecord(registeredResult.record) || !isRecord(registeredResult.record.ref)) {
      throw new Error('registration response missing canonical DeviceRef');
    }
    assert.equal(registeredResult.record.state, 'REGISTERED');
    assert.equal(registeredResult.record.authorizesExecution, false);

    const activated = await postJson(
      address.gateway.port,
      '/v1/device/registrations/activate',
      {},
      gatewayAgent,
    );
    const activeResult = successfulRecord(activated);
    assert.equal(isRecord(activeResult.record), true);
    if (!isRecord(activeResult.record) || !isRecord(activeResult.record.ref)) {
      throw new Error('activation response missing canonical DeviceRef');
    }
    const registrationVersion = Number(activeResult.record.ref.registrationVersion);
    assert.equal(activeResult.record.state, 'ACTIVE');
    assert.equal(registrationVersion, 2);

    const trusted = await postJson(
      address.gateway.port,
      '/v1/device/sessions/open',
      {
        deviceSessionId: DEVICE_SESSION_ID,
        proof: signProof(
          attestationMessage({
            gatewaySessionId,
            connectionId,
            generation,
            registrationVersion,
          }),
        ),
      },
      gatewayAgent,
    );
    const trustResult = successfulRecord(trusted);
    assert.equal(isRecord(trustResult.snapshot), true);
    if (!isRecord(trustResult.snapshot)) throw new Error('device trust snapshot missing');
    assert.equal(trustResult.snapshot.state, 'ACTIVE');
    assert.equal(trustResult.snapshot.executionPreconditionSatisfied, true);
    assert.equal(trustResult.snapshot.requiresCurrentAuthorityValidation, true);
    assert.equal(trustResult.snapshot.authorizesExecution, false);

    const candidate = {
      commandId: COMMAND_ID,
      capabilityId: CAPABILITY_ID,
      normalizedTranscript: 'open camera',
      requiresW07Authorization: true,
      authorizesExecution: false,
    } as const;
    const voice = await postJson(
      address.gateway.port,
      '/v1/device/voice/candidates/evaluate',
      candidate,
      gatewayAgent,
    );
    assert.equal(voice.statusCode, 202);
    assert.deepEqual(voice.body, {
      ok: true,
      acceptedForEvaluation: true,
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    });
    assert.deepEqual(observedVoice, {
      candidate,
      context: {
        tenantId: TENANT,
        actorIdentityId: ACTOR,
        correlationId: CORRELATION,
        gatewaySessionId,
        connectionId,
        deviceSessionId: DEVICE_SESSION_ID,
        deviceId: DEVICE_ID,
        registrationVersion,
      },
    });

    const injected = await postJson(
      address.gateway.port,
      '/v1/device/voice/candidates/evaluate',
      { ...candidate, tenantId: 'ten_attacker', retryAuthorized: true },
      gatewayAgent,
    );
    assert.equal(injected.statusCode, 400);
    assert.equal(JSON.stringify(injected.body).includes('true'), false);
  } finally {
    bootstrapAgent.destroy();
    gatewayAgent.destroy();
    await host.stop();
  }
});
