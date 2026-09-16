import {
  VoiceProjectionNetworkBoundary,
  type GovernedVoiceProjection,
  type VoiceProjectionNetworkResponse,
} from './voice-projection-network.js';

const VOICE_CANDIDATE_KEYS = new Set([
  'commandId',
  'capabilityId',
  'normalizedTranscript',
  'requiresW07Authorization',
  'authorizesExecution',
]);

const MAX_IDENTIFIER_LENGTH = 256;
const MAX_TRANSCRIPT_LENGTH = 512;
const SAFE = /^[A-Za-z0-9._:/+-]+$/u;
const EXECUTION_ID = /^exe_[0-9A-HJKMNP-TV-Z]{26}$/u;

export interface VoiceCandidateSocketContext {
  readonly tenantId: string;
  readonly actorIdentityId: string;
  readonly correlationId: string;
  readonly gatewaySessionId: string;
  readonly connectionId: string;
  readonly deviceSessionId: string;
  readonly deviceId: string;
  readonly registrationVersion: number;
}

interface VoiceCandidateForEvaluation {
  readonly commandId: string;
  readonly capabilityId: string;
  readonly normalizedTranscript: string;
  readonly requiresW07Authorization: true;
  readonly authorizesExecution: false;
}

export interface VoiceDeviceExecutionAuthorization {
  readonly kind: 'W07_DEVICE_EXECUTION_AUTHORIZATION';
  readonly executionId: string;
  readonly tenantId: string;
  readonly deviceId: string;
  readonly capabilityId: string;
  readonly targetKind: 'DEVICE';
  readonly authoritySource: 'W07_CURRENT_EXECUTION_AUTHORITY';
  readonly actionId: string;
  readonly arguments: Readonly<Record<string, string>>;
  readonly authorizedAtMs: number;
  readonly expiresAtMs: number;
  readonly authorizesExecution: true;
  readonly cancelled: false;
}

export interface VoiceCandidateIntakePort {
  evaluate(input: {
    readonly candidate: VoiceCandidateForEvaluation;
    readonly context: VoiceCandidateSocketContext;
  }): unknown;
  /** Optional current W04 projection supplied by the trusted provider. */
  currentProjection?(input: {
    readonly context: VoiceCandidateSocketContext;
    readonly nowMs: number;
  }): GovernedVoiceProjection | null;
  /** Optional W07-owned authorization issued only after the dispatch gates pass. */
  currentExecutionAuthorization?(input: {
    readonly commandId: string;
    readonly executionId: string;
    readonly context: VoiceCandidateSocketContext;
    readonly nowMs: number;
  }): VoiceDeviceExecutionAuthorization | null;
}

export interface VoiceCandidateNetworkResponse {
  readonly statusCode: number;
  readonly body: Readonly<Record<string, unknown>>;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
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

function boundedText(value: unknown, maximum = MAX_IDENTIFIER_LENGTH): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    value === value.trim()
  );
}

function hasOnlyKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: ReadonlySet<string>,
): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function validContext(context: VoiceCandidateSocketContext): boolean {
  return (
    boundedText(context.tenantId) &&
    boundedText(context.actorIdentityId) &&
    boundedText(context.correlationId) &&
    boundedText(context.gatewaySessionId) &&
    boundedText(context.connectionId) &&
    boundedText(context.deviceSessionId) &&
    boundedText(context.deviceId) &&
    Number.isSafeInteger(context.registrationVersion) &&
    context.registrationVersion > 0
  );
}

function nonAuthorityBody(
  ok: boolean,
  acceptedForEvaluation: boolean,
  code?: string,
): Readonly<Record<string, unknown>> {
  return {
    ok,
    acceptedForEvaluation,
    ...(code === undefined ? {} : { voiceCandidateError: { code } }),
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

function parseCandidate(body: unknown): VoiceCandidateForEvaluation | null {
  if (!isPlainRecord(body) || !hasOnlyKeys(body, VOICE_CANDIDATE_KEYS)) return null;
  if (
    !boundedText(body.commandId) ||
    !boundedText(body.capabilityId) ||
    !boundedText(body.normalizedTranscript, MAX_TRANSCRIPT_LENGTH) ||
    body.normalizedTranscript !== body.normalizedTranscript.toLowerCase() ||
    body.requiresW07Authorization !== true ||
    body.authorizesExecution !== false
  ) {
    return null;
  }
  return {
    commandId: body.commandId,
    capabilityId: body.capabilityId,
    normalizedTranscript: body.normalizedTranscript,
    requiresW07Authorization: true,
    authorizesExecution: false,
  };
}

function validExecutionAuthorization(
  value: VoiceDeviceExecutionAuthorization,
  input: {
    readonly executionId: string;
    readonly context: VoiceCandidateSocketContext;
    readonly nowMs: number;
  },
): boolean {
  return (
    value.kind === 'W07_DEVICE_EXECUTION_AUTHORIZATION' &&
    EXECUTION_ID.test(value.executionId) &&
    value.executionId === input.executionId &&
    value.tenantId === input.context.tenantId &&
    value.deviceId === input.context.deviceId &&
    boundedText(value.capabilityId) &&
    value.targetKind === 'DEVICE' &&
    value.authoritySource === 'W07_CURRENT_EXECUTION_AUTHORITY' &&
    boundedText(value.actionId) &&
    Object.entries(value.arguments).length <= 16 &&
    Object.entries(value.arguments).every(
      ([key, item]) => SAFE.test(key) && key.length <= 128 && SAFE.test(item) && item.length <= 256,
    ) &&
    Number.isSafeInteger(value.authorizedAtMs) &&
    Number.isSafeInteger(value.expiresAtMs) &&
    value.authorizedAtMs >= 0 &&
    value.authorizedAtMs <= input.nowMs &&
    input.nowMs < value.expiresAtMs &&
    value.expiresAtMs - value.authorizedAtMs <= 30_000 &&
    value.authorizesExecution === true &&
    value.cancelled === false
  );
}

/**
 * W14-owned transport composition leaf for W15-G -> W07 voice evaluation, current W04 projection,
 * and transport of the short-lived W07 execution authorization after all W07 gates pass.
 */
export class VoiceCandidateNetworkBoundary {
  readonly #intake: VoiceCandidateIntakePort;

  constructor(intake: VoiceCandidateIntakePort) {
    this.#intake = intake;
  }

  evaluate(body: unknown, context: VoiceCandidateSocketContext): VoiceCandidateNetworkResponse {
    const candidate = parseCandidate(body);
    if (candidate === null) {
      return { statusCode: 400, body: nonAuthorityBody(false, false, 'BODY_MALFORMED') };
    }
    if (!validContext(context)) {
      return {
        statusCode: 409,
        body: nonAuthorityBody(false, false, 'AUTHENTICATED_CONTEXT_NOT_CURRENT'),
      };
    }

    let result: unknown;
    try {
      result = this.#intake.evaluate({ candidate, context });
    } catch {
      return {
        statusCode: 503,
        body: nonAuthorityBody(false, false, 'W07_INGRESS_UNAVAILABLE'),
      };
    }
    if (!isPlainRecord(result)) {
      return {
        statusCode: 503,
        body: nonAuthorityBody(false, false, 'W07_PROTOCOL_VIOLATION'),
      };
    }
    if (
      result.authorizesExecution !== false ||
      result.provesExecutionSuccess !== false ||
      result.retryAuthorized !== false
    ) {
      return {
        statusCode: 503,
        body: nonAuthorityBody(false, false, 'W07_PROTOCOL_VIOLATION'),
      };
    }
    if (result.ok !== true || result.acceptedForEvaluation !== true) {
      return {
        statusCode: 409,
        body: nonAuthorityBody(false, false, 'W07_EVALUATION_REJECTED'),
      };
    }

    return { statusCode: 202, body: nonAuthorityBody(true, true) };
  }

  currentProjection(
    context: VoiceCandidateSocketContext,
    nowMs: number,
  ): VoiceProjectionNetworkResponse {
    if (!validContext(context)) {
      return {
        statusCode: 409,
        body: {
          ok: false,
          voiceProjectionError: { code: 'AUTHENTICATED_CONTEXT_NOT_CURRENT' },
          authorizesExecution: false,
          provesExecutionSuccess: false,
          retryAuthorized: false,
        },
      };
    }
    if (typeof this.#intake.currentProjection !== 'function') {
      return {
        statusCode: 409,
        body: {
          ok: false,
          voiceProjectionError: { code: 'VOICE_PROJECTION_UNAVAILABLE' },
          authorizesExecution: false,
          provesExecutionSuccess: false,
          retryAuthorized: false,
        },
      };
    }
    const boundary = new VoiceProjectionNetworkBoundary({
      current: ({ context: requested, nowMs: requestedNow }) =>
        this.#intake.currentProjection?.({ context: requested, nowMs: requestedNow }) ?? null,
    });
    return boundary.current(context, nowMs);
  }

  currentExecutionAuthorization(input: {
    readonly commandId: string;
    readonly executionId: string;
    readonly context: VoiceCandidateSocketContext;
    readonly nowMs: number;
  }): VoiceDeviceExecutionAuthorization | null {
    if (
      !validContext(input.context) ||
      !boundedText(input.commandId) ||
      !EXECUTION_ID.test(input.executionId)
    ) {
      return null;
    }
    if (typeof this.#intake.currentExecutionAuthorization !== 'function') return null;
    let value: VoiceDeviceExecutionAuthorization | null;
    try {
      value = this.#intake.currentExecutionAuthorization(input);
    } catch {
      return null;
    }
    return value !== null && validExecutionAuthorization(value, input) ? value : null;
  }
}
