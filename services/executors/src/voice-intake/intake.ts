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
  if (!validCandidate(candidate)) return rejected('CANDIDATE_MALFORMED');
  if (!validContext(context)) return rejected('AUTHENTICATED_CONTEXT_MALFORMED');

  let resolved: ResolvedVoiceAuthorityEvaluation | null;
  try {
    resolved = resolver.resolve({ candidate, context });
  } catch {
    return rejected('CANONICAL_RESOLUTION_UNAVAILABLE');
  }
  if (resolved === null) return rejected('CANONICAL_RESOLUTION_UNAVAILABLE');
  if (!canonicalContextMatches(resolved, context)) {
    return rejected('CANONICAL_CONTEXT_MISMATCH');
  }
  if (resolved.actionIntent.capability.capability !== candidate.capabilityId) {
    return rejected('CANONICAL_CAPABILITY_MISMATCH');
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
    return rejected('W07_EVALUATION_FAILED');
  }

  return {
    kind: 'VOICE_CANDIDATE_INTAKE',
    ok: true,
    acceptedForEvaluation: true,
    gate,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}
