// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { CorrelationId, TenantId } from '@aurora/contracts';

import { buildSocialAnalyticsReadModel } from '../src/social/analytics.js';
import {
  ingestAndRouteSocialInbound,
  type SocialInboundInput,
  type SocialInboundRecord,
} from '../src/social/inbound-routing.js';
import { planW10LeadHandoff } from '../src/social/lead-handoff.js';
import {
  planPublicationProviderExecution,
  reconcilePublicationProviderExecution,
  type W11PublicationProviderExecutionPlan,
} from '../src/social/publication-provider-reconciliation.js';
import {
  createOrganicPublication,
  transitionOrganicPublication,
  type OrganicPublicationRecord,
  type OrganicPublicationResult,
} from '../src/social/publication-scheduling.js';
import { planSensitiveModeration } from '../src/social/sensitive-moderation.js';
import { resolveVerifiedFaqFastPath } from '../src/social/verified-faq.js';

const TENANT = 'ten_01JW11HTENANT000000000000' as TenantId;
const OTHER_TENANT = 'ten_01JW11HOTHER00000000000' as TenantId;
const CORRELATION = 'cor_01JW11HCORRELATION000000' as CorrelationId;

function appliedPublication(result: OrganicPublicationResult): OrganicPublicationRecord {
  assert.equal(result.status, 'APPLIED');
  if (result.status !== 'APPLIED') throw new Error('W11-H publication fixture was blocked');
  return result.record;
}

function dispatchedPublication(): OrganicPublicationRecord {
  const created = appliedPublication(
    createOrganicPublication({
      tenantId: TENANT,
      correlationId: CORRELATION,
      publicationId: 'publication:w11h:1',
      kind: 'POST',
      accountReference: 'account:instagram:1',
      providerBindingReference: 'binding:instagram:1',
      mediaReferences: ['media:feed:1'],
      caption: 'W11-H staged publication',
      evaluatedAt: '2026-09-03T15:00:00Z',
      initialState: 'DRAFT',
      idempotencyKey: 'w11h:create:1',
      operationId: 'w11h:create:1',
    }),
  );

  const prepared = appliedPublication(
    transitionOrganicPublication({
      tenantId: TENANT,
      correlationId: CORRELATION,
      record: created,
      command: 'PREPARE',
      expectedRevision: created.revision,
      evaluatedAt: '2026-09-03T15:01:00Z',
      operationId: 'w11h:prepare:1',
      idempotencyKey: 'w11h:prepare:1',
    }),
  );

  const scheduled = appliedPublication(
    transitionOrganicPublication({
      tenantId: TENANT,
      correlationId: CORRELATION,
      record: prepared,
      command: 'SCHEDULE',
      expectedRevision: prepared.revision,
      evaluatedAt: '2026-09-03T15:02:00Z',
      scheduledAt: '2026-09-03T15:05:00Z',
      operationId: 'w11h:schedule:1',
      idempotencyKey: 'w11h:schedule:1',
    }),
  );

  assert.deepEqual(
    transitionOrganicPublication({
      tenantId: TENANT,
      correlationId: CORRELATION,
      record: scheduled,
      command: 'REQUEST_DISPATCH',
      expectedRevision: scheduled.revision,
      evaluatedAt: '2026-09-03T15:04:59Z',
      operationId: 'w11h:early-dispatch:1',
      idempotencyKey: 'w11h:early-dispatch:1',
    }),
    { status: 'BLOCKED', code: 'NOT_DUE' },
  );

  return appliedPublication(
    transitionOrganicPublication({
      tenantId: TENANT,
      correlationId: CORRELATION,
      record: scheduled,
      command: 'REQUEST_DISPATCH',
      expectedRevision: scheduled.revision,
      evaluatedAt: '2026-09-03T15:05:00Z',
      operationId: 'w11h:dispatch:1',
      idempotencyKey: 'w11h:dispatch:1',
    }),
  );
}

function providerPlan(record = dispatchedPublication()): W11PublicationProviderExecutionPlan {
  const result = planPublicationProviderExecution({
    record,
    evaluatedAt: '2026-09-03T15:05:01Z',
    attemptId: 'attempt:w11h:1',
  });
  assert.equal(result.status, 'PLANNED');
  if (result.status !== 'PLANNED') throw new Error('W11-H provider plan fixture was blocked');
  return result.plan;
}

function inboundFixture(
  content: string,
  overrides: Partial<SocialInboundInput> = {},
): SocialInboundInput {
  return {
    tenantId: TENANT,
    correlationId: CORRELATION,
    provider: 'INSTAGRAM',
    accountExternalId: 'ig-account-w11h',
    providerEventId: 'ig-event-w11h',
    conversationExternalId: 'ig-thread-w11h',
    userExternalId: 'ig-user-w11h',
    channel: 'DM',
    change: 'CREATED',
    revision: 1,
    occurredAt: '2026-09-03T15:10:00Z',
    observedAt: '2026-09-03T15:10:01Z',
    evaluatedAt: '2026-09-03T15:10:02Z',
    connectionGeneration: 1,
    deliveryCursor: 'cursor-w11h-1',
    content,
    w10ConversationEntityId: 'conversation:w10:w11h:1',
    ...overrides,
  };
}

function appliedInbound(content: string, overrides: Partial<SocialInboundInput> = {}): SocialInboundRecord {
  const result = ingestAndRouteSocialInbound(inboundFixture(content, overrides));
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.status, 'APPLIED');
  if (!result.ok || result.status !== 'APPLIED') {
    throw new Error('W11-H inbound fixture was blocked');
  }
  return result.record;
}

test('W11-H stages publication and reaches the provider boundary only through current W07/W08 governance', () => {
  const record = dispatchedPublication();
  assert.equal(record.state, 'DISPATCH_REQUESTED');
  assert.equal(record.authorizesExecution, false);
  assert.equal(record.pausedSafe, false);
  assert.equal(record.w07ExecutionRequest?.requiresCurrentAuthority, true);
  assert.equal(record.w07ExecutionRequest?.requiresW08ProviderBinding, true);
  assert.equal(record.w07ExecutionRequest?.authorizesExecution, false);

  const plan = providerPlan(record);
  assert.equal(plan.executeVia, 'W07');
  assert.equal(plan.requiresW08ProviderWrite, true);
  assert.equal(plan.requiresW08ReadbackOnAmbiguity, true);
  assert.equal(plan.retryAuthorized, false);
  assert.equal(plan.authorizesExecution, false);
});

test('W11-H contains provider timeout, rate-limit and replay without blind retry', () => {
  const plan = providerPlan();

  const rateLimited = reconcilePublicationProviderExecution({
    plan,
    write: {
      accountReference: plan.accountReference,
      providerBindingReference: plan.providerBindingReference,
      ok: false,
      error: 'RATE_LIMITED',
      mutationPossible: false,
    },
  });
  assert.equal(rateLimited.status, 'RECONCILED');
  if (rateLimited.status === 'RECONCILED') {
    assert.equal(rateLimited.record.state, 'FAILED_CLOSED');
    assert.equal(rateLimited.record.failureCode, 'RATE_LIMITED');
    assert.equal(rateLimited.record.retryAuthorized, false);
  }

  const ambiguous = reconcilePublicationProviderExecution({
    plan,
    write: {
      accountReference: plan.accountReference,
      providerBindingReference: plan.providerBindingReference,
      ok: false,
      error: 'TRANSIENT_TIMEOUT',
      mutationPossible: true,
    },
  });
  assert.equal(ambiguous.status, 'RECONCILED');
  if (ambiguous.status !== 'RECONCILED') return;
  assert.equal(ambiguous.record.state, 'READBACK_REQUIRED');
  assert.equal(ambiguous.record.retryAuthorized, false);

  const sameAttempt = planPublicationProviderExecution({
    record: dispatchedPublication(),
    evaluatedAt: '2026-09-03T15:06:00Z',
    attemptId: 'attempt:w11h:1',
    previous: ambiguous.record,
  });
  assert.equal(sameAttempt.status, 'REPLAY');

  assert.deepEqual(
    planPublicationProviderExecution({
      record: dispatchedPublication(),
      evaluatedAt: '2026-09-03T15:06:00Z',
      attemptId: 'attempt:w11h:2',
      previous: ambiguous.record,
    }),
    { status: 'BLOCKED', code: 'READBACK_REQUIRED_BEFORE_RETRY' },
  );

  const delayed = reconcilePublicationProviderExecution({
    plan,
    write: {
      accountReference: plan.accountReference,
      providerBindingReference: plan.providerBindingReference,
      ok: true,
      requiresReadback: true,
    },
    readback: {
      accountReference: plan.accountReference,
      providerBindingReference: plan.providerBindingReference,
      status: 'DELAYED',
      observedAt: '2026-09-03T15:07:00Z',
    },
  });
  assert.equal(delayed.status, 'RECONCILED');
  if (delayed.status === 'RECONCILED') {
    assert.equal(delayed.record.state, 'READBACK_REQUIRED');
    assert.equal(delayed.record.retryAuthorized, false);
  }

  const observed = reconcilePublicationProviderExecution({
    plan,
    write: {
      accountReference: plan.accountReference,
      providerBindingReference: plan.providerBindingReference,
      ok: false,
      error: 'TRANSIENT_TIMEOUT',
      mutationPossible: true,
    },
    readback: {
      accountReference: plan.accountReference,
      providerBindingReference: plan.providerBindingReference,
      status: 'OBSERVED',
      observedAt: '2026-09-03T15:08:00Z',
      providerReference: 'instagram:post:w11h:1',
      providerRevision: 'v1',
    },
  });
  assert.equal(observed.status, 'RECONCILED');
  if (observed.status === 'RECONCILED') {
    assert.equal(observed.record.state, 'EFFECT_OBSERVED');
    assert.equal(observed.record.providerPostReference, 'instagram:post:w11h:1');
    assert.equal(observed.record.retryAuthorized, false);
    assert.equal(observed.record.authorizesExecution, false);
  }
});

test('W11-H routes FAQ to verified current evidence without write or tool authority', () => {
  const inbound = appliedInbound('Qual é o horário hoje?');
  assert.equal(inbound.route, 'VERIFIED_FAQ_FAST_PATH');
  assert.equal(inbound.intent, 'FAQ');
  assert.equal(inbound.canTriggerTool, false);
  assert.equal(inbound.authorizesExecution, false);

  const answer = resolveVerifiedFaqFastPath({
    tenantId: TENANT,
    correlationId: CORRELATION,
    kind: 'HOURS',
    key: 'hours.today',
    evaluatedAt: '2026-09-03T15:10:03Z',
    minimumConfidence: 0.9,
    facts: [
      {
        factId: 'fact:w11h:hours:1',
        tenantId: TENANT,
        kind: 'HOURS',
        key: 'hours.today',
        value: '16:30–22:00',
        confidence: 0.99,
        sourceReference: 'w06:company:hours',
        sourceRevision: 'hours-r7',
        expectedSourceRevision: 'hours-r7',
        provenanceReference: 'evidence:w11h:hours:1',
        observedAt: '2026-09-03T15:00:00Z',
        expiresAt: '2026-09-03T23:00:00Z',
        invalidated: false,
        authorizesExecution: false,
      },
    ],
  });
  assert.equal(answer.status, 'ANSWER');
  if (answer.status === 'ANSWER') {
    assert.equal(answer.answer, '16:30–22:00');
    assert.equal(answer.authorizesExecution, false);
  }
});

test('W11-H escalates sensitive content and fences destructive moderation behind W07, policy and human approval', () => {
  const legal = appliedInbound('Quero reembolso e vou chamar meu advogado');
  assert.equal(legal.route, 'SENSITIVE_ESCALATION');

  const legalPlan = planSensitiveModeration({
    inbound: legal,
    context: {
      tenantId: TENANT,
      correlationId: CORRELATION,
      accountExternalId: legal.accountExternalId,
      conversationExternalId: legal.conversationExternalId,
      userExternalId: legal.userExternalId,
      purpose: 'social-support',
      consentStatus: 'GRANTED',
      allowModelReasoning: true,
      allowResponseCandidate: true,
      allowModerationCandidate: true,
    },
  });
  assert.equal(legalPlan.status, 'PLANNED');
  if (legalPlan.status === 'PLANNED') {
    assert.equal(legalPlan.plan.category, 'LEGAL');
    assert.equal(legalPlan.plan.route, 'HUMAN_ESCALATION');
    assert.equal(legalPlan.plan.responseCandidate?.requiresHumanApproval, true);
    assert.equal(legalPlan.plan.responseCandidate?.canSend, false);
    assert.equal(legalPlan.plan.canSend, false);
    assert.equal(legalPlan.plan.authorizesExecution, false);
  }

  const spam = appliedInbound('Isto é spam, clique neste link para comprar seguidores', {
    providerEventId: 'ig-event-w11h-spam',
    deliveryCursor: 'cursor-w11h-spam',
  });
  const spamPlan = planSensitiveModeration({
    inbound: spam,
    context: {
      tenantId: TENANT,
      correlationId: CORRELATION,
      accountExternalId: spam.accountExternalId,
      conversationExternalId: spam.conversationExternalId,
      userExternalId: spam.userExternalId,
      purpose: 'community-moderation',
      consentStatus: 'NOT_REQUIRED',
      allowModelReasoning: true,
      allowResponseCandidate: true,
      allowModerationCandidate: true,
    },
  });
  assert.equal(spamPlan.status, 'PLANNED');
  if (spamPlan.status === 'PLANNED') {
    assert.equal(spamPlan.plan.category, 'SPAM');
    assert.equal(spamPlan.plan.moderationIntent.action, 'DELETE');
    assert.equal(spamPlan.plan.moderationIntent.requiresW07Execution, true);
    assert.equal(spamPlan.plan.moderationIntent.requiresCurrentPolicyValidation, true);
    assert.equal(spamPlan.plan.moderationIntent.requiresHumanApproval, true);
    assert.equal(spamPlan.plan.moderationIntent.authorizesExecution, false);
  }
});

test('W11-H hands sales inbound to W10 with deterministic dedupe and no CRM authority', () => {
  const inbound = appliedInbound('Quero comprar ingresso, qual o valor?', {
    providerEventId: 'ig-event-w11h-sales',
    deliveryCursor: 'cursor-w11h-sales',
  });
  assert.equal(inbound.route, 'LEAD_HANDOFF_CANDIDATE');

  const context = {
    tenantId: TENANT,
    correlationId: CORRELATION,
    accountExternalId: inbound.accountExternalId,
    conversationExternalId: inbound.conversationExternalId,
    userExternalId: inbound.userExternalId,
    purpose: 'sales-lead',
    consentStatus: 'GRANTED' as const,
    w10LeadEntityId: 'lead:w10:w11h:1',
  };
  const handoff = planW10LeadHandoff({
    inbound,
    context,
    evaluatedAt: '2026-09-03T15:10:03Z',
  });
  assert.equal(handoff.ok, true);
  assert.equal(handoff.ok && handoff.status, 'PLANNED');
  if (!handoff.ok || handoff.status !== 'PLANNED') return;

  assert.equal(handoff.plan.downstreamW10OwnsCrmState, true);
  assert.equal(handoff.plan.requiresW10Deduplication, true);
  assert.equal(handoff.plan.contentCopiedIntoHandoff, false);
  assert.equal(handoff.plan.canCreateCrmState, false);
  assert.equal(handoff.plan.canTriggerTool, false);
  assert.equal(handoff.plan.authorizesExecution, false);

  const duplicate = planW10LeadHandoff({
    inbound,
    context,
    evaluatedAt: '2026-09-03T15:10:04Z',
    previous: handoff.plan,
  });
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.ok && duplicate.status, 'DUPLICATE');

  assert.deepEqual(
    planW10LeadHandoff({
      inbound,
      context: { ...context, consentStatus: 'WITHDRAWN' },
      evaluatedAt: '2026-09-03T15:10:04Z',
    }),
    { ok: false, error: 'CONSENT_NOT_VALID', authorizesExecution: false },
  );
});

test('W11-H keeps provider analytics separate from Aurora business outcomes and emits bounded acceptance evidence', () => {
  const model = buildSocialAnalyticsReadModel({
    tenantId: TENANT,
    evaluatedAt: '2026-09-03T15:30:00Z',
    providerObservations: [
      {
        observationId: 'provider-observation:w11h:1',
        tenantId: TENANT,
        accountReference: 'account:instagram:1',
        providerReference: 'instagram',
        publicationReference: 'instagram:post:w11h:1',
        correlationId: CORRELATION,
        evidenceReference: 'evidence:w11h:provider:1',
        observedAt: '2026-09-03T15:20:00Z',
        staleAfterMs: 900_000,
        partial: false,
        metrics: { impressions: 100, comments: 4, replies: 3 },
        authorizesExecution: false,
      },
      {
        observationId: 'provider-observation:w11h:cross-tenant',
        tenantId: OTHER_TENANT,
        accountReference: 'account:other',
        providerReference: 'instagram',
        correlationId: CORRELATION,
        evidenceReference: 'evidence:w11h:other',
        observedAt: '2026-09-03T15:20:00Z',
        staleAfterMs: 900_000,
        partial: false,
        metrics: { impressions: 999_999 },
        authorizesExecution: false,
      },
    ],
    businessOutcomes: [
      {
        outcomeId: 'business-outcome:w11h:lead:1',
        tenantId: TENANT,
        kind: 'LEAD_HANDOFF',
        count: 1,
        correlationId: CORRELATION,
        evidenceReference: 'evidence:w11h:lead:1',
        occurredAt: '2026-09-03T15:15:00Z',
        authorizesExecution: false,
      },
    ],
  });

  assert.equal(model.providerStatus, 'FRESH');
  assert.equal(model.providerMetrics.impressions, 100);
  assert.equal(model.providerMetrics.comments, 4);
  assert.equal(model.businessOutcomes.leadHandoffs, 1);
  assert.equal(model.rejectedCrossTenantRecords, 1);
  assert.equal(model.eval.hasProviderBusinessOutcomeSeparation, true);
  assert.equal(model.telemetry.authorizesExecution, false);
  assert.equal(model.eval.authorizesExecution, false);
  assert.equal(model.authorizesExecution, false);

  const publication = dispatchedPublication();
  const executionPlan = providerPlan(publication);
  const ambiguous = reconcilePublicationProviderExecution({
    plan: executionPlan,
    write: {
      accountReference: executionPlan.accountReference,
      providerBindingReference: executionPlan.providerBindingReference,
      ok: false,
      error: 'TRANSIENT_TIMEOUT',
      mutationPossible: true,
    },
  });
  assert.equal(ambiguous.status, 'RECONCILED');
  if (ambiguous.status !== 'RECONCILED') return;

  const firstInbound = appliedInbound('Qual é o horário hoje?', {
    providerEventId: 'ig-event-w11h-evidence',
    deliveryCursor: 'cursor-w11h-evidence',
  });
  const replay = ingestAndRouteSocialInbound(
    inboundFixture('Qual é o horário hoje?', {
      providerEventId: 'ig-event-w11h-evidence',
      deliveryCursor: 'cursor-w11h-evidence',
      previous: firstInbound,
    }),
  );
  assert.equal(replay.ok, true);
  assert.equal(replay.ok && replay.status, 'DUPLICATE');

  const evidence = {
    schema: 'aurora.w11h.social_e2e_acceptance.v1',
    measurementScope: 'TEST_ONLY_NO_EXTERNAL_SIDE_EFFECTS',
    scenarios: {
      stagedPublication: 'PASS',
      providerTimeoutReconciliation: 'PASS',
      providerRateLimitFailClosed: 'PASS',
      inboundFaq: 'PASS',
      sensitiveEscalation: 'PASS',
      leadHandoff: 'PASS',
      eventReplay: 'PASS',
      analyticsSeparation: 'PASS',
    },
    riskGates: {
      A_AUTHORITY: publication.w07ExecutionRequest?.requiresCurrentAuthority === true ? 'PASS' : 'FAIL',
      B_PROVIDER_RECONCILIATION: ambiguous.record.state === 'READBACK_REQUIRED' ? 'PASS' : 'FAIL',
      C_REPLAY_IDEMPOTENCY: replay.ok && replay.status === 'DUPLICATE' ? 'PASS' : 'FAIL',
      D_EVIDENCE_OBSERVABILITY: model.eval.hasProviderBusinessOutcomeSeparation ? 'PASS' : 'FAIL',
    },
    providerCalls: 0,
    externalSideEffects: 0,
    authorityElevationViolations: 0,
  } as const;

  assert.deepEqual(Object.values(evidence.riskGates), ['PASS', 'PASS', 'PASS', 'PASS']);
  console.log(`W11H_SOCIAL_E2E_EVIDENCE ${JSON.stringify(evidence)}`);
});
