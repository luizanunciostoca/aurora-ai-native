// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { CorrelationId, TenantId } from '@aurora/contracts';

import {
  composePublicationProviderIntegration,
  reconcilePublicationProviderIntegration,
  type PublicationProviderReconciliationRecord,
  type W11BProviderReadbackProjection,
  type W11BProviderWriteProjection,
  type W11BProviderWriteRequestProjection,
} from '../src/social/publication-provider-integration.js';
import {
  createOrganicPublication,
  transitionOrganicPublication,
  type OrganicPublicationRecord,
} from '../src/social/publication-scheduling.js';

const TENANT = 'ten_01JW11BTENANT000000000000' as TenantId;
const OTHER_TENANT = 'ten_01JW11BOTHER0000000000000' as TenantId;
const CORRELATION = 'cor_01JW11BCORRELATION0000000' as CorrelationId;

function dispatchRequested(): OrganicPublicationRecord {
  const created = createOrganicPublication({
    tenantId: TENANT,
    correlationId: CORRELATION,
    publicationId: 'publication:w11b:story',
    kind: 'STORY',
    accountReference: 'instagram-account:toca',
    providerBindingReference: 'provider-binding:instagram:toca',
    mediaReferences: ['media:story:1'],
    caption: 'The Party',
    evaluatedAt: '2026-09-03T15:00:00Z',
    initialState: 'PREPARED',
    idempotencyKey: 'idem:create:w11b',
    operationId: 'op:create:w11b',
  });
  assert.equal(created.status, 'APPLIED');
  if (created.status !== 'APPLIED') throw new Error('create fixture failed');

  const dispatch = transitionOrganicPublication({
    tenantId: TENANT,
    correlationId: CORRELATION,
    record: created.record,
    command: 'REQUEST_DISPATCH',
    expectedRevision: created.record.revision,
    evaluatedAt: '2026-09-03T15:01:00Z',
    idempotencyKey: 'idem:dispatch:w11b',
    operationId: 'op:dispatch:w11b',
  });
  assert.equal(dispatch.status, 'APPLIED');
  if (dispatch.status !== 'APPLIED') throw new Error('dispatch fixture failed');
  return dispatch.record;
}

function composed(prior?: PublicationProviderReconciliationRecord): W11BProviderWriteRequestProjection {
  const publication = dispatchRequested();
  const result = composePublicationProviderIntegration({
    tenantId: TENANT,
    correlationId: CORRELATION,
    publication,
    provider: 'instagram',
    bindingVersion: 3,
    actionIntentId: 'act_w11b_publish_01',
    executionProof: {
      kind: 'W07_PROVIDER_EXECUTION_PROOF',
      actionIntentId: 'act_w11b_publish_01',
      currentAuthorityValidated: true,
      executionEligible: true,
      validatedAt: '2026-09-03T15:01:01Z',
      authorizesExecution: false,
    },
    safeMode: 'SANDBOX',
    evaluatedAt: '2026-09-03T15:01:02Z',
    ...(prior !== undefined ? { prior } : {}),
  });
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') throw new Error(`compose fixture blocked: ${result.code}`);
  return result.request;
}

function successfulWrite(
  overrides: Partial<Extract<W11BProviderWriteProjection, { ok: true }>> = {},
): Extract<W11BProviderWriteProjection, { ok: true }> {
  return {
    ok: true,
    provider: 'instagram',
    accountReference: 'instagram-account:toca',
    bindingReference: 'provider-binding:instagram:toca',
    bindingVersion: 3,
    actionIntentId: 'act_w11b_publish_01',
    providerReference: '17890000000000001',
    providerRevision: 'rev-provider-1',
    requiresReadback: true,
    safeMode: 'SANDBOX',
    observedAt: '2026-09-03T15:02:00Z',
    authorizesExecution: false,
    ...overrides,
  };
}

function effectObservedReadback(
  overrides: Partial<Extract<W11BProviderReadbackProjection, { ok: true }>> = {},
): Extract<W11BProviderReadbackProjection, { ok: true }> {
  return {
    ok: true,
    provider: 'instagram',
    accountReference: 'instagram-account:toca',
    bindingReference: 'provider-binding:instagram:toca',
    bindingVersion: 3,
    actionIntentId: 'act_w11b_publish_01',
    observation: {
      state: 'EFFECT_OBSERVED',
      observedAt: '2026-09-03T15:03:00Z',
      reference: '17890000000000001',
    },
    providerRevision: 'rev-provider-2',
    requiresFurtherReadback: false,
    retryAuthorized: false,
    authorizesExecution: false,
    ...overrides,
  };
}

test('W11-B composes W11-A dispatch with an exact W07 proof and no execution authority', () => {
  const request = composed();

  assert.equal(request.kind, 'W11_PROVIDER_WRITE_REQUEST');
  assert.equal(request.action, 'social.publish');
  assert.equal(request.provider, 'instagram');
  assert.equal(request.accountReference, 'instagram-account:toca');
  assert.equal(request.bindingReference, 'provider-binding:instagram:toca');
  assert.equal(request.bindingVersion, 3);
  assert.equal(request.idempotencyKey, 'idem:dispatch:w11b');
  assert.deepEqual(request.mediaReferences, ['media:story:1']);
  assert.equal(request.caption, 'The Party');
  assert.equal(request.safeMode, 'SANDBOX');
  assert.equal(request.executionProof.kind, 'W07_PROVIDER_EXECUTION_PROOF');
  assert.equal(request.authorizesExecution, false);
  assert.equal(request.retryAuthorized, false);
});

test('W11-B fails closed on W07 proof, tenant and binding drift', () => {
  const publication = dispatchRequested();
  const base = {
    tenantId: TENANT,
    correlationId: CORRELATION,
    publication,
    provider: 'instagram',
    bindingVersion: 3,
    actionIntentId: 'act_w11b_publish_01',
    executionProof: {
      kind: 'W07_PROVIDER_EXECUTION_PROOF' as const,
      actionIntentId: 'act_w11b_publish_01',
      currentAuthorityValidated: true as const,
      executionEligible: true as const,
      validatedAt: '2026-09-03T15:01:01Z',
      authorizesExecution: false as const,
    },
    safeMode: 'SANDBOX' as const,
    evaluatedAt: '2026-09-03T15:01:02Z',
  };

  assert.deepEqual(
    composePublicationProviderIntegration({ ...base, tenantId: OTHER_TENANT }),
    { status: 'BLOCKED', code: 'PUBLICATION_CONTEXT_MISMATCH', authorizesExecution: false },
  );

  assert.deepEqual(
    composePublicationProviderIntegration({
      ...base,
      actionIntentId: 'act_other',
    }),
    { status: 'BLOCKED', code: 'EXECUTION_PROOF_INVALID', authorizesExecution: false },
  );

  assert.deepEqual(
    composePublicationProviderIntegration({
      ...base,
      executionProof: { ...base.executionProof, validatedAt: '2026-09-03T15:01:03Z' },
    }),
    { status: 'BLOCKED', code: 'EXECUTION_PROOF_STALE', authorizesExecution: false },
  );

  const forgedBinding = {
    ...publication,
    providerBindingReference: 'provider-binding:forged',
  };
  assert.deepEqual(
    composePublicationProviderIntegration({ ...base, publication: forgedBinding }),
    { status: 'BLOCKED', code: 'PUBLICATION_BINDING_MISMATCH', authorizesExecution: false },
  );
});

test('W11-B blocks forged dispatches with missing media before provider composition', () => {
  const publication = dispatchRequested();
  const forged = { ...publication, mediaReferences: [] as readonly string[] };

  const result = composePublicationProviderIntegration({
    tenantId: TENANT,
    correlationId: CORRELATION,
    publication: forged,
    provider: 'instagram',
    bindingVersion: 3,
    actionIntentId: 'act_w11b_publish_01',
    executionProof: {
      kind: 'W07_PROVIDER_EXECUTION_PROOF',
      actionIntentId: 'act_w11b_publish_01',
      currentAuthorityValidated: true,
      executionEligible: true,
      validatedAt: '2026-09-03T15:01:01Z',
      authorizesExecution: false,
    },
    safeMode: 'SANDBOX',
    evaluatedAt: '2026-09-03T15:01:02Z',
  });

  assert.deepEqual(result, { status: 'BLOCKED', code: 'MISSING_MEDIA', authorizesExecution: false });
});

test('W11-B stores provider post IDs only as opaque external references after readback', () => {
  const request = composed();
  const result = reconcilePublicationProviderIntegration({
    request,
    write: successfulWrite(),
    readback: effectObservedReadback(),
    evaluatedAt: '2026-09-03T15:04:00Z',
  });

  assert.equal(result.status, 'APPLIED');
  if (result.status !== 'APPLIED') return;
  assert.equal(result.record.state, 'EFFECT_OBSERVED');
  assert.deepEqual(result.record.providerExternalReference, {
    kind: 'PROVIDER_EXTERNAL_REFERENCE',
    provider: 'instagram',
    resourceKind: 'SOCIAL_POST',
    externalId: '17890000000000001',
  });
  assert.equal('entityId' in (result.record.providerExternalReference ?? {}), false);
  assert.equal(result.record.retryAuthorized, false);
  assert.equal(result.record.authorizesExecution, false);
});

test('W11-B preserves ambiguous write as reconciliation-required and never blind-retries', () => {
  const request = composed();
  const ambiguous: W11BProviderWriteProjection = {
    ok: false,
    error: 'AMBIGUOUS_WRITE',
    mutationPossible: true,
    observedAt: '2026-09-03T15:02:00Z',
    authorizesExecution: false,
  };

  const result = reconcilePublicationProviderIntegration({
    request,
    write: ambiguous,
    evaluatedAt: '2026-09-03T15:04:00Z',
  });

  assert.equal(result.status, 'APPLIED');
  if (result.status !== 'APPLIED') return;
  assert.equal(result.record.state, 'RECONCILIATION_REQUIRED');
  assert.equal(result.record.requiresReconciliation, true);
  assert.equal(result.record.freshW07RequiredForAnyRetry, true);
  assert.equal(result.record.retryAuthorized, false);
});

test('W11-B accepts a late readback after ambiguous write but rejects time travel', () => {
  const request = composed();
  const ambiguous: W11BProviderWriteProjection = {
    ok: false,
    error: 'AMBIGUOUS_WRITE',
    mutationPossible: true,
    observedAt: '2026-09-03T15:02:00Z',
    authorizesExecution: false,
  };
  const first = reconcilePublicationProviderIntegration({
    request,
    write: ambiguous,
    evaluatedAt: '2026-09-03T15:02:30Z',
  });
  assert.equal(first.status, 'APPLIED');
  if (first.status !== 'APPLIED') return;

  const resolved = reconcilePublicationProviderIntegration({
    request,
    write: ambiguous,
    readback: effectObservedReadback(),
    previous: first.record,
    evaluatedAt: '2026-09-03T15:04:00Z',
  });
  assert.equal(resolved.status, 'APPLIED');
  if (resolved.status === 'APPLIED') {
    assert.equal(resolved.record.state, 'EFFECT_OBSERVED');
    assert.equal(resolved.record.retryAuthorized, false);
  }

  const beforeWrite = effectObservedReadback({
    observation: {
      state: 'EFFECT_OBSERVED',
      observedAt: '2026-09-03T15:01:59Z',
      reference: '17890000000000001',
    },
  });
  assert.deepEqual(
    reconcilePublicationProviderIntegration({
      request,
      write: ambiguous,
      readback: beforeWrite,
      evaluatedAt: '2026-09-03T15:04:00Z',
    }),
    { status: 'BLOCKED', code: 'OBSERVATION_TIME_ORDER_INVALID', authorizesExecution: false },
  );
});

test('W11-B records no-effect without creating retry authority', () => {
  const request = composed();
  const readback = effectObservedReadback({
    observation: {
      state: 'NO_EFFECT_CONFIRMED',
      observedAt: '2026-09-03T15:03:00Z',
      reference: 'readback:no-effect:1',
    },
  });

  const result = reconcilePublicationProviderIntegration({
    request,
    write: successfulWrite(),
    readback,
    evaluatedAt: '2026-09-03T15:04:00Z',
  });
  assert.equal(result.status, 'APPLIED');
  if (result.status !== 'APPLIED') return;
  assert.equal(result.record.state, 'NO_EFFECT_CONFIRMED');
  assert.equal(result.record.freshW07RequiredForAnyRetry, true);
  assert.equal(result.record.retryAuthorized, false);
  assert.equal(result.record.authorizesExecution, false);
});

test('W11-B keeps provider authentication failure as known failure without retry authority', () => {
  const request = composed();
  const tokenExpired: W11BProviderWriteProjection = {
    ok: false,
    error: 'PROVIDER_AUTHENTICATION_FAILED',
    mutationPossible: false,
    observedAt: '2026-09-03T15:02:00Z',
    authorizesExecution: false,
  };

  const result = reconcilePublicationProviderIntegration({
    request,
    write: tokenExpired,
    evaluatedAt: '2026-09-03T15:04:00Z',
  });
  assert.equal(result.status, 'APPLIED');
  if (result.status !== 'APPLIED') return;
  assert.equal(result.record.state, 'KNOWN_WRITE_FAILURE');
  assert.equal(result.record.requiresReconciliation, false);
  assert.equal(result.record.retryAuthorized, false);
});

test('W11-B rejects wrong-account or wrong-binding readback evidence', () => {
  const request = composed();
  const wrongAccount = effectObservedReadback({ accountReference: 'instagram-account:other' });
  assert.deepEqual(
    reconcilePublicationProviderIntegration({
      request,
      write: successfulWrite(),
      readback: wrongAccount,
      evaluatedAt: '2026-09-03T15:04:00Z',
    }),
    { status: 'BLOCKED', code: 'PROVIDER_CONTEXT_MISMATCH', authorizesExecution: false },
  );

  const wrongBinding = effectObservedReadback({ bindingReference: 'provider-binding:other' });
  assert.deepEqual(
    reconcilePublicationProviderIntegration({
      request,
      write: successfulWrite(),
      readback: wrongBinding,
      evaluatedAt: '2026-09-03T15:04:00Z',
    }),
    { status: 'BLOCKED', code: 'PROVIDER_CONTEXT_MISMATCH', authorizesExecution: false },
  );
});

test('W11-B exact reconciliation replay is stable and duplicate dispatch is fenced', () => {
  const request = composed();
  const first = reconcilePublicationProviderIntegration({
    request,
    write: successfulWrite(),
    readback: effectObservedReadback(),
    evaluatedAt: '2026-09-03T15:04:00Z',
  });
  assert.equal(first.status, 'APPLIED');
  if (first.status !== 'APPLIED') return;

  const replay = reconcilePublicationProviderIntegration({
    request,
    write: successfulWrite(),
    readback: effectObservedReadback(),
    previous: first.record,
    evaluatedAt: '2026-09-03T15:04:30Z',
  });
  assert.equal(replay.status, 'REPLAY');

  const publication = dispatchRequested();
  const duplicate = composePublicationProviderIntegration({
    tenantId: TENANT,
    correlationId: CORRELATION,
    publication,
    provider: 'instagram',
    bindingVersion: 3,
    actionIntentId: 'act_w11b_publish_01',
    executionProof: {
      kind: 'W07_PROVIDER_EXECUTION_PROOF',
      actionIntentId: 'act_w11b_publish_01',
      currentAuthorityValidated: true,
      executionEligible: true,
      validatedAt: '2026-09-03T15:01:01Z',
      authorizesExecution: false,
    },
    safeMode: 'SANDBOX',
    evaluatedAt: '2026-09-03T15:05:00Z',
    prior: first.record,
  });
  assert.deepEqual(duplicate, {
    status: 'BLOCKED',
    code: 'DUPLICATE_DISPATCH_FENCED',
    authorizesExecution: false,
  });
});
