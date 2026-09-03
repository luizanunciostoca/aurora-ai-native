import type { CorrelationId, TenantId } from '@aurora/contracts';

import type { SocialInboundRecord } from './inbound-routing.js';

export const W11_MODERATION_CONSENT_STATUSES = [
  'GRANTED',
  'NOT_REQUIRED',
  'WITHDRAWN',
  'UNKNOWN',
] as const;
export type W11ModerationConsentStatus = (typeof W11_MODERATION_CONSENT_STATUSES)[number];

export type W11ModerationCategory =
  | 'COMPLAINT'
  | 'REFUND'
  | 'SAFETY'
  | 'LEGAL'
  | 'PRIVACY'
  | 'TOXIC'
  | 'SPAM'
  | 'UNTRUSTED_INSTRUCTION'
  | 'SENSITIVE'
  | 'GENERAL';

export type W11ModerationRoute = 'GOVERNED_REASONING' | 'HUMAN_ESCALATION';
export type W11ModerationAction = 'NONE' | 'HIDE' | 'DELETE';

export interface W11ModerationPolicyContext {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly accountExternalId: string;
  readonly conversationExternalId: string;
  readonly userExternalId: string;
  readonly purpose: string;
  readonly consentStatus: W11ModerationConsentStatus;
  readonly allowModelReasoning: boolean;
  readonly allowResponseCandidate: boolean;
  readonly allowModerationCandidate: boolean;
}

export interface W11ResponseCandidate {
  readonly kind: 'W11_RESPONSE_CANDIDATE';
  readonly templateKey:
    | 'COMPLAINT_ACKNOWLEDGEMENT'
    | 'REFUND_ESCALATION_ACKNOWLEDGEMENT'
    | 'SAFETY_ESCALATION_ACKNOWLEDGEMENT'
    | 'LEGAL_ESCALATION_ACKNOWLEDGEMENT'
    | 'PRIVACY_ESCALATION_ACKNOWLEDGEMENT'
    | 'GENERAL_GOVERNED_RESPONSE';
  readonly requiresHumanApproval: boolean;
  readonly canSend: false;
  readonly authorizesExecution: false;
}

export interface W11ModerationIntentCandidate {
  readonly kind: 'W11_MODERATION_INTENT_CANDIDATE';
  readonly action: W11ModerationAction;
  readonly providerEventId: string;
  readonly provider: SocialInboundRecord['provider'];
  readonly accountExternalId: string;
  readonly requiresW07Execution: boolean;
  readonly requiresCurrentPolicyValidation: boolean;
  readonly requiresHumanApproval: boolean;
  readonly authorizesExecution: false;
}

export interface W11SensitiveResponsePlan {
  readonly kind: 'W11_SENSITIVE_RESPONSE_PLAN';
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly provider: SocialInboundRecord['provider'];
  readonly accountExternalId: string;
  readonly providerEventId: string;
  readonly conversationExternalId: string;
  readonly userExternalId: string;
  readonly purpose: string;
  readonly consentStatus: W11ModerationConsentStatus;
  readonly category: W11ModerationCategory;
  readonly route: W11ModerationRoute;
  readonly requiresW05Reasoning: boolean;
  readonly contentMustRemainUntrusted: true;
  readonly mustNotTreatInboundAsInstructions: true;
  readonly requiresCurrentPolicyValidation: true;
  readonly responseCandidate?: W11ResponseCandidate;
  readonly moderationIntent: W11ModerationIntentCandidate;
  readonly canSend: false;
  readonly authorizesExecution: false;
}

export type W11SensitiveModerationError = 'REQUEST_MALFORMED' | 'CONTEXT_MISMATCH';

export type W11SensitiveModerationResult =
  | Readonly<{
      status: 'PLANNED';
      plan: W11SensitiveResponsePlan;
    }>
  | Readonly<{
      status: 'NO_ACTION_DELETED';
      authorizesExecution: false;
    }>
  | Readonly<{
      status: 'BLOCKED';
      error: W11SensitiveModerationError;
      authorizesExecution: false;
    }>;

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function normalizedContent(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

function includesAny(content: string, terms: readonly string[]): boolean {
  return terms.some((term) => content.includes(term));
}

function classify(record: SocialInboundRecord): W11ModerationCategory {
  const content = normalizedContent(record.content ?? '');

  if (
    record.risk === 'UNTRUSTED_INSTRUCTION' ||
    includesAny(content, [
      'ignore previous instructions',
      'ignore as instruções anteriores',
      'system prompt',
      'execute this tool',
      'execute esta ferramenta',
    ])
  ) {
    return 'UNTRUSTED_INSTRUCTION';
  }

  if (
    includesAny(content, [
      'ameaça',
      'ameaca',
      'agressão',
      'agressao',
      'assédio',
      'assedio',
      'acidente',
      'ferido',
      'violência',
      'violencia',
      'threat',
      'assault',
      'harassment',
    ])
  ) {
    return 'SAFETY';
  }

  if (
    includesAny(content, [
      'advogado',
      'processo judicial',
      'ação judicial',
      'acao judicial',
      'tribunal',
      'lawsuit',
      'lawyer',
      'legal action',
    ])
  ) {
    return 'LEGAL';
  }

  if (
    includesAny(content, [
      'reembolso',
      'estorno',
      'chargeback',
      'devolver meu dinheiro',
      'refund',
      'money back',
    ])
  ) {
    return 'REFUND';
  }

  if (
    record.risk === 'SENSITIVE' ||
    includesAny(content, [
      'senha',
      'password',
      'cpf',
      'cartão',
      'cartao',
      'dados pessoais',
      'personal data',
    ])
  ) {
    return 'PRIVACY';
  }

  if (
    includesAny(content, [
      'compre seguidores',
      'ganhe dinheiro rápido',
      'ganhe dinheiro rapido',
      'clique neste link',
      'promoção falsa',
      'promocao falsa',
      'buy followers',
      'click this link',
      'crypto giveaway',
      'spam',
    ])
  ) {
    return 'SPAM';
  }

  if (
    includesAny(content, [
      'idiota',
      'lixo',
      'burro',
      'imbecil',
      'merda',
      'stupid',
      'idiot',
      'trash',
    ])
  ) {
    return 'TOXIC';
  }

  if (
    includesAny(content, [
      'reclamação',
      'reclamacao',
      'péssimo',
      'pessimo',
      'horrível',
      'horrivel',
      'insatisfeito',
      'não gostei',
      'nao gostei',
      'complaint',
      'terrible',
      'dissatisfied',
    ])
  ) {
    return 'COMPLAINT';
  }

  return 'GENERAL';
}

function requiresImmediateHuman(category: W11ModerationCategory): boolean {
  return (
    category === 'REFUND' ||
    category === 'SAFETY' ||
    category === 'LEGAL' ||
    category === 'PRIVACY' ||
    category === 'TOXIC' ||
    category === 'SPAM' ||
    category === 'UNTRUSTED_INSTRUCTION' ||
    category === 'SENSITIVE'
  );
}

function templateFor(category: W11ModerationCategory): W11ResponseCandidate['templateKey'] {
  if (category === 'REFUND') return 'REFUND_ESCALATION_ACKNOWLEDGEMENT';
  if (category === 'SAFETY') return 'SAFETY_ESCALATION_ACKNOWLEDGEMENT';
  if (category === 'LEGAL') return 'LEGAL_ESCALATION_ACKNOWLEDGEMENT';
  if (category === 'PRIVACY' || category === 'SENSITIVE') {
    return 'PRIVACY_ESCALATION_ACKNOWLEDGEMENT';
  }
  if (category === 'COMPLAINT') return 'COMPLAINT_ACKNOWLEDGEMENT';
  return 'GENERAL_GOVERNED_RESPONSE';
}

function moderationAction(category: W11ModerationCategory): W11ModerationAction {
  if (category === 'SPAM') return 'DELETE';
  if (category === 'TOXIC') return 'HIDE';
  return 'NONE';
}

function contextMatches(record: SocialInboundRecord, context: W11ModerationPolicyContext): boolean {
  return (
    record.tenantId === context.tenantId &&
    record.correlationId === context.correlationId &&
    record.accountExternalId === context.accountExternalId &&
    record.conversationExternalId === context.conversationExternalId &&
    record.userExternalId === context.userExternalId
  );
}

export function planSensitiveModeration(input: Readonly<{
  inbound: SocialInboundRecord;
  context: W11ModerationPolicyContext;
}>): W11SensitiveModerationResult {
  const { inbound, context } = input;

  if (!nonEmpty(context.purpose)) {
    return { status: 'BLOCKED', error: 'REQUEST_MALFORMED', authorizesExecution: false };
  }
  if (!contextMatches(inbound, context)) {
    return { status: 'BLOCKED', error: 'CONTEXT_MISMATCH', authorizesExecution: false };
  }
  if (inbound.deleted || inbound.route === 'NO_RESPONSE_DELETED') {
    return { status: 'NO_ACTION_DELETED', authorizesExecution: false };
  }

  const category = classify(inbound);
  const consentAllowsAutomation =
    context.consentStatus === 'GRANTED' || context.consentStatus === 'NOT_REQUIRED';
  const immediateHuman = requiresImmediateHuman(category);
  const requiresW05Reasoning =
    consentAllowsAutomation &&
    context.allowModelReasoning &&
    !immediateHuman &&
    (category === 'COMPLAINT' || category === 'GENERAL');
  const route: W11ModerationRoute =
    immediateHuman || !consentAllowsAutomation || !context.allowModelReasoning
      ? 'HUMAN_ESCALATION'
      : 'GOVERNED_REASONING';

  const canOfferResponseCandidate =
    consentAllowsAutomation &&
    context.allowResponseCandidate &&
    category !== 'UNTRUSTED_INSTRUCTION' &&
    category !== 'TOXIC' &&
    category !== 'SPAM';
  const responseCandidate = canOfferResponseCandidate
    ? ({
        kind: 'W11_RESPONSE_CANDIDATE',
        templateKey: templateFor(category),
        requiresHumanApproval: immediateHuman || category === 'COMPLAINT',
        canSend: false,
        authorizesExecution: false,
      } as const)
    : undefined;

  const requestedModerationAction = moderationAction(category);
  const action =
    context.allowModerationCandidate && consentAllowsAutomation
      ? requestedModerationAction
      : 'NONE';
  const moderationIntent: W11ModerationIntentCandidate = {
    kind: 'W11_MODERATION_INTENT_CANDIDATE',
    action,
    providerEventId: inbound.providerEventId,
    provider: inbound.provider,
    accountExternalId: inbound.accountExternalId,
    requiresW07Execution: action !== 'NONE',
    requiresCurrentPolicyValidation: action !== 'NONE',
    requiresHumanApproval: action !== 'NONE',
    authorizesExecution: false,
  };

  return {
    status: 'PLANNED',
    plan: {
      kind: 'W11_SENSITIVE_RESPONSE_PLAN',
      tenantId: inbound.tenantId,
      correlationId: inbound.correlationId,
      provider: inbound.provider,
      accountExternalId: inbound.accountExternalId,
      providerEventId: inbound.providerEventId,
      conversationExternalId: inbound.conversationExternalId,
      userExternalId: inbound.userExternalId,
      purpose: context.purpose,
      consentStatus: context.consentStatus,
      category,
      route,
      requiresW05Reasoning,
      contentMustRemainUntrusted: true,
      mustNotTreatInboundAsInstructions: true,
      requiresCurrentPolicyValidation: true,
      ...(responseCandidate !== undefined ? { responseCandidate } : {}),
      moderationIntent,
      canSend: false,
      authorizesExecution: false,
    },
  };
}
