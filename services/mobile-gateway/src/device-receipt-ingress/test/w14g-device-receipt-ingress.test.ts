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

import type { DeviceId } from '../../device/types.js';
import type {
  DeviceSessionTrustResult,
  DeviceSessionTrustSnapshot,
  RevokeDeviceSessionTrustInput,
} from '../../device-session/types.js';
import type {
  ProgressCancellationPort,
  ProgressCancellationPortResult,
  ProgressCancellationPortSuccess,
  ProgressCancellationSessionView,
} from '../../progress-cancellation/types.js';
import { DeviceReceiptIngressManager } from '../manager.js';
import type {
  DeviceIngressAuthenticationPort,
  DeviceIngressAuthenticationRequest,
  DeviceIngressAuthenticationResult,
  DeviceSessionCurrentTrustPort,
  DeviceSessionCurrentTrustRequest,
  DeviceSessionRevocationPort,
  W03ReceiptIngressCompletionRequest,
  W03ReceiptIngressCompletionResult,
  W03ReceiptIngressReservationPort,
  W03ReceiptIngressReservationRequest,
  W03ReceiptIngressReservationResult,
  W07DeviceReceiptEvidenceIngressPort,
  W07DeviceReceiptEvidenceIngressResult,
  W07DeviceReceiptEvidenceObservation,
} from '../types.js';

const TENANT = 'tnn_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId;
const OTHER_TENANT = 'tnn_01ARZ3NDEKTSV4RRFFQ69G5FAW' as TenantId;
const CORRELATION = 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CorrelationId;
const COMMAND = 'cmd_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CommandId;
const EXECUTION = 'exe_01ARZ3NDEKTSV4RRFFQ69G5FAV' as ExecutionId;
const RECEIPT = 'rcp_01ARZ3NDEKTSV4RRFFQ69G5FAV' as ReceiptId;
const EVIDENCE = 'evd_01ARZ3NDEKTSV4RRFFQ69G5FAV' as EvidenceId;
const DEVICE = 'device-1' as DeviceId;

function trust(
  state: 'ACTIVE' | 'REVOKED' = 'ACTIVE',
  connectionId = 'connection-1',
  generation = 2,
): DeviceSessionTrustSnapshot {
  return {
    kind: 'DeviceSessionTrustSnapshot',
    schemaVersion: '1.0.0',
    deviceSessionId: 'device-session-1',
    gatewaySessionId: 'gateway-session-1',
    connectionId,
    gatewayGeneration: generation,
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
    lastEvaluatedAtMs: state === 'REVOKED' ? 1_500 : 1_000,
    gatewayAuthExpiresAtMs: 1_000_000,
    ...(state === 'REVOKED' ? { revokedAtMs: 1_500, revocationReasonReference: 'kill-1' } : {}),
    executionPreconditionSatisfied: state === 'ACTIVE',
    requiresCurrentAuthorityValidation: true,
    authoritySemantics: 'DEVICE_SESSION_TRUST_IS_PRECONDITION_METADATA_ONLY',
    authorizesExecution: false,
    canGrantPermission: false,
  };
}

class CurrentTrustPort implements DeviceSessionCurrentTrustPort {
  current: DeviceSessionTrustSnapshot | undefined;

  validateCurrent(request: DeviceSessionCurrentTrustRequest): DeviceSessionTrustResult {
    const snapshot = this.current ?? request.claimedSession;
    return {
      ok: true,
      snapshot,
      authorizesExecution: false,
      canGrantPermission: false,
    };
  }
}

class RevocationPort implements DeviceSessionRevocationPort {
  calls = 0;
  readonly #currentTrust: CurrentTrustPort;

  constructor(currentTrust: CurrentTrustPort) {
    this.#currentTrust = currentTrust;
  }

  revokeSession(input: RevokeDeviceSessionTrustInput): DeviceSessionTrustResult {
    this.calls += 1;
    const snapshot = {
      ...trust('REVOKED', input.connectionId, 2),
      revokedAtMs: input.revokedAtMs,
      lastEvaluatedAtMs: input.revokedAtMs,
      revocationReasonReference: input.reasonReference,
    };
    this.#currentTrust.current = snapshot;
    return { ok: true, snapshot, authorizesExecution: false, canGrantPermission: false };
  }
}

class CancellationPort implements ProgressCancellationPort {
  cancellationCalls = 0;

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
    this.cancellationCalls += 1;
    return {
      ok: true,
      value: {
        disposition: 'CANCEL_REQUESTED',
        command: {
          commandId: COMMAND,
          correlationId: CORRELATION,
          state: 'CANCEL_REQUESTED',
          cancelRequestedAtMs: 1_500,
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
  reject = false;

  verify(request: DeviceIngressAuthenticationRequest): DeviceIngressAuthenticationResult {
    if (this.reject) {
      return {
        ok: false,
        code: 'UNAUTHENTICATED',
        retryable: false,
        authorizesExecution: false,
        canGrantPermission: false,
      };
    }
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
  readonly records = new Map<string, { fingerprint: string; status: 'inflight' | 'completed' }>();
  completionCalls = 0;
  failCompletion = false;

  reserve(request: W03ReceiptIngressReservationRequest): W03ReceiptIngressReservationResult {
    const prior = this.records.get(request.receiptId);
    if (prior !== undefined && prior.fingerprint !== request.fingerprint) {
      return { ok: false, code: 'CONFLICT', retryable: false, authorizesExecution: false };
    }
    if (prior === undefined) {
      this.records.set(request.receiptId, { fingerprint: request.fingerprint, status: 'inflight' });
      return {
        ok: true,
        disposition: 'RESERVED',
        status: 'inflight',
        durableReference: `w03:${request.receiptId}`,
        authorizesExecution: false,
      };
    }
    return {
      ok: true,
      disposition: 'ALREADY_RESERVED',
      status: prior.status,
      durableReference: `w03:${request.receiptId}`,
      authorizesExecution: false,
    };
  }

  complete(request: W03ReceiptIngressCompletionRequest): W03ReceiptIngressCompletionResult {
    this.completionCalls += 1;
    if (this.failCompletion) {
      return { ok: false, code: 'UNAVAILABLE', retryable: true, authorizesExecution: false };
    }
    const prior = this.records.get(request.receiptId);
    if (prior === undefined || request.durableReference !== `w03:${request.receiptId}`) {
      return { ok: false, code: 'CONFLICT', retryable: false, authorizesExecution: false };
    }
    const disposition = prior.status === 'completed' ? 'ALREADY_COMPLETED' : 'COMPLETED';
    this.records.set(request.receiptId, { ...prior, status: 'completed' });
    return {
      ok: true,
      disposition,
      status: 'completed',
      durableReference: request.durableReference,
      authorizesExecution: false,
    };
  }
}

class W07IngressPort implements W07DeviceReceiptEvidenceIngressPort {
  observations: W07DeviceReceiptEvidenceObservation[] = [];
  readonly observedReceipts = new Set<string>();
  failFirst = false;

  observe(observation: W07DeviceReceiptEvidenceObservation): W07DeviceReceiptEvidenceIngressResult {
    this.observations.push(observation);
    if (this.failFirst && this.observations.length === 1) {
      return {
        ok: false,
        code: 'UNAVAILABLE',
        retryable: true,
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      };
    }
    const alreadyObserved = this.observedReceipts.has(observation.receiptId);
    this.observedReceipts.add(observation.receiptId);
    return {
      ok: true,
      disposition: alreadyObserved ? 'ALREADY_OBSERVED' : 'OBSERVED',
      receiptReference: `w07:${observation.receiptId}`,
      evidenceReference: 'w07:evidence-1',
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    };
  }
}

function createHarness(
  config: { maxReceiptAgeMs?: number; maxLateAfterRevokeMs?: number } = {},
) {
  const currentTrust = new CurrentTrustPort();
  const revocation = new RevocationPort(currentTrust);
  const cancellation = new CancellationPort();
  const authentication = new AuthenticationPort();
  const durableIngress = new DurableIngressPort();
  const w07Ingress = new W07IngressPort();
  const manager = new DeviceReceiptIngressManager(
    {
      sessionRevocation: revocation,
      currentSessionTrust: currentTrust,
      cancellation,
      authentication,
      durableIngress,
      w07Ingress,
    },
    config,
  );
  return {
    manager,
    currentTrust,
    revocation,
    cancellation,
    authentication,
    durableIngress,
    w07Ingress,
  };
}

function ingressInput(session = trust()) {
  return {
    receiptId: RECEIPT,
    evidenceId: EVIDENCE,
    tenantId: TENANT,
    correlationId: CORRELATION,
    commandId: COMMAND,
    executionId: EXECUTION,
    deviceRef: session.deviceRef,
    deviceSessionId: session.deviceSessionId,
    gatewaySessionId: session.gatewaySessionId,
    connectionId: session.connectionId,
    gatewayGeneration: session.gatewayGeneration,
    deliveryReference: 'w14f:delivery-1',
    reportedState: 'COMPLETED' as const,
    sourceReference: 'device-receipt-1',
    proofReference: 'device-proof-1',
    integrityDigest: 'sha256:abcdef0123456789',
    capturedAtMs: 1_200,
    receivedAtMs: 1_300,
    deviceSession: session,
  };
}

test('revoke and kill is monotonic evidence-safe orchestration, not execution proof', () => {
  const { manager, revocation, cancellation } = createHarness();
  const result = manager.revokeAndKill({
    deviceSession: trust('ACTIVE', 'connection-1', 2),
    tenantId: TENANT,
    correlationId: CORRELATION,
    commandId: COMMAND,
    revokedAtMs: 1_500,
    reasonReference: 'kill-1',
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(revocation.calls, 1);
  assert.equal(cancellation.cancellationCalls, 1);
  assert.equal(result.value.deviceSession.state, 'REVOKED');
  assert.equal(result.value.cancellationDisposition, 'CANCEL_REQUESTED');
  assert.equal(result.value.outcomeAuthority, 'W07_ONLY');
  assert.equal(result.value.provesExecutionPrevented, false);
  assert.equal(result.value.provesExecutionSuccess, false);
  assert.equal(result.value.authorizesExecution, false);
  assert.equal(result.value.retryAuthorized, false);
});

test('stale ACTIVE trust cannot bypass canonical W14-E revocation after kill', () => {
  const { manager, w07Ingress } = createHarness();
  const staleActive = trust('ACTIVE');
  const killed = manager.revokeAndKill({
    deviceSession: staleActive,
    tenantId: TENANT,
    correlationId: CORRELATION,
    commandId: COMMAND,
    revokedAtMs: 1_500,
    reasonReference: 'kill-1',
  });
  assert.equal(killed.ok, true);

  const replay = manager.ingest({
    ...ingressInput(staleActive),
    capturedAtMs: 1_600,
    receivedAtMs: 1_700,
  });
  assert.equal(replay.ok, false);
  if (!replay.ok) assert.equal(replay.error.code, 'SESSION_NOT_TRUSTED');
  assert.equal(w07Ingress.observations.length, 0);
});

test('current authenticated receipt is forwarded as evidence input without minting outcome authority', () => {
  const { manager, w07Ingress, durableIngress } = createHarness();
  const result = manager.ingest(ingressInput());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.classification, 'CURRENT_SESSION');
  assert.equal(result.value.provesExecutionSuccess, false);
  assert.equal(result.value.retryAuthorized, false);
  assert.equal(w07Ingress.observations.length, 1);
  assert.equal(durableIngress.records.get(RECEIPT)?.status, 'completed');
  assert.equal(
    w07Ingress.observations[0]?.authoritySemantics,
    'EVIDENCE_INPUT_ONLY_W07_OWNS_OUTCOME_AND_RETRY',
  );
  assert.equal(w07Ingress.observations[0]?.provesExecutionSuccess, false);
});

test('wrong tenant or device fails before authentication/evidence forwarding', () => {
  const { manager, w07Ingress } = createHarness();
  const wrongTenant = manager.ingest({ ...ingressInput(), tenantId: OTHER_TENANT });
  assert.equal(wrongTenant.ok, false);
  if (!wrongTenant.ok) assert.equal(wrongTenant.error.code, 'TENANT_MISMATCH');

  const input = ingressInput();
  const wrongDevice = manager.ingest({
    ...input,
    deviceRef: { ...input.deviceRef, deviceId: 'device-forged' as DeviceId },
  });
  assert.equal(wrongDevice.ok, false);
  if (!wrongDevice.ok) assert.equal(wrongDevice.error.code, 'DEVICE_MISMATCH');
  assert.equal(w07Ingress.observations.length, 0);
});

test('late receipt after reconnect is accepted only as reconciliable evidence', () => {
  const { manager, currentTrust, w07Ingress } = createHarness();
  const current = trust('ACTIVE', 'connection-2', 3);
  currentTrust.current = current;
  const result = manager.ingest({
    ...ingressInput(current),
    connectionId: 'connection-1',
    gatewayGeneration: 2,
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.classification, 'LATE_AFTER_RECONNECT');
  assert.equal(result.value.requiresW07Reconciliation, true);
  assert.equal(w07Ingress.observations[0]?.requiresW07Reconciliation, true);
});

test('late receipt after revoke remains evidence-only and is bounded by ingress time', () => {
  const { manager, currentTrust } = createHarness();
  const revoked = trust('REVOKED', 'connection-1', 2);
  currentTrust.current = revoked;
  const accepted = manager.ingest({
    ...ingressInput(revoked),
    capturedAtMs: 1_550,
    receivedAtMs: 1_600,
  });
  assert.equal(accepted.ok, true);
  if (accepted.ok) {
    assert.equal(accepted.value.classification, 'LATE_AFTER_REVOKE');
    assert.equal(accepted.value.requiresW07Reconciliation, true);
    assert.equal(accepted.value.provesExecutionSuccess, false);
  }

  const staleByIngress = manager.ingest({
    ...ingressInput(revoked),
    receiptId: 'rcp_01ARZ3NDEKTSV4RRFFQ69G5FAW' as ReceiptId,
    capturedAtMs: 1_501,
    receivedAtMs: 301_501,
  });
  assert.equal(staleByIngress.ok, false);
  if (!staleByIngress.ok) assert.equal(staleByIngress.error.code, 'RECEIPT_STALE');
});

test('completed durable duplicate is not re-forwarded to W07', () => {
  const { manager, w07Ingress, durableIngress } = createHarness();
  const first = manager.ingest(ingressInput());
  assert.equal(first.ok, true);
  assert.equal(durableIngress.records.get(RECEIPT)?.status, 'completed');
  const duplicate = manager.ingest(ingressInput());
  assert.equal(duplicate.ok, true);
  if (!duplicate.ok) return;
  assert.equal(duplicate.value.classification, 'DUPLICATE');
  assert.equal(w07Ingress.observations.length, 1);
});

test('inflight W03 replay re-forwards evidence after transient W07 failure', () => {
  const { manager, w07Ingress, durableIngress } = createHarness();
  w07Ingress.failFirst = true;

  const first = manager.ingest(ingressInput());
  assert.equal(first.ok, false);
  if (!first.ok) assert.equal(first.error.code, 'W07_INGRESS_REJECTED');
  assert.equal(durableIngress.records.get(RECEIPT)?.status, 'inflight');
  assert.equal(w07Ingress.observations.length, 1);

  const retry = manager.ingest(ingressInput());
  assert.equal(retry.ok, true);
  assert.equal(w07Ingress.observations.length, 2);
  assert.equal(durableIngress.records.get(RECEIPT)?.status, 'completed');
});

test('W03 completion failure never claims durable success and can reconcile on retry', () => {
  const { manager, w07Ingress, durableIngress } = createHarness();
  durableIngress.failCompletion = true;

  const first = manager.ingest(ingressInput());
  assert.equal(first.ok, false);
  if (!first.ok) assert.equal(first.error.code, 'DURABLE_IDEMPOTENCY_UNAVAILABLE');
  assert.equal(durableIngress.records.get(RECEIPT)?.status, 'inflight');
  assert.equal(w07Ingress.observations.length, 1);

  durableIngress.failCompletion = false;
  const retry = manager.ingest(ingressInput());
  assert.equal(retry.ok, true);
  assert.equal(w07Ingress.observations.length, 2);
  assert.equal(durableIngress.records.get(RECEIPT)?.status, 'completed');
});

test('forged session proof fails closed and never reaches W03 or W07', () => {
  const { manager, authentication, durableIngress, w07Ingress } = createHarness();
  authentication.reject = true;
  const result = manager.ingest(ingressInput());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'SESSION_PROOF_REJECTED');
  assert.equal(durableIngress.records.size, 0);
  assert.equal(w07Ingress.observations.length, 0);
});
