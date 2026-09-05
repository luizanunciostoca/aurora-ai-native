// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';
import type { CausationId, CommandId, ExecutionId } from '@aurora/contracts/ids';

import {
  W07GovernedDeviceDispatchAdapter,
  type GovernedDeviceCommandMaterial,
  type GovernedDeviceDispatchGateBundle,
  type W14GovernedDeviceDispatchPort,
  type W14GovernedDeviceDispatchRequest,
  type W14GovernedDeviceDispatchResult,
} from '../src/device-dispatch/governed-device-dispatch.js';
import type { AuthenticatedVoiceEvaluationContext } from '../src/voice-intake/types.js';

const ACTION_INTENT_ID = 'act_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const DEVICE = 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const ACTOR = 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const CORRELATION = 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV';

function actionIntent(): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: '1.0.0',
    actionIntentId: ACTION_INTENT_ID,
    capability: { capability: 'camera.open', actionType: 'OPEN_CAMERA' },
    executionTarget: {
      schemaVersion: '1.0.0',
      kind: 'DEVICE',
      bindingReference: DEVICE,
    },
    tenant: { tenantId: TENANT },
    actor: { kind: 'HUMAN', identityId: ACTOR },
    requestOrigin: { kind: 'HUMAN', identityId: ACTOR },
    correlation: { correlationId: CORRELATION },
    resolvedParameters: {},
    idempotency: { mode: 'REQUIRED', key: 'voice-camera-open-1' },
    preconditions: [],
    deadlineAt: '2026-09-05T21:00:00.000Z',
    dataClassification: 'INTERNAL',
  } as unknown as ActionIntent;
}

function command(): GovernedDeviceCommandMaterial {
  return {
    commandId: 'cmd_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CommandId,
    executionId: 'exe_01ARZ3NDEKTSV4RRFFQ69G5FAV' as ExecutionId,
    causationId: 'cau_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CausationId,
    orderingKey: 'device:camera',
    orderingSequence: 1,
    actionIntent: actionIntent(),
    canonicalPayloadHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    authorizesExecution: false,
  };
}

function context(): AuthenticatedVoiceEvaluationContext {
  return {
    tenantId: TENANT,
    actorIdentityId: ACTOR,
    correlationId: CORRELATION,
    gatewaySessionId: 'gateway-session-1',
    connectionId: 'gateway-connection-1',
    deviceSessionId: 'device-session-1',
    deviceId: DEVICE,
    registrationVersion: 1,
  };
}

function gates(): GovernedDeviceDispatchGateBundle {
  const target = actionIntent().executionTarget;
  if (target === undefined) throw new Error('device target fixture missing');
  return {
    authority: {
      kind: 'EXECUTOR_AUTHORITY_GATE',
      schemaVersion: '1.0.0',
      actionIntentId: ACTION_INTENT_ID,
      executionEligible: true,
      currentAuthorityValidated: true,
      reasons: [],
      authorizesExecution: false,
    },
    target: {
      kind: 'EXECUTION_TARGET_RESOLUTION',
      schemaVersion: '1.0.0',
      target,
      resolved: true,
      binding: {
        schemaVersion: '1.0.0',
        bindingId: 'binding:device:1',
        tenant: { tenantId: TENANT },
        target,
        state: 'AVAILABLE',
        compatibleActionIntentSchemaVersions: ['1.0.0'],
        preconditionsSatisfied: true,
      },
      reasons: [],
      authorizesExecution: false,
    },
    safeguards: {
      kind: 'EXECUTION_SAFEGUARD_RESULT',
      schemaVersion: '1.0.0',
      actionIntentId: ACTION_INTENT_ID,
      safeToInvokeExternal: true,
      idempotencyReserved: true,
      reasons: [],
      authorizesExecution: false,
    },
    containment: {
      kind: 'FAILURE_CONTAINMENT_RESULT',
      schemaVersion: '1.0.0',
      actionIntentId: ACTION_INTENT_ID,
      mayProceedToOtherGuards: true,
      degradedMode: false,
      halfOpenProbeEligible: false,
      cancellationDisposition: 'NONE',
      requiresReconciliationHandoff: false,
      reasons: [],
      authorizesExecution: false,
    },
  } as unknown as GovernedDeviceDispatchGateBundle;
}

class CapturingW14Port implements W14GovernedDeviceDispatchPort {
  calls: W14GovernedDeviceDispatchRequest[] = [];
  result: W14GovernedDeviceDispatchResult = {
    ok: true,
    disposition: 'SUBMITTED',
    commandReference: 'w14:command:1',
    deliveryReference: 'w14:delivery:1',
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };

  dispatch(request: W14GovernedDeviceDispatchRequest): W14GovernedDeviceDispatchResult {
    this.calls.push(request);
    return this.result;
  }
}

test('hands a governed device command to W14 only after all W07 gates pass', () => {
  const port = new CapturingW14Port();
  const adapter = new W07GovernedDeviceDispatchAdapter(port, () => 1_788_633_600_000);
  const result = adapter.dispatch({ command: command(), context: context(), gates: gates() });

  assert.equal(result.ok, true);
  assert.equal(port.calls.length, 1);
  assert.equal(port.calls[0]?.dispatchedAtMs, 1_788_633_600_000);
  assert.equal(port.calls[0]?.command.causationId, 'cau_01ARZ3NDEKTSV4RRFFQ69G5FAV');
  assert.equal(port.calls[0]?.command.orderingKey, 'device:camera');
  assert.equal(port.calls[0]?.command.orderingSequence, 1);
  assert.equal(port.calls[0]?.command.actionIntent.executionTarget?.kind, 'DEVICE');
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.provesExecutionSuccess, false);
  assert.equal(result.retryAuthorized, false);
});

test('authority target safeguards and containment failures each prevent any W14 call', () => {
  const mutations: Array<(value: GovernedDeviceDispatchGateBundle) => void> = [
    (value) => Object.assign(value.authority, { executionEligible: false }),
    (value) => Object.assign(value.authority, { currentAuthorityValidated: false }),
    (value) => Object.assign(value.target, { resolved: false }),
    (value) => Object.assign(value.safeguards, { safeToInvokeExternal: false }),
    (value) => Object.assign(value.containment, { mayProceedToOtherGuards: false }),
    (value) =>
      Object.assign(value.containment, { cancellationDisposition: 'STOP_BEFORE_EXTERNAL' }),
    (value) => Object.assign(value.containment, { requiresReconciliationHandoff: true }),
  ];

  for (const mutate of mutations) {
    const port = new CapturingW14Port();
    const adapter = new W07GovernedDeviceDispatchAdapter(port);
    const candidate = gates() as unknown as Record<string, unknown>;
    mutate(candidate as unknown as GovernedDeviceDispatchGateBundle);
    const result = adapter.dispatch({
      command: command(),
      context: context(),
      gates: candidate as unknown as GovernedDeviceDispatchGateBundle,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'GATE_REJECTED');
    assert.equal(port.calls.length, 0);
  }
});

test('authenticated W14 context must match canonical action target tenant actor and correlation', () => {
  for (const badContext of [
    { ...context(), deviceId: 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAW' },
    { ...context(), tenantId: 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAW' },
    { ...context(), actorIdentityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAW' },
    { ...context(), correlationId: 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAW' },
  ]) {
    const port = new CapturingW14Port();
    const result = new W07GovernedDeviceDispatchAdapter(port).dispatch({
      command: command(),
      context: badContext,
      gates: gates(),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'CONTEXT_MISMATCH');
    assert.equal(port.calls.length, 0);
  }
});

test('malformed server-owned command identifiers and ordering fail closed before W14', () => {
  for (const malformed of [
    { ...command(), causationId: 'not-a-causation-id' as CausationId },
    { ...command(), orderingKey: '' },
    { ...command(), orderingSequence: 0 },
  ]) {
    const port = new CapturingW14Port();
    const adapter = new W07GovernedDeviceDispatchAdapter(port);
    const result = adapter.dispatch({ command: malformed, context: context(), gates: gates() });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, 'MATERIAL_MISMATCH');
    assert.equal(port.calls.length, 0);
  }
});

test('W14 failure or protocol violation never becomes authority success outcome or retry permission', () => {
  const port = new CapturingW14Port();
  const adapter = new W07GovernedDeviceDispatchAdapter(port);

  port.result = {
    ok: false,
    code: 'SESSION_NOT_CURRENT',
    retryable: true,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
  let result = adapter.dispatch({ command: command(), context: context(), gates: gates() });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'W14_REJECTED');
    assert.equal(result.retryable, true);
    assert.equal(result.retryAuthorized, false);
  }

  port.result = {
    ok: true,
    disposition: 'SUBMITTED',
    commandReference: 'w14:command:2',
    authorizesExecution: true,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  } as unknown as W14GovernedDeviceDispatchResult;
  result = adapter.dispatch({ command: command(), context: context(), gates: gates() });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'W14_PROTOCOL_VIOLATION');
});
