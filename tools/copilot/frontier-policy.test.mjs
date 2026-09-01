import assert from 'node:assert/strict';
import { buildDownstreamDepth, selectSafeReadyFrontier } from './frontier-policy.mjs';

const tasks = [
  { id: 'A', dependsOn: [], sharedWriteSurfaces: [] },
  { id: 'B', dependsOn: ['A'], sharedWriteSurfaces: ['surface:b'] },
  { id: 'C', dependsOn: ['A'], sharedWriteSurfaces: ['surface:c'] },
  { id: 'D', dependsOn: ['B', 'C'], sharedWriteSurfaces: ['surface:d'] },
  { id: 'E', dependsOn: ['B', 'C'], sharedWriteSurfaces: ['surface:e'] },
  { id: 'F', dependsOn: ['D', 'E'], sharedWriteSurfaces: [] },
];

const depth = buildDownstreamDepth(tasks);
assert.equal(depth.get('A'), 4);
assert.equal(depth.get('B'), 3);
assert.equal(depth.get('C'), 3);
assert.equal(depth.get('F'), 1);

const parallelCandidates = [
  {
    issue: { number: 2 },
    task: {
      ...tasks[1],
      wave: 'W03',
      laneHint: 'LANE-1',
    },
  },
  {
    issue: { number: 3 },
    task: {
      ...tasks[2],
      wave: 'W03',
      laneHint: 'LANE-2',
    },
  },
];
const parallel = selectSafeReadyFrontier(parallelCandidates, tasks, 2);
assert.deepEqual(
  parallel.selected.map((entry) => entry.task.id),
  ['B', 'C'],
);
assert.equal(parallel.deferred.length, 0);

const conflictingCandidates = [
  {
    issue: { number: 4 },
    task: {
      id: 'X',
      wave: 'W03',
      dependsOn: [],
      sharedWriteSurfaces: ['shared:manifest'],
      dispatchPriority: 10,
    },
  },
  {
    issue: { number: 5 },
    task: {
      id: 'Y',
      wave: 'W03',
      dependsOn: [],
      sharedWriteSurfaces: ['shared:manifest'],
      dispatchPriority: 9,
    },
  },
];
const conflictingTasks = [
  { id: 'X', dependsOn: [] },
  { id: 'Y', dependsOn: [] },
];
const conflicting = selectSafeReadyFrontier(conflictingCandidates, conflictingTasks, 2);
assert.deepEqual(
  conflicting.selected.map((entry) => entry.task.id),
  ['X'],
);
assert.equal(conflicting.deferred[0].reason, 'SHARED_WRITE_SURFACE');
assert.equal(conflicting.deferred[0].surface, 'shared:manifest');

const criticalPathCandidates = [
  {
    issue: { number: 10 },
    task: {
      id: 'SHORT',
      wave: 'W04',
      dependsOn: [],
      sharedWriteSurfaces: [],
    },
  },
  {
    issue: { number: 11 },
    task: {
      id: 'LONG',
      wave: 'W04',
      dependsOn: [],
      sharedWriteSurfaces: [],
    },
  },
];
const criticalPathTasks = [
  { id: 'SHORT', dependsOn: [] },
  { id: 'LONG', dependsOn: [] },
  { id: 'LONG-2', dependsOn: ['LONG'] },
  { id: 'LONG-3', dependsOn: ['LONG-2'] },
];
const criticalPathFirst = selectSafeReadyFrontier(criticalPathCandidates, criticalPathTasks, 1);
assert.equal(criticalPathFirst.selected[0].task.id, 'LONG');
assert.equal(criticalPathFirst.deferred[0].reason, 'PARALLELISM_LIMIT');

console.log('Aurora READY frontier policy tests passed.');
