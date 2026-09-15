import type {
  CommandId,
  DecisionId,
  EventId,
  InteractionSessionId,
  InteractionTurnId,
  OwnerDecisionId,
  ProviderExternalId,
  TenantId,
} from './types';

declare const commandId: CommandId;
declare const eventId: EventId;
declare const tenantId: TenantId;
declare const interactionSessionId: InteractionSessionId;
declare const interactionTurnId: InteractionTurnId;
declare const decisionId: DecisionId;
declare const ownerDecisionId: OwnerDecisionId;
declare const providerExternalId: ProviderExternalId;

const commandIdentity: CommandId = commandId;
const eventIdentity: EventId = eventId;
const tenantIdentity: TenantId = tenantId;
const interactionSessionIdentity: InteractionSessionId = interactionSessionId;
const interactionTurnIdentity: InteractionTurnId = interactionTurnId;
const decisionCompatibility: DecisionId = ownerDecisionId;
const ownerDecisionCompatibility: OwnerDecisionId = decisionId;

void commandIdentity;
void eventIdentity;
void tenantIdentity;
void interactionSessionIdentity;
void interactionTurnIdentity;
void decisionCompatibility;
void ownerDecisionCompatibility;

// @ts-expect-error CommandId must not be assignable to EventId.
const wrongEvent: EventId = commandId;
void wrongEvent;

// @ts-expect-error EventId must not be assignable to CommandId.
const wrongCommand: CommandId = eventId;
void wrongCommand;

// @ts-expect-error TenantId must not be assignable to CommandId.
const wrongTenantBoundary: CommandId = tenantId;
void wrongTenantBoundary;

// @ts-expect-error InteractionSessionId must not be assignable to InteractionTurnId.
const wrongInteractionBoundary: InteractionTurnId = interactionSessionId;
void wrongInteractionBoundary;

// @ts-expect-error ProviderExternalId must never become an Aurora internal ID.
const providerAsCommand: CommandId = providerExternalId;
void providerAsCommand;

// @ts-expect-error Aurora internal IDs must not become provider-owned external IDs.
const commandAsProvider: ProviderExternalId = commandId;
void commandAsProvider;
