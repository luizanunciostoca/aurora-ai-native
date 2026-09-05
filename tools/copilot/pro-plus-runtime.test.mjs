import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateDynamicSafeBuildCapacity,
  discoverRuntimeCapabilities,
} from './runtime-capacity.mjs';
import {
  filterCandidatesAgainstActiveLeases,
  projectActiveSessionLeases,
} from './session-lease-registry.mjs';
import { buildProPlusDevelopmentTelemetry } from './pro-plus-telemetry.mjs';

const freeMode = {
  mode: 'FREE_ACTIONS_CLI',
  freeActionsCliEnabled: true,
  cloudAgentEnabled: false,
  physicalBuildSlots: 2,
};

const proPlusMode = {
  mode: 'PRO_PLUS_CLOUD_AGENT',
  freeActionsCliEnabled: false,
  cloudAgentEnabled: true,
  physicalBuildSlots: 2,
};

test('Free mode remains bounded and subtracts active leases from physical capacity', () => {
  const runtime = discoverRuntimeCapabilities(freeMode, {});
  const result = calculateDynamicSafeBuildCapacity({
    mode: freeMode,
    runtime,
    readyCandidateCount: 4,
    pathIndependentCandidateCount: 4,
    activeLeaseCount: 1,
  });
  assert.equal(runtime.executionAvailable, true);
  assert.equal(result.capacity, 1);
  assert.equal(result.authority, false);
});

test('PRO+ fails closed when plan/runtime/CI/credit capability is not proven', () => {
  const runtime = discoverRuntimeCapabilities(proPlusMode, {
    AURORA_CLOUD_AGENT_AVAILABLE: 'true',
    AURORA_ACCOUNT_PLAN: 'pro_plus',
  });
  const result = calculateDynamicSafeBuildCapacity({
    mode: proPlusMode,
    runtime,
    readyCandidateCount: 8,
    pathIndependentCandidateCount: 8,
  });
  assert.equal(runtime.proPlusReady, false);
  assert.equal(result.capacity, 0);
  assert.deepEqual(result.reasons, ['RUNTIME_EXECUTION_UNAVAILABLE']);
});

test('PRO+ capacity is the minimum safe runtime, CI, credit and DAG dimension', () => {
  const runtime = discoverRuntimeCapabilities(proPlusMode, {
    AURORA_CLOUD_AGENT_AVAILABLE: 'true',
    AURORA_ACCOUNT_PLAN: 'pro_plus',
    AURORA_ISOLATED_SESSION_CAPACITY: '8',
    AURORA_CI_PARALLEL_CAPACITY: '5',
    AURORA_AI_CREDIT_SLOT_BUDGET: '4',
    AURORA_FLEET_SUBAGENT_CAP: '4',
  });
  const result = calculateDynamicSafeBuildCapacity({
    mode: proPlusMode,
    runtime,
    readyCandidateCount: 7,
    pathIndependentCandidateCount: 6,
    activeLeaseCount: 1,
  });
  assert.equal(runtime.proPlusReady, true);
  assert.equal(result.capacity, 4);
  assert.equal(runtime.fleetSubagentCap, 4);
});

test('active semantic and path leases defer colliding writers', () => {
  const tasks = [
    {
      id: 'A',
      allowedPaths: ['services/a/**'],
      sharedWriteSurfaces: ['surface:device'],
    },
    {
      id: 'B',
      allowedPaths: ['services/b/**'],
      sharedWriteSurfaces: ['surface:device'],
    },
    {
      id: 'C',
      allowedPaths: ['services/c/**'],
      sharedWriteSurfaces: ['surface:other'],
    },
  ];
  const issues = [
    {
      number: 1,
      state: 'open',
      title: '[AURORA][TASK A] lease owner',
      body: '<!-- AURORA_TASK_ID: A -->',
      updated_at: '2026-09-05T00:00:00Z',
      labels: [{ name: 'aurora:copilot-free-running' }],
    },
  ];
  const leases = projectActiveSessionLeases(issues, tasks);
  const result = filterCandidatesAgainstActiveLeases(
    [
      { task: tasks[1], issue: { number: 2 } },
      { task: tasks[2], issue: { number: 3 } },
    ],
    leases,
  );
  assert.equal(leases.length, 1);
  assert.equal(result.eligible.length, 1);
  assert.equal(result.eligible[0].task.id, 'C');
  assert.equal(result.deferred[0].reason, 'ACTIVE_SHARED_WRITE_LEASE');
});

test('development telemetry is operational evidence and never authority', () => {
  const runtime = discoverRuntimeCapabilities(freeMode, {});
  const capacity = { capacity: 2 };
  const telemetry = buildProPlusDevelopmentTelemetry({
    runtime,
    capacity,
    activeLeases: [{ taskId: 'A' }],
    selected: [{ task: { id: 'B' } }],
    deferred: [{ taskId: 'C' }],
  });
  assert.equal(telemetry.schema, 'aurora.pro_plus.development_telemetry.v1');
  assert.equal(telemetry.canonicalAuthority, false);
  assert.equal(telemetry.authorityElevationViolations, 0);
  assert.equal(telemetry.buildCapacityUtilizationBps, 5000);
});
