// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- revenue harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { CorrelationId, TenantId } from '@aurora/contracts';

import { createRevenueLifecycleRecord } from '../src/lifecycle/lifecycle.js';
import type { SocialInboundRecord } from '../src/social/inbound-routing.js';
import {
  planW10LeadHandoff,
  type W11LeadHandoffContext,
  type W11LeadHandoffPlan,
} from '../src/social/lead-handoff.js';

const TENANT = 'ten_01JW11FTENANT000000000000' as TenantId;
const OTHER_TENANT = 'ten_01JW11FOTHER00000000000' as TenantId;
const CORRELATION = 'cor_01JW11FCORRELATION000000' as CorrelationId;

function salesInbound(overrides: Partial<SocialInboundRecord> = {}): SocialInboundRecord {
  return {
    recordKind: 'W11_SOCIAL_INBOUND_RECORD',
    tenantId: TENANT,
    correlationId: CORRELATION,
    provider: 'INSTAGRAM',
    accountExternalId: 'ig-account-1',
    providerEventId: 'ig-event-sales-1',
    conversationExternalId: 'ig-thread-1',
    userExternalId: 'ig-user-1',
    channel: 'DM',
    change: 'CREATED',
    revision: 1,
    occurredAt: '2026-09-03T18:00:00Z',
    observedAt: '2026-09-03T18:00:01Z',
    connectionGeneration: 1,
    deliveryCursor: 'cursor-sales-1',
    content: 'Quero comprar dois ingressos. Qual o valor?',
    deleted: false,
    lifecycleConversation: {
      kind: 'CONVERSATION',
      entityId: 'conversation:w10:1',
    },
    modality: 'PRIVATE_DM',
    intent: 'SALES',
    risk: 'NORMAL',
    route: 'LEAD_HANDOFF_CANDIDATE',
    authorizesExecution: false,
    canTriggerTool: false,
    ...overrides,
  };
}

function context(overrides: Partial<W11LeadHandoffContext> = {}): W11LeadHandoffContext {
  return {
    tenantId: TENANT,
    correlationId: CORRELATION,
    accountExternalId: 'ig-account-1',
    conversationExternalId: 'ig-thread-1',
    userExternalId: 'ig-user-1',
    purpose: 'SALES_LEAD_FOLLOW_UP',
    consentStatus: 'GRANTED',
    w10LeadEntityId: 'lead:w10:social:1',
    ...overrides,
  };
}

function planned(
  inbound: SocialInboundRecord = salesInbound(),
  handoffContext: W11LeadHandoffContext = context(),
  previous?: W11LeadHandoffPlan,
): W11LeadHandoffPlan {
  const result = planW10LeadHandoff({
    inbound,
    context: handoffContext,
    evaluatedAt: '2026-09-03T18:00:02Z',
    ...(previous === undefined ? {} : { previous }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.status, 'PLANNED');
  if (!result.ok || result.status !== 'PLANNED') throw new Error('handoff did not plan');
  return result.plan;
}

test('W11-F plans a provenance-bound W10 lead handoff without creating CRM or execution authority', () => {
  const result = planW10LeadHandoff({
    inbound: salesInbound(),
    context: context(),
    evaluatedAt: '2026-09-03T18:00:02Z',
  });
  assert.equal(result.ok, true);
  if (!result.ok || result.status !== 'PLANNED') return;

  assert.equal(result.plan.tenantId, TENANT);
  assert.equal(result.plan.correlationId, CORRELATION);
  assert.equal(result.plan.purpose, 'SALES_LEAD_FOLLOW_UP');
  assert.equal(result.plan.consentStatus, 'GRANTED');
  assert.deepEqual(result.plan.w10Conversation, {
    kind: 'CONVERSATION',
    entityId: 'conversation:w10:1',
  });
  assert.deepEqual(result.plan.w10Lead, { kind: 'LEAD', entityId: 'lead:w10:social:1' });
  assert.equal(result.plan.source.provider, 'INSTAGRAM');
  assert.equal(result.plan.source.accountExternalId, 'ig-account-1');
  assert.equal(result.plan.source.channel, 'DM');
  assert.equal(result.plan.source.userExternalId, 'ig-user-1');
  assert.equal(result.plan.contentCopiedIntoHandoff, false);
  assert.equal('content' in result.plan, false);
  assert.equal(result.plan.canCreateCrmState, false);
  assert.equal(result.plan.canTriggerTool, false);
  assert.equal(result.plan.authorizesExecution, false);
  assert.equal(result.authorizesExecution, false);

  const w10Compatibility = createRevenueLifecycleRecord(result.plan.w10CreateLeadCandidate);
  assert.equal(w10Compatibility.ok, true);
  if (w10Compatibility.ok) {
    assert.equal(w10Compatibility.record.entity.kind, 'LEAD');
    assert.equal(w10Compatibility.record.state, 'NEW');
    assert.equal(w10Compatibility.record.authorizesExecution, false);
    assert.equal(w10Compatibility.record.provenance.sourceSystem, 'W11_SOCIAL_LEAD_HANDOFF');
  }
});

test('W11-F exact provider-event replay is idempotent and conflicting reuse fails closed', () => {
  const first = planned();
  const duplicate = planW10LeadHandoff({
    inbound: salesInbound(),
    context: context(),
    evaluatedAt: '2026-09-03T18:00:02Z',
    previous: first,
  });
  assert.equal(duplicate.ok, true);
  if (duplicate.ok) {
    assert.equal(duplicate.status, 'DUPLICATE');
    if (duplicate.status === 'DUPLICATE') assert.deepEqual(duplicate.plan, first);
  }

  const conflictingCorrelation = 'cor_01JW11FOTHERTRACE000000' as CorrelationId;
  const conflict = planW10LeadHandoff({
    inbound: salesInbound({ correlationId: conflictingCorrelation }),
    context: context({ correlationId: conflictingCorrelation }),
    evaluatedAt: '2026-09-03T18:00:02Z',
    previous: first,
  });
  assert.deepEqual(conflict, {
    ok: false,
    error: 'IDEMPOTENCY_CONFLICT',
    authorizesExecution: false,
  });
});

test('W11-F reuses one lead deduplication identity across different provider events for the same provider user', () => {
  const first = planned();
  const secondInbound = salesInbound({
    providerEventId: 'ig-event-sales-2',
    conversationExternalId: 'ig-thread-2',
    occurredAt: '2026-09-03T18:05:00Z',
    observedAt: '2026-09-03T18:05:01Z',
    deliveryCursor: 'cursor-sales-2',
    lifecycleConversation: { kind: 'CONVERSATION', entityId: 'conversation:w10:2' },
  });
  const secondContext = context({ conversationExternalId: 'ig-thread-2' });
  const second = planW10LeadHandoff({
    inbound: secondInbound,
    context: secondContext,
    evaluatedAt: '2026-09-03T18:05:02Z',
    previous: first,
  });
  assert.equal(second.ok, true);
  if (!second.ok || second.status !== 'PLANNED') return;

  assert.notEqual(second.plan.eventIdempotencyKey, first.eventIdempotencyKey);
  assert.equal(second.plan.leadDeduplicationKey, first.leadDeduplicationKey);
  assert.deepEqual(second.plan.w10Lead, first.w10Lead);
  assert.notDeepEqual(second.plan.w10Conversation, first.w10Conversation);
  assert.equal(second.plan.requiresW10Deduplication, true);
});

test('W11-F rejects a different W10 lead ID for the same stable provider-user deduplication scope', () => {
  const first = planned();
  const result = planW10LeadHandoff({
    inbound: salesInbound({ providerEventId: 'ig-event-sales-2' }),
    context: context({ w10LeadEntityId: 'lead:w10:conflicting' }),
    evaluatedAt: '2026-09-03T18:00:02Z',
    previous: first,
  });
  assert.deepEqual(result, {
    ok: false,
    error: 'LEAD_DEDUPLICATION_CONFLICT',
    authorizesExecution: false,
  });
});

test('W11-F fails closed on withdrawn or unknown consent and preserves opt-out semantics', () => {
  for (const consentStatus of ['WITHDRAWN', 'UNKNOWN'] as const) {
    const result = planW10LeadHandoff({
      inbound: salesInbound(),
      context: context({ consentStatus }),
      evaluatedAt: '2026-09-03T18:00:02Z',
    });
    assert.deepEqual(result, {
      ok: false,
      error: 'CONSENT_NOT_VALID',
      authorizesExecution: false,
    });
  }

  const notRequired = planW10LeadHandoff({
    inbound: salesInbound(),
    context: context({ consentStatus: 'NOT_REQUIRED' }),
    evaluatedAt: '2026-09-03T18:00:02Z',
  });
  assert.equal(notRequired.ok, true);
  if (notRequired.ok && notRequired.status === 'PLANNED') {
    assert.equal(notRequired.plan.consentStatus, 'NOT_REQUIRED');
  }
});

test('W11-F rejects wrong tenant/account/conversation/user context before handoff creation', () => {
  const cases: readonly W11LeadHandoffContext[] = [
    context({ tenantId: OTHER_TENANT }),
    context({ accountExternalId: 'wrong-account' }),
    context({ conversationExternalId: 'wrong-thread' }),
    context({ userExternalId: 'wrong-user' }),
  ];

  for (const handoffContext of cases) {
    assert.deepEqual(
      planW10LeadHandoff({
        inbound: salesInbound(),
        context: handoffContext,
        evaluatedAt: '2026-09-03T18:00:02Z',
      }),
      { ok: false, error: 'CONTEXT_MISMATCH', authorizesExecution: false },
    );
  }
});

test('W11-F rejects non-sales, sensitive or authority-tampered inbound records', () => {
  const faq = salesInbound({ intent: 'FAQ', route: 'VERIFIED_FAQ_FAST_PATH' });
  const sensitive = salesInbound({ risk: 'SENSITIVE', route: 'SENSITIVE_ESCALATION' });
  const authorityTampered = salesInbound({ authorizesExecution: true as false });

  for (const inbound of [faq, sensitive, authorityTampered]) {
    assert.deepEqual(
      planW10LeadHandoff({
        inbound,
        context: context(),
        evaluatedAt: '2026-09-03T18:00:02Z',
      }),
      { ok: false, error: 'INBOUND_NOT_ELIGIBLE', authorizesExecution: false },
    );
  }
});

test('W11-F produces no handoff for terminally deleted inbound content', () => {
  const result = planW10LeadHandoff({
    inbound: salesInbound({
      change: 'DELETED',
      deleted: true,
      intent: 'GENERAL',
      route: 'NO_RESPONSE_DELETED',
    }),
    context: context(),
    evaluatedAt: '2026-09-03T18:00:02Z',
  });
  assert.deepEqual(result, {
    ok: true,
    status: 'NO_HANDOFF_DELETED',
    authorizesExecution: false,
  });
});

test('W11-F validates explicit purpose, W10 entity identity and evaluation time fail closed', () => {
  assert.deepEqual(
    planW10LeadHandoff({
      inbound: salesInbound(),
      context: context({ purpose: '   ' }),
      evaluatedAt: '2026-09-03T18:00:02Z',
    }),
    { ok: false, error: 'REQUEST_MALFORMED', authorizesExecution: false },
  );

  assert.deepEqual(
    planW10LeadHandoff({
      inbound: salesInbound(),
      context: context({ w10LeadEntityId: '' }),
      evaluatedAt: '2026-09-03T18:00:02Z',
    }),
    { ok: false, error: 'REQUEST_MALFORMED', authorizesExecution: false },
  );

  assert.deepEqual(
    planW10LeadHandoff({
      inbound: salesInbound(),
      context: context(),
      evaluatedAt: '2026-09-03T17:59:59Z',
    }),
    { ok: false, error: 'INVALID_TIME_BOUNDARY', authorizesExecution: false },
  );
});

test('W11-F rejects previous handoff reuse across provider-user scope', () => {
  const first = planned();
  const result = planW10LeadHandoff({
    inbound: salesInbound({ providerEventId: 'ig-event-other-user', userExternalId: 'ig-user-2' }),
    context: context({ userExternalId: 'ig-user-2' }),
    evaluatedAt: '2026-09-03T18:00:02Z',
    previous: first,
  });
  assert.deepEqual(result, {
    ok: false,
    error: 'PREVIOUS_HANDOFF_MISMATCH',
    authorizesExecution: false,
  });
});
