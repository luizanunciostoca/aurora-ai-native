import type {
  CorrelationContext,
  EventEnvelope,
  EventId,
  IdentityId,
  TenantId,
} from '@aurora/contracts';

import type {
  RevenueEntityKind,
  RevenueEntityRef,
  RevenueLifecycleState,
} from '../lifecycle/types.js';

export const REVENUE_CRM_HISTORY_BASIS = [
  'AUTHORITATIVE_SNAPSHOT',
  'TRANSITION_EVENTS_ONLY',
] as const;
export type RevenueCrmHistoryBasis = (typeof REVENUE_CRM_HISTORY_BASIS)[number];

export interface RevenueCrmProjectionLimits {
  readonly maxEntities: number;
  readonly maxAppliedOperations: number;
}

export interface RevenueCrmProjectionConfig extends RevenueCrmProjectionLimits {
  readonly tenantId: TenantId;
}

export interface RevenueCrmReadModel {
  readonly tenantId: TenantId;
  readonly entity: RevenueEntityRef;
  readonly lifecycleState: RevenueLifecycleState;
  readonly entityVersion: number;
  readonly subjectIdentityId?: IdentityId;
  readonly sourceSystem: string;
  readonly sourceRevision: string;
  readonly sourceReference?: string;
  readonly observedAt: string;
  readonly projectedAt: string;
  readonly lastEventId?: EventId;
  readonly correlation?: CorrelationContext;
  readonly historyBasis: RevenueCrmHistoryBasis;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export interface RevenueCrmAppliedOperation {
  readonly operationId: string;
  readonly fingerprint: string;
  readonly entity: RevenueEntityRef;
  readonly entityVersion: number;
}

export interface RevenueCrmProjection {
  readonly kind: 'REVENUE_CRM_PROJECTION';
  readonly schemaVersion: '1.0.0';
  readonly tenantId: TenantId;
  readonly projectionVersion: number;
  readonly models: readonly RevenueCrmReadModel[];
  readonly appliedOperations: readonly RevenueCrmAppliedOperation[];
  readonly limits: RevenueCrmProjectionLimits;
  readonly lastProjectedAt?: string;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export interface RevenueCrmSnapshotInput {
  readonly expectedProjectionVersion: number;
  readonly operationId: string;
  readonly projectedAt: string;
  readonly sourceRevision: string;
}

export interface RevenueCrmEventProjectionInput {
  readonly expectedProjectionVersion: number;
  readonly projectedAt: string;
}

export interface RevenueCrmRebuildInput {
  readonly tenantId: TenantId;
  readonly events: readonly EventEnvelope[];
  readonly limits: RevenueCrmProjectionLimits;
  readonly projectedAt: string;
}

export const REVENUE_CRM_PROJECTION_ERRORS = [
  'REQUEST_MALFORMED',
  'PROJECTION_MALFORMED',
  'RECORD_MALFORMED',
  'EVENT_MALFORMED',
  'TENANT_MISMATCH',
  'PROJECTION_VERSION_CONFLICT',
  'OPERATION_ID_CONFLICT',
  'ENTITY_VERSION_CONFLICT',
  'ENTITY_VERSION_GAP',
  'OUT_OF_ORDER_EVENT',
  'OUT_OF_ORDER_PROJECTION',
  'STATE_CONTINUITY_CONFLICT',
  'IDENTITY_CONTINUITY_CONFLICT',
  'PROJECTION_CAPACITY_EXCEEDED',
] as const;
export type RevenueCrmProjectionError = (typeof REVENUE_CRM_PROJECTION_ERRORS)[number];

export type RevenueCrmProjectionResult =
  | Readonly<{
      ok: true;
      status: 'APPLIED' | 'DUPLICATE';
      projection: RevenueCrmProjection;
    }>
  | Readonly<{ ok: false; error: RevenueCrmProjectionError }>;

export type RevenueCrmRebuildResult =
  | Readonly<{ ok: true; projection: RevenueCrmProjection }>
  | Readonly<{ ok: false; error: RevenueCrmProjectionError }>;

export interface RevenueCrmQuery {
  readonly tenantId: TenantId;
  readonly entityKind?: RevenueEntityKind;
  readonly entityId?: string;
  readonly lifecycleStates?: readonly RevenueLifecycleState[];
  readonly subjectIdentityId?: IdentityId;
  readonly requiredEntityVersion?: number;
  readonly evaluatedAt: string;
  readonly maxAgeMs: number;
  readonly limit: number;
}

export type RevenueCrmCurrentnessReason =
  'ENTITY_VERSION_BEHIND' | 'MODEL_TOO_OLD' | 'MODEL_TIME_UNKNOWN';

export interface RevenueCrmQueryItem {
  readonly model: RevenueCrmReadModel;
  readonly current: boolean;
  readonly currentnessReasons: readonly RevenueCrmCurrentnessReason[];
}

export interface RevenueCrmQueryPage {
  readonly tenantId: TenantId;
  readonly projectionVersion: number;
  readonly items: readonly RevenueCrmQueryItem[];
  readonly truncated: boolean;
  readonly evaluatedAt: string;
  readonly authorizesExecution: false;
  readonly canGrantPermission: false;
}

export type RevenueCrmQueryResult =
  | Readonly<{ ok: true; page: RevenueCrmQueryPage }>
  | Readonly<{
      ok: false;
      error: 'REQUEST_MALFORMED' | 'PROJECTION_MALFORMED' | 'TENANT_MISMATCH';
    }>;
