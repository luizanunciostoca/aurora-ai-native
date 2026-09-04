import type { EvidenceId, ReceiptId } from '@aurora/contracts/ids';

import type { DeviceSessionTrustSnapshot } from '../device-session/types.js';
import type { RealtimeCommandSnapshot } from '../realtime-session/types.js';
import type {
  DeviceEvidenceIngressFrame,
  DeviceIngressClassification,
  DeviceIngressProjection,
  DeviceReceiptIngressFrame,
  DeviceRevokeIngressErrorCode,
  DeviceRevokeIngressResult,
  DeviceSessionControlProjection,
  DeviceSessionRevocationPort,
  DeviceSessionRevokeIngressConfig,
  IngestDeviceEvidenceInput,
  IngestDeviceEvidenceSuccess,
  IngestDeviceReceiptInput,
  IngestDeviceReceiptSuccess,
  RevokeOrKillDeviceSessionInput,
  W03DurableIngressReservationPort,
  W07DeviceIngressVerificationResult,
  W07DeviceIngressVerifier,
} from './types.js';

const DEFAULT_CONFIG: DeviceSessionRevokeIngressConfig = {
  maxSeenIngress: 2048,
  maxControlledSessions: 1024,
  maxIngressAgeMs: 24 * 60 * 60 * 1000,
  maxReferenceLength: 512,
};

const SAFE_REFERENCE = /^[A-Za-z0-9._:/-]+$/;
const RECEIPT_STATES = new Set([
  'ACCEPTED',
  'RUNNING',
  'WAITING',
  'CANCELLED',
  'COMPLETED',
  'FAILED',
  'UNCERTAIN',
]);
const EVIDENCE_TYPES = new Set([
  'EXECUTION_RECEIPT',
  'STATE_SNAPSHOT',
  'SIGNED_ATTESTATION',
  'REFERENCE',
]);

interface SeenIngress {
  readonly fingerprint: string;
  readonly projection: DeviceIngressProjection;
}

interface BindingValidation {
  readonly classification: DeviceIngressClassification;
}

function success<T>(value: T): DeviceRevokeIngressResult<T> {
  return {
    ok: true,
    value,
    authorizesExecution: false,
    canGrantPermission: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

function failure<T>(
  code: DeviceRevokeIngressErrorCode,
  message: string,
  retryable = false,
  upstreamCode?: string,
): DeviceRevokeIngressResult<T> {
  return {
    ok: false,
    error: {
      code,
      message,
      retryable,
      ...(upstreamCode === undefined ? {} : { upstreamCode }),
    },
    authorizesExecution: false,
    canGrantPermission: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Object.values(Object.getOwnPropertyDescriptors(value)).every(
      (descriptor) => descriptor.get === undefined && descriptor.set === undefined,
    );
  } catch {
    return false;
  }
}

function isFiniteNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isReference(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    SAFE_REFERENCE.test(value)
  );
}

function sameSessionBinding(
  left: DeviceSessionTrustSnapshot,
  right: DeviceSessionControlProjection,
): boolean {
  return (
    left.deviceSessionId === right.deviceSessionId &&
    left.tenantId === right.tenantId &&
    left.correlationId === right.correlationId &&
    left.deviceRef.deviceId === right.deviceId
  );
}

function fingerprintReceipt(frame: DeviceReceiptIngressFrame): string {
  return JSON.stringify([
    'RECEIPT',
    frame.receiptId,
    frame.actionIntentId,
    frame.commandId,
    frame.executionId,
    frame.tenantId,
    frame.correlationId,
    frame.deviceId,
    frame.deviceReportedState,
    frame.provenance.sourceConnectionId,
    frame.provenance.sourceGatewayGeneration,
    frame.provenance.sourceReference,
    frame.provenance.integrityReference,
    frame.provenance.capturedAtMs,
    frame.provenance.receivedAtMs,
  ]);
}

function fingerprintEvidence(frame: DeviceEvidenceIngressFrame): string {
  return JSON.stringify([
    'EVIDENCE',
    frame.evidenceId,
    frame.actionIntentId,
    frame.commandId,
    frame.executionId,
    frame.tenantId,
    frame.correlationId,
    frame.deviceId,
    frame.evidenceType,
    frame.subjectReference,
    frame.provenance.sourceConnectionId,
    frame.provenance.sourceGatewayGeneration,
    frame.provenance.sourceReference,
    frame.provenance.integrityReference,
    frame.provenance.capturedAtMs,
    frame.provenance.receivedAtMs,
  ]);
}

export class DeviceSessionRevokeEvidenceIngressManager {
  readonly #revocations: DeviceSessionRevocationPort;
  readonly #durableIngress: W03DurableIngressReservationPort;
  readonly #w07: W07DeviceIngressVerifier;
  readonly #config: DeviceSessionRevokeIngressConfig;
  readonly #controls = new Map<string, DeviceSessionControlProjection>();
  readonly #seenIngress = new Map<string, SeenIngress>();

  constructor(
    revocations: DeviceSessionRevocationPort,
    durableIngress: W03DurableIngressReservationPort,
    w07: W07DeviceIngressVerifier,
    config: Partial<DeviceSessionRevokeIngressConfig> = {},
  ) {
    this.#revocations = revocations;
    this.#durableIngress = durableIngress;
    this.#w07 = w07;
    this.#config = { ...DEFAULT_CONFIG, ...config };
    if (
      !isPositiveInteger(this.#config.maxSeenIngress) ||
      !isPositiveInteger(this.#config.maxControlledSessions) ||
      !isPositiveInteger(this.#config.maxIngressAgeMs) ||
      !isPositiveInteger(this.#config.maxReferenceLength)
    ) {
      throw new Error('W14-G revoke/ingress limits must be positive safe integers.');
    }
  }

  revokeOrKillSession(input: unknown): DeviceRevokeIngressResult<DeviceSessionControlProjection> {
    const parsed = this.#parseControlInput(input);
    if (!parsed.ok) return parsed;
    const existing = this.#controls.get(parsed.value.deviceSession.deviceSessionId);
    if (existing !== undefined) {
      if (!sameSessionBinding(parsed.value.deviceSession, existing)) {
        return failure(
          'SESSION_BINDING_MISMATCH',
          'Controlled session identifier is bound to a different tenant, correlation or device.',
        );
      }
      if (existing.mode === 'KILL') {
        return success({ ...existing, disposition: 'ALREADY_KILLED' });
      }
      if (parsed.value.mode === 'REVOKE') {
        return success({ ...existing, disposition: 'ALREADY_REVOKED' });
      }
    }

    let result;
    try {
      result = this.#revocations.revokeSession({
        deviceSessionId: parsed.value.deviceSession.deviceSessionId,
        connectionId: parsed.value.deviceSession.connectionId,
        revokedAtMs: parsed.value.nowMs,
        reasonReference: parsed.value.reasonReference,
      });
    } catch {
      return failure('SESSION_REVOKE_FAILED', 'W14-E revocation port threw unexpectedly.');
    }
    if (!result.ok) {
      return failure(
        'SESSION_REVOKE_FAILED',
        'W14-E rejected the session revocation request.',
        result.error.retryable,
        result.error.code,
      );
    }
    const revoked = result.snapshot;
    if (
      revoked.state !== 'REVOKED' ||
      revoked.authorizesExecution !== false ||
      revoked.canGrantPermission !== false ||
      revoked.deviceSessionId !== parsed.value.deviceSession.deviceSessionId ||
      revoked.tenantId !== parsed.value.deviceSession.tenantId ||
      revoked.correlationId !== parsed.value.deviceSession.correlationId ||
      revoked.deviceRef.deviceId !== parsed.value.deviceSession.deviceRef.deviceId ||
      revoked.gatewayGeneration !== parsed.value.deviceSession.gatewayGeneration ||
      revoked.revokedAtMs === undefined ||
      revoked.revokedAtMs > parsed.value.nowMs
    ) {
      return failure(
        'SESSION_REVOKE_PROTOCOL_VIOLATION',
        'W14-E revocation response violated the accepted session binding contract.',
      );
    }

    const wasAlreadyRevoked = parsed.value.deviceSession.state === 'REVOKED';
    const projection: DeviceSessionControlProjection = Object.freeze({
      mode: parsed.value.mode,
      disposition:
        parsed.value.mode === 'KILL' ? 'KILLED' : wasAlreadyRevoked ? 'ALREADY_REVOKED' : 'REVOKED',
      deviceSessionId: revoked.deviceSessionId,
      tenantId: revoked.tenantId,
      correlationId: revoked.correlationId,
      deviceId: revoked.deviceRef.deviceId,
      gatewayGeneration: revoked.gatewayGeneration,
      revokedAtMs: revoked.revokedAtMs,
      reasonReference: parsed.value.reasonReference,
      trustState: 'REVOKED',
      effect: 'W14_E_TRUST_REVOKED_AND_W14_G_INGRESS_FENCED',
      requiresCurrentAuthorityValidation: true,
      authorizesExecution: false,
      canGrantPermission: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    });
    this.#controls.set(projection.deviceSessionId, projection);
    this.#trimControls();
    return success(projection);
  }

  ingestReceipt(input: unknown): DeviceRevokeIngressResult<IngestDeviceReceiptSuccess> {
    const parsed = this.#parseReceiptInput(input);
    if (!parsed.ok) return parsed;
    const binding = this.#validateBinding(
      parsed.value.command,
      parsed.value.deviceSession,
      parsed.value.frame,
    );
    if (!binding.ok) return binding;

    const ingressKey = `receipt:${parsed.value.frame.receiptId}`;
    const fingerprint = fingerprintReceipt(parsed.value.frame);
    const duplicate = this.#seenIngress.get(ingressKey);
    if (duplicate !== undefined) {
      if (duplicate.fingerprint !== fingerprint) {
        return failure(
          'INGRESS_CONFLICT',
          'Receipt identifier was reused with conflicting contents.',
        );
      }
      return success({
        disposition: 'DUPLICATE',
        projection: duplicate.projection,
        deviceReportedState: parsed.value.frame.deviceReportedState,
      });
    }

    const durable = this.#reserveIngress(
      'receipt',
      parsed.value.frame.receiptId,
      parsed.value.command,
      parsed.value.frame,
      fingerprint,
    );
    if (!durable.ok) return durable;
    const verified = this.#verifyReceipt(parsed.value.frame, binding.value.classification);
    if (!verified.ok) return verified;
    const projection = this.#projection(
      'DEVICE_RECEIPT_INGRESS',
      parsed.value.frame.receiptId,
      parsed.value.frame,
      parsed.value.deviceSession,
      binding.value.classification,
      durable.value.reference,
      verified.value,
    );
    this.#rememberIngress(ingressKey, fingerprint, projection);
    return success({
      disposition: durable.value.duplicate ? 'DUPLICATE' : 'ACCEPTED',
      projection,
      deviceReportedState: parsed.value.frame.deviceReportedState,
    });
  }

  ingestEvidence(input: unknown): DeviceRevokeIngressResult<IngestDeviceEvidenceSuccess> {
    const parsed = this.#parseEvidenceInput(input);
    if (!parsed.ok) return parsed;
    const binding = this.#validateBinding(
      parsed.value.command,
      parsed.value.deviceSession,
      parsed.value.frame,
    );
    if (!binding.ok) return binding;

    const ingressKey = `evidence:${parsed.value.frame.evidenceId}`;
    const fingerprint = fingerprintEvidence(parsed.value.frame);
    const duplicate = this.#seenIngress.get(ingressKey);
    if (duplicate !== undefined) {
      if (duplicate.fingerprint !== fingerprint) {
        return failure(
          'INGRESS_CONFLICT',
          'Evidence identifier was reused with conflicting contents.',
        );
      }
      return success({
        disposition: 'DUPLICATE',
        projection: duplicate.projection,
        evidenceType: parsed.value.frame.evidenceType,
        subjectReference: parsed.value.frame.subjectReference,
      });
    }

    const durable = this.#reserveIngress(
      'evidence',
      parsed.value.frame.evidenceId,
      parsed.value.command,
      parsed.value.frame,
      fingerprint,
    );
    if (!durable.ok) return durable;
    const verified = this.#verifyEvidence(parsed.value.frame, binding.value.classification);
    if (!verified.ok) return verified;
    const projection = this.#projection(
      'DEVICE_EVIDENCE_INGRESS',
      parsed.value.frame.evidenceId,
      parsed.value.frame,
      parsed.value.deviceSession,
      binding.value.classification,
      durable.value.reference,
      verified.value,
    );
    this.#rememberIngress(ingressKey, fingerprint, projection);
    return success({
      disposition: durable.value.duplicate ? 'DUPLICATE' : 'ACCEPTED',
      projection,
      evidenceType: parsed.value.frame.evidenceType,
      subjectReference: parsed.value.frame.subjectReference,
    });
  }

  #validateBinding(
    command: RealtimeCommandSnapshot,
    session: DeviceSessionTrustSnapshot,
    frame: DeviceReceiptIngressFrame | DeviceEvidenceIngressFrame,
  ): DeviceRevokeIngressResult<BindingValidation> {
    if (frame.commandId !== command.commandId || frame.executionId !== command.executionId) {
      return failure('COMMAND_MISMATCH', 'Ingress does not match the supplied command/execution.');
    }
    if (frame.tenantId !== session.tenantId) {
      return failure('TENANT_MISMATCH', 'Ingress tenant does not match the device session.');
    }
    if (
      frame.correlationId !== session.correlationId ||
      frame.correlationId !== command.correlationId
    ) {
      return failure(
        'CORRELATION_MISMATCH',
        'Ingress correlation does not match the command/session.',
      );
    }
    if (
      command.executionTarget.kind !== 'DEVICE' ||
      command.executionTarget.bindingReference !== session.deviceRef.deviceId ||
      frame.deviceId !== session.deviceRef.deviceId
    ) {
      return failure('DEVICE_MISMATCH', 'Ingress is not bound to the command device target.');
    }

    const provenance = frame.provenance;
    if (provenance.receivedAtMs < provenance.capturedAtMs) {
      return failure('PROVENANCE_FUTURE', 'Ingress capture time is after receive time.');
    }
    if (provenance.capturedAtMs < command.submittedAtMs) {
      return failure('PROVENANCE_STALE', 'Ingress predates command submission.');
    }
    if (provenance.receivedAtMs - provenance.capturedAtMs > this.#config.maxIngressAgeMs) {
      return failure('PROVENANCE_STALE', 'Ingress exceeded the bounded provenance age.');
    }
    if (
      provenance.sourceGatewayGeneration < command.submittedGatewayGeneration ||
      provenance.sourceGatewayGeneration > session.gatewayGeneration
    ) {
      return failure(
        'PROVENANCE_STALE',
        'Ingress gateway generation is outside the command/session chain.',
      );
    }

    const control = this.#controls.get(session.deviceSessionId);
    if (control !== undefined) {
      if (!sameSessionBinding(session, control)) {
        return failure(
          'SESSION_BINDING_MISMATCH',
          'Controlled session identifier no longer matches the tenant/correlation/device binding.',
        );
      }
      if (
        provenance.capturedAtMs > control.revokedAtMs ||
        provenance.receivedAtMs < control.revokedAtMs
      ) {
        return failure(
          'SESSION_REVOKED',
          'Post-revocation device output is not admissible as late evidence.',
        );
      }
      if (
        provenance.sourceGatewayGeneration === control.gatewayGeneration &&
        provenance.sourceConnectionId !== session.connectionId
      ) {
        return failure(
          'PROVENANCE_MISMATCH',
          'Late ingress for the revoked generation came from another connection.',
        );
      }
      return success({ classification: 'LATE_AFTER_REVOKE' });
    }
    if (session.state === 'REVOKED') {
      return failure(
        'SESSION_REVOKED',
        'Revoked session lacks a W14-G control fence for late ingress classification.',
      );
    }

    if (
      session.state !== 'ACTIVE' ||
      session.executionPreconditionSatisfied !== true ||
      session.authorizesExecution !== false ||
      session.canGrantPermission !== false
    ) {
      return failure(
        'SESSION_NOT_TRUSTED',
        'Device session is not an active accepted trust snapshot.',
      );
    }
    if (provenance.receivedAtMs >= session.gatewayAuthExpiresAtMs) {
      return failure(
        'SESSION_EXPIRED',
        'Device ingress arrived after gateway authentication expiry.',
      );
    }
    if (provenance.sourceGatewayGeneration === session.gatewayGeneration) {
      if (provenance.sourceConnectionId !== session.connectionId) {
        return failure(
          'PROVENANCE_MISMATCH',
          'Current-generation ingress came from another connection.',
        );
      }
      return success({ classification: 'CURRENT_SESSION' });
    }
    if (provenance.sourceGatewayGeneration < session.gatewayGeneration) {
      return success({ classification: 'LATE_AFTER_RECONNECT' });
    }
    return failure('PROVENANCE_MISMATCH', 'Ingress provenance could not be classified.');
  }

  #reserveIngress(
    kind: 'receipt' | 'evidence',
    ingressId: ReceiptId | EvidenceId,
    command: RealtimeCommandSnapshot,
    frame: DeviceReceiptIngressFrame | DeviceEvidenceIngressFrame,
    contentFingerprint: string,
  ): DeviceRevokeIngressResult<{ readonly reference: string; readonly duplicate: boolean }> {
    const idempotencyKey = `w14g:${kind}:${frame.tenantId}:${command.commandId}:${ingressId}`;
    if (idempotencyKey.length > this.#config.maxReferenceLength * 2) {
      return failure('MALFORMED_REQUEST', 'Derived ingress idempotency key is too long.');
    }
    let result;
    try {
      result = this.#durableIngress.reserve({
        tenantId: frame.tenantId,
        correlationId: frame.correlationId,
        commandId: command.commandId,
        executionId: command.executionId,
        ingressId,
        idempotencyKey,
        contentFingerprint,
        receivedAtMs: frame.provenance.receivedAtMs,
      });
    } catch {
      return failure(
        'DURABLE_IDEMPOTENCY_UNAVAILABLE',
        'W03 durable ingress reservation threw unexpectedly.',
        true,
      );
    }
    if (!result.ok) {
      if (result.code === 'CONFLICT') {
        return failure(
          'DURABLE_IDEMPOTENCY_CONFLICT',
          'W03 reported a conflicting ingress idempotency reservation.',
          false,
          result.code,
        );
      }
      if (result.code === 'UNAVAILABLE') {
        return failure(
          'DURABLE_IDEMPOTENCY_UNAVAILABLE',
          'W03 durable ingress reservation is unavailable.',
          result.retryable,
          result.code,
        );
      }
      return failure(
        'MALFORMED_REQUEST',
        'W03 rejected the ingress reservation as malformed.',
        false,
        result.code,
      );
    }
    if (
      result.authorizesExecution !== false ||
      !isReference(result.durableReference, this.#config.maxReferenceLength)
    ) {
      return failure(
        'DURABLE_IDEMPOTENCY_PROTOCOL_VIOLATION',
        'W03 reservation response violated the bounded compatibility contract.',
      );
    }
    return success({
      reference: result.durableReference,
      duplicate: result.disposition === 'ALREADY_RESERVED',
    });
  }

  #verifyReceipt(
    frame: DeviceReceiptIngressFrame,
    classification: DeviceIngressClassification,
  ): DeviceRevokeIngressResult<string> {
    let result: W07DeviceIngressVerificationResult;
    try {
      result = this.#w07.verifyReceipt({
        receiptId: frame.receiptId,
        actionIntentId: frame.actionIntentId,
        commandId: frame.commandId,
        executionId: frame.executionId,
        tenantId: frame.tenantId,
        correlationId: frame.correlationId,
        deviceId: frame.deviceId,
        deviceReportedState: frame.deviceReportedState,
        sourceReference: frame.provenance.sourceReference,
        integrityReference: frame.provenance.integrityReference,
        capturedAtMs: frame.provenance.capturedAtMs,
        receivedAtMs: frame.provenance.receivedAtMs,
        ingressClassification: classification,
      });
    } catch {
      return failure('W07_REJECTED', 'W07 receipt verifier threw unexpectedly.', true);
    }
    return this.#validateW07Result(result);
  }

  #verifyEvidence(
    frame: DeviceEvidenceIngressFrame,
    classification: DeviceIngressClassification,
  ): DeviceRevokeIngressResult<string> {
    let result: W07DeviceIngressVerificationResult;
    try {
      result = this.#w07.verifyEvidence({
        evidenceId: frame.evidenceId,
        actionIntentId: frame.actionIntentId,
        commandId: frame.commandId,
        executionId: frame.executionId,
        tenantId: frame.tenantId,
        correlationId: frame.correlationId,
        deviceId: frame.deviceId,
        evidenceType: frame.evidenceType,
        subjectReference: frame.subjectReference,
        sourceReference: frame.provenance.sourceReference,
        integrityReference: frame.provenance.integrityReference,
        capturedAtMs: frame.provenance.capturedAtMs,
        receivedAtMs: frame.provenance.receivedAtMs,
        ingressClassification: classification,
      });
    } catch {
      return failure('W07_REJECTED', 'W07 evidence verifier threw unexpectedly.', true);
    }
    return this.#validateW07Result(result);
  }

  #validateW07Result(
    result: W07DeviceIngressVerificationResult,
  ): DeviceRevokeIngressResult<string> {
    if (
      result.authorizesExecution !== false ||
      result.provesExecutionSuccess !== false ||
      result.retryAuthorized !== false
    ) {
      return failure(
        'W07_PROTOCOL_VIOLATION',
        'W07 verifier attempted to widen execution/outcome/retry semantics.',
      );
    }
    if (!result.ok) {
      return failure(
        'W07_REJECTED',
        'W07 rejected device-originated ingress correlation/provenance.',
        result.retryable,
        result.code,
      );
    }
    if (!isReference(result.verificationReference, this.#config.maxReferenceLength)) {
      return failure('W07_PROTOCOL_VIOLATION', 'W07 verification reference is malformed.');
    }
    return success(result.verificationReference);
  }

  #projection(
    kind: DeviceIngressProjection['kind'],
    ingressId: ReceiptId | EvidenceId,
    frame: DeviceReceiptIngressFrame | DeviceEvidenceIngressFrame,
    session: DeviceSessionTrustSnapshot,
    classification: DeviceIngressClassification,
    durableReference: string,
    verificationReference: string,
  ): DeviceIngressProjection {
    return Object.freeze({
      kind,
      ingressId,
      actionIntentId: frame.actionIntentId,
      commandId: frame.commandId,
      executionId: frame.executionId,
      tenantId: frame.tenantId,
      correlationId: frame.correlationId,
      deviceId: frame.deviceId,
      deviceSessionId: session.deviceSessionId,
      ingressClassification: classification,
      capturedAtMs: frame.provenance.capturedAtMs,
      receivedAtMs: frame.provenance.receivedAtMs,
      sourceReference: frame.provenance.sourceReference,
      integrityReference: frame.provenance.integrityReference,
      durableIngressReference: durableReference,
      w07VerificationReference: verificationReference,
      requiresW07Reconciliation: true,
      outcomeAuthority: 'W07_ONLY',
      ingressAuthoritySemantics: 'PROVENANCE_VERIFIED_INPUT_ONLY_NOT_EXECUTION_OUTCOME',
      receiptPresenceProvesBusinessOutcome: false,
      authorizesExecution: false,
      canGrantPermission: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    });
  }

  #rememberIngress(key: string, fingerprint: string, projection: DeviceIngressProjection): void {
    this.#seenIngress.set(key, { fingerprint, projection });
    while (this.#seenIngress.size > this.#config.maxSeenIngress) {
      const oldest = this.#seenIngress.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.#seenIngress.delete(oldest);
    }
  }

  #trimControls(): void {
    while (this.#controls.size > this.#config.maxControlledSessions) {
      const oldest = this.#controls.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.#controls.delete(oldest);
    }
  }

  #parseControlInput(input: unknown): DeviceRevokeIngressResult<RevokeOrKillDeviceSessionInput> {
    if (!isPlainRecord(input))
      return failure('MALFORMED_REQUEST', 'Session control input is malformed.');
    if (input.mode !== 'REVOKE' && input.mode !== 'KILL') {
      return failure('MALFORMED_REQUEST', 'Session control mode is invalid.');
    }
    const session = this.#parseSession(input.deviceSession);
    if (session === null)
      return failure('MALFORMED_REQUEST', 'Device session snapshot is malformed.');
    if (!isReference(input.reasonReference, this.#config.maxReferenceLength)) {
      return failure('MALFORMED_REQUEST', 'Session control reason reference is malformed.');
    }
    if (!isFiniteNonNegativeInteger(input.nowMs) || input.nowMs < session.lastEvaluatedAtMs) {
      return failure('MALFORMED_REQUEST', 'Session control time is invalid or moves backwards.');
    }
    return success({
      mode: input.mode,
      deviceSession: session,
      reasonReference: input.reasonReference,
      nowMs: input.nowMs,
    });
  }

  #parseReceiptInput(input: unknown): DeviceRevokeIngressResult<IngestDeviceReceiptInput> {
    if (!isPlainRecord(input))
      return failure('MALFORMED_REQUEST', 'Receipt ingress input is malformed.');
    const command = this.#parseCommand(input.command);
    const session = this.#parseSession(input.deviceSession);
    const frame = this.#parseReceiptFrame(input.frame);
    if (command === null || session === null || frame === null) {
      return failure(
        'MALFORMED_REQUEST',
        'Receipt ingress contains malformed command/session/frame data.',
      );
    }
    return success({ command, deviceSession: session, frame });
  }

  #parseEvidenceInput(input: unknown): DeviceRevokeIngressResult<IngestDeviceEvidenceInput> {
    if (!isPlainRecord(input))
      return failure('MALFORMED_REQUEST', 'Evidence ingress input is malformed.');
    const command = this.#parseCommand(input.command);
    const session = this.#parseSession(input.deviceSession);
    const frame = this.#parseEvidenceFrame(input.frame);
    if (command === null || session === null || frame === null) {
      return failure(
        'MALFORMED_REQUEST',
        'Evidence ingress contains malformed command/session/frame data.',
      );
    }
    return success({ command, deviceSession: session, frame });
  }

  #parseCommand(value: unknown): RealtimeCommandSnapshot | null {
    if (!isPlainRecord(value)) return null;
    if (
      !isReference(value.commandId, this.#config.maxReferenceLength) ||
      !isReference(value.executionId, this.#config.maxReferenceLength) ||
      !isReference(value.correlationId, this.#config.maxReferenceLength) ||
      !isFiniteNonNegativeInteger(value.submittedAtMs) ||
      !isPositiveInteger(value.submittedGatewayGeneration) ||
      value.authorizesExecution !== false ||
      value.provesExecutionSuccess !== false ||
      value.externalStateVerified !== false ||
      !isPlainRecord(value.executionTarget) ||
      value.executionTarget.kind !== 'DEVICE' ||
      !isReference(value.executionTarget.bindingReference, this.#config.maxReferenceLength)
    ) {
      return null;
    }
    return value as unknown as RealtimeCommandSnapshot;
  }

  #parseSession(value: unknown): DeviceSessionTrustSnapshot | null {
    if (!isPlainRecord(value) || !isPlainRecord(value.deviceRef)) return null;
    if (
      value.kind !== 'DeviceSessionTrustSnapshot' ||
      value.schemaVersion !== '1.0.0' ||
      !isReference(value.deviceSessionId, this.#config.maxReferenceLength) ||
      !isReference(value.connectionId, this.#config.maxReferenceLength) ||
      !isReference(value.tenantId, this.#config.maxReferenceLength) ||
      !isReference(value.correlationId, this.#config.maxReferenceLength) ||
      !isReference(value.deviceRef.deviceId, this.#config.maxReferenceLength) ||
      !isPositiveInteger(value.gatewayGeneration) ||
      !isFiniteNonNegativeInteger(value.lastEvaluatedAtMs) ||
      !isFiniteNonNegativeInteger(value.gatewayAuthExpiresAtMs) ||
      (value.state !== 'ACTIVE' && value.state !== 'REVOKED') ||
      value.authorizesExecution !== false ||
      value.canGrantPermission !== false
    ) {
      return null;
    }
    return value as unknown as DeviceSessionTrustSnapshot;
  }

  #parseProvenance(value: unknown): DeviceReceiptIngressFrame['provenance'] | null {
    if (!isPlainRecord(value)) return null;
    if (
      !isReference(value.sourceConnectionId, this.#config.maxReferenceLength) ||
      !isPositiveInteger(value.sourceGatewayGeneration) ||
      !isReference(value.sourceReference, this.#config.maxReferenceLength) ||
      !isReference(value.integrityReference, this.#config.maxReferenceLength) ||
      !isFiniteNonNegativeInteger(value.capturedAtMs) ||
      !isFiniteNonNegativeInteger(value.receivedAtMs)
    ) {
      return null;
    }
    return value as unknown as DeviceReceiptIngressFrame['provenance'];
  }

  #parseReceiptFrame(value: unknown): DeviceReceiptIngressFrame | null {
    if (!isPlainRecord(value)) return null;
    const provenance = this.#parseProvenance(value.provenance);
    if (
      provenance === null ||
      !isReference(value.receiptId, this.#config.maxReferenceLength) ||
      !isReference(value.actionIntentId, this.#config.maxReferenceLength) ||
      !isReference(value.commandId, this.#config.maxReferenceLength) ||
      !isReference(value.executionId, this.#config.maxReferenceLength) ||
      !isReference(value.tenantId, this.#config.maxReferenceLength) ||
      !isReference(value.correlationId, this.#config.maxReferenceLength) ||
      !isReference(value.deviceId, this.#config.maxReferenceLength) ||
      !RECEIPT_STATES.has(String(value.deviceReportedState))
    ) {
      return null;
    }
    return { ...(value as unknown as DeviceReceiptIngressFrame), provenance };
  }

  #parseEvidenceFrame(value: unknown): DeviceEvidenceIngressFrame | null {
    if (!isPlainRecord(value)) return null;
    const provenance = this.#parseProvenance(value.provenance);
    if (
      provenance === null ||
      !isReference(value.evidenceId, this.#config.maxReferenceLength) ||
      !isReference(value.actionIntentId, this.#config.maxReferenceLength) ||
      !isReference(value.commandId, this.#config.maxReferenceLength) ||
      !isReference(value.executionId, this.#config.maxReferenceLength) ||
      !isReference(value.tenantId, this.#config.maxReferenceLength) ||
      !isReference(value.correlationId, this.#config.maxReferenceLength) ||
      !isReference(value.deviceId, this.#config.maxReferenceLength) ||
      !EVIDENCE_TYPES.has(String(value.evidenceType)) ||
      !isReference(value.subjectReference, this.#config.maxReferenceLength)
    ) {
      return null;
    }
    return { ...(value as unknown as DeviceEvidenceIngressFrame), provenance };
  }
}
