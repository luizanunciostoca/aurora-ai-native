import type { DataClassification } from '@aurora/contracts/context';
import type { InteractionSessionId } from '@aurora/contracts/ids';
import type { InteractionModality, InteractionTextContent } from '@aurora/contracts/interaction-session';

import type { DeviceSessionTrustErrorCode, DeviceSessionTrustResult } from '../device-session/types.js';
import type {
  BeginGatewayRequestInput,
  GatewayProtocolErrorCode,
  GatewayProtocolResult,
  GatewayRequestSnapshot,
} from '../gateway-auth/types.js';
import type {
  InteractionSessionManagerErrorCode,
  InteractionSessionManagerResult,
  StoredInteractionSession,
} from '../interaction-session/types.js';

export const INTERACTION_GATEWAY_MAX_TEXT_CHARS = 4_096;
export const INTERACTION_GATEWAY_MAX_LANGUAGE_TAG_CHARS = 64;

export interface InteractionGatewayAdapterConfig {
  readonly ingressDataClassification: DataClassification;
}

export interface InteractionGatewayBoundInput {
  readonly gatewayRequest: BeginGatewayRequestInput;
  readonly deviceSessionId: string;
}

export interface OpenDeviceInteractionInput extends InteractionGatewayBoundInput {
  readonly modality: InteractionModality;
}

export interface CurrentDeviceInteractionInput extends InteractionGatewayBoundInput {
  readonly interactionSessionId: InteractionSessionId;
}

export interface AppendDeviceUserTurnInput extends CurrentDeviceInteractionInput {
  readonly modality: InteractionModality;
  readonly content: InteractionTextContent;
}

export interface SuspendDeviceInteractionInput extends CurrentDeviceInteractionInput {
  readonly resumeWindowMs: number;
}

export type ResumeDeviceInteractionInput = CurrentDeviceInteractionInput;
export type EndDeviceInteractionInput = CurrentDeviceInteractionInput;

export interface GatewayInteractionRequestPort {
  beginRequest(input: unknown): GatewayProtocolResult<GatewayRequestSnapshot>;
  completeRequest(input: unknown): GatewayProtocolResult<GatewayRequestSnapshot>;
}

export interface DeviceInteractionTrustPort {
  getSession(deviceSessionId: string, connectionId: string, nowMs: number): DeviceSessionTrustResult;
}

export interface InteractionContinuityPort {
  open(input: Parameters<import('../interaction-session/manager.js').InteractionSessionManager['open']>[0]): InteractionSessionManagerResult;
  current(input: Parameters<import('../interaction-session/manager.js').InteractionSessionManager['current']>[0]): InteractionSessionManagerResult;
  appendTurn(input: Parameters<import('../interaction-session/manager.js').InteractionSessionManager['appendTurn']>[0]): InteractionSessionManagerResult;
  suspend(input: Parameters<import('../interaction-session/manager.js').InteractionSessionManager['suspend']>[0]): InteractionSessionManagerResult;
  resume(input: Parameters<import('../interaction-session/manager.js').InteractionSessionManager['resume']>[0]): InteractionSessionManagerResult;
  end(input: Parameters<import('../interaction-session/manager.js').InteractionSessionManager['end']>[0]): InteractionSessionManagerResult;
}

export type InteractionGatewayCauseCode =
  | GatewayProtocolErrorCode
  | DeviceSessionTrustErrorCode
  | InteractionSessionManagerErrorCode;

export type InteractionGatewayErrorCode =
  | 'MALFORMED_REQUEST'
  | 'GATEWAY_REQUEST_REJECTED'
  | 'DEVICE_SESSION_REJECTED'
  | 'DEVICE_SESSION_NOT_ACTIVE'
  | 'GATEWAY_DEVICE_BINDING_MISMATCH'
  | 'INTERACTION_REJECTED'
  | 'REQUEST_COMPLETION_FAILED'
  | 'INTERNAL_FAILURE';

export interface InteractionGatewaySuccess {
  readonly ok: true;
  readonly value: StoredInteractionSession;
  readonly requestCompleted: true;
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
  readonly requiresStateReconciliation: false;
}

export interface InteractionGatewayError {
  readonly ok: false;
  readonly code: InteractionGatewayErrorCode;
  readonly message: string;
  readonly causeCode?: InteractionGatewayCauseCode;
  readonly retryable: boolean;
  readonly requestCompleted: boolean;
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
  readonly requiresStateReconciliation: boolean;
}

export type InteractionGatewayResult = InteractionGatewaySuccess | InteractionGatewayError;
