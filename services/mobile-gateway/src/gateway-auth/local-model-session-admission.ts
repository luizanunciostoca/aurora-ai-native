import type { DeviceSessionTrustResult } from '../device-session/types.js';
import {
  GATEWAY_PROTOCOL_VERSION,
  type GatewayProtocolResult,
  type GatewayRequestSnapshot,
  type GatewaySessionSnapshot,
} from './types.js';

const BODY_KEYS = new Set(['deviceSessionId', 'requestId', 'deadlineMs']);
const SAFE_REFERENCE = /^[A-Za-z0-9._:-]+$/u;
const MAX_TIME_MS = 8_640_000_000_000_000;

/** Transport-owned binding: never obtain these fields from a request body or model output. */
export interface LocalModelAuthenticatedSocketBinding {
  readonly sessionId: string;
  readonly connectionId: string;
  readonly tenantId: GatewaySessionSnapshot['tenantId'];
  readonly actorIdentityId: GatewaySessionSnapshot['actorIdentityId'];
  readonly correlationId: GatewaySessionSnapshot['correlationId'];
}

/** Only the existing accepted W14 session/request manager may implement this port. */
export interface LocalModelGatewaySessionPort {
  getSession(sessionId: unknown, nowMs: unknown): GatewayProtocolResult<GatewaySessionSnapshot>;
  beginRequest(input: unknown): GatewayProtocolResult<GatewayRequestSnapshot>;
}

/** Only the existing accepted W14 device-session trust manager may implement this port. */
export interface LocalModelDeviceSessionPort {
  getSession(
    deviceSessionId: string,
    connectionId: string,
    nowMs: number,
  ): DeviceSessionTrustResult;
}

export type LocalModelAdmissionErrorCode =
  | 'BODY_MALFORMED'
  | 'SOCKET_NOT_AUTHENTICATED'
  | 'DEVICE_TRUST_NOT_CURRENT'
  | 'REQUEST_NOT_ADMITTED'
  | 'W14_UPSTREAM_UNAVAILABLE';

export type LocalModelAdmissionResult =
  | {
      readonly ok: true;
      readonly admission: {
        readonly kind: 'W14_INFORMATION_ONLY_LOCAL_MODEL_ADMISSION';
        readonly tenantId: GatewaySessionSnapshot['tenantId'];
        readonly actorIdentityId: GatewaySessionSnapshot['actorIdentityId'];
        readonly correlationId: GatewaySessionSnapshot['correlationId'];
        readonly gatewaySessionId: string;
        readonly deviceSessionId: string;
        readonly requestId: string;
        readonly deadlineMs: number;
        readonly authorizesExecution: false;
        readonly canInvokeTools: false;
        readonly canGrantPermission: false;
      };
      readonly authorizesExecution: false;
      readonly canInvokeTools: false;
    }
  | {
      readonly ok: false;
      readonly error: { readonly code: LocalModelAdmissionErrorCode };
      readonly authorizesExecution: false;
      readonly canInvokeTools: false;
    };

function reject(code: LocalModelAdmissionErrorCode): LocalModelAdmissionResult {
  return { ok: false, error: { code }, authorizesExecution: false, canInvokeTools: false };
}

function plainRecord(value: unknown): value is Record<string, unknown> {
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

function boundedReference(value: unknown, maximum = 256): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    SAFE_REFERENCE.test(value)
  );
}

function validTime(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIME_MS
  );
}

function parseBody(value: unknown): {
  readonly deviceSessionId: string;
  readonly requestId: string;
  readonly deadlineMs: number;
} | null {
  if (!plainRecord(value)) return null;
  try {
    // Snapshot untrusted data once, avoiding accessors and validation/use drift.
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (!Object.keys(descriptors).every((key) => BODY_KEYS.has(key))) return null;
    const deviceSessionId = descriptors.deviceSessionId?.value as unknown;
    const requestId = descriptors.requestId?.value as unknown;
    const deadlineMs = descriptors.deadlineMs?.value as unknown;
    if (
      !boundedReference(deviceSessionId) ||
      !boundedReference(requestId, 128) ||
      !validTime(deadlineMs)
    ) {
      return null;
    }
    return { deviceSessionId, requestId, deadlineMs };
  } catch {
    return null;
  }
}

/**
 * W14-only admission preflight for a future information-only local-model ingress.
 *
 * This is NOT a public HTTP handler, identity provider, model-health attestation,
 * W05 strategy router, permission, or execution interface. It MUST be invoked
 * with binding and server time obtained from the already-authenticated W14 socket.
 * The W14 request manager owns replay/deadline tracking and cancellation/finish.
 * No model payload, prompt, credential, attestation material, or tool call enters
 * this boundary. Device registration revocation still requires the canonical
 * W14 current-record validation at actual integration time.
 */
export class LocalModelSessionAdmission {
  readonly #gatewaySessions: LocalModelGatewaySessionPort;
  readonly #deviceSessions: LocalModelDeviceSessionPort;

  constructor(
    gatewaySessions: LocalModelGatewaySessionPort,
    deviceSessions: LocalModelDeviceSessionPort,
  ) {
    this.#gatewaySessions = gatewaySessions;
    this.#deviceSessions = deviceSessions;
  }

  admit(
    body: unknown,
    socketBinding: LocalModelAuthenticatedSocketBinding,
    nowMs: number,
  ): LocalModelAdmissionResult {
    const parsedBody = parseBody(body);
    if (parsedBody === null) return reject('BODY_MALFORMED');
    if (
      !validTime(nowMs) ||
      !plainRecord(socketBinding) ||
      !boundedReference(socketBinding.sessionId, 128) ||
      !boundedReference(socketBinding.connectionId) ||
      !boundedReference(socketBinding.tenantId) ||
      !boundedReference(socketBinding.actorIdentityId) ||
      !boundedReference(socketBinding.correlationId)
    ) {
      return reject('SOCKET_NOT_AUTHENTICATED');
    }

    try {
      const gateway = this.#gatewaySessions.getSession(socketBinding.sessionId, nowMs);
      if (!gateway.ok) return reject('SOCKET_NOT_AUTHENTICATED');
      const current = gateway.value;
      if (
        current.protocolVersion !== GATEWAY_PROTOCOL_VERSION ||
        current.state !== 'OPEN' ||
        current.authorizesExecution !== false ||
        current.generation < 1 ||
        current.sessionId !== socketBinding.sessionId ||
        current.connectionId !== socketBinding.connectionId ||
        current.tenantId !== socketBinding.tenantId ||
        current.actorIdentityId !== socketBinding.actorIdentityId ||
        current.correlationId !== socketBinding.correlationId ||
        nowMs < current.authIssuedAtMs ||
        nowMs >= current.authExpiresAtMs
      ) {
        return reject('SOCKET_NOT_AUTHENTICATED');
      }

      const device = this.#deviceSessions.getSession(
        parsedBody.deviceSessionId,
        current.connectionId,
        nowMs,
      );
      if (!device.ok) return reject('DEVICE_TRUST_NOT_CURRENT');
      const trust = device.snapshot;
      if (
        trust.kind !== 'DeviceSessionTrustSnapshot' ||
        trust.schemaVersion !== '1.0.0' ||
        trust.state !== 'ACTIVE' ||
        trust.executionPreconditionSatisfied !== true ||
        trust.requiresCurrentAuthorityValidation !== true ||
        trust.authoritySemantics !== 'DEVICE_SESSION_TRUST_IS_PRECONDITION_METADATA_ONLY' ||
        trust.authorizesExecution !== false ||
        trust.canGrantPermission !== false ||
        trust.deviceSessionId !== parsedBody.deviceSessionId ||
        trust.gatewaySessionId !== current.sessionId ||
        trust.connectionId !== current.connectionId ||
        trust.gatewayGeneration !== current.generation ||
        trust.tenantId !== current.tenantId ||
        trust.actorIdentityId !== current.actorIdentityId ||
        trust.correlationId !== current.correlationId ||
        trust.deviceRef.kind !== 'AURORA_DEVICE' ||
        trust.deviceRef.tenantId !== current.tenantId ||
        trust.attestation.state !== 'VERIFIED' ||
        nowMs >= trust.gatewayAuthExpiresAtMs ||
        nowMs >= trust.attestation.expiresAtMs
      ) {
        return reject('DEVICE_TRUST_NOT_CURRENT');
      }

      const begun = this.#gatewaySessions.beginRequest({
        protocolVersion: GATEWAY_PROTOCOL_VERSION,
        sessionId: current.sessionId,
        connectionId: current.connectionId,
        tenantId: current.tenantId,
        actorIdentityId: current.actorIdentityId,
        correlationId: current.correlationId,
        requestId: parsedBody.requestId,
        deadlineMs: parsedBody.deadlineMs,
        nowMs,
      });
      if (
        !begun.ok ||
        begun.value.state !== 'ACTIVE' ||
        begun.value.authorizesExecution !== false ||
        begun.value.requestId !== parsedBody.requestId ||
        begun.value.deadlineMs !== parsedBody.deadlineMs ||
        begun.value.sessionId !== current.sessionId ||
        begun.value.connectionId !== current.connectionId
      ) {
        return reject('REQUEST_NOT_ADMITTED');
      }
      return {
        ok: true,
        admission: {
          kind: 'W14_INFORMATION_ONLY_LOCAL_MODEL_ADMISSION',
          tenantId: current.tenantId,
          actorIdentityId: current.actorIdentityId,
          correlationId: current.correlationId,
          gatewaySessionId: current.sessionId,
          deviceSessionId: trust.deviceSessionId,
          requestId: begun.value.requestId,
          deadlineMs: begun.value.deadlineMs,
          authorizesExecution: false,
          canInvokeTools: false,
          canGrantPermission: false,
        },
        authorizesExecution: false,
        canInvokeTools: false,
      };
    } catch {
      return reject('W14_UPSTREAM_UNAVAILABLE');
    }
  }
}
