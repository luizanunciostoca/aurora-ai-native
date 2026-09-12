import type { DataClassification, Rfc3339Timestamp } from '@aurora/contracts/context';
import type { InteractionSession, InteractionTurn } from '@aurora/contracts/interaction-session';

import {
  asRfc3339Timestamp,
  type AppendInteractionTurnInput,
  type EndInteractionSessionInput,
  type InteractionClock,
  type InteractionSessionIdFactory,
  type InteractionSessionManagerError,
  type InteractionSessionManagerErrorCode,
  type InteractionSessionManagerResult,
  type InteractionSessionManagerSuccess,
  type InteractionSessionStore,
  type OpenInteractionSessionInput,
  type ResumeInteractionSessionInput,
  type StoredInteractionSession,
  type SuspendInteractionSessionInput,
} from './types.js';

const MIN_RESUME_WINDOW_MS = 1_000;
const MAX_RESUME_WINDOW_MS = 10 * 60 * 1000;
const MAX_TURNS = 128;
const MAX_DATE_MS = 8_640_000_000_000_000;
const CLASSIFICATION_RANK: Readonly<Record<DataClassification, number>> = Object.freeze({
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
});

function failure(
  code: InteractionSessionManagerErrorCode,
  message: string,
): InteractionSessionManagerError {
  return {
    ok: false,
    code,
    message,
    retryable: false,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

function success(value: StoredInteractionSession): InteractionSessionManagerSuccess {
  return {
    ok: true,
    value,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

function checkedClock(clock: InteractionClock): number {
  const observed = clock();
  if (!Number.isSafeInteger(observed) || observed < 0 || observed > MAX_DATE_MS) {
    throw new TypeError('interaction clock must return a supported non-negative safe integer');
  }
  return observed;
}

function monotonicEpochMs(clock: InteractionClock, currentIso?: string): number {
  const observed = checkedClock(clock);
  const floor = currentIso === undefined ? 0 : Date.parse(currentIso);
  const effective = Math.max(observed, Number.isFinite(floor) ? floor : 0);
  if (effective > MAX_DATE_MS) throw new TypeError('interaction timestamp is outside supported range');
  return effective;
}

function monotonicTimestamp(
  clock: InteractionClock,
  currentIso?: string,
): Rfc3339Timestamp {
  return asRfc3339Timestamp(monotonicEpochMs(clock, currentIso));
}

function moreRestrictiveOrEqual(
  candidate: DataClassification,
  baseline: DataClassification,
): boolean {
  return CLASSIFICATION_RANK[candidate] >= CLASSIFICATION_RANK[baseline];
}

function replace(
  store: InteractionSessionStore,
  current: StoredInteractionSession,
  session: InteractionSession,
): InteractionSessionManagerResult {
  const next: StoredInteractionSession = Object.freeze({
    revision: current.revision + 1,
    session: Object.freeze(session),
  });
  return store.compareAndSwap(session.interactionSessionId, current.revision, next)
    ? success(next)
    : failure('REVISION_CONFLICT', 'interaction session changed concurrently');
}

/**
 * W14 interaction continuity state machine. It owns only conversational session/turn lifecycle.
 * It never evaluates W02/W07 authority, never executes a capability, never interprets a receipt as
 * verified external state, and never authorizes retry.
 */
export class InteractionSessionManager {
  constructor(
    private readonly store: InteractionSessionStore,
    private readonly ids: InteractionSessionIdFactory,
    private readonly clock: InteractionClock = () => Date.now(),
  ) {}

  open(input: OpenInteractionSessionInput): InteractionSessionManagerResult {
    const now = monotonicTimestamp(this.clock);
    const session: InteractionSession = Object.freeze({
      kind: 'INTERACTION_SESSION',
      schemaVersion: 1,
      interactionSessionId: this.ids.sessionId(),
      tenantId: input.tenantId,
      participant: input.participant,
      modality: input.modality,
      state: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      dataClassification: input.dataClassification,
      resume: Object.freeze({ resumable: false }),
      references: input.references,
      turns: Object.freeze([]),
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    });
    const stored: StoredInteractionSession = Object.freeze({ revision: 1, session });
    return this.store.create(stored)
      ? success(stored)
      : failure('STORE_REJECTED', 'interaction session store rejected create');
  }

  current(
    interactionSessionId: InteractionSession['interactionSessionId'],
  ): InteractionSessionManagerResult {
    const current = this.store.read(interactionSessionId);
    return current === null
      ? failure('SESSION_NOT_FOUND', 'interaction session does not exist')
      : success(current);
  }

  appendTurn(input: AppendInteractionTurnInput): InteractionSessionManagerResult {
    const current = this.store.read(input.interactionSessionId);
    if (current === null) {
      return failure('SESSION_NOT_FOUND', 'interaction session does not exist');
    }
    const session = current.session;
    if (session.state !== 'ACTIVE') {
      return failure('SESSION_NOT_ACTIVE', 'interaction session is not active');
    }
    if (session.turns.length >= MAX_TURNS) {
      return failure('TURN_LIMIT_REACHED', 'interaction session reached the bounded turn limit');
    }
    if (session.modality !== 'MULTIMODAL' && input.modality !== session.modality) {
      return failure('MODALITY_MISMATCH', 'turn modality does not match interaction session');
    }
    if (!moreRestrictiveOrEqual(input.dataClassification, session.dataClassification)) {
      return failure('CLASSIFICATION_DOWNGRADE', 'turn classification cannot downgrade session data');
    }

    const interactionTurnId = this.ids.turnId();
    if (session.turns.some((turn) => turn.interactionTurnId === interactionTurnId)) {
      return failure('ID_COLLISION', 'generated interaction turn id already exists in the session');
    }
    const occurredAt = monotonicTimestamp(this.clock, session.updatedAt);
    const turn: InteractionTurn = Object.freeze({
      kind: 'INTERACTION_TURN',
      schemaVersion: 1,
      interactionTurnId,
      interactionSessionId: session.interactionSessionId,
      sequence: session.turns.length + 1,
      role: input.role,
      modality: input.modality,
      correlationId: input.correlationId,
      ...(input.causationId === undefined ? {} : { causationId: input.causationId }),
      occurredAt,
      dataClassification: input.dataClassification,
      content: input.content,
      references: input.references,
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    });
    return replace(this.store, current, {
      ...session,
      updatedAt: occurredAt,
      dataClassification: input.dataClassification,
      turns: Object.freeze([...session.turns, turn]),
    });
  }

  suspend(input: SuspendInteractionSessionInput): InteractionSessionManagerResult {
    if (
      !Number.isSafeInteger(input.resumeWindowMs) ||
      input.resumeWindowMs < MIN_RESUME_WINDOW_MS ||
      input.resumeWindowMs > MAX_RESUME_WINDOW_MS
    ) {
      return failure('INVALID_RESUME_WINDOW', 'resume window is outside the bounded W14 range');
    }
    const current = this.store.read(input.interactionSessionId);
    if (current === null) {
      return failure('SESSION_NOT_FOUND', 'interaction session does not exist');
    }
    const session = current.session;
    if (session.state !== 'ACTIVE') {
      return failure('SESSION_NOT_ACTIVE', 'interaction session is not active');
    }
    const effectiveNowMs = monotonicEpochMs(this.clock, session.updatedAt);
    if (effectiveNowMs > MAX_DATE_MS - input.resumeWindowMs) {
      return failure('INVALID_RESUME_WINDOW', 'resume window exceeds the supported timestamp range');
    }
    const updatedAt = asRfc3339Timestamp(effectiveNowMs);
    const lastTurn = session.turns.at(-1);
    return replace(this.store, current, {
      ...session,
      state: 'SUSPENDED',
      updatedAt,
      resume: Object.freeze({
        resumable: true,
        ...(lastTurn === undefined ? {} : { resumeAfterTurnId: lastTurn.interactionTurnId }),
        resumableUntil: asRfc3339Timestamp(effectiveNowMs + input.resumeWindowMs),
      }),
    });
  }

  resume(input: ResumeInteractionSessionInput): InteractionSessionManagerResult {
    const current = this.store.read(input.interactionSessionId);
    if (current === null) {
      return failure('SESSION_NOT_FOUND', 'interaction session does not exist');
    }
    const session = current.session;
    if (session.state !== 'SUSPENDED') {
      return failure('SESSION_NOT_SUSPENDED', 'interaction session is not suspended');
    }
    if (!session.resume.resumable || session.resume.resumableUntil === undefined) {
      return failure('RESUME_EXPIRED', 'interaction session is not resumable');
    }
    const effectiveNowMs = monotonicEpochMs(this.clock, session.updatedAt);
    if (effectiveNowMs >= Date.parse(session.resume.resumableUntil)) {
      return failure('RESUME_EXPIRED', 'interaction session resume window expired');
    }
    const updatedAt = asRfc3339Timestamp(effectiveNowMs);
    return replace(this.store, current, {
      ...session,
      state: 'ACTIVE',
      updatedAt,
      resume: Object.freeze({ resumable: false }),
    });
  }

  end(input: EndInteractionSessionInput): InteractionSessionManagerResult {
    const current = this.store.read(input.interactionSessionId);
    if (current === null) {
      return failure('SESSION_NOT_FOUND', 'interaction session does not exist');
    }
    const session = current.session;
    if (session.state === 'ENDED') return success(current);
    const updatedAt = monotonicTimestamp(this.clock, session.updatedAt);
    return replace(this.store, current, {
      ...session,
      state: 'ENDED',
      updatedAt,
      resume: Object.freeze({ resumable: false }),
    });
  }
}
