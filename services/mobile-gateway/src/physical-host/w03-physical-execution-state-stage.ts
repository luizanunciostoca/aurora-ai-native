import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { ActionIntentId, ExecutionId, TenantId } from '@aurora/contracts/ids';

import type { W03ContainmentStoredState } from './w03-containment-state-write.js';
import type { W03SyncSqlExecutor } from './w03-postgres-reservations.js';

const TENANT_ID = /^ten_[0-9A-HJKMNP-TV-Z]{26}$/u;
const ACTION_INTENT_ID = /^act_[0-9A-HJKMNP-TV-Z]{26}$/u;
const EXECUTION_ID = /^exe_[0-9A-HJKMNP-TV-Z]{26}$/u;
const CIRCUIT_KEY = /^[A-Za-z0-9._:/+-]{1,180}$/u;

const STAGE_SQL = String.raw`
WITH lock_scope AS (
  SELECT pg_advisory_xact_lock(
    hashtextextended(:'tenant_id' || ':' || :'action_intent_id' || ':' || :'execution_ref', 0)
  )
), attempt_insert AS (
  INSERT INTO w03_execution_attempt_quota (
    tenant_id, action_intent_id, execution_ref, attempt_number, max_attempts,
    quota_limit, quota_used, version, created_at, updated_at
  )
  SELECT
    :'tenant_id', :'action_intent_id', :'execution_ref',
    (:'attempt_number')::integer, (:'max_attempts')::integer,
    CASE WHEN :'quota_limit' = '-' THEN NULL ELSE (:'quota_limit')::integer END,
    CASE WHEN :'quota_used' = '-' THEN NULL ELSE (:'quota_used')::integer END,
    1,
    to_timestamp((:'updated_at_ms')::double precision / 1000.0),
    to_timestamp((:'updated_at_ms')::double precision / 1000.0)
  FROM lock_scope
  ON CONFLICT (tenant_id, action_intent_id, execution_ref) DO NOTHING
  RETURNING 1
), containment_insert AS (
  INSERT INTO w03_execution_containment (
    tenant_id, circuit_key, version, circuit_state, consecutive_failures, opened_at,
    kill_switch_state, kill_switch_changed_at, dependency_health, cancellation_requested,
    current_in_flight, max_in_flight, retry_depth, max_retry_depth, updated_at
  )
  SELECT
    :'tenant_id', :'circuit_key', 1, :'circuit_state', (:'consecutive_failures')::integer,
    CASE WHEN :'opened_at_ms' = '-' THEN NULL
         ELSE to_timestamp((:'opened_at_ms')::double precision / 1000.0) END,
    :'kill_switch_state',
    to_timestamp((:'kill_switch_changed_at_ms')::double precision / 1000.0),
    :'dependency_health', (:'cancellation_requested')::boolean,
    (:'current_in_flight')::integer, (:'max_in_flight')::integer,
    (:'retry_depth')::integer, (:'max_retry_depth')::integer,
    to_timestamp((:'updated_at_ms')::double precision / 1000.0)
  FROM lock_scope
  ON CONFLICT (tenant_id, circuit_key) DO NOTHING
  RETURNING 1
)
SELECT
  CASE
    WHEN EXISTS (SELECT 1 FROM attempt_insert) THEN 'STAGED'
    ELSE 'ATTEMPT_EXISTS'
  END,
  CASE
    WHEN EXISTS (SELECT 1 FROM containment_insert) THEN 'CONTAINMENT_INITIALIZED'
    ELSE 'CONTAINMENT_EXISTS'
  END;
`.trim();

export interface W15JPhysicalExecutionStateSeed {
  readonly tenantId: TenantId;
  readonly actionIntentId: ActionIntentId;
  /** Canonical server-preissued execution id used as the durable executionRef. */
  readonly executionRef: ExecutionId;
  readonly attemptNumber: number;
  readonly maxAttempts: number;
  readonly quota?: Readonly<{ readonly limit: number; readonly used: number }>;
  readonly circuitKey: string;
  readonly containment: W03ContainmentStoredState;
  readonly updatedAt: Rfc3339Timestamp;
  readonly authorizesExecution: false;
}

export type W15JPhysicalExecutionStateStageResult =
  | Readonly<{
      ok: true;
      disposition: 'STAGED';
      containmentDisposition: 'INITIALIZED' | 'EXISTING';
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>
  | Readonly<{
      ok: false;
      code: 'ATTEMPT_ALREADY_EXISTS' | 'MALFORMED' | 'UNAVAILABLE';
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

function containmentVariables(
  state: W03ContainmentStoredState,
  updatedAtMs: number,
): Record<string, string> | null {
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
    killChangedAtMs > updatedAtMs ||
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
  code: Extract<W15JPhysicalExecutionStateStageResult, { ok: false }>['code'],
): W15JPhysicalExecutionStateStageResult {
  return {
    ok: false,
    code,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

/**
 * Server-only LOCAL staging adapter. It is never mounted on 8080/8081.
 *
 * Every attempt/quota and containment value is explicit input from trusted composition. The method
 * does not fabricate a healthy/default snapshot, grant execution authority, prove an outcome, or
 * authorize retry. Re-staging an existing execution is rejected rather than silently resetting its
 * current attempt counter.
 */
export class W03PostgresPhysicalExecutionStateStager {
  readonly #sql: W03SyncSqlExecutor;

  constructor(sql: W03SyncSqlExecutor) {
    this.#sql = sql;
  }

  stage(input: W15JPhysicalExecutionStateSeed): W15JPhysicalExecutionStateStageResult {
    const updatedAtMs = timestampMs(input.updatedAt);
    const containment = updatedAtMs === null ? null : containmentVariables(input.containment, updatedAtMs);
    if (
      !TENANT_ID.test(input.tenantId) ||
      !ACTION_INTENT_ID.test(input.actionIntentId) ||
      !EXECUTION_ID.test(input.executionRef) ||
      !CIRCUIT_KEY.test(input.circuitKey) ||
      !positive(input.attemptNumber) ||
      !positive(input.maxAttempts) ||
      updatedAtMs === null ||
      containment === null ||
      input.authorizesExecution !== false
    ) {
      return failure('MALFORMED');
    }
    if (
      input.quota !== undefined &&
      (!positive(input.quota.limit) || !nonNegative(input.quota.used))
    ) {
      return failure('MALFORMED');
    }
    let output: string;
    try {
      output = this.#sql.query({
        sql: STAGE_SQL,
        variables: {
          tenant_id: input.tenantId,
          action_intent_id: input.actionIntentId,
          execution_ref: input.executionRef,
          attempt_number: String(input.attemptNumber),
          max_attempts: String(input.maxAttempts),
          quota_limit: input.quota === undefined ? '-' : String(input.quota.limit),
          quota_used: input.quota === undefined ? '-' : String(input.quota.used),
          circuit_key: input.circuitKey,
          updated_at_ms: String(updatedAtMs),
          ...containment,
        },
      });
    } catch {
      return failure('UNAVAILABLE');
    }
    const lines = output.trim().split(/\r?\n/u).filter(Boolean);
    if (lines.length !== 1) return failure('UNAVAILABLE');
    const fields = lines[0]?.split('\t') ?? [];
    if (fields.length !== 2) return failure('UNAVAILABLE');
    const [attemptDisposition, containmentDisposition] = fields;
    if (attemptDisposition === 'ATTEMPT_EXISTS') return failure('ATTEMPT_ALREADY_EXISTS');
    if (
      attemptDisposition !== 'STAGED' ||
      (containmentDisposition !== 'CONTAINMENT_INITIALIZED' &&
        containmentDisposition !== 'CONTAINMENT_EXISTS')
    ) {
      return failure('UNAVAILABLE');
    }
    return {
      ok: true,
      disposition: 'STAGED',
      containmentDisposition:
        containmentDisposition === 'CONTAINMENT_INITIALIZED' ? 'INITIALIZED' : 'EXISTING',
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    };
  }
}
