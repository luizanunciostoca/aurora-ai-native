import type { CorrelationId, TenantId } from '@aurora/contracts/ids';

import type { DeviceRef } from '../device/types.js';
import type { DeviceSessionTrustSnapshot } from '../device-session/types.js';
import type {
  DeviceReceiptIngressClassification,
  DeviceReceiptIngressConfig,
  DeviceReceiptIngressDependencies,
  DeviceReceiptIngressErrorCode,
  DeviceReceiptIngressInput,
  DeviceReceiptIngressResult,
  DeviceReceiptIngressSuccess,
  RevokeAndKillDeviceSessionInput,
  RevokeAndKillDeviceSessionSuccess,
  W07DeviceReceiptEvidenceObservation,
} from './types.js';

const DEFAULT_CONFIG: DeviceReceiptIngressConfig = {
  maxReceiptAgeMs: 15 * 60 * 1000,
  maxLateAfterRevokeMs: 5 * 60 * 1000,
  maxReferenceLength: 512,
  maxIntegrityDigestLength: 256,
};

const SAFE_TOKEN = /^[A-Za-z0-9._:/+-]+$/u;
const REPORTED_STATES = new Set(['COMPLETED', 'FAILED', 'UNCERTAIN']);

function success<T>(value: T): DeviceReceiptIngressResult<T> {
  return { ok: true, value, authorizesExecution: false, retryAuthorized: false };
}

function failure<T>(
  code: DeviceReceiptIngressErrorCode,
  message: string,
  retryable = false,
  upstreamCode?: string,
): DeviceReceiptIngressResult<T> {
  return {
    ok: false,
    error: {
      code,
      message,
      retryable,
      ...(upstreamCode === undefined ? {} : { upstreamCode }),
    },
    authorizesExecution: false,
    retryAuthorized: false,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    return Object.values(descriptors).every(
      (descriptor) => descriptor.get === undefined && descriptor.set === undefined,
    );
  } catch {
    return false;
  }
}

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(record).every((key) => allowed.has(key));
}

function isSafeToken(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    SAFE_TOKEN.test(value)
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isDeviceRefShape(value: unknown): value is DeviceRef {
  if (!isPlainRecord(value)) return false;
  return (
    hasOnlyKeys(value, ['kind', 'deviceId', 'tenantId', 'registrationVersion']) &&
    value.kind === 'AURORA_DEVICE' &&
    isSafeToken(value.deviceId, 128) &&
    isSafeToken(value.tenantId, 64) &&
    Number.isSafeInteger(value.registrationVersion) &&
    (value.registrationVersion as number) > 0
  );
}

function isTrustSnapshotShape(value: unknown): value is DeviceSessionTrustSnapshot {
  if (!isPlainRecord(value)) return false;
  if (
    value.kind !== 'DeviceSessionTrustSnapshot' ||
    value.schemaVersion !== '1.0.0' ||
    !isSafeToken(value.deviceSessionId, 512) ||
    !isSafeToken(value.gatewaySessionId, 512) ||
    !isSafeToken(value.connectionId, 512) ||
    !Number.isSafeInteger(value.gatewayGeneration) ||
    (value.gatewayGeneration as number) <= 0 ||
    !isSafeToken(value.tenantId, 64) ||
    !isSafeToken(value.actorIdentityId, 64) ||
    !isSafeToken(value.correlationId, 64) ||
    !isDeviceRefShape(value.deviceRef) ||
    (value.state !== 'ACTIVE' && value.state !== 'REVOKED') ||
    !isNonNegativeInteger(value.openedAtMs) ||
    !isNonNegativeInteger(value.lastEvaluatedAtMs) ||
    !isNonNegativeInteger(value.gatewayAuthExpiresAtMs) ||
    value.requiresCurrentAuthorityValidation !== true ||
    value.authoritySemantics !== 'DEVICE_SESSION_TRUST_IS_PRECONDITION_METADATA_ONLY' ||
    value.authorizesExecution !== false ||
    value.canGrantPermission !== false ||
    typeof value.executionPreconditionSatisfied !== 'boolean' ||
    !isPlainRecord(value.attestation)
  ) {
    return false;
  }
  if (
    value.attestation.kind !== 'DEVICE_ATTESTATION_REFERENCE' ||
    !isSafeToken(value.attestation.reference, 512) ||
    !isSafeToken(value.attestation.provider, 128) ||
    !isSafeToken(value.attestation.version, 64) ||
    (value.attestation.state !== 'VERIFIED' &&
      value.attestation.state !== 'REVOKED' &&
      value.attestation.state !== 'AMBIGUOUS') ||
    !isNonNegativeInteger(value.attestation.observedAtMs) ||
    !isNonNegativeInteger(value.attestation.expiresAtMs)
  ) {
    return false;
  }
  if (
    value.revokedAtMs !== undefined &&
    (!isNonNegativeInteger(value.revokedAtMs) || !isSafeToken(value.revocationReasonReference, 512))
  ) {
    return false;
  }
  if (value.state === 'REVOKED' && value.revokedAtMs === undefined) return false;
  return true;
}

function deviceRefMatches(left: DeviceRef, right: DeviceRef): boolean {
  return (
    left.kind === 'AURORA_DEVICE' &&
    right.kind === 'AURORA_DEVICE' &&
    left.deviceId === right.deviceId &&
    left.tenantId === right.tenantId &&
    left.registrationVersion === right.registrationVersion
  );
}

function trustBindingError<T>(
  trust: DeviceSessionTrustSnapshot,
  tenantId: TenantId,
  correlationId: CorrelationId,
  nowMs: number,
): DeviceReceiptIngressResult<T> | null {
  if (trust.tenantId !== tenantId) {
    return failure('TENANT_MISMATCH', 'Device session trust belongs to another tenant.');
  }
  if (trust.correlationId !== correlationId) {
    return failure('CORRELATION_MISMATCH', 'Device session trust belongs to another correlation.');
  }
  if (
    trust.authorizesExecution !== false ||
    trust.canGrantPermission !== false ||
    trust.requiresCurrentAuthorityValidation !== true
  ) {
    return failure('SESSION_NOT_TRUSTED', 'Device session trust violates authority boundaries.');
  }
  if (
    trust.state === 'ACTIVE' &&
    (nowMs >= trust.gatewayAuthExpiresAtMs ||
      nowMs >= trust.attestation.expiresAtMs ||
      trust.attestation.state !== 'VERIFIED')
  ) {
    return failure('SESSION_NOT_TRUSTED', 'Active device session trust is stale or invalid.');
  }
  return null;
}

function fingerprint(input: DeviceReceiptIngressInput): string {
  return [
    input.tenantId,
    input.receiptId,
    input.commandId,
    input.executionId,
    input.deviceRef.deviceId,
    input.deviceRef.registrationVersion,
    input.deviceSessionId,
    input.gatewayGeneration,
    input.deliveryReference,
    input.sourceReference,
    input.integrityDigest,
  ].join('|');
}

export class DeviceReceiptIngressManager {
  readonly #dependencies: DeviceReceiptIngressDependencies;
  readonly #config: DeviceReceiptIngressConfig;

  constructor(
    dependencies: DeviceReceiptIngressDependencies,
    config: Partial<DeviceReceiptIngressConfig> = {},
  ) {
    this.#dependencies = dependencies;
    this.#config = { ...DEFAULT_CONFIG, ...config };
    if (
      !Number.isSafeInteger(this.#config.maxReceiptAgeMs) ||
      !Number.isSafeInteger(this.#config.maxLateAfterRevokeMs) ||
      !Number.isSafeInteger(this.#config.maxReferenceLength) ||
      !Number.isSafeInteger(this.#config.maxIntegrityDigestLength) ||
      this.#config.maxReceiptAgeMs <= 0 ||
      this.#config.maxLateAfterRevokeMs < 0 ||
      this.#config.maxReferenceLength <= 0 ||
      this.#config.maxIntegrityDigestLength <= 0
    ) {
      throw new Error('Device receipt ingress limits must be non-negative and internally valid.');
    }
  }

  revokeAndKill(input: unknown): DeviceReceiptIngressResult<RevokeAndKillDeviceSessionSuccess> {
    const parsed = this.#parseRevokeAndKillInput(input);
    if (!parsed.ok) return parsed.result;
    const candidate = parsed.value;
    const trustBlock = trustBindingError<RevokeAndKillDeviceSessionSuccess>(
      candidate.deviceSession,
      candidate.tenantId,
      candidate.correlationId,
      candidate.revokedAtMs,
    );
    if (trustBlock) return trustBlock;

    const gateway = this.#dependencies.cancellation.getSession(
      candidate.deviceSession.gatewaySessionId,
      candidate.revokedAtMs,
    );
    if (
      !gateway.ok ||
      gateway.value.gatewaySessionId !== candidate.deviceSession.gatewaySessionId ||
      gateway.value.gatewayConnectionId !== candidate.deviceSession.connectionId ||
      gateway.value.tenantId !== candidate.tenantId ||
      gateway.value.correlationId !== candidate.correlationId
    ) {
      return failure(
        'CANCELLATION_BINDING_MISMATCH',
        'Gateway cancellation session does not match device-session trust.',
        false,
        gateway.ok ? undefined : gateway.error.code,
      );
    }

    const revoked = this.#dependencies.sessionRevocation.revokeSession({
      deviceSessionId: candidate.deviceSession.deviceSessionId,
      connectionId: candidate.deviceSession.connectionId,
      revokedAtMs: candidate.revokedAtMs,
      reasonReference: candidate.reasonReference,
    });
    if (!revoked.ok) {
      return failure(
        'REVOCATION_REJECTED',
        'Canonical W14-E session revocation rejected the kill request.',
        revoked.error.retryable,
        revoked.error.code,
      );
    }
    if (
      revoked.snapshot.state !== 'REVOKED' ||
      revoked.snapshot.authorizesExecution !== false ||
      revoked.snapshot.canGrantPermission !== false
    ) {
      return failure(
        'REVOCATION_REJECTED',
        'Canonical W14-E revocation returned an invalid trust snapshot.',
      );
    }

    const cancellation = this.#dependencies.cancellation.requestCancellation({
      tenantId: candidate.tenantId,
      correlationId: candidate.correlationId,
      gatewaySessionId: candidate.deviceSession.gatewaySessionId,
      gatewayConnectionId: candidate.deviceSession.connectionId,
      commandId: candidate.commandId,
      nowMs: candidate.revokedAtMs,
    });

    const cancellationDisposition = cancellation.ok
      ? cancellation.value.disposition
      : 'UPSTREAM_CANCELLATION_UNCONFIRMED';
    return success({
      deviceSession: revoked.snapshot,
      cancellationDisposition,
      effect: 'SESSION_REVOKED_AND_COMMAND_CANCELLATION_REQUESTED',
      outcomeAuthority: 'W07_ONLY',
      requiresW07Reconciliation:
        !cancellation.ok || cancellation.value.disposition === 'NOOP_TERMINAL_OR_UNCERTAIN',
      authorizesExecution: false,
      canGrantPermission: false,
      provesExecutionPrevented: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    });
  }

  ingest(input: unknown): DeviceReceiptIngressResult<DeviceReceiptIngressSuccess> {
    const parsed = this.#parseIngressInput(input);
    if (!parsed.ok) return parsed.result;
    const candidate = parsed.value;
    const trust = candidate.deviceSession;

    const trustBlock = trustBindingError<DeviceReceiptIngressSuccess>(
      trust,
      candidate.tenantId,
      candidate.correlationId,
      candidate.receivedAtMs,
    );
    if (trustBlock) return trustBlock;
    if (!deviceRefMatches(candidate.deviceRef, trust.deviceRef)) {
      return failure('DEVICE_MISMATCH', 'Receipt device reference does not match session trust.');
    }
    if (
      candidate.deviceSessionId !== trust.deviceSessionId ||
      candidate.gatewaySessionId !== trust.gatewaySessionId
    ) {
      return failure(
        'SESSION_MISMATCH',
        'Receipt session identity does not match canonical trust.',
      );
    }
    if (candidate.gatewayGeneration > trust.gatewayGeneration) {
      return failure('SESSION_MISMATCH', 'Receipt claims a future gateway generation.');
    }
    if (
      candidate.gatewayGeneration === trust.gatewayGeneration &&
      candidate.connectionId !== trust.connectionId
    ) {
      return failure(
        'SESSION_MISMATCH',
        'Receipt connection does not match its gateway generation.',
      );
    }
    if (candidate.capturedAtMs > candidate.receivedAtMs) {
      return failure('RECEIPT_FROM_FUTURE', 'Receipt capture time is later than ingress time.');
    }
    if (candidate.receivedAtMs - candidate.capturedAtMs > this.#config.maxReceiptAgeMs) {
      return failure('RECEIPT_STALE', 'Receipt exceeded the bounded ingress age.');
    }

    let classification: Exclude<DeviceReceiptIngressClassification, 'DUPLICATE'> =
      'CURRENT_SESSION';
    if (trust.state === 'REVOKED') {
      if (
        trust.revokedAtMs === undefined ||
        candidate.capturedAtMs > trust.revokedAtMs + this.#config.maxLateAfterRevokeMs
      ) {
        return failure('RECEIPT_STALE', 'Receipt is outside the bounded post-revocation window.');
      }
      classification = 'LATE_AFTER_REVOKE';
    } else if (candidate.gatewayGeneration < trust.gatewayGeneration) {
      classification = 'LATE_AFTER_RECONNECT';
    }

    const authentication = this.#dependencies.authentication.verify({
      tenantId: candidate.tenantId,
      correlationId: candidate.correlationId,
      deviceRef: candidate.deviceRef,
      deviceSessionId: candidate.deviceSessionId,
      gatewaySessionId: candidate.gatewaySessionId,
      connectionId: candidate.connectionId,
      gatewayGeneration: candidate.gatewayGeneration,
      receiptId: candidate.receiptId,
      commandId: candidate.commandId,
      executionId: candidate.executionId,
      sourceReference: candidate.sourceReference,
      proofReference: candidate.proofReference,
      integrityDigest: candidate.integrityDigest,
      capturedAtMs: candidate.capturedAtMs,
      receivedAtMs: candidate.receivedAtMs,
    });
    if (!authentication.ok) {
      return failure(
        'SESSION_PROOF_REJECTED',
        'Authenticated device receipt proof was rejected.',
        authentication.retryable,
        authentication.code,
      );
    }
    if (
      authentication.authorizesExecution !== false ||
      authentication.canGrantPermission !== false ||
      authentication.authenticatedAtMs > candidate.receivedAtMs ||
      !isSafeToken(authentication.authenticationReference, this.#config.maxReferenceLength)
    ) {
      return failure(
        'SESSION_PROOF_REJECTED',
        'Authentication port returned an invalid proof result.',
      );
    }

    const reservation = this.#dependencies.durableIngress.reserve({
      tenantId: candidate.tenantId,
      receiptId: candidate.receiptId,
      commandId: candidate.commandId,
      executionId: candidate.executionId,
      fingerprint: fingerprint(candidate),
      nowMs: candidate.receivedAtMs,
    });
    if (!reservation.ok) {
      return failure(
        reservation.code === 'CONFLICT'
          ? 'DURABLE_IDEMPOTENCY_CONFLICT'
          : 'DURABLE_IDEMPOTENCY_UNAVAILABLE',
        'W03 durable ingress reservation did not succeed.',
        reservation.retryable,
        reservation.code,
      );
    }
    if (
      reservation.authorizesExecution !== false ||
      !isSafeToken(reservation.durableReference, this.#config.maxReferenceLength)
    ) {
      return failure(
        'DURABLE_IDEMPOTENCY_UNAVAILABLE',
        'W03 durable ingress reservation returned an invalid result.',
      );
    }
    if (reservation.disposition === 'ALREADY_RESERVED') {
      return success({
        classification: 'DUPLICATE',
        durableReference: reservation.durableReference,
        requiresW07Reconciliation: classification !== 'CURRENT_SESSION',
        authoritySemantics: 'EVIDENCE_INPUT_ONLY_W07_OWNS_OUTCOME_AND_RETRY',
        authorizesExecution: false,
        canGrantPermission: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      });
    }

    const observation: W07DeviceReceiptEvidenceObservation = {
      kind: 'DEVICE_RECEIPT_EVIDENCE_OBSERVATION',
      schemaVersion: '1.0.0',
      receiptId: candidate.receiptId,
      ...(candidate.evidenceId === undefined ? {} : { evidenceId: candidate.evidenceId }),
      tenantId: candidate.tenantId,
      correlationId: candidate.correlationId,
      commandId: candidate.commandId,
      executionId: candidate.executionId,
      deviceRef: candidate.deviceRef,
      deviceSessionId: candidate.deviceSessionId,
      gatewaySessionId: candidate.gatewaySessionId,
      connectionId: candidate.connectionId,
      gatewayGeneration: candidate.gatewayGeneration,
      deliveryReference: candidate.deliveryReference,
      reportedState: candidate.reportedState,
      sourceReference: candidate.sourceReference,
      integrityDigest: candidate.integrityDigest,
      authenticationReference: authentication.authenticationReference,
      capturedAtMs: candidate.capturedAtMs,
      receivedAtMs: candidate.receivedAtMs,
      ingressClassification: classification,
      requiresW07Reconciliation: classification !== 'CURRENT_SESSION',
      authoritySemantics: 'EVIDENCE_INPUT_ONLY_W07_OWNS_OUTCOME_AND_RETRY',
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    };
    const observed = this.#dependencies.w07Ingress.observe(observation);
    if (!observed.ok) {
      return failure(
        'W07_INGRESS_REJECTED',
        'W07 receipt/evidence observation boundary rejected the ingress.',
        observed.retryable,
        observed.code,
      );
    }
    if (
      observed.authorizesExecution !== false ||
      observed.provesExecutionSuccess !== false ||
      observed.retryAuthorized !== false ||
      !isSafeToken(observed.receiptReference, this.#config.maxReferenceLength) ||
      (observed.evidenceReference !== undefined &&
        !isSafeToken(observed.evidenceReference, this.#config.maxReferenceLength))
    ) {
      return failure(
        'W07_INGRESS_PROTOCOL_VIOLATION',
        'W07 ingress response violated authority or reference constraints.',
      );
    }

    return success({
      classification,
      durableReference: reservation.durableReference,
      receiptReference: observed.receiptReference,
      ...(observed.evidenceReference === undefined
        ? {}
        : { evidenceReference: observed.evidenceReference }),
      requiresW07Reconciliation: classification !== 'CURRENT_SESSION',
      authoritySemantics: 'EVIDENCE_INPUT_ONLY_W07_OWNS_OUTCOME_AND_RETRY',
      authorizesExecution: false,
      canGrantPermission: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    });
  }

  #parseRevokeAndKillInput(
    input: unknown,
  ):
    | { ok: true; value: RevokeAndKillDeviceSessionInput }
    | { ok: false; result: DeviceReceiptIngressResult<RevokeAndKillDeviceSessionSuccess> } {
    if (
      !isPlainRecord(input) ||
      !hasOnlyKeys(input, [
        'deviceSession',
        'tenantId',
        'correlationId',
        'commandId',
        'revokedAtMs',
        'reasonReference',
      ]) ||
      !isTrustSnapshotShape(input.deviceSession) ||
      !isSafeToken(input.tenantId, 64) ||
      !isSafeToken(input.correlationId, 64) ||
      !isSafeToken(input.commandId, 64) ||
      !isNonNegativeInteger(input.revokedAtMs) ||
      !isSafeToken(input.reasonReference, this.#config.maxReferenceLength)
    ) {
      return {
        ok: false,
        result: failure('MALFORMED_REQUEST', 'Revoke/kill request is malformed.'),
      };
    }
    return { ok: true, value: input as unknown as RevokeAndKillDeviceSessionInput };
  }

  #parseIngressInput(
    input: unknown,
  ):
    | { ok: true; value: DeviceReceiptIngressInput }
    | { ok: false; result: DeviceReceiptIngressResult<DeviceReceiptIngressSuccess> } {
    if (
      !isPlainRecord(input) ||
      !hasOnlyKeys(input, [
        'receiptId',
        'evidenceId',
        'tenantId',
        'correlationId',
        'commandId',
        'executionId',
        'deviceRef',
        'deviceSessionId',
        'gatewaySessionId',
        'connectionId',
        'gatewayGeneration',
        'deliveryReference',
        'reportedState',
        'sourceReference',
        'proofReference',
        'integrityDigest',
        'capturedAtMs',
        'receivedAtMs',
        'deviceSession',
      ]) ||
      !isSafeToken(input.receiptId, 64) ||
      (input.evidenceId !== undefined && !isSafeToken(input.evidenceId, 64)) ||
      !isSafeToken(input.tenantId, 64) ||
      !isSafeToken(input.correlationId, 64) ||
      !isSafeToken(input.commandId, 64) ||
      !isSafeToken(input.executionId, 64) ||
      !isDeviceRefShape(input.deviceRef) ||
      !isSafeToken(input.deviceSessionId, this.#config.maxReferenceLength) ||
      !isSafeToken(input.gatewaySessionId, this.#config.maxReferenceLength) ||
      !isSafeToken(input.connectionId, this.#config.maxReferenceLength) ||
      !Number.isSafeInteger(input.gatewayGeneration) ||
      (input.gatewayGeneration as number) <= 0 ||
      !isSafeToken(input.deliveryReference, this.#config.maxReferenceLength) ||
      !REPORTED_STATES.has(String(input.reportedState)) ||
      !isSafeToken(input.sourceReference, this.#config.maxReferenceLength) ||
      !isSafeToken(input.proofReference, this.#config.maxReferenceLength) ||
      !isSafeToken(input.integrityDigest, this.#config.maxIntegrityDigestLength) ||
      !isNonNegativeInteger(input.capturedAtMs) ||
      !isNonNegativeInteger(input.receivedAtMs) ||
      !isTrustSnapshotShape(input.deviceSession)
    ) {
      return {
        ok: false,
        result: failure('MALFORMED_REQUEST', 'Receipt/evidence ingress request is malformed.'),
      };
    }
    return { ok: true, value: input as unknown as DeviceReceiptIngressInput };
  }
}
