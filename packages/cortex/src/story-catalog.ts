import { CORTEX_VIEW_STATES } from './contracts.js';
import type { CortexRoute, CortexViewState } from './contracts.js';
import { resolveAdaptiveLayout } from './model.js';
import type { CortexAdaptiveLayout } from './model.js';

export interface CortexStoryViewport {
  readonly id: 'compact' | 'tablet' | 'expanded';
  readonly widthPx: number;
  readonly expectedLayout: CortexAdaptiveLayout;
}

export interface CortexStoryCase {
  readonly id: string;
  readonly route: CortexRoute;
  readonly state: CortexViewState;
  readonly viewport: CortexStoryViewport;
  readonly usesMockData: true;
  readonly physicalEvidence: false;
  readonly authorizesExecution: false;
}

export const CORTEX_STORY_VIEWPORTS: readonly CortexStoryViewport[] = [
  { id: 'compact', widthPx: 600, expectedLayout: 'COMPACT' },
  { id: 'tablet', widthPx: 960, expectedLayout: 'MEDIUM' },
  { id: 'expanded', widthPx: 1366, expectedLayout: 'EXPANDED' },
];

export function createCortexStoryCatalog(): readonly CortexStoryCase[] {
  return CORTEX_STORY_VIEWPORTS.flatMap((viewport) =>
    CORTEX_VIEW_STATES.map((state) => ({
      id: `overview.${state.toLocaleLowerCase('en-US')}.${viewport.id}`,
      route: 'OVERVIEW' as const,
      state,
      viewport,
      usesMockData: true as const,
      physicalEvidence: false as const,
      authorizesExecution: false as const,
    })),
  );
}

export function validateCortexStoryCatalog(cases: readonly CortexStoryCase[]): void {
  const ids = new Set<string>();
  for (const story of cases) {
    if (ids.has(story.id)) throw new Error('CORTEX_STORY_DUPLICATE_ID');
    ids.add(story.id);
    if (story.physicalEvidence !== false || story.authorizesExecution !== false) {
      throw new Error('CORTEX_STORY_AUTHORITY_BOUNDARY_VIOLATION');
    }
    if (resolveAdaptiveLayout(story.viewport.widthPx) !== story.viewport.expectedLayout) {
      throw new Error('CORTEX_STORY_VIEWPORT_MISMATCH');
    }
  }
}
