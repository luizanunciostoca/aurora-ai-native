import {
  GatewayDevicePlaneNetworkHandler,
  type GatewayDevicePlaneDependencies,
  type GatewayDevicePlaneHandleInput,
  type GatewayDevicePlaneResponse,
} from './device-plane-network.js';
import type {
  VoiceCandidateNetworkBoundary,
  VoiceCandidateSocketContext,
} from './voice-candidate-network.js';
import {
  VOICE_PROJECTION_DEVICE_ROUTE,
  type VoiceProjectionNetworkBoundary,
} from './voice-projection-network.js';

export const VOICE_CANDIDATE_DEVICE_ROUTE = '/v1/device/voice/candidates/evaluate' as const;

const DEVICE_ID = /^dvc_[0-9A-HJKMNP-TV-Z]{26}$/u;
const MAX_DATE_MS = 8_640_000_000_000_000;

export interface GatewayVoiceDeviceRouteDependencies {
  /** Canonical W14-E trust reader. This route owns no trust cache or ledger. */
  readonly deviceSessions: object;
  /** Accepted W15-G -> W07 sanitized candidate boundary. */
  readonly voiceCandidates: VoiceCandidateNetworkBoundary;
  /** Current non-authoritative W04/W15-G projection boundary. */
  readonly voiceProjection: VoiceProjectionNetworkBoundary;
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

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function voiceRouteError(statusCode: number, code: string): GatewayDevicePlaneResponse {
  return {
    statusCode,
    body: {
      ok: false,
      acceptedForEvaluation: false,
      voiceCandidateError: { code },
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    },
  };
}

function projectionRouteError(statusCode: number, code: string): GatewayDevicePlaneResponse {
  return {
    statusCode,
    body: {
      ok: false,
      voiceProjectionError: { code },
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    },
  };
}

function currentGatewayBinding(input: GatewayDevicePlaneHandleInput): boolean {
  const gateway = input.gatewaySession;
  const binding = input.socketBinding;
  return (
    Number.isSafeInteger(input.nowMs) &&
    input.nowMs >= 0 &&
    input.nowMs <= MAX_DATE_MS &&
    gateway.state === 'OPEN' &&
    gateway.authorizesExecution === false &&
    gateway.sessionId === binding.sessionId &&
    gateway.connectionId === binding.connectionId &&
    gateway.tenantId === binding.tenantId &&
    gateway.actorIdentityId === binding.actorIdentityId &&
    gateway.correlationId === binding.correlationId &&
    positiveInteger(gateway.generation) &&
    nonNegativeInteger(gateway.authIssuedAtMs) &&
    nonNegativeInteger(gateway.authExpiresAtMs) &&
    gateway.authIssuedAtMs <= input.nowMs &&
    input.nowMs < gateway.authExpiresAtMs
  );
}

function currentDeviceRef(input: GatewayDevicePlaneHandleInput): Record<string, unknown> | null {
  const value = input.connectionState.deviceRef;
  if (
    !isPlainRecord(value) ||
    value.kind !== 'AURORA_DEVICE' ||
    typeof value.deviceId !== 'string' ||
    !DEVICE_ID.test(value.deviceId) ||
    value.tenantId !== input.gatewaySession.tenantId ||
    !positiveInteger(value.registrationVersion)
  ) {
    return null;
  }
  return value;
}

function invokeCurrentTrust(
  deviceSessions: object,
  deviceSessionId: string,
  connectionId: string,
  nowMs: number,
): unknown {
  const candidate = (deviceSessions as Record<string, unknown>).getSession;
  if (typeof candidate !== 'function') {
    throw new Error('Canonical W14 device-session reader is unavailable.');
  }
  return Reflect.apply(candidate, deviceSessions, [deviceSessionId, connectionId, nowMs]);
}

function contextFromCurrentTrust(
  result: unknown,
  input: GatewayDevicePlaneHandleInput,
  deviceSessionId: string,
  deviceRef: Record<string, unknown>,
): VoiceCandidateSocketContext | null {
  if (
    !isPlainRecord(result) ||
    result.ok !== true ||
    result.authorizesExecution !== false ||
    result.canGrantPermission !== false ||
    !isPlainRecord(result.snapshot)
  ) {
    return null;
  }

  const snapshot = result.snapshot;
  const snapshotDeviceRef = snapshot.deviceRef;
  if (
    snapshot.kind !== 'DeviceSessionTrustSnapshot' ||
    snapshot.schemaVersion !== '1.0.0' ||
    snapshot.deviceSessionId !== deviceSessionId ||
    snapshot.gatewaySessionId !== input.gatewaySession.sessionId ||
    snapshot.connectionId !== input.gatewaySession.connectionId ||
    snapshot.gatewayGeneration !== input.gatewaySession.generation ||
    snapshot.tenantId !== input.gatewaySession.tenantId ||
    snapshot.actorIdentityId !== input.gatewaySession.actorIdentityId ||
    snapshot.correlationId !== input.gatewaySession.correlationId ||
    snapshot.state !== 'ACTIVE' ||
    snapshot.executionPreconditionSatisfied !== true ||
    snapshot.requiresCurrentAuthorityValidation !== true ||
    snapshot.authoritySemantics !== 'DEVICE_SESSION_TRUST_IS_PRECONDITION_METADATA_ONLY' ||
    snapshot.authorizesExecution !== false ||
    snapshot.canGrantPermission !== false ||
    !nonNegativeInteger(snapshot.lastEvaluatedAtMs) ||
    snapshot.lastEvaluatedAtMs > input.nowMs ||
    !nonNegativeInteger(snapshot.gatewayAuthExpiresAtMs) ||
    snapshot.gatewayAuthExpiresAtMs <= input.nowMs ||
    !isPlainRecord(snapshotDeviceRef) ||
    snapshotDeviceRef.kind !== 'AURORA_DEVICE' ||
    snapshotDeviceRef.deviceId !== deviceRef.deviceId ||
    snapshotDeviceRef.tenantId !== deviceRef.tenantId ||
    snapshotDeviceRef.registrationVersion !== deviceRef.registrationVersion
  ) {
    return null;
  }

  return {
    tenantId: input.gatewaySession.tenantId,
    actorIdentityId: input.gatewaySession.actorIdentityId,
    correlationId: input.gatewaySession.correlationId,
    gatewaySessionId: input.gatewaySession.sessionId,
    connectionId: input.gatewaySession.connectionId,
    deviceSessionId,
    deviceId: String(deviceRef.deviceId),
    registrationVersion: Number(deviceRef.registrationVersion),
  };
}

function currentContext(
  input: GatewayDevicePlaneHandleInput,
  dependencies: GatewayVoiceDeviceRouteDependencies,
): VoiceCandidateSocketContext | null {
  if (!currentGatewayBinding(input)) return null;
  const deviceSessionId = input.connectionState.deviceSessionId;
  const deviceRef = currentDeviceRef(input);
  if (deviceSessionId === undefined || deviceRef === null) return null;

  let currentTrust: unknown;
  try {
    currentTrust = invokeCurrentTrust(
      dependencies.deviceSessions,
      deviceSessionId,
      input.gatewaySession.connectionId,
      input.nowMs,
    );
  } catch {
    return null;
  }
  return contextFromCurrentTrust(currentTrust, input, deviceSessionId, deviceRef);
}

/**
 * Narrow W15-G/W07 composition wrapper over the accepted W14 device-plane handler.
 *
 * Existing W14 routes are delegated unchanged. Voice-candidate and voice-projection routes derive
 * identity/device/session context only from current W14 server state. The projection route carries
 * catalog/capability eligibility only; it never mints W07 authority, verified outcome or retry.
 */
export class GatewayVoiceDevicePlaneNetworkHandler extends GatewayDevicePlaneNetworkHandler {
  readonly #voiceDependencies: GatewayVoiceDeviceRouteDependencies;

  constructor(
    devicePlaneDependencies: GatewayDevicePlaneDependencies,
    voiceDependencies: GatewayVoiceDeviceRouteDependencies,
  ) {
    super(devicePlaneDependencies);
    this.#voiceDependencies = voiceDependencies;
  }

  override isRoute(path: string): boolean {
    return (
      path === VOICE_CANDIDATE_DEVICE_ROUTE ||
      path === VOICE_PROJECTION_DEVICE_ROUTE ||
      super.isRoute(path)
    );
  }

  override async handle(input: GatewayDevicePlaneHandleInput): Promise<GatewayDevicePlaneResponse> {
    if (
      input.path !== VOICE_CANDIDATE_DEVICE_ROUTE &&
      input.path !== VOICE_PROJECTION_DEVICE_ROUTE
    ) {
      return super.handle(input);
    }

    const context = currentContext(input, this.#voiceDependencies);
    if (context === null) {
      return input.path === VOICE_PROJECTION_DEVICE_ROUTE
        ? projectionRouteError(409, 'AUTHENTICATED_CONTEXT_NOT_CURRENT')
        : voiceRouteError(409, 'AUTHENTICATED_CONTEXT_NOT_CURRENT');
    }

    if (input.path === VOICE_PROJECTION_DEVICE_ROUTE) {
      if (Object.keys(input.body).length !== 0) {
        return projectionRouteError(400, 'BODY_MALFORMED');
      }
      try {
        return this.#voiceDependencies.voiceProjection.current(context, input.nowMs);
      } catch {
        return projectionRouteError(503, 'VOICE_PROJECTION_UNAVAILABLE');
      }
    }

    try {
      return this.#voiceDependencies.voiceCandidates.evaluate(input.body, context);
    } catch {
      return voiceRouteError(503, 'W07_INGRESS_UNAVAILABLE');
    }
  }
}
