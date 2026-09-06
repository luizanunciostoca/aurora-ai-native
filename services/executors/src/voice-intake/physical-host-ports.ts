import type { W14GovernedDeviceDispatchPort } from '../device-dispatch/governed-device-dispatch.js';
import type {
  ActionIntentContainmentKeySource,
  DurableContainmentStateSource,
} from '../failure-containment/durable-containment-state.js';
import {
  W07DeviceReceiptObservationAdapter,
  type TrustedDeviceExecutionMaterialSource,
} from '../readback/device-receipt-observer.js';
import type { ExecutionAttemptQuotaSource } from '../safeguards/attempt-quota-source.js';
import type { IdempotencyFencePort, PreconditionEvaluator } from '../safeguards/types.js';
import type { CurrentAuthorityValidator } from '../sdk/types.js';
import { W15JDispatchingVoiceCandidateIntake } from './dispatching-intake.js';
import { DurableCurrentVoiceContainmentStateSource } from './durable-current-containment-source.js';
import { DurableCurrentVoiceSafeguardStateSource } from './durable-current-safeguard-source.js';
import { evaluateVoiceCandidate } from './intake.js';
import {
  OwnerBackedVoiceExecutionStateSource,
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
    attemptQuotaState: ExecutionAttemptQuotaSource,
    containmentState: DurableContainmentStateSource,
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
  /** Explicit W07-C freshness bound for the durable attempt/quota row. */
  readonly safeguardMaxAgeMs: number;
  /** Server-owned ActionIntent -> circuit identity mapping. */
  readonly containmentCircuitKeys: ActionIntentContainmentKeySource;
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
 * transport dispatch, W03 business idempotency, current W14 DEVICE target availability, W03
 * durable attempt/quota and W03 durable containment. W07 then constructs fresh fail-closed read
 * adapters around those owners. No raw credential, verified outcome or retry permission crosses
 * this boundary.
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
    attemptQuotaState: ExecutionAttemptQuotaSource,
    containmentState: DurableContainmentStateSource,
  ): W15JPhysicalHostVoiceIntakePort => {
    const safeguards = new DurableCurrentVoiceSafeguardStateSource({
      durableState: attemptQuotaState,
      maxAgeMs: config.safeguardMaxAgeMs,
    });
    const containment = new DurableCurrentVoiceContainmentStateSource({
      circuitKeys: config.containmentCircuitKeys,
      durableState: containmentState,
    });
    const executionStateSource = new OwnerBackedVoiceExecutionStateSource({
      identities: config.executionIdentities,
      targetBindings,
      safeguards,
      containment,
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
