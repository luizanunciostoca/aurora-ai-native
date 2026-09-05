import type { CurrentAuthorityValidator } from '../sdk/types.js';
import {
  W07DeviceReceiptObservationAdapter,
  type TrustedDeviceExecutionMaterialSource,
} from '../readback/device-receipt-observer.js';
import { evaluateVoiceCandidate } from './intake.js';
import {
  TrustedServerVoiceAuthorityResolver,
  type TrustedVoiceAuthorityMaterialSource,
} from './trusted-resolver.js';
import type {
  AuthenticatedVoiceEvaluationContext,
  VoiceCandidateIntakeResult,
  VoiceEvaluationCandidate,
} from './types.js';

export interface W15JPhysicalHostVoiceIntakeInput {
  readonly candidate: VoiceEvaluationCandidate;
  readonly context: AuthenticatedVoiceEvaluationContext;
}

/** Structural W07 intake port consumed by the W14 same-socket voice boundary. */
export interface W15JPhysicalHostVoiceIntakePort {
  evaluate(input: W15JPhysicalHostVoiceIntakeInput): VoiceCandidateIntakeResult;
}

export interface W15JPhysicalHostW07Ports {
  readonly voiceIntake: W15JPhysicalHostVoiceIntakePort;
  readonly receiptEvidenceIngress: W07DeviceReceiptObservationAdapter;
}

export interface W15JPhysicalHostW07PortConfig {
  /** Canonical server-owned command/capability/current-authority material. */
  readonly voiceAuthoritySource: TrustedVoiceAuthorityMaterialSource;
  /** W02-owned execution-time evaluator, for example the accepted evaluateAuthority runtime. */
  readonly validateCurrentAuthority: CurrentAuthorityValidator;
  /** Server-owned execution binding used only to construct Receipt/Evidence from W14 observations. */
  readonly deviceExecutionSource: TrustedDeviceExecutionMaterialSource;
  readonly clock?: () => number;
}

/**
 * W07-owned concrete adapter bundle for the controlled W15-J physical host.
 *
 * This helper does not issue PolicyToken/OwnerDecision material and does not own policy persistence.
 * Voice candidates remain non-authoritative input; the current-authority validator is independently
 * injected by the W02 owner. Device receipt observations remain evidence input only.
 */
export function createW15JPhysicalHostW07Ports(
  config: W15JPhysicalHostW07PortConfig,
): W15JPhysicalHostW07Ports {
  const resolver = new TrustedServerVoiceAuthorityResolver({
    source: config.voiceAuthoritySource,
    validateCurrentAuthority: config.validateCurrentAuthority,
    ...(config.clock === undefined ? {} : { clock: config.clock }),
  });
  const receiptEvidenceIngress = new W07DeviceReceiptObservationAdapter(
    config.deviceExecutionSource,
  );
  const voiceIntake: W15JPhysicalHostVoiceIntakePort = Object.freeze({
    evaluate: (input: W15JPhysicalHostVoiceIntakeInput) =>
      evaluateVoiceCandidate(input.candidate, input.context, resolver),
  });

  return Object.freeze({ voiceIntake, receiptEvidenceIngress });
}
