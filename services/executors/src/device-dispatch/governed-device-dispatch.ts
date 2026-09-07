import type { ActionIntent } from '@aurora/contracts/actions';
import type { CausationId, CommandId, ExecutionId } from '@aurora/contracts/ids';

import type { FailureContainmentResult } from '../failure-containment/types.js';
import type { ExecutionSafeguardResult } from '../safeguards/types.js';
import type { ExecutorAuthorityGateResult } from '../sdk/types.js';
import type { TargetResolutionResult } from '../target-resolution/types.js';
import type { AuthenticatedVoiceEvaluationContext } from '../voice-intake/types.js';

const MAX_DATE_MS = 8_640_000_000_000_000;
const MAX_DEVICE_AUTHORIZATION_AGE_MS = 30_000;
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

/**
 * W07-owned short-lived authorization consumed by W15 at the native effect boundary.
 *
 * This object is created only after current authority + target + safeguard/idempotency + containment
 * gates pass. W14 may transport it but cannot create, widen, refresh or reinterpret it.
 */
export interface W07DeviceExecutionAuthorization {
  readonly kind: 'W07_DEVICE_EXECUTION_AUTHORIZATION';
  readonly executionId: ExecutionId;
  readonly tenantId: string;
  readonly deviceId: string;
  readonly capabilityId: string;
  readonly targetKind: 'DEVICE';
  readonly authoritySource: 'W07_CURRENT_EXECUTION_AUTHORITY';
  readonly actionId: string;
  readonly arguments: Readonly<Record<string, string>>;
  readonly authorizedAtMs: number;
  readonly expiresAtMs: number;
  readonly authorizesExecution: true;
  readonly cancelled: false;
}

export interface TransportReadyGovernedDeviceCommandMaterial extends GovernedDeviceCommandMaterial {
  readonly executionAuthorization: W07DeviceExecutionAuthorization;
}

export interface W14GovernedDeviceDispatchRequest {
  readonly command: TransportReadyGovernedDeviceCommandMaterial;
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
    SAFE_REFERENCE.test(intent.idempotency.key) &&
    typeof intent.capability.capability === 'string' &&
    SAFE_REFERENCE.test(intent.capability.capability) &&
    typeof intent.capability.actionType === 'string' &&
    SAFE_REFERENCE.test(intent.capability.actionType)
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
  if (gates.target.binding.target.bindingReference !== executionTarget.bindingReference) return false;

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

function actionDeadlineMs(actionIntent: ActionIntent): number | null {
  if (typeof actionIntent.deadlineAt !== 'string') return null;
  const value = Date.parse(actionIntent.deadlineAt);
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_DATE_MS ? value : null;
}

function buildExecutionAuthorization(
  command: GovernedDeviceCommandMaterial,
  context: AuthenticatedVoiceEvaluationContext,
  authorizedAtMs: number,
): W07DeviceExecutionAuthorization | null {
  const deadlineAtMs = actionDeadlineMs(command.actionIntent);
  if (deadlineAtMs === null || deadlineAtMs <= authorizedAtMs) return null;
  const expiresAtMs = Math.min(deadlineAtMs, authorizedAtMs + MAX_DEVICE_AUTHORIZATION_AGE_MS);
  if (expiresAtMs <= authorizedAtMs) return null;
  return Object.freeze({
    kind: 'W07_DEVICE_EXECUTION_AUTHORIZATION',
    executionId: command.executionId,
    tenantId: context.tenantId,
    deviceId: context.deviceId,
    capabilityId: command.actionIntent.capability.capability,
    targetKind: 'DEVICE',
    authoritySource: 'W07_CURRENT_EXECUTION_AUTHORITY',
    actionId: command.actionIntent.capability.actionType,
    arguments: Object.freeze({}),
    authorizedAtMs,
    expiresAtMs,
    authorizesExecution: true,
    cancelled: false,
  });
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
 *
 * Passing gates cause W07 to mint one short-lived, target-bound authorization view for W15. W14
 * transports that view unchanged but remains non-authoritative. Delivery/ACK/Receipt never refresh
 * the authorization, prove outcome or grant retry.
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

    const executionAuthorization = buildExecutionAuthorization(
      request.command,
      request.context,
      dispatchedAtMs,
    );
    if (executionAuthorization === null) return rejected('MATERIAL_MISMATCH');

    let result: W14GovernedDeviceDispatchResult;
    try {
      result = this.#w14.dispatch({
        command: Object.freeze({ ...request.command, executionAuthorization }),
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
