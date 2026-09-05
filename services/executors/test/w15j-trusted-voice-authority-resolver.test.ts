// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- executor harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { ActionIntent } from '@aurora/contracts/actions';
import type { AuthorityEvaluationRequest } from '@aurora/contracts/policy-validation';

import type { CurrentAuthorityValidator } from '../src/sdk/types.js';
import {
  TrustedServerVoiceAuthorityResolver,
  type TrustedVoiceAuthorityLookup,
  type TrustedVoiceAuthorityMaterial,
  type TrustedVoiceAuthorityMaterialSource,
} from '../src/voice-intake/trusted-resolver.js';
import type { ResolveVoiceEvaluationInput } from '../src/voice-intake/types.js';

const NOW_MS = Date.parse('2026-09-05T19:30:00.000Z');
const TENANT = 'ten_01J00000000000000000000000';
const ACTOR = 'idn_01J00000000000000000000000';
const CORRELATION = 'cor_01J00000000000000000000000';
const DEVICE = 'dvc_01ARZ3NDEKTSV4RRFFQ69G5FAV';

const input: ResolveVoiceEvaluationInput = {
  candidate: {
    commandId: 'open-camera',
    capabilityId: 'camera.open',
    normalizedTranscript: 'open camera',
    requiresW07Authorization: true,
    authorizesExecution: false,
  },
  context: {
    tenantId: TENANT,
    actorIdentityId: ACTOR,
    correlationId: CORRELATION,
    gatewaySessionId: 'gateway-session-1',
    connectionId: 'connection-1',
    deviceSessionId: 'device-session-1',
    deviceId: DEVICE,
    registrationVersion: 1,
  },
};

function actionIntent(overrides: Record<string, unknown> = {}): ActionIntent {
  return {
    kind: 'ACTION_INTENT',
    schemaVersion: '1.0.0',
    actionIntentId: 'act_01J00000000000000000000000',
    capability: { capability: input.candidate.capabilityId, actionType: 'OPEN_CAMERA' },
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
    idempotency: { mode: 'REQUIRED', key: 'voice:open-camera:1' },
    preconditions: [],
    deadlineAt: '2026-09-05T20:00:00.000Z',
    authority: { kind: 'POLICY_TOKEN', policyTokenId: 'ptk_01J00000000000000000000000' },
    dataClassification: 'INTERNAL',
    ...overrides,
  } as unknown as ActionIntent;
}

function authorityEvaluation(
  evaluatedAt: string,
  overrides: Record<string, unknown> = {},
): AuthorityEvaluationRequest {
  return {
    kind: 'AuthorityEvaluationRequest',
    policyEvaluation: {
      kind: 'PolicyEvaluationRequest',
      schemaVersion: '1.0.0',
      policy: { reference: 'policy:device-voice', version: '1.0.0' },
      snapshot: {
        kind: 'PolicySnapshot',
        policy: { reference: 'policy:device-voice', version: '1.0.0' },
        state: 'ACTIVE',
        rules: [],
      },
      correlation: { correlationId: CORRELATION },
      evaluatedAt,
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
      requestedScope: [input.candidate.capabilityId],
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
      ...overrides,
    },
  } as unknown as AuthorityEvaluationRequest;
}

function material(
  lookup: TrustedVoiceAuthorityLookup,
  overrides: Partial<TrustedVoiceAuthorityMaterial> = {},
): TrustedVoiceAuthorityMaterial {
  return {
    commandId: lookup.commandId,
    capabilityId: lookup.capabilityId,
    actionIntent: actionIntent(),
    authorityEvaluation: authorityEvaluation(lookup.evaluatedAt),
    authorizesExecution: false,
    ...overrides,
  };
}

class CapturingSource implements TrustedVoiceAuthorityMaterialSource {
  lookup: TrustedVoiceAuthorityLookup | null = null;
  factory: (lookup: TrustedVoiceAuthorityLookup) => TrustedVoiceAuthorityMaterial | null = material;

  resolve(lookup: TrustedVoiceAuthorityLookup): TrustedVoiceAuthorityMaterial | null {
    this.lookup = lookup;
    return this.factory(lookup);
  }
}

const validator = (() => {
  throw new Error('validator should not be invoked by resolver construction');
}) as CurrentAuthorityValidator;

test('trusted resolver exposes only command capability and server time to the material source', () => {
  const source = new CapturingSource();
  const resolver = new TrustedServerVoiceAuthorityResolver({
    source,
    validateCurrentAuthority: validator,
    clock: () => NOW_MS,
  });

  const resolved = resolver.resolve(input);
  assert.ok(resolved);
  assert.deepEqual(source.lookup, {
    commandId: input.candidate.commandId,
    capabilityId: input.candidate.capabilityId,
    evaluatedAt: '2026-09-05T19:30:00.000Z',
  });
  assert.deepEqual(Object.keys(source.lookup ?? {}).sort(), [
    'capabilityId',
    'commandId',
    'evaluatedAt',
  ]);
  assert.equal('normalizedTranscript' in (source.lookup ?? {}), false);
  assert.equal('tenantId' in (source.lookup ?? {}), false);
  assert.equal('actorIdentityId' in (source.lookup ?? {}), false);
  assert.equal('deviceId' in (source.lookup ?? {}), false);
  assert.strictEqual(resolved.validateCurrentAuthority, validator);
  assert.equal(resolved.actionIntent.tenant.tenantId, TENANT);
  assert.equal(resolved.authorityEvaluation.policyEvaluation.evaluatedAt, source.lookup?.evaluatedAt);
});

test('authenticated W14 context mismatch fails closed before material is returned to W07 intake', () => {
  const source = new CapturingSource();
  source.factory = (lookup) =>
    material(lookup, {
      actionIntent: actionIntent({ tenant: { tenantId: 'ten_01J00000000000000000000001' } }),
    });
  const resolver = new TrustedServerVoiceAuthorityResolver({
    source,
    validateCurrentAuthority: validator,
    clock: () => NOW_MS,
  });

  assert.equal(resolver.resolve(input), null);
});

test('source cannot replay a stale authority evaluation timestamp', () => {
  const source = new CapturingSource();
  source.factory = (lookup) =>
    material(lookup, {
      authorityEvaluation: authorityEvaluation('2026-09-05T19:29:59.999Z'),
    });
  const resolver = new TrustedServerVoiceAuthorityResolver({
    source,
    validateCurrentAuthority: validator,
    clock: () => NOW_MS,
  });

  assert.equal(resolver.resolve(input), null);
});

test('candidate command or capability can only resolve matching server-owned material', () => {
  const source = new CapturingSource();
  source.factory = (lookup) => material(lookup, { commandId: 'different-command' });
  const resolver = new TrustedServerVoiceAuthorityResolver({
    source,
    validateCurrentAuthority: validator,
    clock: () => NOW_MS,
  });
  assert.equal(resolver.resolve(input), null);

  source.factory = (lookup) => material(lookup, { capabilityId: 'device.admin.reset' });
  assert.equal(resolver.resolve(input), null);
});

test('material source cannot replace the W02-owned current-authority validator', () => {
  const source = new CapturingSource();
  const maliciousValidator = (() => {
    throw new Error('must never be selected');
  }) as CurrentAuthorityValidator;
  source.factory = (lookup) =>
    ({
      ...material(lookup),
      validateCurrentAuthority: maliciousValidator,
    }) as unknown as TrustedVoiceAuthorityMaterial;
  const resolver = new TrustedServerVoiceAuthorityResolver({
    source,
    validateCurrentAuthority: validator,
    clock: () => NOW_MS,
  });

  const resolved = resolver.resolve(input);
  assert.ok(resolved);
  assert.strictEqual(resolved.validateCurrentAuthority, validator);
  assert.notStrictEqual(resolved.validateCurrentAuthority, maliciousValidator);
});

test('source failure and invalid server clocks fail closed', () => {
  const source = new CapturingSource();
  source.factory = () => {
    throw new Error('trusted source unavailable');
  };
  const failedSource = new TrustedServerVoiceAuthorityResolver({
    source,
    validateCurrentAuthority: validator,
    clock: () => NOW_MS,
  });
  assert.equal(failedSource.resolve(input), null);

  const invalidClock = new TrustedServerVoiceAuthorityResolver({
    source: new CapturingSource(),
    validateCurrentAuthority: validator,
    clock: () => Number.NaN,
  });
  assert.equal(invalidClock.resolve(input), null);
});
