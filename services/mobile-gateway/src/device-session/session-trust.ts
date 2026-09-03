import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';
import type { DeviceRegistrationRecord, DeviceRef } from '../device/types.js';
import type { GatewaySessionSnapshot } from '../gateway-auth/types.js';

import type {
  DeviceAttestationReference,
  DeviceSessionTrustConfig,
  DeviceSessionTrustErrorCode,
  DeviceSessionTrustResult,
  DeviceSessionTrustSnapshot,
  EvaluateDeviceSessionTrustInput,
  OpenDeviceSessionTrustInput,
  ResumeDeviceSessionTrustInput,
  RevokeDeviceSessionTrustInput,
} from './types.js';

interface SessionRecord {
  readonly deviceSessionId: string;
  readonly gatewaySessionId: string;
  connectionId: string;
  gatewayGeneration: number;
  readonly tenantId: TenantId;
  readonly actorIdentityId: IdentityId;
  readonly correlationId: CorrelationId;
  readonly deviceRef: DeviceRef;
  attestation: DeviceAttestationReference;
  state: 'ACTIVE' | 'REVOKED';
  readonly openedAtMs: number;
  lastEvaluatedAtMs: number;
  gatewayAuthExpiresAtMs: number;
  revokedAtMs?: number;
  revocationReasonReference?: string;
}

const DEFAULT_CONFIG: DeviceSessionTrustConfig = {
  maxActiveSessions: 256,
  maxRememberedSessions: 1024,
  maxAttestationAgeMs: 10 * 60 * 1000,
  maxSessionAgeMs: 24 * 60 * 60 * 1000,
};

const SAFE_TOKEN = /^[A-Za-z0-9._:/-]+$/;
const DEVICE_ID = /^dvc_[0-9A-HJKMNP-TV-Z]{26}$/;
const TENANT_ID = /^ten_[0-9A-HJKMNP-TV-Z]{26}$/;
const IDENTITY_ID = /^idn_[0-9A-HJKMNP-TV-Z]{26}$/;
const ACTOR_KINDS = new Set(['HUMAN', 'AGENT', 'SERVICE', 'SYSTEM']);
const DEVICE_STATES = new Set(['REGISTERED', 'ACTIVE', 'REVOKED', 'COMPROMISED', 'RETIRED']);
const ATTESTATION_STATES = new Set(['VERIFIED', 'REVOKED', 'AMBIGUOUS']);

function error(
  code: DeviceSessionTrustErrorCode,
  message: string,
  retryable = false,
): DeviceSessionTrustResult {
  return {
    ok: false,
    error: { code, message, retryable },
    authorizesExecution: false,
    canGrantPermission: false,
  };
}

function success(snapshot: DeviceSessionTrustSnapshot): DeviceSessionTrustResult {
  return { ok: true, snapshot, authorizesExecution: false, canGrantPermission: false };
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isPlainDataRecord(value: unknown): value is Record<string, unknown> {
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
  try {
    const allowed = new Set(keys);
    return Object.keys(record).every((key) => allowed.has(key));
  } catch {
    return false;
  }
}

function isBoundedToken(value: unknown, maxLength = 256): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    SAFE_TOKEN.test(value)
  );
}

function parseDeviceRef(value: unknown): DeviceRef | null {
  if (
    !isPlainDataRecord(value) ||
    !hasOnlyKeys(value, ['kind', 'deviceId', 'tenantId', 'registrationVersion']) ||
    value.kind !== 'AURORA_DEVICE' ||
    typeof value.deviceId !== 'string' ||
    !DEVICE_ID.test(value.deviceId) ||
    typeof value.tenantId !== 'string' ||
    !TENANT_ID.test(value.tenantId) ||
    !isFiniteInteger(value.registrationVersion) ||
    value.registrationVersion <= 0
  ) {
    return null;
  }
  return value as unknown as DeviceRef;
}

function parseDeviceRecord(value: unknown): DeviceRegistrationRecord | null {
  if (
    !isPlainDataRecord(value) ||
    !hasOnlyKeys(value, [
      'kind',
      'schemaVersion',
      'ref',
      'boundIdentityId',
      'state',
      'registeredAt',
      'updatedAt',
      'provenance',
      'authoritySemantics',
      'authorizesExecution',
      'canGrantPermission',
    ]) ||
    value.kind !== 'DeviceRegistrationRecord' ||
    value.schemaVersion !== '1.0.0' ||
    !DEVICE_STATES.has(String(value.state)) ||
    typeof value.registeredAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    value.authoritySemantics !== 'DEVICE_REGISTRATION_ONLY_NO_ACTION_AUTHORITY' ||
    value.authorizesExecution !== false ||
    value.canGrantPermission !== false
  ) {
    return null;
  }
  const ref = parseDeviceRef(value.ref);
  if (ref === null) return null;
  if (
    value.boundIdentityId !== undefined &&
    (typeof value.boundIdentityId !== 'string' || !IDENTITY_ID.test(value.boundIdentityId))
  ) {
    return null;
  }
  if (
    !isPlainDataRecord(value.provenance) ||
    !hasOnlyKeys(value.provenance, ['source', 'reference', 'observedAt']) ||
    value.provenance.source !== 'W14_DEVICE_REGISTRATION' ||
    !isBoundedToken(value.provenance.reference, 512) ||
    typeof value.provenance.observedAt !== 'string'
  ) {
    return null;
  }
  return value as unknown as DeviceRegistrationRecord;
}

function parseGatewaySession(value: unknown): GatewaySessionSnapshot | null {
  if (
    !isPlainDataRecord(value) ||
    !hasOnlyKeys(value, [
      'protocolVersion',
      'sessionId',
      'connectionId',
      'generation',
      'state',
      'tenantId',
      'actorKind',
      'actorIdentityId',
      'correlationId',
      'authIssuedAtMs',
      'authExpiresAtMs',
      'openedAtMs',
      'closedAtMs',
      'outstandingRequests',
      'authorizesExecution',
    ]) ||
    value.protocolVersion !== '1.0' ||
    !isBoundedToken(value.sessionId) ||
    !isBoundedToken(value.connectionId) ||
    !isFiniteInteger(value.generation) ||
    value.generation <= 0 ||
    (value.state !== 'OPEN' && value.state !== 'CLOSED') ||
    typeof value.tenantId !== 'string' ||
    !TENANT_ID.test(value.tenantId) ||
    !ACTOR_KINDS.has(String(value.actorKind)) ||
    typeof value.actorIdentityId !== 'string' ||
    !IDENTITY_ID.test(value.actorIdentityId) ||
    !isBoundedToken(value.correlationId) ||
    !isFiniteInteger(value.authIssuedAtMs) ||
    !isFiniteInteger(value.authExpiresAtMs) ||
    !isFiniteInteger(value.openedAtMs) ||
    !isFiniteInteger(value.outstandingRequests) ||
    value.outstandingRequests < 0 ||
    value.authorizesExecution !== false ||
    (value.closedAtMs !== undefined && !isFiniteInteger(value.closedAtMs))
  ) {
    return null;
  }
  return value as unknown as GatewaySessionSnapshot;
}

function parseAttestation(value: unknown): DeviceAttestationReference | null {
  if (
    !isPlainDataRecord(value) ||
    !hasOnlyKeys(value, [
      'kind',
      'reference',
      'provider',
      'version',
      'state',
      'observedAtMs',
      'expiresAtMs',
    ]) ||
    value.kind !== 'DEVICE_ATTESTATION_REFERENCE' ||
    !isBoundedToken(value.reference, 512) ||
    !isBoundedToken(value.provider, 128) ||
    !isBoundedToken(value.version, 64) ||
    !ATTESTATION_STATES.has(String(value.state)) ||
    !isFiniteInteger(value.observedAtMs) ||
    !isFiniteInteger(value.expiresAtMs)
  ) {
    return null;
  }
  return value as unknown as DeviceAttestationReference;
}

function cloneAttestation(value: DeviceAttestationReference): DeviceAttestationReference {
  return {
    kind: value.kind,
    reference: value.reference,
    provider: value.provider,
    version: value.version,
    state: value.state,
    observedAtMs: value.observedAtMs,
    expiresAtMs: value.expiresAtMs,
  };
}

function cloneDeviceRef(value: DeviceRef): DeviceRef {
  return {
    kind: value.kind,
    deviceId: value.deviceId,
    tenantId: value.tenantId,
    registrationVersion: value.registrationVersion,
  };
}

export class DeviceSessionTrustManager {
  readonly #sessions = new Map<string, SessionRecord>();
  readonly #config: DeviceSessionTrustConfig;

  constructor(config: Partial<DeviceSessionTrustConfig> = {}) {
    this.#config = { ...DEFAULT_CONFIG, ...config };
    if (
      !Number.isSafeInteger(this.#config.maxActiveSessions) ||
      !Number.isSafeInteger(this.#config.maxRememberedSessions) ||
      !Number.isSafeInteger(this.#config.maxAttestationAgeMs) ||
      !Number.isSafeInteger(this.#config.maxSessionAgeMs) ||
      this.#config.maxActiveSessions <= 0 ||
      this.#config.maxRememberedSessions < this.#config.maxActiveSessions ||
      this.#config.maxAttestationAgeMs <= 0 ||
      this.#config.maxSessionAgeMs <= 0
    ) {
      throw new Error('Device session trust limits must be positive and internally consistent.');
    }
  }

  openSession(input: unknown): DeviceSessionTrustResult {
    const parsed = this.#parseOpenInput(input);
    if (!parsed.ok) return parsed.result;
    if (this.#sessions.has(parsed.value.deviceSessionId)) {
      return error('SESSION_CONFLICT', 'Device session identifier already exists.');
    }
    const capacity = this.#prepareSessionSlot();
    if (capacity !== null) return capacity;
    const bindingError = this.#validateGatewayDeviceBinding(
      parsed.value.gatewaySession,
      parsed.value.deviceRecord,
      parsed.value.nowMs,
    );
    if (bindingError !== null) return bindingError;
    const attestationError = this.#validateAttestation(
      parsed.value.attestation,
      parsed.value.nowMs,
    );
    if (attestationError !== null) return attestationError;

    const record: SessionRecord = {
      deviceSessionId: parsed.value.deviceSessionId,
      gatewaySessionId: parsed.value.gatewaySession.sessionId,
      connectionId: parsed.value.gatewaySession.connectionId,
      gatewayGeneration: parsed.value.gatewaySession.generation,
      tenantId: parsed.value.gatewaySession.tenantId,
      actorIdentityId: parsed.value.gatewaySession.actorIdentityId,
      correlationId: parsed.value.gatewaySession.correlationId,
      deviceRef: cloneDeviceRef(parsed.value.deviceRecord.ref),
      attestation: cloneAttestation(parsed.value.attestation),
      state: 'ACTIVE',
      openedAtMs: parsed.value.nowMs,
      lastEvaluatedAtMs: parsed.value.nowMs,
      gatewayAuthExpiresAtMs: parsed.value.gatewaySession.authExpiresAtMs,
    };
    this.#sessions.set(record.deviceSessionId, record);
    return success(this.#snapshot(record));
  }

  evaluateSession(input: unknown): DeviceSessionTrustResult {
    const parsed = this.#parseEvaluateInput(input);
    if (!parsed.ok) return parsed.result;
    const record = this.#sessions.get(parsed.value.deviceSessionId);
    if (record === undefined) return error('SESSION_NOT_FOUND', 'Device session does not exist.');
    if (parsed.value.connectionId !== record.connectionId) {
      return error('CONNECTION_MISMATCH', 'Connection does not own the device session.');
    }
    if (record.state === 'REVOKED')
      return error('SESSION_REVOKED', 'Device session trust was revoked.');
    if (parsed.value.nowMs < record.lastEvaluatedAtMs) {
      return error('MALFORMED_REQUEST', 'Session evaluation time cannot move backwards.');
    }
    if (parsed.value.nowMs - record.openedAtMs > this.#config.maxSessionAgeMs) {
      return error('SESSION_EXPIRED', 'Device session exceeded its bounded lifetime.');
    }
    if (parsed.value.nowMs >= record.gatewayAuthExpiresAtMs) {
      return error('GATEWAY_AUTH_EXPIRED', 'Gateway authentication is no longer current.');
    }
    const deviceError = this.#validateCurrentDevice(record, parsed.value.currentDeviceRecord);
    if (deviceError !== null) return deviceError;
    if (
      parsed.value.currentAttestation.reference !== record.attestation.reference ||
      parsed.value.currentAttestation.provider !== record.attestation.provider ||
      parsed.value.currentAttestation.version !== record.attestation.version
    ) {
      return error(
        'ATTESTATION_MISMATCH',
        'Attestation identity changed without an explicit resume.',
      );
    }
    if (parsed.value.currentAttestation.observedAtMs < record.attestation.observedAtMs) {
      return error(
        'ATTESTATION_STALE',
        'Attestation observation is older than the session observation.',
      );
    }
    const attestationError = this.#validateAttestation(
      parsed.value.currentAttestation,
      parsed.value.nowMs,
    );
    if (attestationError !== null) return attestationError;

    record.attestation = cloneAttestation(parsed.value.currentAttestation);
    record.lastEvaluatedAtMs = parsed.value.nowMs;
    return success(this.#snapshot(record));
  }

  resumeSession(input: unknown): DeviceSessionTrustResult {
    const parsed = this.#parseResumeInput(input);
    if (!parsed.ok) return parsed.result;
    const record = this.#sessions.get(parsed.value.deviceSessionId);
    if (record === undefined) return error('SESSION_NOT_FOUND', 'Device session does not exist.');
    if (record.state === 'REVOKED')
      return error('SESSION_REVOKED', 'Revoked device session cannot resume.');
    if (
      parsed.value.previousConnectionId !== record.connectionId ||
      parsed.value.gatewaySession.connectionId === record.connectionId ||
      parsed.value.gatewaySession.generation <= record.gatewayGeneration
    ) {
      return error(
        'RESUME_HIJACK_DETECTED',
        'Resume does not prove a newer connection generation.',
      );
    }
    if (
      parsed.value.gatewaySession.sessionId !== record.gatewaySessionId ||
      parsed.value.gatewaySession.tenantId !== record.tenantId ||
      parsed.value.gatewaySession.actorIdentityId !== record.actorIdentityId
    ) {
      return error(
        'RESUME_HIJACK_DETECTED',
        'Resume attempts to change the bound gateway identity.',
      );
    }
    if (parsed.value.gatewaySession.correlationId !== record.correlationId) {
      return error('CORRELATION_MISMATCH', 'Resume cannot change the bound correlation.');
    }
    const bindingError = this.#validateGatewayDeviceBinding(
      parsed.value.gatewaySession,
      parsed.value.deviceRecord,
      parsed.value.nowMs,
    );
    if (bindingError !== null) return bindingError;
    if (
      parsed.value.deviceRecord.ref.deviceId !== record.deviceRef.deviceId ||
      parsed.value.deviceRecord.ref.registrationVersion !== record.deviceRef.registrationVersion
    ) {
      return error(
        'DEVICE_BINDING_MISMATCH',
        'Resume cannot cross a device registration identity.',
      );
    }
    if (parsed.value.attestation.provider !== record.attestation.provider) {
      return error('ATTESTATION_MISMATCH', 'Resume cannot silently change attestation provider.');
    }
    const attestationError = this.#validateAttestation(
      parsed.value.attestation,
      parsed.value.nowMs,
    );
    if (attestationError !== null) return attestationError;

    record.connectionId = parsed.value.gatewaySession.connectionId;
    record.gatewayGeneration = parsed.value.gatewaySession.generation;
    record.gatewayAuthExpiresAtMs = parsed.value.gatewaySession.authExpiresAtMs;
    record.attestation = cloneAttestation(parsed.value.attestation);
    record.lastEvaluatedAtMs = parsed.value.nowMs;
    return success(this.#snapshot(record));
  }

  revokeSession(input: unknown): DeviceSessionTrustResult {
    const parsed = this.#parseRevokeInput(input);
    if (!parsed.ok) return parsed.result;
    const record = this.#sessions.get(parsed.value.deviceSessionId);
    if (record === undefined) return error('SESSION_NOT_FOUND', 'Device session does not exist.');
    if (parsed.value.connectionId !== record.connectionId) {
      return error('CONNECTION_MISMATCH', 'Connection does not own the device session.');
    }
    if (record.state === 'REVOKED') return success(this.#snapshot(record));
    if (parsed.value.revokedAtMs < record.lastEvaluatedAtMs) {
      return error('MALFORMED_REQUEST', 'Revocation time cannot move backwards.');
    }
    record.state = 'REVOKED';
    record.revokedAtMs = parsed.value.revokedAtMs;
    record.revocationReasonReference = parsed.value.reasonReference;
    record.lastEvaluatedAtMs = parsed.value.revokedAtMs;
    return success(this.#snapshot(record));
  }

  #validateGatewayDeviceBinding(
    gateway: GatewaySessionSnapshot,
    device: DeviceRegistrationRecord,
    nowMs: number,
  ): DeviceSessionTrustResult | null {
    if (gateway.state !== 'OPEN')
      return error('GATEWAY_SESSION_NOT_OPEN', 'Gateway session is not open.');
    if (nowMs >= gateway.authExpiresAtMs) {
      return error('GATEWAY_AUTH_EXPIRED', 'Gateway authentication has expired.');
    }
    if (gateway.tenantId !== device.ref.tenantId) {
      return error(
        'TENANT_MISMATCH',
        'Gateway and device registration belong to different tenants.',
      );
    }
    if (device.state !== 'ACTIVE') {
      return error(
        'DEVICE_NOT_ACTIVE',
        'Only an active registered device may establish session trust.',
      );
    }
    if (
      device.boundIdentityId !== undefined &&
      device.boundIdentityId !== gateway.actorIdentityId
    ) {
      return error('DEVICE_IDENTITY_MISMATCH', 'Device registration is bound to another identity.');
    }
    return null;
  }

  #validateCurrentDevice(
    record: SessionRecord,
    current: DeviceRegistrationRecord,
  ): DeviceSessionTrustResult | null {
    if (current.ref.tenantId !== record.tenantId) {
      return error('TENANT_MISMATCH', 'Current device state belongs to another tenant.');
    }
    if (current.ref.deviceId !== record.deviceRef.deviceId) {
      return error('DEVICE_BINDING_MISMATCH', 'Current device state belongs to another device.');
    }
    if (current.ref.registrationVersion !== record.deviceRef.registrationVersion) {
      return error(
        'DEVICE_VERSION_MISMATCH',
        'Device registration version changed after trust binding.',
      );
    }
    if (current.state !== 'ACTIVE') {
      return error('DEVICE_NOT_ACTIVE', 'Current device lifecycle state is not active.');
    }
    if (
      current.boundIdentityId !== undefined &&
      current.boundIdentityId !== record.actorIdentityId
    ) {
      return error(
        'DEVICE_IDENTITY_MISMATCH',
        'Current device binding no longer matches the actor.',
      );
    }
    return null;
  }

  #validateAttestation(
    attestation: DeviceAttestationReference,
    nowMs: number,
  ): DeviceSessionTrustResult | null {
    if (attestation.expiresAtMs <= attestation.observedAtMs || attestation.observedAtMs > nowMs) {
      return error('ATTESTATION_INVALID', 'Attestation timing is invalid.');
    }
    if (attestation.state === 'REVOKED') {
      return error('ATTESTATION_REVOKED', 'Attestation reference is revoked.');
    }
    if (attestation.state === 'AMBIGUOUS') {
      return error('ATTESTATION_AMBIGUOUS', 'Attestation state is ambiguous.');
    }
    if (nowMs >= attestation.expiresAtMs) {
      return error('ATTESTATION_EXPIRED', 'Attestation reference has expired.');
    }
    if (nowMs - attestation.observedAtMs > this.#config.maxAttestationAgeMs) {
      return error('ATTESTATION_STALE', 'Attestation observation is too old.');
    }
    return null;
  }

  #prepareSessionSlot(): DeviceSessionTrustResult | null {
    const active = [...this.#sessions.values()].filter(
      (session) => session.state === 'ACTIVE',
    ).length;
    if (active >= this.#config.maxActiveSessions) {
      return error('BACKPRESSURE', 'Active device-session trust capacity is exhausted.', true);
    }
    if (this.#sessions.size < this.#config.maxRememberedSessions) return null;
    const oldestRevoked = [...this.#sessions.values()]
      .filter((session) => session.state === 'REVOKED')
      .sort(
        (left, right) =>
          (left.revokedAtMs ?? Number.MAX_SAFE_INTEGER) -
          (right.revokedAtMs ?? Number.MAX_SAFE_INTEGER),
      )[0];
    if (oldestRevoked === undefined) {
      return error('BACKPRESSURE', 'Remembered device-session trust capacity is exhausted.', true);
    }
    this.#sessions.delete(oldestRevoked.deviceSessionId);
    return null;
  }

  #snapshot(record: SessionRecord): DeviceSessionTrustSnapshot {
    return {
      kind: 'DeviceSessionTrustSnapshot',
      schemaVersion: '1.0.0',
      deviceSessionId: record.deviceSessionId,
      gatewaySessionId: record.gatewaySessionId,
      connectionId: record.connectionId,
      gatewayGeneration: record.gatewayGeneration,
      tenantId: record.tenantId,
      actorIdentityId: record.actorIdentityId,
      correlationId: record.correlationId,
      deviceRef: cloneDeviceRef(record.deviceRef),
      attestation: cloneAttestation(record.attestation),
      state: record.state,
      openedAtMs: record.openedAtMs,
      lastEvaluatedAtMs: record.lastEvaluatedAtMs,
      gatewayAuthExpiresAtMs: record.gatewayAuthExpiresAtMs,
      ...(record.revokedAtMs === undefined ? {} : { revokedAtMs: record.revokedAtMs }),
      ...(record.revocationReasonReference === undefined
        ? {}
        : { revocationReasonReference: record.revocationReasonReference }),
      executionPreconditionSatisfied: record.state === 'ACTIVE',
      requiresCurrentAuthorityValidation: true,
      authoritySemantics: 'DEVICE_SESSION_TRUST_IS_PRECONDITION_METADATA_ONLY',
      authorizesExecution: false,
      canGrantPermission: false,
    };
  }

  #parseOpenInput(
    input: unknown,
  ):
    | { ok: true; value: OpenDeviceSessionTrustInput }
    | { ok: false; result: DeviceSessionTrustResult } {
    if (
      !isPlainDataRecord(input) ||
      !hasOnlyKeys(input, [
        'deviceSessionId',
        'gatewaySession',
        'deviceRecord',
        'attestation',
        'nowMs',
      ]) ||
      !isBoundedToken(input.deviceSessionId) ||
      !isFiniteInteger(input.nowMs)
    ) {
      return { ok: false, result: error('MALFORMED_REQUEST', 'Open-session input is malformed.') };
    }
    const gatewaySession = parseGatewaySession(input.gatewaySession);
    const deviceRecord = parseDeviceRecord(input.deviceRecord);
    const attestation = parseAttestation(input.attestation);
    if (gatewaySession === null || deviceRecord === null || attestation === null) {
      return {
        ok: false,
        result: error(
          'MALFORMED_REQUEST',
          'Open-session context contains malformed upstream data.',
        ),
      };
    }
    return {
      ok: true,
      value: {
        deviceSessionId: input.deviceSessionId,
        gatewaySession,
        deviceRecord,
        attestation,
        nowMs: input.nowMs,
      },
    };
  }

  #parseEvaluateInput(
    input: unknown,
  ):
    | { ok: true; value: EvaluateDeviceSessionTrustInput }
    | { ok: false; result: DeviceSessionTrustResult } {
    if (
      !isPlainDataRecord(input) ||
      !hasOnlyKeys(input, [
        'deviceSessionId',
        'connectionId',
        'currentDeviceRecord',
        'currentAttestation',
        'nowMs',
      ]) ||
      !isBoundedToken(input.deviceSessionId) ||
      !isBoundedToken(input.connectionId) ||
      !isFiniteInteger(input.nowMs)
    ) {
      return {
        ok: false,
        result: error('MALFORMED_REQUEST', 'Evaluate-session input is malformed.'),
      };
    }
    const currentDeviceRecord = parseDeviceRecord(input.currentDeviceRecord);
    const currentAttestation = parseAttestation(input.currentAttestation);
    if (currentDeviceRecord === null || currentAttestation === null) {
      return {
        ok: false,
        result: error('MALFORMED_REQUEST', 'Evaluate-session context is malformed.'),
      };
    }
    return {
      ok: true,
      value: {
        deviceSessionId: input.deviceSessionId,
        connectionId: input.connectionId,
        currentDeviceRecord,
        currentAttestation,
        nowMs: input.nowMs,
      },
    };
  }

  #parseResumeInput(
    input: unknown,
  ):
    | { ok: true; value: ResumeDeviceSessionTrustInput }
    | { ok: false; result: DeviceSessionTrustResult } {
    if (
      !isPlainDataRecord(input) ||
      !hasOnlyKeys(input, [
        'deviceSessionId',
        'previousConnectionId',
        'gatewaySession',
        'deviceRecord',
        'attestation',
        'nowMs',
      ]) ||
      !isBoundedToken(input.deviceSessionId) ||
      !isBoundedToken(input.previousConnectionId) ||
      !isFiniteInteger(input.nowMs)
    ) {
      return {
        ok: false,
        result: error('MALFORMED_REQUEST', 'Resume-session input is malformed.'),
      };
    }
    const gatewaySession = parseGatewaySession(input.gatewaySession);
    const deviceRecord = parseDeviceRecord(input.deviceRecord);
    const attestation = parseAttestation(input.attestation);
    if (gatewaySession === null || deviceRecord === null || attestation === null) {
      return {
        ok: false,
        result: error(
          'MALFORMED_REQUEST',
          'Resume-session context contains malformed upstream data.',
        ),
      };
    }
    return {
      ok: true,
      value: {
        deviceSessionId: input.deviceSessionId,
        previousConnectionId: input.previousConnectionId,
        gatewaySession,
        deviceRecord,
        attestation,
        nowMs: input.nowMs,
      },
    };
  }

  #parseRevokeInput(
    input: unknown,
  ):
    | { ok: true; value: RevokeDeviceSessionTrustInput }
    | { ok: false; result: DeviceSessionTrustResult } {
    if (
      !isPlainDataRecord(input) ||
      !hasOnlyKeys(input, ['deviceSessionId', 'connectionId', 'revokedAtMs', 'reasonReference']) ||
      !isBoundedToken(input.deviceSessionId) ||
      !isBoundedToken(input.connectionId) ||
      !isFiniteInteger(input.revokedAtMs) ||
      !isBoundedToken(input.reasonReference, 512)
    ) {
      return {
        ok: false,
        result: error('MALFORMED_REQUEST', 'Revoke-session input is malformed.'),
      };
    }
    return {
      ok: true,
      value: {
        deviceSessionId: input.deviceSessionId,
        connectionId: input.connectionId,
        revokedAtMs: input.revokedAtMs,
        reasonReference: input.reasonReference,
      },
    };
  }
}
