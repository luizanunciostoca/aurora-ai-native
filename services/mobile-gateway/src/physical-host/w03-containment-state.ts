import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { TenantId } from '@aurora/contracts/ids';

import type { W03SyncSqlExecutor } from './w03-postgres-reservations.js';

const TENANT_ID = /^ten_[0-9A-HJKMNP-TV-Z]{26}$/u;
const CIRCUIT_KEY = /^[A-Za-z0-9._:/+-]{1,180}$/u;
const ACTION_INTENT_ID = /^act_[0-9A-HJKMNP-TV-Z]{26}$/u;

const SELECT_CURRENT_SQL = String.raw`
SELECT
  containment.version,
  containment.circuit_state,
  containment.consecutive_failures,
  COALESCE(floor(extract(epoch FROM containment.opened_at) * 1000)::bigint::text, '-'),
  containment.kill_switch_state,
  floor(extract(epoch FROM containment.kill_switch_changed_at) * 1000)::bigint,
  containment.dependency_health,
  CASE WHEN containment.cancellation_requested THEN '1' ELSE '0' END,
  containment.current_in_flight,
  containment.max_in_flight,
  containment.retry_depth,
  containment.max_retry_depth,
  floor(extract(epoch FROM containment.updated_at) * 1000)::bigint,
  CASE
    WHEN containment.circuit_state = 'HALF_OPEN'
     AND lease.status = 'active'
     AND lease.subject_type = 'w07-half-open-probe'
     AND lease.subject_id = lease.owner_token
     AND lease.expires_at > to_timestamp((:'evaluated_at_ms')::double precision / 1000.0)
    THEN '1'
    ELSE '0'
  END,
  CASE
    WHEN containment.circuit_state = 'HALF_OPEN'
     AND lease.status = 'active'
     AND lease.subject_type = 'w07-half-open-probe'
     AND lease.subject_id = lease.owner_token
     AND lease.expires_at > to_timestamp((:'evaluated_at_ms')::double precision / 1000.0)
    THEN lease.owner_token
    ELSE '-'
  END
FROM w03_execution_containment AS containment
LEFT JOIN w03_lease AS lease
  ON lease.tenant_id = containment.tenant_id
 AND lease.lease_key = :'lease_key'
WHERE containment.tenant_id = :'tenant_id'
  AND containment.circuit_key = :'circuit_key'
LIMIT 1;
`.trim();

export interface W03CurrentContainmentLookup {
  readonly tenantId: TenantId;
  readonly circuitKey: string;
  readonly evaluatedAt: Rfc3339Timestamp;
}

export interface W03CurrentContainmentRecord {
  readonly tenantId: TenantId;
  readonly circuitKey: string;
  readonly version: number;
  readonly updatedAt: Rfc3339Timestamp;
  readonly snapshot: Readonly<{
    circuit: Readonly<{
      state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
      consecutiveFailures: number;
      openedAt?: Rfc3339Timestamp;
      halfOpenProbeInFlight: boolean;
      halfOpenProbeActionIntentId?: string;
    }>;
    killSwitch: Readonly<{
      state: 'INACTIVE' | 'ACTIVE';
      changedAt: Rfc3339Timestamp;
    }>;
    dependencyHealth: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
    cancellationRequested: boolean;
    currentInFlight: number;
    maxInFlight: number;
    retryDepth: number;
    maxRetryDepth: number;
  }>;
  readonly authorizesExecution: false;
}

interface ParsedRow {
  readonly version: number;
  readonly circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  readonly consecutiveFailures: number;
  readonly openedAtMs: number | null;
  readonly killSwitchState: 'INACTIVE' | 'ACTIVE';
  readonly killSwitchChangedAtMs: number;
  readonly dependencyHealth: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';
  readonly cancellationRequested: boolean;
  readonly currentInFlight: number;
  readonly maxInFlight: number;
  readonly retryDepth: number;
  readonly maxRetryDepth: number;
  readonly updatedAtMs: number;
  readonly probeInFlight: boolean;
  readonly probeOwner: string | null;
}

function timestampMs(value: unknown): number | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) return null;
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed) || new Date(parsed).toISOString() !== value) return null;
  return parsed;
}

function integer(value: string | undefined, minimum = 0): number | null {
  if (value === undefined || !/^[0-9]{1,16}$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : null;
}

function parseRow(output: string): ParsedRow | null {
  const lines = output.trim().split(/\r?\n/u).filter(Boolean);
  if (lines.length !== 1) return null;
  const fields = lines[0]?.split('\t') ?? [];
  if (fields.length !== 15) return null;
  const [
    versionRaw,
    circuitState,
    failuresRaw,
    openedAtRaw,
    killSwitchState,
    killChangedRaw,
    dependencyHealth,
    cancellationRaw,
    currentInFlightRaw,
    maxInFlightRaw,
    retryDepthRaw,
    maxRetryDepthRaw,
    updatedAtRaw,
    probeRaw,
    probeOwnerRaw,
  ] = fields;

  const version = integer(versionRaw, 1);
  const consecutiveFailures = integer(failuresRaw);
  const killSwitchChangedAtMs = integer(killChangedRaw);
  const currentInFlight = integer(currentInFlightRaw);
  const maxInFlight = integer(maxInFlightRaw, 1);
  const retryDepth = integer(retryDepthRaw);
  const maxRetryDepth = integer(maxRetryDepthRaw);
  const updatedAtMs = integer(updatedAtRaw);
  const openedAtMs = openedAtRaw === '-' ? null : integer(openedAtRaw);

  if (
    version === null ||
    (circuitState !== 'CLOSED' && circuitState !== 'OPEN' && circuitState !== 'HALF_OPEN') ||
    consecutiveFailures === null ||
    (circuitState === 'OPEN' ? openedAtMs === null : openedAtMs !== null) ||
    (killSwitchState !== 'INACTIVE' && killSwitchState !== 'ACTIVE') ||
    killSwitchChangedAtMs === null ||
    (dependencyHealth !== 'HEALTHY' &&
      dependencyHealth !== 'DEGRADED' &&
      dependencyHealth !== 'UNAVAILABLE') ||
    (cancellationRaw !== '0' && cancellationRaw !== '1') ||
    currentInFlight === null ||
    maxInFlight === null ||
    currentInFlight > maxInFlight ||
    retryDepth === null ||
    maxRetryDepth === null ||
    retryDepth > maxRetryDepth ||
    updatedAtMs === null ||
    (probeRaw !== '0' && probeRaw !== '1')
  ) {
    return null;
  }

  const probeInFlight = probeRaw === '1';
  const probeOwner = probeInFlight ? probeOwnerRaw : null;
  if (
    (probeInFlight &&
      (circuitState !== 'HALF_OPEN' ||
        typeof probeOwner !== 'string' ||
        !ACTION_INTENT_ID.test(probeOwner))) ||
    (!probeInFlight && probeOwnerRaw !== '-')
  ) {
    return null;
  }

  return {
    version,
    circuitState,
    consecutiveFailures,
    openedAtMs,
    killSwitchState,
    killSwitchChangedAtMs,
    dependencyHealth,
    cancellationRequested: cancellationRaw === '1',
    currentInFlight,
    maxInFlight,
    retryDepth,
    maxRetryDepth,
    updatedAtMs,
    probeInFlight,
    probeOwner,
  };
}

/**
 * LOCAL/W03 current containment read adapter.
 *
 * The current state row is read from `w03_execution_containment`; HALF_OPEN exclusive probe
 * ownership is projected only from the canonical unexpired `w03_lease` fence. The adapter does not
 * evaluate W07-G transitions and never grants execution authority, outcome, or retry permission.
 */
export class W03PostgresCurrentContainmentStateSource {
  readonly #sql: W03SyncSqlExecutor;

  constructor(sql: W03SyncSqlExecutor) {
    this.#sql = sql;
  }

  resolveCurrent(input: W03CurrentContainmentLookup): W03CurrentContainmentRecord | null {
    if (!TENANT_ID.test(input.tenantId) || !CIRCUIT_KEY.test(input.circuitKey)) return null;
    const evaluatedAtMs = timestampMs(input.evaluatedAt);
    if (evaluatedAtMs === null) return null;

    let parsed: ParsedRow | null;
    try {
      parsed = parseRow(
        this.#sql.query({
          sql: SELECT_CURRENT_SQL,
          variables: {
            tenant_id: input.tenantId,
            circuit_key: input.circuitKey,
            lease_key: `w07g:half-open:${input.circuitKey}`,
            evaluated_at_ms: String(evaluatedAtMs),
          },
        }),
      );
    } catch {
      return null;
    }
    if (parsed === null || parsed.updatedAtMs > evaluatedAtMs) return null;

    return {
      tenantId: input.tenantId,
      circuitKey: input.circuitKey,
      version: parsed.version,
      updatedAt: new Date(parsed.updatedAtMs).toISOString() as Rfc3339Timestamp,
      snapshot: {
        circuit: {
          state: parsed.circuitState,
          consecutiveFailures: parsed.consecutiveFailures,
          ...(parsed.openedAtMs === null
            ? {}
            : { openedAt: new Date(parsed.openedAtMs).toISOString() as Rfc3339Timestamp }),
          halfOpenProbeInFlight: parsed.probeInFlight,
          ...(parsed.probeOwner === null ? {} : { halfOpenProbeActionIntentId: parsed.probeOwner }),
        },
        killSwitch: {
          state: parsed.killSwitchState,
          changedAt: new Date(parsed.killSwitchChangedAtMs).toISOString() as Rfc3339Timestamp,
        },
        dependencyHealth: parsed.dependencyHealth,
        cancellationRequested: parsed.cancellationRequested,
        currentInFlight: parsed.currentInFlight,
        maxInFlight: parsed.maxInFlight,
        retryDepth: parsed.retryDepth,
        maxRetryDepth: parsed.maxRetryDepth,
      },
      authorizesExecution: false,
    };
  }
}
