import type { EventEnvelope, EventId, TenantId } from '@aurora/contracts';

export type ReplayOrderingScope = 'TENANT' | 'SUBJECT' | 'CORRELATION';

export interface ReplayCursor {
  readonly occurredAt: string;
  readonly eventId: EventId;
}

export interface ReplayCheckpoint {
  readonly tenantId: TenantId;
  readonly streamKey: string;
  readonly cursor?: ReplayCursor;
  readonly recentEventIds: readonly EventId[];
  readonly revision: number;
}

export interface ReplayPolicy {
  readonly orderingScope: ReplayOrderingScope;
  readonly maxRecentEventIds: number;
  readonly outOfOrder: 'QUARANTINE' | 'ALLOW';
}

export type ReplayDecisionReason =
  | 'FIRST_EVENT'
  | 'AFTER_CHECKPOINT'
  | 'DUPLICATE_EVENT_ID'
  | 'OUT_OF_ORDER'
  | 'TENANT_MISMATCH'
  | 'STREAM_MISMATCH';

export interface ReplayDecision {
  readonly action: 'PROCESS' | 'DUPLICATE' | 'QUARANTINE';
  readonly reason: ReplayDecisionReason;
  readonly streamKey: string;
  readonly cursor: ReplayCursor;
}

export interface ReplayBatchInput {
  readonly tenantId: TenantId;
  readonly envelopes: readonly EventEnvelope[];
  readonly after?: ReplayCursor;
  readonly limit: number;
}

export type DeadLetterReason =
  | 'OUT_OF_ORDER'
  | 'DELIVERY_EXHAUSTED'
  | 'INVALID_ENVELOPE'
  | 'CONSUMER_REJECTED'
  | 'EXECUTION_UNCERTAIN';

export interface DeadLetterRecord {
  readonly tenantId: TenantId;
  readonly eventId: EventId;
  readonly envelope: EventEnvelope;
  readonly reason: DeadLetterReason;
  readonly quarantinedAt: string;
  readonly detail?: string;
  /** Replay never carries executable authority forward by implication. */
  readonly requiresCurrentAuthorityValidation: true;
}

export type DeadLetterRecoveryDecision =
  | { readonly action: 'DISCARD'; readonly reason: string }
  | {
      readonly action: 'REQUEUE';
      readonly authorityRevalidated: boolean;
      readonly reason: string;
    };

export interface DeadLetterRecoveryPlan {
  readonly action: 'DISCARD' | 'REQUEUE';
  readonly eventId: EventId;
  readonly tenantId: TenantId;
  readonly reason: string;
  readonly envelope?: EventEnvelope;
  readonly requiresCurrentAuthorityValidation: true;
}
