import { validateExecutorAuthority } from '../sdk/authority-gate.js';
import type {
  AuthenticatedVoiceEvaluationContext,
  ResolvedVoiceAuthorityEvaluation,
  VoiceAuthorityEvaluationResolver,
  VoiceCandidateIntakeErrorCode,
  VoiceCandidateIntakeResult,
  VoiceEvaluationCandidate,
} from './types.js';

const MAX_IDENTIFIER_LENGTH = 256;
const MAX_TRANSCRIPT_LENGTH = 512;

function boundedText(value: string, maximum = MAX_IDENTIFIER_LENGTH): boolean {
  return value.length > 0 && value.length <= maximum && value === value.trim();
}

function validCandidate(candidate: VoiceEvaluationCandidate): boolean {
  return (
    boundedText(candidate.commandId) &&
    boundedText(candidate.capabilityId) &&
    boundedText(candidate.normalizedTranscript, MAX_TRANSCRIPT_LENGTH) &&
    candidate.normalizedTranscript === candidate.normalizedTranscript.toLowerCase() &&
    candidate.requiresW07Authorization === true &&
    candidate.authorizesExecution === false
  );
}

function validContext(context: AuthenticatedVoiceEvaluationContext): boolean {
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

function rejected(code: VoiceCandidateIntakeErrorCode): VoiceCandidateIntakeResult {
  return {
    kind: 'VOICE_CANDIDATE_INTAKE',
    ok: false,
    acceptedForEvaluation: false,
    error: { code },
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

function canonicalContextMatches(
  resolved: ResolvedVoiceAuthorityEvaluation,
  context: AuthenticatedVoiceEvaluationContext,
): boolean {
  const intent = resolved.actionIntent;
  const policy = resolved.authorityEvaluation.policyEvaluation;
  const target = intent.executionTarget;
  return (
    intent.kind === 'ACTION_INTENT' &&
    intent.tenant.tenantId === context.tenantId &&
    intent.actor.identityId === context.actorIdentityId &&
    intent.requestOrigin.identityId === context.actorIdentityId &&
    intent.correlation.correlationId === context.correlationId &&
    policy.tenant.tenantId === context.tenantId &&
    policy.actor.identityId === context.actorIdentityId &&
    policy.correlation.correlationId === context.correlationId &&
    target?.kind === 'DEVICE' &&
    target.bindingReference === context.deviceId
  );
}

export type VoiceCandidateEvaluationWithResolution =
  | Readonly<{
      result: Extract<VoiceCandidateIntakeResult, { readonly ok: true }>;
      resolved: ResolvedVoiceAuthorityEvaluation;
    }>
  | Readonly<{
      result: Extract<VoiceCandidateIntakeResult, { readonly ok: false }>;
      resolved?: never;
    }>;

/**
 * Server-internal single-pass voice evaluation.
 *
 * Successful evaluation returns the already-resolved canonical material to trusted W07 server
 * composition only, avoiding a second resolver/current-policy read between authority evaluation
 * and downstream W07 guards. Callers must never expose `resolved` through the Android/W14 wire.
 */
export function evaluateVoiceCandidateWithResolution(
  candidate: VoiceEvaluationCandidate,
  context: AuthenticatedVoiceEvaluationContext,
  resolver: VoiceAuthorityEvaluationResolver,
): VoiceCandidateEvaluationWithResolution {
  if (!validCandidate(candidate)) return { result: rejected('CANDIDATE_MALFORMED') as Extract<VoiceCandidateIntakeResult, { readonly ok: false }> };
  if (!validContext(context)) {
    return {
      result: rejected('AUTHENTICATED_CONTEXT_MALFORMED') as Extract<
        VoiceCandidateIntakeResult,
        { readonly ok: false }
      >,
    };
  }

  let resolved: ResolvedVoiceAuthorityEvaluation | null;
  try {
    resolved = resolver.resolve({ candidate, context });
  } catch {
    return {
      result: rejected('CANONICAL_RESOLUTION_UNAVAILABLE') as Extract<
        VoiceCandidateIntakeResult,
        { readonly ok: false }
      >,
    };
  }
  if (resolved === null) {
    return {
      result: rejected('CANONICAL_RESOLUTION_UNAVAILABLE') as Extract<
        VoiceCandidateIntakeResult,
        { readonly ok: false }
      >,
    };
  }
  if (!canonicalContextMatches(resolved, context)) {
    return {
      result: rejected('CANONICAL_CONTEXT_MISMATCH') as Extract<
        VoiceCandidateIntakeResult,
        { readonly ok: false }
      >,
    };
  }
  if (resolved.actionIntent.capability.capability !== candidate.capabilityId) {
    return {
      result: rejected('CANONICAL_CAPABILITY_MISMATCH') as Extract<
        VoiceCandidateIntakeResult,
        { readonly ok: false }
      >,
    };
  }

  let gate;
  try {
    gate = validateExecutorAuthority({
      schemaVersion: resolved.actionIntent.schemaVersion,
      actionIntent: resolved.actionIntent,
      authorityEvaluation: resolved.authorityEvaluation,
      validateCurrentAuthority: resolved.validateCurrentAuthority,
      nonAuthoritativeSignals: { lane: 'FAST' },
    });
  } catch {
    return {
      result: rejected('W07_EVALUATION_FAILED') as Extract<
        VoiceCandidateIntakeResult,
        { readonly ok: false }
      >,
    };
  }

  return {
    result: {
      kind: 'VOICE_CANDIDATE_INTAKE',
      ok: true,
      acceptedForEvaluation: true,
      gate,
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    },
    resolved,
  };
}

/**
 * Governed server-side intake for the accepted W15-G deterministic voice candidate.
 *
 * The caller supplies only a W15 candidate and authenticated W14 provenance. A
 * server-owned resolver must produce the canonical ActionIntent and fresh W02
 * authority request. This function evaluates through W07-B only; it performs no
 * side effect, proves no outcome, and grants no retry permission.
 */
export function evaluateVoiceCandidate(
  candidate: VoiceEvaluationCandidate,
  context: AuthenticatedVoiceEvaluationContext,
  resolver: VoiceAuthorityEvaluationResolver,
): VoiceCandidateIntakeResult {
  return evaluateVoiceCandidateWithResolution(candidate, context, resolver).result;
}
