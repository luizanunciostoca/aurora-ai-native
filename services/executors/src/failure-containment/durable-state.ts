import type { TenantId } from '@aurora/contracts';
import type { Rfc3339Timestamp } from '@aurora/contracts/context';

import type {
  DependencyHealth,
  FailureContainmentSnapshot,
  KillSwitchState,
} from './types.js';

export interface ContainmentStateKey {
  readonly tenantId: TenantId;
  readonly dependencyId: string;
}

export interface DurableContainmentState {
  readonly key: ContainmentStateKey;
  readonly snapshot: Omit<FailureContainmentSnapshot, 'circuit'> & {
    readonly circuit: Omit<
      FailureContainmentSnapshot['circuit'],
      'halfOpenProbeInFlight' | 'halfOpenProbeActionIntentId'
    >;
  };
  readonly version: number;
  readonly updatedAt: Rfc3339Timestamp;
}

export interface ContainmentQueryResult<Row> {
  readonly rows: readonly Row[];
  readonly rowCount?: number;
}

export interface ContainmentQueryClient {
  query<Row>(text: string, values: readonly unknown[]): Promise<ContainmentQueryResult<Row>>;
}

export type ContainmentStateRead =
  | { readonly status: 'FOUND'; readonly state: DurableContainmentState }
  | { readonly status: 'MISSING' }
  | { readonly status: 'UNAVAILABLE' };

export type ContainmentStateWrite =
  | { readonly status: 'UPDATED'; readonly state: DurableContainmentState }
  | { readonly status: 'STALE' }
  | { readonly status: 'UNAVAILABLE' };

interface ContainmentStateRow {
  readonly tenant_id: string;
  readonly dependency_id: string;
  readonly circuit_state: DurableContainmentState['snapshot']['circuit']['state'];
  readonly consecutive_failures: number;
  readonly opened_at: string | null;
  readonly kill_switch_state: KillSwitchState;
  readonly kill_switch_changed_at: string;
  readonly dependency_health: DependencyHealth;
  readonly cancellation_requested: boolean;
  readonly current_in_flight: number;
  readonly max_in_flight: number;
  readonly retry_depth: number;
  readonly max_retry_depth: number;
  readonly version: number;
  readonly updated_at: string;
}

const READ_STATE_SQL = `
SELECT tenant_id, dependency_id, circuit_state, consecutive_failures, opened_at,
       kill_switch_state, kill_switch_changed_at, dependency_health,
       cancellation_requested, current_in_flight, max_in_flight, retry_depth,
       max_retry_depth, version, updated_at
FROM w03_failure_containment_state
WHERE tenant_id = $1 AND dependency_id = $2`;

function nonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) throw new Error(`${field} must not be empty`);
}

function validCounter(value: number, minimum: number): boolean {
  return Number.isInteger(value) && value >= minimum;
}

function validTimestamp(value: string | null): boolean {
  return (
    value !== null &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) &&
    Number.isFinite(Date.parse(value))
  );
}

function rowToState(
  row: ContainmentStateRow,
  key: ContainmentStateKey,
): DurableContainmentState | undefined {
  if (
    row.tenant_id !== key.tenantId ||
    row.dependency_id !== key.dependencyId ||
    !['CLOSED', 'OPEN', 'HALF_OPEN'].includes(row.circuit_state) ||
    !['INACTIVE', 'ACTIVE'].includes(row.kill_switch_state) ||
    !['HEALTHY', 'DEGRADED', 'UNAVAILABLE'].includes(row.dependency_health) ||
    !validCounter(row.consecutive_failures, 0) ||
    !validCounter(row.current_in_flight, 0) ||
    !validCounter(row.max_in_flight, 1) ||
    !validCounter(row.retry_depth, 0) ||
    !validCounter(row.max_retry_depth, 1) ||
    !validCounter(row.version, 1) ||
    typeof row.cancellation_requested !== 'boolean' ||
    !validTimestamp(row.kill_switch_changed_at) ||
    !validTimestamp(row.updated_at) ||
    (row.opened_at !== null && !validTimestamp(row.opened_at)) ||
    (row.circuit_state === 'OPEN' && row.opened_at === null)
  ) {
    return undefined;
  }

  return {
    key,
    snapshot: {
      circuit: {
        state: row.circuit_state,
        consecutiveFailures: row.consecutive_failures,
        ...(row.opened_at === null ? {} : { openedAt: row.opened_at as Rfc3339Timestamp }),
      },
      killSwitch: {
        state: row.kill_switch_state,
        changedAt: row.kill_switch_changed_at as Rfc3339Timestamp,
      },
      dependencyHealth: row.dependency_health,
      cancellationRequested: row.cancellation_requested,
      currentInFlight: row.current_in_flight,
      maxInFlight: row.max_in_flight,
      retryDepth: row.retry_depth,
      maxRetryDepth: row.max_retry_depth,
    },
    version: row.version,
    updatedAt: row.updated_at as Rfc3339Timestamp,
  };
}

export function readContainmentStateStatement(key: ContainmentStateKey): {
  readonly text: string;
  readonly values: readonly unknown[];
} {
  nonEmpty(key.tenantId, 'tenantId');
  nonEmpty(key.dependencyId, 'dependencyId');
  return { text: READ_STATE_SQL, values: [key.tenantId, key.dependencyId] };
}

export function updateContainmentStateStatement(
  state: DurableContainmentState,
): { readonly text: string; readonly values: readonly unknown[] } {
  nonEmpty(state.key.tenantId, 'tenantId');
  nonEmpty(state.key.dependencyId, 'dependencyId');
  return {
    text: `
UPDATE w03_failure_containment_state
SET circuit_state = $3,
    consecutive_failures = $4,
    opened_at = $5::timestamptz,
    kill_switch_state = $6,
    kill_switch_changed_at = $7::timestamptz,
    dependency_health = $8,
    cancellation_requested = $9,
    current_in_flight = $10,
    max_in_flight = $11,
    retry_depth = $12,
    max_retry_depth = $13,
    version = version + 1,
    updated_at = $14::timestamptz
WHERE tenant_id = $1
  AND dependency_id = $2
  AND version = $15
RETURNING tenant_id, dependency_id, circuit_state, consecutive_failures, opened_at,
          kill_switch_state, kill_switch_changed_at, dependency_health,
          cancellation_requested, current_in_flight, max_in_flight, retry_depth,
          max_retry_depth, version, updated_at`,
    values: [
      state.key.tenantId,
      state.key.dependencyId,
      state.snapshot.circuit.state,
      state.snapshot.circuit.consecutiveFailures,
      state.snapshot.circuit.openedAt ?? null,
      state.snapshot.killSwitch.state,
      state.snapshot.killSwitch.changedAt,
      state.snapshot.dependencyHealth,
      state.snapshot.cancellationRequested,
      state.snapshot.currentInFlight,
      state.snapshot.maxInFlight,
      state.snapshot.retryDepth,
      state.snapshot.maxRetryDepth,
      state.updatedAt,
      state.version,
    ],
  };
}

export class PostgresContainmentStateStore {
  public constructor(private readonly client: ContainmentQueryClient) {}

  public async read(key: ContainmentStateKey): Promise<ContainmentStateRead> {
    try {
      const statement = readContainmentStateStatement(key);
      const result = await this.client.query<ContainmentStateRow>(
        statement.text,
        statement.values,
      );
      const row = result.rows[0];
      if (row === undefined) return { status: 'MISSING' };
      const state = rowToState(row, key);
      return state === undefined
        ? { status: 'UNAVAILABLE' }
        : { status: 'FOUND', state };
    } catch {
      return { status: 'UNAVAILABLE' };
    }
  }

  public async compareAndSet(state: DurableContainmentState): Promise<ContainmentStateWrite> {
    try {
      const statement = updateContainmentStateStatement(state);
      const result = await this.client.query<ContainmentStateRow>(statement.text, statement.values);
      const row = result.rows[0];
      if (row === undefined) return { status: 'STALE' };
      const updated = rowToState(row, state.key);
      return updated === undefined
        ? { status: 'UNAVAILABLE' }
        : { status: 'UPDATED', state: updated };
    } catch {
      return { status: 'UNAVAILABLE' };
    }
  }
}
