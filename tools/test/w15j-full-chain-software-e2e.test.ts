// @ts-expect-error -- cross-service test uses Node 22 built-ins without repository-wide @types/node.
import { Buffer } from 'node:buffer';
// @ts-expect-error -- cross-service test uses Node 22 built-ins without repository-wide @types/node.
import { generateKeyPairSync, sign } from 'node:crypto';
// @ts-expect-error -- cross-service test uses Node 22 built-ins without repository-wide @types/node.
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
// @ts-expect-error -- cross-service test uses Node 22 built-ins without repository-wide @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- cross-service test uses Node 22 built-ins without repository-wide @types/node.
import { Agent, request as httpRequest } from 'node:http';
// @ts-expect-error -- cross-service test uses Node 22 built-ins without repository-wide @types/node.
import { tmpdir } from 'node:os';
// @ts-expect-error -- cross-service test uses Node 22 built-ins without repository-wide @types/node.
import { join } from 'node:path';
// @ts-expect-error -- cross-service test uses Node 22 built-ins without repository-wide @types/node.
import { env as processEnv } from 'node:process';
// @ts-expect-error -- cross-service test uses Node 22 built-ins without repository-wide @types/node.
import test from 'node:test';

import type {
  ActionIntent,
  ActionPrecondition,
} from '../../packages/contracts/src/actions/index.js';
import type { Rfc3339Timestamp } from '../../packages/contracts/src/context/index.js';
import type {
  CausationId,
  CommandId,
  CorrelationId,
  EvidenceId,
  ExecutionId,
  IdentityId,
  PolicyTokenId,
  ReceiptId,
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
import type {
  TrustedDeviceExecutionLookup,
  TrustedDeviceExecutionMaterial,
  TrustedDeviceExecutionMaterialSource,
} from '../../services/executors/src/readback/device-receipt-observer.js';
import { createW15JDispatchingPhysicalHostW07Ports } from '../../services/executors/src/voice-intake/physical-host-ports.js';
import type {
  TrustedVoiceAuthorityLookup,
  TrustedVoiceAuthorityMaterial,
  TrustedVoiceAuthorityMaterialSource,
} from '../../services/executors/src/voice-intake/trusted-resolver.js';
import { computeDeviceReceiptIntegrityDigest } from '../../services/mobile-gateway/src/gateway-auth/device-key-proof-verifier.js';
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
const DEVICE_SESSION_ID = 'device-session:full-chain-software-e2e';
const COMMAND_ID = 'cmd_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CommandId;
const EXECUTION_ID = 'exe_01ARZ3NDEKTSV4RRFFQ69G5FAV' as ExecutionId;
const CAUSATION_ID = 'cau_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CausationId;
const RECEIPT_ID = 'rcp_01ARZ3NDEKTSV4RRFFQ69G5FAV' as ReceiptId;
const EVIDENCE_ID = 'evd_01ARZ3NDEKTSV4RRFFQ69G5FAV' as EvidenceId;
const CAPABILITY_ID = 'camera.open';
const CIRCUIT_KEY = 'device:camera:software-e2e';
const POLICY_TOKEN_ID = 'ptk_00000000000000000000000000' as PolicyTokenId;
const POLICY: PolicyReference = { reference: 'policy:w15j:software-e2e', version: '1' };
const CANONICAL_PAYLOAD_HASH = `sha256:${'a'.repeat(64)}`;

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

interface FakePsqlState {
  readonly log: readonly string[];
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

function successfulManagerResult(response: PostedResponse): Record<string, unknown> {
  assert.equal(response.statusCode, 200);
  if (!isRecord(response.body) || response.body.ok !== true) {
    throw new Error('expected successful manager result');
  }
  return response.body;
}

function proofFactory(): (message: string) => string {
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

function receiptMessage(input: {
  readonly gatewaySessionId: string;
  readonly connectionId: string;
  readonly generation: number;
  readonly registrationVersion: number;
  readonly capturedAtMs: number;
  readonly integrityDigest: string;
}): string {
  return [
    'AURORA_DEVICE_RECEIPT_V1',
    TENANT,
    ACTOR,
    CORRELATION,
    DEVICE_ID,
    String(input.registrationVersion),
    DEVICE_SESSION_ID,
    input.gatewaySessionId,
    input.connectionId,
    String(input.generation),
    RECEIPT_ID,
    COMMAND_ID,
    EXECUTION_ID,
    'android:software-e2e:receipt',
    String(input.capturedAtMs),
    input.integrityDigest,
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
    idempotency: { mode: 'REQUIRED', key: 'voice:camera:software-e2e' },
    preconditions: [{ preconditionType: 'DEVICE_CONTROL_ALLOWED', parameters: {} }],
    deadlineAt: DEADLINE_AT,
    authority: { kind: 'POLICY_TOKEN', policyTokenId: POLICY_TOKEN_ID },
    dataClassification: 'INTERNAL',
  } as unknown as ActionIntent;
}

function policySnapshot(): PolicySnapshot {
  const rules: readonly PolicyRule[] = [
    {
      ruleId: 'rule:w15j:software-e2e:camera',
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
      reasonReference: 'policy:w15j:software-e2e#camera',
    },
  ];
  return { kind: 'PolicySnapshot', policy: POLICY, state: 'ACTIVE', rules };
}

function authorityEvaluation(evaluatedAt: Rfc3339Timestamp): AuthorityEvaluationRequest {
  return {
    kind: 'AuthorityEvaluationRequest',
    policyEvaluation: {
      kind: 'PolicyEvaluationRequest',
      schemaVersion: '1.0.0',
      policy: POLICY,
      snapshot: policySnapshot(),
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
  readonly calls: TrustedVoiceAuthorityLookup[] = [];

  resolve(lookup: TrustedVoiceAuthorityLookup): TrustedVoiceAuthorityMaterial | null {
    this.calls.push(lookup);
    if (lookup.commandId !== COMMAND_ID || lookup.capabilityId !== CAPABILITY_ID) return null;
    return {
      commandId: COMMAND_ID,
      capabilityId: CAPABILITY_ID,
      actionIntent: actionIntent(),
      authorityEvaluation: authorityEvaluation(lookup.evaluatedAt),
      authorizesExecution: false,
    };
  }
}

class DeviceExecutionSource implements TrustedDeviceExecutionMaterialSource {
  readonly calls: TrustedDeviceExecutionLookup[] = [];

  resolve(lookup: TrustedDeviceExecutionLookup): TrustedDeviceExecutionMaterial | null {
    this.calls.push(lookup);
    if (lookup.commandId !== COMMAND_ID || lookup.executionId !== EXECUTION_ID) return null;
    return {
      commandId: COMMAND_ID,
      executionId: EXECUTION_ID,
      actionIntent: actionIntent(),
      executor: { executor: 'W15_DEVICE_EXECUTOR', instanceReference: 'software-loopback' },
      attempt: 1,
      attemptedAt: NOW_ISO,
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
  authenticationReference: 'upstream-auth:full-chain-software-e2e',
  authorizesExecution: false,
  canGrantPermission: false,
};

const FAKE_PSQL = String.raw`#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const variables = {};
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--set') {
    const pair = args[index + 1] ?? '';
    const separator = pair.indexOf('=');
    if (separator > 0) variables[pair.slice(0, separator)] = pair.slice(separator + 1);
    index += 1;
  }
}
const sql = readFileSync(0, 'utf8');

const statePath = process.env.AURORA_W15J_TEST_STATE_PATH;
if (!statePath) process.exit(2);
const state = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, 'utf8'))
  : { attempt: null, containment: null, reservations: {}, log: [] };
const save = () => writeFileSync(statePath, JSON.stringify(state), 'utf8');
const output = (value) => {
  save();
  process.stdout.write(value + '\n');
};

if (sql.includes('WITH lock_scope AS')) {
  const attemptExisted = state.attempt !== null;
  const containmentExisted = state.containment !== null;
  if (!attemptExisted) state.attempt = { ...variables };
  if (!containmentExisted) state.containment = { ...variables };
  state.log.push('stage');
  output(
    (attemptExisted ? 'ATTEMPT_EXISTS' : 'STAGED') +
      '\t' +
      (containmentExisted ? 'CONTAINMENT_EXISTS' : 'CONTAINMENT_INITIALIZED'),
  );
} else if (sql.includes('FROM w03_execution_attempt_quota')) {
  state.log.push('attempt-read');
  const row = state.attempt;
  if (!row) output('');
  output(
    [
      variables.tenant_id,
      variables.action_intent_id,
      variables.execution_ref,
      row.attempt_number,
      row.max_attempts,
      row.quota_limit,
      row.quota_used,
      '1',
      row.updated_at_ms,
    ].join('\t'),
  );
} else if (sql.includes('FROM w03_execution_containment AS containment')) {
  state.log.push('containment-read');
  const row = state.containment;
  if (!row) output('');
  output(
    [
      '1',
      row.circuit_state,
      row.consecutive_failures,
      row.opened_at_ms,
      row.kill_switch_state,
      row.kill_switch_changed_at_ms,
      row.dependency_health,
      row.cancellation_requested === 'true' ? '1' : '0',
      row.current_in_flight,
      row.max_in_flight,
      row.retry_depth,
      row.max_retry_depth,
      row.updated_at_ms,
      '0',
      '-',
    ].join('\t'),
  );
} else if (sql.includes('WITH updated AS')) {
  const key = variables.tenant_id + '|' + variables.idempotency_key;
  const existing = state.reservations[key];
  if (existing) existing.status = 'completed';
  state.log.push('receipt-complete');
  output([variables.operation_name, variables.payload_hash, 'completed'].join('\t'));
} else if (sql.includes('WITH inserted AS')) {
  const key = variables.tenant_id + '|' + variables.idempotency_key;
  const existing = state.reservations[key];
  const disposition = existing ? 'EXISTING' : 'RESERVED';
  if (!existing) {
    state.reservations[key] = {
      operationName: variables.operation_name,
      payloadHash: variables.payload_hash,
      status: 'inflight',
    };
  }
  const current = state.reservations[key];
  const kind =
    variables.operation_name === 'W14_DEVICE_DELIVERY_V1'
      ? 'delivery-reserve'
      : variables.operation_name === 'W14_DEVICE_RECEIPT_V1'
        ? 'receipt-reserve'
        : 'execution-reserve';
  state.log.push(kind);
  output([disposition, current.operationName, current.payloadHash, current.status].join('\t'));
} else {
  process.exit(3);
}
`;

function createFakePsql(): {
  readonly directory: string;
  readonly executable: string;
  readonly statePath: string;
} {
  const directory = mkdtempSync(join(tmpdir(), 'aurora-w15j-software-e2e-'));
  const executable = join(directory, 'psql-fake.mjs');
  const statePath = join(directory, 'state.json');
  writeFileSync(executable, FAKE_PSQL, 'utf8');
  chmodSync(executable, 0o700);
  return { directory, executable, statePath };
}

test('software E2E crosses loopback W14/W07/W02 dispatch and observes authenticated receipt evidence', async () => {
  const fakePsql = createFakePsql();
  processEnv.AURORA_W15J_TEST_STATE_PATH = fakePsql.statePath;
  const authoritySource = new ServerAuthoritySource();
  const deviceExecutionSource = new DeviceExecutionSource();
  const authorityResults: AuthorityEvaluationResult[] = [];
  const preconditions: ActionPrecondition[] = [];
  const ports = createW15JDispatchingPhysicalHostW07Ports({
    voiceAuthoritySource: authoritySource,
    validateCurrentAuthority: (request) => {
      const result = evaluateAuthority(request);
      authorityResults.push(result);
      return result;
    },
    deviceExecutionSource,
    executionIdentities: [
      {
        commandId: COMMAND_ID,
        capabilityId: CAPABILITY_ID,
        executionId: EXECUTION_ID,
        causationId: CAUSATION_ID,
        orderingKey: 'device:camera:software-e2e',
        orderingSequence: 1,
        canonicalPayloadHash: CANONICAL_PAYLOAD_HASH,
        authorizesExecution: false,
      },
    ],
    safeguardMaxAgeMs: 60_000,
    containmentCircuitKeys: {
      resolveCircuitKey: ({ actionIntent: intent, tenantId }) =>
        intent.actionIntentId === actionIntent().actionIntentId && tenantId === TENANT
          ? CIRCUIT_KEY
          : null,
    },
    evaluatePrecondition: (precondition) => {
      preconditions.push(precondition);
      return precondition.preconditionType === 'DEVICE_CONTROL_ALLOWED';
    },
    clock: () => NOW,
  });
  const host = new W15JLocalPhysicalHost(
    {
      databaseUrl: 'postgresql://software-e2e@127.0.0.1/aurora_w15j_test',
      psqlBinary: fakePsql.executable,
      gatewayPort: 0,
      bootstrapPort: 0,
      clock: () => NOW,
    },
    {
      createVoiceIntake: ports.createVoiceIntake,
      createContainmentLifecycle: ports.createContainmentLifecycle,
      createAttemptLifecycle: ports.createAttemptLifecycle,
      receiptEvidenceIngress: ports.receiptEvidenceIngress,
    },
  );
  const bootstrapAgent = new Agent({ keepAlive: false }) as AgentLike;
  const gatewayAgent = new Agent({ keepAlive: true, maxSockets: 1 }) as AgentLike;
  const signProof = proofFactory();

  try {
    const seeded = host.stageExecutionState({
      tenantId: TENANT,
      actionIntentId: actionIntent().actionIntentId,
      executionRef: EXECUTION_ID,
      attemptNumber: 1,
      maxAttempts: 1,
      quota: { limit: 1, used: 0 },
      circuitKey: CIRCUIT_KEY,
      containment: {
        circuit: { state: 'CLOSED', consecutiveFailures: 0, halfOpenProbeInFlight: false },
        killSwitch: { state: 'INACTIVE', changedAt: ISSUED_AT },
        dependencyHealth: 'HEALTHY',
        cancellationRequested: false,
        currentInFlight: 0,
        maxInFlight: 1,
        retryDepth: 0,
        maxRetryDepth: 1,
      },
      updatedAt: NOW_ISO,
      authorizesExecution: false,
    });
    assert.deepEqual(seeded, {
      ok: true,
      disposition: 'STAGED',
      containmentDisposition: 'INITIALIZED',
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    });

    const stagedBootstrap = host.stageBootstrap(principal);
    assert.equal(stagedBootstrap.ok, true);
    if (!stagedBootstrap.ok) throw new Error('bootstrap stage failed');
    const address = await host.start();
    assert.equal(address.hostMode, 'LOOPBACK_ONLY');
    assert.equal(address.physicalEvidenceStatus, 'NOT_RUN');
    assert.equal(address.authorizesExecution, false);

    const grant = successfulValue(
      await postJson(
        address.bootstrap.port,
        address.bootstrap.path,
        { bootstrapReference: stagedBootstrap.value.bootstrapReference },
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

    successfulManagerResult(
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
    const activated = successfulManagerResult(
      await postJson(address.gateway.port, '/v1/device/registrations/activate', {}, gatewayAgent),
    );
    if (!isRecord(activated.record) || !isRecord(activated.record.ref)) {
      throw new Error('activation response missing canonical DeviceRef');
    }
    const registrationVersion = Number(activated.record.ref.registrationVersion);
    assert.equal(registrationVersion, 2);

    const trusted = successfulManagerResult(
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
    assert.equal(isRecord(trusted.snapshot) && trusted.snapshot.state, 'ACTIVE');

    const voice = await postJson(
      address.gateway.port,
      '/v1/device/voice/candidates/evaluate',
      {
        commandId: COMMAND_ID,
        capabilityId: CAPABILITY_ID,
        normalizedTranscript: 'open camera',
        requiresW07Authorization: true,
        authorizesExecution: false,
      },
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
    assert.equal(authoritySource.calls.length, 1);
    assert.equal(authorityResults.length, 1);
    assert.equal(authorityResults[0]?.authorized, true);
    assert.equal(authorityResults[0]?.policyDecision, 'ALLOW');
    assert.deepEqual(preconditions, [
      { preconditionType: 'DEVICE_CONTROL_ALLOWED', parameters: {} },
    ]);

    const claim = successfulManagerResult(
      await postJson(
        address.gateway.port,
        '/v1/device/commands/claim',
        { commandId: COMMAND_ID },
        gatewayAgent,
      ),
    );
    if (!isRecord(claim.value) || !isRecord(claim.value.envelope)) {
      throw new Error('claim response missing device command envelope');
    }
    const envelope = claim.value.envelope;
    assert.equal(claim.value.disposition, 'DELIVER');
    assert.equal(envelope.commandId, COMMAND_ID);
    assert.equal(envelope.executionId, EXECUTION_ID);
    assert.equal(envelope.deviceId, DEVICE_ID);
    assert.equal(envelope.deliveryAttempt, 1);
    assert.equal(envelope.replay, false);
    assert.equal(envelope.authorizesExecution, false);
    assert.equal(envelope.provesExecutionSuccess, false);
    const deliveryReference = String(envelope.deliveryReference);

    const acknowledged = successfulManagerResult(
      await postJson(
        address.gateway.port,
        '/v1/device/commands/acknowledge',
        {
          commandId: COMMAND_ID,
          deliveryReference,
          ackReference: 'android:software-e2e:ack',
        },
        gatewayAgent,
      ),
    );
    assert.equal(isRecord(acknowledged.value) && acknowledged.value.disposition, 'ACKNOWLEDGED');
    assert.equal(acknowledged.authorizesExecution, false);
    assert.equal(acknowledged.retryAuthorized, false);

    const capturedAtMs = NOW;
    const integrityDigest = computeDeviceReceiptIntegrityDigest({
      receiptId: RECEIPT_ID,
      evidenceId: EVIDENCE_ID,
      commandId: COMMAND_ID,
      executionId: EXECUTION_ID,
      connectionId,
      gatewayGeneration: generation,
      deliveryReference,
      reportedState: 'COMPLETED',
      sourceReference: 'android:software-e2e:receipt',
      capturedAtMs,
    });
    const receipt = successfulManagerResult(
      await postJson(
        address.gateway.port,
        '/v1/device/receipts/ingest',
        {
          receiptId: RECEIPT_ID,
          evidenceId: EVIDENCE_ID,
          commandId: COMMAND_ID,
          executionId: EXECUTION_ID,
          connectionId,
          gatewayGeneration: generation,
          deliveryReference,
          reportedState: 'COMPLETED',
          sourceReference: 'android:software-e2e:receipt',
          proofReference: signProof(
            receiptMessage({
              gatewaySessionId,
              connectionId,
              generation,
              registrationVersion,
              capturedAtMs,
              integrityDigest,
            }),
          ),
          capturedAtMs,
        },
        gatewayAgent,
      ),
    );
    if (!isRecord(receipt.value)) throw new Error('receipt ingress response missing value');
    assert.equal(receipt.value.classification, 'CURRENT_SESSION');
    assert.equal(receipt.value.receiptReference, `w07:receipt:${RECEIPT_ID}`);
    assert.equal(receipt.value.evidenceReference, `w07:evidence:${EVIDENCE_ID}`);
    assert.equal(receipt.value.requiresW07Reconciliation, false);
    assert.equal(receipt.value.provesExecutionSuccess, false);
    assert.equal(receipt.value.retryAuthorized, false);
    assert.deepEqual(deviceExecutionSource.calls, [
      { commandId: COMMAND_ID, executionId: EXECUTION_ID },
    ]);

    const sqlState = JSON.parse(readFileSync(fakePsql.statePath, 'utf8')) as FakePsqlState;
    assert.deepEqual(sqlState.log, [
      'stage',
      'attempt-read',
      'containment-read',
      'execution-reserve',
      'delivery-reserve',
      'receipt-reserve',
      'receipt-complete',
    ]);
    assert.equal(JSON.stringify(receipt).includes('executionOutcome'), false);
    assert.equal(JSON.stringify(receipt).includes('VERIFIED'), false);
  } finally {
    bootstrapAgent.destroy();
    gatewayAgent.destroy();
    await host.stop();
    delete processEnv.AURORA_W15J_TEST_STATE_PATH;
    rmSync(fakePsql.directory, { recursive: true, force: true });
  }
});
