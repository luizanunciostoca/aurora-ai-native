// @ts-expect-error -- service harness has no @types/node; Node 22 provides this built-in.
import assert from 'node:assert/strict';
// @ts-expect-error -- service harness has no @types/node; Node 22 provides this built-in.
import test from 'node:test';

import type { CorrelationId, TenantId } from '@aurora/contracts';
import { BoundedAgentWorkerPool } from '../src/runtime/index.js';
import type {
  AgentWorkerTask,
  W03LeaseAcquireInput,
  W03LeaseAcquireResult,
  W03LeaseHeartbeatInput,
  W03LeaseHeartbeatResult,
  W03LeasePort,
  W03LeaseReleaseInput,
  W03LeaseReleaseResult,
  WorkerOperationContext,
} from '../src/runtime/index.js';

const tenant = { tenantId: 'ten_01K0M0M0M0M0M0M0M0M0M0M0M0M0M0' as TenantId };
const correlation = {
  correlationId: 'cor_01K0M0M0M0M0M0M0M0M0M0M0M0M1' as CorrelationId,
};
const otherTenant = { tenantId: 'ten_01K0M0M0M0M0M0M0M0M0M0M0M0M2' as TenantId };
const otherCorrelation = {
  correlationId: 'cor_01K0M0M0M0M0M0M0M0M0M0M0M0M3' as CorrelationId,
};
const context: WorkerOperationContext = { tenant, correlation };
const wrongTenantContext: WorkerOperationContext = { tenant: otherTenant, correlation };
const wrongCorrelationContext: WorkerOperationContext = { tenant, correlation: otherCorrelation };

function task(taskId: string): AgentWorkerTask {
  return {
    taskId,
    tenant,
    correlation,
    justification: 'ITERATIVE_OBSERVE_PLAN_REQUIRED',
  };
}

function acquired(input: W03LeaseAcquireInput): W03LeaseAcquireResult {
  return {
    source: 'W03_DURABLE_LEASE',
    tenantId: input.tenantId,
    leaseKey: input.leaseKey,
    ownerToken: input.ownerToken,
    status: 'ACQUIRED',
    authorizesExecution: false,
  };
}

function notAcquired(input: W03LeaseAcquireInput): W03LeaseAcquireResult {
  return {
    ...acquired(input),
    status: 'NOT_ACQUIRED',
  };
}

function current(input: W03LeaseHeartbeatInput): W03LeaseHeartbeatResult {
  return {
    source: 'W03_DURABLE_LEASE',
    tenantId: input.tenantId,
    leaseKey: input.leaseKey,
    ownerToken: input.ownerToken,
    status: 'CURRENT',
    authorizesExecution: false,
  };
}

function lost(input: W03LeaseHeartbeatInput): W03LeaseHeartbeatResult {
  return {
    ...current(input),
    status: 'LOST',
  };
}

function released(input: W03LeaseReleaseInput): W03LeaseReleaseResult {
  return {
    source: 'W03_DURABLE_LEASE',
    tenantId: input.tenantId,
    leaseKey: input.leaseKey,
    ownerToken: input.ownerToken,
    status: 'RELEASED',
    authorizesExecution: false,
  };
}

function notOwner(input: W03LeaseReleaseInput): W03LeaseReleaseResult {
  return {
    ...released(input),
    status: 'NOT_OWNER',
  };
}

function leasePort(overrides: Partial<W03LeasePort> = {}): W03LeasePort {
  return {
    acquire: async (input) => acquired(input),
    heartbeat: async (input) => current(input),
    release: async (input) => released(input),
    ...overrides,
  };
}

function pool(port: W03LeasePort = leasePort(), maxWorkers = 2, maxTrackedTasks = 8) {
  return new BoundedAgentWorkerPool(
    {
      maxWorkers,
      maxTrackedTasks,
      leaseTtlMs: 10_000,
      heartbeatIntervalMs: 2_000,
    },
    port,
  );
}

test('W05-F validates bounded worker configuration fail closed', () => {
  assert.throws(
    () =>
      new BoundedAgentWorkerPool(
        { maxWorkers: 0, maxTrackedTasks: 1, leaseTtlMs: 1000, heartbeatIntervalMs: 100 },
        leasePort(),
      ),
    /maxWorkers must be a positive safe integer/,
  );
  assert.throws(
    () =>
      new BoundedAgentWorkerPool(
        { maxWorkers: 2, maxTrackedTasks: 1, leaseTtlMs: 1000, heartbeatIntervalMs: 100 },
        leasePort(),
      ),
    /maxTrackedTasks must be greater than or equal to maxWorkers/,
  );
  assert.throws(
    () =>
      new BoundedAgentWorkerPool(
        { maxWorkers: 1, maxTrackedTasks: 2, leaseTtlMs: 1000, heartbeatIntervalMs: 1000 },
        leasePort(),
      ),
    /heartbeatIntervalMs must be lower than leaseTtlMs/,
  );
});

test('submission requires explicit agent justification and bounded tracking capacity', () => {
  const runtime = pool(leasePort(), 1, 2);
  assert.equal(runtime.submit(task('task:a'), 100).code, 'SUBMITTED');
  assert.equal(runtime.submit(task('task:a'), 101).code, 'DUPLICATE_TASK');
  assert.equal(runtime.submit(task('task:b'), 102).code, 'SUBMITTED');
  assert.equal(runtime.submit(task('task:c'), 103).code, 'TRACKING_CAPACITY_REACHED');

  const invalid = runtime.submit(
    { ...task('bad task id'), justification: 'ITERATIVE_OBSERVE_PLAN_REQUIRED' },
    104,
  );
  assert.equal(invalid.code, 'INVALID_TASK');
});

test('worker operations and snapshots fail closed across tenant or correlation context', async () => {
  let acquireCalls = 0;
  const runtime = pool(
    leasePort({
      acquire: async (input) => {
        acquireCalls += 1;
        return acquired(input);
      },
    }),
  );
  runtime.submit(task('task:a'), 100);

  assert.equal(runtime.snapshot(wrongTenantContext, 'task:a'), null);
  assert.equal(runtime.snapshot(wrongCorrelationContext, 'task:a'), null);
  assert.deepEqual(runtime.snapshots(wrongTenantContext), []);
  assert.deepEqual(runtime.snapshots(wrongCorrelationContext), []);

  const tenantMismatch = await runtime.claim(wrongTenantContext, 'task:a', 'owner:other', 110);
  assert.equal(tenantMismatch.code, 'TASK_NOT_FOUND');
  const correlationMismatch = await runtime.claim(
    wrongCorrelationContext,
    'task:a',
    'owner:other',
    111,
  );
  assert.equal(correlationMismatch.code, 'TASK_NOT_FOUND');
  assert.equal(acquireCalls, 0);

  const valid = await runtime.claim(context, 'task:a', 'owner:a', 112);
  assert.equal(valid.code, 'CLAIMED');
  assert.equal(valid.record?.tenant.tenantId, tenant.tenantId);
  assert.equal(valid.record?.correlation.correlationId, correlation.correlationId);
  assert.equal(acquireCalls, 1);
});

test('claim marks capacity before await so concurrent claims cannot oversubscribe the pool', async () => {
  let resolveFirst: ((result: W03LeaseAcquireResult) => void) | undefined;
  let firstInput: W03LeaseAcquireInput | undefined;
  const firstAcquire = new Promise<W03LeaseAcquireResult>((resolve) => {
    resolveFirst = resolve;
  });
  const port = leasePort({
    acquire: async (input) => {
      firstInput = input;
      return firstAcquire;
    },
  });
  const runtime = pool(port, 1, 4);
  runtime.submit(task('task:a'), 100);
  runtime.submit(task('task:b'), 100);

  const firstClaim = runtime.claim(context, 'task:a', 'owner:a', 110);
  assert.equal(runtime.snapshot(context, 'task:a')?.state, 'CLAIMING');
  const secondClaim = await runtime.claim(context, 'task:b', 'owner:b', 111);
  assert.equal(secondClaim.code, 'WORKER_CAPACITY_REACHED');
  assert.equal(runtime.snapshot(context, 'task:b')?.state, 'PENDING');

  if (!firstInput || !resolveFirst) throw new Error('deferred acquire was not captured');
  resolveFirst(acquired(firstInput));
  const first = await firstClaim;
  assert.equal(first.code, 'CLAIMED');
  assert.equal(first.record?.state, 'ACTIVE');
  assert.equal(first.activeWorkers, 1);
});

test('W03 NOT_ACQUIRED never creates local ownership', async () => {
  const runtime = pool(
    leasePort({
      acquire: async (input) => notAcquired(input),
    }),
  );
  runtime.submit(task('task:a'), 100);
  const result = await runtime.claim(context, 'task:a', 'owner:a', 110);
  assert.equal(result.code, 'LEASE_NOT_ACQUIRED');
  assert.equal(result.record?.state, 'PENDING');
  assert.equal(result.record?.ownerPresent, false);
  assert.equal(result.activeWorkers, 0);
});

test('lost heartbeat releases local ownership and reclaim requires a new W03 acquire', async () => {
  let heartbeatCount = 0;
  const runtime = pool(
    leasePort({
      heartbeat: async (input) => {
        heartbeatCount += 1;
        return lost(input);
      },
    }),
  );
  runtime.submit(task('task:a'), 100);
  const claimed = await runtime.claim(context, 'task:a', 'owner:a', 110);
  assert.equal(claimed.record?.generation, 1);

  const heartbeat = await runtime.heartbeat(context, 'task:a', 'owner:a', 120);
  assert.equal(heartbeat.code, 'LEASE_LOST');
  assert.equal(heartbeat.record?.state, 'LEASE_LOST');
  assert.equal(heartbeat.record?.ownerPresent, false);
  assert.equal(heartbeatCount, 1);

  const reclaimed = await runtime.reclaim(context, 'task:a', 'owner:b', 130);
  assert.equal(reclaimed.code, 'RECLAIMED');
  assert.equal(reclaimed.record?.state, 'ACTIVE');
  assert.equal(reclaimed.record?.generation, 2);
});

test('uncertain or tampered acquire result cannot fall back to PENDING ownership semantics', async () => {
  let calls = 0;
  const runtime = pool(
    leasePort({
      acquire: async (input) => {
        calls += 1;
        if (calls === 1) {
          return {
            ...acquired(input),
            tenantId: otherTenant.tenantId,
          } as W03LeaseAcquireResult;
        }
        return acquired(input);
      },
    }),
  );
  runtime.submit(task('task:a'), 100);
  const invalid = await runtime.claim(context, 'task:a', 'owner:a', 110);
  assert.equal(invalid.code, 'INVALID_LEASE_RESULT');
  assert.equal(invalid.record?.state, 'LEASE_UNCERTAIN');
  assert.equal(invalid.record?.authorizesExecution, false);

  const reclaimed = await runtime.reclaim(context, 'task:a', 'owner:b', 120);
  assert.equal(reclaimed.code, 'RECLAIMED');
  assert.equal(reclaimed.record?.generation, 1);
});

test('acquire port failure becomes LEASE_UNCERTAIN instead of allowing a blind duplicate claim', async () => {
  let calls = 0;
  const runtime = pool(
    leasePort({
      acquire: async (input) => {
        calls += 1;
        if (calls === 1) throw new Error('transport uncertain after durable boundary');
        return acquired(input);
      },
    }),
  );
  runtime.submit(task('task:a'), 100);
  const uncertain = await runtime.claim(context, 'task:a', 'owner:a', 110);
  assert.equal(uncertain.code, 'LEASE_PORT_ERROR');
  assert.equal(uncertain.record?.state, 'LEASE_UNCERTAIN');

  const blindClaim = await runtime.claim(context, 'task:a', 'owner:c', 120);
  assert.equal(blindClaim.code, 'INVALID_STATE');
  const reconciled = await runtime.reclaim(context, 'task:a', 'owner:b', 130);
  assert.equal(reconciled.code, 'RECLAIMED');
});

test('LEASE_UNCERTAIN reserves capacity while allowing self-reclaim reconciliation', async () => {
  let acquireCalls = 0;
  let heartbeatCalls = 0;
  const runtime = pool(
    leasePort({
      acquire: async (input) => {
        acquireCalls += 1;
        return acquired(input);
      },
      heartbeat: async () => {
        heartbeatCalls += 1;
        throw new Error('heartbeat result unknown after durable boundary');
      },
    }),
    1,
    4,
  );
  runtime.submit(task('task:a'), 100);
  runtime.submit(task('task:b'), 100);

  const claimed = await runtime.claim(context, 'task:a', 'owner:a', 110);
  assert.equal(claimed.code, 'CLAIMED');
  assert.equal(claimed.activeWorkers, 1);

  const uncertain = await runtime.heartbeat(context, 'task:a', 'owner:a', 120);
  assert.equal(uncertain.code, 'LEASE_PORT_ERROR');
  assert.equal(uncertain.record?.state, 'LEASE_UNCERTAIN');
  assert.equal(uncertain.record?.ownerPresent, true);
  assert.equal(uncertain.activeWorkers, 1);
  assert.equal(runtime.activeWorkerCount(), 1);
  assert.equal(heartbeatCalls, 1);

  const blocked = await runtime.claim(context, 'task:b', 'owner:b', 121);
  assert.equal(blocked.code, 'WORKER_CAPACITY_REACHED');
  assert.equal(blocked.record?.state, 'PENDING');
  assert.equal(blocked.activeWorkers, 1);

  const reconciled = await runtime.reclaim(context, 'task:a', 'owner:a-reconciled', 130);
  assert.equal(reconciled.code, 'RECLAIMED');
  assert.equal(reconciled.record?.state, 'ACTIVE');
  assert.equal(reconciled.activeWorkers, 1);
  assert.equal(acquireCalls, 2);

  const completed = await runtime.complete(context, 'task:a', 'owner:a-reconciled', 140);
  assert.equal(completed.code, 'COMPLETED');
  assert.equal(completed.activeWorkers, 0);

  const secondClaim = await runtime.claim(context, 'task:b', 'owner:b', 150);
  assert.equal(secondClaim.code, 'CLAIMED');
  assert.equal(secondClaim.activeWorkers, 1);
});

test('cancellation during CLAIMING releases a late acquired lease using cancellation time', async () => {
  let resolveAcquire: ((result: W03LeaseAcquireResult) => void) | undefined;
  let acquireInput: W03LeaseAcquireInput | undefined;
  const acquirePromise = new Promise<W03LeaseAcquireResult>((resolve) => {
    resolveAcquire = resolve;
  });
  const releases: W03LeaseReleaseInput[] = [];
  const runtime = pool(
    leasePort({
      acquire: async (input) => {
        acquireInput = input;
        return acquirePromise;
      },
      release: async (input) => {
        releases.push(input);
        return released(input);
      },
    }),
    1,
  );
  runtime.submit(task('task:a'), 100);
  const claim = runtime.claim(context, 'task:a', 'owner:a', 110);
  const cancellation = await runtime.cancel(context, 'task:a', 125);
  assert.equal(cancellation.code, 'CANCEL_REQUESTED');
  assert.equal(cancellation.record?.state, 'CLAIMING');

  if (!acquireInput || !resolveAcquire) throw new Error('deferred acquire was not captured');
  resolveAcquire(acquired(acquireInput));
  const final = await claim;
  assert.equal(final.code, 'CANCELLED');
  assert.equal(final.record?.state, 'CANCELLED');
  assert.equal(final.record?.terminalReason, 'CANCELLED_BY_CONTROL');
  assert.equal(final.record?.ownerPresent, false);
  assert.equal(releases.length, 1);
  assert.equal(releases[0]?.nowEpochMs, 125);
});

test('completion requires exact owner and confirmed W03 release', async () => {
  const runtime = pool(
    leasePort({
      release: async (input) => notOwner(input),
    }),
  );
  runtime.submit(task('task:a'), 100);
  await runtime.claim(context, 'task:a', 'owner:a', 110);

  const wrongOwner = await runtime.complete(context, 'task:a', 'owner:other', 120);
  assert.equal(wrongOwner.code, 'OWNER_MISMATCH');
  assert.equal(wrongOwner.record?.state, 'ACTIVE');

  const lostOwnership = await runtime.complete(context, 'task:a', 'owner:a', 130);
  assert.equal(lostOwnership.code, 'LEASE_LOST');
  assert.equal(lostOwnership.record?.state, 'LEASE_LOST');
  assert.equal(lostOwnership.record?.terminalReason, null);
});

test('terminal pruning is explicit and snapshots never expose owner tokens or tool authority', async () => {
  const runtime = pool();
  runtime.submit(task('task:b'), 100);
  runtime.submit(task('task:a'), 100);
  await runtime.claim(context, 'task:a', 'owner:secret', 110);
  const completed = await runtime.complete(context, 'task:a', 'owner:secret', 120);
  assert.equal(completed.code, 'COMPLETED');
  assert.equal(completed.record?.authorizesExecution, false);
  assert.equal(completed.record?.canInvokeTools, false);
  assert.equal(Object.hasOwn(completed.record ?? {}, 'ownerToken'), false);

  assert.deepEqual(
    runtime.snapshots(context).map((snapshot) => snapshot.taskId),
    ['task:a', 'task:b'],
  );
  const pruned = runtime.forgetTerminal(context, 'task:a');
  assert.equal(pruned.code, 'PRUNED');
  assert.equal(runtime.snapshot(context, 'task:a'), null);
  assert.equal('execute' in runtime, false);
  assert.equal('invokeTool' in runtime, false);
  assert.equal('provider' in runtime, false);
});
