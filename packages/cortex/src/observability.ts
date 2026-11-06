export const CORTEX_UI_EVENT_NAMES = [
  'CORTEX_ROUTE_CHANGED',
  'CORTEX_INSPECTOR_OPENED',
  'CORTEX_INSPECTOR_CLOSED',
  'CORTEX_SEARCH_PERFORMED',
  'CORTEX_COMMAND_PALETTE_OPENED',
  'CORTEX_SEMANTIC_ZOOM_CHANGED',
  'CORTEX_DATA_STATE_CHANGED',
  'CORTEX_ERROR_BOUNDARY_TRIGGERED',
] as const;
export type CortexUiEventName = (typeof CORTEX_UI_EVENT_NAMES)[number];

export interface CortexUiObservation {
  readonly name: CortexUiEventName;
  readonly observedAt: string;
  readonly correlationId?: string;
  readonly entityId?: string;
  readonly route?: string;
  readonly authorizesExecution: false;
  readonly provesExecutionSuccess: false;
  readonly retryAuthorized: false;
}

export function createCortexUiObservation(
  name: CortexUiEventName,
  observedAt: string,
  fields: Readonly<{ correlationId?: string; entityId?: string; route?: string }> = {},
): CortexUiObservation {
  if (!Number.isFinite(Date.parse(observedAt))) throw new Error('CORTEX_OBSERVATION_TIME_INVALID');
  return {
    name,
    observedAt,
    ...(fields.correlationId === undefined ? {} : { correlationId: fields.correlationId }),
    ...(fields.entityId === undefined ? {} : { entityId: fields.entityId }),
    ...(fields.route === undefined ? {} : { route: fields.route }),
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}
