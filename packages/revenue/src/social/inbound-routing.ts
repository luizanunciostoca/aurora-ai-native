import type { CorrelationId, TenantId } from '@aurora/contracts';

import type { RevenueEntityRef } from '../lifecycle/types.js';

export const SOCIAL_INBOUND_CHANNELS = ['COMMENT', 'DM'] as const;
export type SocialInboundChannel = (typeof SOCIAL_INBOUND_CHANNELS)[number];

export const SOCIAL_INBOUND_PROVIDERS = ['INSTAGRAM', 'FACEBOOK'] as const;
export type SocialInboundProvider = (typeof SOCIAL_INBOUND_PROVIDERS)[number];

export const SOCIAL_INBOUND_CHANGES = ['CREATED', 'EDITED', 'DELETED'] as const;
export type SocialInboundChange = (typeof SOCIAL_INBOUND_CHANGES)[number];

export type SocialInboundIntent = 'FAQ' | 'SALES' | 'SUPPORT' | 'GENERAL';
export type SocialInboundRisk = 'NORMAL' | 'SENSITIVE' | 'UNTRUSTED_INSTRUCTION';
export type SocialInboundModality = 'PUBLIC_COMMENT' | 'PRIVATE_DM';

export type SocialInboundRoute =
  | 'VERIFIED_FAQ_FAST_PATH'
  | 'LEAD_HANDOFF_CANDIDATE'
  | 'SENSITIVE_ESCALATION'
  | 'GOVERNED_REASONING'
  | 'NO_RESPONSE_DELETED';

export interface SocialStreamCheckpoint {
  readonly tenantId: TenantId;
  readonly provider: SocialInboundProvider;
  readonly accountExternalId: string;
  readonly connectionGeneration: number;
  readonly cursor: string;
}

export interface SocialInboundRecord {
  readonly recordKind: 'W11_SOCIAL_INBOUND_RECORD';
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly provider: SocialInboundProvider;
  readonly accountExternalId: string;
  readonly providerEventId: string;
  readonly conversationExternalId: string;
  readonly userExternalId: string;
  readonly channel: SocialInboundChannel;
  readonly change: SocialInboundChange;
  readonly revision: number;
  readonly occurredAt: string;
  readonly observedAt: string;
  readonly connectionGeneration: number;
  readonly deliveryCursor: string;
  readonly content?: string;
  readonly deleted: boolean;
  readonly lifecycleConversation: RevenueEntityRef;
  readonly modality: SocialInboundModality;
  readonly intent: SocialInboundIntent;
  readonly risk: SocialInboundRisk;
  readonly route: SocialInboundRoute;
  readonly authorizesExecution: false;
  readonly canTriggerTool: false;
}

export interface SocialInboundInput {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly provider: SocialInboundProvider;
  readonly accountExternalId: string;
  readonly providerEventId: string;
  readonly conversationExternalId: string;
  readonly userExternalId: string;
  readonly channel: SocialInboundChannel;
  readonly change: SocialInboundChange;
  readonly revision: number;
  readonly occurredAt: string;
  readonly observedAt: string;
  readonly evaluatedAt: string;
  readonly connectionGeneration: number;
  readonly deliveryCursor: string;
  readonly resumedFromCursor?: string;
  readonly content?: string;
  readonly w10ConversationEntityId: string;
  readonly previous?: SocialInboundRecord;
  readonly checkpoint?: SocialStreamCheckpoint;
}

export const SOCIAL_INBOUND_ERRORS = [
  'REQUEST_MALFORMED',
  'INVALID_TIME_BOUNDARY',
  'SCOPE_MISMATCH',
  'STALE_CONNECTION_GENERATION',
  'CONNECTION_GENERATION_GAP',
  'RECONNECT_CURSOR_MISMATCH',
  'OUT_OF_ORDER_REVISION',
  'REVISION_GAP',
  'REVISION_CONFLICT',
  'TERMINAL_DELETE',
] as const;
export type SocialInboundError = (typeof SOCIAL_INBOUND_ERRORS)[number];

export type SocialInboundResult =
  | Readonly<{
      ok: true;
      status: 'APPLIED';
      record: SocialInboundRecord;
      checkpoint: SocialStreamCheckpoint;
      authorizesExecution: false;
    }>
  | Readonly<{
      ok: true;
      status: 'DUPLICATE';
      record: SocialInboundRecord;
      checkpoint: SocialStreamCheckpoint;
      authorizesExecution: false;
    }>
  | Readonly<{
      ok: false;
      error: SocialInboundError;
      authorizesExecution: false;
    }>;

const MAX_IDENTIFIER_LENGTH = 1_024;
const MAX_CONTENT_LENGTH = 20_000;

function nonEmpty(value: string, maxLength = MAX_IDENTIFIER_LENGTH): boolean {
  return value.trim().length > 0 && value.length <= maxLength;
}

function timestamp(value: string): number | undefined {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizedContent(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

function sameScope(previous: SocialInboundRecord, input: SocialInboundInput): boolean {
  return (
    previous.tenantId === input.tenantId &&
    previous.provider === input.provider &&
    previous.accountExternalId === input.accountExternalId &&
    previous.providerEventId === input.providerEventId &&
    previous.conversationExternalId === input.conversationExternalId &&
    previous.userExternalId === input.userExternalId &&
    previous.channel === input.channel &&
    previous.lifecycleConversation.kind === 'CONVERSATION' &&
    previous.lifecycleConversation.entityId === input.w10ConversationEntityId
  );
}

function sameCheckpointScope(
  checkpoint: SocialStreamCheckpoint,
  input: SocialInboundInput,
): boolean {
  return (
    checkpoint.tenantId === input.tenantId &&
    checkpoint.provider === input.provider &&
    checkpoint.accountExternalId === input.accountExternalId
  );
}

function sameRevision(previous: SocialInboundRecord, input: SocialInboundInput): boolean {
  return (
    previous.change === input.change &&
    previous.occurredAt === input.occurredAt &&
    previous.observedAt === input.observedAt &&
    previous.connectionGeneration === input.connectionGeneration &&
    previous.deliveryCursor === input.deliveryCursor &&
    (previous.content ?? '') === (input.content ?? '')
  );
}

function includesAny(content: string, terms: readonly string[]): boolean {
  return terms.some((term) => content.includes(term));
}

function classify(content: string): Readonly<{
  intent: SocialInboundIntent;
  risk: SocialInboundRisk;
  route: SocialInboundRoute;
}> {
  const untrustedInstruction = includesAny(content, [
    'ignore as instruções anteriores',
    'ignore previous instructions',
    'system prompt',
    'execute esta ferramenta',
    'execute this tool',
  ]);
  if (untrustedInstruction) {
    return {
      intent: 'GENERAL',
      risk: 'UNTRUSTED_INSTRUCTION',
      route: 'GOVERNED_REASONING',
    };
  }

  const sensitive = includesAny(content, [
    'senha',
    'password',
    'cpf',
    'cartão',
    'cartao',
    'chargeback',
    'advogado',
    'processo judicial',
  ]);
  if (sensitive) {
    return { intent: 'SUPPORT', risk: 'SENSITIVE', route: 'SENSITIVE_ESCALATION' };
  }

  const sales = includesAny(content, [
    'ingresso',
    'ticket',
    'reserva',
    'reservar',
    'comprar',
    'preço',
    'preco',
    'valor',
  ]);
  if (sales) {
    return { intent: 'SALES', risk: 'NORMAL', route: 'LEAD_HANDOFF_CANDIDATE' };
  }

  const faq = includesAny(content, [
    'horário',
    'horario',
    'que horas',
    'onde fica',
    'localização',
    'localizacao',
    'endereço',
    'endereco',
    'hours',
    'location',
  ]);
  if (faq) {
    return { intent: 'FAQ', risk: 'NORMAL', route: 'VERIFIED_FAQ_FAST_PATH' };
  }

  const support = includesAny(content, ['problema', 'erro', 'ajuda', 'suporte', 'help', 'support']);
  if (support) {
    return { intent: 'SUPPORT', risk: 'NORMAL', route: 'GOVERNED_REASONING' };
  }

  return { intent: 'GENERAL', risk: 'NORMAL', route: 'GOVERNED_REASONING' };
}

function checkpointFor(input: SocialInboundInput): SocialStreamCheckpoint {
  return {
    tenantId: input.tenantId,
    provider: input.provider,
    accountExternalId: input.accountExternalId,
    connectionGeneration: input.connectionGeneration,
    cursor: input.deliveryCursor,
  };
}

export function ingestAndRouteSocialInbound(input: SocialInboundInput): SocialInboundResult {
  if (
    !SOCIAL_INBOUND_PROVIDERS.includes(input.provider) ||
    !SOCIAL_INBOUND_CHANNELS.includes(input.channel) ||
    !SOCIAL_INBOUND_CHANGES.includes(input.change) ||
    !nonEmpty(input.accountExternalId) ||
    !nonEmpty(input.providerEventId) ||
    !nonEmpty(input.conversationExternalId) ||
    !nonEmpty(input.userExternalId) ||
    !nonEmpty(input.deliveryCursor) ||
    !nonEmpty(input.w10ConversationEntityId) ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 1 ||
    !Number.isSafeInteger(input.connectionGeneration) ||
    input.connectionGeneration < 1 ||
    (input.change !== 'DELETED' &&
      (input.content === undefined ||
        input.content.trim().length === 0 ||
        input.content.length > MAX_CONTENT_LENGTH))
  ) {
    return { ok: false, error: 'REQUEST_MALFORMED', authorizesExecution: false };
  }

  const occurredAt = timestamp(input.occurredAt);
  const observedAt = timestamp(input.observedAt);
  const evaluatedAt = timestamp(input.evaluatedAt);
  if (
    occurredAt === undefined ||
    observedAt === undefined ||
    evaluatedAt === undefined ||
    occurredAt > observedAt ||
    observedAt > evaluatedAt
  ) {
    return { ok: false, error: 'INVALID_TIME_BOUNDARY', authorizesExecution: false };
  }

  if (input.checkpoint !== undefined) {
    if (!sameCheckpointScope(input.checkpoint, input)) {
      return { ok: false, error: 'SCOPE_MISMATCH', authorizesExecution: false };
    }
    if (input.connectionGeneration < input.checkpoint.connectionGeneration) {
      return { ok: false, error: 'STALE_CONNECTION_GENERATION', authorizesExecution: false };
    }
    if (input.connectionGeneration > input.checkpoint.connectionGeneration + 1) {
      return { ok: false, error: 'CONNECTION_GENERATION_GAP', authorizesExecution: false };
    }
    if (input.connectionGeneration > input.checkpoint.connectionGeneration) {
      if (input.resumedFromCursor !== input.checkpoint.cursor) {
        return { ok: false, error: 'RECONNECT_CURSOR_MISMATCH', authorizesExecution: false };
      }
    } else if (input.resumedFromCursor !== undefined) {
      return { ok: false, error: 'RECONNECT_CURSOR_MISMATCH', authorizesExecution: false };
    }
  } else {
    if (input.connectionGeneration !== 1) {
      return { ok: false, error: 'CONNECTION_GENERATION_GAP', authorizesExecution: false };
    }
    if (input.resumedFromCursor !== undefined) {
      return { ok: false, error: 'RECONNECT_CURSOR_MISMATCH', authorizesExecution: false };
    }
  }

  if (input.previous !== undefined) {
    if (!sameScope(input.previous, input)) {
      return { ok: false, error: 'SCOPE_MISMATCH', authorizesExecution: false };
    }
    if (input.previous.deleted && input.change !== 'DELETED') {
      return { ok: false, error: 'TERMINAL_DELETE', authorizesExecution: false };
    }
    if (input.revision < input.previous.revision) {
      return { ok: false, error: 'OUT_OF_ORDER_REVISION', authorizesExecution: false };
    }
    if (input.revision === input.previous.revision) {
      if (!sameRevision(input.previous, input)) {
        return { ok: false, error: 'REVISION_CONFLICT', authorizesExecution: false };
      }
      return {
        ok: true,
        status: 'DUPLICATE',
        record: input.previous,
        checkpoint: checkpointFor(input),
        authorizesExecution: false,
      };
    }
    if (input.revision > input.previous.revision + 1) {
      return { ok: false, error: 'REVISION_GAP', authorizesExecution: false };
    }
  } else {
    if (input.revision !== 1) {
      return { ok: false, error: 'REVISION_GAP', authorizesExecution: false };
    }
    if (input.change !== 'CREATED') {
      return { ok: false, error: 'REQUEST_MALFORMED', authorizesExecution: false };
    }
  }

  const deleted = input.change === 'DELETED';
  const classification = deleted
    ? ({ intent: 'GENERAL', risk: 'NORMAL', route: 'NO_RESPONSE_DELETED' } as const)
    : classify(normalizedContent(input.content ?? ''));

  const record: SocialInboundRecord = {
    recordKind: 'W11_SOCIAL_INBOUND_RECORD',
    tenantId: input.tenantId,
    correlationId: input.correlationId,
    provider: input.provider,
    accountExternalId: input.accountExternalId,
    providerEventId: input.providerEventId,
    conversationExternalId: input.conversationExternalId,
    userExternalId: input.userExternalId,
    channel: input.channel,
    change: input.change,
    revision: input.revision,
    occurredAt: input.occurredAt,
    observedAt: input.observedAt,
    connectionGeneration: input.connectionGeneration,
    deliveryCursor: input.deliveryCursor,
    ...(deleted ? {} : { content: input.content }),
    deleted,
    lifecycleConversation: {
      kind: 'CONVERSATION',
      entityId: input.w10ConversationEntityId,
    },
    modality: input.channel === 'COMMENT' ? 'PUBLIC_COMMENT' : 'PRIVATE_DM',
    intent: classification.intent,
    risk: classification.risk,
    route: classification.route,
    authorizesExecution: false,
    canTriggerTool: false,
  };

  return {
    ok: true,
    status: 'APPLIED',
    record,
    checkpoint: checkpointFor(input),
    authorizesExecution: false,
  };
}
