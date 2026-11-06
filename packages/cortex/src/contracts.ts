export const CORTEX_SCHEMA_VERSION = 'w16-prebuild.v1' as const;

export const CORTEX_VIEW_STATES = [
  'LOADING',
  'READY',
  'EMPTY',
  'DEGRADED',
  'OFFLINE',
  'ERROR',
] as const;
export type CortexViewState = (typeof CORTEX_VIEW_STATES)[number];

export const CORTEX_PROJECTION_STATES = [
  'CURRENT',
  'STALE',
  'UNKNOWN',
  'CONFLICT',
  'REVOKED',
  'EXPIRED',
  'UNAVAILABLE',
  'DEGRADED',
] as const;
export type CortexProjectionState = (typeof CORTEX_PROJECTION_STATES)[number];

export const CORTEX_CONNECTION_STATES = ['ONLINE', 'DEGRADED', 'OFFLINE', 'MOCK'] as const;
export type CortexConnectionState = (typeof CORTEX_CONNECTION_STATES)[number];

export const CORTEX_ROUTES = ['OVERVIEW', 'TIMELINE', 'SEARCH', 'SYSTEM'] as const;
export type CortexRoute = (typeof CORTEX_ROUTES)[number];

export const CORTEX_SEMANTIC_ZOOM_LEVELS = ['OVERVIEW', 'CONTEXT', 'DETAIL'] as const;
export type CortexSemanticZoomLevel = (typeof CORTEX_SEMANTIC_ZOOM_LEVELS)[number];

export const CORTEX_ENTITY_KINDS = [
  'AGENT',
  'TASK',
  'WORKFLOW',
  'MEMORY',
  'SOURCE',
  'POLICY',
  'DEVICE',
  'SYSTEM',
] as const;
export type CortexEntityKind = (typeof CORTEX_ENTITY_KINDS)[number];

export interface CortexProjectionMetadata {
  readonly state: CortexProjectionState;
  readonly observedAt?: string;
  readonly freshnessDeadline?: string;
  readonly sourceRefs: readonly string[];
}

export interface CortexEntitySummary {
  readonly id: string;
  readonly kind: CortexEntityKind;
  readonly title: string;
  readonly subtitle?: string;
  readonly status: string;
  readonly updatedAt: string;
}

export interface CortexTimelineEvent {
  readonly id: string;
  readonly occurredAt: string;
  readonly category: string;
  readonly severity: 'INFO' | 'NOTICE' | 'WARNING' | 'CRITICAL';
  readonly title: string;
  readonly detail?: string;
  readonly entityRefs: readonly string[];
  readonly correlationId?: string;
}

export interface CortexSearchDocument {
  readonly id: string;
  readonly entityId?: string;
  readonly title: string;
  readonly body: string;
  readonly keywords: readonly string[];
  readonly route: CortexRoute;
}

export interface CortexCommandDefinition {
  readonly id: string;
  readonly labelRef: string;
  readonly keywords: readonly string[];
  readonly shortcut?: string;
  readonly mode: 'NAVIGATE' | 'PREVIEW_ONLY';
  readonly route?: CortexRoute;
  readonly enabled: boolean;
  readonly authorizesExecution: false;
}

export interface CortexSnapshot {
  readonly schemaVersion: typeof CORTEX_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly connection: CortexConnectionState;
  readonly viewState: CortexViewState;
  readonly entities: readonly CortexEntitySummary[];
  readonly timeline: readonly CortexTimelineEvent[];
  readonly searchDocuments: readonly CortexSearchDocument[];
  readonly commands: readonly CortexCommandDefinition[];
  readonly physicalAcceptance: false;
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
}

export interface CortexUiError {
  readonly code: 'ADAPTER_BLOCKED' | 'LOAD_FAILED' | 'INVALID_SNAPSHOT' | 'UNEXPECTED';
  readonly userMessageRef: string;
  readonly diagnosticKind: string;
  readonly correlationId?: string;
  readonly authorizesExecution: false;
  readonly retryAuthorized: false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, maxLength = 4096): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isTimestamp(value: unknown): value is string {
  return isBoundedString(value, 64) && Number.isFinite(Date.parse(value));
}

function memberOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function isStringArray(value: unknown, maxItems = 64): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => isBoundedString(item, 512))
  );
}

function isEntity(value: unknown): value is CortexEntitySummary {
  if (!isRecord(value)) return false;
  return (
    isBoundedString(value.id, 256) &&
    memberOf(value.kind, CORTEX_ENTITY_KINDS) &&
    isBoundedString(value.title, 512) &&
    (value.subtitle === undefined || isBoundedString(value.subtitle, 1024)) &&
    isBoundedString(value.status, 128) &&
    isTimestamp(value.updatedAt)
  );
}

function isTimelineEvent(value: unknown): value is CortexTimelineEvent {
  if (!isRecord(value)) return false;
  return (
    isBoundedString(value.id, 256) &&
    isTimestamp(value.occurredAt) &&
    isBoundedString(value.category, 128) &&
    memberOf(value.severity, ['INFO', 'NOTICE', 'WARNING', 'CRITICAL'] as const) &&
    isBoundedString(value.title, 512) &&
    (value.detail === undefined || isBoundedString(value.detail, 4096)) &&
    isStringArray(value.entityRefs) &&
    (value.correlationId === undefined || isBoundedString(value.correlationId, 256))
  );
}

function isSearchDocument(value: unknown): value is CortexSearchDocument {
  if (!isRecord(value)) return false;
  return (
    isBoundedString(value.id, 256) &&
    (value.entityId === undefined || isBoundedString(value.entityId, 256)) &&
    isBoundedString(value.title, 512) &&
    isBoundedString(value.body, 8192) &&
    isStringArray(value.keywords) &&
    memberOf(value.route, CORTEX_ROUTES)
  );
}

function isCommand(value: unknown): value is CortexCommandDefinition {
  if (!isRecord(value)) return false;
  return (
    isBoundedString(value.id, 256) &&
    isBoundedString(value.labelRef, 256) &&
    isStringArray(value.keywords) &&
    (value.shortcut === undefined || isBoundedString(value.shortcut, 64)) &&
    memberOf(value.mode, ['NAVIGATE', 'PREVIEW_ONLY'] as const) &&
    (value.route === undefined || memberOf(value.route, CORTEX_ROUTES)) &&
    typeof value.enabled === 'boolean' &&
    value.authorizesExecution === false
  );
}

function boundedArray(value: unknown, maxItems: number): value is readonly unknown[] {
  return Array.isArray(value) && value.length <= maxItems;
}

export function parseCortexSnapshot(input: unknown): CortexSnapshot {
  if (!isRecord(input)) throw new Error('CORTEX_SNAPSHOT_INVALID');
  if (input.schemaVersion !== CORTEX_SCHEMA_VERSION) throw new Error('CORTEX_SCHEMA_UNSUPPORTED');
  if (!isTimestamp(input.generatedAt)) throw new Error('CORTEX_GENERATED_AT_INVALID');
  if (!memberOf(input.connection, CORTEX_CONNECTION_STATES)) {
    throw new Error('CORTEX_CONNECTION_INVALID');
  }
  if (!memberOf(input.viewState, CORTEX_VIEW_STATES)) {
    throw new Error('CORTEX_VIEW_STATE_INVALID');
  }
  if (!boundedArray(input.entities, 2048) || !input.entities.every(isEntity)) {
    throw new Error('CORTEX_ENTITIES_INVALID');
  }
  if (!boundedArray(input.timeline, 4096) || !input.timeline.every(isTimelineEvent)) {
    throw new Error('CORTEX_TIMELINE_INVALID');
  }
  if (
    !boundedArray(input.searchDocuments, 4096) ||
    !input.searchDocuments.every(isSearchDocument)
  ) {
    throw new Error('CORTEX_SEARCH_DOCUMENTS_INVALID');
  }
  if (!boundedArray(input.commands, 256) || !input.commands.every(isCommand)) {
    throw new Error('CORTEX_COMMANDS_INVALID');
  }
  if (
    input.physicalAcceptance !== false ||
    input.authorizesExecution !== false ||
    input.provesExecutionSuccess !== false ||
    input.retryAuthorized !== false
  ) {
    throw new Error('CORTEX_AUTHORITY_BOUNDARY_VIOLATION');
  }
  return input as unknown as CortexSnapshot;
}

export function toCortexUiError(error: unknown, correlationId?: string): CortexUiError {
  const diagnosticKind = error instanceof Error ? error.name : typeof error;
  return {
    code: 'UNEXPECTED',
    userMessageRef: 'cortex.error.unexpected',
    diagnosticKind,
    ...(correlationId === undefined ? {} : { correlationId }),
    authorizesExecution: false,
    retryAuthorized: false,
  };
}
