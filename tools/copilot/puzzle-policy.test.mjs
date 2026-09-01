import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSpeculationDepth,
  canMaterializePatchPrebuild,
  classifyPuzzleTask,
  compactPuzzleSummary,
  selectPuzzleFrontiers,
} from './puzzle-policy.mjs';

function task(id, dependsOn = [], overrides = {}) {
  return {
    id,
    wave: id.slice(0, 3),
    dependsOn,
    dispatchPriority: 0,
    allowedPaths: [],
    prebuildAllowedPaths: [],
    sharedWriteSurfaces: [],
    prebuildPolicy: 'READINESS_ONLY',
    readinessPolicy: 'READ_ONLY_WHILE_BLOCKED',
    speculationBudget: 32,
    integrationPoints: [],
    ...overrides,
  };
}

const defaultConfig = {
  physicalBuildSlots: 1,
  maxLogicalLanes: 8,
  maxPrebuildArtifactLanes: 4,
};

test('downstream work can occupy logical lanes while canonical BUILD remains dependency-gated', () => {
  const tasks = [
    task('W03-A'),
    task('W03-B', ['W03-A']),
    task('W03-C', ['W03-B']),
    task('W03-D', ['W03-C']),
    task('W03-E', ['W03-D']),
  ];
  const accepted = new Set(['W03-A']);
  const result = selectPuzzleFrontiers(tasks, accepted, defaultConfig);
  const summary = compactPuzzleSummary(result);

  assert.deepEqual(summary.buildFrontier.map((entry) => entry.taskId), ['W03-B']);
  assert.deepEqual(
    summary.logicalFrontier.map((entry) => entry.taskId),
    ['W03-C', 'W03-D', 'W03-E'],
  );
  assert.equal(summary.stateCounts.BUILD_READY, 1);
  assert.equal(summary.stateCounts.READINESS, 3);
});

test('future wave coordination seeds are kept visible even when their speculation depth is larger', () => {
  const tasks = [
    task('W03-F'),
    task('W04-00', ['W03-F'], { prebuildPolicy: 'GOVERNANCE_ARTIFACT' }),
    task('W04-A', ['W04-00']),
    task('W05-00', ['W04-A'], { prebuildPolicy: 'GOVERNANCE_ARTIFACT' }),
    task('W05-A', ['W05-00']),
  ];
  const accepted = new Set();
  const result = selectPuzzleFrontiers(tasks, accepted, {
    physicalBuildSlots: 1,
    maxLogicalLanes: 4,
    maxPrebuildArtifactLanes: 4,
  });

  assert.deepEqual(
    result.logical.slice(0, 2).map((entry) => entry.task.id),
    ['W04-00', 'W05-00'],
  );
  assert.equal(result.logical[0].state, 'PREBUILD');
  assert.equal(result.logical[1].state, 'PREBUILD');
});

test('ISOLATED_PATCH prebuild fails closed without an explicit path fence', () => {
  const tasks = [task('W03-A'), task('W04-A', ['W03-A'], { prebuildPolicy: 'ISOLATED_PATCH' })];
  const accepted = new Set();
  const depths = buildSpeculationDepth(tasks, accepted);

  assert.equal(canMaterializePatchPrebuild(tasks[1]), false);
  assert.equal(classifyPuzzleTask(tasks[1], accepted, depths), 'BLOCKED');
});

test('speculative patch lanes with overlapping paths cannot run together', () => {
  const tasks = [
    task('W03-A'),
    task('W04-A', ['W03-A'], {
      prebuildPolicy: 'ISOLATED_PATCH',
      prebuildAllowedPaths: ['packages/control/src/**'],
    }),
    task('W04-B', ['W03-A'], {
      prebuildPolicy: 'ISOLATED_PATCH',
      prebuildAllowedPaths: ['packages/control/src/graph/**'],
    }),
  ];
  const result = selectPuzzleFrontiers(tasks, new Set(), {
    physicalBuildSlots: 1,
    maxLogicalLanes: 8,
    maxPrebuildArtifactLanes: 8,
  });

  const patchLogical = result.logical.filter((entry) => entry.state === 'PREBUILD');
  assert.equal(patchLogical.length, 1);
  assert.equal(result.logicalDeferred.length, 1);
  assert.equal(result.logicalDeferred[0].reason, 'SPECULATIVE_PATH_OVERLAP');
});

test('logical lane capacity can exceed physical BUILD capacity without widening authority', () => {
  const tasks = [
    task('W03-A'),
    task('W03-B'),
    task('W04-00', ['W03-A'], { prebuildPolicy: 'GOVERNANCE_ARTIFACT' }),
    task('W04-A', ['W04-00']),
    task('W05-00', ['W04-A'], { prebuildPolicy: 'GOVERNANCE_ARTIFACT' }),
    task('W05-A', ['W05-00']),
    task('W06-00', ['W05-A'], { prebuildPolicy: 'GOVERNANCE_ARTIFACT' }),
  ];
  const result = selectPuzzleFrontiers(tasks, new Set(), {
    physicalBuildSlots: 1,
    maxLogicalLanes: 6,
    maxPrebuildArtifactLanes: 3,
  });

  assert.equal(result.buildFrontier.selected.length, 1);
  assert.ok(result.logical.length > result.buildFrontier.selected.length);
  assert.equal(result.buildFrontier.selected[0].task.id, 'W03-A');
});