import type { DataClassification } from '@aurora/contracts/context';
import type { InteractionSessionId } from '@aurora/contracts/ids';
import type {
  InteractionCanonicalReferences,
  InteractionModality,
  InteractionParticipantRef,
  InteractionTextContent,
} from '@aurora/contracts/interaction-session';

import type { DeviceSessionTrustSnapshot } from '../device-session/types.js';
import type { BeginGatewayRequestInput } from '../gateway-auth/types.js';
import type { InteractionSessionManagerResult } from '../interaction-session/types.js';
import {
  INTERACTION_GATEWAY_MAX_LANGUAGE_TAG_CHARS,
  INTERACTION_GATEWAY_MAX_TEXT_CHARS,
  type AppendDeviceUserTurnInput,
  type CurrentDeviceInteractionInput,
  type DeviceInteractionTrustPort,
  type EndDeviceInteractionInput,
  type GatewayInteractionRequestPort,
  type InteractionContinuityPort,
  type InteractionGatewayAdapterConfig,
  type InteractionGatewayBoundInput,
  type InteractionGatewayError,
  type InteractionGatewayErrorCode,
  type InteractionGatewayResult,
  type OpenDeviceInteractionInput,
  type ResumeDeviceInteractionInput,
  type SuspendDeviceInteractionInput,
} from './types.js';

const DATA_CLASSIFICATIONS = new Set<DataClassification>([
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED',
]);
const MODALITIES = new Set<InteractionModality>(['VOICE', 'TEXT', 'MULTIMODAL']);
const INTERACTION_SESSION_ID = /^ins_[0-9A-HJKMNP-TV-Z]{26}$/u;
const LANGUAGE_TAG = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;
const SAFE_TOKEN = /^[A-Za-z0-9._:/-]+$/u;
const EMPTY_REFERENCES: InteractionCanonicalReferences = Object.freeze({
  artifactRefs: Object.freeze([]),
  pendingHumanControlRequestRefs: Object.freeze([]),
});

interface TrustedInteractionBinding {
  readonly tenantId: DeviceSessionTrustSnapshot['tenantId'];
  readonly participant: InteractionParticipantRef;
  readonly correlationId: DeviceSessionTrustSnapshot['correlationId'];
}

interface OperationAttempt {
  readonly result?: InteractionSessionManagerResult;
  readonly error?: InteractionGatewayError;
  readonly interactionMayHaveChanged: boolean;
}

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

function hasExactKeys(
  record: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  const actual = Object.keys(record);
  return required.every((key) => actual.includes(key)) && actual.every((key) => allowed.has(key));
}

function isBoundedToken(value: unknown, maxLength = 256): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    SAFE_TOKEN.test(value)
  );
}

function parseGatewayRequest(value: unknown): BeginGatewayRequestInput | null {
  if (
    !isPlainDataRecord(value) ||
    !hasExactKeys(value, [
      'protocolVersion',
      'sessionId',
      'connectionId',
      'requestId',
      'tenantId',
      'actorIdentityId',
      'correlationId',
      'deadlineMs',
      'nowMs',
    ]) ||
    typeof value.protocolVersion !== 'string' ||
    !isBoundedToken(value.sessionId) ||
    !isBoundedToken(value.connectionId) ||
    !isBoundedToken(value.requestId) ||
    !isBoundedToken(value.tenantId) ||
    !isBoundedToken(value.actorIdentityId) ||
    !isBoundedToken(value.correlationId) ||
    typeof value.deadlineMs !== 'number' ||
    !Number.isSafeInteger(value.deadlineMs) ||
    typeof value.nowMs !== 'number' ||
    !Number.isSafeInteger(value.nowMs)
  ) {
    return null;
  }
  return value as unknown as BeginGatewayRequestInput;
}

function parseCommon(
  value: Record<string, unknown>,
): Pick<InteractionGatewayBoundInput, 'gatewayRequest' | 'deviceSessionId'> | null {
  const gatewayRequest = parseGatewayRequest(value.gatewayRequest);
  if (gatewayRequest === null || !isBoundedToken(value.deviceSessionId)) return null;
  return { gatewayRequest, deviceSessionId: value.deviceSessionId };
}

function parseModality(value: unknown): InteractionModality | null {
  return typeof value === 'string' && MODALITIES.has(value as InteractionModality)
    ? (value as InteractionModality)
    : null;
}

function parseInteractionSessionId(value: unknown): InteractionSessionId | null {
  return typeof value === 'string' && INTERACTION_SESSION_ID.test(value)
    ? (value as InteractionSessionId)
    : null;
}

function parseContent(value: unknown): InteractionTextContent | null {
  if (
    !isPlainDataRecord(value) ||
    !hasExactKeys(value, ['kind', 'text'], ['languageTag', 'speechConfidence']) ||
    value.kind !== 'TEXT' ||
    typeof value.text !== 'string' ||
    value.text.trim().length === 0 ||
    value.text.length > INTERACTION_GATEWAY_MAX_TEXT_CHARS
  ) {
    return null;
  }
  if (
    value.languageTag !== undefined &&
    (typeof value.languageTag !== 'string' ||
      value.languageTag.length === 0 ||
      value.languageTag.length > INTERACTION_GATEWAY_MAX_LANGUAGE_TAG_CHARS ||
      !LANGUAGE_TAG.test(value.languageTag))
  ) {
    return null;
  }
  if (
    value.speechConfidence !== undefined &&
    (typeof value.speechConfidence !== 'number' ||
      !Number.isFinite(value.speechConfidence) ||
      value.speechConfidence < 0 ||
      value.speechConfidence > 1)
  ) {
    return null;
  }
  return Object.freeze({
    kind: 'TEXT',
    text: value.text,
    ...(value.languageTag === undefined ? {} : { languageTag: value.languageTag }),
    ...(value.speechConfidence === undefined ? {} : { speechConfidence: value.speechConfidence }),
  }) as InteractionTextContent;
}

function parseOpen(value: unknown): OpenDeviceInteractionInput | null {
  if (
    !isPlainDataRecord(value) ||
    !hasExactKeys(value, ['gatewayRequest', 'deviceSessionId', 'modality'])
  ) {
    return null;
  }
  const common = parseCommon(value);
  const modality = parseModality(value.modality);
  return common === null || modality === null ? null : { ...common, modality };
}

function parseCurrent(value: unknown): CurrentDeviceInteractionInput | null {
  if (
    !isPlainDataRecord(value) ||
    !hasExactKeys(value, ['gatewayRequest', 'deviceSessionId', 'interactionSessionId'])
  ) {
    return null;
  }
  const common = parseCommon(value);
  const interactionSessionId = parseInteractionSessionId(value.interactionSessionId);
  return common === null || interactionSessionId === null
    ? null
    : { ...common, interactionSessionId };
}

function parseAppend(value: unknown): AppendDeviceUserTurnInput | null {
  if (
    !isPlainDataRecord(value) ||
    !hasExactKeys(value, [
      'gatewayRequest',
      'deviceSessionId',
      'interactionSessionId',
      'modality',
      'content',
    ])
  ) {
    return null;
  }
  const common = parseCommon(value);
  const interactionSessionId = parseInteractionSessionId(value.interactionSessionId);
  const modality = parseModality(value.modality);
  const content = parseContent(value.content);
  return common === null || interactionSessionId === null || modality === null || content === null
    ? null
    : { ...common, interactionSessionId, modality, content };
}

function parseSuspend(value: unknown): SuspendDeviceInteractionInput | null {
  if (
    !isPlainDataRecord(value) ||
    !hasExactKeys(value, [
      'gatewayRequest',
      'deviceSessionId',
      'interactionSessionId',
      'resumeWindowMs',
    ])
  ) {
    return null;
  }
  const current = parseCurrent({
    gatewayRequest: value.gatewayRequest,
    deviceSessionId: value.deviceSessionId,
    interactionSessionId: value.interactionSessionId,
  });
  return current === null || !Number.isSafeInteger(value.resumeWindowMs)
    ? null
    : { ...current, resumeWindowMs: value.resumeWindowMs as number };
}

function error(
  code: InteractionGatewayErrorCode,
  message: string,
  options: Partial<
    Pick<
      InteractionGatewayError,
      'causeCode' | 'retryable' | 'requestCompleted' | 'requiresStateReconciliation'
    >
  > = {},
): InteractionGatewayError {
  return {
    ok: false,
    code,
    message,
    ...(options.causeCode === undefined ? {} : { causeCode: options.causeCode }),
    retryable: options.retryable ?? false,
    requestCompleted: options.requestCompleted ?? false,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
    requiresStateReconciliation: options.requiresStateReconciliation ?? false,
  };
}

function malformed(message: string): InteractionGatewayError {
  return error('MALFORMED_REQUEST', message);
}

function participantFrom(snapshot: DeviceSessionTrustSnapshot): InteractionParticipantRef {
  return Object.freeze({
    kind: 'DEVICE' as const,
    bindingReference: `device:${snapshot.deviceRef.deviceId}:registration:${snapshot.deviceRef.registrationVersion}`,
  });
}

function trustedBinding(
  snapshot: DeviceSessionTrustSnapshot,
  input: InteractionGatewayBoundInput,
): TrustedInteractionBinding | InteractionGatewayError {
  if (snapshot.state !== 'ACTIVE') {
    return error('DEVICE_SESSION_NOT_ACTIVE', 'Current W14 device session is not active.');
  }
  if (
    snapshot.deviceSessionId !== input.deviceSessionId ||
    snapshot.gatewaySessionId !== input.gatewayRequest.sessionId ||
    snapshot.connectionId !== input.gatewayRequest.connectionId ||
    snapshot.tenantId !== input.gatewayRequest.tenantId ||
    snapshot.deviceRef.tenantId !== input.gatewayRequest.tenantId ||
    snapshot.actorIdentityId !== input.gatewayRequest.actorIdentityId ||
    snapshot.correlationId !== input.gatewayRequest.correlationId ||
    snapshot.authorizesExecution !== false ||
    snapshot.canGrantPermission !== false
  ) {
    return error(
      'GATEWAY_DEVICE_BINDING_MISMATCH',
      'Current W14 gateway and device-session bindings do not match.',
    );
  }
  return {
    tenantId: snapshot.tenantId,
    participant: participantFrom(snapshot),
    correlationId: snapshot.correlationId,
  };
}

export class InteractionGatewayAdapter {
  readonly #gateway: GatewayInteractionRequestPort;
  readonly #deviceTrust: DeviceInteractionTrustPort;
  readonly #interaction: InteractionContinuityPort;
  readonly #classification: DataClassification;

  constructor(
    gateway: GatewayInteractionRequestPort,
    deviceTrust: DeviceInteractionTrustPort,
    interaction: InteractionContinuityPort,
    config: InteractionGatewayAdapterConfig,
  ) {
    if (!DATA_CLASSIFICATIONS.has(config.ingressDataClassification)) {
      throw new TypeError('interaction gateway ingress classification is invalid');
    }
    this.#gateway = gateway;
    this.#deviceTrust = deviceTrust;
    this.#interaction = interaction;
    this.#classification = config.ingressDataClassification;
  }

  open(input: unknown): InteractionGatewayResult {
    const parsed = parseOpen(input);
    if (parsed === null) return malformed('Open interaction request is malformed.');
    return this.#withBoundRequest(parsed, true, (binding) =>
      this.#interaction.open({
        tenantId: binding.tenantId,
        participant: binding.participant,
        modality: parsed.modality,
        dataClassification: this.#classification,
        references: EMPTY_REFERENCES,
      }),
    );
  }

  current(input: unknown): InteractionGatewayResult {
    const parsed = parseCurrent(input);
    if (parsed === null) return malformed('Current interaction request is malformed.');
    return this.#withBoundRequest(parsed, false, (binding) =>
      this.#interaction.current({
        interactionSessionId: parsed.interactionSessionId,
        tenantId: binding.tenantId,
        participant: binding.participant,
      }),
    );
  }

  appendUserTurn(input: unknown): InteractionGatewayResult {
    const parsed = parseAppend(input);
    if (parsed === null) return malformed('Append interaction turn request is malformed.');
    return this.#withBoundRequest(parsed, true, (binding) =>
      this.#interaction.appendTurn({
        interactionSessionId: parsed.interactionSessionId,
        tenantId: binding.tenantId,
        participant: binding.participant,
        role: 'USER',
        modality: parsed.modality,
        correlationId: binding.correlationId,
        dataClassification: this.#classification,
        content: parsed.content,
        references: EMPTY_REFERENCES,
      }),
    );
  }

  suspend(input: unknown): InteractionGatewayResult {
    const parsed = parseSuspend(input);
    if (parsed === null) return malformed('Suspend interaction request is malformed.');
    return this.#withBoundRequest(parsed, true, (binding) =>
      this.#interaction.suspend({
        interactionSessionId: parsed.interactionSessionId,
        tenantId: binding.tenantId,
        participant: binding.participant,
        resumeWindowMs: parsed.resumeWindowMs,
      }),
    );
  }

  resume(input: unknown): InteractionGatewayResult {
    const parsed = parseCurrent(input) as ResumeDeviceInteractionInput | null;
    if (parsed === null) return malformed('Resume interaction request is malformed.');
    return this.#withBoundRequest(parsed, true, (binding) =>
      this.#interaction.resume({
        interactionSessionId: parsed.interactionSessionId,
        tenantId: binding.tenantId,
        participant: binding.participant,
      }),
    );
  }

  end(input: unknown): InteractionGatewayResult {
    const parsed = parseCurrent(input) as EndDeviceInteractionInput | null;
    if (parsed === null) return malformed('End interaction request is malformed.');
    return this.#withBoundRequest(parsed, true, (binding) =>
      this.#interaction.end({
        interactionSessionId: parsed.interactionSessionId,
        tenantId: binding.tenantId,
        participant: binding.participant,
      }),
    );
  }

  #withBoundRequest(
    input: InteractionGatewayBoundInput,
    mayMutate: boolean,
    operation: (binding: TrustedInteractionBinding) => InteractionSessionManagerResult,
  ): InteractionGatewayResult {
    let begun;
    try {
      begun = this.#gateway.beginRequest(input.gatewayRequest);
    } catch {
      return error('GATEWAY_REQUEST_REJECTED', 'Gateway request validation failed closed.');
    }
    if (!begun.ok) {
      return error('GATEWAY_REQUEST_REJECTED', 'Gateway request was rejected.', {
        causeCode: begun.error.code,
        retryable: begun.error.retryable,
      });
    }

    let attempt: OperationAttempt;
    try {
      const trust = this.#deviceTrust.getSession(
        input.deviceSessionId,
        input.gatewayRequest.connectionId,
        input.gatewayRequest.nowMs,
      );
      if (!trust.ok) {
        attempt = {
          error: error('DEVICE_SESSION_REJECTED', 'Current W14 device session was rejected.', {
            causeCode: trust.error.code,
            retryable: trust.error.retryable,
          }),
          interactionMayHaveChanged: false,
        };
      } else {
        const binding = trustedBinding(trust.snapshot, input);
        if ('ok' in binding && binding.ok === false) {
          attempt = { error: binding, interactionMayHaveChanged: false };
        } else {
          attempt = {
            result: operation(binding as TrustedInteractionBinding),
            interactionMayHaveChanged: mayMutate,
          };
        }
      }
    } catch {
      attempt = {
        error: error('INTERNAL_FAILURE', 'Interaction gateway operation failed closed.'),
        interactionMayHaveChanged: mayMutate,
      };
    }

    let completed;
    try {
      completed = this.#gateway.completeRequest({
        protocolVersion: input.gatewayRequest.protocolVersion,
        sessionId: input.gatewayRequest.sessionId,
        connectionId: input.gatewayRequest.connectionId,
        requestId: input.gatewayRequest.requestId,
        tenantId: input.gatewayRequest.tenantId,
        actorIdentityId: input.gatewayRequest.actorIdentityId,
        correlationId: input.gatewayRequest.correlationId,
        nowMs: input.gatewayRequest.nowMs,
      });
    } catch {
      return error('REQUEST_COMPLETION_FAILED', 'Gateway request completion failed closed.', {
        requiresStateReconciliation: attempt.interactionMayHaveChanged,
      });
    }
    if (!completed.ok) {
      return error('REQUEST_COMPLETION_FAILED', 'Gateway request completion was rejected.', {
        causeCode: completed.error.code,
        requiresStateReconciliation: attempt.interactionMayHaveChanged,
      });
    }

    if (attempt.error !== undefined) {
      return { ...attempt.error, requestCompleted: true };
    }
    if (attempt.result === undefined) {
      return error('INTERNAL_FAILURE', 'Interaction gateway produced no result.', {
        requestCompleted: true,
        requiresStateReconciliation: attempt.interactionMayHaveChanged,
      });
    }
    if (!attempt.result.ok) {
      return error('INTERACTION_REJECTED', attempt.result.message, {
        causeCode: attempt.result.code,
        retryable: attempt.result.retryable,
        requestCompleted: true,
        requiresStateReconciliation: attempt.result.retryable,
      });
    }
    return {
      ok: true,
      value: attempt.result.value,
      requestCompleted: true,
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
      requiresStateReconciliation: false,
    };
  }
}
