// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { CorrelationId, TenantId } from '@aurora/contracts';

import type { OrganicPublicationRecord } from '../src/social/publication-scheduling.js';
import {
  planPublicationProviderExecution,
  reconcilePublicationProviderExecution,
  type W11PublicationProviderExecutionPlan,
  type W11PublicationProviderRecord,
} from '../src/social/publication-provider-reconciliation.js';

const TENANT = 'ten_01JW11BTENANT000000000000' as TenantId;
const OTHER_TENANT = 'ten_01JW11BOTHER00000000000' as TenantId;
const CORRELATION = 'cor_01JW11BCORRELATION000000' as CorrelationId;

function publication(overrides: Partial<OrganicPublicationRecord> = {}): OrganicPublicationRecord {
  const request = {
    source: 'W07_EXECUTOR' as const,
    tenantId: TENANT,
    correlationId: CORRELATION,
    publicationId: 'publication-1',
    action: 'social.publish' as const,
    providerBindingReference: 'binding:instagram:1',
    accountReference: 'account:instagram:1',
    idempotencyKey: 'test',
    requiresCurrentAuthority: true as const,
    requiresW08ProviderBinding: true as const,
    authorizesExecution: false as const,
  };

  return {
    kind: 'OrganicPublicationRecord',
    tenantId: TENANT,
    correlationId: CORRELATION,
    publicationId: 'publication-1',
    publicationKind: 'POST',
    accountReference: 'account:instagram:1',
    providerBindingReference: 'binding:instagram:1',
    mediaReferences: ['media:1'],
    caption: 'Aurora W11-B publication',
    state: 'DISPATCH_REQUESTED',
    revision: 2,
    idempotencyKey: 'test',
    lastOperationId: 'dispatch-operation-1',
    lastOperationSignature: 'REQUEST_DISPATCH|test|',
    w07ExecutionRequest: request,
    pausedSafe: false,
    authorizesExecution: false,
    ...overrides,
  };
}

function plan(
  record = publication(),
  previous?: W11PublicationProviderRecord,
): W11PublicationProviderExecutionPlan {
  const result = planPublicationProviderExecution({
    record,
    evaluatedAt: '2026-09-03T16:00:00Z',
    attemptId: 'attempt-1',
    ...(previous !== undefined ? { previous } : {}),
  });
  assert.equal(result.status, 'PLANNED');
  if (result.status !== 'PLANNED') throw new Error('fixture plan was blocked');
  return result.plan;
}

test('W11-B plans provider publication only through W07/W08 without granting authority', () => {
  const result = planPublicationProviderExecution({
    record: publication(),
    evaluatedAt: '2026-09-03T16:00:00Z',
    attemptId: 'attempt-1',
  });
  assert.equal(result.status, 'PLANNED');
  if (result.status !== 'PLANNED') return;

  assert.equal(result.plan.executeVia, 'W07');
  assert.equal(result.plan.requiresW08ProviderWrite, true);
  assert.equal(result.plan.requiresW08ReadbackOnAmbiguity, true);
  assert.equal(result.plan.retryAuthorized, false);
  assert.equal(result.plan.authorizesExecution, false);
});

test('W11-B blocks missing media and mismatched W07 account binding', () => {
  assert.deepEqual(
    planPublicationProviderExecution({
      record: publication({ mediaReferences: [] }),
      evaluatedAt: '2026-09-03T16:00:00Z',
      attemptId: 'attempt-1',
    }),
    { status: 'BLOCKED', code: 'MISSING_MEDIA' },
  );

  const record = publication();
  assert.deepEqual(
    planPublicationProviderExecution({
      record: {
        ...record,
        w07ExecutionRequest: {
          ...record.w07ExecutionRequest!,
          accountReference: 'account:wrong',
        },
      },
      evaluatedAt: '2026-09-03T16:00:00Z',
      attemptId: 'attempt-1',
    }),
    { status: 'BLOCKED', code: 'W07_REQUEST_MISMATCH' },
  );
});

test('W11-B treats exact planning replay as replay and prevents a second write while readback is required', () => {
  const executionPlan = plan();
  const ambiguous = reconcilePublicationProviderExecution({
    plan: executionPlan,
    write: {
      accountReference: executionPlan.accountReference,
      providerBindingReference: executionPlan.providerBindingReference,
      ok: false,
      error: 'TRANSIENT_TRANSPORT_FAILURE',
      mutationPossible: true,
    },
  });
  assert.equal(ambiguous.status, 'RECONCILED');
  if (ambiguous.status !== 'RECONCILED') return;
  assert.equal(ambiguous.record.state, 'READBACK_REQUIRED');
  assert.equal(ambiguous.record.retryAuthorized, false);

  const replay = planPublicationProviderExecution({
    record: publication(),
    evaluatedAt: '2026-09-03T16:01:00Z',
    attemptId: 'attempt-1',
    previous: ambiguous.record,
  });
  assert.equal(replay.status, 'REPLAY');

  assert.deepEqual(
    planPublicationProviderExecution({
      record: publication(),
      evaluatedAt: '2026-09-03T16:01:00Z',
      attemptId: 'attempt-2',
      previous: ambiguous.record,
    }),
    { status: 'BLOCKED', code: 'READBACK_REQUIRED_BEFORE_RETRY' },
  );
});

test('W11-B reconciles late readback to one external provider post reference', () => {
  const executionPlan = plan();
  const result = reconcilePublicationProviderExecution({
    plan: executionPlan,
    write: {
      accountReference: executionPlan.accountReference,
      providerBindingReference: executionPlan.providerBindingReference,
      ok: false,
      error: 'AMBIGUOUS_WRITE',
      mutationPossible: true,
    },
    readback: {
      accountReference: executionPlan.accountReference,
      providerBindingReference: executionPlan.providerBindingReference,
      status: 'OBSERVED',
      observedAt: '2026-09-03T16:05:00Z',
      providerReference: 'ig-post-123',
      providerRevision: 'v2',
    },
  });
  assert.equal(result.status, 'RECONCILED');
  if (result.status !== 'RECONCILED') return;

  assert.equal(result.record.state, 'EFFECT_OBSERVED');
  assert.equal(result.record.providerPostReference, 'ig-post-123');
  assert.equal(result.record.providerRevision, 'v2');
  assert.equal(result.record.retryAuthorized, false);
  assert.equal(result.record.authorizesExecution, false);
});

test('W11-B fails closed on expired provider credential without authorizing retry', () => {
  const executionPlan = plan();
  const result = reconcilePublicationProviderExecution({
    plan: executionPlan,
    write: {
      accountReference: executionPlan.accountReference,
      providerBindingReference: executionPlan.providerBindingReference,
      ok: false,
      error: 'CREDENTIAL_UNAVAILABLE',
      mutationPossible: false,
    },
  });
  assert.equal(result.status, 'RECONCILED');
  if (result.status !== 'RECONCILED') return;

  assert.equal(result.record.state, 'FAILED_CLOSED');
  assert.equal(result.record.failureCode, 'CREDENTIAL_UNAVAILABLE');
  assert.equal(result.record.retryAuthorized, false);
});

test('W11-B blocks wrong-account and wrong-tenant reconciliation boundaries', () => {
  const executionPlan = plan();
  assert.deepEqual(
    reconcilePublicationProviderExecution({
      plan: executionPlan,
      write: {
        accountReference: 'account:wrong',
        providerBindingReference: executionPlan.providerBindingReference,
        ok: true,
        providerReference: 'wrong-post',
        requiresReadback: false,
      },
    }),
    { status: 'BLOCKED', code: 'ACCOUNT_MISMATCH' },
  );

  const previous: W11PublicationProviderRecord = {
    kind: 'W11_PUBLICATION_PROVIDER_RECORD',
    tenantId: TENANT,
    correlationId: CORRELATION,
    publicationId: 'publication-1',
    publicationRevision: 2,
    accountReference: 'account:instagram:1',
    providerBindingReference: 'binding:instagram:1',
    idempotencyKey: 'test',
    attemptId: 'attempt-1',
    state: 'NO_EFFECT_CONFIRMED',
    retryAuthorized: false,
    authorizesExecution: false,
  };
  assert.deepEqual(
    planPublicationProviderExecution({
      record: publication({ tenantId: OTHER_TENANT }),
      evaluatedAt: '2026-09-03T16:10:00Z',
      attemptId: 'attempt-2',
      previous,
    }),
    { status: 'BLOCKED', code: 'W07_REQUEST_MISMATCH' },
  );
});

test('W11-B distinguishes confirmed no-effect from delayed readback without self-authorizing retry', () => {
  const executionPlan = plan();
  const baseWrite = {
    accountReference: executionPlan.accountReference,
    providerBindingReference: executionPlan.providerBindingReference,
    ok: true,
    requiresReadback: true,
  } as const;

  const noEffect = reconcilePublicationProviderExecution({
    plan: executionPlan,
    write: baseWrite,
    readback: {
      accountReference: executionPlan.accountReference,
      providerBindingReference: executionPlan.providerBindingReference,
      status: 'NO_EFFECT_CONFIRMED',
      observedAt: '2026-09-03T16:05:00Z',
    },
  });
  assert.equal(noEffect.status, 'RECONCILED');
  if (noEffect.status === 'RECONCILED') {
    assert.equal(noEffect.record.state, 'NO_EFFECT_CONFIRMED');
    assert.equal(noEffect.record.retryAuthorized, false);
  }

  const delayed = reconcilePublicationProviderExecution({
    plan: executionPlan,
    write: baseWrite,
    readback: {
      accountReference: executionPlan.accountReference,
      providerBindingReference: executionPlan.providerBindingReference,
      status: 'DELAYED',
      observedAt: '2026-09-03T16:05:00Z',
    },
  });
  assert.equal(delayed.status, 'RECONCILED');
  if (delayed.status === 'RECONCILED') {
    assert.equal(delayed.record.state, 'READBACK_REQUIRED');
    assert.equal(delayed.record.retryAuthorized, false);
  }
});
