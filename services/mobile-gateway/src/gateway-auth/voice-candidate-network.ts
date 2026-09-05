const VOICE_CANDIDATE_KEYS = new Set([
  'commandId',
  'capabilityId',
  'normalizedTranscript',
  'requiresW07Authorization',
  'authorizesExecution',
]);

const MAX_IDENTIFIER_LENGTH = 256;
const MAX_TRANSCRIPT_LENGTH = 512;

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

export interface VoiceCandidateIntakePort {
  evaluate(input: {
    readonly candidate: VoiceCandidateForEvaluation;
    readonly context: VoiceCandidateSocketContext;
  }): unknown;
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

function hasOnlyKeys(value: Readonly<Record<string, unknown>>, allowed: ReadonlySet<string>): boolean {
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

/**
 * W14-owned transport composition leaf for W15-G -> W07 voice evaluation.
 *
 * The caller must provide current context derived from the already-authenticated
 * W14 socket/device session. This boundary never accepts identity, trust, policy,
 * ActionIntent, authority, server-time, outcome, or retry fields from Android.
 * It intentionally strips all W07 gate details from the network response.
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
      return { statusCode: 503, body: nonAuthorityBody(false, false, 'W07_INGRESS_UNAVAILABLE') };
    }
    if (!isPlainRecord(result)) {
      return { statusCode: 503, body: nonAuthorityBody(false, false, 'W07_PROTOCOL_VIOLATION') };
    }
    if (
      result.authorizesExecution !== false ||
      result.provesExecutionSuccess !== false ||
      result.retryAuthorized !== false
    ) {
      return { statusCode: 503, body: nonAuthorityBody(false, false, 'W07_PROTOCOL_VIOLATION') };
    }
    if (result.ok !== true || result.acceptedForEvaluation !== true) {
      return { statusCode: 409, body: nonAuthorityBody(false, false, 'W07_EVALUATION_REJECTED') };
    }

    return { statusCode: 202, body: nonAuthorityBody(true, true) };
  }
}
