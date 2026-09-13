import type { DataClassification, Rfc3339Timestamp } from '@aurora/contracts/context';
import type { InteractionSessionId } from '@aurora/contracts/ids';
import type {
  InteractionCanonicalReferences,
  InteractionParticipantRef,
  InteractionSession,
  InteractionTextContent,
  InteractionTurn,
} from '@aurora/contracts/interaction-session';
import {
  InteractionCanonicalReferencesSchema,
  InteractionParticipantRefSchema,
  InteractionSessionSchema,
  InteractionTextContentSchema,
  InteractionTurnSchema,
} from '@aurora/schemas/interaction-session';

import {
  MAX_RFC3339_TIMESTAMP_MS,
  MIN_RFC3339_TIMESTAMP_MS,
  asRfc3339Timestamp,
  type AppendInteractionTurnInput,
  type EndInteractionSessionInput,
  type InteractionClock,
  type InteractionSessionBinding,
  type InteractionSessionIdFactory,
  type InteractionSessionManagerError,
  type InteractionSessionManagerErrorCode,
  type InteractionSessionManagerResult,
  type InteractionSessionManagerSuccess,
  type InteractionSessionStore,
  type OpenInteractionSessionInput,
  type ReadInteractionSessionInput,
  type ResumeInteractionSessionInput,
  type StoredInteractionSession,
  type SuspendInteractionSessionInput,
} from './types.js';

const MIN_RESUME_WINDOW_MS = 1_000;
const MAX_RESUME_WINDOW_MS = 10 * 60 * 1000;
const MAX_TURNS = 128;
const NANOSECONDS_PER_MILLISECOND = 1_000_000n;
const MIN_RFC3339_TIMESTAMP_NS = BigInt(MIN_RFC3339_TIMESTAMP_MS) * NANOSECONDS_PER_MILLISECOND;
const MAX_RFC3339_TIMESTAMP_NS =
  BigInt(MAX_RFC3339_TIMESTAMP_MS) * NANOSECONDS_PER_MILLISECOND + 999_999n;
const RFC3339_FRACTION = /\.(\d{1,9})(?:Z|[+-]\d{2}:\d{2})$/u;
const CLASSIFICATION_RANK: Readonly<Record<DataClassification, number>> = Object.freeze({
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
});

interface MonotonicInstant {
  readonly epochNanoseconds: bigint;
  readonly timestamp: Rfc3339Timestamp;
}

type StoredReadResult =
  | { readonly ok: true; readonly value: StoredInteractionSession }
  | { readonly ok: false; readonly error: InteractionSessionManagerError };

function failure(
  code: InteractionSessionManagerErrorCode,
  message: string,
  retryable = false,
): InteractionSessionManagerError {
  return {
    ok: false,
    code,
    message,
    retryable,
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
  if (
    !Number.isSafeInteger(observed) ||
    observed < MIN_RFC3339_TIMESTAMP_MS ||
    observed > MAX_RFC3339_TIMESTAMP_MS
  ) {
    throw new TypeError('interaction clock must remain within the canonical RFC3339 range');
  }
  return observed;
}

function rfc3339EpochNanoseconds(value: Rfc3339Timestamp): bigint {
  const epochMs = Date.parse(value);
  if (!Number.isSafeInteger(epochMs)) {
    throw new TypeError('interaction timestamp must be a parseable RFC3339 instant');
  }
  const fraction = RFC3339_FRACTION.exec(value)?.[1] ?? '';
  const paddedFraction = fraction.padEnd(9, '0');
  const subMillisecondNanoseconds = BigInt(paddedFraction.slice(3) || '0');
  const epochNanoseconds =
    BigInt(epochMs) * NANOSECONDS_PER_MILLISECOND + subMillisecondNanoseconds;
  if (epochNanoseconds < MIN_RFC3339_TIMESTAMP_NS || epochNanoseconds > MAX_RFC3339_TIMESTAMP_NS) {
    throw new TypeError('interaction timestamp is outside the canonical RFC3339 UTC range');
  }
  return epochNanoseconds;
}

function epochNanosecondsToRfc3339(epochNanoseconds: bigint): Rfc3339Timestamp {
  if (epochNanoseconds < MIN_RFC3339_TIMESTAMP_NS || epochNanoseconds > MAX_RFC3339_TIMESTAMP_NS) {
    throw new TypeError('interaction timestamp is outside the canonical RFC3339 range');
  }

  let epochMs = epochNanoseconds / NANOSECONDS_PER_MILLISECOND;
  let subMillisecondNanoseconds = epochNanoseconds % NANOSECONDS_PER_MILLISECOND;
  if (subMillisecondNanoseconds < 0n) {
    epochMs -= 1n;
    subMillisecondNanoseconds += NANOSECONDS_PER_MILLISECOND;
  }
  const base = asRfc3339Timestamp(Number(epochMs));
  if (subMillisecondNanoseconds === 0n) return base;
  const extraFraction = subMillisecondNanoseconds.toString().padStart(6, '0');
  return base.replace(/Z$/u, `${extraFraction}Z`) as Rfc3339Timestamp;
}

function monotonicInstant(
  clock: InteractionClock,
  currentIso?: Rfc3339Timestamp,
): MonotonicInstant {
  const observedMs = checkedClock(clock);
  const observedTimestamp = asRfc3339Timestamp(observedMs);
  const observedNanoseconds = BigInt(observedMs) * NANOSECONDS_PER_MILLISECOND;
  if (currentIso === undefined) {
    return { epochNanoseconds: observedNanoseconds, timestamp: observedTimestamp };
  }
  const currentNanoseconds = rfc3339EpochNanoseconds(currentIso);
  return currentNanoseconds > observedNanoseconds
    ? { epochNanoseconds: currentNanoseconds, timestamp: currentIso }
    : { epochNanoseconds: observedNanoseconds, timestamp: observedTimestamp };
}

function monotonicTimestamp(
  clock: InteractionClock,
  currentIso?: Rfc3339Timestamp,
): Rfc3339Timestamp {
  return monotonicInstant(clock, currentIso).timestamp;
}

function moreRestrictiveOrEqual(
  candidate: DataClassification,
  baseline: DataClassification,
): boolean {
  return CLASSIFICATION_RANK[candidate] >= CLASSIFICATION_RANK[baseline];
}

function freezeReferences(
  references: InteractionCanonicalReferences,
): InteractionCanonicalReferences {
  const parsed = InteractionCanonicalReferencesSchema.parse(references);
  return Object.freeze({
    ...(parsed.activeObjectiveRef === undefined
      ? {}
      : { activeObjectiveRef: parsed.activeObjectiveRef }),
    ...(parsed.activeTaskRef === undefined ? {} : { activeTaskRef: parsed.activeTaskRef }),
    ...(parsed.workspaceRef === undefined ? {} : { workspaceRef: parsed.workspaceRef }),
    artifactRefs: Object.freeze([...parsed.artifactRefs]),
    pendingHumanControlRequestRefs: Object.freeze([...parsed.pendingHumanControlRequestRefs]),
  });
}

function freezeContent(content: InteractionTextContent): InteractionTextContent {
  const parsed = InteractionTextContentSchema.parse(content);
  return Object.freeze({
    kind: 'TEXT',
    text: parsed.text,
    ...(parsed.languageTag === undefined ? {} : { languageTag: parsed.languageTag }),
    ...(parsed.speechConfidence === undefined ? {} : { speechConfidence: parsed.speechConfidence }),
  });
}

function freezeParticipant(participant: InteractionParticipantRef): InteractionParticipantRef {
  const parsed = InteractionParticipantRefSchema.parse(participant);
  if (parsed.kind === 'ACTOR') {
    const externalIdentity = parsed.actor.externalIdentity;
    const actor = Object.freeze({
      kind: parsed.actor.kind,
      identityId: parsed.actor.identityId,
      ...(externalIdentity === undefined
        ? {}
        : {
            externalIdentity: Object.freeze({
              kind: 'EXTERNAL_IDENTITY' as const,
              provider: externalIdentity.provider,
              externalId: externalIdentity.externalId,
            }),
          }),
    });
    return Object.freeze({ kind: 'ACTOR', actor }) as InteractionParticipantRef;
  }
  return Object.freeze({
    kind: parsed.kind,
    bindingReference: parsed.bindingReference,
  });
}

function freezeTurn(turn: InteractionTurn): InteractionTurn {
  const parsed = InteractionTurnSchema.parse(turn);
  return Object.freeze({
    ...parsed,
    content: freezeContent(parsed.content),
    references: freezeReferences(parsed.references),
  });
}

function freezeSession(session: InteractionSession): InteractionSession {
  const parsed = InteractionSessionSchema.parse(session);
  const createdAtNs = rfc3339EpochNanoseconds(parsed.createdAt);
  const updatedAtNs = rfc3339EpochNanoseconds(parsed.updatedAt);
  if (updatedAtNs < createdAtNs) {
    throw new TypeError('interaction updatedAt cannot precede createdAt at nanosecond precision');
  }
  let previousOccurredAtNs = createdAtNs;
  let previousClassificationRank = -1;
  let highestTurnClassification;
  const seenTurnIds = new Set<string>();
  const turns = parsed.turns.map((turn) => {
    if (seenTurnIds.has(turn.interactionTurnId)) {
      throw new TypeError('interaction session cannot contain duplicate turn identities');
    }
    seenTurnIds.add(turn.interactionTurnId);
    const classificationRank = CLASSIFICATION_RANK[turn.dataClassification];
    if (classificationRank < previousClassificationRank) {
      throw new TypeError('interaction turn classifications cannot downgrade over time');
    }
    previousClassificationRank = classificationRank;
    highestTurnClassification = turn.dataClassification;
    const occurredAtNs = rfc3339EpochNanoseconds(turn.occurredAt);
    if (occurredAtNs < previousOccurredAtNs || occurredAtNs > updatedAtNs) {
      throw new TypeError('interaction turn timestamp is outside exact session bounds');
    }
    previousOccurredAtNs = occurredAtNs;
    return freezeTurn(turn);
  });
  if (
    highestTurnClassification !== undefined &&
    parsed.dataClassification !== highestTurnClassification
  ) {
    throw new TypeError('interaction session classification must equal its highest observed turn');
  }
  if (parsed.resume.resumable) {
    if (parsed.state !== 'SUSPENDED' || parsed.resume.resumableUntil === undefined) {
      throw new TypeError('resumable interaction must be suspended with an expiry');
    }
    if (rfc3339EpochNanoseconds(parsed.resume.resumableUntil) <= updatedAtNs) {
      throw new TypeError('resumable interaction expiry must be after updatedAt');
    }
  }
  return Object.freeze({
    ...parsed,
    participant: freezeParticipant(parsed.participant),
    resume: Object.freeze({ ...parsed.resume }),
    references: freezeReferences(parsed.references),
    turns: Object.freeze(turns),
  });
}

function freezeStored(revision: number, session: InteractionSession): StoredInteractionSession {
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new TypeError('interaction store revision must be a positive safe integer');
  }
  return Object.freeze({ revision, session: freezeSession(session) });
}

function readStored(
  store: InteractionSessionStore,
  interactionSessionId: InteractionSessionId,
): StoredReadResult {
  const raw = store.read(interactionSessionId);
  if (raw === null) {
    return {
      ok: false,
      error: failure('SESSION_NOT_FOUND', 'interaction session does not exist'),
    };
  }
  try {
    const value = freezeStored(raw.revision, raw.session);
    if (value.session.interactionSessionId !== interactionSessionId) {
      return {
        ok: false,
        error: failure(
          'STORE_INVALID',
          'interaction session store returned a mismatched canonical identity',
        ),
      };
    }
    return { ok: true, value };
  } catch {
    return {
      ok: false,
      error: failure('STORE_INVALID', 'interaction session store returned invalid state'),
    };
  }
}

function externalIdentityMatches(
  left: Extract<InteractionParticipantRef, { kind: 'ACTOR' }>['actor']['externalIdentity'],
  right: Extract<InteractionParticipantRef, { kind: 'ACTOR' }>['actor']['externalIdentity'],
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.provider === right.provider && left.externalId === right.externalId;
}

function participantMatches(
  left: InteractionParticipantRef,
  right: InteractionParticipantRef,
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'ACTOR') {
    if (right.kind !== 'ACTOR') return false;
    return (
      left.actor.kind === right.actor.kind &&
      left.actor.identityId === right.actor.identityId &&
      externalIdentityMatches(left.actor.externalIdentity, right.actor.externalIdentity)
    );
  }
  if (right.kind === 'ACTOR') return false;
  return left.bindingReference === right.bindingReference;
}

function bindingFailure(
  session: InteractionSession,
  binding: InteractionSessionBinding,
): InteractionSessionManagerError | null {
  let participant: InteractionParticipantRef;
  try {
    participant = freezeParticipant(binding.participant);
  } catch {
    return failure(
      'INVALID_INPUT',
      'interaction binding participant violates the canonical contract',
    );
  }
  if (session.tenantId !== binding.tenantId) {
    return failure('TENANT_MISMATCH', 'interaction session belongs to a different tenant');
  }
  if (!participantMatches(session.participant, participant)) {
    return failure(
      'PARTICIPANT_MISMATCH',
      'interaction session belongs to a different participant',
    );
  }
  return null;
}

function replace(
  store: InteractionSessionStore,
  current: StoredInteractionSession,
  session: InteractionSession,
): InteractionSessionManagerResult {
  let next: StoredInteractionSession;
  try {
    next = freezeStored(current.revision + 1, session);
  } catch {
    return failure('INVALID_INPUT', 'interaction transition would violate the canonical contract');
  }
  return store.compareAndSwap(session.interactionSessionId, current.revision, next)
    ? success(next)
    : failure(
        'REVISION_CONFLICT',
        'interaction session changed concurrently; reread and re-evaluate guards',
        true,
      );
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
    let participant: InteractionParticipantRef;
    let references: InteractionCanonicalReferences;
    try {
      participant = freezeParticipant(input.participant);
      references = freezeReferences(input.references);
    } catch {
      return failure('INVALID_INPUT', 'interaction open input violates the canonical contract');
    }

    const now = monotonicTimestamp(this.clock);
    const session: InteractionSession = {
      kind: 'INTERACTION_SESSION',
      schemaVersion: 1,
      interactionSessionId: this.ids.sessionId(),
      tenantId: input.tenantId,
      participant,
      modality: input.modality,
      state: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      dataClassification: input.dataClassification,
      resume: Object.freeze({ resumable: false }),
      references,
      turns: Object.freeze([]),
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    };
    let stored: StoredInteractionSession;
    try {
      stored = freezeStored(1, session);
    } catch {
      return failure('INVALID_INPUT', 'interaction open input violates the canonical contract');
    }
    return this.store.create(stored)
      ? success(stored)
      : failure('STORE_REJECTED', 'interaction session store rejected create');
  }

  current(input: ReadInteractionSessionInput): InteractionSessionManagerResult {
    const read = readStored(this.store, input.interactionSessionId);
    if (!read.ok) return read.error;
    const bindingError = bindingFailure(read.value.session, input);
    return bindingError ?? success(read.value);
  }

  appendTurn(input: AppendInteractionTurnInput): InteractionSessionManagerResult {
    const read = readStored(this.store, input.interactionSessionId);
    if (!read.ok) return read.error;
    const current = read.value;
    const session = current.session;
    const bindingError = bindingFailure(session, input);
    if (bindingError !== null) return bindingError;
    if (session.state !== 'ACTIVE') {
      return failure('SESSION_NOT_ACTIVE', 'interaction session is not active');
    }
    if (session.turns.length >= MAX_TURNS) {
      return failure('TURN_LIMIT_REACHED', 'interaction session reached the bounded turn limit');
    }

    let content: InteractionTextContent;
    let references: InteractionCanonicalReferences;
    try {
      content = freezeContent(input.content);
      references = freezeReferences(input.references);
    } catch {
      return failure('INVALID_INPUT', 'interaction turn input violates the canonical contract');
    }

    const occurredAt = monotonicTimestamp(this.clock, session.updatedAt);
    const interactionTurnId = this.ids.turnId();
    let turn: InteractionTurn;
    try {
      turn = freezeTurn({
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
        content,
        references,
        authorizesExecution: false,
        provesExecutionSuccess: false,
        retryAuthorized: false,
      });
    } catch {
      return failure('INVALID_INPUT', 'interaction turn input violates the canonical contract');
    }
    if (session.modality !== 'MULTIMODAL' && turn.modality !== session.modality) {
      return failure('MODALITY_MISMATCH', 'turn modality does not match interaction session');
    }
    if (!moreRestrictiveOrEqual(turn.dataClassification, session.dataClassification)) {
      return failure(
        'CLASSIFICATION_DOWNGRADE',
        'turn classification cannot downgrade session data',
      );
    }
    if (!this.store.reserveTurnId(interactionTurnId)) {
      return failure('ID_COLLISION', 'generated interaction turn id is already reserved globally');
    }
    return replace(this.store, current, {
      ...session,
      updatedAt: occurredAt,
      dataClassification: turn.dataClassification,
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
    const read = readStored(this.store, input.interactionSessionId);
    if (!read.ok) return read.error;
    const current = read.value;
    const session = current.session;
    const bindingError = bindingFailure(session, input);
    if (bindingError !== null) return bindingError;
    if (session.state !== 'ACTIVE') {
      return failure('SESSION_NOT_ACTIVE', 'interaction session is not active');
    }
    const instant = monotonicInstant(this.clock, session.updatedAt);
    const resumableUntilNs =
      instant.epochNanoseconds + BigInt(input.resumeWindowMs) * NANOSECONDS_PER_MILLISECOND;
    if (resumableUntilNs > MAX_RFC3339_TIMESTAMP_NS) {
      return failure(
        'INVALID_RESUME_WINDOW',
        'resume window exceeds the canonical RFC3339 timestamp range',
      );
    }
    const lastTurn = session.turns.at(-1);
    return replace(this.store, current, {
      ...session,
      state: 'SUSPENDED',
      updatedAt: instant.timestamp,
      resume: Object.freeze({
        resumable: true,
        ...(lastTurn === undefined ? {} : { resumeAfterTurnId: lastTurn.interactionTurnId }),
        resumableUntil: epochNanosecondsToRfc3339(resumableUntilNs),
      }),
    });
  }

  resume(input: ResumeInteractionSessionInput): InteractionSessionManagerResult {
    const read = readStored(this.store, input.interactionSessionId);
    if (!read.ok) return read.error;
    const current = read.value;
    const session = current.session;
    const bindingError = bindingFailure(session, input);
    if (bindingError !== null) return bindingError;
    if (session.state !== 'SUSPENDED') {
      return failure('SESSION_NOT_SUSPENDED', 'interaction session is not suspended');
    }
    if (!session.resume.resumable || session.resume.resumableUntil === undefined) {
      return failure('RESUME_EXPIRED', 'interaction session is not resumable');
    }
    const instant = monotonicInstant(this.clock, session.updatedAt);
    const resumableUntilNs = rfc3339EpochNanoseconds(session.resume.resumableUntil);
    if (instant.epochNanoseconds >= resumableUntilNs) {
      const expired = replace(this.store, current, {
        ...session,
        updatedAt: instant.timestamp,
        resume: Object.freeze({ resumable: false }),
      });
      return expired.ok
        ? failure('RESUME_EXPIRED', 'interaction session resume window expired')
        : expired;
    }
    return replace(this.store, current, {
      ...session,
      state: 'ACTIVE',
      updatedAt: instant.timestamp,
      resume: Object.freeze({ resumable: false }),
    });
  }

  end(input: EndInteractionSessionInput): InteractionSessionManagerResult {
    const read = readStored(this.store, input.interactionSessionId);
    if (!read.ok) return read.error;
    const current = read.value;
    const session = current.session;
    const bindingError = bindingFailure(session, input);
    if (bindingError !== null) return bindingError;
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
