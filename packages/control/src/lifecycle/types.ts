import type { CorrelationId, TenantId } from '../../../contracts/src/ids/types.ts';

export const LIFECYCLE_STATES = [
  'DRAFT',
  'READY',
  'ACTIVE',
  'BLOCKED',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'SUPERSEDED',
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];
export type LifecycleTerminalState = 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'SUPERSEDED';
export type LifecycleEntityKind = 'OBJECTIVE' | 'GOAL' | 'TASK';

export interface LifecycleEntityRef {
  readonly kind: LifecycleEntityKind;
  readonly id: string;
}

export interface LifecycleEvidenceRef {
  readonly evidenceId: string;
  readonly source: string;
  readonly recordedAt: string;
}

export interface CancellationRecord {
  readonly reason: string;
  readonly requestedAt: string;
  readonly correlationId: CorrelationId;
}

export interface SupersessionRecord {
  readonly successor: LifecycleEntityRef;
  readonly reason: string;
  readonly supersededAt: string;
  readonly correlationId: CorrelationId;
}

export interface LifecycleRecord {
  readonly entity: LifecycleEntityRef;
  readonly tenantId: TenantId;
  readonly rootCorrelationId: CorrelationId;
  readonly parent?: LifecycleEntityRef;
  readonly state: LifecycleState;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly cancellation?: CancellationRecord;
  readonly supersession?: SupersessionRecord;
  readonly evidence: readonly LifecycleEvidenceRef[];
}

export interface CreateLifecycleRecordInput {
  readonly entity: LifecycleEntityRef;
  readonly tenantId: TenantId;
  readonly rootCorrelationId: CorrelationId;
  readonly parent?: LifecycleEntityRef;
  readonly createdAt: string;
  readonly evidence?: readonly LifecycleEvidenceRef[];
}

export interface LifecycleTransitionRequest {
  readonly tenantId: TenantId;
  readonly correlationId: CorrelationId;
  readonly expectedRevision: number;
  readonly to: LifecycleState;
  readonly at: string;
  readonly reason: string;
  readonly evidence?: LifecycleEvidenceRef;
  readonly supersededBy?: LifecycleEntityRef;
}

export const LIFECYCLE_REJECTION_CODES = [
  'TENANT_MISMATCH',
  'REVISION_CONFLICT',
  'TERMINAL_STATE',
  'INVALID_TRANSITION',
  'SUPERSESSION_TARGET_REQUIRED',
  'UNEXPECTED_SUPERSESSION_TARGET',
  'SELF_SUPERSESSION',
] as const;

export type LifecycleRejectionCode = (typeof LIFECYCLE_REJECTION_CODES)[number];

export interface LifecycleTransitionEvent {
  readonly type: 'LIFECYCLE_TRANSITION';
  readonly entity: LifecycleEntityRef;
  readonly tenantId: TenantId;
  readonly rootCorrelationId: CorrelationId;
  readonly transitionCorrelationId: CorrelationId;
  readonly from: LifecycleState;
  readonly to: LifecycleState;
  readonly previousRevision: number;
  readonly newRevision: number;
  readonly at: string;
  readonly reason: string;
  readonly evidence?: LifecycleEvidenceRef;
}

export type LifecycleTransitionResult =
  | {
      readonly status: 'APPLIED';
      readonly record: LifecycleRecord;
      readonly event: LifecycleTransitionEvent;
    }
  | {
      readonly status: 'REJECTED';
      readonly code: LifecycleRejectionCode;
      readonly current: LifecycleRecord;
    };
