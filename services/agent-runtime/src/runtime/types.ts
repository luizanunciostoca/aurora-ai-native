import type { CorrelationContext, TenantContext } from '@aurora/contracts';

export const AGENT_WORK_JUSTIFICATIONS = [
  'ITERATIVE_OBSERVE_PLAN_REQUIRED',
  'SPECIALIST_COORDINATION_REQUIRED',
] as const;
export type AgentWorkJustification = (typeof AGENT_WORK_JUSTIFICATIONS)[number];

export const WORKER_STATES = [
  'PENDING',
  'CLAIMING',
  'ACTIVE',
  'RELEASING',
  'LEASE_LOST',
  'LEASE_UNCERTAIN',
  'COMPLETED',
  'CANCELLED',
  'FAILED',
] as const;
export type WorkerState = (typeof WORKER_STATES)[number];

export type WorkerTerminalReason = 'WORK_COMPLETED' | 'WORK_FAILED' | 'CANCELLED_BY_CONTROL';

export interface AgentWorkerRuntimeConfig {
  readonly maxWorkers: number;
  readonly maxTrackedTasks: number;
  readonly leaseTtlMs: number;
  readonly heartbeatIntervalMs: number;
}

export interface AgentWorkerTask {
  readonly taskId: string;
  readonly tenant: TenantContext;
  readonly correlation: CorrelationContext;
  readonly justification: AgentWorkJustification;
}

export interface WorkerOperationContext {
  readonly tenant: TenantContext;
  readonly correlation: CorrelationContext;
}

export interface W03LeaseAcquireInput {
  readonly tenantId: TenantContext['tenantId'];
  readonly leaseKey: string;
  readonly ownerToken: string;
  readonly subjectType: 'w05-agent-task';
  readonly subjectId: string;
  readonly nowEpochMs: number;
  readonly expiresAtEpochMs: number;
}

export interface W03LeaseHeartbeatInput {
  readonly tenantId: TenantContext['tenantId'];
  readonly leaseKey: string;
  readonly ownerToken: string;
  readonly nowEpochMs: number;
  readonly expiresAtEpochMs: number;
}

export interface W03LeaseReleaseInput {
  readonly tenantId: TenantContext['tenantId'];
  readonly leaseKey: string;
  readonly ownerToken: string;
  readonly nowEpochMs: number;
}

interface W03LeaseResultBase {
  readonly source: 'W03_DURABLE_LEASE';
  readonly tenantId: TenantContext['tenantId'];
  readonly leaseKey: string;
  readonly ownerToken: string;
  readonly authorizesExecution: false;
}

export interface W03LeaseAcquireResult extends W03LeaseResultBase {
  readonly status: 'ACQUIRED' | 'NOT_ACQUIRED';
}

export interface W03LeaseHeartbeatResult extends W03LeaseResultBase {
  readonly status: 'CURRENT' | 'LOST';
}

export interface W03LeaseReleaseResult extends W03LeaseResultBase {
  readonly status: 'RELEASED' | 'NOT_OWNER';
}

/**
 * Adapter boundary to the accepted W03 durable lease source of truth.
 * W05-F consumes ownership results; it never reimplements durable lease storage,
 * expiry arbitration or reclaim authority.
 */
export interface W03LeasePort {
  acquire(input: W03LeaseAcquireInput): Promise<W03LeaseAcquireResult>;
  heartbeat(input: W03LeaseHeartbeatInput): Promise<W03LeaseHeartbeatResult>;
  release(input: W03LeaseReleaseInput): Promise<W03LeaseReleaseResult>;
}

export interface WorkerRecordSnapshot {
  readonly taskId: string;
  readonly tenant: TenantContext;
  readonly correlation: CorrelationContext;
  readonly justification: AgentWorkJustification;
  readonly state: WorkerState;
  readonly generation: number;
  readonly ownerPresent: boolean;
  readonly cancelRequested: boolean;
  readonly terminalReason: WorkerTerminalReason | null;
  readonly lastTransitionEpochMs: number;
  readonly lastHeartbeatEpochMs: number | null;
  readonly authoritySemantics: 'AGENT_RUNTIME_OWNERSHIP_ONLY_NO_AUTHORITY';
  readonly authorizesExecution: false;
  readonly canInvokeTools: false;
}

export type WorkerDecisionCode =
  | 'SUBMITTED'
  | 'DUPLICATE_TASK'
  | 'TRACKING_CAPACITY_REACHED'
  | 'INVALID_TASK'
  | 'CLAIMED'
  | 'RECLAIMED'
  | 'WORKER_CAPACITY_REACHED'
  | 'INVALID_STATE'
  | 'OWNER_MISMATCH'
  | 'LEASE_NOT_ACQUIRED'
  | 'LEASE_CURRENT'
  | 'LEASE_LOST'
  | 'LEASE_UNCERTAIN'
  | 'INVALID_LEASE_RESULT'
  | 'LEASE_PORT_ERROR'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'FAILED'
  | 'PRUNED'
  | 'TASK_NOT_FOUND';

export interface WorkerRuntimeDecision {
  readonly code: WorkerDecisionCode;
  readonly record: WorkerRecordSnapshot | null;
  readonly activeWorkers: number;
  readonly maxWorkers: number;
  readonly authoritySemantics: 'AGENT_RUNTIME_OWNERSHIP_ONLY_NO_AUTHORITY';
  readonly authorizesExecution: false;
  readonly canInvokeTools: false;
}
