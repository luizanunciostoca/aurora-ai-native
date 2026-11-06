import { InteractionSessionSchema, InteractionTurnSchema } from './index';

const SESSION_ID = 'ins_01J00000000000000000000000';
const TURN_1 = 'itr_01J00000000000000000000001';
const TURN_2 = 'itr_01J00000000000000000000002';
const TENANT_ID = 'ten_01J00000000000000000000000';
const IDENTITY_ID = 'idn_01J00000000000000000000000';
const CORRELATION_1 = 'cor_01J00000000000000000000001';
const CORRELATION_2 = 'cor_01J00000000000000000000002';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertThrows(fn: () => unknown, message: string): void {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  assert(threw, message);
}

const refs = {
  artifactRefs: [],
  pendingHumanControlRequestRefs: [],
};

const baseTurn = {
  kind: 'INTERACTION_TURN',
  schemaVersion: 1,
  interactionTurnId: TURN_1,
  interactionSessionId: SESSION_ID,
  sequence: 1,
  role: 'USER',
  modality: 'VOICE',
  correlationId: CORRELATION_1,
  occurredAt: '2026-09-12T12:00:01Z',
  dataClassification: 'CONFIDENTIAL',
  content: {
    kind: 'TEXT',
    text: 'Aumente o volume, por favor.',
    languageTag: 'pt-BR',
    speechConfidence: 0.96,
  },
  references: refs,
  authorizesExecution: false,
  provesExecutionSuccess: false,
  retryAuthorized: false,
};

const parsedTurn = InteractionTurnSchema.parse(baseTurn);
assert(parsedTurn.interactionSessionId === SESSION_ID, 'turn must preserve interaction session');
assert(parsedTurn.content.speechConfidence === 0.96, 'turn must preserve bounded confidence');
assert(parsedTurn.authorizesExecution === false, 'turn must never authorize execution');

assertThrows(
  () => InteractionTurnSchema.parse({ ...baseTurn, authorizesExecution: true }),
  'interaction turn authority promotion must fail closed',
);
assertThrows(
  () =>
    InteractionTurnSchema.parse({
      ...baseTurn,
      content: { ...baseTurn.content, speechConfidence: Number.NaN },
    }),
  'non-finite speech confidence must be rejected',
);
assertThrows(
  () => InteractionTurnSchema.parse({ ...baseTurn, rawAudio: 'forbidden' }),
  'raw audio must not enter interaction turn wire contract',
);

const secondTurn = {
  ...baseTurn,
  interactionTurnId: TURN_2,
  sequence: 2,
  role: 'AURORA',
  correlationId: CORRELATION_2,
  occurredAt: '2026-09-12T12:00:02Z',
  content: {
    kind: 'TEXT',
    text: 'Pronto. Aumentei o volume.',
    languageTag: 'pt-BR',
  },
};

const sessionInput = {
  kind: 'INTERACTION_SESSION',
  schemaVersion: 1,
  interactionSessionId: SESSION_ID,
  tenantId: TENANT_ID,
  participant: {
    kind: 'ACTOR',
    actor: { kind: 'HUMAN', identityId: IDENTITY_ID },
  },
  modality: 'VOICE',
  state: 'ACTIVE',
  createdAt: '2026-09-12T12:00:00Z',
  updatedAt: '2026-09-12T12:00:03Z',
  dataClassification: 'CONFIDENTIAL',
  resume: {
    resumable: true,
    resumeAfterTurnId: TURN_2,
    resumableUntil: '2026-09-12T12:05:00Z',
  },
  references: refs,
  turns: [baseTurn, secondTurn],
  authorizesExecution: false,
  provesExecutionSuccess: false,
  retryAuthorized: false,
};

const session = InteractionSessionSchema.parse(sessionInput);
assert(session.turns.length === 2, 'session must preserve ordered turns');
assert(session.turns[1]?.sequence === 2, 'session sequence must remain ordered');
assert(session.authorizesExecution === false, 'session must never authorize execution');

assertThrows(
  () =>
    InteractionSessionSchema.parse({
      ...sessionInput,
      turns: [{ ...baseTurn, sequence: 2 }],
    }),
  'non-contiguous turn sequence must be rejected',
);
assertThrows(
  () =>
    InteractionSessionSchema.parse({
      ...sessionInput,
      turns: [{ ...baseTurn, interactionSessionId: 'ins_01J00000000000000000000009' }],
    }),
  'cross-session turn injection must be rejected',
);
assertThrows(
  () =>
    InteractionSessionSchema.parse({
      ...sessionInput,
      state: 'ENDED',
      resume: { resumable: true },
    }),
  'ended session must not remain resumable',
);
assertThrows(
  () =>
    InteractionSessionSchema.parse({
      ...sessionInput,
      modality: 'TEXT',
    }),
  'single-modality session must reject incompatible turn modality',
);
