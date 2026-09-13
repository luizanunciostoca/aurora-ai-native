import type { DataClassification, Rfc3339Timestamp } from '../context/index.js';
import type { CorrelationId, InteractionSessionId, TenantId } from '../ids/index.js';
import type { InteractionModality, InteractionTextContent } from '../interaction-session/index.js';

export const AURORA_EXPERIENCE_STATES = [
  'DORMANT',
  'PRESENT',
  'AWAKEN',
  'LISTENING',
  'UNDERSTANDING',
  'RETRIEVING_CONTEXT',
  'REASONING',
  'COORDINATING',
  'WAITING_FOR_APPROVAL',
  'EXECUTING',
  'VERIFYING',
  'SPEAKING',
  'SUCCESS',
  'EXECUTION_UNCERTAIN',
  'DEGRADED',
  'OFFLINE',
] as const;

export const INTERACTION_INPUT_SOURCES = [
  'WAKE_WORD',
  'MANUAL_MIC',
  'TEXT_INPUT',
  'SYSTEM_ASSIST',
  'ACCESSIBILITY',
] as const;

export const VOICE_RUNTIME_HEALTH_STATES = [
  'HEALTHY',
  'DEGRADED',
  'RESTARTING',
  'BLOCKED_PERMISSION',
  'BLOCKED_AUDIO',
  'OFFLINE',
] as const;

export const VOICE_RUNTIME_COMPONENTS = [
  'WAKE_WORD',
  'MICROPHONE',
  'STT',
  'TTS',
  'AUDIO_FOCUS',
  'GATEWAY',
] as const;

export type AuroraExperienceState = (typeof AURORA_EXPERIENCE_STATES)[number];
export type InteractionInputSource = (typeof INTERACTION_INPUT_SOURCES)[number];
export type VoiceRuntimeHealthState = (typeof VOICE_RUNTIME_HEALTH_STATES)[number];
export type VoiceRuntimeComponent = (typeof VOICE_RUNTIME_COMPONENTS)[number];

export interface UnifiedInteractionInput {
  readonly kind: 'UNIFIED_INTERACTION_INPUT';
  readonly schemaVersion: 1;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly interactionSessionId?: InteractionSessionId;
  readonly source: InteractionInputSource;
  readonly modality: InteractionModality;
  readonly content: InteractionTextContent;
  readonly observedAt: Rfc3339Timestamp;
  readonly dataClassification: DataClassification;
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
}

export interface AuroraExperienceStateSnapshot {
  readonly kind: 'AURORA_EXPERIENCE_STATE';
  readonly schemaVersion: 1;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly interactionSessionId?: InteractionSessionId;
  readonly state: AuroraExperienceState;
  readonly observedAt: Rfc3339Timestamp;
  readonly staleAfter?: Rfc3339Timestamp;
  readonly reasonCode?: string;
  readonly reasonReference?: string;
  readonly dataClassification: DataClassification;
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
}

export interface VoiceRuntimeComponentHealth {
  readonly component: VoiceRuntimeComponent;
  readonly state: VoiceRuntimeHealthState;
  readonly reasonCode?: string;
}

export interface VoiceRuntimeHealthSnapshot {
  readonly kind: 'VOICE_RUNTIME_HEALTH';
  readonly schemaVersion: 1;
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly interactionSessionId?: InteractionSessionId;
  readonly state: VoiceRuntimeHealthState;
  readonly components: readonly VoiceRuntimeComponentHealth[];
  readonly observedAt: Rfc3339Timestamp;
  readonly dataClassification: DataClassification;
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
}
