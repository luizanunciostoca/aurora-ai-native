import type { ActionIntent, ActionPrecondition } from '@aurora/contracts/actions';
import type { CausationId, CommandId, ExecutionId } from '@aurora/contracts/ids';

import {
  W07GovernedDeviceDispatchAdapter,
  type GovernedDeviceCommandMaterial,
  type GovernedDeviceDispatchResult,
  type W14GovernedDeviceDispatchPort,
} from '../device-dispatch/governed-device-dispatch.js';
import { evaluateFailureContainment } from '../failure-containment/failure-containment.js';
import type { FailureContainmentSnapshot } from '../failure-containment/types.js';
import { evaluateExecutionSafeguards } from '../safeguards/safeguards.js';
import type {
  ExecutionQuotaSnapshot,
  IdempotencyFencePort,
  PreconditionEvaluator,
} from '../safeguards/types.js';
import { resolveExecutionTarget } from '../target-resolution/resolver.js';
import type { ExecutableTargetBinding } from '../target-resolution/types.js';
import { evaluateVoiceCandidateWithResolution } from './intake.js';
import type {
  AuthenticatedVoiceEvaluationContext,
  VoiceAuthorityEvaluationResolver,
  VoiceCandidateIntakeResult,
  VoiceEvaluationCandidate,
} from './types.js';

const COMMAND_ID = /^cmd_[0-9A-HJKMNP-TV-Z]{26}$/u;
const EXECUTION_ID = /^exe_[0-9A-HJKMNP-TV-Z]{26}$/u;
const CAUSATION_ID = /^cau_[0-9A-HJKMNP-TV-Z]{26}$/u;
const SAFE_REFERENCE = /^[A-Za-z0-9._:/+-]{1,512}$/u;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;

export interface TrustedVoiceExecutionStateLookup {
  readonly candidate: VoiceEvaluationCandidate;
  readonly context: AuthenticatedVoiceEvaluationContext;
  readonly actionIntent: ActionIntent;
  readonly evaluatedAt: string;
}

export interface TrustedVoiceExecutionState {
  readonly commandId: CommandId;
  readonly executionId: ExecutionId;
  readonly causationId: CausationId;
  readonly orderingKey: string;
  readonly orderingSequence: number;
  readonly canonicalPayloadHash: string;
  readonly targetBindings: readonly ExecutableTargetBinding[];
  readonly attemptNumber: number;
  readonly maxAttempts: number;
  readonly quota?: ExecutionQuotaSnapshot;
  readonly containment: FailureContainmentSnapshot;
  readonly authorizesExecution: false;
}

/**
 * Server-owned current execution state source. It may consult W03/W04/W07 control-plane owners,
 * but Android/W14 candidate fields cannot supply target bindings, guard state, ordering, hashes,
 * attempts, quota, circuit state, kill-switch state, or retry permission.
 */
export interface TrustedVoiceExecutionStateSource {
  resolve(lookup: TrustedVoiceExecutionStateLookup): TrustedVoiceExecutionState | null;
}

export interface W15JDispatchingVoiceIntakeConfig {
  readonly resolver: VoiceAuthorityEvaluationResolver;
  readonly executionStateSource: TrustedVoiceExecutionStateSource;
  readonly evaluatePrecondition: PreconditionEvaluator;
  readonly idempotencyFence: IdempotencyFencePort;
  readonly w14Dispatch: W14GovernedDeviceDispatchPort;
  readonly clock?: () => number;
}

export type VoiceDispatchDisposition =
  | 'NOT_ATTEMPTED_AUTHORITY_REJECTED'
  | 'NOT_ATTEMPTED_STATE_UNAVAILABLE'
  | 'NOT_ATTEMPTED_TARGET_REJECTED'
  | 'NOT_ATTEMPTED_CONTAINMENT_REJECTED'
  | 'NOT_ATTEMPTED_SAFEGUARD_REJECTED'
  | 'HANDED_TO_W14'
  | 'W14_REJECTED';

export interface VoiceDispatchObservation {
  readonly disposition: VoiceDispatchDisposition;
  readonly commandId?: CommandId;
  readonly commandReference?: string;
  readonly deliveryReference?: string;
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
}

export type DispatchingVoiceCandidateIntakeResult = VoiceCandidateIntakeResult &
  Readonly<{ readonly dispatch: VoiceDispatchObservation }>;

function observation(
  disposition: VoiceDispatchDisposition,
  extras: Readonly<{
    commandId?: CommandId;
    commandReference?: string;
    deliveryReference?: string;
  }> = {},
): VoiceDispatchObservation {
  return {
    disposition,
    ...extras,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

function resultWithDispatch(
  result: VoiceCandidateIntakeResult,
  dispatch: VoiceDispatchObservation,
): DispatchingVoiceCandidateIntakeResult {
  return Object.freeze({ ...result, dispatch });
}

function validEvaluationTime(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return false;
  return Number.isFinite(Date.parse(value));
}

function validState(
  state: TrustedVoiceExecutionState,
  candidate: VoiceEvaluationCandidate,
  actionIntent: ActionIntent,
): boolean {
  const target = actionIntent.executionTarget;
  return (
    state.authorizesExecution === false &&
    COMMAND_ID.test(state.commandId) &&
    state.commandId === candidate.commandId &&
    EXECUTION_ID.test(state.executionId) &&
    CAUSATION_ID.test(state.causationId) &&
    SAFE_REFERENCE.test(state.orderingKey) &&
    Number.isSafeInteger(state.orderingSequence) &&
    state.orderingSequence > 0 &&
    SHA256.test(state.canonicalPayloadHash) &&
    Number.isSafeInteger(state.attemptNumber) &&
    state.attemptNumber > 0 &&
    Number.isSafeInteger(state.maxAttempts) &&
    state.maxAttempts > 0 &&
    target?.kind === 'DEVICE'
  );
}

function buildCommand(
  state: TrustedVoiceExecutionState,
  actionIntent: ActionIntent,
): GovernedDeviceCommandMaterial {
  return {
    commandId: state.commandId,
    executionId: state.executionId,
    causationId: state.causationId,
    orderingKey: state.orderingKey,
    orderingSequence: state.orderingSequence,
    actionIntent,
    canonicalPayloadHash: state.canonicalPayloadHash,
    authorizesExecution: false,
  };
}

function toDispatchObservation(
  commandId: CommandId,
  result: GovernedDeviceDispatchResult,
): VoiceDispatchObservation {
  if (!result.ok) return observation('W14_REJECTED', { commandId });
  return observation('HANDED_TO_W14', {
    commandId,
    commandReference: result.commandReference,
    ...(result.deliveryReference === undefined
      ? {}
      : { deliveryReference: result.deliveryReference }),
  });
}

/**
 * W07-owned voice-to-device execution coordinator for the controlled W15-J host.
 *
 * The guard sequence mirrors the accepted W07-H integration order exactly:
 * current authority -> target -> safeguards/idempotency -> containment -> W14 effect boundary.
 * W14 still revalidates gateway/device trust immediately before submission. A W03 reservation is
 * therefore an execution-attempt fence, not proof that an effect occurred; containment may still
 * block after reservation and any later retry remains governed by W07 reconciliation/fresh guards.
 * No acknowledgement/receipt here proves execution success or grants retry authority.
 */
export class W15JDispatchingVoiceCandidateIntake {
  readonly #config: W15JDispatchingVoiceIntakeConfig;
  readonly #dispatch: W07GovernedDeviceDispatchAdapter;

  constructor(config: W15JDispatchingVoiceIntakeConfig) {
    this.#config = config;
    this.#dispatch = new W07GovernedDeviceDispatchAdapter(config.w14Dispatch, config.clock);
  }

  evaluate(input: {
    readonly candidate: VoiceEvaluationCandidate;
    readonly context: AuthenticatedVoiceEvaluationContext;
  }): DispatchingVoiceCandidateIntakeResult {
    const evaluated = evaluateVoiceCandidateWithResolution(
      input.candidate,
      input.context,
      this.#config.resolver,
    );
    if (!evaluated.result.ok) {
      return resultWithDispatch(evaluated.result, observation('NOT_ATTEMPTED_AUTHORITY_REJECTED'));
    }

    const authority = evaluated.result.gate;
    if (authority.executionEligible !== true || authority.currentAuthorityValidated !== true) {
      return resultWithDispatch(evaluated.result, observation('NOT_ATTEMPTED_AUTHORITY_REJECTED'));
    }

    const resolved = evaluated.resolved;
    if (resolved === undefined) {
      return resultWithDispatch(evaluated.result, observation('NOT_ATTEMPTED_STATE_UNAVAILABLE'));
    }
    const actionIntent = resolved.actionIntent;
    const evaluatedAt = resolved.authorityEvaluation.policyEvaluation.evaluatedAt;
    if (!validEvaluationTime(evaluatedAt)) {
      return resultWithDispatch(evaluated.result, observation('NOT_ATTEMPTED_STATE_UNAVAILABLE'));
    }

    let state: TrustedVoiceExecutionState | null;
    try {
      state = this.#config.executionStateSource.resolve({
        candidate: input.candidate,
        context: input.context,
        actionIntent,
        evaluatedAt,
      });
    } catch {
      state = null;
    }
    if (state === null || !validState(state, input.candidate, actionIntent)) {
      return resultWithDispatch(evaluated.result, observation('NOT_ATTEMPTED_STATE_UNAVAILABLE'));
    }

    const target = actionIntent.executionTarget;
    if (target?.kind !== 'DEVICE') {
      return resultWithDispatch(
        evaluated.result,
        observation('NOT_ATTEMPTED_TARGET_REJECTED', { commandId: state.commandId }),
      );
    }

    const targetResolution = resolveExecutionTarget({
      schemaVersion: actionIntent.schemaVersion,
      actionIntentSchemaVersion: actionIntent.schemaVersion,
      tenant: actionIntent.tenant,
      evaluatedAt,
      target,
      bindings: state.targetBindings,
    });
    if (!targetResolution.resolved) {
      return resultWithDispatch(
        evaluated.result,
        observation('NOT_ATTEMPTED_TARGET_REJECTED', { commandId: state.commandId }),
      );
    }

    const safeguards = evaluateExecutionSafeguards({
      schemaVersion: actionIntent.schemaVersion,
      actionIntent,
      evaluatedAt,
      attemptNumber: state.attemptNumber,
      maxAttempts: state.maxAttempts,
      ...(state.quota === undefined ? {} : { quota: state.quota }),
      evaluatePrecondition: this.#config.evaluatePrecondition,
      canonicalPayloadHash: state.canonicalPayloadHash,
      idempotencyFence: this.#config.idempotencyFence,
    });
    if (!safeguards.safeToInvokeExternal) {
      return resultWithDispatch(
        evaluated.result,
        observation('NOT_ATTEMPTED_SAFEGUARD_REJECTED', { commandId: state.commandId }),
      );
    }

    const containment = evaluateFailureContainment({
      schemaVersion: actionIntent.schemaVersion,
      actionIntent,
      evaluatedAt,
      phase: 'PRE_EXTERNAL',
      snapshot: state.containment,
    });
    if (
      containment.mayProceedToOtherGuards !== true ||
      containment.cancellationDisposition !== 'NONE' ||
      containment.requiresReconciliationHandoff !== false
    ) {
      return resultWithDispatch(
        evaluated.result,
        observation('NOT_ATTEMPTED_CONTAINMENT_REJECTED', { commandId: state.commandId }),
      );
    }

    const command = buildCommand(state, actionIntent);
    const dispatch = this.#dispatch.dispatch({
      command,
      context: input.context,
      gates: {
        authority,
        target: targetResolution,
        safeguards,
        containment,
      },
    });
    return resultWithDispatch(evaluated.result, toDispatchObservation(state.commandId, dispatch));
  }
}

export type { ActionPrecondition };
