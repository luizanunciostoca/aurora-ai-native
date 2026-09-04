import type { DeviceExecutionTargetReference } from '@aurora/contracts/execution-target';
import type {
  CausationId,
  CommandId,
  CorrelationId,
  EventId,
  ExecutionId,
  IdentityId,
  TenantId,
} from '@aurora/contracts/ids';

import type { DeviceRef, DeviceResolutionError } from '../device/types.js';
import type { GatewaySessionSnapshot } from '../gateway-auth/types.js';
import {
  REMOTE_COMMAND_FRAME_STATES,
  type ApplyRealtimeCommandFrameDisposition,
  type ApplyRealtimeCommandFrameSuccess,
  type BoundRealtimeSessionInput,
  type DeviceRegistrationReader,
  type GatewaySessionReader,
  type OpenRealtimeCommandSessionInput,
  type RealtimeCommandFrameInput,
  type RealtimeCommandSessionConfig,
  type RealtimeCommandSessionSnapshot,
  type RealtimeCommandSnapshot,
  type RealtimeCommandState,
  type RealtimeSessionError,
  type RealtimeSessionErrorCode,
  type RealtimeSessionResult,
  type RequestRealtimeCancellationDisposition,
  type RequestRealtimeCancellationSuccess,
  type RequestRealtimeCommandCancellationInput,
  type ResumeRealtimeCommandSessionInput,
  type SubmitRealtimeCommandInput,
  type SubmitRealtimeCommandSuccess,
} from './types.js';

interface RememberedFrame {
  readonly frameId: EventId;
  readonly sequence: number;
  readonly state: RealtimeCommandFrameInput['state'];
}

interface CommandRecord {
  readonly commandId: CommandId;
  readonly executionId: ExecutionId;
  readonly executionTarget: DeviceExecutionTargetReference;
  readonly correlationId: CorrelationId;
  readonly causationId: CausationId;
  readonly deadlineMs: number;
  readonly submittedAtMs: number;
  readonly submittedGatewayGeneration: number;
  state: RealtimeCommandState;
  updatedAtMs: number;
  lastRemoteSequence: number;
  cancelRequestedAtMs?: number;
  terminalAtMs?: number;
  uncertainAtMs?: number;
  readonly frames: Map<EventId, RememberedFrame>;
}

interface SessionRecord {
  readonly gatewaySessionId: string;
  gatewayConnectionId: string;
  gatewayGeneration: number;
  state: 'OPEN' | 'CLOSED';
  readonly tenantId: TenantId;
  readonly actorIdentityId: IdentityId;
  readonly correlationId: CorrelationId;
  readonly deviceRef: DeviceRef;
  readonly openedAtMs: number;
  resumedAtMs?: number;
  closedAtMs?: number;
  readonly commands: Map<CommandId, CommandRecord>;
}

interface BoundSessionContext {
  readonly record: SessionRecord;
  readonly gateway: GatewaySessionSnapshot;
}

const DEFAULT_CONFIG: RealtimeCommandSessionConfig = {
  maxSessions: 256,
  maxOutstandingCommandsPerSession: 32,
  maxTrackedCommandsPerSession: 512,
  maxRememberedFramesPerCommand: 128,
  maxDeadlineHorizonMs: 5 * 60 * 1000,
};

const REMOTE_STATES = new Set<string>(REMOTE_COMMAND_FRAME_STATES);
const SAFE_TOKEN = /^[A-Za-z0-9._:-]+$/u;
const CONTRACT_VERSION = /^\d+\.\d+\.\d+$/u;
const COMMAND_ID = /^cmd_[0-9A-HJKMNP-TV-Z]{26}$/u;
const EXECUTION_ID = /^exe_[0-9A-HJKMNP-TV-Z]{26}$/u;
const CORRELATION_ID = /^cor_[0-9A-HJKMNP-TV-Z]{26}$/u;
const CAUSATION_ID = /^cau_[0-9A-HJKMNP-TV-Z]{26}$/u;
const EVENT_ID = /^evt_[0-9A-HJKMNP-TV-Z]{26}$/u;

const OPEN_KEYS = ['gatewaySessionId', 'deviceRef', 'nowMs'] as const;
const RESUME_KEYS = [
  'gatewaySessionId',
  'deviceRef',
  'nowMs',
  'previousGatewayConnectionId',
] as const;
const BOUND_KEYS = ['gatewaySessionId', 'gatewayConnectionId', 'nowMs'] as const;
const SUBMIT_KEYS = [
  ...BOUND_KEYS,
  'commandId',
  'executionId',
  'executionTarget',
  'correlationId',
  'causationId',
  'deadlineMs',
] as const;
const FRAME_KEYS = [...BOUND_KEYS, 'commandId', 'frameId', 'sequence', 'state'] as const;
const CANCEL_KEYS = [...BOUND_KEYS, 'commandId'] as const;
const DEVICE_REF_KEYS = ['kind', 'deviceId', 'tenantId', 'registrationVersion'] as const;
const TARGET_KEYS = ['schemaVersion', 'kind', 'bindingReference'] as const;

function failure(
  code: RealtimeSessionErrorCode,
  message: string,
  retryable = false,
): RealtimeSessionError {
  return { ok: false, error: { code, message, retryable }, authorizesExecution: false };
}

function success<T>(value: T): RealtimeSessionResult<T> {
  return { ok: true, value, authorizesExecution: false };
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

function hasAllKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => Object.hasOwn(record, key));
}

function isFiniteNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isSafeToken(value: unknown, maxLength = 256): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    SAFE_TOKEN.test(value)
  );
}

function parseCanonical<T extends string>(value: unknown, pattern: RegExp): T | null {
  return typeof value === 'string' && pattern.test(value) ? (value as T) : null;
}

function parseDeviceRef(value: unknown): DeviceRef | null {
  if (
    !isPlainDataRecord(value) ||
    !hasOnlyKeys(value, DEVICE_REF_KEYS) ||
    !hasAllKeys(value, DEVICE_REF_KEYS) ||
    value.kind !== 'AURORA_DEVICE' ||
    !isSafeToken(value.deviceId) ||
    !isSafeToken(value.tenantId) ||
    !isPositiveInteger(value.registrationVersion)
  ) {
    return null;
  }
  return Object.freeze({
    kind: 'AURORA_DEVICE' as const,
    deviceId: value.deviceId as DeviceRef['deviceId'],
    tenantId: value.tenantId as TenantId,
    registrationVersion: value.registrationVersion,
  });
}

function parseExecutionTarget(value: unknown): DeviceExecutionTargetReference | null {
  if (
    !isPlainDataRecord(value) ||
    !hasOnlyKeys(value, TARGET_KEYS) ||
    !hasAllKeys(value, TARGET_KEYS) ||
    value.kind !== 'DEVICE' ||
    typeof value.schemaVersion !== 'string' ||
    !CONTRACT_VERSION.test(value.schemaVersion) ||
    !isSafeToken(value.bindingReference)
  ) {
    return null;
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion as DeviceExecutionTargetReference['schemaVersion'],
    kind: 'DEVICE' as const,
    bindingReference: value.bindingReference,
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

function isTerminal(state: RealtimeCommandState): boolean {
  return state === 'CANCELLED' || state === 'COMPLETED' || state === 'FAILED';
}

function redeliveryDisposition(
  state: RealtimeCommandState,
): RealtimeCommandSnapshot['redeliveryDisposition'] {
  if (state === 'UNCERTAIN') return 'BLOCK_UNCERTAIN';
  if (isTerminal(state)) return 'TERMINAL_NO_REDELIVERY';
  return 'NOT_DECIDED_BY_W14_B';
}

function commandSnapshot(record: CommandRecord): RealtimeCommandSnapshot {
  const snapshot = {
    commandId: record.commandId,
    executionId: record.executionId,
    executionTarget: record.executionTarget,
    correlationId: record.correlationId,
    causationId: record.causationId,
    state: record.state,
    deadlineMs: record.deadlineMs,
    submittedAtMs: record.submittedAtMs,
    updatedAtMs: record.updatedAtMs,
    submittedGatewayGeneration: record.submittedGatewayGeneration,
    lastRemoteSequence: record.lastRemoteSequence,
    redeliveryDisposition: redeliveryDisposition(record.state),
    authoritySemantics: 'TRANSPORT_SESSION_ONLY_NO_ACTION_AUTHORITY' as const,
    authorizesExecution: false as const,
    provesExecutionSuccess: false as const,
    externalStateVerified: false as const,
    ...(record.cancelRequestedAtMs === undefined
      ? {}
      : { cancelRequestedAtMs: record.cancelRequestedAtMs }),
    ...(record.terminalAtMs === undefined ? {} : { terminalAtMs: record.terminalAtMs }),
    ...(record.uncertainAtMs === undefined ? {} : { uncertainAtMs: record.uncertainAtMs }),
  };
  return Object.freeze(snapshot);
}

function sessionSnapshot(record: SessionRecord): RealtimeCommandSessionSnapshot {
  const outstandingCommands = [...record.commands.values()].filter(
    (command) => !isTerminal(command.state),
  ).length;
  const snapshot = {
    gatewaySessionId: record.gatewaySessionId,
    gatewayConnectionId: record.gatewayConnectionId,
    gatewayGeneration: record.gatewayGeneration,
    state: record.state,
    tenantId: record.tenantId,
    actorIdentityId: record.actorIdentityId,
    correlationId: record.correlationId,
    deviceRef: record.deviceRef,
    openedAtMs: record.openedAtMs,
    outstandingCommands,
    authorizesExecution: false as const,
    canGrantPermission: false as const,
    ...(record.resumedAtMs === undefined ? {} : { resumedAtMs: record.resumedAtMs }),
    ...(record.closedAtMs === undefined ? {} : { closedAtMs: record.closedAtMs }),
  };
  return Object.freeze(snapshot);
}

function mapDeviceFailure(error: DeviceResolutionError): RealtimeSessionError {
  switch (error) {
    case 'REQUEST_MALFORMED':
    case 'DEVICE_REF_INVALID':
      return failure('MALFORMED_REQUEST', 'Device reference is malformed.');
    case 'CROSS_TENANT':
    case 'IDENTITY_BINDING_REQUIRED':
    case 'IDENTITY_BINDING_MISMATCH':
      return failure('DEVICE_BINDING_MISMATCH', 'Device does not match the gateway binding.');
    case 'DEVICE_NOT_FOUND':
    case 'STALE_VERSION':
    case 'DEVICE_NOT_ACTIVE':
    case 'DEVICE_REVOKED':
    case 'DEVICE_COMPROMISED':
    case 'DEVICE_RETIRED':
      return failure('DEVICE_NOT_ACTIVE', 'Device is not currently resolvable as active.');
  }
}

function isAllowedTransition(current: RealtimeCommandState, next: RealtimeCommandState): boolean {
  if (current === next) return !isTerminal(current);
  switch (current) {
    case 'SUBMITTED':
      return next === 'ACCEPTED' || next === 'FAILED' || next === 'UNCERTAIN';
    case 'ACCEPTED':
      return (
        next === 'RUNNING' ||
        next === 'WAITING' ||
        next === 'COMPLETED' ||
        next === 'FAILED' ||
        next === 'UNCERTAIN'
      );
    case 'RUNNING':
      return (
        next === 'WAITING' || next === 'COMPLETED' || next === 'FAILED' || next === 'UNCERTAIN'
      );
    case 'WAITING':
      return (
        next === 'RUNNING' || next === 'COMPLETED' || next === 'FAILED' || next === 'UNCERTAIN'
      );
    case 'CANCEL_REQUESTED':
      return (
        next === 'CANCELLED' || next === 'COMPLETED' || next === 'FAILED' || next === 'UNCERTAIN'
      );
    case 'UNCERTAIN':
    case 'CANCELLED':
    case 'COMPLETED':
    case 'FAILED':
      return false;
  }
}

function shouldPreserveCancellation(
  current: RealtimeCommandState,
  next: RealtimeCommandState,
): boolean {
  return (
    current === 'CANCEL_REQUESTED' &&
    (next === 'ACCEPTED' || next === 'RUNNING' || next === 'WAITING')
  );
}

export class RealtimeCommandSessionManager {
  readonly #gatewaySessions: GatewaySessionReader;
  readonly #devices: DeviceRegistrationReader;
  readonly #config: RealtimeCommandSessionConfig;
  readonly #sessions = new Map<string, SessionRecord>();

  constructor(
    gatewaySessions: GatewaySessionReader,
    devices: DeviceRegistrationReader,
    config: Partial<RealtimeCommandSessionConfig> = {},
  ) {
    this.#gatewaySessions = gatewaySessions;
    this.#devices = devices;
    this.#config = { ...DEFAULT_CONFIG, ...config };
    if (
      this.#config.maxSessions <= 0 ||
      this.#config.maxOutstandingCommandsPerSession <= 0 ||
      this.#config.maxTrackedCommandsPerSession < this.#config.maxOutstandingCommandsPerSession ||
      this.#config.maxRememberedFramesPerCommand <= 0 ||
      this.#config.maxDeadlineHorizonMs <= 0
    ) {
      throw new Error(
        'Realtime command session limits must be positive and internally consistent.',
      );
    }
  }

  openSession(input: unknown): RealtimeSessionResult<RealtimeCommandSessionSnapshot> {
    const parsed = this.#parseOpenInput(input, false);
    if (!parsed.ok) return parsed;
    if (this.#sessions.has(parsed.value.gatewaySessionId)) {
      return failure('SESSION_CONFLICT', 'Realtime session already exists; use explicit resume.');
    }
    const bindings = this.#resolveBindings(
      parsed.value.gatewaySessionId,
      parsed.value.deviceRef,
      parsed.value.nowMs,
    );
    if (!bindings.ok) return bindings;
    const capacity = this.#prepareSessionSlot();
    if (!capacity.ok) return capacity;
    const gateway = bindings.value.gateway;
    const record: SessionRecord = {
      gatewaySessionId: gateway.sessionId,
      gatewayConnectionId: gateway.connectionId,
      gatewayGeneration: gateway.generation,
      state: 'OPEN',
      tenantId: gateway.tenantId,
      actorIdentityId: gateway.actorIdentityId,
      correlationId: gateway.correlationId,
      deviceRef: bindings.value.deviceRef,
      openedAtMs: parsed.value.nowMs,
      commands: new Map(),
    };
    this.#sessions.set(record.gatewaySessionId, record);
    return success(sessionSnapshot(record));
  }

  resumeSession(input: unknown): RealtimeSessionResult<RealtimeCommandSessionSnapshot> {
    const parsed = this.#parseOpenInput(input, true);
    if (!parsed.ok) return parsed;
    const existing = this.#sessions.get(parsed.value.gatewaySessionId);
    if (existing === undefined)
      return failure('SESSION_NOT_FOUND', 'Realtime session does not exist.');
    if (parsed.value.previousGatewayConnectionId !== existing.gatewayConnectionId) {
      return failure(
        'GATEWAY_CONNECTION_MISMATCH',
        'Resume does not reference the previously bound gateway connection.',
      );
    }
    if (!sameDeviceRef(parsed.value.deviceRef, existing.deviceRef)) {
      return failure('DEVICE_BINDING_MISMATCH', 'Resume cannot change the bound device reference.');
    }
    const bindings = this.#resolveBindings(
      parsed.value.gatewaySessionId,
      parsed.value.deviceRef,
      parsed.value.nowMs,
    );
    if (!bindings.ok) return bindings;
    const gateway = bindings.value.gateway;
    if (gateway.generation <= existing.gatewayGeneration) {
      return failure('SESSION_RESUME_STALE', 'Gateway generation did not advance for resume.');
    }
    if (
      gateway.tenantId !== existing.tenantId ||
      gateway.actorIdentityId !== existing.actorIdentityId ||
      gateway.correlationId !== existing.correlationId
    ) {
      return failure(
        'GATEWAY_BINDING_MISMATCH',
        'Resume cannot change tenant, actor or correlation.',
      );
    }
    existing.gatewayConnectionId = gateway.connectionId;
    existing.gatewayGeneration = gateway.generation;
    existing.state = 'OPEN';
    existing.resumedAtMs = parsed.value.nowMs;
    delete existing.closedAtMs;
    return success(sessionSnapshot(existing));
  }

  submitCommand(input: unknown): RealtimeSessionResult<SubmitRealtimeCommandSuccess> {
    const parsed = this.#parseSubmitInput(input);
    if (!parsed.ok) return parsed;
    const bound = this.#requireBoundSession(parsed.value);
    if (!bound.ok) return bound;
    const { record } = bound.value;
    if (parsed.value.correlationId !== record.correlationId) {
      return failure('CORRELATION_MISMATCH', 'Command correlation must match the gateway session.');
    }
    if (parsed.value.executionTarget.bindingReference !== record.deviceRef.deviceId) {
      return failure(
        'TARGET_MISMATCH',
        'Execution target does not reference the bound canonical device.',
      );
    }
    if (parsed.value.deadlineMs <= parsed.value.nowMs) {
      return failure('DEADLINE_EXCEEDED', 'Command deadline has already expired.');
    }
    if (parsed.value.deadlineMs - parsed.value.nowMs > this.#config.maxDeadlineHorizonMs) {
      return failure(
        'DEADLINE_OUT_OF_RANGE',
        'Command deadline exceeds the bounded session horizon.',
      );
    }
    if (parsed.value.deadlineMs > bound.value.gateway.authExpiresAtMs) {
      return failure(
        'DEADLINE_OUT_OF_RANGE',
        'Command deadline cannot outlive the authenticated gateway session.',
      );
    }

    const existing = record.commands.get(parsed.value.commandId);
    if (existing !== undefined) {
      if (
        existing.executionId === parsed.value.executionId &&
        existing.executionTarget.schemaVersion === parsed.value.executionTarget.schemaVersion &&
        existing.executionTarget.kind === parsed.value.executionTarget.kind &&
        existing.executionTarget.bindingReference ===
          parsed.value.executionTarget.bindingReference &&
        existing.correlationId === parsed.value.correlationId &&
        existing.causationId === parsed.value.causationId &&
        existing.deadlineMs === parsed.value.deadlineMs
      ) {
        return success({
          disposition: 'ALREADY_SUBMITTED',
          session: sessionSnapshot(record),
          command: commandSnapshot(existing),
        });
      }
      return failure('COMMAND_CONFLICT', 'Command identifier is already bound to different data.');
    }

    const outstanding = [...record.commands.values()].filter(
      (command) => !isTerminal(command.state),
    ).length;
    if (outstanding >= this.#config.maxOutstandingCommandsPerSession) {
      return failure('BACKPRESSURE', 'Realtime session has too many outstanding commands.', true);
    }
    const capacity = this.#prepareCommandSlot(record);
    if (!capacity.ok) return capacity;

    const command: CommandRecord = {
      commandId: parsed.value.commandId,
      executionId: parsed.value.executionId,
      executionTarget: parsed.value.executionTarget,
      correlationId: parsed.value.correlationId,
      causationId: parsed.value.causationId,
      deadlineMs: parsed.value.deadlineMs,
      submittedAtMs: parsed.value.nowMs,
      submittedGatewayGeneration: record.gatewayGeneration,
      state: 'SUBMITTED',
      updatedAtMs: parsed.value.nowMs,
      lastRemoteSequence: 0,
      frames: new Map(),
    };
    record.commands.set(command.commandId, command);
    return success({
      disposition: 'SUBMITTED',
      session: sessionSnapshot(record),
      command: commandSnapshot(command),
    });
  }

  applyRemoteFrame(input: unknown): RealtimeSessionResult<ApplyRealtimeCommandFrameSuccess> {
    const parsed = this.#parseFrameInput(input);
    if (!parsed.ok) return parsed;
    const bound = this.#requireBoundSession(parsed.value);
    if (!bound.ok) return bound;
    const command = bound.value.record.commands.get(parsed.value.commandId);
    if (command === undefined) return failure('COMMAND_NOT_FOUND', 'Command does not exist.');
    if (parsed.value.nowMs > command.deadlineMs && !isTerminal(command.state)) {
      return failure('DEADLINE_EXCEEDED', 'Command deadline elapsed before this frame.');
    }

    const remembered = command.frames.get(parsed.value.frameId);
    if (remembered !== undefined) {
      if (
        remembered.sequence === parsed.value.sequence &&
        remembered.state === parsed.value.state
      ) {
        return success({ disposition: 'DUPLICATE_FRAME', command: commandSnapshot(command) });
      }
      return failure('FRAME_CONFLICT', 'Frame identifier was reused with conflicting contents.');
    }
    if (parsed.value.sequence !== command.lastRemoteSequence + 1) {
      return failure(
        'FRAME_OUT_OF_ORDER',
        'Remote frame sequence must be contiguous; replay/resume must fill gaps first.',
        true,
      );
    }

    let disposition: ApplyRealtimeCommandFrameDisposition = 'APPLIED';
    if (shouldPreserveCancellation(command.state, parsed.value.state)) {
      disposition = 'CANCELLATION_PRESERVED';
    } else if (!isAllowedTransition(command.state, parsed.value.state)) {
      return failure(
        'INVALID_TRANSITION',
        `Remote state ${parsed.value.state} is invalid from ${command.state}.`,
      );
    } else {
      command.state = parsed.value.state;
      if (isTerminal(command.state)) command.terminalAtMs = parsed.value.nowMs;
      if (command.state === 'UNCERTAIN') command.uncertainAtMs = parsed.value.nowMs;
    }

    command.lastRemoteSequence = parsed.value.sequence;
    command.updatedAtMs = parsed.value.nowMs;
    command.frames.set(parsed.value.frameId, {
      frameId: parsed.value.frameId,
      sequence: parsed.value.sequence,
      state: parsed.value.state,
    });
    this.#trimFrameHistory(command);
    return success({ disposition, command: commandSnapshot(command) });
  }

  requestCancellation(input: unknown): RealtimeSessionResult<RequestRealtimeCancellationSuccess> {
    const parsed = this.#parseCancellationInput(input);
    if (!parsed.ok) return parsed;
    const bound = this.#requireBoundSession(parsed.value);
    if (!bound.ok) return bound;
    const command = bound.value.record.commands.get(parsed.value.commandId);
    if (command === undefined) return failure('COMMAND_NOT_FOUND', 'Command does not exist.');

    let disposition: RequestRealtimeCancellationDisposition;
    if (command.state === 'CANCEL_REQUESTED') {
      disposition = 'ALREADY_REQUESTED';
    } else if (isTerminal(command.state) || command.state === 'UNCERTAIN') {
      disposition = 'NOOP_TERMINAL_OR_UNCERTAIN';
    } else {
      command.state = 'CANCEL_REQUESTED';
      command.cancelRequestedAtMs = parsed.value.nowMs;
      command.updatedAtMs = parsed.value.nowMs;
      disposition = 'CANCEL_REQUESTED';
    }
    return success({ disposition, command: commandSnapshot(command) });
  }

  getSession(
    gatewaySessionId: unknown,
    nowMs: unknown,
  ): RealtimeSessionResult<RealtimeCommandSessionSnapshot> {
    if (!isSafeToken(gatewaySessionId) || !isFiniteNonNegativeInteger(nowMs)) {
      return failure('MALFORMED_REQUEST', 'Realtime session lookup is malformed.');
    }
    const record = this.#sessions.get(gatewaySessionId);
    if (record === undefined)
      return failure('SESSION_NOT_FOUND', 'Realtime session does not exist.');
    const live = this.#gatewaySessions.getSession(gatewaySessionId, nowMs);
    if (!live.ok || live.value.state !== 'OPEN') {
      this.#closeRecord(record, nowMs);
    }
    return success(sessionSnapshot(record));
  }

  getCommand(
    gatewaySessionId: unknown,
    gatewayConnectionId: unknown,
    commandId: unknown,
    nowMs: unknown,
  ): RealtimeSessionResult<RealtimeCommandSnapshot> {
    const bound = this.#parseBoundInput({ gatewaySessionId, gatewayConnectionId, nowMs });
    if (!bound.ok) return bound;
    const parsedCommandId = parseCanonical<CommandId>(commandId, COMMAND_ID);
    if (parsedCommandId === null) {
      return failure('MALFORMED_REQUEST', 'Command identifier is malformed.');
    }
    const current = this.#requireBoundSession(bound.value);
    if (!current.ok) return current;
    const command = current.value.record.commands.get(parsedCommandId);
    if (command === undefined) return failure('COMMAND_NOT_FOUND', 'Command does not exist.');
    return success(commandSnapshot(command));
  }

  #parseOpenInput(
    input: unknown,
    resume: false,
  ): RealtimeSessionResult<OpenRealtimeCommandSessionInput>;
  #parseOpenInput(
    input: unknown,
    resume: true,
  ): RealtimeSessionResult<ResumeRealtimeCommandSessionInput>;
  #parseOpenInput(
    input: unknown,
    resume: boolean,
  ): RealtimeSessionResult<OpenRealtimeCommandSessionInput | ResumeRealtimeCommandSessionInput> {
    const keys = resume ? RESUME_KEYS : OPEN_KEYS;
    if (!isPlainDataRecord(input) || !hasOnlyKeys(input, keys) || !hasAllKeys(input, keys)) {
      return failure('MALFORMED_REQUEST', 'Realtime session request shape is invalid.');
    }
    if (!isSafeToken(input.gatewaySessionId) || !isFiniteNonNegativeInteger(input.nowMs)) {
      return failure('MALFORMED_REQUEST', 'Realtime session identifiers or timing are invalid.');
    }
    const deviceRef = parseDeviceRef(input.deviceRef);
    if (deviceRef === null) return failure('MALFORMED_REQUEST', 'Device reference is malformed.');
    if (resume) {
      if (!isSafeToken(input.previousGatewayConnectionId)) {
        return failure('MALFORMED_REQUEST', 'Previous gateway connection is malformed.');
      }
      return success({
        gatewaySessionId: input.gatewaySessionId,
        deviceRef,
        nowMs: input.nowMs,
        previousGatewayConnectionId: input.previousGatewayConnectionId,
      });
    }
    return success({ gatewaySessionId: input.gatewaySessionId, deviceRef, nowMs: input.nowMs });
  }

  #parseBoundInput(input: unknown): RealtimeSessionResult<BoundRealtimeSessionInput> {
    if (
      !isPlainDataRecord(input) ||
      !hasOnlyKeys(input, BOUND_KEYS) ||
      !hasAllKeys(input, BOUND_KEYS) ||
      !isSafeToken(input.gatewaySessionId) ||
      !isSafeToken(input.gatewayConnectionId) ||
      !isFiniteNonNegativeInteger(input.nowMs)
    ) {
      return failure('MALFORMED_REQUEST', 'Bound realtime session context is malformed.');
    }
    return success({
      gatewaySessionId: input.gatewaySessionId,
      gatewayConnectionId: input.gatewayConnectionId,
      nowMs: input.nowMs,
    });
  }

  #parseSubmitInput(input: unknown): RealtimeSessionResult<SubmitRealtimeCommandInput> {
    if (
      !isPlainDataRecord(input) ||
      !hasOnlyKeys(input, SUBMIT_KEYS) ||
      !hasAllKeys(input, SUBMIT_KEYS)
    ) {
      return failure('MALFORMED_REQUEST', 'Command submission shape is invalid.');
    }
    const bound = this.#parseBoundInput({
      gatewaySessionId: input.gatewaySessionId,
      gatewayConnectionId: input.gatewayConnectionId,
      nowMs: input.nowMs,
    });
    if (!bound.ok) return bound;
    const commandId = parseCanonical<CommandId>(input.commandId, COMMAND_ID);
    const executionId = parseCanonical<ExecutionId>(input.executionId, EXECUTION_ID);
    const correlationId = parseCanonical<CorrelationId>(input.correlationId, CORRELATION_ID);
    const causationId = parseCanonical<CausationId>(input.causationId, CAUSATION_ID);
    const executionTarget = parseExecutionTarget(input.executionTarget);
    if (
      commandId === null ||
      executionId === null ||
      correlationId === null ||
      causationId === null ||
      executionTarget === null ||
      !isFiniteNonNegativeInteger(input.deadlineMs)
    ) {
      return failure('MALFORMED_REQUEST', 'Command identifiers, target or deadline are malformed.');
    }
    return success({
      ...bound.value,
      commandId,
      executionId,
      executionTarget,
      correlationId,
      causationId,
      deadlineMs: input.deadlineMs,
    });
  }

  #parseFrameInput(input: unknown): RealtimeSessionResult<RealtimeCommandFrameInput> {
    if (
      !isPlainDataRecord(input) ||
      !hasOnlyKeys(input, FRAME_KEYS) ||
      !hasAllKeys(input, FRAME_KEYS)
    ) {
      return failure('MALFORMED_REQUEST', 'Remote frame shape is invalid.');
    }
    const bound = this.#parseBoundInput({
      gatewaySessionId: input.gatewaySessionId,
      gatewayConnectionId: input.gatewayConnectionId,
      nowMs: input.nowMs,
    });
    if (!bound.ok) return bound;
    const commandId = parseCanonical<CommandId>(input.commandId, COMMAND_ID);
    const frameId = parseCanonical<EventId>(input.frameId, EVENT_ID);
    if (
      commandId === null ||
      frameId === null ||
      !isPositiveInteger(input.sequence) ||
      typeof input.state !== 'string' ||
      !REMOTE_STATES.has(input.state)
    ) {
      return failure(
        'MALFORMED_REQUEST',
        'Remote frame identifiers, sequence or state are invalid.',
      );
    }
    return success({
      ...bound.value,
      commandId,
      frameId,
      sequence: input.sequence,
      state: input.state as RealtimeCommandFrameInput['state'],
    });
  }

  #parseCancellationInput(
    input: unknown,
  ): RealtimeSessionResult<RequestRealtimeCommandCancellationInput> {
    if (
      !isPlainDataRecord(input) ||
      !hasOnlyKeys(input, CANCEL_KEYS) ||
      !hasAllKeys(input, CANCEL_KEYS)
    ) {
      return failure('MALFORMED_REQUEST', 'Cancellation request shape is invalid.');
    }
    const bound = this.#parseBoundInput({
      gatewaySessionId: input.gatewaySessionId,
      gatewayConnectionId: input.gatewayConnectionId,
      nowMs: input.nowMs,
    });
    if (!bound.ok) return bound;
    const commandId = parseCanonical<CommandId>(input.commandId, COMMAND_ID);
    if (commandId === null) return failure('MALFORMED_REQUEST', 'Command identifier is malformed.');
    return success({ ...bound.value, commandId });
  }

  #resolveBindings(
    gatewaySessionId: string,
    deviceRef: DeviceRef,
    nowMs: number,
  ): RealtimeSessionResult<{ gateway: GatewaySessionSnapshot; deviceRef: DeviceRef }> {
    const gatewayResult = this.#gatewaySessions.getSession(gatewaySessionId, nowMs);
    if (!gatewayResult.ok) {
      return failure(
        'GATEWAY_SESSION_INVALID',
        `Gateway session is unavailable: ${gatewayResult.error.code}.`,
        gatewayResult.error.retryable,
      );
    }
    const gateway = gatewayResult.value;
    if (
      gateway.state !== 'OPEN' ||
      gateway.sessionId !== gatewaySessionId ||
      gateway.authorizesExecution !== false ||
      gateway.generation <= 0 ||
      nowMs >= gateway.authExpiresAtMs ||
      parseCanonical<TenantId>(gateway.tenantId, /^ten_[0-9A-HJKMNP-TV-Z]{26}$/u) === null ||
      parseCanonical<IdentityId>(gateway.actorIdentityId, /^idn_[0-9A-HJKMNP-TV-Z]{26}$/u) ===
        null ||
      parseCanonical<CorrelationId>(gateway.correlationId, CORRELATION_ID) === null
    ) {
      return failure(
        'GATEWAY_SESSION_INVALID',
        'Gateway session is not a valid live W14-A binding.',
      );
    }

    const deviceResult = this.#devices.resolve({
      ref: deviceRef,
      boundIdentityId: gateway.actorIdentityId,
    });
    if (!deviceResult.ok) return mapDeviceFailure(deviceResult.error);
    if (
      deviceResult.authorizesExecution !== false ||
      deviceResult.canGrantPermission !== false ||
      deviceResult.record.state !== 'ACTIVE' ||
      !sameDeviceRef(deviceResult.record.ref, deviceRef) ||
      deviceResult.record.ref.tenantId !== gateway.tenantId
    ) {
      return failure(
        'DEVICE_BINDING_MISMATCH',
        'Resolved device does not match the gateway binding.',
      );
    }
    return success({ gateway, deviceRef: deviceResult.record.ref });
  }

  #requireBoundSession(
    input: BoundRealtimeSessionInput,
  ): RealtimeSessionResult<BoundSessionContext> {
    const record = this.#sessions.get(input.gatewaySessionId);
    if (record === undefined)
      return failure('SESSION_NOT_FOUND', 'Realtime session does not exist.');
    if (record.state !== 'OPEN') return failure('SESSION_CLOSED', 'Realtime session is closed.');

    const gatewayResult = this.#gatewaySessions.getSession(input.gatewaySessionId, input.nowMs);
    if (!gatewayResult.ok || gatewayResult.value.state !== 'OPEN') {
      this.#closeRecord(record, input.nowMs);
      return failure('GATEWAY_SESSION_INVALID', 'Bound gateway session is no longer live.');
    }
    const gateway = gatewayResult.value;
    if (
      gateway.connectionId !== input.gatewayConnectionId ||
      gateway.connectionId !== record.gatewayConnectionId ||
      gateway.generation !== record.gatewayGeneration
    ) {
      return failure(
        'GATEWAY_CONNECTION_MISMATCH',
        'Gateway connection changed; explicit realtime session resume is required.',
      );
    }
    if (
      gateway.tenantId !== record.tenantId ||
      gateway.actorIdentityId !== record.actorIdentityId ||
      gateway.correlationId !== record.correlationId ||
      gateway.authorizesExecution !== false
    ) {
      this.#closeRecord(record, input.nowMs);
      return failure(
        'GATEWAY_BINDING_MISMATCH',
        'Gateway tenant, actor or correlation binding changed.',
      );
    }

    const deviceResult = this.#devices.resolve({
      ref: record.deviceRef,
      boundIdentityId: record.actorIdentityId,
    });
    if (!deviceResult.ok || deviceResult.record.state !== 'ACTIVE') {
      this.#closeRecord(record, input.nowMs);
      return failure('DEVICE_NOT_ACTIVE', 'Bound device is no longer active.');
    }
    return success({ record, gateway });
  }

  #prepareSessionSlot(): RealtimeSessionResult<true> {
    if (this.#sessions.size < this.#config.maxSessions) return success(true);
    const oldestClosed = [...this.#sessions.values()]
      .filter((session) => session.state === 'CLOSED')
      .sort(
        (left, right) =>
          (left.closedAtMs ?? Number.MAX_SAFE_INTEGER) -
          (right.closedAtMs ?? Number.MAX_SAFE_INTEGER),
      )[0];
    if (oldestClosed === undefined) {
      return failure('BACKPRESSURE', 'Realtime session capacity is exhausted.', true);
    }
    this.#sessions.delete(oldestClosed.gatewaySessionId);
    return success(true);
  }

  #prepareCommandSlot(session: SessionRecord): RealtimeSessionResult<true> {
    if (session.commands.size < this.#config.maxTrackedCommandsPerSession) return success(true);
    const oldestTerminal = [...session.commands.values()]
      .filter((command) => isTerminal(command.state))
      .sort(
        (left, right) =>
          (left.terminalAtMs ?? Number.MAX_SAFE_INTEGER) -
          (right.terminalAtMs ?? Number.MAX_SAFE_INTEGER),
      )[0];
    if (oldestTerminal === undefined) {
      return failure('BACKPRESSURE', 'Command tracking capacity is exhausted.', true);
    }
    session.commands.delete(oldestTerminal.commandId);
    return success(true);
  }

  #trimFrameHistory(command: CommandRecord): void {
    if (command.frames.size <= this.#config.maxRememberedFramesPerCommand) return;
    const oldest = [...command.frames.values()].sort(
      (left, right) => left.sequence - right.sequence,
    )[0];
    if (oldest !== undefined) command.frames.delete(oldest.frameId);
  }

  #closeRecord(record: SessionRecord, nowMs: number): void {
    if (record.state === 'CLOSED') return;
    record.state = 'CLOSED';
    record.closedAtMs = nowMs;
  }
}
