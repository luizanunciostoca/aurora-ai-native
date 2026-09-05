// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';
import type {
  CommandId,
  CorrelationId,
  EvidenceId,
  ExecutionId,
  ReceiptId,
  TenantId,
} from '@aurora/contracts/ids';

import {
  W07DeviceReceiptObservationAdapter,
  type DeviceReceiptObservation,
  type TrustedDeviceExecutionLookup,
  type TrustedDeviceExecutionMaterial,
  type TrustedDeviceExecutionMaterialSource,
} from '../src/readback/device-receipt-observer.js';

const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV' as TenantId;
const CORRELATION = 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CorrelationId;
const COMMAND = 'cmd_01ARZ3NDEKTSV4RRFFQ69G5FAV' as CommandId;
const EXECUTION = 'exe_01ARZ3NDEKTSV4RRFFQ69G5FAV' as ExecutionId;
const RECEIPT = 'rcp_01ARZ3NDEKTSV4RRFFQ69G5FAV' as ReceiptId;
const EVIDENCE = 'evd_01ARZ3NDEKTSV4RRFFQ69G5FAV' as EvidenceId;
const DEVICE = 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const CAPTURED_AT_MS = Date.parse('2026-09-05T19:30:01.000Z');
const RECEIVED_AT_MS = Date.parse('2026-09-05T19:30:01.500Z');

function actionIntent(deviceId = DEVICE): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: '1.0.0',
    actionIntentId: 'act_01ARZ3NDEKTSV4RRFFQ69G5FAV',
    capability: { capability: 'camera.open', actionType: 'OPEN_CAMERA' },
    executionTarget: {
      schemaVersion: '1.0.0',
      kind: 'DEVICE',
      bindingReference: deviceId,
    },
    tenant: { tenantId: TENANT },
    actor: { kind: 'HUMAN', identityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV' },
    requestOrigin: { kind: 'HUMAN', identityId: 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV' },
    correlation: { correlationId: CORRELATION },
    resolvedParameters: {},
    idempotency: { mode: 'REQUIRED', key: 'device-receipt-observer:1' },
    preconditions: [],
    deadlineAt: '2026-09-05T20:00:00.000Z',
    authority: { kind: 'POLICY_TOKEN', policyTokenId: 'ptk_01ARZ3NDEKTSV4RRFFQ69G5FAV' },
    dataClassification: 'INTERNAL',
  } as unknown as ActionIntent;
}

function material(
  lookup: TrustedDeviceExecutionLookup,
  overrides: Partial<TrustedDeviceExecutionMaterial> = {},
): TrustedDeviceExecutionMaterial {
  return {
    commandId: lookup.commandId,
    executionId: lookup.executionId,
    actionIntent: actionIntent(),
    executor: { executor: 'W15_DEVICE_EXECUTOR', instanceReference: 'tablet-local-1' },
    attempt: 1,
    attemptedAt: '2026-09-05T19:30:00.000Z',
    authorizesExecution: false,
    ...overrides,
  };
}

function observation(
  overrides: Partial<DeviceReceiptObservation> = {},
): DeviceReceiptObservation {
  return {
    kind: 'DEVICE_RECEIPT_EVIDENCE_OBSERVATION',
    schemaVersion: '1.0.0',
    receiptId: RECEIPT,
    evidenceId: EVIDENCE,
    tenantId: TENANT,
    correlationId: CORRELATION,
    commandId: COMMAND,
    executionId: EXECUTION,
    deviceRef: {
      kind: 'AURORA_DEVICE',
      deviceId: DEVICE,
      tenantId: TENANT,
      registrationVersion: 1,
    },
    deviceSessionId: 'device-session-1',
    gatewaySessionId: 'gateway-session-1',
    connectionId: 'connection-1',
    gatewayGeneration: 2,
    deliveryReference: 'w14f:delivery:1',
    reportedState: 'COMPLETED',
    sourceReference: 'android:receipt:1',
    integrityDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    authenticationReference: 'proof:device:1',
    capturedAtMs: CAPTURED_AT_MS,
    receivedAtMs: RECEIVED_AT_MS,
    ingressClassification: 'CURRENT_SESSION',
    requiresW07Reconciliation: false,
    authoritySemantics: 'EVIDENCE_INPUT_ONLY_W07_OWNS_OUTCOME_AND_RETRY',
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
    ...overrides,
  };
}

class CapturingSource implements TrustedDeviceExecutionMaterialSource {
  lookup: TrustedDeviceExecutionLookup | null = null;
  factory: (lookup: TrustedDeviceExecutionLookup) => TrustedDeviceExecutionMaterial | null = material;

  resolve(lookup: TrustedDeviceExecutionLookup): TrustedDeviceExecutionMaterial | null {
    this.lookup = lookup;
    return this.factory(lookup);
  }
}

test('authenticated device receipt becomes attempt receipt and UNVERIFIED execution evidence only', () => {
  const source = new CapturingSource();
  const adapter = new W07DeviceReceiptObservationAdapter(source);
  const result = adapter.observe(observation());
  if (!result.ok) throw new Error(`expected observation, got ${result.code}`);

  assert.deepEqual(source.lookup, { commandId: COMMAND, executionId: EXECUTION });
  assert.deepEqual(Object.keys(source.lookup ?? {}).sort(), ['commandId', 'executionId']);
  assert.equal(result.disposition, 'OBSERVED');
  assert.equal(result.receiptReference, `w07:receipt:${RECEIPT}`);
  assert.equal(result.evidenceReference, `w07:evidence:${EVIDENCE}`);
  assert.equal(result.authorizesExecution, false);
  assert.equal(result.provesExecutionSuccess, false);
  assert.equal(result.retryAuthorized, false);

  assert.equal(result.receipt.executionId, EXECUTION);
  assert.equal(result.receipt.acknowledgedAt, '2026-09-05T19:30:01.000Z');
  assert.equal(result.receipt.returnedAt, '2026-09-05T19:30:01.000Z');
  assert.equal(result.receipt.executionOutcome, undefined);
  assert.equal(result.receipt.executionTarget.kind, 'DEVICE');

  assert.ok(result.evidence);
  assert.equal(result.evidence.evidenceType, 'EXECUTION_RECEIPT');
  assert.equal(result.evidence.verification.state, 'UNVERIFIED');
  assert.equal(result.evidence.source.sourceType, 'EXECUTOR');
  assert.equal(result.evidence.readback, undefined);
  assert.equal(result.evidence.capturedAt, '2026-09-05T19:30:01.000Z');
  assert.equal(result.evidence.metadata?.deviceReportedState, 'COMPLETED');
  assert.equal(result.evidence.metadata?.requiresW07Reconciliation, false);
  assert.equal('authenticationReference' in (result.evidence.metadata ?? {}), false);
  assert.equal('integrityDigest' in (result.evidence.metadata ?? {}), false);
});

test('COMPLETED FAILED and UNCERTAIN device reports never mint execution outcome or retry permission', () => {
  for (const reportedState of ['COMPLETED', 'FAILED', 'UNCERTAIN'] as const) {
    const adapter = new W07DeviceReceiptObservationAdapter(new CapturingSource());
    const result = adapter.observe(
      observation({
        reportedState,
        requiresW07Reconciliation: reportedState === 'UNCERTAIN',
      }),
    );
    if (!result.ok) throw new Error(`expected ${reportedState} observation`);
    assert.equal(result.receipt.executionOutcome, undefined);
    assert.equal(result.evidence?.verification.state, 'UNVERIFIED');
    assert.equal(result.evidence?.metadata?.deviceReportedState, reportedState);
    assert.equal(result.authorizesExecution, false);
    assert.equal(result.provesExecutionSuccess, false);
    assert.equal(result.retryAuthorized, false);
  }
});

test('receipt without evidence id remains a non-verifying attempt record', () => {
  const adapter = new W07DeviceReceiptObservationAdapter(new CapturingSource());
  const withoutEvidence = { ...observation() } as Record<string, unknown>;
  delete withoutEvidence.evidenceId;
  const result = adapter.observe(withoutEvidence);
  if (!result.ok) throw new Error('expected receipt-only observation');

  assert.equal(result.evidenceReference, undefined);
  assert.equal(result.evidence, undefined);
  assert.equal(result.receipt.executionOutcome, undefined);
  assert.equal(result.provesExecutionSuccess, false);
});

test('trusted execution binding must match tenant correlation device command execution and timing', () => {
  const source = new CapturingSource();
  const adapter = new W07DeviceReceiptObservationAdapter(source);

  source.factory = (lookup) => material(lookup, { actionIntent: actionIntent('dvc_01ARZ3NDEKTSV4RRFFQ69G5FAW') });
  let result = adapter.observe(observation());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'CONFLICT');

  source.factory = (lookup) => material(lookup, { commandId: 'cmd_01ARZ3NDEKTSV4RRFFQ69G5FAW' as CommandId });
  result = adapter.observe(observation());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'CONFLICT');

  source.factory = (lookup) => material(lookup, { attemptedAt: '2026-09-05T19:30:02.000Z' });
  result = adapter.observe(observation());
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'CONFLICT');
});

test('malformed authority claims and extra outcome fields fail closed before trusted resolution', () => {
  const source = new CapturingSource();
  const adapter = new W07DeviceReceiptObservationAdapter(source);

  const authorityViolation = { ...observation(), authorizesExecution: true };
  let result = adapter.observe(authorityViolation);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'MALFORMED');
  assert.equal(source.lookup, null);

  const outcomeInjection = { ...observation(), executionOutcome: 'VERIFIED' };
  result = adapter.observe(outcomeInjection);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, 'MALFORMED');
  assert.equal(source.lookup, null);
});

test('missing trusted binding rejects and trusted-source failure remains retryable unavailable', () => {
  const source = new CapturingSource();
  const adapter = new W07DeviceReceiptObservationAdapter(source);

  source.factory = () => null;
  let result = adapter.observe(observation());
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'REJECTED');
    assert.equal(result.retryable, false);
  }

  source.factory = () => {
    throw new Error('canonical execution source unavailable');
  };
  result = adapter.observe(observation());
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, 'UNAVAILABLE');
    assert.equal(result.retryable, true);
  }
});

test('late ingress classification is recorded as UNVERIFIED evidence and does not decide reconciliation', () => {
  const adapter = new W07DeviceReceiptObservationAdapter(new CapturingSource());
  const result = adapter.observe(
    observation({
      ingressClassification: 'LATE_AFTER_RECONNECT',
      requiresW07Reconciliation: true,
    }),
  );
  if (!result.ok) throw new Error('expected late receipt observation');

  assert.equal(result.evidence?.metadata?.ingressClassification, 'LATE_AFTER_RECONNECT');
  assert.equal(result.evidence?.metadata?.requiresW07Reconciliation, true);
  assert.equal(result.evidence?.verification.state, 'UNVERIFIED');
  assert.equal(result.receipt.executionOutcome, undefined);
  assert.equal(result.retryAuthorized, false);
});
