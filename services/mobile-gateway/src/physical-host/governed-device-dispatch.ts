import type { ActionIntent } from '@aurora/contracts/actions';
import type {
  CausationId,
  CommandId,
  CorrelationId,
  ExecutionId,
  IdentityId,
  TenantId,
} from '@aurora/contracts/ids';

import type { DeviceCommandDeliveryManager } from '../device-command-delivery/manager.js';
import type { DeviceSessionTrustManager } from '../device-session/session-trust.js';
import type { DeviceId, DeviceRef } from '../device/types.js';
import type { InMemoryDeviceRegistry } from '../device/registry.js';
import type { GatewaySessionManager } from '../gateway-auth/session-manager.js';
import type { GatewaySessionSnapshot } from '../gateway-auth/types.js';
import type { RealtimeCommandSessionManager } from '../realtime-session/manager.js';
import type {
  RealtimeCommandSessionSnapshot,
  RealtimeCommandSnapshot,
} from '../realtime-session/types.js';

const DEVICE_ID = /^dvc_[0-9A-HJKMNP-TV-Z]{26}$/u;
const COMMAND_ID = /^cmd_[0-9A-HJKMNP-TV-Z]{26}$/u;
const EXECUTION_ID = /^exe_[0-9A-HJKMNP-TV-Z]{26}$/u;
const CAUSATION_ID = /^cau_[0-9A-HJKMNP-TV-Z]{26}$/u;
const SAFE_TOKEN = /^[A-Za-z0-9._:/+-]+$/u;
const MAX_REFERENCE_LENGTH = 512;
const MAX_ORDERING_KEY_LENGTH = 128;
const MAX_DATE_MS = 8_640_000_000_000_000;

type GatewayReader = Pick<GatewaySessionManager, 'getSession'>;
type DeviceReader = Pick<InMemoryDeviceRegistry, 'resolve'>;
type DeviceTrustReader = Pick<DeviceSessionTrustManager, 'getSession'>;
type RealtimeCommands = Pick<
  RealtimeCommandSessionManager,
  'getSession' | 'openSession' | 'resumeSession' | 'submitCommand'
>;
type Deliveries = Pick<DeviceCommandDeliveryManager, 'prepare'>;

export interface LocalGovernedDeviceCommandMaterial {
  readonly commandId: CommandId;
  readonly executionId: ExecutionId;
  readonly causationId: CausationId;
  readonly orderingKey: string;
  readonly orderingSequence: number;
  readonly actionIntent: ActionIntent;
  readonly canonicalPayloadHash: string;
  readonly authorizesExecution: false;
}

export interface LocalAuthenticatedDeviceContext {
  readonly tenantId: string;
  readonly actorIdentityId: string;
  readonly correlationId: string;
  readonly gatewaySessionId: string;
  readonly connectionId: string;
  readonly deviceSessionId: string;
  readonly deviceId: string;
  readonly registrationVersion: number;
}

export interface LocalW14GovernedDeviceDispatchRequest {
  readonly command: LocalGovernedDeviceCommandMaterial;
  readonly context: LocalAuthenticatedDeviceContext;
  readonly dispatchedAtMs: number;
}

export type LocalW14GovernedDeviceDispatchResult =
  | Readonly<{
      ok: true;
      disposition: 'SUBMITTED' | 'ALREADY_SUBMITTED';
      commandReference: string;
      deliveryReference: string;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>
  | Readonly<{
      ok: false;
      code: string;
      retryable: boolean;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>;

export interface W14LocalGovernedDeviceDispatchDependencies {
  readonly gatewaySessions: GatewayReader;
  readonly devices: DeviceReader;
  readonly deviceSessions: DeviceTrustReader;
  readonly realtimeCommands: RealtimeCommands;
  readonly deliveries: Deliveries;
}

function safeToken(value: unknown, maximum = MAX_REFERENCE_LENGTH): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    SAFE_TOKEN.test(value)
  );
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function failure(code: string, retryable = false): LocalW14GovernedDeviceDispatchResult {
  return {
    ok: false,
    code,
    retryable,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

function currentGateway(
  gatewaySessions: GatewayReader,
  context: LocalAuthenticatedDeviceContext,
  nowMs: number,
): GatewaySessionSnapshot | null {
  const result = gatewaySessions.getSession(context.gatewaySessionId, nowMs);
  if (!result.ok) return null;
  const snapshot = result.value;
  return snapshot.state === 'OPEN' &&
    snapshot.authorizesExecution === false &&
    snapshot.sessionId === context.gatewaySessionId &&
    snapshot.connectionId === context.connectionId &&
    snapshot.tenantId === context.tenantId &&
    snapshot.actorIdentityId === context.actorIdentityId &&
    snapshot.correlationId === context.correlationId &&
    positiveInteger(snapshot.generation) &&
    nonNegativeInteger(snapshot.authIssuedAtMs) &&
    nonNegativeInteger(snapshot.authExpiresAtMs) &&
    snapshot.authIssuedAtMs <= nowMs &&
    nowMs < snapshot.authExpiresAtMs
    ? snapshot
    : null;
}

function contextDeviceRef(context: LocalAuthenticatedDeviceContext): DeviceRef | null {
  if (
    !DEVICE_ID.test(context.deviceId) ||
    !safeToken(context.tenantId, 128) ||
    !safeToken(context.actorIdentityId, 128) ||
    !safeToken(context.correlationId, 128) ||
    !safeToken(context.gatewaySessionId, 256) ||
    !safeToken(context.connectionId, 256) ||
    !safeToken(context.deviceSessionId, 256) ||
    !positiveInteger(context.registrationVersion)
  ) {
    return null;
  }
  return {
    kind: 'AURORA_DEVICE',
    deviceId: context.deviceId as DeviceId,
    tenantId: context.tenantId as TenantId,
    registrationVersion: context.registrationVersion,
  };
}

function realtimeSessionMatches(
  session: RealtimeCommandSessionSnapshot,
  gateway: GatewaySessionSnapshot,
  deviceRef: DeviceRef,
): boolean {
  return (
    session.state === 'OPEN' &&
    session.authorizesExecution === false &&
    session.canGrantPermission === false &&
    session.gatewaySessionId === gateway.sessionId &&
    session.gatewayConnectionId === gateway.connectionId &&
    session.gatewayGeneration === gateway.generation &&
    session.tenantId === gateway.tenantId &&
    session.actorIdentityId === gateway.actorIdentityId &&
    session.correlationId === gateway.correlationId &&
    session.deviceRef.deviceId === deviceRef.deviceId &&
    session.deviceRef.tenantId === deviceRef.tenantId &&
    session.deviceRef.registrationVersion === deviceRef.registrationVersion
  );
}

function immutableRealtimeBindingsMatch(
  session: RealtimeCommandSessionSnapshot,
  gateway: GatewaySessionSnapshot,
  deviceRef: DeviceRef,
): boolean {
  return (
    session.gatewaySessionId === gateway.sessionId &&
    session.tenantId === gateway.tenantId &&
    session.actorIdentityId === gateway.actorIdentityId &&
    session.correlationId === gateway.correlationId &&
    session.deviceRef.deviceId === deviceRef.deviceId &&
    session.deviceRef.tenantId === deviceRef.tenantId &&
    session.deviceRef.registrationVersion === deviceRef.registrationVersion
  );
}

function ensureRealtimeSession(
  realtime: RealtimeCommands,
  gateway: GatewaySessionSnapshot,
  deviceRef: DeviceRef,
  nowMs: number,
): RealtimeCommandSessionSnapshot | null {
  const existing = realtime.getSession(gateway.sessionId, nowMs);
  if (!existing.ok) {
    if (existing.error.code !== 'SESSION_NOT_FOUND') return null;
    const opened = realtime.openSession({ gatewaySessionId: gateway.sessionId, deviceRef, nowMs });
    return opened.ok && realtimeSessionMatches(opened.value, gateway, deviceRef)
      ? opened.value
      : null;
  }

  if (realtimeSessionMatches(existing.value, gateway, deviceRef)) return existing.value;
  if (
    !immutableRealtimeBindingsMatch(existing.value, gateway, deviceRef) ||
    gateway.generation <= existing.value.gatewayGeneration ||
    gateway.connectionId === existing.value.gatewayConnectionId
  ) {
    return null;
  }
  const resumed = realtime.resumeSession({
    gatewaySessionId: gateway.sessionId,
    deviceRef,
    nowMs,
    previousGatewayConnectionId: existing.value.gatewayConnectionId,
  });
  return resumed.ok && realtimeSessionMatches(resumed.value, gateway, deviceRef)
    ? resumed.value
    : null;
}

function currentTrustedDevice(
  dependencies: W14LocalGovernedDeviceDispatchDependencies,
  context: LocalAuthenticatedDeviceContext,
  gateway: GatewaySessionSnapshot,
  deviceRef: DeviceRef,
  nowMs: number,
) {
  const resolved = dependencies.devices.resolve({
    ref: deviceRef,
    boundIdentityId: context.actorIdentityId as IdentityId,
  });
  if (!resolved.ok || resolved.record.state !== 'ACTIVE') return null;

  const trust = dependencies.deviceSessions.getSession(
    context.deviceSessionId,
    context.connectionId,
    nowMs,
  );
  if (!trust.ok) return null;
  const snapshot = trust.snapshot;
  if (
    snapshot.kind !== 'DeviceSessionTrustSnapshot' ||
    snapshot.state !== 'ACTIVE' ||
    snapshot.executionPreconditionSatisfied !== true ||
    snapshot.requiresCurrentAuthorityValidation !== true ||
    snapshot.authorizesExecution !== false ||
    snapshot.canGrantPermission !== false ||
    snapshot.gatewaySessionId !== gateway.sessionId ||
    snapshot.connectionId !== gateway.connectionId ||
    snapshot.gatewayGeneration !== gateway.generation ||
    snapshot.tenantId !== gateway.tenantId ||
    snapshot.actorIdentityId !== gateway.actorIdentityId ||
    snapshot.correlationId !== gateway.correlationId ||
    snapshot.deviceSessionId !== context.deviceSessionId ||
    snapshot.deviceRef.deviceId !== deviceRef.deviceId ||
    snapshot.deviceRef.tenantId !== deviceRef.tenantId ||
    snapshot.deviceRef.registrationVersion !== deviceRef.registrationVersion ||
    snapshot.gatewayAuthExpiresAtMs <= nowMs ||
    snapshot.attestation.state !== 'VERIFIED' ||
    snapshot.attestation.expiresAtMs <= nowMs
  ) {
    return null;
  }
  return snapshot;
}

function commandDeadlineMs(actionIntent: ActionIntent): number | null {
  const value = actionIntent.deadlineAt;
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= MAX_DATE_MS ? parsed : null;
}

function validCommandMaterial(
  command: LocalGovernedDeviceCommandMaterial,
  context: LocalAuthenticatedDeviceContext,
): boolean {
  const target = command.actionIntent.executionTarget;
  return (
    command.authorizesExecution === false &&
    COMMAND_ID.test(command.commandId) &&
    EXECUTION_ID.test(command.executionId) &&
    CAUSATION_ID.test(command.causationId) &&
    safeToken(command.orderingKey, MAX_ORDERING_KEY_LENGTH) &&
    positiveInteger(command.orderingSequence) &&
    target?.kind === 'DEVICE' &&
    target.bindingReference === context.deviceId &&
    command.actionIntent.tenant.tenantId === context.tenantId &&
    command.actionIntent.actor.identityId === context.actorIdentityId &&
    command.actionIntent.correlation.correlationId === context.correlationId &&
    command.actionIntent.idempotency.mode === 'REQUIRED'
  );
}

function commandSnapshotValid(
  command: RealtimeCommandSnapshot,
  input: LocalW14GovernedDeviceDispatchRequest,
) {
  const target = input.command.actionIntent.executionTarget;
  return (
    target?.kind === 'DEVICE' &&
    command.authorizesExecution === false &&
    command.provesExecutionSuccess === false &&
    command.commandId === input.command.commandId &&
    command.executionId === input.command.executionId &&
    command.causationId === input.command.causationId &&
    command.correlationId === input.context.correlationId &&
    command.executionTarget.kind === 'DEVICE' &&
    command.executionTarget.bindingReference === target.bindingReference
  );
}

/**
 * W14 transport-side implementation for the W07 governed device-dispatch port.
 * It revalidates current gateway/device/trust bindings, opens or resumes only the server-owned
 * realtime session, submits the governed command, and prepares W14-F delivery through W03.
 * It does not evaluate or mint action authority and never decides verified outcome or retry.
 */
export class W14LocalGovernedDeviceDispatchPort {
  readonly #dependencies: W14LocalGovernedDeviceDispatchDependencies;

  constructor(dependencies: W14LocalGovernedDeviceDispatchDependencies) {
    this.#dependencies = dependencies;
  }

  dispatch(request: LocalW14GovernedDeviceDispatchRequest): LocalW14GovernedDeviceDispatchResult {
    const nowMs = request.dispatchedAtMs;
    if (!nonNegativeInteger(nowMs) || nowMs > MAX_DATE_MS) return failure('MALFORMED_TIME');
    if (!validCommandMaterial(request.command, request.context))
      return failure('MATERIAL_MISMATCH');

    const deviceRef = contextDeviceRef(request.context);
    if (deviceRef === null) return failure('CONTEXT_MALFORMED');
    const gateway = currentGateway(this.#dependencies.gatewaySessions, request.context, nowMs);
    if (gateway === null) return failure('GATEWAY_SESSION_NOT_CURRENT');
    const trust = currentTrustedDevice(
      this.#dependencies,
      request.context,
      gateway,
      deviceRef,
      nowMs,
    );
    if (trust === null) return failure('DEVICE_SESSION_NOT_CURRENT');

    const realtime = ensureRealtimeSession(
      this.#dependencies.realtimeCommands,
      gateway,
      deviceRef,
      nowMs,
    );
    if (realtime === null) return failure('REALTIME_SESSION_NOT_CURRENT');

    const deadlineMs = commandDeadlineMs(request.command.actionIntent);
    if (deadlineMs === null || deadlineMs <= nowMs || deadlineMs > gateway.authExpiresAtMs) {
      return failure('COMMAND_DEADLINE_INVALID');
    }
    const executionTarget = request.command.actionIntent.executionTarget;
    if (executionTarget?.kind !== 'DEVICE') return failure('TARGET_MISMATCH');

    const submitted = this.#dependencies.realtimeCommands.submitCommand({
      gatewaySessionId: gateway.sessionId,
      gatewayConnectionId: gateway.connectionId,
      commandId: request.command.commandId,
      executionId: request.command.executionId,
      executionTarget,
      correlationId: request.context.correlationId as CorrelationId,
      causationId: request.command.causationId,
      deadlineMs,
      nowMs,
    });
    if (!submitted.ok) {
      return failure(`REALTIME_${submitted.error.code}`, submitted.error.retryable);
    }
    if (!commandSnapshotValid(submitted.value.command, request)) {
      return failure('REALTIME_PROTOCOL_VIOLATION');
    }

    const prepared = this.#dependencies.deliveries.prepare({
      command: submitted.value.command,
      deviceSession: trust,
      idempotencyKey: `w14f:${request.command.commandId}`,
      orderingKey: request.command.orderingKey,
      orderingSequence: request.command.orderingSequence,
      nowMs,
    });
    if (!prepared.ok) {
      return failure(`DELIVERY_${prepared.error.code}`, prepared.error.retryable);
    }
    const delivery = prepared.value.delivery;
    if (
      delivery.authorizesExecution !== false ||
      delivery.provesExecutionSuccess !== false ||
      delivery.commandId !== request.command.commandId ||
      delivery.executionId !== request.command.executionId ||
      delivery.deviceSessionId !== request.context.deviceSessionId ||
      delivery.deviceId !== request.context.deviceId ||
      delivery.orderingKey !== request.command.orderingKey ||
      delivery.orderingSequence !== request.command.orderingSequence ||
      !safeToken(delivery.deliveryReference)
    ) {
      return failure('DELIVERY_PROTOCOL_VIOLATION');
    }

    return {
      ok: true,
      disposition:
        submitted.value.disposition === 'ALREADY_SUBMITTED' ? 'ALREADY_SUBMITTED' : 'SUBMITTED',
      commandReference: `w14:command:${request.command.commandId}`,
      deliveryReference: delivery.deliveryReference,
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    };
  }
}
