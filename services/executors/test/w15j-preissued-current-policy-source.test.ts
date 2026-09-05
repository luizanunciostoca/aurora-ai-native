// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { PolicyTokenId } from '@aurora/contracts/ids';
import type { PolicyEvaluationRequest, PolicySnapshot } from '@aurora/contracts/policy-engine';

import {
  PreissuedCurrentPolicyVoiceAuthoritySource,
  type PreissuedVoiceAuthorityEntry,
  type TrustedCurrentPolicySnapshotSource,
  type TrustedCurrentPolicySourceRequest,
} from '../src/voice-intake/preissued-authority-source.js';

const EVALUATED_AT = '2026-09-05T20:30:00.000Z' as Rfc3339Timestamp;
const TENANT = 'ten_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const ACTOR = 'idn_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const CORRELATION = 'cor_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const DEVICE = 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV';
const POLICY_REFERENCE = 'policy:device-voice';

function actionIntent(): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: '1.0.0',
    actionIntentId: 'act_01ARZ3NDEKTSV4RRFFQ69G5FAV',
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
    idempotency: { mode: 'REQUIRED', key: 'voice:camera:1' },
    preconditions: [],
    deadlineAt: '2026-09-05T20:31:00.000Z',
    authority: {
      kind: 'POLICY_TOKEN',
      policyTokenId: 'ptk_01J00000000000000000000000' as PolicyTokenId,
    },
    dataClassification: 'INTERNAL',
  } as unknown as ActionIntent;
}

function policySeed(): PreissuedVoiceAuthorityEntry['policyEvaluation'] {
  return {
    kind: 'PolicyEvaluationRequest',
    schemaVersion: '1.0.0',
    correlation: { correlationId: CORRELATION },
    tenant: { tenantId: TENANT },
    tenantBoundary: {
      status: 'WITHIN_BOUNDARY',
      reason: 'BOUNDARY_CONFIRMED',
      correlationId: CORRELATION,
      evidence: {
        evaluatedTenantId: TENANT,
        actorIdentityId: ACTOR,
        matchedBindingCount: 1,
        observedBindingTenantIds: [TENANT],
      },
    },
    actor: { kind: 'HUMAN', identityId: ACTOR },
    subject: { kind: 'IDENTITY', identityId: ACTOR },
    action: 'OPEN_CAMERA',
    requestedScope: ['camera.open'],
    purpose: {
      kind: 'PurposeContext',
      purposeId: 'local-device-control',
      version: '1.0.0',
      status: 'ACTIVE',
      allowedDataClassifications: ['INTERNAL'],
    },
    jurisdiction: {
      kind: 'JurisdictionContext',
      jurisdiction: 'BR-BA',
      version: '1.0.0',
    },
    dataClassification: 'INTERNAL',
    policyToken: {
      kind: 'POLICY_TOKEN',
      schemaVersion: '1.0.0',
      policyTokenId: 'ptk_01J00000000000000000000000' as PolicyTokenId,
      tenant: { tenantId: TENANT },
      subject: { reference: `identity:${ACTOR}` },
      action: 'OPEN_CAMERA',
      scope: ['camera.open'],
      issuedAt: '2026-09-05T20:00:00.000Z',
      expiresAt: '2026-09-05T21:00:00.000Z',
      policy: { reference: POLICY_REFERENCE, version: '1.0.0' },
      authorityClass: 'POLICY_RULE',
      correlation: { correlationId: CORRELATION },
    },
  } as unknown as PreissuedVoiceAuthorityEntry['policyEvaluation'];
}

function currentSnapshot(version = '2.0.0'): PolicySnapshot {
  return {
    kind: 'PolicySnapshot',
    policy: { reference: POLICY_REFERENCE, version },
    state: 'ACTIVE',
    rules: [],
  } as unknown as PolicySnapshot;
}

function entry(): PreissuedVoiceAuthorityEntry {
  return {
    commandId: 'open-camera',
    capabilityId: 'camera.open',
    actionIntent: actionIntent(),
    expectedPolicyReference: POLICY_REFERENCE,
    policyEvaluation: policySeed(),
    authorizesExecution: false,
  };
}

class CapturingPolicySource implements TrustedCurrentPolicySnapshotSource {
  request: TrustedCurrentPolicySourceRequest | null = null;
  snapshot: PolicySnapshot | undefined = currentSnapshot();

  getCurrent(request: TrustedCurrentPolicySourceRequest): PolicySnapshot | undefined {
    this.request = request;
    return this.snapshot;
  }
}

test('resolves preissued authority against current policy version and server evaluation time', () => {
  const currentPolicy = new CapturingPolicySource();
  const source = new PreissuedCurrentPolicyVoiceAuthoritySource([entry()], currentPolicy);
  const resolved = source.resolve({
    commandId: 'open-camera',
    capabilityId: 'camera.open',
    evaluatedAt: EVALUATED_AT,
  });
  if (resolved === null) throw new Error('expected preissued authority material to resolve');

  assert.deepEqual(currentPolicy.request, {
    policyReference: POLICY_REFERENCE,
    tenantId: TENANT,
    actorIdentityId: ACTOR,
  });
  assert.equal(resolved.authorityEvaluation.policyEvaluation.evaluatedAt, EVALUATED_AT);
  assert.equal(resolved.authorityEvaluation.policyEvaluation.policy.version, '2.0.0');
  assert.equal(resolved.authorityEvaluation.policyEvaluation.snapshot.policy.version, '2.0.0');
  assert.equal(resolved.authorityEvaluation.policyEvaluation.policyToken?.policy.version, '1.0.0');
  assert.equal(resolved.authorizesExecution, false);
});

test('has no token issuance approval or authority widening API', () => {
  const source = new PreissuedCurrentPolicyVoiceAuthoritySource(
    [entry()],
    new CapturingPolicySource(),
  ) as unknown as Record<string, unknown>;

  assert.equal('issue' in source, false);
  assert.equal('mint' in source, false);
  assert.equal('approve' in source, false);
  assert.equal('authorize' in source, false);
});

test('missing changed or failing current policy fails closed', () => {
  const currentPolicy = new CapturingPolicySource();
  const source = new PreissuedCurrentPolicyVoiceAuthoritySource([entry()], currentPolicy);

  currentPolicy.snapshot = undefined;
  assert.equal(
    source.resolve({
      commandId: 'open-camera',
      capabilityId: 'camera.open',
      evaluatedAt: EVALUATED_AT,
    }),
    null,
  );

  currentPolicy.snapshot = {
    ...currentSnapshot(),
    policy: { reference: 'policy:other', version: '2.0.0' },
  } as unknown as PolicySnapshot;
  assert.equal(
    source.resolve({
      commandId: 'open-camera',
      capabilityId: 'camera.open',
      evaluatedAt: EVALUATED_AT,
    }),
    null,
  );

  const failed: TrustedCurrentPolicySnapshotSource = {
    getCurrent: () => {
      throw new Error('current policy unavailable');
    },
  };
  assert.equal(
    new PreissuedCurrentPolicyVoiceAuthoritySource([entry()], failed).resolve({
      commandId: 'open-camera',
      capabilityId: 'camera.open',
      evaluatedAt: EVALUATED_AT,
    }),
    null,
  );
});

test('rejects duplicate or internally inconsistent preissued bindings', () => {
  assert.throws(
    () =>
      new PreissuedCurrentPolicyVoiceAuthoritySource(
        [entry(), entry()],
        new CapturingPolicySource(),
      ),
    /Duplicate/u,
  );

  const inconsistent = {
    ...entry(),
    capabilityId: 'camera.capture',
  } satisfies PreissuedVoiceAuthorityEntry;
  assert.throws(
    () => new PreissuedCurrentPolicyVoiceAuthoritySource([inconsistent], new CapturingPolicySource()),
    /bindings are invalid/u,
  );
});
