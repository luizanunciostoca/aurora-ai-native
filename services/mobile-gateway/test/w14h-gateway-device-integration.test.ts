import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  CommandId,
  CorrelationId,
  EvidenceId,
  ExecutionId,
  IdentityId,
  ReceiptId,
  TenantId,
} from '@aurora/contracts/ids';

import type { DeviceId } from '../src/device/types.js';
import type {
  DeviceSessionTrustResult,
  DeviceSessionTrustSnapshot,
  RevokeDeviceSessionTrustInput,
} from '../src/device-session/types.js';
import { DeviceReceiptIngressManager } from '../src/device-receipt-ingress/manager.js';
import type {
  DeviceIngressAuthenticationPort,
  DeviceIngressAuthenticationRequest,
  DeviceIngressAuthenticationResult,
  DeviceSessionRevocationPort,
  W03ReceiptIngressReservationPort,
  W03ReceiptIngressReservationRequest,
  W03ReceiptIngressReservationResult,
  W07DeviceReceiptEvidenceIngressPort,
  W07DeviceReceiptEvidenceIngressResult,
  W07DeviceReceiptEvidenceObservation,
} from '../src/device-receipt-ingress/types.js';
import type {
  ProgressCancellationPort,
  ProgressCancellationPortResult,
  ProgressCancellationPortSuccess,
  ProgressCancellationSessionView,
} from '../src/progress-cancellation/types.js';

const TENANT = 'tnn_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId;
const CORRELATION = 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CorrelationId;
const COMMAND = 'cmd_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CommandId;
const EXECUTION = 'exe_01ARZ3NDEKTSV4RRFFQ69G5FAV' as ExecutionId;
const RECEIPT = 'rcp_01ARZ3NDEKTSV4RRFFQ69G5FAV' as ReceiptId;
const EVIDENCE = 'evd_01ARZ3NDEKTSV4RRFFQ69G5FAV' as EvidenceId;
const DEVICE = 'device-1' as DeviceId;
const REVOKED_AT_MS = 1_500;

function trust(state: 'ACTIVE' | 'REVOKED' = 'ACTIVE'): DeviceSessionTrustSnapshot {
  return {
    kind: 'DeviceSessionTrustSnapshot',
    schemaVersion: '1.0.0',
    deviceSessionId: 'device-session-1',
    gatewaySessionId: 'gateway-session-1',
    connectionId: 'connection-1',
    gatewayGeneration: 2,
    tenantId: TENANT,
    actorIdentityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV' as IdentityId,
    correlationId: CORRELATION,
    deviceRef: {
      kind: 'AURORA_DEVICE',
      deviceId: DEVICE,
      tenantId: TENANT,
      registrationVersion: 1,
    },
    attestation: {
      kind: 'DEVICE_ATTESTATION_REFERENCE',
      reference: 'attestation-1',
      provider: 'test',
      version: '1',
      state: 'VERIFIED',
      observedAtMs: 900,
      expiresAtMs: 1_000_000,
    },
    state,
    openedAtMs: 900,
    lastEvaluatedAtMs: state === 'REVOKED' ? REVOKED_AT_MS : 1_000,
    gatewayAuthExpiresAtMs: 1_000_000,
    ...(state === 'REVOKED'
      ? { revokedAtMs: REVOKED_AT_MS, revocationReasonReference: 'kill-1' }
      : {}),
    executionPreconditionSatisfied: state === 'ACTIVE',
    requiresCurrentAuthorityValidation: true,
    authoritySemantics: 'DEVICE_SESSION_TRUST_IS_PRECONDITION_METADATA_ONLY',
    authorizesExecution: false,
    canGrantPermission: false,
  };
}

class StatefulRevocationPort implements DeviceSessionRevocationPort {
  revoked = false;

  revokeSession(input: RevokeDeviceSessionTrustInput): DeviceSessionTrustResult {
    this.revoked = true;
    const snapshot: DeviceSessionTrustSnapshot = {
      ...trust('REVOKED'),
      deviceSessionId: input.deviceSessionId,
      connectionId: input.connectionId,
      revokedAtMs: input.revokedAtMs,
      lastEvaluatedAtMs: input.revokedAtMs,
      revocationReasonReference: input.reasonReference,
    };
    return {
      ok: true,
      snapshot,
      authorizesExecution: false,
      canGrantPermission: false,
    };
  }
}

class CancellationPort implements ProgressCancellationPort {
  getSession(): ProgressCancellationPortResult<ProgressCancellationSessionView> {
    return {
      ok: true,
      value: {
        gatewaySessionId: 'gateway-session-1',
        gatewayConnectionId: 'connection-1',
        state: 'OPEN',
        tenantId: TENANT,
        correlationId: CORRELATION,
        authorizesExecution: false,
        canGrantPermission: false,
      },
      authorizesExecution: false,
    };
  }

  requestCancellation(): ProgressCancellationPortResult<ProgressCancellationPortSuccess> {
    return {
      ok: true,
      value: {
        disposition: 'CANCEL_REQUESTED',
        command: {
          commandId: COMMAND,
          correlationId: CORRELATION,
          state: 'CANCEL_REQUESTED',
          cancelRequestedAtMs: REVOKED_AT_MS,
          authorizesExecution: false,
          provesExecutionSuccess: false,
          externalStateVerified: false,
        },
      },
      authorizesExecution: false,
    };
  }
}

class AuthenticationPort implements DeviceIngressAuthenticationPort {
  verify(request: DeviceIngressAuthenticationRequest): DeviceIngressAuthenticationResult {
    return {
      ok: true,
      authenticatedAtMs: request.receivedAtMs,
      authenticationReference: `auth:${request.receiptId}`,
      authorizesExecution: false,
      canGrantPermission: false,
    };
  }
}

class DurableIngressPort implements W03ReceiptIngressReservationPort {
  readonly fingerprints = new Map<string, string>();

  reserve(request: W03ReceiptIngressReservationRequest): W03ReceiptIngressReservationResult {
    const prior = this.fingerprints.get(request.receiptId);
    if (prior !== undefined && prior !== request.fingerprint) {
      return {
        ok: false,
        code: 'CONFLICT',
        retryable: false,
        authorizesExecution: false,
      };
    }
    this.fingerprints.set(request.receiptId, request.fingerprint);
    return {
      ok: true,
      disposition: prior === undefined ? 'RESERVED' : 'ALREADY_RESERVED',
      durableReference: `w03:${request.receiptId}`,
      authorizesExecution: false,
    };
  }
}

class W07IngressPort implements W07DeviceReceiptEvidenceIngressPort {
  calls = 0;
  failFirst = false;

  observe(observation: W07DeviceReceiptEvidenceObservation): W07DeviceReceiptEvidenceIngressResult {
    this.calls += 1;
    if (this.failFirst && this.calls === 1) {
      return {
        ok: false,
        code: 'UNAVAILABLE',
        retryable: true,
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      };
    }
    return {
      ok: true,
      disposition: 'OBSERVED',
      receiptReference: `w07:${observation.receiptId}`,
      evidenceReference: 'w07:evidence-1',
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    };
  }
}

function createHarness(config: { maxReceiptAgeMs?: number; maxLateAfterRevokeMs?: number } = {}) {
  const sessionRevocation = new StatefulRevocationPort();
  const cancellation = new CancellationPort();
  const authentication = new AuthenticationPort();
  const durableIngress = new DurableIngressPort();
  const w07Ingress = new W07IngressPort();
  const manager = new DeviceReceiptIngressManager(
    {
      sessionRevocation,
      cancellation,
      authentication,
      durableIngress,
      w07Ingress,
    },
    config,
  );
  return { manager, sessionRevocation, durableIngress, w07Ingress };
}

function ingressInput(
  deviceSession: DeviceSessionTrustSnapshot,
  receiptId: ReceiptId = RECEIPT,
  capturedAtMs = 1_200,
  receivedAtMs = 1_300,
) {
  return {
    receiptId,
    evidenceId: EVIDENCE,
    tenantId: TENANT,
    correlationId: CORRELATION,
    commandId: COMMAND,
    executionId: EXECUTION,
    deviceRef: deviceSession.deviceRef,
    deviceSessionId: deviceSession.deviceSessionId,
    gatewaySessionId: deviceSession.gatewaySessionId,
    connectionId: deviceSession.connectionId,
    gatewayGeneration: deviceSession.gatewayGeneration,
    deliveryReference: 'w14f:delivery-1',
    reportedState: 'COMPLETED' as const,
    sourceReference: 'device-receipt-1',
    proofReference: 'device-proof-1',
    integrityDigest: 'sha256:abcdef0123456789',
    capturedAtMs,
    receivedAtMs,
    deviceSession,
  };
}

test('DP3 rejects a stale ACTIVE trust snapshot after the same session was revoked and killed', () => {
  const { manager, sessionRevocation, w07Ingress } = createHarness();
  const staleActiveSnapshot = trust('ACTIVE');

  const killed = manager.revokeAndKill({
    deviceSession: staleActiveSnapshot,
    tenantId: TENANT,
    correlationId: CORRELATION,
    commandId: COMMAND,
    revokedAtMs: REVOKED_AT_MS,
    reasonReference: 'kill-1',
  });
  assert.equal(killed.ok, true);
  assert.equal(sessionRevocation.revoked, true);

  const replayedStaleTrust = manager.ingest(
    ingressInput(staleActiveSnapshot, RECEIPT, 1_600, 1_700),
  );
  assert.equal(replayedStaleTrust.ok, false);
  if (!replayedStaleTrust.ok) {
    assert.equal(replayedStaleTrust.error.code, 'SESSION_NOT_TRUSTED');
  }
  assert.equal(w07Ingress.calls, 0);
});

test('DP3 does not suppress W07 evidence delivery when a W03 reservation is still inflight', () => {
  const { manager, w07Ingress } = createHarness();
  w07Ingress.failFirst = true;
  const active = trust('ACTIVE');

  const first = manager.ingest(ingressInput(active));
  assert.equal(first.ok, false);
  if (!first.ok) assert.equal(first.error.code, 'W07_INGRESS_REJECTED');
  assert.equal(w07Ingress.calls, 1);

  const retry = manager.ingest(ingressInput(active));
  assert.equal(retry.ok, true);
  assert.equal(w07Ingress.calls, 2);
});

test('DP3 late-after-revoke window is bounded by ingress time, not only device capture time', () => {
  const maxLateAfterRevokeMs = 5 * 60 * 1000;
  const { manager, w07Ingress } = createHarness({
    maxLateAfterRevokeMs,
    maxReceiptAgeMs: 15 * 60 * 1000,
  });
  const revoked = trust('REVOKED');
  const receivedAfterWindow = REVOKED_AT_MS + maxLateAfterRevokeMs + 1;

  const result = manager.ingest(
    ingressInput(
      revoked,
      'rcp_01ARZ3NDEKTSV4RRFFQ69G5FAW' as ReceiptId,
      REVOKED_AT_MS + 1,
      receivedAfterWindow,
    ),
  );

  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'RECEIPT_STALE');
  assert.equal(w07Ingress.calls, 0);
});
