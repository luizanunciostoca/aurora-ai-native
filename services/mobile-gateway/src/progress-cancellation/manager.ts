import type { CommandId, CorrelationId, EventId, TenantId } from '@aurora/contracts/ids';

import {
  PROGRESS_SCOPES,
  PROGRESS_SOURCES,
  PROGRESS_STATES,
  type ProgressCancellationPort,
  type ProgressCancellationProjection,
  type ProgressCancellationPortSuccess,
  type ProgressCancellationSessionView,
  type ProgressFrame,
  type ProgressObservationInput,
  type ProgressObservationVerifier,
  type ProgressProjectionConfig,
  type ProgressProjectionError,
  type ProgressProjectionErrorCode,
  type ProgressProjectionResult,
  type ProgressScope,
  type ProgressSource,
  type ProgressState,
  type ProgressStreamSnapshot,
  type RecordProgressSuccess,
  type ReplayProgressInput,
  type ReplayProgressSuccess,
  type RequestProgressCancellationInput,
} from './types.js';

interface RememberedObservation {
  readonly fingerprint: string;
  readonly frame: ProgressFrame;
}

interface StreamRecord {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly scope: ProgressScope;
  readonly subjectId: string;
  latestSequence: number;
  latestFrame: ProgressFrame;
  readonly history: ProgressFrame[];
  readonly observations: Map<EventId, RememberedObservation>;
}

interface CancellationRecord {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly commandId: CommandId;
  readonly requestedAtMs: number;
}

const DEFAULT_CONFIG: ProgressProjectionConfig = {
  maxStreams: 256,
  maxHistoryPerStream: 128,
  maxRememberedObservationsPerStream: 512,
  maxEvidenceRefs: 16,
  maxReplayItems: 100,
  maxObservationAgeMs: 5 * 60 * 1000,
};

const TENANT_ID = /^ten_[0-9A-HJKMNP-TV-Z]{26}$/u;
const CORRELATION_ID = /^cor_[0-9A-HJKMNP-TV-Z]{26}$/u;
const EVENT_ID = /^evt_[0-9A-HJKMNP-TV-Z]{26}$/u;
const COMMAND_ID = /^cmd_[0-9A-HJKMNP-TV-Z]{26}$/u;
const SAFE_REFERENCE = /^[A-Za-z0-9._:/-]+$/u;
const REASON_CODE = /^[A-Z][A-Z0-9_]{0,63}$/u;
const CONTROL_CHARACTERS = {
  test(value: string): boolean {
    for (const character of value) {
      const codePoint = character.charCodeAt(0);
      if (codePoint <= 0x1f || codePoint === 0x7f) return true;
    }
    return false;
  },
} as const;
const PRIVATE_REASONING_MARKERS =
  /(?:chain[\s-]*of[\s-]*thought|private reasoning|hidden reasoning|scratchpad|system prompt|developer message|<analysis>|<\/analysis>)/iu;

const OBSERVATION_KEYS = [
  'observationId',
  'source',
  'sourceReference',
  'tenantId',
  'correlationId',
  'scope',
  'subjectId',
  'state',
  'observedAtMs',
  'nowMs',
  'safeSummary',
  'reasonCode',
  'evidenceRefs',
  'completedUnits',
  'totalUnits',
] as const;
const OBSERVATION_REQUIRED_KEYS = [
  'observationId',
  'source',
  'sourceReference',
  'tenantId',
  'correlationId',
  'scope',
  'subjectId',
  'state',
  'observedAtMs',
  'nowMs',
  'safeSummary',
  'evidenceRefs',
] as const;
const REPLAY_KEYS = [
  'tenantId',
  'correlationId',
  'scope',
  'subjectId',
  'afterSequence',
  'limit',
] as const;
const REPLAY_REQUIRED_KEYS = [
  'tenantId',
  'correlationId',
  'scope',
  'subjectId',
  'afterSequence',
] as const;
const CANCELLATION_KEYS = [
  'tenantId',
  'correlationId',
  'gatewaySessionId',
  'gatewayConnectionId',
  'commandId',
  'nowMs',
] as const;

const PROGRESS_SCOPE_SET = new Set<string>(PROGRESS_SCOPES);
const PROGRESS_STATE_SET = new Set<string>(PROGRESS_STATES);
const PROGRESS_SOURCE_SET = new Set<string>(PROGRESS_SOURCES);
const CANCELLATION_DISPOSITIONS = new Set<string>([
  'CANCEL_REQUESTED',
  'ALREADY_REQUESTED',
  'NOOP_TERMINAL_OR_UNCERTAIN',
]);

function isPlainDataRecord(value: unknown): value is Record<string, unknown> {
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

function hasOnlyKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  try {
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

function parseCanonical<T extends string>(value: unknown, pattern: RegExp): T | null {
  return typeof value === 'string' && pattern.test(value) ? (value as T) : null;
}

function isSafeReference(value: unknown, maxLength = 256): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    SAFE_REFERENCE.test(value)
  );
}

function isSafeSummary(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 240 &&
    !CONTROL_CHARACTERS.test(value) &&
    !PRIVATE_REASONING_MARKERS.test(value)
  );
}

function isTerminalState(state: ProgressState): boolean {
  return state === 'CANCELLED' || state === 'COMPLETED' || state === 'FAILED';
}

function failure(
  code: ProgressProjectionErrorCode,
  message: string,
  retryable = false,
  upstreamCode?: string,
): ProgressProjectionError {
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

function success<T>(value: T): ProgressProjectionResult<T> {
  return { ok: true, value, authorizesExecution: false, retryAuthorized: false };
}

function streamKey(
  tenantId: TenantId,
  correlationId: CorrelationId,
  scope: ProgressScope,
  subjectId: string,
): string {
  return `${tenantId}|${correlationId}|${scope}|${subjectId}`;
}

function cancellationKey(
  tenantId: TenantId,
  correlationId: CorrelationId,
  commandId: CommandId,
): string {
  return `${tenantId}|${correlationId}|${commandId}`;
}

function observationFingerprint(input: ProgressObservationInput): string {
  return JSON.stringify({
    observationId: input.observationId,
    source: input.source,
    sourceReference: input.sourceReference,
    tenantId: input.tenantId,
    correlationId: input.correlationId,
    scope: input.scope,
    subjectId: input.subjectId,
    state: input.state,
    observedAtMs: input.observedAtMs,
    safeSummary: input.safeSummary,
    ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
    evidenceRefs: input.evidenceRefs,
    ...(input.completedUnits === undefined ? {} : { completedUnits: input.completedUnits }),
    ...(input.totalUnits === undefined ? {} : { totalUnits: input.totalUnits }),
  });
}

function progressPercentage(input: ProgressObservationInput): number | undefined {
  if (input.completedUnits === undefined || input.totalUnits === undefined) return undefined;
  return Math.round((input.completedUnits / input.totalUnits) * 10_000) / 100;
}

function snapshotStream(record: StreamRecord): ProgressStreamSnapshot {
  const firstRetainedSequence = record.history[0]?.sequence ?? record.latestSequence;
  const latest = record.latestFrame;
  return Object.freeze({
    tenantId: record.tenantId,
    correlationId: record.correlationId,
    scope: record.scope,
    subjectId: record.subjectId,
    state: latest.state,
    latestSequence: record.latestSequence,
    firstRetainedSequence,
    retainedFrames: record.history.length,
    updatedAtMs: latest.observedAtMs,
    safeSummary: latest.safeSummary,
    ...(latest.reasonCode === undefined ? {} : { reasonCode: latest.reasonCode }),
    evidenceRefs: latest.evidenceRefs,
    afterCancellationRequest: latest.afterCancellationRequest,
    lateCompletionAfterCancellation: latest.lateCompletionAfterCancellation,
    requiresW07Reconciliation: latest.requiresW07Reconciliation,
    sourceOfTruth: 'CANONICAL_UPSTREAM_PROJECTION' as const,
    privateReasoningIncluded: false as const,
    authorizesExecution: false as const,
    canGrantPermission: false as const,
    provesExecutionSuccess: false as const,
  });
}

export class ProgressCancellationProjectionManager {
  readonly #verifier: ProgressObservationVerifier;
  readonly #cancellationPort: ProgressCancellationPort;
  readonly #config: ProgressProjectionConfig;
  readonly #streams = new Map<string, StreamRecord>();
  readonly #observationBindings = new Map<EventId, string>();
  readonly #cancellations = new Map<string, CancellationRecord>();

  constructor(
    verifier: ProgressObservationVerifier,
    cancellationPort: ProgressCancellationPort,
    config: Partial<ProgressProjectionConfig> = {},
  ) {
    this.#verifier = verifier;
    this.#cancellationPort = cancellationPort;
    this.#config = { ...DEFAULT_CONFIG, ...config };
    if (
      !isPositiveInteger(this.#config.maxStreams) ||
      !isPositiveInteger(this.#config.maxHistoryPerStream) ||
      !isPositiveInteger(this.#config.maxRememberedObservationsPerStream) ||
      this.#config.maxRememberedObservationsPerStream < this.#config.maxHistoryPerStream ||
      !isPositiveInteger(this.#config.maxEvidenceRefs) ||
      !isPositiveInteger(this.#config.maxReplayItems) ||
      !isPositiveInteger(this.#config.maxObservationAgeMs)
    ) {
      throw new Error('W14-C projection limits must be positive and internally consistent.');
    }
  }

  recordProgress(input: unknown): ProgressProjectionResult<RecordProgressSuccess> {
    const parsed = this.#parseObservation(input);
    if (!parsed.ok) return parsed;

    let verification: unknown;
    try {
      verification = this.#verifier.verify({
        source: parsed.value.source,
        sourceReference: parsed.value.sourceReference,
        tenantId: parsed.value.tenantId,
        correlationId: parsed.value.correlationId,
        scope: parsed.value.scope,
        subjectId: parsed.value.subjectId,
        observationId: parsed.value.observationId,
        observedAtMs: parsed.value.observedAtMs,
        nowMs: parsed.value.nowMs,
      });
    } catch {
      return failure(
        'SOURCE_REJECTED',
        'Canonical progress source verification was unavailable.',
        true,
      );
    }

    const verified = this.#validateVerification(verification, parsed.value.nowMs);
    if (!verified.ok) return verified;

    const key = streamKey(
      parsed.value.tenantId,
      parsed.value.correlationId,
      parsed.value.scope,
      parsed.value.subjectId,
    );
    const fingerprint = observationFingerprint(parsed.value);
    const boundKey = this.#observationBindings.get(parsed.value.observationId);
    if (boundKey !== undefined && boundKey !== key) {
      return failure(
        'OBSERVATION_CONFLICT',
        'Observation identifier is already bound to a different progress stream.',
      );
    }

    const existing = this.#streams.get(key);
    const remembered = existing?.observations.get(parsed.value.observationId);
    if (remembered !== undefined && existing !== undefined) {
      if (remembered.fingerprint !== fingerprint) {
        return failure(
          'OBSERVATION_CONFLICT',
          'Observation identifier was reused with conflicting progress data.',
        );
      }
      return success({
        disposition: 'DUPLICATE_OBSERVATION',
        frame: remembered.frame,
        stream: snapshotStream(existing),
      });
    }

    if (existing === undefined) {
      const capacity = this.#prepareStreamSlot();
      if (!capacity.ok) return capacity;
    }

    const cancellation =
      parsed.value.scope === 'COMMAND'
        ? this.#cancellations.get(
            cancellationKey(
              parsed.value.tenantId,
              parsed.value.correlationId,
              parsed.value.subjectId as CommandId,
            ),
          )
        : undefined;
    const afterCancellationRequest =
      cancellation !== undefined && cancellation.requestedAtMs <= parsed.value.observedAtMs;
    const lateCompletionAfterCancellation =
      afterCancellationRequest && parsed.value.state === 'COMPLETED';
    const requiresW07Reconciliation =
      parsed.value.state === 'UNCERTAIN' || lateCompletionAfterCancellation;
    const sequence = (existing?.latestSequence ?? 0) + 1;
    const percentComplete = progressPercentage(parsed.value);

    const frame: ProgressFrame = Object.freeze({
      sequence,
      observationId: parsed.value.observationId,
      source: parsed.value.source,
      sourceReference: parsed.value.sourceReference,
      ...(verified.value.sourceRevision === undefined
        ? {}
        : { sourceRevision: verified.value.sourceRevision }),
      tenantId: parsed.value.tenantId,
      correlationId: parsed.value.correlationId,
      scope: parsed.value.scope,
      subjectId: parsed.value.subjectId,
      state: parsed.value.state,
      observedAtMs: parsed.value.observedAtMs,
      safeSummary: parsed.value.safeSummary,
      ...(parsed.value.reasonCode === undefined ? {} : { reasonCode: parsed.value.reasonCode }),
      evidenceRefs: Object.freeze([...parsed.value.evidenceRefs]),
      ...(parsed.value.completedUnits === undefined
        ? {}
        : { completedUnits: parsed.value.completedUnits }),
      ...(parsed.value.totalUnits === undefined ? {} : { totalUnits: parsed.value.totalUnits }),
      ...(percentComplete === undefined ? {} : { percentComplete }),
      afterCancellationRequest,
      lateCompletionAfterCancellation,
      requiresW07Reconciliation,
      sourceVerified: true as const,
      privateReasoningIncluded: false as const,
      authorizesExecution: false as const,
      canGrantPermission: false as const,
      provesExecutionSuccess: false as const,
    });

    const record = existing ?? {
      tenantId: parsed.value.tenantId,
      correlationId: parsed.value.correlationId,
      scope: parsed.value.scope,
      subjectId: parsed.value.subjectId,
      latestSequence: 0,
      latestFrame: frame,
      history: [],
      observations: new Map<EventId, RememberedObservation>(),
    };
    record.latestSequence = sequence;
    record.latestFrame = frame;
    record.history.push(frame);
    record.observations.set(parsed.value.observationId, { fingerprint, frame });
    this.#observationBindings.set(parsed.value.observationId, key);
    this.#trimHistory(record);
    this.#trimRememberedObservations(record, key);
    if (existing === undefined) this.#streams.set(key, record);

    return success({ disposition: 'RECORDED', frame, stream: snapshotStream(record) });
  }

  replayProgress(input: unknown): ProgressProjectionResult<ReplayProgressSuccess> {
    const parsed = this.#parseReplay(input);
    if (!parsed.ok) return parsed;
    const key = streamKey(
      parsed.value.tenantId,
      parsed.value.correlationId,
      parsed.value.scope,
      parsed.value.subjectId,
    );
    const record = this.#streams.get(key);
    if (record === undefined) return failure('STREAM_NOT_FOUND', 'Progress stream does not exist.');
    if (parsed.value.afterSequence > record.latestSequence) {
      return failure('REPLAY_CURSOR_AHEAD', 'Replay cursor is ahead of the canonical projection.');
    }

    const firstRetainedSequence = record.history[0]?.sequence ?? record.latestSequence;
    if (parsed.value.afterSequence < firstRetainedSequence - 1) {
      return failure(
        'REPLAY_CURSOR_EXPIRED',
        'Replay cursor predates the bounded retained progress history.',
      );
    }
    const limit = parsed.value.limit ?? this.#config.maxReplayItems;
    const available = record.history.filter((frame) => frame.sequence > parsed.value.afterSequence);
    const frames = Object.freeze(available.slice(0, limit));
    const lastReturnedSequence = frames.at(-1)?.sequence ?? parsed.value.afterSequence;
    return success({
      frames,
      firstRetainedSequence,
      latestSequence: record.latestSequence,
      hasMore: lastReturnedSequence < record.latestSequence,
      sourceOfTruth: 'CANONICAL_UPSTREAM_PROJECTION',
      authorizesExecution: false,
      canGrantPermission: false,
    });
  }

  requestCancellation(input: unknown): ProgressProjectionResult<ProgressCancellationProjection> {
    const parsed = this.#parseCancellation(input);
    if (!parsed.ok) return parsed;

    let sessionResult: unknown;
    try {
      sessionResult = this.#cancellationPort.getSession(
        parsed.value.gatewaySessionId,
        parsed.value.nowMs,
      );
    } catch {
      return failure(
        'CANCELLATION_UPSTREAM_REJECTED',
        'Realtime cancellation session lookup was unavailable.',
        true,
      );
    }
    const session = this.#validateCancellationSession(sessionResult);
    if (!session.ok) return session;
    if (
      session.value.state !== 'OPEN' ||
      session.value.gatewaySessionId !== parsed.value.gatewaySessionId ||
      session.value.gatewayConnectionId !== parsed.value.gatewayConnectionId ||
      session.value.tenantId !== parsed.value.tenantId ||
      session.value.correlationId !== parsed.value.correlationId
    ) {
      return failure(
        'CANCELLATION_BINDING_MISMATCH',
        'Cancellation request does not match the current W14 session binding.',
      );
    }

    let cancellationResult: unknown;
    try {
      cancellationResult = this.#cancellationPort.requestCancellation({
        gatewaySessionId: parsed.value.gatewaySessionId,
        gatewayConnectionId: parsed.value.gatewayConnectionId,
        commandId: parsed.value.commandId,
        nowMs: parsed.value.nowMs,
      });
    } catch {
      return failure(
        'CANCELLATION_UPSTREAM_REJECTED',
        'Realtime cancellation request was unavailable.',
        true,
      );
    }
    const cancellation = this.#validateCancellationResult(cancellationResult);
    if (!cancellation.ok) return cancellation;
    if (
      cancellation.value.command.commandId !== parsed.value.commandId ||
      cancellation.value.command.correlationId !== parsed.value.correlationId
    ) {
      return failure(
        'CANCELLATION_BINDING_MISMATCH',
        'Cancellation response does not match the requested command binding.',
      );
    }

    const requestedAtMs = cancellation.value.command.cancelRequestedAtMs;
    if (requestedAtMs !== undefined) {
      const key = cancellationKey(
        parsed.value.tenantId,
        parsed.value.correlationId,
        parsed.value.commandId,
      );
      const remembered = this.#cancellations.get(key);
      if (remembered !== undefined && remembered.requestedAtMs !== requestedAtMs) {
        return failure(
          'CANCELLATION_PROTOCOL_VIOLATION',
          'Cancellation request timestamp changed for an already bound command.',
        );
      }
      if (remembered === undefined) {
        this.#cancellations.set(key, {
          tenantId: parsed.value.tenantId,
          correlationId: parsed.value.correlationId,
          commandId: parsed.value.commandId,
          requestedAtMs,
        });
      }
    }

    return success(
      Object.freeze({
        disposition: cancellation.value.disposition,
        commandId: cancellation.value.command.commandId,
        correlationId: cancellation.value.command.correlationId,
        state: cancellation.value.command.state,
        ...(requestedAtMs === undefined ? {} : { cancelRequestedAtMs: requestedAtMs }),
        effect: 'REQUEST_ONLY_NOT_EXECUTION_PROOF' as const,
        outcomeAuthority: 'W07_ONLY' as const,
        provesExecutionPrevented: false as const,
        authorizesExecution: false as const,
        canGrantPermission: false as const,
        retryAuthorized: false as const,
      }),
    );
  }

  #parseObservation(input: unknown): ProgressProjectionResult<ProgressObservationInput> {
    if (
      !isPlainDataRecord(input) ||
      !hasOnlyKeys(input, OBSERVATION_KEYS) ||
      !hasAllKeys(input, OBSERVATION_REQUIRED_KEYS)
    ) {
      return failure('MALFORMED_REQUEST', 'Progress observation shape is invalid.');
    }
    const observationId = parseCanonical<EventId>(input.observationId, EVENT_ID);
    const tenantId = parseCanonical<TenantId>(input.tenantId, TENANT_ID);
    const correlationId = parseCanonical<CorrelationId>(input.correlationId, CORRELATION_ID);
    if (
      observationId === null ||
      tenantId === null ||
      correlationId === null ||
      typeof input.source !== 'string' ||
      !PROGRESS_SOURCE_SET.has(input.source) ||
      typeof input.scope !== 'string' ||
      !PROGRESS_SCOPE_SET.has(input.scope) ||
      typeof input.state !== 'string' ||
      !PROGRESS_STATE_SET.has(input.state) ||
      !isSafeReference(input.sourceReference) ||
      !isSafeReference(input.subjectId) ||
      !isSafeSummary(input.safeSummary) ||
      !isFiniteNonNegativeInteger(input.observedAtMs) ||
      !isFiniteNonNegativeInteger(input.nowMs)
    ) {
      return failure('MALFORMED_REQUEST', 'Progress observation values are malformed or unsafe.');
    }
    if (input.observedAtMs > input.nowMs) {
      return failure('MALFORMED_REQUEST', 'Progress observation cannot be from the future.');
    }
    if (input.nowMs - input.observedAtMs > this.#config.maxObservationAgeMs) {
      return failure(
        'OBSERVATION_STALE',
        'Progress observation exceeds the bounded freshness window.',
      );
    }
    if (input.scope === 'COMMAND' && !COMMAND_ID.test(input.subjectId)) {
      return failure(
        'MALFORMED_REQUEST',
        'Command progress requires a canonical command identifier.',
      );
    }
    if (
      Object.hasOwn(input, 'reasonCode') &&
      (typeof input.reasonCode !== 'string' || !REASON_CODE.test(input.reasonCode))
    ) {
      return failure('MALFORMED_REQUEST', 'Progress reason code is malformed.');
    }
    if (
      !Array.isArray(input.evidenceRefs) ||
      input.evidenceRefs.length > this.#config.maxEvidenceRefs ||
      !input.evidenceRefs.every((reference) => isSafeReference(reference)) ||
      new Set(input.evidenceRefs).size !== input.evidenceRefs.length
    ) {
      return failure(
        'MALFORMED_REQUEST',
        'Progress evidence references are malformed or unbounded.',
      );
    }

    const hasCompleted = Object.hasOwn(input, 'completedUnits');
    const hasTotal = Object.hasOwn(input, 'totalUnits');
    if (hasCompleted !== hasTotal) {
      return failure(
        'MALFORMED_REQUEST',
        'Progress units must provide completed and total together.',
      );
    }
    if (
      hasCompleted &&
      (!isFiniteNonNegativeInteger(input.completedUnits) ||
        !isPositiveInteger(input.totalUnits) ||
        input.completedUnits > input.totalUnits)
    ) {
      return failure('MALFORMED_REQUEST', 'Progress units are invalid.');
    }

    return success({
      observationId,
      source: input.source as ProgressSource,
      sourceReference: input.sourceReference,
      tenantId,
      correlationId,
      scope: input.scope as ProgressScope,
      subjectId: input.subjectId,
      state: input.state as ProgressState,
      observedAtMs: input.observedAtMs,
      nowMs: input.nowMs,
      safeSummary: input.safeSummary,
      ...(typeof input.reasonCode === 'string' ? { reasonCode: input.reasonCode } : {}),
      evidenceRefs: Object.freeze([...input.evidenceRefs]) as readonly string[],
      ...(typeof input.completedUnits === 'number' ? { completedUnits: input.completedUnits } : {}),
      ...(typeof input.totalUnits === 'number' ? { totalUnits: input.totalUnits } : {}),
    });
  }

  #parseReplay(input: unknown): ProgressProjectionResult<ReplayProgressInput> {
    if (
      !isPlainDataRecord(input) ||
      !hasOnlyKeys(input, REPLAY_KEYS) ||
      !hasAllKeys(input, REPLAY_REQUIRED_KEYS)
    ) {
      return failure('MALFORMED_REQUEST', 'Progress replay request shape is invalid.');
    }
    const tenantId = parseCanonical<TenantId>(input.tenantId, TENANT_ID);
    const correlationId = parseCanonical<CorrelationId>(input.correlationId, CORRELATION_ID);
    if (
      tenantId === null ||
      correlationId === null ||
      typeof input.scope !== 'string' ||
      !PROGRESS_SCOPE_SET.has(input.scope) ||
      !isSafeReference(input.subjectId) ||
      !isFiniteNonNegativeInteger(input.afterSequence)
    ) {
      return failure('MALFORMED_REQUEST', 'Progress replay binding or cursor is malformed.');
    }
    if (input.scope === 'COMMAND' && !COMMAND_ID.test(input.subjectId)) {
      return failure(
        'MALFORMED_REQUEST',
        'Command replay requires a canonical command identifier.',
      );
    }
    if (
      Object.hasOwn(input, 'limit') &&
      (!isPositiveInteger(input.limit) || input.limit > this.#config.maxReplayItems)
    ) {
      return failure('MALFORMED_REQUEST', 'Progress replay limit is outside the configured bound.');
    }
    return success({
      tenantId,
      correlationId,
      scope: input.scope as ProgressScope,
      subjectId: input.subjectId,
      afterSequence: input.afterSequence,
      ...(typeof input.limit === 'number' ? { limit: input.limit } : {}),
    });
  }

  #parseCancellation(input: unknown): ProgressProjectionResult<RequestProgressCancellationInput> {
    if (
      !isPlainDataRecord(input) ||
      !hasOnlyKeys(input, CANCELLATION_KEYS) ||
      !hasAllKeys(input, CANCELLATION_KEYS)
    ) {
      return failure('MALFORMED_REQUEST', 'Progress cancellation request shape is invalid.');
    }
    const tenantId = parseCanonical<TenantId>(input.tenantId, TENANT_ID);
    const correlationId = parseCanonical<CorrelationId>(input.correlationId, CORRELATION_ID);
    const commandId = parseCanonical<CommandId>(input.commandId, COMMAND_ID);
    if (
      tenantId === null ||
      correlationId === null ||
      commandId === null ||
      !isSafeReference(input.gatewaySessionId) ||
      !isSafeReference(input.gatewayConnectionId) ||
      !isFiniteNonNegativeInteger(input.nowMs)
    ) {
      return failure('MALFORMED_REQUEST', 'Progress cancellation binding is malformed.');
    }
    return success({
      tenantId,
      correlationId,
      gatewaySessionId: input.gatewaySessionId,
      gatewayConnectionId: input.gatewayConnectionId,
      commandId,
      nowMs: input.nowMs,
    });
  }

  #validateVerification(
    verification: unknown,
    nowMs: number,
  ): ProgressProjectionResult<{ sourceRevision?: string }> {
    if (
      !isPlainDataRecord(verification) ||
      typeof verification.ok !== 'boolean' ||
      verification.authorizesExecution !== false
    ) {
      return failure(
        'SOURCE_PROTOCOL_VIOLATION',
        'Canonical progress verifier returned an invalid authority shape.',
      );
    }
    if (!verification.ok) {
      const code = verification.code;
      const retryable = verification.retryable;
      if (
        (code !== 'SOURCE_UNVERIFIED' &&
          code !== 'SOURCE_BINDING_MISMATCH' &&
          code !== 'SOURCE_STALE') ||
        typeof retryable !== 'boolean'
      ) {
        return failure(
          'SOURCE_PROTOCOL_VIOLATION',
          'Canonical progress verifier returned an invalid rejection.',
        );
      }
      return failure('SOURCE_REJECTED', `Canonical progress source rejected: ${code}.`, retryable);
    }
    if (
      !isFiniteNonNegativeInteger(verification.verifiedAtMs) ||
      verification.verifiedAtMs > nowMs ||
      (Object.hasOwn(verification, 'sourceRevision') &&
        !isSafeReference(verification.sourceRevision))
    ) {
      return failure(
        'SOURCE_PROTOCOL_VIOLATION',
        'Canonical progress verifier returned invalid freshness or revision evidence.',
      );
    }
    return success({
      ...(typeof verification.sourceRevision === 'string'
        ? { sourceRevision: verification.sourceRevision }
        : {}),
    });
  }

  #validateCancellationSession(
    result: unknown,
  ): ProgressProjectionResult<ProgressCancellationSessionView> {
    if (!isPlainDataRecord(result) || typeof result.ok !== 'boolean') {
      return failure(
        'CANCELLATION_PROTOCOL_VIOLATION',
        'Realtime cancellation session port returned an invalid result.',
      );
    }
    if (!result.ok) return this.#mapCancellationPortFailure(result);
    if (result.authorizesExecution !== false || !isPlainDataRecord(result.value)) {
      return failure(
        'CANCELLATION_PROTOCOL_VIOLATION',
        'Realtime cancellation session port returned authority-like data.',
      );
    }
    const value = result.value;
    const tenantId = parseCanonical<TenantId>(value.tenantId, TENANT_ID);
    const correlationId = parseCanonical<CorrelationId>(value.correlationId, CORRELATION_ID);
    if (
      !isSafeReference(value.gatewaySessionId) ||
      !isSafeReference(value.gatewayConnectionId) ||
      (value.state !== 'OPEN' && value.state !== 'CLOSED') ||
      tenantId === null ||
      correlationId === null ||
      value.authorizesExecution !== false ||
      value.canGrantPermission !== false
    ) {
      return failure(
        'CANCELLATION_PROTOCOL_VIOLATION',
        'Realtime cancellation session snapshot violated the W14 non-authority contract.',
      );
    }
    return success({
      gatewaySessionId: value.gatewaySessionId,
      gatewayConnectionId: value.gatewayConnectionId,
      state: value.state,
      tenantId,
      correlationId,
      authorizesExecution: false,
      canGrantPermission: false,
    });
  }

  #validateCancellationResult(
    result: unknown,
  ): ProgressProjectionResult<ProgressCancellationPortSuccess> {
    if (!isPlainDataRecord(result) || typeof result.ok !== 'boolean') {
      return failure(
        'CANCELLATION_PROTOCOL_VIOLATION',
        'Realtime cancellation port returned an invalid result.',
      );
    }
    if (!result.ok) return this.#mapCancellationPortFailure(result);
    if (
      result.authorizesExecution !== false ||
      !isPlainDataRecord(result.value) ||
      typeof result.value.disposition !== 'string' ||
      !CANCELLATION_DISPOSITIONS.has(result.value.disposition) ||
      !isPlainDataRecord(result.value.command)
    ) {
      return failure(
        'CANCELLATION_PROTOCOL_VIOLATION',
        'Realtime cancellation port returned an invalid success shape.',
      );
    }
    const command = result.value.command;
    const commandId = parseCanonical<CommandId>(command.commandId, COMMAND_ID);
    const correlationId = parseCanonical<CorrelationId>(command.correlationId, CORRELATION_ID);
    if (
      commandId === null ||
      correlationId === null ||
      typeof command.state !== 'string' ||
      command.state === 'QUEUED' ||
      !PROGRESS_STATE_SET.has(command.state) ||
      command.authorizesExecution !== false ||
      command.provesExecutionSuccess !== false ||
      command.externalStateVerified !== false ||
      (Object.hasOwn(command, 'cancelRequestedAtMs') &&
        !isFiniteNonNegativeInteger(command.cancelRequestedAtMs))
    ) {
      return failure(
        'CANCELLATION_PROTOCOL_VIOLATION',
        'Realtime cancellation command snapshot violated the W14/W07 boundary.',
      );
    }
    if (
      (result.value.disposition === 'CANCEL_REQUESTED' ||
        result.value.disposition === 'ALREADY_REQUESTED') &&
      !isFiniteNonNegativeInteger(command.cancelRequestedAtMs)
    ) {
      return failure(
        'CANCELLATION_PROTOCOL_VIOLATION',
        'Accepted cancellation request did not retain its request timestamp.',
      );
    }
    return success({
      disposition: result.value.disposition as ProgressCancellationPortSuccess['disposition'],
      command: {
        commandId,
        correlationId,
        state: command.state as ProgressCancellationPortSuccess['command']['state'],
        ...(typeof command.cancelRequestedAtMs === 'number'
          ? { cancelRequestedAtMs: command.cancelRequestedAtMs }
          : {}),
        authorizesExecution: false,
        provesExecutionSuccess: false,
        externalStateVerified: false,
      },
    });
  }

  #mapCancellationPortFailure(result: Record<string, unknown>): ProgressProjectionError {
    if (
      result.authorizesExecution !== false ||
      !isPlainDataRecord(result.error) ||
      typeof result.error.code !== 'string' ||
      typeof result.error.message !== 'string' ||
      typeof result.error.retryable !== 'boolean'
    ) {
      return failure(
        'CANCELLATION_PROTOCOL_VIOLATION',
        'Realtime cancellation port returned an invalid rejection shape.',
      );
    }
    return failure(
      'CANCELLATION_UPSTREAM_REJECTED',
      'Realtime cancellation request was rejected by its owning session boundary.',
      result.error.retryable,
      result.error.code,
    );
  }

  #prepareStreamSlot(): ProgressProjectionResult<true> {
    if (this.#streams.size < this.#config.maxStreams) return success(true);
    for (const [key, record] of this.#streams) {
      if (!isTerminalState(record.latestFrame.state)) continue;
      this.#streams.delete(key);
      for (const observationId of record.observations.keys()) {
        if (this.#observationBindings.get(observationId) === key) {
          this.#observationBindings.delete(observationId);
        }
      }
      return success(true);
    }
    return failure(
      'STREAM_CAPACITY',
      'Progress projection capacity is full of active or uncertain streams.',
      true,
    );
  }

  #trimHistory(record: StreamRecord): void {
    while (record.history.length > this.#config.maxHistoryPerStream) record.history.shift();
  }

  #trimRememberedObservations(record: StreamRecord, key: string): void {
    while (record.observations.size > this.#config.maxRememberedObservationsPerStream) {
      const oldest = record.observations.keys().next().value as EventId | undefined;
      if (oldest === undefined) return;
      record.observations.delete(oldest);
      if (this.#observationBindings.get(oldest) === key) this.#observationBindings.delete(oldest);
    }
  }
}
