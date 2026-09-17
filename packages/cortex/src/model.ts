import type {
  CortexCommandDefinition,
  CortexProjectionMetadata,
  CortexProjectionState,
  CortexSearchDocument,
  CortexSemanticZoomLevel,
  CortexSnapshot,
  CortexViewState,
} from './contracts.js';

export type CortexAdaptiveLayout = 'COMPACT' | 'MEDIUM' | 'EXPANDED';

export interface CortexLoadModel {
  readonly state: CortexViewState;
  readonly hasStaleData: boolean;
  readonly lastReadyAt?: string;
  readonly errorCode?: string;
}

export type CortexLoadEvent =
  | Readonly<{ type: 'LOAD_STARTED' }>
  | Readonly<{ type: 'LOAD_SUCCEEDED'; snapshot: CortexSnapshot }>
  | Readonly<{ type: 'LOAD_EMPTY'; observedAt: string }>
  | Readonly<{ type: 'LOAD_FAILED'; errorCode: string }>
  | Readonly<{ type: 'NETWORK_OFFLINE' }>
  | Readonly<{ type: 'NETWORK_DEGRADED' }>;

export interface RankedCommand {
  readonly command: CortexCommandDefinition;
  readonly score: number;
}

export interface RankedSearchResult {
  readonly document: CortexSearchDocument;
  readonly score: number;
}

export function normalizeCortexQuery(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('en-US').trim().replace(/\s+/g, ' ');
}

function queryTokens(value: string): readonly string[] {
  const normalized = normalizeCortexQuery(value);
  return normalized.length === 0 ? [] : normalized.split(' ');
}

export function resolveAdaptiveLayout(widthPx: number): CortexAdaptiveLayout {
  if (!Number.isFinite(widthPx) || widthPx <= 0) throw new Error('CORTEX_VIEWPORT_INVALID');
  if (widthPx < 720) return 'COMPACT';
  if (widthPx < 1120) return 'MEDIUM';
  return 'EXPANDED';
}

export function resolveSemanticZoom(scale: number): CortexSemanticZoomLevel {
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('CORTEX_ZOOM_INVALID');
  if (scale < 0.85) return 'OVERVIEW';
  if (scale < 1.4) return 'CONTEXT';
  return 'DETAIL';
}

export function resolveProjectionState(
  projection: CortexProjectionMetadata,
  now: string,
): CortexProjectionState {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) throw new Error('CORTEX_PROJECTION_NOW_INVALID');
  if (projection.state !== 'CURRENT') return projection.state;
  if (projection.freshnessDeadline === undefined) return 'CURRENT';
  const freshnessDeadlineMs = Date.parse(projection.freshnessDeadline);
  if (!Number.isFinite(freshnessDeadlineMs)) {
    throw new Error('CORTEX_PROJECTION_FRESHNESS_INVALID');
  }
  return nowMs > freshnessDeadlineMs ? 'STALE' : 'CURRENT';
}

function textScore(query: readonly string[], candidates: readonly string[]): number {
  if (query.length === 0) return 0;
  const normalized = candidates.map(normalizeCortexQuery);
  let score = 0;
  for (const token of query) {
    let best = 0;
    for (const candidate of normalized) {
      if (candidate === token) best = Math.max(best, 8);
      else if (candidate.startsWith(token)) best = Math.max(best, 5);
      else if (candidate.includes(token)) best = Math.max(best, 3);
    }
    if (best === 0) return 0;
    score += best;
  }
  return score;
}

function compareRankedCommands(left: RankedCommand, right: RankedCommand): number {
  const scoreDifference = right.score - left.score;
  return scoreDifference !== 0 ? scoreDifference : left.command.id.localeCompare(right.command.id);
}

function compareRankedDocuments(left: RankedSearchResult, right: RankedSearchResult): number {
  const scoreDifference = right.score - left.score;
  return scoreDifference !== 0
    ? scoreDifference
    : left.document.id.localeCompare(right.document.id);
}

export function rankCommands(
  commands: readonly CortexCommandDefinition[],
  query: string,
): readonly RankedCommand[] {
  const tokens = queryTokens(query);
  return commands
    .filter((command) => command.enabled)
    .map((command) => ({
      command,
      score: textScore(tokens, [command.id, command.labelRef, ...command.keywords]),
    }))
    .filter((entry) => tokens.length === 0 || entry.score > 0)
    .sort(compareRankedCommands);
}

export function searchCortexDocuments(
  documents: readonly CortexSearchDocument[],
  query: string,
): readonly RankedSearchResult[] {
  const tokens = queryTokens(query);
  if (tokens.length === 0) return [];
  return documents
    .map((document) => ({
      document,
      score: textScore(tokens, [document.title, ...document.keywords, document.body]),
    }))
    .filter((entry) => entry.score > 0)
    .sort(compareRankedDocuments);
}

export function reduceCortexLoadModel(
  current: CortexLoadModel,
  event: CortexLoadEvent,
): CortexLoadModel {
  switch (event.type) {
    case 'LOAD_STARTED':
      return {
        state: 'LOADING',
        hasStaleData: current.state === 'READY' || current.hasStaleData,
        ...(current.lastReadyAt === undefined ? {} : { lastReadyAt: current.lastReadyAt }),
      };
    case 'LOAD_SUCCEEDED':
      return {
        state: event.snapshot.entities.length === 0 ? 'EMPTY' : event.snapshot.viewState,
        hasStaleData: false,
        lastReadyAt: event.snapshot.generatedAt,
      };
    case 'LOAD_EMPTY':
      return { state: 'EMPTY', hasStaleData: false, lastReadyAt: event.observedAt };
    case 'LOAD_FAILED':
      return {
        state: 'ERROR',
        hasStaleData: current.hasStaleData || current.state === 'READY',
        ...(current.lastReadyAt === undefined ? {} : { lastReadyAt: current.lastReadyAt }),
        errorCode: event.errorCode,
      };
    case 'NETWORK_OFFLINE':
      return {
        state: 'OFFLINE',
        hasStaleData: current.hasStaleData || current.state === 'READY',
        ...(current.lastReadyAt === undefined ? {} : { lastReadyAt: current.lastReadyAt }),
      };
    case 'NETWORK_DEGRADED':
      return {
        state: 'DEGRADED',
        hasStaleData: current.hasStaleData || current.state === 'READY',
        ...(current.lastReadyAt === undefined ? {} : { lastReadyAt: current.lastReadyAt }),
      };
  }
}
