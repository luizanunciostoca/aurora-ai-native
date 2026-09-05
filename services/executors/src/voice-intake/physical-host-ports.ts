import type { W14GovernedDeviceDispatchPort } from '../device-dispatch/governed-device-dispatch.js';
import {
  W07DeviceReceiptObservationAdapter,
  type TrustedDeviceExecutionMaterialSource,
} from '../readback/device-receipt-observer.js';
import type { IdempotencyFencePort, PreconditionEvaluator } from '../safeguards/types.js';
import type { CurrentAuthorityValidator } from '../sdk/types.js';
import {
  W15JDispatchingVoiceCandidateIntake,
  type TrustedVoiceExecutionStateSource,
} from './dispatching-intake.js';
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
  evaluate(input: W15JPhysicalHostVoiceIntakeInput): unknown;
}

export interface W15JPhysicalHostW07Ports {
  readonly voiceIntake: W15JPhysicalHostVoiceIntakePort;
  readonly receiptEvidenceIngress: W07DeviceReceiptObservationAdapter;
}

export interface W15JDispatchingPhysicalHostW07Ports {
  readonly createVoiceIntake: (
    w14Dispatch: W14GovernedDeviceDispatchPort,
    idempotencyFence: IdempotencyFencePort,
  ) => W15JPhysicalHostVoiceIntakePort;
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

export interface W15JDispatchingPhysicalHostW07PortConfig extends W15JPhysicalHostW07PortConfig {
  /** Server-owned W07 current target/order/attempt/quota/containment state. */
  readonly executionStateSource: TrustedVoiceExecutionStateSource;
  /** Current W07 precondition evaluator; Android cannot supply precondition truth. */
  readonly evaluatePrecondition: PreconditionEvaluator;
}

function buildResolver(config: W15JPhysicalHostW07PortConfig): TrustedServerVoiceAuthorityResolver {
  return new TrustedServerVoiceAuthorityResolver({
    source: config.voiceAuthoritySource,
    validateCurrentAuthority: config.validateCurrentAuthority,
    ...(config.clock === undefined ? {} : { clock: config.clock }),
  });
}

function buildReceiptObserver(
  config: W15JPhysicalHostW07PortConfig,
): W07DeviceReceiptObservationAdapter {
  return new W07DeviceReceiptObservationAdapter(config.deviceExecutionSource);
}

/**
 * W07-owned concrete evaluation-only adapter bundle for compatibility and isolated authority tests.
 * It does not dispatch a device command.
 */
export function createW15JPhysicalHostW07Ports(
  config: W15JPhysicalHostW07PortConfig,
): W15JPhysicalHostW07Ports {
  const resolver = buildResolver(config);
  const receiptEvidenceIngress = buildReceiptObserver(config);
  const voiceIntake: W15JPhysicalHostVoiceIntakePort = Object.freeze({
    evaluate: (input: W15JPhysicalHostVoiceIntakeInput): VoiceCandidateIntakeResult =>
      evaluateVoiceCandidate(input.candidate, input.context, resolver),
  });

  return Object.freeze({ voiceIntake, receiptEvidenceIngress });
}

/**
 * W07-owned dispatching adapter bundle for the controlled W15-J physical host.
 *
 * The factory receives both structural runtime ports only after the host has created them: W14
 * transport dispatch plus the W03-backed W07-C business idempotency fence. Authority, target
 * resolution, containment and safeguards remain W07-owned; W14 only revalidates transport/device
 * trust and prepares delivery. No raw credential, verified outcome or retry permission crosses the
 * factory boundary.
 */
export function createW15JDispatchingPhysicalHostW07Ports(
  config: W15JDispatchingPhysicalHostW07PortConfig,
): W15JDispatchingPhysicalHostW07Ports {
  const resolver = buildResolver(config);
  const receiptEvidenceIngress = buildReceiptObserver(config);

  const createVoiceIntake = (
    w14Dispatch: W14GovernedDeviceDispatchPort,
    idempotencyFence: IdempotencyFencePort,
  ): W15JPhysicalHostVoiceIntakePort =>
    new W15JDispatchingVoiceCandidateIntake({
      resolver,
      executionStateSource: config.executionStateSource,
      evaluatePrecondition: config.evaluatePrecondition,
      idempotencyFence,
      w14Dispatch,
      ...(config.clock === undefined ? {} : { clock: config.clock }),
    });

  return Object.freeze({ createVoiceIntake, receiptEvidenceIngress });
}
