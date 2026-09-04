import type { CorrelationId, IdentityId, TenantId } from '@aurora/contracts/ids';

import type {
  DeviceId,
  DeviceRef,
  DeviceRegistrationRequest,
  DeviceRegistrationResult,
  DeviceResolutionResult,
  DeviceTransitionRequest,
  DeviceTransitionResult,
  ResolveDeviceRequest,
} from '../device/types.js';
import type {
  DeviceAttestationReference,
  DeviceSessionTrustResult,
} from '../device-session/types.js';
import type { GatewayProtocolResult, GatewaySessionSnapshot } from './types.js';

const DEVICE_ROUTES = new Set([
  '/v1/device/registrations/register',
  '/v1/device/registrations/activate',
  '/v1/device/sessions/open',
  '/v1/device/sessions/resume',
  '/v1/device/sessions/revoke',
  '/v1/device/commands/claim',
  '/v1/device/commands/acknowledge',
  '/v1/device/receipts/ingest',
]);

const REGISTER_KEYS = new Set(['deviceId', 'proof']);
const ACTIVATE_KEYS = new Set(['deviceRef']);
const SESSION_OPEN_KEYS = new Set(['deviceSessionId', 'deviceRef', 'proof']);
const SESSION_RESUME_KEYS = new Set([
  'deviceSessionId',
  'previousConnectionId',
  'deviceRef',
  'proof',
]);
const SESSION_REVOKE_KEYS = new Set(['deviceSessionId', 'reasonReference']);
const COMMAND_CLAIM_KEYS = new Set(['commandId']);
const COMMAND_ACK_KEYS = new Set(['commandId', 'deliveryReference', 'ackReference']);
const RECEIPT_KEYS = new Set([
  'receiptId',
  'evidenceId',
  'commandId',
  'executionId',
  'connectionId',
  'gatewayGeneration',
  'deliveryReference',
  'reportedState',
  'sourceReference',
  'proofReference',
  'integrityDigest',
  'capturedAtMs',
]);
const DEVICE_REF_KEYS = new Set(['kind', 'deviceId', 'tenantId', 'registrationVersion']);

const DEVICE_ID = /^dvc_[0-9A-HJKMNP-TV-Z]{26}$/u;
const TENANT_ID = /^ten_[0-9A-HJKMNP-TV-Z]{26}$/u;
const SAFE_TOKEN = /^[A-Za-z0-9._:/+-]+$/u;
const REPORTED_STATES = new Set(['COMPLETED', 'FAILED', 'UNCERTAIN']);

export interface GatewayDevicePlaneBinding {
  readonly sessionId: string;
  readonly connectionId: string;
  readonly tenantId: TenantId;
  readonly actorIdentityId: IdentityId;
  readonly correlationId: CorrelationId;
}

interface DeviceRegistryPort {
  register(request: DeviceRegistrationRequest): DeviceRegistrationResult;
  transition(transition: 'ACTIVATE', request: DeviceTransitionRequest): DeviceTransitionResult;
  resolve(request: ResolveDeviceRequest): DeviceResolutionResult;
}

interface DeviceSessionTrustPort {
  openSession(input: unknown): DeviceSessionTrustResult;
  resumeSession(input: unknown): DeviceSessionTrustResult;
  getSession(deviceSessionId: string, connectionId: string, nowMs: number): DeviceSessionTrustResult;
  revokeSession(input: unknown): DeviceSessionTrustResult;
}

interface RealtimeCommandReaderPort {
  getCommand(
    gatewaySessionId: unknown,
    gatewayConnectionId: unknown,
    commandId: unknown,
    nowMs: unknown,
  ): DevicePlanePortResult;
}

interface DeviceDeliveryPort {
  claim(input: unknown): DevicePlanePortResult;
  acknowledge(input: unknown): DevicePlanePortResult;
}

interface DeviceReceiptPort {
  ingest(input: unknown): DevicePlanePortResult;
}

interface DevicePlanePortResult {
  readonly ok: boolean;
  readonly value?: unknown;
  readonly error?: {
    readonly code?: unknown;
    readonly message?: unknown;
    readonly retryable?: unknown;
  };
  readonly authorizesExecution?: unknown;
  readonly retryAuthorized?: unknown;
}

export interface DeviceRegistrationProofRequest {
  readonly deviceId: DeviceId;
  readonly tenantId: TenantId;
  readonly actorIdentityId: IdentityId;
  readonly opaqueProof: string;
  readonly nowMs: number;
}

export interface DeviceAttestationProofRequest {
  readonly deviceSessionId: string;
  readonly deviceRef: DeviceRef;
  readonly gatewaySession: GatewaySessionSnapshot;
  readonly opaqueProof: string;
  readonly nowMs: number;
}

export type DeviceRegistrationProofResult =
  | Readonly<{
      ok: true;
      verificationReference: string;
      authorizesExecution: false;
      canGrantPermission: false;
    }>
  | Readonly<{
      ok: false;
      code: string;
      retryable: boolean;
      authorizesExecution: false;
      canGrantPermission: false;
    }>;

export type DeviceAttestationProofResult =
  | Readonly<{
      ok: true;
      attestation: DeviceAttestationReference;
      authorizesExecution: false;
      canGrantPermission: false;
    }>
  | Readonly<{
      ok: false;
      code: string;
      retryable: boolean;
      authorizesExecution: false;
      canGrantPermission: false;
    }>;

/**
 * Server-side proof verifier. The network client only sends opaque proof material;
 * it can never submit an attestation verdict/state or a trusted registration reference.
 */
export interface GatewayDeviceProofVerifier {
  verifyRegistration(request: DeviceRegistrationProofRequest): DeviceRegistrationProofResult;
  verifyAttestation(request: DeviceAttestationProofRequest): DeviceAttestationProofResult;
}

export interface GatewayDevicePlaneNetworkDependencies {
  readonly gatewaySessions: {
    getSession(
      sessionId: unknown,
      nowMs: unknown,
    ): GatewayProtocolResult<GatewaySessionSnapshot>;
  };
  readonly devices: DeviceRegistryPort;
  readonly sessionTrust: DeviceSessionTrustPort;
  readonly realtimeCommands: RealtimeCommandReaderPort;
  readonly delivery: DeviceDeliveryPort;
  readonly receipts: DeviceReceiptPort;
  readonly proofVerifier: GatewayDeviceProofVerifier;
}

export type GatewayDevicePlaneNetworkResult =
  | Readonly<{
      ok: true;
      value: unknown;
      authorizesExecution: false;
      canGrantPermission: false;
      retryAuthorized: false;
    }>
  | Readonly<{
      ok: false;
      error: {
        code: string;
        message: string;
        retryable: boolean;
      };
      authorizesExecution: false;
      canGrantPermission: false;
      retryAuthorized: false;
    }>;

export interface GatewayDevicePlaneNetworkRequest {
  readonly path: string;
  readonly body: Record<string, unknown>;
  readonly gatewayBinding: GatewayDevicePlaneBinding;
  readonly socket: object;
  readonly nowMs: number;
}

interface DeviceSocketBinding {
  deviceRef?: DeviceRef;
  deviceSessionId?: string;
}

function success(value: unknown): GatewayDevicePlaneNetworkResult {
  return {
    ok: true,
    value,
    authorizesExecution: false,
    canGrantPermission: false,
    retryAuthorized: false,
  };
}

function failure(
  code: string,
  message: string,
  retryable = false,
): GatewayDevicePlaneNetworkResult {
  return {
    ok: false,
    error: { code, message, retryable },
    authorizesExecution: false,
    canGrantPermission: false,
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

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function isSafeToken(value: unknown, maximum = 512): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    SAFE_TOKEN.test(value)
  );
}

function isOpaqueProof(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 8192 &&
    !/[\u0000-\u001F\u007F]/u.test(value)
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function parseDeviceRef(value: unknown): DeviceRef | null {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, DEVICE_REF_KEYS)) return null;
  if (
    value.kind !== 'AURORA_DEVICE' ||
    typeof value.deviceId !== 'string' ||
    !DEVICE_ID.test(value.deviceId) ||
    typeof value.tenantId !== 'string' ||
    !TENANT_ID.test(value.tenantId) ||
    !isPositiveInteger(value.registrationVersion)
  ) {
    return null;
  }
  return Object.freeze({
    kind: 'AURORA_DEVICE' as const,
    deviceId: value.deviceId as DeviceId,
    tenantId: value.tenantId as TenantId,
    registrationVersion: value.registrationVersion,
  });
}

function sameDeviceRef(left: DeviceRef, right: DeviceRef): boolean {
  return (
    left.kind === right.kind &&
    left.deviceId === right.deviceId &&
    left.tenantId === right.tenantId &&
    left.registrationVersion === right.registrationVersion
  );
}

function normalizePortResult(result: DevicePlanePortResult): GatewayDevicePlaneNetworkResult {
  if (result.authorizesExecution !== false) {
    return failure(
      'UPSTREAM_PROTOCOL_VIOLATION',
      'Device-plane dependency returned an authoritative or malformed result.',
    );
  }
  if (result.ok) return success(result.value);
  const code = typeof result.error?.code === 'string' ? result.error.code : 'UPSTREAM_REJECTED';
  const message =
    typeof result.error?.message === 'string'
      ? result.error.message
      : 'Device-plane dependency rejected the request.';
  return failure(code, message, result.error?.retryable === true);
}

function registrationFailure(result: Exclude<DeviceRegistrationResult, { ok: true }>) {
  return failure(result.error, 'Canonical device registration rejected the request.');
}

function transitionFailure(result: Exclude<DeviceTransitionResult, { ok: true }>) {
  return failure(result.error, 'Canonical device lifecycle rejected the transition.');
}

function trustFailure(result: Exclude<DeviceSessionTrustResult, { ok: true }>) {
  return failure(result.error.code, result.error.message, result.error.retryable);
}

/**
 * W14-owned same-socket composition only. This class owns no authority, trust ledger,
 * command ledger, delivery ledger, receipt ledger or retry decision.
 */
export class GatewayDevicePlaneNetwork {
  readonly #dependencies: GatewayDevicePlaneNetworkDependencies;
  readonly #socketBindings = new WeakMap<object, DeviceSocketBinding>();

  constructor(dependencies: GatewayDevicePlaneNetworkDependencies) {
    this.#dependencies = dependencies;
  }

  isRoute(path: string): boolean {
    return DEVICE_ROUTES.has(path);
  }

  releaseSocket(socket: object): void {
    this.#socketBindings.delete(socket);
  }

  handle(request: GatewayDevicePlaneNetworkRequest): GatewayDevicePlaneNetworkResult {
    if (!this.isRoute(request.path) || !isNonNegativeInteger(request.nowMs)) {
      return failure('MALFORMED_REQUEST', 'Device-plane network request is malformed.');
    }
    const gateway = this.#currentGateway(request.gatewayBinding, request.nowMs);
    if (!gateway.ok) return gateway.result;

    if (request.path === '/v1/device/registrations/register') {
      return this.#register(request, gateway.snapshot);
    }
    if (request.path === '/v1/device/registrations/activate') {
      return this.#activate(request, gateway.snapshot);
    }
    if (request.path === '/v1/device/sessions/open') {
      return this.#openSession(request, gateway.snapshot);
    }
    if (request.path === '/v1/device/sessions/resume') {
      return this.#resumeSession(request, gateway.snapshot);
    }
    if (request.path === '/v1/device/sessions/revoke') {
      return this.#revokeSession(request, gateway.snapshot);
    }
    if (request.path === '/v1/device/commands/claim') {
      return this.#claim(request, gateway.snapshot);
    }
    if (request.path === '/v1/device/commands/acknowledge') {
      return this.#acknowledge(request, gateway.snapshot);
    }
    return this.#ingestReceipt(request, gateway.snapshot);
  }

  #currentGateway(
    binding: GatewayDevicePlaneBinding,
    nowMs: number,
  ):
    | { ok: true; snapshot: GatewaySessionSnapshot }
    | { ok: false; result: GatewayDevicePlaneNetworkResult } {
    const current = this.#dependencies.gatewaySessions.getSession(binding.sessionId, nowMs);
    if (!current.ok) {
      return {
        ok: false,
        result: failure(
          current.error.code,
          'Authenticated gateway session is no longer current.',
          current.error.retryable,
        ),
      };
    }
    const snapshot = current.value;
    if (
      snapshot.state !== 'OPEN' ||
      snapshot.connectionId !== binding.connectionId ||
      snapshot.tenantId !== binding.tenantId ||
      snapshot.actorIdentityId !== binding.actorIdentityId ||
      snapshot.correlationId !== binding.correlationId ||
      snapshot.authorizesExecution !== false
    ) {
      return {
        ok: false,
        result: failure(
          'GATEWAY_BINDING_MISMATCH',
          'Socket binding does not match current authenticated gateway state.',
        ),
      };
    }
    return { ok: true, snapshot };
  }

  #register(
    request: GatewayDevicePlaneNetworkRequest,
    gateway: GatewaySessionSnapshot,
  ): GatewayDevicePlaneNetworkResult {
    if (
      !hasOnlyKeys(request.body, REGISTER_KEYS) ||
      typeof request.body.deviceId !== 'string' ||
      !DEVICE_ID.test(request.body.deviceId) ||
      !isOpaqueProof(request.body.proof)
    ) {
      return failure('MALFORMED_REQUEST', 'Device registration body is invalid.');
    }
    const deviceId = request.body.deviceId as DeviceId;
    const verified = this.#dependencies.proofVerifier.verifyRegistration({
      deviceId,
      tenantId: gateway.tenantId,
      actorIdentityId: gateway.actorIdentityId,
      opaqueProof: request.body.proof,
      nowMs: request.nowMs,
    });
    if (
      !verified.ok ||
      verified.authorizesExecution !== false ||
      verified.canGrantPermission !== false ||
      !isSafeToken(verified.verificationReference)
    ) {
      return failure(
        verified.ok ? 'PROOF_PROTOCOL_VIOLATION' : verified.code,
        'Server-side device registration proof verification failed.',
        verified.ok ? false : verified.retryable,
      );
    }
    const observedAt = new Date(request.nowMs).toISOString();
    const result = this.#dependencies.devices.register({
      deviceId,
      tenantId: gateway.tenantId,
      boundIdentityId: gateway.actorIdentityId,
      registeredAt: observedAt,
      provenance: {
        source: 'W14_DEVICE_REGISTRATION',
        reference: verified.verificationReference,
        observedAt,
      },
    });
    if (!result.ok) return registrationFailure(result);
    this.#socketBindings.set(request.socket, { deviceRef: result.record.ref });
    return success({ disposition: result.disposition, device: result.record });
  }

  #activate(
    request: GatewayDevicePlaneNetworkRequest,
    gateway: GatewaySessionSnapshot,
  ): GatewayDevicePlaneNetworkResult {
    if (!hasOnlyKeys(request.body, ACTIVATE_KEYS)) {
      return failure('MALFORMED_REQUEST', 'Device activation body is invalid.');
    }
    const deviceRef = parseDeviceRef(request.body.deviceRef);
    const socketBinding = this.#socketBindings.get(request.socket);
    if (
      deviceRef === null ||
      deviceRef.tenantId !== gateway.tenantId ||
      socketBinding?.deviceRef === undefined ||
      !sameDeviceRef(socketBinding.deviceRef, deviceRef)
    ) {
      return failure(
        'DEVICE_BINDING_MISMATCH',
        'Device activation must use the registration verified on this authenticated socket.',
      );
    }
    const transitionedAt = new Date(request.nowMs).toISOString();
    const transition = this.#dependencies.devices.transition('ACTIVATE', {
      ref: deviceRef,
      expectedVersion: deviceRef.registrationVersion,
      transitionedAt,
      provenance: {
        source: 'W14_DEVICE_REGISTRATION',
        reference: `network-activation:${deviceRef.deviceId}:${deviceRef.registrationVersion}`,
        observedAt: transitionedAt,
      },
    });
    if (!transition.ok) return transitionFailure(transition);
    this.#socketBindings.set(request.socket, { deviceRef: transition.record.ref });
    return success({ transition: transition.transition, device: transition.record });
  }

  #resolveActiveDevice(
    deviceRef: DeviceRef,
    gateway: GatewaySessionSnapshot,
  ):
    | { ok: true; record: Extract<DeviceResolutionResult, { ok: true }>['record'] }
    | { ok: false; result: GatewayDevicePlaneNetworkResult } {
    if (deviceRef.tenantId !== gateway.tenantId) {
      return { ok: false, result: failure('CROSS_TENANT', 'Device belongs to another tenant.') };
    }
    const resolved = this.#dependencies.devices.resolve({
      ref: deviceRef,
      boundIdentityId: gateway.actorIdentityId,
    });
    if (!resolved.ok) {
      return {
        ok: false,
        result: failure(resolved.error, 'Canonical device resolution rejected the request.'),
      };
    }
    if (
      resolved.authorizesExecution !== false ||
      resolved.canGrantPermission !== false ||
      resolved.record.state !== 'ACTIVE'
    ) {
      return {
        ok: false,
        result: failure('DEVICE_NOT_ACTIVE', 'Resolved device is not an active non-authoritative binding.'),
      };
    }
    return { ok: true, record: resolved.record };
  }

  #verifiedAttestation(
    request: GatewayDevicePlaneNetworkRequest,
    gateway: GatewaySessionSnapshot,
    deviceRef: DeviceRef,
    deviceSessionId: string,
  ):
    | { ok: true; attestation: DeviceAttestationReference }
    | { ok: false; result: GatewayDevicePlaneNetworkResult } {
    const resolved = this.#resolveActiveDevice(deviceRef, gateway);
    if (!resolved.ok) return resolved;
    const proof = request.body.proof;
    if (!isOpaqueProof(proof)) {
      return { ok: false, result: failure('MALFORMED_REQUEST', 'Attestation proof is malformed.') };
    }
    const verified = this.#dependencies.proofVerifier.verifyAttestation({
      deviceSessionId,
      deviceRef: resolved.record.ref,
      gatewaySession: gateway,
      opaqueProof: proof,
      nowMs: request.nowMs,
    });
    if (
      !verified.ok ||
      verified.authorizesExecution !== false ||
      verified.canGrantPermission !== false ||
      verified.attestation.state !== 'VERIFIED'
    ) {
      return {
        ok: false,
        result: failure(
          verified.ok ? 'ATTESTATION_PROTOCOL_VIOLATION' : verified.code,
          'Server-side device attestation verification failed.',
          verified.ok ? false : verified.retryable,
        ),
      };
    }
    return { ok: true, attestation: verified.attestation };
  }

  #openSession(
    request: GatewayDevicePlaneNetworkRequest,
    gateway: GatewaySessionSnapshot,
  ): GatewayDevicePlaneNetworkResult {
    if (!hasOnlyKeys(request.body, SESSION_OPEN_KEYS) || !isSafeToken(request.body.deviceSessionId)) {
      return failure('MALFORMED_REQUEST', 'Device session-open body is invalid.');
    }
    const deviceRef = parseDeviceRef(request.body.deviceRef);
    if (deviceRef === null) return failure('MALFORMED_REQUEST', 'Device reference is invalid.');
    const resolved = this.#resolveActiveDevice(deviceRef, gateway);
    if (!resolved.ok) return resolved.result;
    const attestation = this.#verifiedAttestation(
      request,
      gateway,
      resolved.record.ref,
      request.body.deviceSessionId,
    );
    if (!attestation.ok) return attestation.result;
    const result = this.#dependencies.sessionTrust.openSession({
      deviceSessionId: request.body.deviceSessionId,
      gatewaySession: gateway,
      deviceRecord: resolved.record,
      attestation: attestation.attestation,
      nowMs: request.nowMs,
    });
    if (!result.ok) return trustFailure(result);
    if (
      result.authorizesExecution !== false ||
      result.canGrantPermission !== false ||
      result.snapshot.connectionId !== gateway.connectionId ||
      !sameDeviceRef(result.snapshot.deviceRef, resolved.record.ref)
    ) {
      return failure('SESSION_PROTOCOL_VIOLATION', 'W14-E returned an invalid device-session binding.');
    }
    this.#socketBindings.set(request.socket, {
      deviceRef: result.snapshot.deviceRef,
      deviceSessionId: result.snapshot.deviceSessionId,
    });
    return success({ deviceSession: result.snapshot });
  }

  #resumeSession(
    request: GatewayDevicePlaneNetworkRequest,
    gateway: GatewaySessionSnapshot,
  ): GatewayDevicePlaneNetworkResult {
    if (
      !hasOnlyKeys(request.body, SESSION_RESUME_KEYS) ||
      !isSafeToken(request.body.deviceSessionId) ||
      !isSafeToken(request.body.previousConnectionId)
    ) {
      return failure('MALFORMED_REQUEST', 'Device session-resume body is invalid.');
    }
    const deviceRef = parseDeviceRef(request.body.deviceRef);
    if (deviceRef === null) return failure('MALFORMED_REQUEST', 'Device reference is invalid.');
    const resolved = this.#resolveActiveDevice(deviceRef, gateway);
    if (!resolved.ok) return resolved.result;
    const attestation = this.#verifiedAttestation(
      request,
      gateway,
      resolved.record.ref,
      request.body.deviceSessionId,
    );
    if (!attestation.ok) return attestation.result;
    const result = this.#dependencies.sessionTrust.resumeSession({
      deviceSessionId: request.body.deviceSessionId,
      previousConnectionId: request.body.previousConnectionId,
      gatewaySession: gateway,
      deviceRecord: resolved.record,
      attestation: attestation.attestation,
      nowMs: request.nowMs,
    });
    if (!result.ok) return trustFailure(result);
    if (
      result.authorizesExecution !== false ||
      result.canGrantPermission !== false ||
      result.snapshot.connectionId !== gateway.connectionId ||
      result.snapshot.gatewayGeneration !== gateway.generation
    ) {
      return failure('SESSION_PROTOCOL_VIOLATION', 'W14-E returned an invalid resumed binding.');
    }
    this.#socketBindings.set(request.socket, {
      deviceRef: result.snapshot.deviceRef,
      deviceSessionId: result.snapshot.deviceSessionId,
    });
    return success({ deviceSession: result.snapshot });
  }

  #currentDeviceTrust(
    request: GatewayDevicePlaneNetworkRequest,
    gateway: GatewaySessionSnapshot,
  ):
    | { ok: true; snapshot: Extract<DeviceSessionTrustResult, { ok: true }>['snapshot'] }
    | { ok: false; result: GatewayDevicePlaneNetworkResult } {
    const socketBinding = this.#socketBindings.get(request.socket);
    if (socketBinding?.deviceSessionId === undefined) {
      return {
        ok: false,
        result: failure('DEVICE_SESSION_BINDING_REQUIRED', 'Socket has no current device-session binding.'),
      };
    }
    const current = this.#dependencies.sessionTrust.getSession(
      socketBinding.deviceSessionId,
      gateway.connectionId,
      request.nowMs,
    );
    if (!current.ok) return { ok: false, result: trustFailure(current) };
    if (
      current.snapshot.state !== 'ACTIVE' ||
      !current.snapshot.executionPreconditionSatisfied ||
      current.snapshot.gatewaySessionId !== gateway.sessionId ||
      current.snapshot.connectionId !== gateway.connectionId ||
      current.snapshot.gatewayGeneration !== gateway.generation ||
      current.snapshot.tenantId !== gateway.tenantId ||
      current.snapshot.actorIdentityId !== gateway.actorIdentityId ||
      current.snapshot.correlationId !== gateway.correlationId ||
      current.authorizesExecution !== false ||
      current.canGrantPermission !== false
    ) {
      return {
        ok: false,
        result: failure('SESSION_NOT_TRUSTED', 'Current W14-E device-session trust is not usable.'),
      };
    }
    return { ok: true, snapshot: current.snapshot };
  }

  #revokeSession(
    request: GatewayDevicePlaneNetworkRequest,
    gateway: GatewaySessionSnapshot,
  ): GatewayDevicePlaneNetworkResult {
    if (
      !hasOnlyKeys(request.body, SESSION_REVOKE_KEYS) ||
      !isSafeToken(request.body.deviceSessionId) ||
      !isSafeToken(request.body.reasonReference)
    ) {
      return failure('MALFORMED_REQUEST', 'Device session-revoke body is invalid.');
    }
    const socketBinding = this.#socketBindings.get(request.socket);
    if (socketBinding?.deviceSessionId !== request.body.deviceSessionId) {
      return failure('DEVICE_SESSION_BINDING_REQUIRED', 'Socket does not own this device session.');
    }
    const current = this.#currentDeviceTrust(request, gateway);
    if (!current.ok) return current.result;
    const revoked = this.#dependencies.sessionTrust.revokeSession({
      deviceSessionId: current.snapshot.deviceSessionId,
      connectionId: gateway.connectionId,
      revokedAtMs: request.nowMs,
      reasonReference: request.body.reasonReference,
    });
    if (!revoked.ok) return trustFailure(revoked);
    this.#socketBindings.set(request.socket, { deviceRef: current.snapshot.deviceRef });
    return success({ deviceSession: revoked.snapshot });
  }

  #claim(
    request: GatewayDevicePlaneNetworkRequest,
    gateway: GatewaySessionSnapshot,
  ): GatewayDevicePlaneNetworkResult {
    if (!hasOnlyKeys(request.body, COMMAND_CLAIM_KEYS) || !isSafeToken(request.body.commandId)) {
      return failure('MALFORMED_REQUEST', 'Device command-claim body is invalid.');
    }
    const trust = this.#currentDeviceTrust(request, gateway);
    if (!trust.ok) return trust.result;
    const command = this.#dependencies.realtimeCommands.getCommand(
      gateway.sessionId,
      gateway.connectionId,
      request.body.commandId,
      request.nowMs,
    );
    if (!command.ok) return normalizePortResult(command);
    const delivery = this.#dependencies.delivery.claim({
      command: command.value,
      deviceSession: trust.snapshot,
      nowMs: request.nowMs,
    });
    return normalizePortResult(delivery);
  }

  #acknowledge(
    request: GatewayDevicePlaneNetworkRequest,
    gateway: GatewaySessionSnapshot,
  ): GatewayDevicePlaneNetworkResult {
    if (
      !hasOnlyKeys(request.body, COMMAND_ACK_KEYS) ||
      !isSafeToken(request.body.commandId) ||
      !isSafeToken(request.body.deliveryReference) ||
      !isSafeToken(request.body.ackReference)
    ) {
      return failure('MALFORMED_REQUEST', 'Device command-acknowledgement body is invalid.');
    }
    const trust = this.#currentDeviceTrust(request, gateway);
    if (!trust.ok) return trust.result;
    const command = this.#dependencies.realtimeCommands.getCommand(
      gateway.sessionId,
      gateway.connectionId,
      request.body.commandId,
      request.nowMs,
    );
    if (!command.ok) return normalizePortResult(command);
    return normalizePortResult(
      this.#dependencies.delivery.acknowledge({
        command: command.value,
        deviceSession: trust.snapshot,
        deliveryReference: request.body.deliveryReference,
        ackReference: request.body.ackReference,
        observedAtMs: request.nowMs,
      }),
    );
  }

  #ingestReceipt(
    request: GatewayDevicePlaneNetworkRequest,
    gateway: GatewaySessionSnapshot,
  ): GatewayDevicePlaneNetworkResult {
    if (
      !hasOnlyKeys(request.body, RECEIPT_KEYS) ||
      !isSafeToken(request.body.receiptId) ||
      (request.body.evidenceId !== undefined && !isSafeToken(request.body.evidenceId)) ||
      !isSafeToken(request.body.commandId) ||
      !isSafeToken(request.body.executionId) ||
      !isSafeToken(request.body.connectionId) ||
      !isPositiveInteger(request.body.gatewayGeneration) ||
      !isSafeToken(request.body.deliveryReference) ||
      typeof request.body.reportedState !== 'string' ||
      !REPORTED_STATES.has(request.body.reportedState) ||
      !isSafeToken(request.body.sourceReference) ||
      !isSafeToken(request.body.proofReference) ||
      !isSafeToken(request.body.integrityDigest) ||
      !isNonNegativeInteger(request.body.capturedAtMs)
    ) {
      return failure('MALFORMED_REQUEST', 'Device receipt body is invalid.');
    }
    const trust = this.#currentDeviceTrust(request, gateway);
    if (!trust.ok) return trust.result;
    return normalizePortResult(
      this.#dependencies.receipts.ingest({
        receiptId: request.body.receiptId,
        ...(request.body.evidenceId === undefined ? {} : { evidenceId: request.body.evidenceId }),
        tenantId: gateway.tenantId,
        correlationId: gateway.correlationId,
        commandId: request.body.commandId,
        executionId: request.body.executionId,
        deviceRef: trust.snapshot.deviceRef,
        deviceSessionId: trust.snapshot.deviceSessionId,
        gatewaySessionId: gateway.sessionId,
        connectionId: request.body.connectionId,
        gatewayGeneration: request.body.gatewayGeneration,
        deliveryReference: request.body.deliveryReference,
        reportedState: request.body.reportedState,
        sourceReference: request.body.sourceReference,
        proofReference: request.body.proofReference,
        integrityDigest: request.body.integrityDigest,
        capturedAtMs: request.body.capturedAtMs,
        receivedAtMs: request.nowMs,
        deviceSession: trust.snapshot,
      }),
    );
  }
}
