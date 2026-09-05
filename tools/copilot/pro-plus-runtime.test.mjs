import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
const actionsMode = {
  mode: 'PRO_PLUS_ACTIONS_FABRIC',
  proPlusActionsFabricEnabled: true,
  freeActionsCliEnabled: true,
  cloudAgentEnabled: false,
  physicalBuildSlots: 3,
  fallbackPhysicalBuildSlots: 2,
  runtimeCapabilityDiscovery: { minimumObservedConcurrentSessions: 3 },
};
const verifiedAttestation = {
  schema: 'aurora.pro_plus.runtime_attestation.v1',
  state: 'VERIFIED',
  executionMode: 'PRO_PLUS_ACTIONS_FABRIC',
  candidateSha: 'a'.repeat(40),
  workflowRunId: 123,
  observedAt: '2026-09-05T01:00:00.000Z',
  expiresAt: '2026-09-06T01:00:00.000Z',
  observedConcurrentSessions: 3,
  successfulCopilotSessions: 4,
  failedCopilotSessions: 0,
  allSessionsNoTool: true,
  repositorySideEffects: 0,
  providerSideEffects: 0,
  authority: false,
};

test('Free mode remains bounded and subtracts active leases', () => {
  const runtime = discoverRuntimeCapabilities(freeMode, {});
  const result = calculateDynamicSafeBuildCapacity({
    mode: freeMode,
    runtime,
    readyCandidateCount: 4,
    pathIndependentCandidateCount: 4,
    activeLeaseCount: 1,
  });
  assert.equal(runtime.executionProfile, 'FREE');
  assert.equal(result.capacity, 1);
});

test('PRO+ Actions Fabric falls back safely while attestation is pending', () => {
  const runtime = discoverRuntimeCapabilities(
    actionsMode,
    {},
    { state: 'PENDING' },
    Date.parse('2026-09-05T02:00:00Z'),
  );
  const result = calculateDynamicSafeBuildCapacity({
    mode: actionsMode,
    runtime,
    readyCandidateCount: 8,
    pathIndependentCandidateCount: 8,
  });
  assert.equal(runtime.proPlusReady, false);
  assert.equal(runtime.executionProfile, 'FREE_FALLBACK');
  assert.equal(result.capacity, 2);
  assert.ok(result.reasons.includes('PRO_PLUS_ATTESTATION_FALLBACK'));
});

test('fresh measured PRO+ attestation unlocks exactly the observed three safe BUILD slots', () => {
  const runtime = discoverRuntimeCapabilities(
    actionsMode,
    {},
    verifiedAttestation,
    Date.parse('2026-09-05T02:00:00Z'),
  );
  const result = calculateDynamicSafeBuildCapacity({
    mode: actionsMode,
    runtime,
    readyCandidateCount: 7,
    pathIndependentCandidateCount: 6,
  });
  assert.equal(runtime.proPlusReady, true);
  assert.equal(runtime.executionProfile, 'PRO_PLUS');
  assert.equal(runtime.isolatedSessionCapacity, 3);
  assert.equal(runtime.attestationSource, 'SUPPLIED');
  assert.equal(result.capacity, 3);
});

test('live main Reality Gate artifact is preferred over the committed bootstrap attestation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'aurora-proplus-'));
  try {
    const canonicalPath = join(directory, 'canonical.json');
    const livePath = join(directory, 'live.json');
    writeFileSync(
      canonicalPath,
      JSON.stringify({ ...verifiedAttestation, workflowRunId: 100, observedConcurrentSessions: 3 }),
    );
    writeFileSync(
      livePath,
      JSON.stringify({
        ...verifiedAttestation,
        workflowRunId: 200,
        candidateSha: 'b'.repeat(40),
        observedConcurrentSessions: 4,
      }),
    );
    const mode = {
      ...actionsMode,
      runtimeCapabilityDiscovery: {
        ...actionsMode.runtimeCapabilityDiscovery,
        attestationPath: canonicalPath,
      },
    };
    const runtime = discoverRuntimeCapabilities(
      mode,
      { AURORA_RUNTIME_ATTESTATION_FILE: livePath },
      null,
      Date.parse('2026-09-05T02:00:00Z'),
    );
    assert.equal(runtime.proPlusReady, true);
    assert.equal(runtime.attestationSource, 'LIVE_MAIN_ARTIFACT');
    assert.equal(runtime.isolatedSessionCapacity, 3);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('missing or unreadable live artifact falls back to the canonical attestation file', () => {
  const directory = mkdtempSync(join(tmpdir(), 'aurora-proplus-'));
  try {
    const canonicalPath = join(directory, 'canonical.json');
    writeFileSync(canonicalPath, JSON.stringify(verifiedAttestation));
    const mode = {
      ...actionsMode,
      runtimeCapabilityDiscovery: {
        ...actionsMode.runtimeCapabilityDiscovery,
        attestationPath: canonicalPath,
      },
    };
    const runtime = discoverRuntimeCapabilities(
      mode,
      { AURORA_RUNTIME_ATTESTATION_FILE: join(directory, 'missing.json') },
      null,
      Date.parse('2026-09-05T02:00:00Z'),
    );
    assert.equal(runtime.proPlusReady, true);
    assert.equal(runtime.attestationSource, 'CANONICAL_FILE');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('expired or tampered PRO+ attestation automatically returns to Free fallback', () => {
  const expired = { ...verifiedAttestation, expiresAt: '2026-09-05T01:30:00.000Z' };
  const runtime = discoverRuntimeCapabilities(
    actionsMode,
    {},
    expired,
    Date.parse('2026-09-05T02:00:00Z'),
  );
  assert.equal(runtime.proPlusReady, false);
  assert.equal(runtime.executionProfile, 'FREE_FALLBACK');
  assert.equal(runtime.isolatedSessionCapacity, 2);
});

test('legacy cloud mode still fails closed when full external capability is not proven', () => {
  const mode = { mode: 'PRO_PLUS_CLOUD_AGENT', cloudAgentEnabled: true, physicalBuildSlots: 8 };
  const runtime = discoverRuntimeCapabilities(mode, {
    AURORA_CLOUD_AGENT_AVAILABLE: 'true',
    AURORA_ACCOUNT_PLAN: 'pro_plus',
  });
  assert.equal(runtime.executionAvailable, false);
});

test('active semantic and path leases defer colliding writers', () => {
  const tasks = [
    { id: 'A', allowedPaths: ['services/a/**'], sharedWriteSurfaces: ['surface:device'] },
    { id: 'B', allowedPaths: ['services/b/**'], sharedWriteSurfaces: ['surface:device'] },
    { id: 'C', allowedPaths: ['services/c/**'], sharedWriteSurfaces: ['surface:other'] },
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
  assert.equal(result.eligible[0].task.id, 'C');
  assert.equal(result.deferred[0].reason, 'ACTIVE_SHARED_WRITE_LEASE');
});

test('development telemetry remains operational evidence and exposes attestation provenance', () => {
  const runtime = discoverRuntimeCapabilities(
    actionsMode,
    {},
    verifiedAttestation,
    Date.parse('2026-09-05T02:00:00Z'),
  );
  const telemetry = buildProPlusDevelopmentTelemetry({
    runtime,
    capacity: { capacity: 3 },
    activeLeases: [{ taskId: 'A' }],
    selected: [{ task: { id: 'B' } }],
    deferred: [{ taskId: 'C' }],
  });
  assert.equal(telemetry.canonicalAuthority, false);
  assert.equal(telemetry.authorityElevationViolations, 0);
  assert.equal(telemetry.executionProfile, 'PRO_PLUS');
  assert.equal(telemetry.attestationSource, 'SUPPLIED');
  assert.equal(telemetry.buildCapacityUtilizationBps, 3333);
});
