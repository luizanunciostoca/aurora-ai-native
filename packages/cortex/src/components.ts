import { liveRegionForState } from './accessibility.js';
import type {
  CortexEntitySummary,
  CortexRoute,
  CortexSnapshot,
  CortexTimelineEvent,
  CortexViewState,
} from './contracts.js';
import { rankCommands, resolveSemanticZoom, searchCortexDocuments } from './model.js';

export interface CortexNavigationItemModel {
  readonly route: CortexRoute;
  readonly labelRef: string;
  readonly active: boolean;
}

export function createGlobalNavigationModel(
  activeRoute: CortexRoute,
): readonly CortexNavigationItemModel[] {
  return [
    { route: 'OVERVIEW', labelRef: 'cortex.nav.overview', active: activeRoute === 'OVERVIEW' },
    { route: 'TIMELINE', labelRef: 'cortex.nav.timeline', active: activeRoute === 'TIMELINE' },
    { route: 'SEARCH', labelRef: 'cortex.nav.search', active: activeRoute === 'SEARCH' },
    { route: 'SYSTEM', labelRef: 'cortex.nav.system', active: activeRoute === 'SYSTEM' },
  ];
}

export interface CortexInspectorModel {
  readonly open: boolean;
  readonly entity?: CortexEntitySummary;
  readonly titleRef: string;
  readonly closeLabelRef: string;
}

export function createInspectorModel(
  entities: readonly CortexEntitySummary[],
  selectedEntityId?: string,
): CortexInspectorModel {
  const entity =
    selectedEntityId === undefined
      ? undefined
      : entities.find((item) => item.id === selectedEntityId);
  return {
    open: entity !== undefined,
    ...(entity === undefined ? {} : { entity }),
    titleRef: 'cortex.inspector.title',
    closeLabelRef: 'cortex.inspector.close',
  };
}

export function createTimelineModel(
  events: readonly CortexTimelineEvent[],
): readonly CortexTimelineEvent[] {
  return [...events].sort((left, right) => {
    const timeDifference = Date.parse(right.occurredAt) - Date.parse(left.occurredAt);
    return timeDifference === 0 ? left.id.localeCompare(right.id) : timeDifference;
  });
}

export function createCommandPaletteModel(snapshot: CortexSnapshot, query: string) {
  return {
    query,
    results: rankCommands(snapshot.commands, query),
    emptyMessageRef: 'cortex.commandPalette.empty',
    executionBoundary: 'PREBUILD_NON_AUTHORITATIVE' as const,
  };
}

export function createGlobalSearchModel(snapshot: CortexSnapshot, query: string) {
  return {
    query,
    results: searchCortexDocuments(snapshot.searchDocuments, query),
    emptyMessageRef: 'cortex.search.empty',
  };
}

export function createSemanticZoomModel(scale: number) {
  return {
    scale,
    level: resolveSemanticZoom(scale),
    labelRef: 'cortex.semanticZoom.level',
  };
}

export function createStateSurfaceModel(state: CortexViewState) {
  const suffix = state.toLocaleLowerCase('en-US');
  return {
    state,
    titleRef: `cortex.state.${suffix}.title`,
    messageRef: `cortex.state.${suffix}.message`,
    liveRegion: liveRegionForState(state),
  };
}
