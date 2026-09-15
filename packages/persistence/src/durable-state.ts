export type W03JsonPrimitive = string | number | boolean | null;
export type W03JsonValue =
  | W03JsonPrimitive
  | readonly W03JsonValue[]
  | { readonly [key: string]: W03JsonValue };

export const W03_DURABLE_STATE_TABLE = 'w03_durable_state' as const;
export const W03_DURABLE_STATE_MIGRATION_ID = '002_w03_durable_state' as const;
export const W03_DURABLE_STATE_NAMESPACE_MAX_LENGTH = 128;
export const W03_DURABLE_STATE_KEY_MAX_LENGTH = 512;

export interface W03DurableStateAddress {
  readonly tenantId: string;
  readonly namespace: string;
  readonly stateKey: string;
}

export interface W03DurableStateRecord<TPayload extends W03JsonValue = W03JsonValue>
  extends W03DurableStateAddress {
  readonly revision: number;
  readonly payload: TPayload;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly authorizesExecution: false;
}

export interface W03DurableStateCompareAndSwapRequest<
  TPayload extends W03JsonValue = W03JsonValue,
> extends W03DurableStateAddress {
  /** 0 means create-only. Positive values mean compare against the current durable revision. */
  readonly expectedRevision: number;
  readonly payload: TPayload;
}

export type W03DurableStateWriteResult<TPayload extends W03JsonValue = W03JsonValue> =
  | {
      readonly status: 'APPLIED' | 'UNCHANGED';
      readonly record: W03DurableStateRecord<TPayload>;
      readonly authorizesExecution: false;
      readonly retryAuthorized: false;
    }
  | {
      readonly status: 'CONFLICT';
      readonly currentRevision: number | null;
      readonly authorizesExecution: false;
      readonly retryAuthorized: false;
    };

export interface W03DurableStateStore {
  readonly load: <TPayload extends W03JsonValue = W03JsonValue>(
    address: W03DurableStateAddress,
  ) => Promise<W03DurableStateRecord<TPayload> | null>;
  readonly compareAndSwap: <TPayload extends W03JsonValue = W03JsonValue>(
    request: W03DurableStateCompareAndSwapRequest<TPayload>,
  ) => Promise<W03DurableStateWriteResult<TPayload>>;
}

export interface W03SqlQueryResult<TRow> {
  readonly rows: readonly TRow[];
}

export interface W03SqlExecutor {
  readonly query: <TRow = Record<string, unknown>>(
    sql: string,
    parameters: readonly unknown[],
  ) => Promise<W03SqlQueryResult<TRow>>;
}

interface DurableStateRow {
  readonly tenant_id: unknown;
  readonly state_namespace: unknown;
  readonly state_key: unknown;
  readonly revision: unknown;
  readonly payload: unknown;
  readonly created_at: unknown;
  readonly updated_at: unknown;
}

const TENANT_ID_PATTERN = /^ten_[0-9A-HJKMNP-TV-Z]{26}$/;
const NAMESPACE_PATTERN = /^[a-z][a-z0-9._:-]*$/;

export const W03_DURABLE_STATE_LOAD_SQL = `
SELECT tenant_id, state_namespace, state_key, revision, payload, created_at, updated_at
FROM ${W03_DURABLE_STATE_TABLE}
WHERE tenant_id = $1 AND state_namespace = $2 AND state_key = $3
LIMIT 1
`.trim();

export const W03_DURABLE_STATE_CAS_SQL = `
WITH updated AS (
  UPDATE ${W03_DURABLE_STATE_TABLE}
  SET revision = CASE
        WHEN payload = $4::jsonb THEN revision
        ELSE revision + 1
      END,
      payload = $4::jsonb,
      updated_at = CASE
        WHEN payload = $4::jsonb THEN updated_at
        ELSE NOW()
      END
  WHERE tenant_id = $1
    AND state_namespace = $2
    AND state_key = $3
    AND revision = $5::bigint
    AND $5::bigint > 0
  RETURNING tenant_id, state_namespace, state_key, revision, payload, created_at, updated_at
), inserted AS (
  INSERT INTO ${W03_DURABLE_STATE_TABLE}
    (tenant_id, state_namespace, state_key, revision, payload)
  SELECT $1, $2, $3, 1, $4::jsonb
  WHERE $5::bigint = 0
  ON CONFLICT (tenant_id, state_namespace, state_key) DO NOTHING
  RETURNING tenant_id, state_namespace, state_key, revision, payload, created_at, updated_at
)
SELECT * FROM updated
UNION ALL
SELECT * FROM inserted
LIMIT 1
`.trim();

function assertAddress(address: W03DurableStateAddress): void {
  if (!TENANT_ID_PATTERN.test(address.tenantId)) {
    throw new Error('W03_DURABLE_STATE_TENANT_INVALID');
  }
  if (
    address.namespace.length === 0 ||
    address.namespace.length > W03_DURABLE_STATE_NAMESPACE_MAX_LENGTH ||
    !NAMESPACE_PATTERN.test(address.namespace)
  ) {
    throw new Error('W03_DURABLE_STATE_NAMESPACE_INVALID');
  }
  if (
    address.stateKey.length === 0 ||
    address.stateKey.length > W03_DURABLE_STATE_KEY_MAX_LENGTH ||
    address.stateKey.includes('\u0000')
  ) {
    throw new Error('W03_DURABLE_STATE_KEY_INVALID');
  }
}

export function isW03JsonValue(value: unknown, seen: Set<object> = new Set()): value is W03JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return false;

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.every((item) => isW03JsonValue(item, seen));
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return false;
    return Object.values(value).every((item) => isW03JsonValue(item, seen));
  } finally {
    seen.delete(value);
  }
}

function parseRevision(value: unknown): number {
  const revision = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(revision) || revision <= 0) {
    throw new Error('W03_DURABLE_STATE_REVISION_INVALID');
  }
  return revision;
}

function parsePayload(value: unknown): W03JsonValue {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      throw new Error('W03_DURABLE_STATE_PAYLOAD_INVALID');
    }
  }
  if (!isW03JsonValue(parsed)) throw new Error('W03_DURABLE_STATE_PAYLOAD_INVALID');
  return parsed;
}

function parseTimestamp(value: unknown): string {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  throw new Error('W03_DURABLE_STATE_TIMESTAMP_INVALID');
}

function parseRecord<TPayload extends W03JsonValue>(
  row: DurableStateRow,
  expected: W03DurableStateAddress,
): W03DurableStateRecord<TPayload> {
  if (
    row.tenant_id !== expected.tenantId ||
    row.state_namespace !== expected.namespace ||
    row.state_key !== expected.stateKey
  ) {
    throw new Error('W03_DURABLE_STATE_ROW_MISMATCH');
  }

  return {
    tenantId: expected.tenantId,
    namespace: expected.namespace,
    stateKey: expected.stateKey,
    revision: parseRevision(row.revision),
    payload: parsePayload(row.payload) as TPayload,
    createdAt: parseTimestamp(row.created_at),
    updatedAt: parseTimestamp(row.updated_at),
    authorizesExecution: false,
  };
}

/**
 * W03-owned generic durable JSON state with optimistic concurrency.
 * It stores opaque domain payloads and never interprets them as authority.
 */
export function createW03PostgresDurableStateStore(executor: W03SqlExecutor): W03DurableStateStore {
  return {
    load: async <TPayload extends W03JsonValue = W03JsonValue>(
      address: W03DurableStateAddress,
    ): Promise<W03DurableStateRecord<TPayload> | null> => {
      assertAddress(address);
      const result = await executor.query<DurableStateRow>(W03_DURABLE_STATE_LOAD_SQL, [
        address.tenantId,
        address.namespace,
        address.stateKey,
      ]);
      if (result.rows.length === 0) return null;
      if (result.rows.length !== 1) throw new Error('W03_DURABLE_STATE_LOAD_AMBIGUOUS');
      return parseRecord<TPayload>(result.rows[0] as DurableStateRow, address);
    },

    compareAndSwap: async <TPayload extends W03JsonValue = W03JsonValue>(
      request: W03DurableStateCompareAndSwapRequest<TPayload>,
    ): Promise<W03DurableStateWriteResult<TPayload>> => {
      assertAddress(request);
      if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0) {
        throw new Error('W03_DURABLE_STATE_EXPECTED_REVISION_INVALID');
      }
      if (!isW03JsonValue(request.payload)) {
        throw new Error('W03_DURABLE_STATE_PAYLOAD_INVALID');
      }

      const serializedPayload = JSON.stringify(request.payload);
      const result = await executor.query<DurableStateRow>(W03_DURABLE_STATE_CAS_SQL, [
        request.tenantId,
        request.namespace,
        request.stateKey,
        serializedPayload,
        request.expectedRevision,
      ]);

      if (result.rows.length > 1) throw new Error('W03_DURABLE_STATE_WRITE_AMBIGUOUS');
      if (result.rows.length === 1) {
        const record = parseRecord<TPayload>(result.rows[0] as DurableStateRow, request);
        const unchanged = request.expectedRevision > 0 && record.revision === request.expectedRevision;
        return {
          status: unchanged ? 'UNCHANGED' : 'APPLIED',
          record,
          authorizesExecution: false,
          retryAuthorized: false,
        };
      }

      const current = await this.load(request);
      return {
        status: 'CONFLICT',
        currentRevision: current?.revision ?? null,
        authorizesExecution: false,
        retryAuthorized: false,
      };
    },
  };
}
