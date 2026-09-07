import type {
  VoiceCandidateIntakePort,
  VoiceCandidateSocketContext,
} from '../gateway-auth/voice-candidate-network.js';
import type {
  GovernedVoiceProjection,
  GovernedVoiceProjectionSource,
} from '../gateway-auth/voice-projection-network.js';

/**
 * Adds a trusted provider-owned current voice projection to the already-composed W07 intake.
 *
 * This adapter deliberately delegates evaluation and current W07 execution authorization to the
 * original intake. It has no authority issuance, approval, outcome or retry API. Projection
 * freshness/tenant/provenance validation still happens at the W14 transport boundary.
 */
export function withCurrentVoiceProjection(
  intake: VoiceCandidateIntakePort,
  projectionSource: GovernedVoiceProjectionSource,
): VoiceCandidateIntakePort {
  if (intake === null || typeof intake !== 'object' || typeof intake.evaluate !== 'function') {
    throw new Error('W15-J voice projection adapter requires a valid W07 intake.');
  }
  if (
    projectionSource === null ||
    typeof projectionSource !== 'object' ||
    typeof projectionSource.current !== 'function'
  ) {
    throw new Error('W15-J voice projection adapter requires a valid projection source.');
  }

  const currentExecutionAuthorization = intake.currentExecutionAuthorization;
  return Object.freeze({
    evaluate: (input) => intake.evaluate(input),
    currentProjection: (input): GovernedVoiceProjection | null => projectionSource.current(input),
    ...(typeof currentExecutionAuthorization !== 'function'
      ? {}
      : {
          currentExecutionAuthorization: (input: {
            readonly commandId: string;
            readonly executionId: string;
            readonly context: VoiceCandidateSocketContext;
            readonly nowMs: number;
          }) => currentExecutionAuthorization.call(intake, input),
        }),
  });
}
