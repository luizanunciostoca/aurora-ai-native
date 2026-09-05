import type { ActionIntent } from '@aurora/contracts/actions';
import type { CausationId, CommandId, ExecutionId } from '@aurora/contracts/ids';

import type { FailureContainmentResult } from '../failure-containment/types.js';
import type { ExecutionSafeguardResult } from '../safeguards/types.js';
import type { ExecutorAuthorityGateResult } from '../sdk/types.js';
import type { TargetResolutionResult } from '../target-resolution/types.js';
import type { AuthenticatedVoiceEvaluationContext } from '../voice-intake/types.js';

const MAX_DATE_MS = 8_640_000_000_000_000;
const COMMAND_ID = /^cmd_[0-9A-HJKMNP-TV-Z]{26}$/u;
const EXECUTION_ID = /^exe_[0-9A-HJKMNP-TV-Z]{26}$/u;
const CAUSATION_ID = /^cau_[0-9A-HJKMNP-TV-Z]{26}$/u;
const SAFE_REFERENCE = /^[A-Za-z0-9._:/+-]{1,512}$/u;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;

export interface GovernedDeviceCommandMaterial {
  readonly commandId: CommandId;
  readonly executionId: ExecutionId;
  readonly causationId: CausationId;
  readonly orderingKey: string;
  readonly orderingSequence: number;
  readonly actionIntent: ActionIntent;
  readonly canonicalPayloadHash: string;
  readonly authorizesExecution: false;
}

export interface W14GovernedDeviceDispatchRequest {
  readonly command: GovernedDeviceCommandMaterial;
  readonly context: AuthenticatedVoiceEvaluationContext;
  readonly dispatchedAtMs: number;
}

export type W14GovernedDeviceDispatchResult =
  | Readonly<{
      ok: true;
      disposition: 'SUBMITTED' | 'ALREADY_SUBMITTED';
      commandReference: string;
      deliveryReference?: string;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>
  | Readonly<{
      ok: false;
      code: string;
      retryable: boolean;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>;

/** W14-owned implementation must resolve current gateway/device-session truth before submission. */
export interface W14GovernedDeviceDispatchPort {
  dispatch(request: W14GovernedDeviceDispatchRequest): W14GovernedDeviceDispatchResult;
}

export interface GovernedDeviceDispatchGateBundle {
  readonly authority: ExecutorAuthorityGateResult;
  readonly target: TargetResolutionResult;
  readonly safeguards: ExecutionSafeguardResult;
  readonly containment: FailureContainmentResult;
}

export interface GovernedDeviceDispatchRequest {
  readonly command: GovernedDeviceCommandMaterial;
  readonly context: AuthenticatedVoiceEvaluationContext;
  readonly gates: GovernedDeviceDispatchGateBundle;
}

type GovernedDeviceDispatchErrorCode =
  | 'GATE_REJECTED'
  | 'CONTEXT_MISMATCH'
  | 'MATERIAL_MISMATCH'
  | 'W14_UNAVAILABLE'
  | 'W14_REJECTED'
  | 'W14_PROTOCOL_VIOLATION';

export type GovernedDeviceDispatchResult =
  | Readonly<{
      ok: true;
      disposition: 'HANDED_TO_W14';
      commandReference: string;
      deliveryReference?: string;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>
  | Readonly<{
      ok: false;
      code: GovernedDeviceDispatchErrorCode;
      retryable: boolean;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>;

function rejected(
  code: GovernedDeviceDispatchErrorCode,
  retryable = false,
): GovernedDeviceDispatchResult {
  return {
    ok: false,
    code,
    retryable,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

function sameDeviceTarget(
  actionIntent: ActionIntent,
  context: AuthenticatedVoiceEvaluationContext,
): boolean {
  const target = actionIntent.executionTarget;
  return (
    target?.kind === 'DEVICE' &&
    target.bindingReference === context.deviceId &&
    actionIntent.tenant.tenantId === context.tenantId &&
    actionIntent.actor.identityId === context.actorIdentityId &&
    actionIntent.correlation.correlationId === context.correlationId
  );
}

function materialMatches(command: GovernedDeviceCommandMaterial): boolean {
  const intent = command.actionIntent;
  return (
    command.authorizesExecution === false &&
    COMMAND_ID.test(command.commandId) &&
    EXECUTION_ID.test(command.executionId) &&
    CAUSATION_ID.test(command.causationId) &&
    SAFE_REFERENCE.test(command.orderingKey) &&
    Number.isSafeInteger(command.orderingSequence) &&
    command.orderingSequence > 0 &&
    SHA256.test(command.canonicalPayloadHash) &&
    intent.kind === 'ACTION_INTENT' &&
    intent.executionTarget?.kind === 'DEVICE' &&
    intent.idempotency.mode === 'REQUIRED' &&
    SAFE_REFERENCE.test(intent.idempotency.key)
  );
}

function gatesAllow(
  command: GovernedDeviceCommandMaterial,
  gates: GovernedDeviceDispatchGateBundle,
): boolean {
  const actionIntentId = command.actionIntent.actionIntentId;
  const executionTarget = command.actionIntent.executionTarget;
  if (executionTarget?.kind !== 'DEVICE') return false;

  const resolvedTarget = gates.target.target;
  if (resolvedTarget.kind !== 'DEVICE') return false;
  if (resolvedTarget.bindingReference !== executionTarget.bindingReference) return false;
  if (!gates.target.resolved) return false;
  if (gates.target.binding.target.kind !== 'DEVICE') return false;
  if (gates.target.binding.target.bindingReference !== executionTarget.bindingReference)
    return false;

  return (
    gates.authority.kind === 'EXECUTOR_AUTHORITY_GATE' &&
    gates.authority.actionIntentId === actionIntentId &&
    gates.authority.executionEligible === true &&
    gates.authority.currentAuthorityValidated === true &&
    gates.authority.authorizesExecution === false &&
    gates.target.kind === 'EXECUTION_TARGET_RESOLUTION' &&
    gates.target.authorizesExecution === false &&
    gates.safeguards.kind === 'EXECUTION_SAFEGUARD_RESULT' &&
    gates.safeguards.actionIntentId === actionIntentId &&
    gates.safeguards.safeToInvokeExternal === true &&
    gates.safeguards.authorizesExecution === false &&
    gates.containment.kind === 'FAILURE_CONTAINMENT_RESULT' &&
    gates.containment.actionIntentId === actionIntentId &&
    gates.containment.mayProceedToOtherGuards === true &&
    gates.containment.cancellationDisposition === 'NONE' &&
    gates.containment.requiresReconciliationHandoff === false &&
    gates.containment.authorizesExecution === false
  );
}

function validW14Result(result: W14GovernedDeviceDispatchResult): boolean {
  if (
    result.authorizesExecution !== false ||
    result.provesExecutionSuccess !== false ||
    result.retryAuthorized !== false
  ) {
    return false;
  }
  if (!result.ok) return typeof result.code === 'string' && typeof result.retryable === 'boolean';
  return (
    (result.disposition === 'SUBMITTED' || result.disposition === 'ALREADY_SUBMITTED') &&
    SAFE_REFERENCE.test(result.commandReference) &&
    (result.deliveryReference === undefined || SAFE_REFERENCE.test(result.deliveryReference))
  );
}

/**
 * W07-owned last barrier before a DEVICE command reaches W14 transport/session handling.
 * Passing gates are prerequisites only: neither this adapter nor W14 responses mint authority,
 * verified execution outcome, or retry permission. Delivery ordering is supplied as already
 * governed server material; W14 preserves it but does not invent scheduler semantics.
 */
export class W07GovernedDeviceDispatchAdapter {
  readonly #w14: W14GovernedDeviceDispatchPort;
  readonly #clock: () => number;

  constructor(w14: W14GovernedDeviceDispatchPort, clock: () => number = Date.now) {
    this.#w14 = w14;
    this.#clock = clock;
  }

  dispatch(request: GovernedDeviceDispatchRequest): GovernedDeviceDispatchResult {
    if (!materialMatches(request.command)) return rejected('MATERIAL_MISMATCH');
    if (!sameDeviceTarget(request.command.actionIntent, request.context)) {
      return rejected('CONTEXT_MISMATCH');
    }
    if (!gatesAllow(request.command, request.gates)) return rejected('GATE_REJECTED');

    let dispatchedAtMs: number;
    try {
      dispatchedAtMs = this.#clock();
    } catch {
      return rejected('W14_UNAVAILABLE', true);
    }
    if (
      !Number.isSafeInteger(dispatchedAtMs) ||
      dispatchedAtMs < 0 ||
      dispatchedAtMs > MAX_DATE_MS
    ) {
      return rejected('W14_UNAVAILABLE', true);
    }

    let result: W14GovernedDeviceDispatchResult;
    try {
      result = this.#w14.dispatch({
        command: request.command,
        context: request.context,
        dispatchedAtMs,
      });
    } catch {
      return rejected('W14_UNAVAILABLE', true);
    }
    if (!validW14Result(result)) return rejected('W14_PROTOCOL_VIOLATION');
    if (!result.ok) return rejected('W14_REJECTED', result.retryable);

    return {
      ok: true,
      disposition: 'HANDED_TO_W14',
      commandReference: result.commandReference,
      ...(result.deliveryReference === undefined
        ? {}
        : { deliveryReference: result.deliveryReference }),
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    };
  }
}
