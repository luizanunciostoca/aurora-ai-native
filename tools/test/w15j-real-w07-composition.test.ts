// @ts-expect-error -- cross-service test uses Node 22 built-ins without repository-wide @types/node.
import { Buffer } from 'node:buffer';
// @ts-expect-error -- cross-service test uses Node 22 built-ins without repository-wide @types/node.
import { generateKeyPairSync, sign } from 'node:crypto';
// @ts-expect-error -- cross-service test uses Node 22 built-ins without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- cross-service test uses Node 22 built-ins without repository-wide @types/node.
import { Agent, request as httpRequest } from 'node:http';
// @ts-expect-error -- cross-service test uses Node 22 built-ins without repository-wide @types/node.
import test from 'node:test';

import type { ActionIntent } from '../../packages/contracts/src/actions/index.js';
import type { Rfc3339Timestamp } from '../../packages/contracts/src/context/index.js';
import type {
  CorrelationId,
  IdentityId,
  PolicyTokenId,
  TenantId,
} from '../../packages/contracts/src/ids/index.js';
import type { PolicyReference, PolicyToken } from '../../packages/contracts/src/policy/index.js';
import type {
  AuthorityEvaluationRequest,
  AuthorityEvaluationResult,
} from '../../packages/contracts/src/policy-validation/index.js';
import type {
  PolicyRule,
  PolicySnapshot,
} from '../../packages/contracts/src/policy-engine/index.js';
import { evaluateAuthority } from '../../packages/policy/src/authority/authority-evaluation.js';
import {
  createW15JPhysicalHostW07Ports,
  type W15JPhysicalHostW07Ports,
} from '../../services/executors/src/voice-intake/physical-host-ports.js';
import type {
  TrustedVoiceAuthorityLookup,
  TrustedVoiceAuthorityMaterial,
  TrustedVoiceAuthorityMaterialSource,
} from '../../services/executors/src/voice-intake/trusted-resolver.js';
import type { AuthenticatedGatewayBootstrapPrincipal } from '../../services/mobile-gateway/src/gateway-auth/gateway-bootstrap.js';
import { W15JLocalPhysicalHost } from '../../services/mobile-gateway/src/physical-host/local-physical-host.js';

const NOW = 1_788_631_500_000;
const NOW_ISO = new Date(NOW).toISOString() as Rfc3339Timestamp;
const ISSUED_AT = new Date(NOW - 60_000).toISOString() as Rfc3339Timestamp;
const EXPIRES_AT = new Date(NOW + 120_000).toISOString() as Rfc3339Timestamp;
const DEADLINE_AT = new Date(NOW + 60_000).toISOString() as Rfc3339Timestamp;
const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId;
const ACTOR = 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV' as IdentityId;
const CORRELATION = 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CorrelationId;
const DEVICE_ID = 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const DEVICE_SESSION_ID = 'device-session:real-w07-composition';
const COMMAND_ID = 'cmd_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const CAPABILITY_ID = 'camera.open';
const POLICY_TOKEN_ID = 'ptk_01ARZ3NDEKTSV4RRFFQ69G5FAV' as PolicyTokenId;
const POLICY: PolicyReference = { reference: 'policy:w15j:voice', version: '1' };

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
  if (!isRecord(response.body) || response.body.ok !== true || !isRecord(response.body.value)) {
    throw new Error('expected wrapped successful value');
  }
  return response.body.value;
}

function successfulRecord(response: PostedResponse): Record<string, unknown> {
  assert.equal(response.statusCode, 200);
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
    const signature = sign('sha256', Buffer.from(message, 'utf8'), privateKey).toString(
      'base64url',
    );
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

function policyToken(): PolicyToken {
  return {
    kind: 'POLICY_TOKEN',
    schemaVersion: '1.0.0',
    policyTokenId: POLICY_TOKEN_ID,
    tenant: { tenantId: TENANT },
    subject: { reference: `identity:${ACTOR}` },
    action: 'OPEN_CAMERA',
    scope: [CAPABILITY_ID],
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT,
    policy: POLICY,
    authorityClass: 'POLICY_RULE',
    correlation: { correlationId: CORRELATION },
  };
}

function actionIntent(): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: '1.0.0',
    actionIntentId: 'act_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    capability: { capability: CAPABILITY_ID, actionType: 'OPEN_CAMERA' },
    executionTarget: {
      schemaVersion: '1.0.0',
      kind: 'DEVICE',
      bindingReference: DEVICE_ID,
    },
    tenant: { tenantId: TENANT },
    actor: { kind: 'HUMAN', identityId: ACTOR },
    requestOrigin: { kind: 'HUMAN', identityId: ACTOR },
    correlation: { correlationId: CORRELATION },
    resolvedParameters: {},
    idempotency: { mode: 'REQUIRED', key: 'voice:camera:real-w07' },
    preconditions: [],
    deadlineAt: DEADLINE_AT,
    authority: { kind: 'POLICY_TOKEN', policyTokenId: POLICY_TOKEN_ID },
    dataClassification: 'INTERNAL',
  } as unknown as ActionIntent;
}

function policySnapshot(allows: boolean): PolicySnapshot {
  const rules: readonly PolicyRule[] = allows
    ? [
        {
          ruleId: 'rule:w15j:voice:camera',
          effect: 'ALLOW',
          action: 'OPEN_CAMERA',
          scope: [CAPABILITY_ID],
          tenantIds: [TENANT],
          actorKinds: ['HUMAN'],
          actorIdentityIds: [ACTOR],
          subjectReferences: [`identity:${ACTOR}`],
          purposeIds: ['device-control'],
          jurisdictions: ['BR-BA'],
          dataClassifications: ['INTERNAL'],
          authorityRequired: true,
          reasonReference: 'policy:w15j:voice#camera',
        },
      ]
    : [];
  return { kind: 'PolicySnapshot', policy: POLICY, state: 'ACTIVE', rules };
}

function authorityEvaluation(
  evaluatedAt: Rfc3339Timestamp,
  allows: boolean,
): AuthorityEvaluationRequest {
  return {
    kind: 'AuthorityEvaluationRequest',
    policyEvaluation: {
      kind: 'PolicyEvaluationRequest',
      schemaVersion: '1.0.0',
      policy: POLICY,
      snapshot: policySnapshot(allows),
      correlation: { correlationId: CORRELATION },
      evaluatedAt,
      tenant: { tenantId: TENANT },
      tenantBoundary: {
        status: 'WITHIN_BOUNDARY',
        reason: 'BOUNDARY_CONFIRMED',
        correlationId: CORRELATION,
        evidence: {
          evaluatedTenantId: TENANT,
          actorIdentityId: ACTOR,
          matchedBindingCount: 1,
          observedBindingTenantIds: [TENANT],
        },
      },
      actor: { kind: 'HUMAN', identityId: ACTOR },
      subject: { kind: 'IDENTITY', identityId: ACTOR },
      action: 'OPEN_CAMERA',
      requestedScope: [CAPABILITY_ID],
      purpose: {
        kind: 'PurposeContext',
        purposeId: 'device-control',
        version: '1.0.0',
        status: 'ACTIVE',
        allowedDataClassifications: ['INTERNAL'],
      },
      jurisdiction: {
        kind: 'JurisdictionContext',
        jurisdiction: 'BR-BA',
        version: '1.0.0',
      },
      dataClassification: 'INTERNAL',
      policyToken: policyToken(),
    },
  } as unknown as AuthorityEvaluationRequest;
}

class ServerAuthoritySource implements TrustedVoiceAuthorityMaterialSource {
  allows = true;
  calls: TrustedVoiceAuthorityLookup[] = [];

  resolve(lookup: TrustedVoiceAuthorityLookup): TrustedVoiceAuthorityMaterial | null {
    this.calls.push(lookup);
    if (lookup.commandId !== COMMAND_ID || lookup.capabilityId !== CAPABILITY_ID) return null;
    return {
      commandId: COMMAND_ID,
      capabilityId: CAPABILITY_ID,
      actionIntent: actionIntent(),
      authorityEvaluation: authorityEvaluation(lookup.evaluatedAt, this.allows),
      authorizesExecution: false,
    };
  }
}

const principal: AuthenticatedGatewayBootstrapPrincipal = {
  tenantId: TENANT,
  actor: { kind: 'HUMAN', identityId: ACTOR },
  correlationId: CORRELATION,
  deviceId: DEVICE_ID,
  deviceSessionId: DEVICE_SESSION_ID,
  authenticatedAtMs: NOW - 1_000,
  authenticationExpiresAtMs: NOW + 120_000,
  authenticationReference: 'upstream-auth:real-w07-composition',
  authorizesExecution: false,
  canGrantPermission: false,
};

function buildW07Ports(source: ServerAuthoritySource): {
  readonly ports: W15JPhysicalHostW07Ports;
  readonly authorityResults: AuthorityEvaluationResult[];
} {
  const authorityResults: AuthorityEvaluationResult[] = [];
  const ports = createW15JPhysicalHostW07Ports({
    voiceAuthoritySource: source,
    validateCurrentAuthority: (request) => {
      const result = evaluateAuthority(request);
      authorityResults.push(result);
      return result;
    },
    deviceExecutionSource: { resolve: () => null },
    clock: () => NOW,
  });
  return { ports, authorityResults };
}

test('real W14 same-socket voice route reaches concrete W07-B and canonical W02 evaluateAuthority', async () => {
  assert.equal(NOW_ISO, new Date(NOW).toISOString());
  const source = new ServerAuthoritySource();
  const { ports, authorityResults } = buildW07Ports(source);
  const host = new W15JLocalPhysicalHost(
    {
      databaseUrl: 'postgresql://unused.invalid/aurora_real_w07_composition',
      gatewayPort: 0,
      bootstrapPort: 0,
      clock: () => NOW,
    },
    {
      voiceIntake: ports.voiceIntake,
      receiptEvidenceIngress: ports.receiptEvidenceIngress,
    },
  );
  const staged = host.stageBootstrap(principal);
  assert.equal(staged.ok, true);
  if (!staged.ok) throw new Error('bootstrap stage failed');

  const address = await host.start();
  const bootstrapAgent = new Agent({ keepAlive: false }) as AgentLike;
  const gatewayAgent = new Agent({ keepAlive: true, maxSockets: 1 }) as AgentLike;
  const signProof = proofFactory();

  try {
    const grant = successfulValue(
      await postJson(
        address.bootstrap.port,
        address.bootstrap.path,
        { bootstrapReference: staged.value.bootstrapReference },
        bootstrapAgent,
      ),
    );
    const gatewaySessionId = String(grant.gatewaySessionId);
    const gateway = successfulValue(
      await postJson(
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
      ),
    );
    const connectionId = String(gateway.connectionId);
    const generation = Number(gateway.generation);
    assert.equal(generation, 1);

    successfulRecord(
      await postJson(
        address.gateway.port,
        '/v1/device/registrations/register',
        {
          deviceId: DEVICE_ID,
          proof: signProof(registrationMessage({ gatewaySessionId, connectionId, generation })),
        },
        gatewayAgent,
      ),
    );
    const activated = successfulRecord(
      await postJson(address.gateway.port, '/v1/device/registrations/activate', {}, gatewayAgent),
    );
    if (!isRecord(activated.record) || !isRecord(activated.record.ref)) {
      throw new Error('activation response missing DeviceRef');
    }
    const registrationVersion = Number(activated.record.ref.registrationVersion);
    assert.equal(registrationVersion, 2);

    const trusted = successfulRecord(
      await postJson(
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
      ),
    );
    assert.equal(isRecord(trusted.snapshot), true);
    if (!isRecord(trusted.snapshot)) throw new Error('trust snapshot missing');
    assert.equal(trusted.snapshot.state, 'ACTIVE');
    assert.equal(trusted.snapshot.authorizesExecution, false);

    const candidate = {
      commandId: COMMAND_ID,
      capabilityId: CAPABILITY_ID,
      normalizedTranscript: 'open camera',
      requiresW07Authorization: true,
      authorizesExecution: false,
    } as const;

    const allowed = await postJson(
      address.gateway.port,
      '/v1/device/voice/candidates/evaluate',
      candidate,
      gatewayAgent,
    );
    assert.equal(allowed.statusCode, 202);
    assert.deepEqual(allowed.body, {
      ok: true,
      acceptedForEvaluation: true,
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    });
    assert.equal(source.calls.length, 1);
    assert.equal(source.calls[0]?.evaluatedAt, NOW_ISO);
    assert.equal(authorityResults.length, 1);
    assert.equal(authorityResults[0]?.authorized, true);
    assert.equal(authorityResults[0]?.policyDecision, 'ALLOW');

    source.allows = false;
    const denied = await postJson(
      address.gateway.port,
      '/v1/device/voice/candidates/evaluate',
      candidate,
      gatewayAgent,
    );
    assert.equal(denied.statusCode, 202);
    assert.deepEqual(denied.body, allowed.body);
    assert.equal(source.calls.length, 2);
    assert.equal(authorityResults.length, 2);
    assert.equal(authorityResults[1]?.authorized, false);
    assert.equal(authorityResults[1]?.policyDecision, 'DENY');
    assert.equal(JSON.stringify(denied.body).includes('policyDecision'), false);
    assert.equal(JSON.stringify(denied.body).includes('executionEligible'), false);
  } finally {
    bootstrapAgent.destroy();
    gatewayAgent.destroy();
    await host.stop();
  }
});
