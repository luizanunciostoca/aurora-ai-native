import type { ActionIntent } from '@aurora/contracts/actions';
import type { AuthorityEvaluationRequest } from '@aurora/contracts/policy-validation';

import type { CurrentAuthorityValidator, ExecutorAuthorityGateResult } from '../sdk/types.js';

/**
 * Bounded, non-authoritative candidate emitted by the accepted W15-G fast path.
 * It deliberately contains no tenant, actor, policy, trust, server-time, outcome,
 * or retry fields. Those values must be derived by authenticated server owners.
 */
export interface VoiceEvaluationCandidate {
  readonly commandId: string;
  readonly capabilityId: string;
  readonly normalizedTranscript: string;
  readonly requiresW07Authorization: true;
  readonly authorizesExecution: false;
}

/**
 * Current context derived from the authenticated W14 gateway/device socket only.
 * These bindings prove transport/session provenance; they are not action authority.
 */
export interface AuthenticatedVoiceEvaluationContext {
  readonly tenantId: string;
  readonly actorIdentityId: string;
  readonly correlationId: string;
  readonly gatewaySessionId: string;
  readonly connectionId: string;
  readonly deviceSessionId: string;
  readonly deviceId: string;
  readonly registrationVersion: number;
}

export interface ResolveVoiceEvaluationInput {
  readonly candidate: VoiceEvaluationCandidate;
  readonly context: AuthenticatedVoiceEvaluationContext;
}

/**
 * Server-side resolution product. The resolver is responsible for consulting the
 * canonical command/capability/control-plane sources and W02 current-policy state.
 * Android/W14 input can never supply this object.
 */
export interface ResolvedVoiceAuthorityEvaluation {
  readonly actionIntent: ActionIntent;
  readonly authorityEvaluation: AuthorityEvaluationRequest;
  readonly validateCurrentAuthority: CurrentAuthorityValidator;
}

export interface VoiceAuthorityEvaluationResolver {
  resolve(input: ResolveVoiceEvaluationInput): ResolvedVoiceAuthorityEvaluation | null;
}

export type VoiceCandidateIntakeErrorCode =
  | 'CANDIDATE_MALFORMED'
  | 'AUTHENTICATED_CONTEXT_MALFORMED'
  | 'CANONICAL_RESOLUTION_UNAVAILABLE'
  | 'CANONICAL_CONTEXT_MISMATCH'
  | 'CANONICAL_CAPABILITY_MISMATCH'
  | 'W07_EVALUATION_FAILED';

interface VoiceCandidateIntakeResultBase {
  readonly kind: 'VOICE_CANDIDATE_INTAKE';
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
}

export type VoiceCandidateIntakeResult =
  | (VoiceCandidateIntakeResultBase & {
      readonly ok: true;
      /** Means only that canonical W07 current-authority evaluation completed. */
      readonly acceptedForEvaluation: true;
      readonly gate: ExecutorAuthorityGateResult;
    })
  | (VoiceCandidateIntakeResultBase & {
      readonly ok: false;
      readonly acceptedForEvaluation: false;
      readonly error: Readonly<{ code: VoiceCandidateIntakeErrorCode }>;
    });
