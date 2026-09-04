import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
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
  DeviceSessionCurrentTrustRequest,
  DeviceSessionCurrentTrustResult,
  DeviceSessionTrustPort,
  W03ReceiptIngressCompletionRequest,
  W03ReceiptIngressCompletionResult,
  W03ReceiptIngressReservationPort,
  W03ReceiptIngressReservationRequest,
  W03ReceiptIngressReservationResult,
  W03ReceiptIngressStatus,
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

function percentile(values: readonly number[], quantile: number): number {
  assert.ok(values.length > 0);
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1));
  return sorted[index] ?? 0;
}

function summarizeLatency(values: readonly number[]) {
  return {
    p50: Number(percentile(values, 0.5).toFixed(6)),
    p95: Number(percentile(values, 0.95).toFixed(6)),
    p99: Number(percentile(values, 0.99).toFixed(6)),
  };
}

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

class StatefulSessionTrustPort implements DeviceSessionTrustPort {
  verifyCalls = 0;
  revokeCalls = 0;
  current: DeviceSessionTrustSnapshot;

  constructor(initial: DeviceSessionTrustSnapshot) {
    this.current = initial;
  }

  verifyCurrent(request: DeviceSessionCurrentTrustRequest): DeviceSessionCurrentTrustResult {
    this.verifyCalls += 1;
    if (request.deviceSession.deviceSessionId !== this.current.deviceSessionId) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        retryable: false,
        authorizesExecution: false,
        canGrantPermission: false,
      };
    }
    return {
      ok: true,
      snapshot: this.current,
      current: true,
      authorizesExecution: false,
      canGrantPermission: false,
    };
  }

  revokeSession(input: RevokeDeviceSessionTrustInput): DeviceSessionTrustResult {
    this.revokeCalls += 1;
    const snapshot: DeviceSessionTrustSnapshot = {
      ...this.current,
      state: 'REVOKED',
      connectionId: input.connectionId,
      revokedAtMs: input.revokedAtMs,
      lastEvaluatedAtMs: input.revokedAtMs,
      revocationReasonReference: input.reasonReference,
      executionPreconditionSatisfied: false,
    };
    this.current = snapshot;
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
  readonly statuses = new Map<string, W03ReceiptIngressStatus>();

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
    if (prior === undefined) {
      this.fingerprints.set(request.receiptId, request.fingerprint);
      this.statuses.set(request.receiptId, 'inflight');
    }
    return {
      ok: true,
      disposition: prior === undefined ? 'RESERVED' : 'ALREADY_RESERVED',
      status: this.statuses.get(request.receiptId) ?? 'inflight',
      durableReference: `w03:${request.receiptId}`,
      authorizesExecution: false,
    };
  }

  complete(request: W03ReceiptIngressCompletionRequest): W03ReceiptIngressCompletionResult {
    const prior = this.fingerprints.get(request.receiptId);
    if (
      prior === undefined ||
      prior !== request.fingerprint ||
      request.durableReference !== `w03:${request.receiptId}`
    ) {
      return {
        ok: false,
        code: 'CONFLICT',
        retryable: false,
        authorizesExecution: false,
      };
    }
    this.statuses.set(request.receiptId, 'completed');
    return {
      ok: true,
      status: 'completed',
      durableReference: request.durableReference,
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
      disposition: this.calls > 1 ? 'ALREADY_OBSERVED' : 'OBSERVED',
      receiptReference: `w07:${observation.receiptId}`,
      evidenceReference: 'w07:evidence-1',
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    };
  }
}

function createHarness(
  initialTrust: DeviceSessionTrustSnapshot = trust(),
  config: { maxReceiptAgeMs?: number; maxLateAfterRevokeMs?: number } = {},
) {
  const sessionTrust = new StatefulSessionTrustPort(initialTrust);
  const cancellation = new CancellationPort();
  const authentication = new AuthenticationPort();
  const durableIngress = new DurableIngressPort();
  const w07Ingress = new W07IngressPort();
  const manager = new DeviceReceiptIngressManager(
    {
      sessionTrust,
      cancellation,
      authentication,
      durableIngress,
      w07Ingress,
    },
    config,
  );
  return { manager, sessionTrust, durableIngress, w07Ingress };
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
  const { manager, sessionTrust, w07Ingress } = createHarness();
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
  assert.equal(sessionTrust.current.state, 'REVOKED');

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
  const { manager, durableIngress, w07Ingress } = createHarness();
  w07Ingress.failFirst = true;
  const active = trust('ACTIVE');

  const first = manager.ingest(ingressInput(active));
  assert.equal(first.ok, false);
  if (!first.ok) assert.equal(first.error.code, 'W07_INGRESS_REJECTED');
  assert.equal(w07Ingress.calls, 1);
  assert.equal(durableIngress.statuses.get(RECEIPT), 'inflight');

  const retry = manager.ingest(ingressInput(active));
  assert.equal(retry.ok, true);
  assert.equal(w07Ingress.calls, 2);
  assert.equal(durableIngress.statuses.get(RECEIPT), 'completed');
});

test('DP3 late-after-revoke window is bounded by ingress time, not only device capture time', () => {
  const maxLateAfterRevokeMs = 5 * 60 * 1000;
  const revoked = trust('REVOKED');
  const { manager, w07Ingress } = createHarness(revoked, {
    maxLateAfterRevokeMs,
    maxReceiptAgeMs: 15 * 60 * 1000,
  });
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

test('DP3 emits test-scope p50/p95/p99 evidence without claiming physical-device or production SLO', () => {
  const active = trust('ACTIVE');
  const currentHarness = createHarness(active);
  const currentIngressMs: number[] = [];
  const currentSamples = 256;

  for (let index = 0; index < currentSamples; index += 1) {
    const startedAt = performance.now();
    const result = currentHarness.manager.ingest(
      ingressInput(active, `rcp_w14h_current_${index}` as ReceiptId),
    );
    currentIngressMs.push(performance.now() - startedAt);
    assert.equal(result.ok, true);
  }
  assert.equal(currentHarness.w07Ingress.calls, currentSamples);

  const staleActive = trust('ACTIVE');
  const rejectionHarness = createHarness(staleActive);
  const killed = rejectionHarness.manager.revokeAndKill({
    deviceSession: staleActive,
    tenantId: TENANT,
    correlationId: CORRELATION,
    commandId: COMMAND,
    revokedAtMs: REVOKED_AT_MS,
    reasonReference: 'benchmark-kill',
  });
  assert.equal(killed.ok, true);

  const staleTrustRejectMs: number[] = [];
  const rejectionSamples = 128;
  for (let index = 0; index < rejectionSamples; index += 1) {
    const startedAt = performance.now();
    const result = rejectionHarness.manager.ingest(
      ingressInput(
        staleActive,
        `rcp_w14h_stale_${index}` as ReceiptId,
        REVOKED_AT_MS + 1,
        REVOKED_AT_MS + 2,
      ),
    );
    staleTrustRejectMs.push(performance.now() - startedAt);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'SESSION_NOT_TRUSTED');
  }
  assert.equal(rejectionHarness.w07Ingress.calls, 0);

  const evidence = {
    kind: 'W14H_DP3_PERFORMANCE_EVIDENCE',
    measurementBoundary: 'TEST_ONLY_NOT_PRODUCTION_SLO',
    currentReceiptIngress: {
      samples: currentSamples,
      latencyMs: summarizeLatency(currentIngressMs),
    },
    staleTrustRejection: {
      samples: rejectionSamples,
      latencyMs: summarizeLatency(staleTrustRejectMs),
    },
    providerNetworkLatency: 'NOT_OBSERVED',
    physicalDeviceLatencyBatteryResource: 'NOT_OBSERVED_W15_J',
    productionSlo: 'NOT_CLAIMED',
  } as const;

  assert.ok(Number.isFinite(evidence.currentReceiptIngress.latencyMs.p50));
  assert.ok(Number.isFinite(evidence.currentReceiptIngress.latencyMs.p95));
  assert.ok(Number.isFinite(evidence.currentReceiptIngress.latencyMs.p99));
  assert.ok(Number.isFinite(evidence.staleTrustRejection.latencyMs.p50));
  assert.ok(Number.isFinite(evidence.staleTrustRejection.latencyMs.p95));
  assert.ok(Number.isFinite(evidence.staleTrustRejection.latencyMs.p99));
  console.log(`[w14h:benchmark] ${JSON.stringify(evidence)}`);
});
