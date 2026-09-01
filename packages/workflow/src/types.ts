import type { TenantId } from '@aurora/contracts';

export interface SqlStatement {
  readonly text: string;
  readonly values: readonly unknown[];
}

export interface TimerScheduleInput {
  readonly tenantId: TenantId;
  readonly timerName: string;
  readonly scheduleKey: string;
  readonly scheduledFor: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface DueTimerClaimInput {
  readonly tenantId: TenantId;
  readonly now: string;
  readonly ownerToken: string;
  readonly leaseExpiresAt: string;
}

export interface TimerOwnerInput {
  readonly tenantId: TenantId;
  /** Database-local W03 timer surrogate, never an Aurora canonical ID. */
  readonly timerId: string;
  readonly ownerToken: string;
  readonly now: string;
}

export interface LeaseAcquireInput {
  readonly tenantId: TenantId;
  readonly leaseKey: string;
  readonly ownerToken: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly now: string;
  readonly expiresAt: string;
}

export interface LeaseHeartbeatInput {
  readonly tenantId: TenantId;
  readonly leaseKey: string;
  readonly ownerToken: string;
  readonly now: string;
  readonly expiresAt: string;
}

export interface LeaseOwnerInput {
  readonly tenantId: TenantId;
  readonly leaseKey: string;
  readonly ownerToken: string;
  readonly now: string;
}

export interface WorkflowFollowUpInput {
  readonly tenantId: TenantId;
  readonly workflowKey: string;
  readonly stepKey: string;
  readonly scheduledFor: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
