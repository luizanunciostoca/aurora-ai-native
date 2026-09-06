import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { TenantId } from '@aurora/contracts/ids';

import type { W03SyncSqlExecutor } from './w03-postgres-reservations.js';

const TENANT_ID = /^ten_[0-9A-HJKMNP-TV-Z]{26}$/u;
const CIRCUIT_KEY = /^[A-Za-z0-9._:/+-]{1,180}$/u;

const INITIALIZE_SQL = String.raw`
WITH inserted AS (
  INSERT INTO w03_execution_containment (
    tenant_id, circuit_key, version, circuit_state, consecutive_failures, opened_at,
    kill_switch_state, kill_switch_changed_at, dependency_health, cancellation_requested,
    current_in_flight, max_in_flight, retry_depth, max_retry_depth, updated_at
  ) VALUES (
    :'tenant_id', :'circuit_key', 1, :'circuit_state', (:'consecutive_failures')::integer,
    CASE WHEN :'opened_at_ms' = '-' THEN NULL
         ELSE to_timestamp((:'opened_at_ms')::double precision / 1000.0) END,
    :'kill_switch_state',
    to_timestamp((:'kill_switch_changed_at_ms')::double precision / 1000.0),
    :'dependency_health', (:'cancellation_requested')::boolean,
    (:'current_in_flight')::integer, (:'max_in_flight')::integer,
    (:'retry_depth')::integer, (:'max_retry_depth')::integer,
    to_timestamp((:'updated_at_ms')::double precision / 1000.0)
  )
  ON CONFLICT (tenant_id, circuit_key) DO NOTHING
  RETURNING version
)
SELECT 'INITIALIZED', version FROM inserted
UNION ALL
SELECT 'EXISTS', version
FROM w03_execution_containment
WHERE tenant_id = :'tenant_id'
  AND circuit_key = :'circuit_key'
  AND NOT EXISTS (SELECT 1 FROM inserted)
LIMIT 1;
`.trim();

const COMPARE_AND_SET_SQL = String.raw`
WITH updated AS (
  UPDATE w03_execution_containment
  SET version = version + 1,
      circuit_state = :'circuit_state',
      consecutive_failures = (:'consecutive_failures')::integer,
      opened_at = CASE WHEN :'opened_at_ms' = '-' THEN NULL
                       ELSE to_timestamp((:'opened_at_ms')::double precision / 1000.0) END,
      kill_switch_state = :'kill_switch_state',
      kill_switch_changed_at = to_timestamp((:'kill_switch_changed_at_ms')::double precision / 1000.0),
      dependency_health = :'dependency_health',
      cancellation_requested = (:'cancellation_requested')::boolean,
      current_in_flight = (:'current_in_flight')::integer,
      max_in_flight = (:'max_in_flight')::integer,
      retry_depth = (:'retry_depth')::integer,
      max_retry_depth = (:'max_retry_depth')::integer,
      updated_at = to_timestamp((:'updated_at_ms')::double precision / 1000.0)
  WHERE tenant_id = :'tenant_id'
    AND circuit_key = :'circuit_key'
    AND version = (:'expected_version')::bigint
    AND updated_at <= to_timestamp((:'updated_at_ms')::double precision / 1000.0)
  RETURNING version
)
SELECT 'UPDATED', version FROM updated
UNION ALL
SELECT 'CONFLICT', version
FROM w03_execution_containment
WHERE tenant_id = :'tenant_id'
  AND circuit_key = :'circuit_key'
  AND NOT EXISTS (SELECT 1 FROM updated)
LIMIT 1;
`.trim();

export interface W03ContainmentStoredState {
  readonly circuit: Readonly<{
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    consecutiveFailures: number;
    openedAt?: Rfc3339Timestamp;
  }>;
  readonly killSwitch: Readonly<{
    state: 'INACTIVE' | 'ACTIVE';
    changedAt: Rfc3339Timestamp;
  }>;
  readonly dependencyHealth: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
  readonly cancellationRequested: boolean;
  readonly currentInFlight: number;
  readonly maxInFlight: number;
  readonly retryDepth: number;
  readonly maxRetryDepth: number;
}

export interface W03ContainmentInitializeRequest {
  readonly tenantId: TenantId;
  readonly circuitKey: string;
  readonly state: W03ContainmentStoredState;
  readonly updatedAt: Rfc3339Timestamp;
  readonly authorizesExecution: false;
}

export interface W03ContainmentCompareAndSetRequest extends W03ContainmentInitializeRequest {
  readonly expectedVersion: number;
}

export type W03ContainmentWriteResult =
  | Readonly<{
      ok: true;
      disposition: 'INITIALIZED' | 'UPDATED';
      version: number;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>
  | Readonly<{
      ok: false;
      code: 'ALREADY_EXISTS' | 'VERSION_CONFLICT' | 'NOT_FOUND' | 'MALFORMED' | 'UNAVAILABLE';
      currentVersion?: number;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>;

function timestampMs(value: unknown): number | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) return null;
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed) || new Date(parsed).toISOString() !== value) return null;
  return parsed;
}

function nonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

function stateVariables(state: W03ContainmentStoredState): Record<string, string> | null {
  const killChangedAtMs = timestampMs(state.killSwitch.changedAt);
  const openedAtMs =
    state.circuit.openedAt === undefined ? null : timestampMs(state.circuit.openedAt);
  if (
    (state.circuit.state !== 'CLOSED' &&
      state.circuit.state !== 'OPEN' &&
      state.circuit.state !== 'HALF_OPEN') ||
    !nonNegative(state.circuit.consecutiveFailures) ||
    (state.circuit.state === 'OPEN' ? openedAtMs === null : openedAtMs !== null) ||
    (state.killSwitch.state !== 'ACTIVE' && state.killSwitch.state !== 'INACTIVE') ||
    killChangedAtMs === null ||
    (state.dependencyHealth !== 'HEALTHY' &&
      state.dependencyHealth !== 'DEGRADED' &&
      state.dependencyHealth !== 'UNAVAILABLE') ||
    typeof state.cancellationRequested !== 'boolean' ||
    !nonNegative(state.currentInFlight) ||
    !positive(state.maxInFlight) ||
    state.currentInFlight > state.maxInFlight ||
    !nonNegative(state.retryDepth) ||
    !nonNegative(state.maxRetryDepth) ||
    state.retryDepth > state.maxRetryDepth
  ) {
    return null;
  }
  return {
    circuit_state: state.circuit.state,
    consecutive_failures: String(state.circuit.consecutiveFailures),
    opened_at_ms: openedAtMs === null ? '-' : String(openedAtMs),
    kill_switch_state: state.killSwitch.state,
    kill_switch_changed_at_ms: String(killChangedAtMs),
    dependency_health: state.dependencyHealth,
    cancellation_requested: state.cancellationRequested ? 'true' : 'false',
    current_in_flight: String(state.currentInFlight),
    max_in_flight: String(state.maxInFlight),
    retry_depth: String(state.retryDepth),
    max_retry_depth: String(state.maxRetryDepth),
  };
}

function failure(
  code: Extract<W03ContainmentWriteResult, { ok: false }>['code'],
  currentVersion?: number,
): W03ContainmentWriteResult {
  return {
    ok: false,
    code,
    ...(currentVersion === undefined ? {} : { currentVersion }),
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

function parseWriteRow(output: string): { disposition: string; version: number } | null {
  const lines = output.trim().split(/\r?\n/u).filter(Boolean);
  if (lines.length !== 1) return null;
  const fields = lines[0]?.split('\t') ?? [];
  if (fields.length !== 2) return null;
  const [disposition, versionRaw] = fields;
  if (disposition === undefined || versionRaw === undefined || !/^[0-9]{1,16}$/u.test(versionRaw)) {
    return null;
  }
  const version = Number(versionRaw);
  return Number.isSafeInteger(version) && version >= 1 ? { disposition, version } : null;
}

function commonVariables(input: W03ContainmentInitializeRequest): Record<string, string> | null {
  if (!TENANT_ID.test(input.tenantId) || !CIRCUIT_KEY.test(input.circuitKey)) return null;
  const updatedAtMs = timestampMs(input.updatedAt);
  const killSwitchChangedAtMs = timestampMs(input.state.killSwitch.changedAt);
  const state = stateVariables(input.state);
  if (
    updatedAtMs === null ||
    killSwitchChangedAtMs === null ||
    state === null ||
    input.authorizesExecution !== false
  ) {
    return null;
  }
  if (killSwitchChangedAtMs > updatedAtMs) return null;
  return {
    tenant_id: input.tenantId,
    circuit_key: input.circuitKey,
    updated_at_ms: String(updatedAtMs),
    ...state,
  };
}

/** W03 persistence adapter; W07 must compute every transition before calling this CAS boundary. */
export class W03PostgresContainmentStateStore {
  readonly #sql: W03SyncSqlExecutor;

  constructor(sql: W03SyncSqlExecutor) {
    this.#sql = sql;
  }

  initialize(input: W03ContainmentInitializeRequest): W03ContainmentWriteResult {
    const variables = commonVariables(input);
    if (variables === null) return failure('MALFORMED');
    let row: ReturnType<typeof parseWriteRow>;
    try {
      row = parseWriteRow(this.#sql.query({ sql: INITIALIZE_SQL, variables }));
    } catch {
      return failure('UNAVAILABLE');
    }
    if (row === null) return failure('UNAVAILABLE');
    if (row.disposition === 'EXISTS') return failure('ALREADY_EXISTS', row.version);
    if (row.disposition !== 'INITIALIZED' || row.version !== 1) return failure('UNAVAILABLE');
    return {
      ok: true,
      disposition: 'INITIALIZED',
      version: 1,
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    };
  }

  compareAndSet(input: W03ContainmentCompareAndSetRequest): W03ContainmentWriteResult {
    const variables = commonVariables(input);
    if (variables === null || !positive(input.expectedVersion)) return failure('MALFORMED');
    let row: ReturnType<typeof parseWriteRow>;
    try {
      row = parseWriteRow(
        this.#sql.query({
          sql: COMPARE_AND_SET_SQL,
          variables: { ...variables, expected_version: String(input.expectedVersion) },
        }),
      );
    } catch {
      return failure('UNAVAILABLE');
    }
    if (row === null) return failure('NOT_FOUND');
    if (row.disposition === 'CONFLICT') return failure('VERSION_CONFLICT', row.version);
    if (row.disposition !== 'UPDATED' || row.version !== input.expectedVersion + 1) {
      return failure('UNAVAILABLE');
    }
    return {
      ok: true,
      disposition: 'UPDATED',
      version: row.version,
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    };
  }
}
