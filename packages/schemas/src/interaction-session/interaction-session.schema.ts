import {
  INTERACTION_MODALITIES,
  INTERACTION_SESSION_STATES,
  INTERACTION_TURN_ROLES,
  type InteractionCanonicalReferences,
  type InteractionModality,
  type InteractionParticipantRef,
  type InteractionResumeState,
  type InteractionSession,
  type InteractionSessionState,
  type InteractionTextContent,
  type InteractionTurn,
  type InteractionTurnRole,
} from '@aurora/contracts/interaction-session';
import { ActorRefSchema } from '../context/identity.schema';
import { DataClassificationSchema } from '../context/data-classification.schema';
import { Rfc3339TimestampSchema } from '../context/deadline.schema';
import {
  CausationIdSchema,
  CorrelationIdSchema,
  InteractionSessionIdSchema,
  InteractionTurnIdSchema,
  TenantIdSchema,
} from '../ids/id.schemas';
import { asRecord, assertExactKeys, createRuntimeSchema } from '../context/internal';

const MODALITIES = new Set<string>(INTERACTION_MODALITIES);
const SESSION_STATES = new Set<string>(INTERACTION_SESSION_STATES);
const TURN_ROLES = new Set<string>(INTERACTION_TURN_ROLES);
const MAX_TEXT_CHARS = 4_096;
const MAX_REFERENCE_CHARS = 512;
const MAX_REFERENCE_LIST = 64;
const MAX_TURNS = 128;
const MAX_SEQUENCE = 1_000_000;
const LANGUAGE_TAG = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;

function parseEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
  label: string,
): T {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new TypeError(`${label} is invalid`);
  }
  return value as T;
}

function parseBoundedString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new TypeError(`${label} must be a non-empty string of at most ${maxLength} characters`);
  }
  return value;
}

function parseReferenceList(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.length > MAX_REFERENCE_LIST) {
    throw new TypeError(`${label} must be an array with at most ${MAX_REFERENCE_LIST} entries`);
  }
  const parsed = value.map((entry, index) =>
    parseBoundedString(entry, `${label}[${index}]`, MAX_REFERENCE_CHARS),
  );
  if (new Set(parsed).size !== parsed.length) {
    throw new TypeError(`${label} must not contain duplicate references`);
  }
  return Object.freeze(parsed);
}

export const InteractionModalitySchema = createRuntimeSchema<InteractionModality>((value) =>
  parseEnum<InteractionModality>(value, MODALITIES, 'InteractionModality'),
);

export const InteractionSessionStateSchema = createRuntimeSchema<InteractionSessionState>((value) =>
  parseEnum<InteractionSessionState>(value, SESSION_STATES, 'InteractionSessionState'),
);

export const InteractionTurnRoleSchema = createRuntimeSchema<InteractionTurnRole>((value) =>
  parseEnum<InteractionTurnRole>(value, TURN_ROLES, 'InteractionTurnRole'),
);

export const InteractionParticipantRefSchema = createRuntimeSchema<InteractionParticipantRef>(
  (value) => {
    const record = asRecord(value, 'InteractionParticipantRef');
    if (record.kind === 'ACTOR') {
      assertExactKeys(record, ['kind', 'actor'], ['kind', 'actor'], 'InteractionParticipantRef');
      return { kind: 'ACTOR', actor: ActorRefSchema.parse(record.actor) };
    }
    if (record.kind === 'DEVICE' || record.kind === 'CLIENT') {
      assertExactKeys(
        record,
        ['kind', 'bindingReference'],
        ['kind', 'bindingReference'],
        'InteractionParticipantRef',
      );
      return {
        kind: record.kind,
        bindingReference: parseBoundedString(
          record.bindingReference,
          'InteractionParticipantRef.bindingReference',
          MAX_REFERENCE_CHARS,
        ),
      };
    }
    throw new TypeError('InteractionParticipantRef.kind is invalid');
  },
);

export const InteractionCanonicalReferencesSchema =
  createRuntimeSchema<InteractionCanonicalReferences>((value) => {
    const record = asRecord(value, 'InteractionCanonicalReferences');
    assertExactKeys(
      record,
      [
        'activeObjectiveRef',
        'activeTaskRef',
        'workspaceRef',
        'artifactRefs',
        'pendingHumanControlRequestRefs',
      ],
      ['artifactRefs', 'pendingHumanControlRequestRefs'],
      'InteractionCanonicalReferences',
    );
    return {
      ...(record.activeObjectiveRef === undefined
        ? {}
        : {
            activeObjectiveRef: parseBoundedString(
              record.activeObjectiveRef,
              'InteractionCanonicalReferences.activeObjectiveRef',
              MAX_REFERENCE_CHARS,
            ),
          }),
      ...(record.activeTaskRef === undefined
        ? {}
        : {
            activeTaskRef: parseBoundedString(
              record.activeTaskRef,
              'InteractionCanonicalReferences.activeTaskRef',
              MAX_REFERENCE_CHARS,
            ),
          }),
      ...(record.workspaceRef === undefined
        ? {}
        : {
            workspaceRef: parseBoundedString(
              record.workspaceRef,
              'InteractionCanonicalReferences.workspaceRef',
              MAX_REFERENCE_CHARS,
            ),
          }),
      artifactRefs: parseReferenceList(
        record.artifactRefs,
        'InteractionCanonicalReferences.artifactRefs',
      ),
      pendingHumanControlRequestRefs: parseReferenceList(
        record.pendingHumanControlRequestRefs,
        'InteractionCanonicalReferences.pendingHumanControlRequestRefs',
      ),
    };
  });

export const InteractionTextContentSchema = createRuntimeSchema<InteractionTextContent>((value) => {
  const record = asRecord(value, 'InteractionTextContent');
  assertExactKeys(
    record,
    ['kind', 'text', 'languageTag', 'speechConfidence'],
    ['kind', 'text'],
    'InteractionTextContent',
  );
  if (record.kind !== 'TEXT') throw new TypeError('InteractionTextContent.kind is invalid');
  const text = parseBoundedString(record.text, 'InteractionTextContent.text', MAX_TEXT_CHARS);
  let languageTag: string | undefined;
  if (record.languageTag !== undefined) {
    languageTag = parseBoundedString(record.languageTag, 'InteractionTextContent.languageTag', 64);
    if (!LANGUAGE_TAG.test(languageTag)) {
      throw new TypeError('InteractionTextContent.languageTag is invalid');
    }
  }
  let speechConfidence: number | undefined;
  if (record.speechConfidence !== undefined) {
    if (
      typeof record.speechConfidence !== 'number' ||
      !Number.isFinite(record.speechConfidence) ||
      record.speechConfidence < 0 ||
      record.speechConfidence > 1
    ) {
      throw new TypeError('InteractionTextContent.speechConfidence must be finite within 0..1');
    }
    speechConfidence = record.speechConfidence;
  }
  return {
    kind: 'TEXT',
    text,
    ...(languageTag === undefined ? {} : { languageTag }),
    ...(speechConfidence === undefined ? {} : { speechConfidence }),
  };
});

export const InteractionTurnSchema = createRuntimeSchema<InteractionTurn>((value) => {
  const record = asRecord(value, 'InteractionTurn');
  assertExactKeys(
    record,
    [
      'kind',
      'schemaVersion',
      'interactionTurnId',
      'interactionSessionId',
      'sequence',
      'role',
      'modality',
      'correlationId',
      'causationId',
      'occurredAt',
      'dataClassification',
      'content',
      'references',
      'authorizesExecution',
      'provesExecutionSuccess',
      'retryAuthorized',
    ],
    [
      'kind',
      'schemaVersion',
      'interactionTurnId',
      'interactionSessionId',
      'sequence',
      'role',
      'modality',
      'correlationId',
      'occurredAt',
      'dataClassification',
      'content',
      'references',
      'authorizesExecution',
      'provesExecutionSuccess',
      'retryAuthorized',
    ],
    'InteractionTurn',
  );
  if (record.kind !== 'INTERACTION_TURN' || record.schemaVersion !== 1) {
    throw new TypeError('InteractionTurn kind/schemaVersion is invalid');
  }
  if (!Number.isSafeInteger(record.sequence) || Number(record.sequence) < 1 || Number(record.sequence) > MAX_SEQUENCE) {
    throw new TypeError('InteractionTurn.sequence is invalid');
  }
  if (
    record.authorizesExecution !== false ||
    record.provesExecutionSuccess !== false ||
    record.retryAuthorized !== false
  ) {
    throw new TypeError('InteractionTurn cannot carry authority, verified outcome, or retry authority');
  }
  return {
    kind: 'INTERACTION_TURN',
    schemaVersion: 1,
    interactionTurnId: InteractionTurnIdSchema.parse(record.interactionTurnId),
    interactionSessionId: InteractionSessionIdSchema.parse(record.interactionSessionId),
    sequence: Number(record.sequence),
    role: InteractionTurnRoleSchema.parse(record.role),
    modality: InteractionModalitySchema.parse(record.modality),
    correlationId: CorrelationIdSchema.parse(record.correlationId),
    ...(record.causationId === undefined
      ? {}
      : { causationId: CausationIdSchema.parse(record.causationId) }),
    occurredAt: Rfc3339TimestampSchema.parse(record.occurredAt),
    dataClassification: DataClassificationSchema.parse(record.dataClassification),
    content: InteractionTextContentSchema.parse(record.content),
    references: InteractionCanonicalReferencesSchema.parse(record.references),
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
});

export const InteractionResumeStateSchema = createRuntimeSchema<InteractionResumeState>((value) => {
  const record = asRecord(value, 'InteractionResumeState');
  assertExactKeys(
    record,
    ['resumable', 'resumeAfterTurnId', 'resumableUntil'],
    ['resumable'],
    'InteractionResumeState',
  );
  if (typeof record.resumable !== 'boolean') {
    throw new TypeError('InteractionResumeState.resumable must be boolean');
  }
  if (!record.resumable && (record.resumeAfterTurnId !== undefined || record.resumableUntil !== undefined)) {
    throw new TypeError('non-resumable interaction cannot carry resume cursor or expiry');
  }
  return {
    resumable: record.resumable,
    ...(record.resumeAfterTurnId === undefined
      ? {}
      : { resumeAfterTurnId: InteractionTurnIdSchema.parse(record.resumeAfterTurnId) }),
    ...(record.resumableUntil === undefined
      ? {}
      : { resumableUntil: Rfc3339TimestampSchema.parse(record.resumableUntil) }),
  };
});

export const InteractionSessionSchema = createRuntimeSchema<InteractionSession>((value) => {
  const record = asRecord(value, 'InteractionSession');
  assertExactKeys(
    record,
    [
      'kind',
      'schemaVersion',
      'interactionSessionId',
      'tenantId',
      'participant',
      'modality',
      'state',
      'createdAt',
      'updatedAt',
      'dataClassification',
      'resume',
      'references',
      'turns',
      'authorizesExecution',
      'provesExecutionSuccess',
      'retryAuthorized',
    ],
    [
      'kind',
      'schemaVersion',
      'interactionSessionId',
      'tenantId',
      'participant',
      'modality',
      'state',
      'createdAt',
      'updatedAt',
      'dataClassification',
      'resume',
      'references',
      'turns',
      'authorizesExecution',
      'provesExecutionSuccess',
      'retryAuthorized',
    ],
    'InteractionSession',
  );
  if (record.kind !== 'INTERACTION_SESSION' || record.schemaVersion !== 1) {
    throw new TypeError('InteractionSession kind/schemaVersion is invalid');
  }
  if (
    record.authorizesExecution !== false ||
    record.provesExecutionSuccess !== false ||
    record.retryAuthorized !== false
  ) {
    throw new TypeError('InteractionSession cannot carry authority, verified outcome, or retry authority');
  }
  if (!Array.isArray(record.turns) || record.turns.length > MAX_TURNS) {
    throw new TypeError(`InteractionSession.turns must contain at most ${MAX_TURNS} turns`);
  }

  const interactionSessionId = InteractionSessionIdSchema.parse(record.interactionSessionId);
  const modality = InteractionModalitySchema.parse(record.modality);
  const state = InteractionSessionStateSchema.parse(record.state);
  const createdAt = Rfc3339TimestampSchema.parse(record.createdAt);
  const updatedAt = Rfc3339TimestampSchema.parse(record.updatedAt);
  if (Date.parse(updatedAt) < Date.parse(createdAt)) {
    throw new TypeError('InteractionSession.updatedAt cannot precede createdAt');
  }

  let previousOccurredAt = Date.parse(createdAt);
  const turns = record.turns.map((candidate, index) => {
    const turn = InteractionTurnSchema.parse(candidate);
    if (turn.interactionSessionId !== interactionSessionId) {
      throw new TypeError('InteractionTurn belongs to a different interaction session');
    }
    if (turn.sequence !== index + 1) {
      throw new TypeError('InteractionSession turns must have contiguous ordered sequence values');
    }
    if (modality !== 'MULTIMODAL' && turn.modality !== modality) {
      throw new TypeError('InteractionTurn modality is incompatible with its session');
    }
    const occurredAt = Date.parse(turn.occurredAt);
    if (occurredAt < previousOccurredAt || occurredAt > Date.parse(updatedAt)) {
      throw new TypeError('InteractionTurn timestamp is outside ordered session bounds');
    }
    previousOccurredAt = occurredAt;
    return turn;
  });

  const resume = InteractionResumeStateSchema.parse(record.resume);
  if (state === 'ENDED' && resume.resumable) {
    throw new TypeError('ended interaction session cannot remain resumable');
  }
  if (
    resume.resumeAfterTurnId !== undefined &&
    !turns.some((turn) => turn.interactionTurnId === resume.resumeAfterTurnId)
  ) {
    throw new TypeError('resumeAfterTurnId must reference a turn in the interaction session');
  }

  return {
    kind: 'INTERACTION_SESSION',
    schemaVersion: 1,
    interactionSessionId,
    tenantId: TenantIdSchema.parse(record.tenantId),
    participant: InteractionParticipantRefSchema.parse(record.participant),
    modality,
    state,
    createdAt,
    updatedAt,
    dataClassification: DataClassificationSchema.parse(record.dataClassification),
    resume,
    references: InteractionCanonicalReferencesSchema.parse(record.references),
    turns: Object.freeze(turns),
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
});
