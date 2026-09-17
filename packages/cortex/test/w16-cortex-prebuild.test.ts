// @ts-expect-error -- repository test harness intentionally has no @types/node.
import assert from 'node:assert/strict';
// @ts-expect-error -- repository test harness intentionally has no @types/node.
import test from 'node:test';

import {
  BlockedRuntimeCortexAdapter,
  CORTEX_DEMO_SNAPSHOT,
  MockCortexDataAdapter,
  cortexCssVariables,
  createCommandPaletteModel,
  createGlobalNavigationModel,
  createGlobalSearchModel,
  createInspectorModel,
  createSemanticZoomModel,
  createStateSurfaceModel,
  createTimelineModel,
  liveRegionForState,
  nextRovingIndex,
  parseCortexSnapshot,
  rankCommands,
  reduceCortexLoadModel,
  resolveAdaptiveLayout,
  resolveSemanticZoom,
  searchCortexDocuments,
  toCortexUiError,
} from '../src/index.js';

test('W16 prebuild snapshot validates while preserving non-authority boundaries', () => {
  const parsed = parseCortexSnapshot(CORTEX_DEMO_SNAPSHOT);
  assert.equal(parsed.physicalAcceptance, false);
  assert.equal(parsed.authorizesExecution, false);
  assert.equal(parsed.provesExecutionSuccess, false);
  assert.equal(parsed.retryAuthorized, false);

  assert.throws(
    () => parseCortexSnapshot({ ...CORTEX_DEMO_SNAPSHOT, physicalAcceptance: true }),
    /CORTEX_AUTHORITY_BOUNDARY_VIOLATION/,
  );
  assert.throws(
    () => parseCortexSnapshot({ ...CORTEX_DEMO_SNAPSHOT, authorizesExecution: true }),
    /CORTEX_AUTHORITY_BOUNDARY_VIOLATION/,
  );
});

test('adaptive layout and semantic zoom are deterministic at boundaries', () => {
  assert.equal(resolveAdaptiveLayout(600), 'COMPACT');
  assert.equal(resolveAdaptiveLayout(900), 'MEDIUM');
  assert.equal(resolveAdaptiveLayout(1280), 'EXPANDED');
  assert.equal(resolveSemanticZoom(0.5), 'OVERVIEW');
  assert.equal(resolveSemanticZoom(1), 'CONTEXT');
  assert.equal(resolveSemanticZoom(2), 'DETAIL');
  assert.throws(() => resolveSemanticZoom(0), /CORTEX_ZOOM_INVALID/);
});

test('command palette and global search rank bounded local projections only', () => {
  const commands = rankCommands(CORTEX_DEMO_SNAPSHOT.commands, 'overview');
  assert.equal(commands[0]?.command.id, 'navigate.overview');
  assert.equal(commands[0]?.command.authorizesExecution, false);

  const documents = searchCortexDocuments(CORTEX_DEMO_SNAPSHOT.searchDocuments, 'dp5 gate');
  assert.equal(documents[0]?.document.id, 'doc:dp5');

  const palette = createCommandPaletteModel(CORTEX_DEMO_SNAPSHOT, 'runtime');
  assert.equal(palette.executionBoundary, 'PREBUILD_NON_AUTHORITATIVE');
  assert.equal(palette.results[0]?.command.id, 'preview.runtime-connection');

  const search = createGlobalSearchModel(CORTEX_DEMO_SNAPSHOT, 'planner');
  assert.equal(search.results[0]?.document.id, 'doc:planner');
});

test('headless navigation, inspector, timeline and state surfaces are reusable and accessible', () => {
  const navigation = createGlobalNavigationModel('TIMELINE');
  assert.equal(navigation.filter((item) => item.active).length, 1);
  assert.equal(navigation.find((item) => item.active)?.route, 'TIMELINE');

  const inspector = createInspectorModel(CORTEX_DEMO_SNAPSHOT.entities, 'agent:planner');
  assert.equal(inspector.open, true);
  assert.equal(inspector.entity?.kind, 'AGENT');

  const timeline = createTimelineModel(CORTEX_DEMO_SNAPSHOT.timeline);
  assert.equal(timeline[0]?.id, 'event:prebuild-ready');

  const offline = createStateSurfaceModel('OFFLINE');
  assert.equal(offline.liveRegion, 'assertive');
  assert.equal(liveRegionForState('READY'), 'off');
});

test('keyboard roving focus wraps without trapping the user', () => {
  assert.equal(nextRovingIndex(0, 4, 'ArrowDown', 'VERTICAL'), 1);
  assert.equal(nextRovingIndex(3, 4, 'ArrowDown', 'VERTICAL'), 0);
  assert.equal(nextRovingIndex(0, 4, 'ArrowUp', 'VERTICAL'), 3);
  assert.equal(nextRovingIndex(2, 4, 'Home', 'VERTICAL'), 0);
  assert.equal(nextRovingIndex(1, 4, 'End', 'VERTICAL'), 3);
});

test('load state preserves stale-data awareness across degraded and offline states', () => {
  const ready = reduceCortexLoadModel(
    { state: 'LOADING', hasStaleData: false },
    { type: 'LOAD_SUCCEEDED', snapshot: CORTEX_DEMO_SNAPSHOT },
  );
  assert.equal(ready.state, 'READY');
  const offline = reduceCortexLoadModel(ready, { type: 'NETWORK_OFFLINE' });
  assert.equal(offline.state, 'OFFLINE');
  assert.equal(offline.hasStaleData, true);
  const degraded = reduceCortexLoadModel(offline, { type: 'NETWORK_DEGRADED' });
  assert.equal(degraded.state, 'DEGRADED');
  assert.equal(degraded.hasStaleData, true);
});

test('mock adapter is read-only and runtime adapter remains fail-closed before DP5', async () => {
  const mock = new MockCortexDataAdapter(CORTEX_DEMO_SNAPSHOT);
  const snapshot = await mock.loadSnapshot();
  assert.equal(snapshot.connection, 'MOCK');
  assert.equal((await mock.search('planner'))[0]?.id, 'doc:planner');

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(mock.loadSnapshot(controller.signal), /aborted/i);

  const blocked = new BlockedRuntimeCortexAdapter();
  await assert.rejects(blocked.loadSnapshot(), /CORTEX_RUNTIME_ADAPTER_BLOCKED_BY_W15J_DP5/);
  await assert.rejects(blocked.search('anything'), /CORTEX_RUNTIME_ADAPTER_BLOCKED_BY_W15J_DP5/);
});

test('error boundary projection does not expose raw exception messages', () => {
  const projected = toCortexUiError(new Error('secret-token-should-not-leak'), 'corr-1');
  assert.equal(projected.code, 'UNEXPECTED');
  assert.equal(projected.correlationId, 'corr-1');
  assert.equal(projected.diagnosticKind, 'Error');
  assert.equal(JSON.stringify(projected).includes('secret-token-should-not-leak'), false);
});

test('design tokens expose stable CSS variables and semantic zoom model', () => {
  const css = cortexCssVariables();
  assert.match(css, /--cortex-color-focus:/);
  assert.match(css, /--cortex-space-x4: 16px/);
  assert.equal(createSemanticZoomModel(1.5).level, 'DETAIL');
});
