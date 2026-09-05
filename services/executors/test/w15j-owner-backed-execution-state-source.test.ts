// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';
import type { CausationId, CommandId, ExecutionId } from '@aurora/contracts/ids';

import type { FailureContainmentSnapshot } from '../src/failure-containment/types.js';
import {
  OwnerBackedVoiceExecutionStateSource,
  type CurrentVoiceContainmentStateSource,
  type CurrentVoiceSafeguardStateSource,
  type CurrentVoiceTargetBindingSource,
  type PreissuedVoiceExecutionIdentity,
} from '../src/voice-intake/owner-backed-execution-state-source.js';
import type { TrustedVoiceExecutionStateLookup } from '../src/voice-intake/dispatching-intake.js';

const TENANT = 'ten_01J00000000000000000000000';
const ACTOR = 'idn_01J00000000000000000000000';
const CORRELATION = 'cor_01J00000000000000000000000';
const DEVICE = 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const COMMAND = 'cmd_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CommandId;
const CAPABILITY = 'camera.open';
const EVALUATED_AT = '2026-09-05T19:30:00.000Z';

function actionIntent(): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: '1.0.0',
    actionIntentId: 'act_01J00000000000000000000000',
    capability: { capability: CAPABILITY, actionType: 'OPEN_CAMERA' },
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
    idempotency: { mode: 'REQUIRED', key: 'voice:camera:open:owner-backed' },
    preconditions: [],
    deadlineAt: '2026-09-05T20:00:00.000Z',
    dataClassification: 'INTERNAL',
  } as unknown as ActionIntent;
}

function lookup(): TrustedVoiceExecutionStateLookup {
  return {
    candidate: {
      commandId: COMMAND,
      capabilityId: CAPABILITY,
      normalizedTranscript: 'open camera',
      requiresW07Authorization: true,
      authorizesExecution: false,
    },
    context: {
      tenantId: TENANT,
      actorIdentityId: ACTOR,
      correlationId: CORRELATION,
      gatewaySessionId: 'gateway:session:owner-backed',
      connectionId: 'gateway:connection:owner-backed',
      deviceSessionId: 'device:session:owner-backed',
      deviceId: DEVICE,
      registrationVersion: 1,
    },
    actionIntent: actionIntent(),
    evaluatedAt: EVALUATED_AT,
  };
}

function identity(overrides: Partial<PreissuedVoiceExecutionIdentity> = {}): PreissuedVoiceExecutionIdentity {
  return {
    commandId: COMMAND,
    capabilityId: CAPABILITY,
    executionId: 'exe_01ARZ3NDEKTSV4RRFFQ69G5FAV' as ExecutionId,
    causationId: 'cau_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CausationId,
    orderingKey: 'device:camera',
    orderingSequence: 1,
    canonicalPayloadHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    authorizesExecution: false,
    ...overrides,
  };
}

function containment(killSwitchState: 'INACTIVE' | 'ACTIVE' = 'INACTIVE'): FailureContainmentSnapshot {
  return {
    circuit: { state: 'CLOSED', consecutiveFailures: 0, halfOpenProbeInFlight: false },
    killSwitch: {
      state: killSwitchState,
      changedAt: EVALUATED_AT as FailureContainmentSnapshot['killSwitch']['changedAt'],
    },
    dependencyHealth: 'HEALTHY',
    cancellationRequested: false,
    currentInFlight: 0,
    maxInFlight: 2,
    retryDepth: 0,
    maxRetryDepth: 1,
  };
}

class TargetSource implements CurrentVoiceTargetBindingSource {
  calls = 0;
  unavailable = false;
  fail = false;

  resolve(request: Parameters<CurrentVoiceTargetBindingSource['resolve']>[0]) {
    this.calls += 1;
    if (this.fail) throw new Error('target owner unavailable');
    if (this.unavailable) return null;
    const target = request.actionIntent.executionTarget;
    if (target === undefined) return null;
    return [
      {
        schemaVersion: '1.0.0',
        bindingId: 'binding:owner-backed:device',
        tenant: { tenantId: TENANT },
        target,
        state: 'AVAILABLE' as const,
        freshUntil: '2026-09-05T19:45:00.000Z' as never,
        compatibleActionIntentSchemaVersions: ['1.0.0'],
        preconditionsSatisfied: true,
      },
    ];
  }
}

class SafeguardSource implements CurrentVoiceSafeguardStateSource {
  calls = 0;
  attemptNumber = 1;
  fail = false;

  resolve(): ReturnType<CurrentVoiceSafeguardStateSource['resolve']> {
    this.calls += 1;
    if (this.fail) throw new Error('safeguard owner unavailable');
    return {
      attemptNumber: this.attemptNumber,
      maxAttempts: 2,
      quota: { limit: 4, used: 1 },
      authorizesExecution: false,
    };
  }
}

class ContainmentSource implements CurrentVoiceContainmentStateSource {
  calls = 0;
  state: FailureContainmentSnapshot | null = containment();
  fail = false;

  resolve(): FailureContainmentSnapshot | null {
    this.calls += 1;
    if (this.fail) throw new Error('containment owner unavailable');
    return this.state;
  }
}

function runtime(identities: readonly PreissuedVoiceExecutionIdentity[] = [identity()]) {
  const targets = new TargetSource();
  const safeguards = new SafeguardSource();
  const containments = new ContainmentSource();
  const source = new OwnerBackedVoiceExecutionStateSource({
    identities,
    targetBindings: targets,
    safeguards,
    containment: containments,
  });
  return { source, targets, safeguards, containments };
}

test('resolves immutable execution identity while re-reading every current owner on every lookup', () => {
  const { source, targets, safeguards, containments } = runtime();
  const first = source.resolve(lookup());
  if (first === null) throw new Error('expected execution state');
  assert.equal(first.commandId, COMMAND);
  assert.equal(first.executionId, identity().executionId);
  assert.equal(first.orderingSequence, 1);
  assert.equal(first.authorizesExecution, false);
  assert.equal(targets.calls, 1);
  assert.equal(safeguards.calls, 1);
  assert.equal(containments.calls, 1);

  safeguards.attemptNumber = 2;
  containments.state = containment('ACTIVE');
  const second = source.resolve(lookup());
  if (second === null) throw new Error('expected refreshed execution state');
  assert.equal(second.attemptNumber, 2);
  assert.equal(second.containment.killSwitch.state, 'ACTIVE');
  assert.equal(targets.calls, 2);
  assert.equal(safeguards.calls, 2);
  assert.equal(containments.calls, 2);
});

test('command capability and authenticated canonical context must match before current owner reads', () => {
  const { source, targets, safeguards, containments } = runtime();
  assert.equal(
    source.resolve({
      ...lookup(),
      candidate: { ...lookup().candidate, capabilityId: 'camera.capture' },
    }),
    null,
  );
  assert.equal(
    source.resolve({
      ...lookup(),
      context: { ...lookup().context, tenantId: 'ten_01J00000000000000000000001' },
    }),
    null,
  );
  assert.equal(targets.calls, 0);
  assert.equal(safeguards.calls, 0);
  assert.equal(containments.calls, 0);
});

test('missing or throwing current owner state fails closed without default healthy state', () => {
  const { source, targets, safeguards, containments } = runtime();
  targets.unavailable = true;
  assert.equal(source.resolve(lookup()), null);

  targets.unavailable = false;
  safeguards.fail = true;
  assert.equal(source.resolve(lookup()), null);

  safeguards.fail = false;
  containments.state = null;
  assert.equal(source.resolve(lookup()), null);

  containments.state = containment();
  containments.fail = true;
  assert.equal(source.resolve(lookup()), null);
});

test('invalid current safeguard state and empty target binding set fail closed', () => {
  const { source, targets, safeguards } = runtime();
  safeguards.attemptNumber = 0;
  assert.equal(source.resolve(lookup()), null);

  safeguards.attemptNumber = 1;
  targets.unavailable = true;
  assert.equal(source.resolve(lookup()), null);
});

test('constructor rejects duplicate or authority-bearing/malformed preissued execution identities', () => {
  assert.throws(
    () => runtime([identity(), identity()]),
    /Duplicate preissued voice execution identity/u,
  );
  assert.throws(
    () =>
      runtime([
        identity({ authorizesExecution: true as unknown as false }),
      ]),
    /execution identity is invalid/u,
  );
  assert.throws(
    () => runtime([identity({ orderingSequence: 0 })]),
    /execution identity is invalid/u,
  );
});
