import type { CorrelationId, TenantId } from '@aurora/contracts';

import type { CreateRevenueLifecycleInput, RevenueEntityRef } from '../lifecycle/types.js';
import type { SocialInboundRecord } from './inbound-routing.js';

export const W11_LEAD_CONSENT_STATUSES = [
  'GRANTED',
  'NOT_REQUIRED',
  'WITHDRAWN',
  'UNKNOWN',
] as const;
export type W11LeadConsentStatus = (typeof W11_LEAD_CONSENT_STATUSES)[number];

export interface W11LeadHandoffContext {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly accountExternalId: string;
  readonly conversationExternalId: string;
  readonly userExternalId: string;
  readonly purpose: string;
  readonly consentStatus: W11LeadConsentStatus;
  readonly w10LeadEntityId: string;
}

export interface W11LeadSourceReference {
  readonly provider: SocialInboundRecord['provider'];
  readonly accountExternalId: string;
  readonly providerEventId: string;
  readonly conversationExternalId: string;
  readonly userExternalId: string;
  readonly channel: SocialInboundRecord['channel'];
  readonly revision: number;
  readonly occurredAt: string;
  readonly observedAt: string;
}

/**
 * W11-F owns only the W11 -> W10 handoff boundary. The candidate below may be
 * consumed by W10, but W11 never persists or mutates W10 CRM state itself.
 */
export interface W11LeadHandoffPlan {
  readonly kind: 'W11_LEAD_HANDOFF_PLAN';
  readonly schemaVersion: '1.0.0';
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly purpose: string;
  readonly consentStatus: 'GRANTED' | 'NOT_REQUIRED';
  readonly source: W11LeadSourceReference;
  readonly eventIdempotencyKey: string;
  readonly leadDeduplicationKey: string;
  readonly w10Conversation: RevenueEntityRef;
  readonly w10Lead: RevenueEntityRef;
  readonly w10CreateLeadCandidate: CreateRevenueLifecycleInput;
  readonly downstreamW10OwnsCrmState: true;
  readonly requiresW10Deduplication: true;
  readonly contentCopiedIntoHandoff: false;
  readonly canCreateCrmState: false;
  readonly canTriggerTool: false;
  readonly authorizesExecution: false;
}

export const W11_LEAD_HANDOFF_ERRORS = [
  'REQUEST_MALFORMED',
  'INVALID_TIME_BOUNDARY',
  'CONTEXT_MISMATCH',
  'CONSENT_NOT_VALID',
  'INBOUND_NOT_ELIGIBLE',
  'PREVIOUS_HANDOFF_MISMATCH',
  'IDEMPOTENCY_CONFLICT',
  'LEAD_DEDUPLICATION_CONFLICT',
] as const;
export type W11LeadHandoffError = (typeof W11_LEAD_HANDOFF_ERRORS)[number];

export type W11LeadHandoffResult =
  | Readonly<{
      ok: true;
      status: 'PLANNED';
      plan: W11LeadHandoffPlan;
      authorizesExecution: false;
    }>
  | Readonly<{
      ok: true;
      status: 'DUPLICATE';
      plan: W11LeadHandoffPlan;
      authorizesExecution: false;
    }>
  | Readonly<{
      ok: true;
      status: 'NO_HANDOFF_DELETED';
      authorizesExecution: false;
    }>
  | Readonly<{
      ok: false;
      error: W11LeadHandoffError;
      authorizesExecution: false;
    }>;

const MAX_IDENTIFIER_LENGTH = 1_024;
const MAX_PURPOSE_LENGTH = 512;
const MAX_W10_ENTITY_ID_LENGTH = 512;

function nonEmpty(value: string, maxLength: number): boolean {
  return value.trim().length > 0 && value.length <= maxLength;
}

function timestamp(value: string): number | undefined {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function canonicalTuple(values: readonly (string | number)[]): string {
  return JSON.stringify(values);
}

function fnv1a32(value: string, seed = 0x811c9dc5): string {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function fingerprint(value: string): string {
  return `${fnv1a32(value)}${fnv1a32(`w11f|${value}`, 0x9e3779b9)}`;
}

function eventIdempotencyKey(inbound: SocialInboundRecord): string {
  return `w11f:event:v1:${fingerprint(
    canonicalTuple([
      inbound.tenantId,
      inbound.provider,
      inbound.accountExternalId,
      inbound.providerEventId,
      inbound.revision,
    ]),
  )}`;
}

function leadDeduplicationKey(inbound: SocialInboundRecord): string {
  return `w11f:lead:v1:${fingerprint(
    canonicalTuple([
      inbound.tenantId,
      inbound.provider,
      inbound.accountExternalId,
      inbound.userExternalId,
    ]),
  )}`;
}

function provenanceReference(inbound: SocialInboundRecord): string {
  return `w11f:event:${fingerprint(
    canonicalTuple([
      inbound.provider,
      inbound.accountExternalId,
      inbound.providerEventId,
      inbound.revision,
    ]),
  )}`;
}

function contextMatches(inbound: SocialInboundRecord, context: W11LeadHandoffContext): boolean {
  return (
    inbound.tenantId === context.tenantId &&
    inbound.correlationId === context.correlationId &&
    inbound.accountExternalId === context.accountExternalId &&
    inbound.conversationExternalId === context.conversationExternalId &&
    inbound.userExternalId === context.userExternalId
  );
}

function eligibleInbound(inbound: SocialInboundRecord): boolean {
  return (
    inbound.recordKind === 'W11_SOCIAL_INBOUND_RECORD' &&
    inbound.intent === 'SALES' &&
    inbound.risk === 'NORMAL' &&
    inbound.route === 'LEAD_HANDOFF_CANDIDATE' &&
    inbound.lifecycleConversation.kind === 'CONVERSATION' &&
    nonEmpty(inbound.lifecycleConversation.entityId, MAX_W10_ENTITY_ID_LENGTH) &&
    inbound.authorizesExecution === false &&
    inbound.canTriggerTool === false
  );
}

function priorLeadScopeMatches(
  previous: W11LeadHandoffPlan,
  inbound: SocialInboundRecord,
): boolean {
  return (
    previous.tenantId === inbound.tenantId &&
    previous.source.provider === inbound.provider &&
    previous.source.accountExternalId === inbound.accountExternalId &&
    previous.source.userExternalId === inbound.userExternalId &&
    previous.leadDeduplicationKey === leadDeduplicationKey(inbound)
  );
}

function exactReplayMatches(
  previous: W11LeadHandoffPlan,
  inbound: SocialInboundRecord,
  context: W11LeadHandoffContext,
): boolean {
  return (
    previous.tenantId === inbound.tenantId &&
    previous.correlationId === inbound.correlationId &&
    previous.purpose === context.purpose &&
    previous.consentStatus === context.consentStatus &&
    previous.source.provider === inbound.provider &&
    previous.source.accountExternalId === inbound.accountExternalId &&
    previous.source.providerEventId === inbound.providerEventId &&
    previous.source.conversationExternalId === inbound.conversationExternalId &&
    previous.source.userExternalId === inbound.userExternalId &&
    previous.source.channel === inbound.channel &&
    previous.source.revision === inbound.revision &&
    previous.source.occurredAt === inbound.occurredAt &&
    previous.source.observedAt === inbound.observedAt &&
    previous.w10Conversation.kind === 'CONVERSATION' &&
    previous.w10Conversation.entityId === inbound.lifecycleConversation.entityId &&
    previous.w10Lead.kind === 'LEAD' &&
    previous.w10Lead.entityId === context.w10LeadEntityId
  );
}

function buildPlan(
  inbound: SocialInboundRecord,
  context: W11LeadHandoffContext & {
    readonly consentStatus: 'GRANTED' | 'NOT_REQUIRED';
  },
): W11LeadHandoffPlan {
  const w10Lead: RevenueEntityRef = {
    kind: 'LEAD',
    entityId: context.w10LeadEntityId,
  };
  const w10Conversation: RevenueEntityRef = {
    kind: 'CONVERSATION',
    entityId: inbound.lifecycleConversation.entityId,
  };

  return {
    kind: 'W11_LEAD_HANDOFF_PLAN',
    schemaVersion: '1.0.0',
    tenantId: inbound.tenantId,
    correlationId: inbound.correlationId,
    purpose: context.purpose,
    consentStatus: context.consentStatus,
    source: {
      provider: inbound.provider,
      accountExternalId: inbound.accountExternalId,
      providerEventId: inbound.providerEventId,
      conversationExternalId: inbound.conversationExternalId,
      userExternalId: inbound.userExternalId,
      channel: inbound.channel,
      revision: inbound.revision,
      occurredAt: inbound.occurredAt,
      observedAt: inbound.observedAt,
    },
    eventIdempotencyKey: eventIdempotencyKey(inbound),
    leadDeduplicationKey: leadDeduplicationKey(inbound),
    w10Conversation,
    w10Lead,
    w10CreateLeadCandidate: {
      tenantId: inbound.tenantId,
      entity: w10Lead,
      occurredAt: inbound.occurredAt,
      provenance: {
        sourceSystem: 'W11_SOCIAL_LEAD_HANDOFF',
        sourceReference: provenanceReference(inbound),
        observedAt: inbound.observedAt,
      },
    },
    downstreamW10OwnsCrmState: true,
    requiresW10Deduplication: true,
    contentCopiedIntoHandoff: false,
    canCreateCrmState: false,
    canTriggerTool: false,
    authorizesExecution: false,
  };
}

export function planW10LeadHandoff(
  input: Readonly<{
    inbound: SocialInboundRecord;
    context: W11LeadHandoffContext;
    evaluatedAt: string;
    previous?: W11LeadHandoffPlan;
  }>,
): W11LeadHandoffResult {
  const { inbound, context, previous } = input;

  if (
    !nonEmpty(context.accountExternalId, MAX_IDENTIFIER_LENGTH) ||
    !nonEmpty(context.conversationExternalId, MAX_IDENTIFIER_LENGTH) ||
    !nonEmpty(context.userExternalId, MAX_IDENTIFIER_LENGTH) ||
    !nonEmpty(context.purpose, MAX_PURPOSE_LENGTH) ||
    !nonEmpty(context.w10LeadEntityId, MAX_W10_ENTITY_ID_LENGTH) ||
    !W11_LEAD_CONSENT_STATUSES.includes(context.consentStatus)
  ) {
    return { ok: false, error: 'REQUEST_MALFORMED', authorizesExecution: false };
  }

  const observedAt = timestamp(inbound.observedAt);
  const evaluatedAt = timestamp(input.evaluatedAt);
  if (observedAt === undefined || evaluatedAt === undefined || observedAt > evaluatedAt) {
    return { ok: false, error: 'INVALID_TIME_BOUNDARY', authorizesExecution: false };
  }

  if (!contextMatches(inbound, context)) {
    return { ok: false, error: 'CONTEXT_MISMATCH', authorizesExecution: false };
  }

  if (inbound.deleted || inbound.change === 'DELETED' || inbound.route === 'NO_RESPONSE_DELETED') {
    return { ok: true, status: 'NO_HANDOFF_DELETED', authorizesExecution: false };
  }

  if (!eligibleInbound(inbound)) {
    return { ok: false, error: 'INBOUND_NOT_ELIGIBLE', authorizesExecution: false };
  }

  if (context.consentStatus !== 'GRANTED' && context.consentStatus !== 'NOT_REQUIRED') {
    return { ok: false, error: 'CONSENT_NOT_VALID', authorizesExecution: false };
  }

  const currentEventIdempotencyKey = eventIdempotencyKey(inbound);
  const currentLeadDeduplicationKey = leadDeduplicationKey(inbound);

  if (previous !== undefined) {
    if (!priorLeadScopeMatches(previous, inbound)) {
      return { ok: false, error: 'PREVIOUS_HANDOFF_MISMATCH', authorizesExecution: false };
    }

    if (previous.eventIdempotencyKey === currentEventIdempotencyKey) {
      if (!exactReplayMatches(previous, inbound, context)) {
        return { ok: false, error: 'IDEMPOTENCY_CONFLICT', authorizesExecution: false };
      }
      return { ok: true, status: 'DUPLICATE', plan: previous, authorizesExecution: false };
    }

    if (
      previous.leadDeduplicationKey === currentLeadDeduplicationKey &&
      previous.w10Lead.entityId !== context.w10LeadEntityId
    ) {
      return {
        ok: false,
        error: 'LEAD_DEDUPLICATION_CONFLICT',
        authorizesExecution: false,
      };
    }
  }

  const plan = buildPlan(inbound, {
    ...context,
    consentStatus: context.consentStatus,
  });

  return { ok: true, status: 'PLANNED', plan, authorizesExecution: false };
}
