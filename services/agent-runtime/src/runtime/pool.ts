import {
  AGENT_WORK_JUSTIFICATIONS,
  type AgentWorkerRuntimeConfig,
  type AgentWorkerTask,
  type W03LeaseAcquireResult,
  type W03LeaseHeartbeatResult,
  type W03LeasePort,
  type W03LeaseReleaseResult,
  type WorkerRecordSnapshot,
  type WorkerRuntimeDecision,
  type WorkerState,
  type WorkerTerminalReason,
} from './types.js';

interface MutableWorkerRecord {
  readonly task: AgentWorkerTask;
  state: WorkerState;
  generation: number;
  ownerToken: string | null;
  cancelRequested: boolean;
  cancelRequestedAtEpochMs: number | null;
  terminalReason: WorkerTerminalReason | null;
  lastTransitionEpochMs: number;
  lastHeartbeatEpochMs: number | null;
}

const OCCUPIED_STATES = new Set<WorkerState>(['CLAIMING', 'ACTIVE', 'RELEASING']);
const TERMINAL_STATES = new Set<WorkerState>(['COMPLETED', 'CANCELLED', 'FAILED']);
const TASK_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;

function positiveSafeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${field} must be a positive safe integer`);
  }
}

function validEpochMs(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validOwnerToken(ownerToken: string): boolean {
  const normalized = ownerToken.trim();
  return normalized.length > 0 && normalized.length <= 256;
}

function leaseKey(taskId: string): string {
  return `w05-agent-task:${taskId}`;
}

function validTask(task: AgentWorkerTask): boolean {
  return (
    TASK_ID_PATTERN.test(task.taskId) &&
    task.tenant.tenantId.trim().length > 0 &&
    task.correlation.correlationId.trim().length > 0 &&
    AGENT_WORK_JUSTIFICATIONS.includes(task.justification)
  );
}

function leaseResultMatches(
  result: W03LeaseAcquireResult | W03LeaseHeartbeatResult | W03LeaseReleaseResult,
  tenantId: string,
  expectedLeaseKey: string,
  ownerToken: string,
): boolean {
  return (
    result.source === 'W03_DURABLE_LEASE' &&
    result.tenantId === tenantId &&
    result.leaseKey === expectedLeaseKey &&
    result.ownerToken === ownerToken &&
    result.authorizesExecution === false
  );
}

export class BoundedAgentWorkerPool {
  readonly #config: AgentWorkerRuntimeConfig;
  readonly #leasePort: W03LeasePort;
  readonly #records = new Map<string, MutableWorkerRecord>();

  constructor(config: AgentWorkerRuntimeConfig, leasePort: W03LeasePort) {
    positiveSafeInteger(config.maxWorkers, 'maxWorkers');
    positiveSafeInteger(config.maxTrackedTasks, 'maxTrackedTasks');
    positiveSafeInteger(config.leaseTtlMs, 'leaseTtlMs');
    positiveSafeInteger(config.heartbeatIntervalMs, 'heartbeatIntervalMs');
    if (config.maxTrackedTasks < config.maxWorkers) {
      throw new RangeError('maxTrackedTasks must be greater than or equal to maxWorkers');
    }
    if (config.heartbeatIntervalMs >= config.leaseTtlMs) {
      throw new RangeError('heartbeatIntervalMs must be lower than leaseTtlMs');
    }
    this.#config = config;
    this.#leasePort = leasePort;
  }

  activeWorkerCount(): number {
    let count = 0;
    for (const record of this.#records.values()) {
      if (OCCUPIED_STATES.has(record.state)) count += 1;
    }
    return count;
  }

  snapshot(taskId: string): WorkerRecordSnapshot | null {
    const record = this.#records.get(taskId);
    return record ? this.#snapshot(record) : null;
  }

  snapshots(): readonly WorkerRecordSnapshot[] {
    return [...this.#records.values()]
      .sort((left, right) => left.task.taskId.localeCompare(right.task.taskId))
      .map((record) => this.#snapshot(record));
  }

  submit(task: AgentWorkerTask, nowEpochMs: number): WorkerRuntimeDecision {
    if (!validTask(task) || !validEpochMs(nowEpochMs)) {
      return this.#decision('INVALID_TASK', null);
    }
    const existing = this.#records.get(task.taskId);
    if (existing) return this.#decision('DUPLICATE_TASK', existing);
    if (this.#records.size >= this.#config.maxTrackedTasks) {
      return this.#decision('TRACKING_CAPACITY_REACHED', null);
    }
    const record: MutableWorkerRecord = {
      task: {
        ...task,
        tenant: { ...task.tenant },
        correlation: { ...task.correlation },
      },
      state: 'PENDING',
      generation: 0,
      ownerToken: null,
      cancelRequested: false,
      cancelRequestedAtEpochMs: null,
      terminalReason: null,
      lastTransitionEpochMs: nowEpochMs,
      lastHeartbeatEpochMs: null,
    };
    this.#records.set(task.taskId, record);
    return this.#decision('SUBMITTED', record);
  }

  async claim(
    taskId: string,
    ownerToken: string,
    nowEpochMs: number,
  ): Promise<WorkerRuntimeDecision> {
    return this.#acquireOwnership(taskId, ownerToken, nowEpochMs, 'CLAIM');
  }

  async reclaim(
    taskId: string,
    ownerToken: string,
    nowEpochMs: number,
  ): Promise<WorkerRuntimeDecision> {
    return this.#acquireOwnership(taskId, ownerToken, nowEpochMs, 'RECLAIM');
  }

  async heartbeat(
    taskId: string,
    ownerToken: string,
    nowEpochMs: number,
  ): Promise<WorkerRuntimeDecision> {
    const record = this.#records.get(taskId);
    if (!record) return this.#decision('TASK_NOT_FOUND', null);
    if (record.state !== 'ACTIVE') return this.#decision('INVALID_STATE', record);
    if (record.ownerToken !== ownerToken) return this.#decision('OWNER_MISMATCH', record);
    if (!this.#validOperationTime(record, nowEpochMs) || !validOwnerToken(ownerToken)) {
      return this.#decision('INVALID_STATE', record);
    }
    const expiresAtEpochMs = nowEpochMs + this.#config.leaseTtlMs;
    if (!Number.isSafeInteger(expiresAtEpochMs)) return this.#decision('INVALID_STATE', record);
    const expectedLeaseKey = leaseKey(record.task.taskId);
    let result: W03LeaseHeartbeatResult;
    try {
      result = await this.#leasePort.heartbeat({
        tenantId: record.task.tenant.tenantId,
        leaseKey: expectedLeaseKey,
        ownerToken,
        nowEpochMs,
        expiresAtEpochMs,
      });
    } catch {
      record.state = 'LEASE_UNCERTAIN';
      record.lastTransitionEpochMs = nowEpochMs;
      return this.#decision('LEASE_PORT_ERROR', record);
    }
    if (!leaseResultMatches(result, record.task.tenant.tenantId, expectedLeaseKey, ownerToken)) {
      record.state = 'LEASE_UNCERTAIN';
      record.lastTransitionEpochMs = nowEpochMs;
      return this.#decision('INVALID_LEASE_RESULT', record);
    }
    if (result.status === 'LOST') {
      record.state = 'LEASE_LOST';
      record.ownerToken = null;
      record.lastTransitionEpochMs = nowEpochMs;
      return this.#decision('LEASE_LOST', record);
    }
    record.lastHeartbeatEpochMs = nowEpochMs;
    return this.#decision('LEASE_CURRENT', record);
  }

  async complete(
    taskId: string,
    ownerToken: string,
    nowEpochMs: number,
  ): Promise<WorkerRuntimeDecision> {
    return this.#terminalRelease(
      taskId,
      ownerToken,
      nowEpochMs,
      'COMPLETED',
      'WORK_COMPLETED',
      'COMPLETED',
    );
  }

  async fail(
    taskId: string,
    ownerToken: string,
    nowEpochMs: number,
  ): Promise<WorkerRuntimeDecision> {
    return this.#terminalRelease(taskId, ownerToken, nowEpochMs, 'FAILED', 'WORK_FAILED', 'FAILED');
  }

  async cancel(taskId: string, nowEpochMs: number): Promise<WorkerRuntimeDecision> {
    const record = this.#records.get(taskId);
    if (!record) return this.#decision('TASK_NOT_FOUND', null);
    if (!this.#validOperationTime(record, nowEpochMs))
      return this.#decision('INVALID_STATE', record);
    if (TERMINAL_STATES.has(record.state)) return this.#decision('INVALID_STATE', record);

    record.cancelRequested = true;
    record.cancelRequestedAtEpochMs = nowEpochMs;
    if (record.state === 'CLAIMING') {
      record.lastTransitionEpochMs = nowEpochMs;
      return this.#decision('CANCEL_REQUESTED', record);
    }
    if (record.state === 'PENDING' || record.state === 'LEASE_LOST') {
      record.state = 'CANCELLED';
      record.ownerToken = null;
      record.terminalReason = 'CANCELLED_BY_CONTROL';
      record.lastTransitionEpochMs = nowEpochMs;
      return this.#decision('CANCELLED', record);
    }
    if (record.state === 'ACTIVE' || record.state === 'LEASE_UNCERTAIN') {
      if (!record.ownerToken) return this.#decision('INVALID_STATE', record);
      return this.#terminalRelease(
        taskId,
        record.ownerToken,
        nowEpochMs,
        'CANCELLED',
        'CANCELLED_BY_CONTROL',
        'CANCELLED',
      );
    }
    return this.#decision('INVALID_STATE', record);
  }

  forgetTerminal(taskId: string): WorkerRuntimeDecision {
    const record = this.#records.get(taskId);
    if (!record) return this.#decision('TASK_NOT_FOUND', null);
    if (!TERMINAL_STATES.has(record.state)) return this.#decision('INVALID_STATE', record);
    this.#records.delete(taskId);
    return this.#decision('PRUNED', null);
  }

  async #acquireOwnership(
    taskId: string,
    ownerToken: string,
    nowEpochMs: number,
    mode: 'CLAIM' | 'RECLAIM',
  ): Promise<WorkerRuntimeDecision> {
    const record = this.#records.get(taskId);
    if (!record) return this.#decision('TASK_NOT_FOUND', null);
    const allowedState =
      mode === 'CLAIM'
        ? record.state === 'PENDING'
        : record.state === 'LEASE_LOST' || record.state === 'LEASE_UNCERTAIN';
    if (!allowedState || record.cancelRequested) return this.#decision('INVALID_STATE', record);
    if (!validOwnerToken(ownerToken) || !this.#validOperationTime(record, nowEpochMs)) {
      return this.#decision('INVALID_STATE', record);
    }
    if (this.activeWorkerCount() >= this.#config.maxWorkers) {
      return this.#decision('WORKER_CAPACITY_REACHED', record);
    }
    const expiresAtEpochMs = nowEpochMs + this.#config.leaseTtlMs;
    if (!Number.isSafeInteger(expiresAtEpochMs)) return this.#decision('INVALID_STATE', record);

    const previousState = record.state;
    const previousOwnerToken = record.ownerToken;
    const expectedLeaseKey = leaseKey(record.task.taskId);
    record.state = 'CLAIMING';
    record.ownerToken = ownerToken;
    record.lastTransitionEpochMs = nowEpochMs;

    let result: W03LeaseAcquireResult;
    try {
      result = await this.#leasePort.acquire({
        tenantId: record.task.tenant.tenantId,
        leaseKey: expectedLeaseKey,
        ownerToken,
        subjectType: 'w05-agent-task',
        subjectId: record.task.taskId,
        nowEpochMs,
        expiresAtEpochMs,
      });
    } catch {
      record.state = 'LEASE_UNCERTAIN';
      record.lastTransitionEpochMs = Math.max(record.lastTransitionEpochMs, nowEpochMs);
      return this.#decision('LEASE_PORT_ERROR', record);
    }

    if (!leaseResultMatches(result, record.task.tenant.tenantId, expectedLeaseKey, ownerToken)) {
      record.state = 'LEASE_UNCERTAIN';
      record.lastTransitionEpochMs = Math.max(record.lastTransitionEpochMs, nowEpochMs);
      return this.#decision('INVALID_LEASE_RESULT', record);
    }
    if (result.status !== 'ACQUIRED') {
      if (record.cancelRequested) {
        record.state = 'CANCELLED';
        record.ownerToken = null;
        record.terminalReason = 'CANCELLED_BY_CONTROL';
        record.lastTransitionEpochMs = record.cancelRequestedAtEpochMs ?? nowEpochMs;
        return this.#decision('CANCELLED', record);
      }
      record.state = previousState;
      record.ownerToken = previousOwnerToken;
      record.lastTransitionEpochMs = nowEpochMs;
      return this.#decision('LEASE_NOT_ACQUIRED', record);
    }

    record.generation += 1;
    record.lastHeartbeatEpochMs = nowEpochMs;
    if (record.cancelRequested) {
      const cancellationEpochMs = record.cancelRequestedAtEpochMs ?? nowEpochMs;
      return this.#terminalRelease(
        taskId,
        ownerToken,
        cancellationEpochMs,
        'CANCELLED',
        'CANCELLED_BY_CONTROL',
        'CANCELLED',
      );
    }
    record.state = 'ACTIVE';
    record.lastTransitionEpochMs = nowEpochMs;
    return this.#decision(mode === 'CLAIM' ? 'CLAIMED' : 'RECLAIMED', record);
  }

  async #terminalRelease(
    taskId: string,
    ownerToken: string,
    nowEpochMs: number,
    terminalState: 'COMPLETED' | 'CANCELLED' | 'FAILED',
    terminalReason: WorkerTerminalReason,
    successCode: 'COMPLETED' | 'CANCELLED' | 'FAILED',
  ): Promise<WorkerRuntimeDecision> {
    const record = this.#records.get(taskId);
    if (!record) return this.#decision('TASK_NOT_FOUND', null);
    if (
      record.state !== 'ACTIVE' &&
      record.state !== 'LEASE_UNCERTAIN' &&
      record.state !== 'CLAIMING'
    ) {
      return this.#decision('INVALID_STATE', record);
    }
    if (record.ownerToken !== ownerToken) return this.#decision('OWNER_MISMATCH', record);
    if (!validOwnerToken(ownerToken) || !this.#validOperationTime(record, nowEpochMs)) {
      return this.#decision('INVALID_STATE', record);
    }

    const expectedLeaseKey = leaseKey(record.task.taskId);
    record.state = 'RELEASING';
    record.lastTransitionEpochMs = nowEpochMs;
    let result: W03LeaseReleaseResult;
    try {
      result = await this.#leasePort.release({
        tenantId: record.task.tenant.tenantId,
        leaseKey: expectedLeaseKey,
        ownerToken,
        nowEpochMs,
      });
    } catch {
      record.state = 'LEASE_UNCERTAIN';
      return this.#decision('LEASE_PORT_ERROR', record);
    }
    if (!leaseResultMatches(result, record.task.tenant.tenantId, expectedLeaseKey, ownerToken)) {
      record.state = 'LEASE_UNCERTAIN';
      return this.#decision('INVALID_LEASE_RESULT', record);
    }
    if (result.status !== 'RELEASED') {
      record.state = 'LEASE_LOST';
      record.ownerToken = null;
      return this.#decision('LEASE_LOST', record);
    }

    record.state = terminalState;
    record.ownerToken = null;
    record.terminalReason = terminalReason;
    record.lastTransitionEpochMs = nowEpochMs;
    return this.#decision(successCode, record);
  }

  #validOperationTime(record: MutableWorkerRecord, nowEpochMs: number): boolean {
    return validEpochMs(nowEpochMs) && nowEpochMs >= record.lastTransitionEpochMs;
  }

  #snapshot(record: MutableWorkerRecord): WorkerRecordSnapshot {
    return {
      taskId: record.task.taskId,
      tenant: { ...record.task.tenant },
      correlation: { ...record.task.correlation },
      justification: record.task.justification,
      state: record.state,
      generation: record.generation,
      ownerPresent: record.ownerToken !== null,
      cancelRequested: record.cancelRequested,
      terminalReason: record.terminalReason,
      lastTransitionEpochMs: record.lastTransitionEpochMs,
      lastHeartbeatEpochMs: record.lastHeartbeatEpochMs,
      authoritySemantics: 'AGENT_RUNTIME_OWNERSHIP_ONLY_NO_AUTHORITY',
      authorizesExecution: false,
      canInvokeTools: false,
    };
  }

  #decision(
    code: WorkerRuntimeDecision['code'],
    record: MutableWorkerRecord | null,
  ): WorkerRuntimeDecision {
    return {
      code,
      record: record ? this.#snapshot(record) : null,
      activeWorkers: this.activeWorkerCount(),
      maxWorkers: this.#config.maxWorkers,
      authoritySemantics: 'AGENT_RUNTIME_OWNERSHIP_ONLY_NO_AUTHORITY',
      authorizesExecution: false,
      canInvokeTools: false,
    };
  }
}
