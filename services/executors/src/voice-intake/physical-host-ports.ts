import type { W14GovernedDeviceDispatchPort } from '../device-dispatch/governed-device-dispatch.js';
import {
  W07DeviceReceiptObservationAdapter,
  type TrustedDeviceExecutionMaterialSource,
} from '../readback/device-receipt-observer.js';
import type { IdempotencyFencePort, PreconditionEvaluator } from '../safeguards/types.js';
import type { CurrentAuthorityValidator } from '../sdk/types.js';
import { W15JDispatchingVoiceCandidateIntake } from './dispatching-intake.js';
import { evaluateVoiceCandidate } from './intake.js';
import {
  OwnerBackedVoiceExecutionStateSource,
  type CurrentVoiceContainmentStateSource,
  type CurrentVoiceSafeguardStateSource,
  type CurrentVoiceTargetBindingSource,
  type PreissuedVoiceExecutionIdentity,
} from './owner-backed-execution-state-source.js';
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
    targetBindings: CurrentVoiceTargetBindingSource,
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
  /** Immutable server-issued command/execution/order/hash identity; never sourced from Android. */
  readonly executionIdentities: readonly PreissuedVoiceExecutionIdentity[];
  /** Current W07 attempt/quota owner. Missing current state fails closed. */
  readonly safeguardStateSource: CurrentVoiceSafeguardStateSource;
  /** Current W07 circuit/kill/dependency/cancellation owner. No healthy defaults are permitted. */
  readonly containmentStateSource: CurrentVoiceContainmentStateSource;
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
 * The factory receives current structural runtime ports only after the host creates them: W14
 * transport dispatch, W03 business idempotency and W14 DEVICE target availability. W07 builds its
 * current execution-state source around those owners plus current safeguard/containment owners.
 * No raw credential, verified outcome or retry permission crosses this boundary.
 */
export function createW15JDispatchingPhysicalHostW07Ports(
  config: W15JDispatchingPhysicalHostW07PortConfig,
): W15JDispatchingPhysicalHostW07Ports {
  const resolver = buildResolver(config);
  const receiptEvidenceIngress = buildReceiptObserver(config);

  const createVoiceIntake = (
    w14Dispatch: W14GovernedDeviceDispatchPort,
    idempotencyFence: IdempotencyFencePort,
    targetBindings: CurrentVoiceTargetBindingSource,
  ): W15JPhysicalHostVoiceIntakePort => {
    const executionStateSource = new OwnerBackedVoiceExecutionStateSource({
      identities: config.executionIdentities,
      targetBindings,
      safeguards: config.safeguardStateSource,
      containment: config.containmentStateSource,
    });
    return new W15JDispatchingVoiceCandidateIntake({
      resolver,
      executionStateSource,
      evaluatePrecondition: config.evaluatePrecondition,
      idempotencyFence,
      w14Dispatch,
      ...(config.clock === undefined ? {} : { clock: config.clock }),
    });
  };

  return Object.freeze({ createVoiceIntake, receiptEvidenceIngress });
}
