import type {
  ActorRef,
  ContractVersion,
  CorrelationContext,
  EnvelopeSource,
  EventEnvelope,
  EventId,
  IdentityId,
  TenantId,
} from '@aurora/contracts';

export const REVENUE_ENTITY_KINDS = ['LEAD', 'CUSTOMER', 'CONVERSATION'] as const;
export type RevenueEntityKind = (typeof REVENUE_ENTITY_KINDS)[number];

export const LEAD_LIFECYCLE_STATES = [
  'NEW',
  'ENGAGED',
  'QUALIFIED',
  'CONVERTED',
  'CLOSED',
  'MERGED',
] as const;
export type LeadLifecycleState = (typeof LEAD_LIFECYCLE_STATES)[number];

export const CUSTOMER_LIFECYCLE_STATES = ['ACTIVE', 'INACTIVE', 'CLOSED', 'MERGED'] as const;
export type CustomerLifecycleState = (typeof CUSTOMER_LIFECYCLE_STATES)[number];

export const CONVERSATION_LIFECYCLE_STATES = ['OPEN', 'PENDING', 'CLOSED', 'MERGED'] as const;
export type ConversationLifecycleState = (typeof CONVERSATION_LIFECYCLE_STATES)[number];

export type RevenueLifecycleState =
  | LeadLifecycleState
  | CustomerLifecycleState
  | ConversationLifecycleState;

/**
 * W10-local opaque entity reference. `entityId` is deliberately not an Aurora
 * canonical identity, tenant or provider ID.
 */
export interface RevenueEntityRef {
  readonly kind: RevenueEntityKind;
  readonly entityId: string;
}

export interface RevenueLifecycleMergeTarget {
  readonly tenantId: TenantId;
  readonly entity: RevenueEntityRef;
}

export interface RevenueProvenance {
  readonly sourceSystem: string;
  readonly sourceReference?: string;
  readonly observedAt: string;
}

export interface RevenueLifecycleLineage {
  readonly mergedInto?: RevenueLifecycleMergeTarget;
}

export interface RevenueLifecycleTransitionRecord {
  readonly idempotencyKey: string;
  readonly fromState: RevenueLifecycleState;
  readonly toState: RevenueLifecycleState;
  readonly occurredAt: string;
  readonly correlation: CorrelationContext;
  readonly reason?: string;
  readonly mergeTarget?: RevenueLifecycleMergeTarget;
}

export interface RevenueLifecycleRecord {
  readonly tenantId: TenantId;
  readonly entity: RevenueEntityRef;
  readonly subjectIdentityId?: IdentityId;
  readonly state: RevenueLifecycleState;
  readonly version: number;
  readonly provenance: RevenueProvenance;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lineage?: RevenueLifecycleLineage;
  readonly lastTransition?: RevenueLifecycleTransitionRecord;
  /** Domain state is information only and never execution authority. */
  readonly authorizesExecution: false;
}

export interface CreateRevenueLifecycleInput {
  readonly tenantId: TenantId;
  readonly entity: RevenueEntityRef;
  readonly subjectIdentityId?: IdentityId;
  readonly occurredAt: string;
  readonly provenance: RevenueProvenance;
}

export const REVENUE_LIFECYCLE_ERRORS = [
  'REQUEST_MALFORMED',
  'RECORD_MALFORMED',
  'TENANT_MISMATCH',
  'VERSION_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'INVALID_TRANSITION',
  'OUT_OF_ORDER_TRANSITION',
  'MERGE_TARGET_INVALID',
  'TERMINAL_RECORD',
] as const;
export type RevenueLifecycleError = (typeof REVENUE_LIFECYCLE_ERRORS)[number];

export type CreateRevenueLifecycleResult =
  | Readonly<{ ok: true; record: RevenueLifecycleRecord }>
  | Readonly<{ ok: false; error: 'REQUEST_MALFORMED' }>;

export interface ApplyRevenueLifecycleTransitionInput {
  readonly tenantId: TenantId;
  readonly expectedVersion: number;
  readonly targetState: RevenueLifecycleState;
  readonly idempotencyKey: string;
  readonly occurredAt: string;
  readonly correlation: CorrelationContext;
  readonly provenance: RevenueProvenance;
  readonly reason?: string;
  readonly mergeTarget?: RevenueLifecycleMergeTarget;
}

export interface RevenueLifecycleChange {
  readonly tenantId: TenantId;
  readonly entity: RevenueEntityRef;
  readonly subjectIdentityId?: IdentityId;
  readonly version: number;
  readonly fromState: RevenueLifecycleState;
  readonly toState: RevenueLifecycleState;
  readonly idempotencyKey: string;
  readonly occurredAt: string;
  readonly correlation: CorrelationContext;
  readonly provenance: RevenueProvenance;
  readonly reason?: string;
  readonly mergeTarget?: RevenueLifecycleMergeTarget;
  readonly authorizesExecution: false;
}

export type ApplyRevenueLifecycleTransitionResult =
  | Readonly<{
      ok: true;
      status: 'APPLIED';
      record: RevenueLifecycleRecord;
      change: RevenueLifecycleChange;
    }>
  | Readonly<{
      ok: true;
      status: 'DUPLICATE';
      record: RevenueLifecycleRecord;
    }>
  | Readonly<{
      ok: false;
      error: RevenueLifecycleError;
    }>;

export interface RevenueLifecycleEventInput {
  readonly eventId: EventId;
  readonly schemaVersion: ContractVersion;
  readonly producer: ActorRef;
  readonly source: EnvelopeSource;
}

export type RevenueLifecycleEvent = EventEnvelope;
