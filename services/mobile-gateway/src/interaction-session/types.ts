import type { DataClassification, Rfc3339Timestamp } from '@aurora/contracts/context';
import type {
  CausationId,
  CorrelationId,
  InteractionSessionId,
  InteractionTurnId,
  TenantId,
} from '@aurora/contracts/ids';
import type {
  InteractionCanonicalReferences,
  InteractionModality,
  InteractionParticipantRef,
  InteractionSession,
  InteractionTextContent,
  InteractionTurnRole,
} from '@aurora/contracts/interaction-session';

export interface StoredInteractionSession {
  readonly revision: number;
  readonly session: InteractionSession;
}

/**
 * Persistence port only. The manager owns W14 interaction-session transitions while the concrete
 * durable store remains a separate persistence concern. compareAndSwap prevents reconnect/turn
 * races from silently overwriting newer conversational state.
 */
export interface InteractionSessionStore {
  read(interactionSessionId: InteractionSessionId): StoredInteractionSession | null;
  create(initial: StoredInteractionSession): boolean;
  compareAndSwap(
    interactionSessionId: InteractionSessionId,
    expectedRevision: number,
    next: StoredInteractionSession,
  ): boolean;
}

export interface InteractionSessionIdFactory {
  sessionId(): InteractionSessionId;
  turnId(): InteractionTurnId;
}

export interface OpenInteractionSessionInput {
  readonly tenantId: TenantId;
  readonly participant: InteractionParticipantRef;
  readonly modality: InteractionModality;
  readonly dataClassification: DataClassification;
  readonly references: InteractionCanonicalReferences;
}

export interface AppendInteractionTurnInput {
  readonly interactionSessionId: InteractionSessionId;
  readonly role: InteractionTurnRole;
  readonly modality: InteractionModality;
  readonly correlationId: CorrelationId;
  readonly causationId?: CausationId;
  readonly dataClassification: DataClassification;
  readonly content: InteractionTextContent;
  readonly references: InteractionCanonicalReferences;
}

export interface SuspendInteractionSessionInput {
  readonly interactionSessionId: InteractionSessionId;
  readonly resumeWindowMs: number;
}

export interface ResumeInteractionSessionInput {
  readonly interactionSessionId: InteractionSessionId;
}

export interface EndInteractionSessionInput {
  readonly interactionSessionId: InteractionSessionId;
}

export type InteractionSessionManagerErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'SESSION_NOT_ACTIVE'
  | 'SESSION_NOT_SUSPENDED'
  | 'RESUME_EXPIRED'
  | 'INVALID_RESUME_WINDOW'
  | 'CLASSIFICATION_DOWNGRADE'
  | 'MODALITY_MISMATCH'
  | 'TURN_LIMIT_REACHED'
  | 'ID_COLLISION'
  | 'REVISION_CONFLICT'
  | 'STORE_REJECTED';

export interface InteractionSessionManagerError {
  readonly ok: false;
  readonly code: InteractionSessionManagerErrorCode;
  readonly message: string;
  readonly retryable: false;
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
}

export interface InteractionSessionManagerSuccess {
  readonly ok: true;
  readonly value: StoredInteractionSession;
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
}

export type InteractionSessionManagerResult = InteractionSessionManagerSuccess | InteractionSessionManagerError;

export type InteractionClock = () => number;

export function asRfc3339Timestamp(epochMs: number): Rfc3339Timestamp {
  if (!Number.isSafeInteger(epochMs) || epochMs < 0) {
    throw new TypeError('interaction clock must return a non-negative safe integer');
  }
  return new Date(epochMs).toISOString() as Rfc3339Timestamp;
}
