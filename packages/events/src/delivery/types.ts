import type { CorrelationId, EventEnvelope, EventId, TenantId } from '@aurora/contracts';

export type DeliveryStatus = 'pending' | 'claimed' | 'acked' | 'failed' | 'dead_lettered';
export type IdempotencyStatus = 'accepted' | 'rejected' | 'inflight' | 'completed';

export interface SqlStatement {
  readonly text: string;
  readonly values: readonly (string | number | null)[];
}

export interface PersistEventInput {
  readonly envelope: EventEnvelope;
}

export interface OutboxClaimInput {
  readonly tenantId: TenantId;
  readonly eventId: EventId;
  readonly claimToken: string;
  readonly now: string;
  readonly unlockedAt: string;
  readonly maxAttempts: number;
}

export interface OutboxClaimCommitInput {
  readonly tenantId: TenantId;
  readonly eventId: EventId;
  readonly claimToken: string;
  readonly now: string;
}

export interface OutboxFailureInput extends OutboxClaimCommitInput {
  readonly nextAttemptAt: string;
  readonly errorCode: string;
}

export interface InboxRegistrationInput {
  readonly tenantId: TenantId;
  readonly eventId: EventId;
  readonly correlationId: CorrelationId;
  readonly now: string;
}

export interface IdempotencyRequest {
  readonly tenantId: TenantId;
  readonly key: string;
  readonly operationName: string;
  readonly canonicalPayloadHash: string;
  readonly eventId?: EventId;
}

export interface IdempotencyRecord {
  readonly tenantId: TenantId;
  readonly key: string;
  readonly operationName: string;
  readonly canonicalPayloadHash: string;
  readonly eventId?: EventId;
  readonly status: IdempotencyStatus;
}

export type IdempotencyDecision =
  | { readonly kind: 'NEW' }
  | { readonly kind: 'REPLAY'; readonly status: IdempotencyStatus }
  | {
      readonly kind: 'CONFLICT';
      readonly reason: 'OPERATION_MISMATCH' | 'PAYLOAD_MISMATCH' | 'EVENT_MISMATCH';
    };

export interface DeliveryEvidence {
  readonly tenantId: TenantId;
  readonly eventId: EventId;
  readonly correlationId?: CorrelationId;
  readonly transition: string;
  readonly at: string;
  readonly details?: Readonly<Record<string, unknown>>;
}
