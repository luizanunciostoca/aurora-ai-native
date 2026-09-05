// @ts-expect-error -- Aurora targets Node 22 built-ins without repository-wide @types/node.
import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
// @ts-expect-error -- Aurora targets Node 22 built-ins without repository-wide @types/node.
import { Buffer } from 'node:buffer';

import type { IdentityId } from '@aurora/contracts/ids';

import type {
  DeviceRef,
  DeviceRegistrationRecord,
  DeviceResolutionResult,
  ResolveDeviceRequest,
} from '../device/types.js';
import type { GatewaySessionSnapshot } from './types.js';

const DEVICE_ID = /^dvc_[0-9A-HJKMNP-TV-Z]{26}$/u;
const SAFE_TOKEN = /^[A-Za-z0-9._:/+-]+$/u;
const BASE64URL = /^[A-Za-z0-9_-]+$/u;
const FINGERPRINT_REFERENCE = /^device-key:sha256:([a-f0-9]{64})$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const DEFAULT_ATTESTATION_TTL_MS = 60_000;
const DEFAULT_MAX_PROOF_AGE_MS = 15 * 60 * 1000;
const MAX_PROOF_LENGTH = 2_048;
const MAX_SPKI_BYTES = 512;
const MAX_SIGNATURE_BYTES = 160;

const PROOF_KEYS = new Set(['v', 'alg', 'spki', 'signature']);

export interface DeviceKeyProofVerifierConfig {
  readonly attestationTtlMs: number;
  readonly maxProofAgeMs: number;
}

export interface DeviceReceiptIntegrityInput {
  readonly receiptId: string;
  readonly evidenceId?: string;
  readonly commandId: string;
  readonly executionId: string;
  readonly connectionId: string;
  readonly gatewayGeneration: number;
  readonly deliveryReference: string;
  readonly reportedState: string;
  readonly sourceReference: string;
  readonly capturedAtMs: number;
}

interface DeviceRegistryReader {
  resolve(request: ResolveDeviceRequest): DeviceResolutionResult;
}

interface ParsedProof {
  readonly publicKey: object;
  readonly fingerprint: string;
  readonly signature: Uint8Array;
}

type DeviceKeyProofFailureCode =
  'MALFORMED' | 'PROOF_INVALID' | 'UNSUPPORTED_KEY' | 'BINDING_MISMATCH' | 'STALE_PROOF';

type DeviceKeyProofResult<T extends object> =
  | ({
      readonly ok: true;
      readonly authorizesExecution: false;
      readonly canGrantPermission: false;
    } & T)
  | Readonly<{
      ok: false;
      error: Readonly<{ code: DeviceKeyProofFailureCode; retryable: false }>;
      authorizesExecution: false;
      canGrantPermission: false;
    }>;

export type DeviceReceiptAuthenticationResult =
  | Readonly<{
      ok: true;
      authenticatedAtMs: number;
      authenticationReference: string;
      authorizesExecution: false;
      canGrantPermission: false;
    }>
  | Readonly<{
      ok: false;
      code: 'UNAUTHENTICATED' | 'STALE_PROOF' | 'BINDING_MISMATCH' | 'MALFORMED';
      retryable: false;
      authorizesExecution: false;
      canGrantPermission: false;
    }>;

function isRecord(value: unknown): value is Record<string, unknown> {
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

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function safeToken(value: unknown, maxLength = 512): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    SAFE_TOKEN.test(value)
  );
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function proofFailure<T extends object>(code: DeviceKeyProofFailureCode): DeviceKeyProofResult<T> {
  return {
    ok: false,
    error: { code, retryable: false },
    authorizesExecution: false,
    canGrantPermission: false,
  };
}

function authFailure(
  code: 'UNAUTHENTICATED' | 'STALE_PROOF' | 'BINDING_MISMATCH' | 'MALFORMED',
): DeviceReceiptAuthenticationResult {
  return {
    ok: false,
    code,
    retryable: false,
    authorizesExecution: false,
    canGrantPermission: false,
  };
}

function decodeCanonicalBase64Url(value: unknown, maxBytes: number): Uint8Array | null {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maxBytes * 2 ||
    !BASE64URL.test(value)
  ) {
    return null;
  }
  try {
    const decoded = Buffer.from(value, 'base64url');
    if (
      decoded.length === 0 ||
      decoded.length > maxBytes ||
      decoded.toString('base64url') !== value
    ) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function parseProof(value: unknown): ParsedProof | DeviceKeyProofFailureCode {
  const envelopeBytes = decodeCanonicalBase64Url(value, MAX_PROOF_LENGTH);
  if (envelopeBytes === null) return 'MALFORMED';
  let envelope: unknown;
  try {
    envelope = JSON.parse(Buffer.from(envelopeBytes).toString('utf8')) as unknown;
  } catch {
    return 'MALFORMED';
  }
  if (
    !isRecord(envelope) ||
    !hasOnlyKeys(envelope, PROOF_KEYS) ||
    envelope.v !== '1' ||
    envelope.alg !== 'ES256'
  ) {
    return 'MALFORMED';
  }
  const spki = decodeCanonicalBase64Url(envelope.spki, MAX_SPKI_BYTES);
  const signature = decodeCanonicalBase64Url(envelope.signature, MAX_SIGNATURE_BYTES);
  if (spki === null || signature === null) return 'MALFORMED';

  try {
    const publicKey = createPublicKey({ key: spki, format: 'der', type: 'spki' });
    if (
      publicKey.asymmetricKeyType !== 'ec' ||
      publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
    ) {
      return 'UNSUPPORTED_KEY';
    }
    const canonicalSpki = publicKey.export({ format: 'der', type: 'spki' });
    const fingerprint = createHash('sha256').update(canonicalSpki).digest('hex');
    if (!/^[a-f0-9]{64}$/u.test(fingerprint)) return 'PROOF_INVALID';
    return { publicKey, fingerprint, signature };
  } catch {
    return 'PROOF_INVALID';
  }
}

function gatewayBinding(value: unknown, nowMs: number): GatewaySessionSnapshot | null {
  if (
    !isRecord(value) ||
    value.state !== 'OPEN' ||
    value.authorizesExecution !== false ||
    !safeToken(value.sessionId) ||
    !safeToken(value.connectionId) ||
    !positiveInteger(value.generation) ||
    !safeToken(value.tenantId, 128) ||
    !safeToken(value.actorIdentityId, 128) ||
    !safeToken(value.correlationId, 128) ||
    !nonNegativeInteger(value.authExpiresAtMs) ||
    nowMs >= value.authExpiresAtMs
  ) {
    return null;
  }
  return value as unknown as GatewaySessionSnapshot;
}

function deviceRecord(value: unknown): DeviceRegistrationRecord | null {
  if (
    !isRecord(value) ||
    value.kind !== 'DeviceRegistrationRecord' ||
    value.schemaVersion !== '1.0.0' ||
    value.state !== 'ACTIVE' ||
    value.authorizesExecution !== false ||
    value.canGrantPermission !== false ||
    !isRecord(value.ref) ||
    value.ref.kind !== 'AURORA_DEVICE' ||
    typeof value.ref.deviceId !== 'string' ||
    !DEVICE_ID.test(value.ref.deviceId) ||
    !safeToken(value.ref.tenantId, 128) ||
    !positiveInteger(value.ref.registrationVersion) ||
    !isRecord(value.provenance) ||
    value.provenance.source !== 'W14_DEVICE_REGISTRATION' ||
    !safeToken(value.provenance.reference, 256)
  ) {
    return null;
  }
  return value as unknown as DeviceRegistrationRecord;
}

function fingerprintFromRecord(record: DeviceRegistrationRecord): string | null {
  const match = FINGERPRINT_REFERENCE.exec(record.provenance.reference);
  return match?.[1] ?? null;
}

function registrationMessage(gateway: GatewaySessionSnapshot, deviceId: string): string {
  return [
    'AURORA_DEVICE_REGISTRATION_V1',
    gateway.sessionId,
    gateway.connectionId,
    String(gateway.generation),
    deviceId,
    gateway.tenantId,
    gateway.actorIdentityId,
    gateway.correlationId,
  ].join('\n');
}

function attestationMessage(
  gateway: GatewaySessionSnapshot,
  record: DeviceRegistrationRecord,
  deviceSessionId: string,
  previousConnectionId?: string,
): string {
  return [
    'AURORA_DEVICE_ATTESTATION_V1',
    gateway.sessionId,
    gateway.connectionId,
    String(gateway.generation),
    record.ref.deviceId,
    String(record.ref.registrationVersion),
    deviceSessionId,
    previousConnectionId ?? '-',
  ].join('\n');
}

function receiptMessage(input: Record<string, unknown>): string | null {
  if (
    !safeToken(input.tenantId, 128) ||
    !safeToken(input.actorIdentityId, 128) ||
    !safeToken(input.correlationId, 128) ||
    !isRecord(input.deviceRef) ||
    typeof input.deviceRef.deviceId !== 'string' ||
    !DEVICE_ID.test(input.deviceRef.deviceId) ||
    !positiveInteger(input.deviceRef.registrationVersion) ||
    !safeToken(input.deviceSessionId) ||
    !safeToken(input.gatewaySessionId) ||
    !safeToken(input.connectionId) ||
    !positiveInteger(input.gatewayGeneration) ||
    !safeToken(input.receiptId, 128) ||
    !safeToken(input.commandId, 128) ||
    !safeToken(input.executionId, 128) ||
    !safeToken(input.sourceReference) ||
    !nonNegativeInteger(input.capturedAtMs) ||
    typeof input.integrityDigest !== 'string' ||
    !DIGEST.test(input.integrityDigest)
  ) {
    return null;
  }
  return [
    'AURORA_DEVICE_RECEIPT_V1',
    input.tenantId,
    input.actorIdentityId,
    input.correlationId,
    input.deviceRef.deviceId,
    String(input.deviceRef.registrationVersion),
    input.deviceSessionId,
    input.gatewaySessionId,
    input.connectionId,
    String(input.gatewayGeneration),
    input.receiptId,
    input.commandId,
    input.executionId,
    input.sourceReference,
    String(input.capturedAtMs),
    input.integrityDigest,
  ].join('\n');
}

function verifyParsedProof(parsed: ParsedProof, message: string): boolean {
  try {
    return verifySignature(
      'sha256',
      Buffer.from(message, 'utf8'),
      parsed.publicKey,
      parsed.signature,
    );
  } catch {
    return false;
  }
}

export function computeDeviceReceiptIntegrityDigest(input: DeviceReceiptIntegrityInput): string {
  const canonical = JSON.stringify([
    'AURORA_DEVICE_RECEIPT_INTEGRITY_V1',
    input.receiptId,
    input.evidenceId ?? null,
    input.commandId,
    input.executionId,
    input.connectionId,
    input.gatewayGeneration,
    input.deliveryReference,
    input.reportedState,
    input.sourceReference,
    input.capturedAtMs,
  ]);
  return `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

export class DeviceKeyProofVerifier {
  readonly #devices: DeviceRegistryReader;
  readonly #config: DeviceKeyProofVerifierConfig;

  constructor(devices: DeviceRegistryReader, config: Partial<DeviceKeyProofVerifierConfig> = {}) {
    this.#devices = devices;
    this.#config = {
      attestationTtlMs: config.attestationTtlMs ?? DEFAULT_ATTESTATION_TTL_MS,
      maxProofAgeMs: config.maxProofAgeMs ?? DEFAULT_MAX_PROOF_AGE_MS,
    };
    if (
      !positiveInteger(this.#config.attestationTtlMs) ||
      !positiveInteger(this.#config.maxProofAgeMs) ||
      this.#config.attestationTtlMs > 10 * 60 * 1000 ||
      this.#config.maxProofAgeMs > 60 * 60 * 1000
    ) {
      throw new Error('Device key proof verifier limits are invalid.');
    }
  }

  verifyRegistration(input: unknown): DeviceKeyProofResult<{ readonly proofReference: string }> {
    if (
      !isRecord(input) ||
      typeof input.deviceId !== 'string' ||
      !DEVICE_ID.test(input.deviceId) ||
      !nonNegativeInteger(input.nowMs)
    ) {
      return proofFailure('MALFORMED');
    }
    const gateway = gatewayBinding(input.gatewaySession, input.nowMs);
    if (gateway === null) return proofFailure('BINDING_MISMATCH');
    const parsed = parseProof(input.proof);
    if (typeof parsed === 'string') return proofFailure(parsed);
    if (!verifyParsedProof(parsed, registrationMessage(gateway, input.deviceId))) {
      return proofFailure('PROOF_INVALID');
    }
    return {
      ok: true,
      proofReference: `device-key:sha256:${parsed.fingerprint}`,
      authorizesExecution: false,
      canGrantPermission: false,
    };
  }

  verifyAttestation(
    input: unknown,
  ): DeviceKeyProofResult<{ readonly attestation: Readonly<Record<string, unknown>> }> {
    if (
      !isRecord(input) ||
      !safeToken(input.deviceSessionId) ||
      (input.previousConnectionId !== undefined && !safeToken(input.previousConnectionId)) ||
      !nonNegativeInteger(input.nowMs)
    ) {
      return proofFailure('MALFORMED');
    }
    const gateway = gatewayBinding(input.gatewaySession, input.nowMs);
    const record = deviceRecord(input.deviceRecord);
    if (gateway === null || record === null) return proofFailure('BINDING_MISMATCH');
    if (
      record.ref.tenantId !== gateway.tenantId ||
      (record.boundIdentityId !== undefined && record.boundIdentityId !== gateway.actorIdentityId)
    ) {
      return proofFailure('BINDING_MISMATCH');
    }
    const expectedFingerprint = fingerprintFromRecord(record);
    if (expectedFingerprint === null) return proofFailure('BINDING_MISMATCH');
    const parsed = parseProof(input.proof);
    if (typeof parsed === 'string') return proofFailure(parsed);
    if (parsed.fingerprint !== expectedFingerprint) return proofFailure('BINDING_MISMATCH');
    if (
      !verifyParsedProof(
        parsed,
        attestationMessage(
          gateway,
          record,
          input.deviceSessionId,
          typeof input.previousConnectionId === 'string' ? input.previousConnectionId : undefined,
        ),
      )
    ) {
      return proofFailure('PROOF_INVALID');
    }
    const expiresAtMs = Math.min(
      gateway.authExpiresAtMs,
      input.nowMs + this.#config.attestationTtlMs,
    );
    if (expiresAtMs <= input.nowMs) return proofFailure('STALE_PROOF');
    return {
      ok: true,
      attestation: {
        kind: 'DEVICE_ATTESTATION_REFERENCE',
        reference: `device-attestation:sha256:${parsed.fingerprint}:g${gateway.generation}`,
        provider: 'aurora-device-key-proof',
        version: '1',
        state: 'VERIFIED',
        observedAtMs: input.nowMs,
        expiresAtMs,
      },
      authorizesExecution: false,
      canGrantPermission: false,
    };
  }

  verify(input: unknown): DeviceReceiptAuthenticationResult {
    if (
      !isRecord(input) ||
      !nonNegativeInteger(input.receivedAtMs) ||
      !nonNegativeInteger(input.capturedAtMs)
    ) {
      return authFailure('MALFORMED');
    }
    const receivedAtMs = input.receivedAtMs;
    const capturedAtMs = input.capturedAtMs;
    const message = receiptMessage(input);
    if (message === null || !safeToken(input.proofReference, 512)) {
      return authFailure('MALFORMED');
    }
    if (receivedAtMs < capturedAtMs || receivedAtMs - capturedAtMs > this.#config.maxProofAgeMs) {
      return authFailure('STALE_PROOF');
    }
    const parsed = parseProof(input.proofReference);
    if (typeof parsed === 'string') {
      return authFailure(parsed === 'MALFORMED' ? 'MALFORMED' : 'UNAUTHENTICATED');
    }
    const resolved = this.#devices.resolve({
      ref: input.deviceRef as DeviceRef,
      boundIdentityId: input.actorIdentityId as IdentityId,
    });
    if (!resolved.ok || resolved.record.state !== 'ACTIVE') {
      return authFailure('BINDING_MISMATCH');
    }
    const expectedFingerprint = fingerprintFromRecord(resolved.record);
    if (expectedFingerprint === null || parsed.fingerprint !== expectedFingerprint) {
      return authFailure('BINDING_MISMATCH');
    }
    if (!verifyParsedProof(parsed, message)) return authFailure('UNAUTHENTICATED');
    return {
      ok: true,
      authenticatedAtMs: receivedAtMs,
      authenticationReference: `device-receipt-proof:sha256:${parsed.fingerprint}:${String(input.receiptId)}`,
      authorizesExecution: false,
      canGrantPermission: false,
    };
  }
}
