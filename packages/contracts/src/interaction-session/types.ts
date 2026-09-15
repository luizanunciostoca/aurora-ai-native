import type { ActorRef, DataClassification, Rfc3339Timestamp } from '../context/index.js';
import type {
  CausationId,
  CorrelationId,
  InteractionSessionId,
  InteractionTurnId,
  TenantId,
} from '../ids/types.js';

export const INTERACTION_MODALITIES = ['VOICE', 'TEXT', 'MULTIMODAL'] as const;
export type InteractionModality = (typeof INTERACTION_MODALITIES)[number];

export const INTERACTION_SESSION_STATES = ['ACTIVE', 'SUSPENDED', 'ENDED'] as const;
export type InteractionSessionState = (typeof INTERACTION_SESSION_STATES)[number];

export const INTERACTION_TURN_ROLES = ['USER', 'AURORA', 'SYSTEM'] as const;
export type InteractionTurnRole = (typeof INTERACTION_TURN_ROLES)[number];

/**
 * Interaction identity is deliberately a reference projection. W14 retains ownership of device,
 * client and transport-session truth; this contract must not mint a second device/session ledger.
 */
export type InteractionParticipantRef =
  | Readonly<{
      kind: 'ACTOR';
      actor: ActorRef;
    }>
  | Readonly<{
      kind: 'DEVICE';
      bindingReference: string;
    }>
  | Readonly<{
      kind: 'CLIENT';
      bindingReference: string;
    }>;

/** Opaque links to canonical owners. References do not copy or reinterpret their state. */
export interface InteractionCanonicalReferences {
  readonly activeObjectiveRef?: string;
  readonly activeTaskRef?: string;
  readonly workspaceRef?: string;
  readonly artifactRefs: readonly string[];
  readonly pendingHumanControlRequestRefs: readonly string[];
}

/**
 * Transport-safe interaction content. Raw audio is intentionally absent: W15 owns microphone/audio
 * lifecycle and may project only the final bounded transcript into the interaction session.
 */
export interface InteractionTextContent {
  readonly kind: 'TEXT';
  readonly text: string;
  readonly languageTag?: string;
  readonly speechConfidence?: number;
}

/**
 * Ordered conversational turn. Intelligence/confidence may explain a turn but can never become
 * PolicyToken/OwnerDecision/execution authority or verified side-effect truth.
 */
export interface InteractionTurn {
  readonly kind: 'INTERACTION_TURN';
  readonly schemaVersion: 1;
  readonly interactionTurnId: InteractionTurnId;
  readonly interactionSessionId: InteractionSessionId;
  readonly sequence: number;
  readonly role: InteractionTurnRole;
  readonly modality: InteractionModality;
  readonly correlationId: CorrelationId;
  readonly causationId?: CausationId;
  readonly occurredAt: Rfc3339Timestamp;
  readonly dataClassification: DataClassification;
  readonly content: InteractionTextContent;
  readonly references: InteractionCanonicalReferences;
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
}

export interface InteractionResumeState {
  readonly resumable: boolean;
  readonly resumeAfterTurnId?: InteractionTurnId;
  readonly resumableUntil?: Rfc3339Timestamp;
}

/**
 * W14-owned conversational continuity only. A session can span many tasks/jobs/actions, but it is
 * never a job/execution session and never carries authority. Canonical domain objects remain links.
 */
export interface InteractionSession {
  readonly kind: 'INTERACTION_SESSION';
  readonly schemaVersion: 1;
  readonly interactionSessionId: InteractionSessionId;
  readonly tenantId: TenantId;
  readonly participant: InteractionParticipantRef;
  readonly modality: InteractionModality;
  readonly state: InteractionSessionState;
  readonly createdAt: Rfc3339Timestamp;
  readonly updatedAt: Rfc3339Timestamp;
  readonly dataClassification: DataClassification;
  readonly resume: InteractionResumeState;
  readonly references: InteractionCanonicalReferences;
  readonly turns: readonly InteractionTurn[];
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
}
