// @ts-expect-error -- mobile-gateway harness intentionally has no @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- mobile-gateway harness intentionally has no @types/node.
import test from 'node:test';

import type {
  ActionIntentId,
  CommandId,
  CorrelationId,
  EvidenceId,
  ExecutionId,
  IdentityId,
  ReceiptId,
  TenantId,
} from '@aurora/contracts/ids';
import type { DeviceExecutionTargetReference } from '@aurora/contracts/execution-target';
import type { DeviceId, DeviceRegistrationRecord, DeviceRef } from '../../device/types.js';
import type { GatewaySessionSnapshot } from '../../gateway-auth/types.js';
import {
  DeviceSessionTrustManager,
  type DeviceAttestationReference,
  type DeviceSessionTrustSnapshot,
} from '../../device-session/index.js';
import type { RealtimeCommandSnapshot } from '../../realtime-session/types.js';

import {
  DeviceSessionRevokeEvidenceIngressManager,
  type DeviceEvidenceIngressFrame,
  type DeviceReceiptIngressFrame,
  type W03DurableIngressReservationPort,
  type W07DeviceIngressVerifier,
} from '../index.js';

const DEVICE_A = 'dvc_01JW14GABCDA00000000000000' as DeviceId;
const DEVICE_B = 'dvc_01JW14GABCDB00000000000000' as DeviceId;
const TENANT_A = 'ten_01JW14GABCDC00000000000000' as TenantId;
const IDENTITY_A = 'idn_01JW14GABCDD00000000000000' as IdentityId;
const CORRELATION = 'correlation:w14g' as CorrelationId;
const COMMAND = 'cmd_01JW14GABCDE00000000000000' as CommandId;
const EXECUTION = 'exe_01JW14GABCDF00000000000000' as ExecutionId;
const ACTION = 'act_01JW14GABCDG00000000000000' as ActionIntentId;
const RECEIPT = 'rcp_01JW14GABCDH00000000000000' as ReceiptId;
const EVIDENCE = 'evd_01JW14GABCDJ00000000000000' as EvidenceId;
const NOW = 10_000;

function gateway(overrides: Partial<GatewaySessionSnapshot> = {}): GatewaySessionSnapshot {
  return {
    protocolVersion: '1.0',
    sessionId: 'gateway:session:w14g',
    connectionId: 'gateway:connection:1',
    generation: 1,
    state: 'OPEN',
    tenantId: TENANT_A,
    actorKind: 'HUMAN',
    actorIdentityId: IDENTITY_A,
    correlationId: CORRELATION,
    authIssuedAtMs: 8_000,
    authExpiresAtMs: 30_000,
    openedAtMs: 8_000,
    outstandingRequests: 0,
    authorizesExecution: false,
    ...overrides,
  };
}

function deviceRef(overrides: Partial<DeviceRef> = {}): DeviceRef {
  return {
    kind: 'AURORA_DEVICE',
    deviceId: DEVICE_A,
    tenantId: TENANT_A,
    registrationVersion: 1,
    ...overrides,
  };
}

function device(overrides: Partial<DeviceRegistrationRecord> = {}): DeviceRegistrationRecord {
  return {
    kind: 'DeviceRegistrationRecord',
    schemaVersion: '1.0.0',
    ref: deviceRef(),
    boundIdentityId: IDENTITY_A,
    state: 'ACTIVE',
    registeredAt: '2026-09-04T10:00:00Z',
    updatedAt: '2026-09-04T10:01:00Z',
    provenance: {
      source: 'W14_DEVICE_REGISTRATION',
      reference: 'registration:w14g:fixture',
      observedAt: '2026-09-04T10:01:00Z',
    },
    authoritySemantics: 'DEVICE_REGISTRATION_ONLY_NO_ACTION_AUTHORITY',
    authorizesExecution: false,
    canGrantPermission: false,
    ...overrides,
  };
}

function attestation(): DeviceAttestationReference {
  return {
    kind: 'DEVICE_ATTESTATION_REFERENCE',
    reference: 'attestation:w14g:1',
    provider: 'attestation:fixture',
    version: '1',
    state: 'VERIFIED',
    observedAtMs: 9_500,
    expiresAtMs: 30_000,
  };
}

function openTrust(target: DeviceSessionTrustManager): DeviceSessionTrustSnapshot {
  const result = target.openSession({
    deviceSessionId: 'device-session:w14g',
    gatewaySession: gateway(),
    deviceRecord: device(),
    attestation: attestation(),
    nowMs: NOW,
  });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('Expected W14-E trust fixture to open.');
  return result.snapshot;
}

function command(overrides: Partial<RealtimeCommandSnapshot> = {}): RealtimeCommandSnapshot {
  const executionTarget: DeviceExecutionTargetReference = {
    schemaVersion: '1.0.0',
    kind: 'DEVICE',
    bindingReference: DEVICE_A,
  };
  return {
    commandId: COMMAND,
    executionId: EXECUTION,
    executionTarget,
    correlationId: CORRELATION,
    causationId: 'evt_01JW14GABCDK00000000000000',
    state: 'RUNNING',
    deadlineMs: 25_000,
    submittedAtMs: 10_100,
    updatedAtMs: 10_500,
    submittedGatewayGeneration: 1,
    lastRemoteSequence: 2,
    redeliveryDisposition: 'NOT_DECIDED_BY_W14_B',
    authoritySemantics: 'TRANSPORT_SESSION_ONLY_NO_ACTION_AUTHORITY',
    authorizesExecution: false,
    provesExecutionSuccess: false,
    externalStateVerified: false,
    ...overrides,
  };
}

function receipt(overrides: Partial<DeviceReceiptIngressFrame> = {}): DeviceReceiptIngressFrame {
  return {
    receiptId: RECEIPT,
    actionIntentId: ACTION,
    commandId: COMMAND,
    executionId: EXECUTION,
    tenantId: TENANT_A,
    correlationId: CORRELATION,
    deviceId: DEVICE_A,
    deviceReportedState: 'COMPLETED',
    provenance: {
      sourceConnectionId: 'gateway:connection:1',
      sourceGatewayGeneration: 1,
      sourceReference: 'device:receipt:w14g:1',
      integrityReference: 'integrity:w14g:1',
      capturedAtMs: 10_600,
      receivedAtMs: 10_700,
    },
    ...overrides,
  };
}

function evidence(overrides: Partial<DeviceEvidenceIngressFrame> = {}): DeviceEvidenceIngressFrame {
  return {
    evidenceId: EVIDENCE,
    actionIntentId: ACTION,
    commandId: COMMAND,
    executionId: EXECUTION,
    tenantId: TENANT_A,
    correlationId: CORRELATION,
    deviceId: DEVICE_A,
    evidenceType: 'STATE_SNAPSHOT',
    subjectReference: 'device:state:w14g:1',
    provenance: {
      sourceConnectionId: 'gateway:connection:1',
      sourceGatewayGeneration: 1,
      sourceReference: 'device:evidence:w14g:1',
      integrityReference: 'integrity:w14g:2',
      capturedAtMs: 10_650,
      receivedAtMs: 10_750,
    },
    ...overrides,
  };
}

function durablePort(): W03DurableIngressReservationPort {
  const reservations = new Map<string, string>();
  return {
    reserve(request) {
      const prior = reservations.get(request.idempotencyKey);
      if (prior !== undefined && prior !== request.contentFingerprint) {
        return {
          ok: false,
          code: 'CONFLICT',
          retryable: false,
          authorizesExecution: false,
        };
      }
      reservations.set(request.idempotencyKey, request.contentFingerprint);
      return {
        ok: true,
        disposition: prior === undefined ? 'RESERVED' : 'ALREADY_RESERVED',
        durableReference: `w03:ingress:${request.ingressId}`,
        authorizesExecution: false,
      };
    },
  };
}

function verifier(): W07DeviceIngressVerifier {
  return {
    verifyReceipt(request) {
      return {
        ok: true,
        verificationReference: `w07:receipt:${request.receiptId}`,
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      };
    },
    verifyEvidence(request) {
      return {
        ok: true,
        verificationReference: `w07:evidence:${request.evidenceId}`,
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      };
    },
  };
}

function manager(
  trust: DeviceSessionTrustManager,
  w07: W07DeviceIngressVerifier = verifier(),
): DeviceSessionRevokeEvidenceIngressManager {
  return new DeviceSessionRevokeEvidenceIngressManager(trust, durablePort(), w07, {
    maxSeenIngress: 8,
    maxControlledSessions: 8,
    maxIngressAgeMs: 20_000,
    maxReferenceLength: 512,
  });
}

function errorCode(
  result: ReturnType<DeviceSessionRevokeEvidenceIngressManager['ingestReceipt']>,
): string {
  assert.equal(result.ok, false);
  if (result.ok) throw new Error('Expected failure.');
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.canGrantPermission, false);
  assert.equal(result.provesExecutionSuccess, false);
  assert.equal(result.retryAuthorized, false);
  return result.error.code;
}

test('accepts current-session receipt only as W03-durable, W07-verified evidence input', () => {
  const trust = new DeviceSessionTrustManager();
  const session = openTrust(trust);
  const result = manager(trust).ingestReceipt({
    command: command(),
    deviceSession: session,
    frame: receipt(),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.disposition, 'ACCEPTED');
  assert.equal(result.value.projection.ingressClassification, 'CURRENT_SESSION');
  assert.equal(result.value.projection.outcomeAuthority, 'W07_ONLY');
  assert.equal(result.value.projection.requiresW07Reconciliation, true);
  assert.equal(result.value.projection.receiptPresenceProvesBusinessOutcome, false);
  assert.equal(result.value.projection.authorizesExecution, false);
  assert.equal(result.value.projection.provesExecutionSuccess, false);
  assert.equal(result.value.projection.retryAuthorized, false);
});

test('rejects forged wrong-device and wrong-correlation receipts before W07 outcome semantics', () => {
  const trust = new DeviceSessionTrustManager();
  const session = openTrust(trust);
  const target = manager(trust);
  assert.equal(
    errorCode(
      target.ingestReceipt({
        command: command(),
        deviceSession: session,
        frame: receipt({ deviceId: DEVICE_B }),
      }),
    ),
    'DEVICE_MISMATCH',
  );
  assert.equal(
    errorCode(
      target.ingestReceipt({
        command: command(),
        deviceSession: session,
        frame: receipt({ correlationId: 'correlation:forged' as CorrelationId }),
      }),
    ),
    'CORRELATION_MISMATCH',
  );
});

test('rejects stale generation and future provenance', () => {
  const trust = new DeviceSessionTrustManager();
  const session = openTrust(trust);
  const target = manager(trust);
  assert.equal(
    errorCode(
      target.ingestReceipt({
        command: command({ submittedGatewayGeneration: 2 }),
        deviceSession: { ...session, gatewayGeneration: 2 },
        frame: receipt({
          provenance: { ...receipt().provenance, sourceGatewayGeneration: 1 },
        }),
      }),
    ),
    'PROVENANCE_STALE',
  );
  assert.equal(
    errorCode(
      target.ingestReceipt({
        command: command(),
        deviceSession: session,
        frame: receipt({
          provenance: { ...receipt().provenance, capturedAtMs: 11_000, receivedAtMs: 10_900 },
        }),
      }),
    ),
    'PROVENANCE_FUTURE',
  );
});

test('classifies old-generation ingress as late after reconnect without minting outcome authority', () => {
  const trust = new DeviceSessionTrustManager();
  const original = openTrust(trust);
  const resumed = {
    ...original,
    connectionId: 'gateway:connection:2',
    gatewayGeneration: 2,
    lastEvaluatedAtMs: 11_000,
    gatewayAuthExpiresAtMs: 30_000,
  } as DeviceSessionTrustSnapshot;
  const result = manager(trust).ingestEvidence({
    command: command(),
    deviceSession: resumed,
    frame: evidence(),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.projection.ingressClassification, 'LATE_AFTER_RECONNECT');
  assert.equal(result.value.projection.outcomeAuthority, 'W07_ONLY');
  assert.equal(result.value.projection.authorizesExecution, false);
});

test('kill switch revokes W14-E trust monotonically and rejects post-kill output even with stale ACTIVE snapshot', () => {
  const trust = new DeviceSessionTrustManager();
  const active = openTrust(trust);
  const target = manager(trust);
  const killed = target.revokeOrKillSession({
    mode: 'KILL',
    deviceSession: active,
    reasonReference: 'kill:suspected-session-compromise',
    nowMs: 11_000,
  });
  assert.equal(killed.ok, true);
  if (!killed.ok) return;
  assert.equal(killed.value.disposition, 'KILLED');
  assert.equal(killed.value.trustState, 'REVOKED');
  assert.equal(killed.value.authorizesExecution, false);
  assert.equal(killed.value.provesExecutionSuccess, false);
  assert.equal(killed.value.retryAuthorized, false);

  const postKill = target.ingestReceipt({
    command: command(),
    deviceSession: active,
    frame: receipt({
      provenance: { ...receipt().provenance, capturedAtMs: 11_100, receivedAtMs: 11_200 },
    }),
  });
  assert.equal(errorCode(postKill), 'SESSION_REVOKED');

  const again = target.revokeOrKillSession({
    mode: 'REVOKE',
    deviceSession: active,
    reasonReference: 'revoke:duplicate-control',
    nowMs: 11_300,
  });
  assert.equal(again.ok, true);
  if (again.ok) assert.equal(again.value.disposition, 'ALREADY_KILLED');
});

test('accepts only pre-revoke late receipt after kill and classifies it explicitly', () => {
  const trust = new DeviceSessionTrustManager();
  const active = openTrust(trust);
  const target = manager(trust);
  const killed = target.revokeOrKillSession({
    mode: 'KILL',
    deviceSession: active,
    reasonReference: 'kill:transport-compromise',
    nowMs: 11_000,
  });
  assert.equal(killed.ok, true);
  if (!killed.ok) return;
  const revoked: DeviceSessionTrustSnapshot = {
    ...active,
    state: 'REVOKED',
    executionPreconditionSatisfied: false,
    lastEvaluatedAtMs: 11_000,
    revokedAtMs: 11_000,
    revocationReasonReference: 'kill:transport-compromise',
  };
  const result = target.ingestReceipt({
    command: command(),
    deviceSession: revoked,
    frame: receipt({
      provenance: { ...receipt().provenance, capturedAtMs: 10_900, receivedAtMs: 11_100 },
    }),
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.projection.ingressClassification, 'LATE_AFTER_REVOKE');
  assert.equal(result.value.projection.requiresW07Reconciliation, true);
  assert.equal(result.value.projection.receiptPresenceProvesBusinessOutcome, false);
});

test('deduplicates identical ingress and rejects identifier reuse with conflicting contents', () => {
  const trust = new DeviceSessionTrustManager();
  const session = openTrust(trust);
  const target = manager(trust);
  const first = target.ingestReceipt({
    command: command(),
    deviceSession: session,
    frame: receipt(),
  });
  const second = target.ingestReceipt({
    command: command(),
    deviceSession: session,
    frame: receipt(),
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (second.ok) assert.equal(second.value.disposition, 'DUPLICATE');

  const conflict = target.ingestReceipt({
    command: command(),
    deviceSession: session,
    frame: receipt({ deviceReportedState: 'FAILED' }),
  });
  assert.equal(errorCode(conflict), 'INGRESS_CONFLICT');
});

test('fails closed when W07 rejects forged evidence and never exposes unrestricted payload material', () => {
  const trust = new DeviceSessionTrustManager();
  const session = openTrust(trust);
  const rejecting: W07DeviceIngressVerifier = {
    verifyReceipt() {
      return {
        ok: false,
        code: 'RECEIPT_FORGERY',
        retryable: false,
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      };
    },
    verifyEvidence() {
      return {
        ok: false,
        code: 'EVIDENCE_FORGERY',
        retryable: false,
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      };
    },
  };
  const result = manager(trust, rejecting).ingestEvidence({
    command: command(),
    deviceSession: session,
    frame: evidence(),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, 'W07_REJECTED');
  assert.equal(result.error.upstreamCode, 'EVIDENCE_FORGERY');
  assert.equal(JSON.stringify(result).includes('private-key-material'), false);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.provesExecutionSuccess, false);
  assert.equal(result.retryAuthorized, false);
});
