import type { Rfc3339Timestamp } from '@aurora/contracts/context';
import type { TenantId } from '@aurora/contracts/ids';

import type { W03SyncSqlExecutor } from './w03-postgres-reservations.js';

const TENANT_ID = /^ten_[0-9A-HJKMNP-TV-Z]{26}$/u;
const ACTION_INTENT_ID = /^act_[0-9A-HJKMNP-TV-Z]{26}$/u;
const CIRCUIT_KEY = /^[A-Za-z0-9._:/+-]{1,180}$/u;
const LEASE_REFERENCE = /^[A-Za-z0-9._:/+-]{1,256}$/u;
const SUBJECT_TYPE = 'w07-half-open-probe';

const ACQUIRE_SQL = String.raw`
WITH acquired AS (
  INSERT INTO w03_lease (
    tenant_id, lease_key, owner_token, subject_type, subject_id,
    status, acquired_at, expires_at, heartbeat_at
  ) VALUES (
    :'tenant_id', :'lease_key', :'owner_token', :'subject_type', :'subject_id',
    'active',
    to_timestamp((:'now_ms')::double precision / 1000.0),
    to_timestamp((:'expires_ms')::double precision / 1000.0),
    to_timestamp((:'now_ms')::double precision / 1000.0)
  )
  ON CONFLICT (tenant_id, lease_key) DO UPDATE SET
    owner_token = EXCLUDED.owner_token,
    subject_type = EXCLUDED.subject_type,
    subject_id = EXCLUDED.subject_id,
    status = 'active',
    acquired_at = EXCLUDED.acquired_at,
    expires_at = EXCLUDED.expires_at,
    heartbeat_at = EXCLUDED.heartbeat_at,
    last_error = NULL
  WHERE w03_lease.status <> 'active'
     OR w03_lease.expires_at <= to_timestamp((:'now_ms')::double precision / 1000.0)
  RETURNING owner_token, subject_type, subject_id, status,
            floor(extract(epoch FROM expires_at) * 1000)::bigint AS expires_at_ms
)
SELECT 'ACQUIRED', owner_token, subject_type, subject_id, status, expires_at_ms
FROM acquired
UNION ALL
SELECT
  CASE
    WHEN owner_token = :'owner_token'
     AND subject_type = :'subject_type'
     AND subject_id = :'subject_id'
     AND status = 'active'
     AND expires_at > to_timestamp((:'now_ms')::double precision / 1000.0)
    THEN 'ALREADY_OWNED'
    ELSE 'OWNED_BY_OTHER'
  END,
  owner_token,
  subject_type,
  subject_id,
  status,
  floor(extract(epoch FROM expires_at) * 1000)::bigint
FROM w03_lease
WHERE tenant_id = :'tenant_id'
  AND lease_key = :'lease_key'
  AND NOT EXISTS (SELECT 1 FROM acquired)
LIMIT 1;
`.trim();

const HEARTBEAT_SQL = String.raw`
WITH renewed AS (
  UPDATE w03_lease
  SET heartbeat_at = to_timestamp((:'now_ms')::double precision / 1000.0),
      expires_at = to_timestamp((:'expires_ms')::double precision / 1000.0)
  WHERE tenant_id = :'tenant_id'
    AND lease_key = :'lease_key'
    AND owner_token = :'owner_token'
    AND subject_type = :'subject_type'
    AND subject_id = :'subject_id'
    AND status = 'active'
    AND expires_at > to_timestamp((:'now_ms')::double precision / 1000.0)
  RETURNING owner_token, subject_type, subject_id, status,
            floor(extract(epoch FROM expires_at) * 1000)::bigint AS expires_at_ms
)
SELECT 'RENEWED', owner_token, subject_type, subject_id, status, expires_at_ms
FROM renewed
UNION ALL
SELECT 'NOT_CURRENT_OWNER', owner_token, subject_type, subject_id, status,
       floor(extract(epoch FROM expires_at) * 1000)::bigint
FROM w03_lease
WHERE tenant_id = :'tenant_id'
  AND lease_key = :'lease_key'
  AND NOT EXISTS (SELECT 1 FROM renewed)
LIMIT 1;
`.trim();

const RELEASE_SQL = String.raw`
WITH released AS (
  UPDATE w03_lease
  SET status = 'released',
      heartbeat_at = to_timestamp((:'now_ms')::double precision / 1000.0)
  WHERE tenant_id = :'tenant_id'
    AND lease_key = :'lease_key'
    AND owner_token = :'owner_token'
    AND subject_type = :'subject_type'
    AND subject_id = :'subject_id'
    AND status = 'active'
  RETURNING owner_token, subject_type, subject_id, status
)
SELECT 'RELEASED', owner_token, subject_type, subject_id, status
FROM released
UNION ALL
SELECT 'NOT_CURRENT_OWNER', owner_token, subject_type, subject_id, status
FROM w03_lease
WHERE tenant_id = :'tenant_id'
  AND lease_key = :'lease_key'
  AND NOT EXISTS (SELECT 1 FROM released)
LIMIT 1;
`.trim();

export interface W03HalfOpenProbeAcquireRequest {
  readonly tenantId: TenantId;
  readonly circuitKey: string;
  readonly probeActionIntentId: string;
  readonly observedAt: Rfc3339Timestamp;
  readonly leaseExpiresAt: Rfc3339Timestamp;
  readonly authorizesExecution: false;
}

export interface W03HalfOpenProbeReleaseRequest {
  readonly tenantId: TenantId;
  readonly circuitKey: string;
  readonly probeActionIntentId: string;
  readonly observedAt: Rfc3339Timestamp;
  readonly authorizesExecution: false;
}

export type W03HalfOpenProbeLeaseResult =
  | Readonly<{
      ok: true;
      disposition: 'ACQUIRED' | 'ALREADY_OWNED' | 'RENEWED' | 'RELEASED';
      circuitKey: string;
      probeActionIntentId: string;
      leaseReference: string;
      expiresAt?: Rfc3339Timestamp;
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>
  | Readonly<{
      ok: false;
      code: 'OWNED_BY_OTHER' | 'NOT_CURRENT_OWNER' | 'UNAVAILABLE' | 'MALFORMED';
      authorizesExecution: false;
      provesExecutionSuccess: false;
      retryAuthorized: false;
    }>;

interface LeaseRow {
  readonly disposition:
    | 'ACQUIRED'
    | 'ALREADY_OWNED'
    | 'OWNED_BY_OTHER'
    | 'RENEWED'
    | 'RELEASED'
    | 'NOT_CURRENT_OWNER';
  readonly ownerToken: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly status: string;
  readonly expiresAtMs?: number;
}

function timestampMs(value: unknown): number | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128) return null;
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed) || new Date(parsed).toISOString() !== value) return null;
  return parsed;
}

function leaseKey(circuitKey: string): string {
  return `w07g:half-open:${circuitKey}`;
}

function leaseReference(circuitKey: string): string {
  return `w03-lease:${leaseKey(circuitKey)}`;
}

function validIdentity(input: {
  readonly tenantId: unknown;
  readonly circuitKey: unknown;
  readonly probeActionIntentId: unknown;
  readonly authorizesExecution: unknown;
}): boolean {
  return (
    typeof input.tenantId === 'string' &&
    TENANT_ID.test(input.tenantId) &&
    typeof input.circuitKey === 'string' &&
    CIRCUIT_KEY.test(input.circuitKey) &&
    typeof input.probeActionIntentId === 'string' &&
    ACTION_INTENT_ID.test(input.probeActionIntentId) &&
    input.authorizesExecution === false
  );
}

function parseRow(output: string, withExpiry: boolean): LeaseRow | null {
  const lines = output.trim().split(/\r?\n/u).filter(Boolean);
  if (lines.length !== 1) return null;
  const fields = lines[0]?.split('\t') ?? [];
  if (fields.length !== (withExpiry ? 6 : 5)) return null;
  const [disposition, ownerToken, subjectType, subjectId, status, expiresAtRaw] = fields;
  if (
    disposition !== 'ACQUIRED' &&
    disposition !== 'ALREADY_OWNED' &&
    disposition !== 'OWNED_BY_OTHER' &&
    disposition !== 'RENEWED' &&
    disposition !== 'RELEASED' &&
    disposition !== 'NOT_CURRENT_OWNER'
  ) {
    return null;
  }
  if (
    typeof ownerToken !== 'string' ||
    !ACTION_INTENT_ID.test(ownerToken) ||
    subjectType !== SUBJECT_TYPE ||
    subjectId !== ownerToken ||
    (status !== 'active' && status !== 'released' && status !== 'expired')
  ) {
    return null;
  }
  if (!withExpiry) return { disposition, ownerToken, subjectType, subjectId, status };
  if (typeof expiresAtRaw !== 'string' || !/^[0-9]{1,16}$/u.test(expiresAtRaw)) return null;
  const expiresAtMs = Number(expiresAtRaw);
  if (!Number.isSafeInteger(expiresAtMs) || expiresAtMs < 0) return null;
  return { disposition, ownerToken, subjectType, subjectId, status, expiresAtMs };
}

function failure(
  code: 'OWNED_BY_OTHER' | 'NOT_CURRENT_OWNER' | 'UNAVAILABLE' | 'MALFORMED',
): W03HalfOpenProbeLeaseResult {
  return {
    ok: false,
    code,
    authorizesExecution: false,
    provesExecutionSuccess: false,
    retryAuthorized: false,
  };
}

export class W03PostgresHalfOpenProbeLease {
  readonly #sql: W03SyncSqlExecutor;

  constructor(sql: W03SyncSqlExecutor) {
    this.#sql = sql;
  }

  reserve(input: W03HalfOpenProbeAcquireRequest): W03HalfOpenProbeLeaseResult {
    if (!validIdentity(input)) return failure('MALFORMED');
    const nowMs = timestampMs(input.observedAt);
    const expiresMs = timestampMs(input.leaseExpiresAt);
    if (nowMs === null || expiresMs === null || expiresMs <= nowMs) return failure('MALFORMED');

    let row: LeaseRow | null;
    try {
      row = parseRow(
        this.#sql.query({
          sql: ACQUIRE_SQL,
          variables: {
            tenant_id: input.tenantId,
            lease_key: leaseKey(input.circuitKey),
            owner_token: input.probeActionIntentId,
            subject_type: SUBJECT_TYPE,
            subject_id: input.probeActionIntentId,
            now_ms: String(nowMs),
            expires_ms: String(expiresMs),
          },
        }),
        true,
      );
    } catch {
      return failure('UNAVAILABLE');
    }
    if (row === null) return failure('UNAVAILABLE');
    if (row.disposition === 'OWNED_BY_OTHER') return failure('OWNED_BY_OTHER');
    if (
      (row.disposition !== 'ACQUIRED' && row.disposition !== 'ALREADY_OWNED') ||
      row.ownerToken !== input.probeActionIntentId ||
      row.status !== 'active' ||
      row.expiresAtMs === undefined ||
      row.expiresAtMs <= nowMs
    ) {
      return failure('UNAVAILABLE');
    }
    const reference = leaseReference(input.circuitKey);
    if (!LEASE_REFERENCE.test(reference)) return failure('UNAVAILABLE');
    return {
      ok: true,
      disposition: row.disposition,
      circuitKey: input.circuitKey,
      probeActionIntentId: input.probeActionIntentId,
      leaseReference: reference,
      expiresAt: new Date(row.expiresAtMs).toISOString() as Rfc3339Timestamp,
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    };
  }

  heartbeat(input: W03HalfOpenProbeAcquireRequest): W03HalfOpenProbeLeaseResult {
    if (!validIdentity(input)) return failure('MALFORMED');
    const nowMs = timestampMs(input.observedAt);
    const expiresMs = timestampMs(input.leaseExpiresAt);
    if (nowMs === null || expiresMs === null || expiresMs <= nowMs) return failure('MALFORMED');
    let row: LeaseRow | null;
    try {
      row = parseRow(
        this.#sql.query({
          sql: HEARTBEAT_SQL,
          variables: {
            tenant_id: input.tenantId,
            lease_key: leaseKey(input.circuitKey),
            owner_token: input.probeActionIntentId,
            subject_type: SUBJECT_TYPE,
            subject_id: input.probeActionIntentId,
            now_ms: String(nowMs),
            expires_ms: String(expiresMs),
          },
        }),
        true,
      );
    } catch {
      return failure('UNAVAILABLE');
    }
    if (row === null) return failure('UNAVAILABLE');
    if (row.disposition === 'NOT_CURRENT_OWNER') return failure('NOT_CURRENT_OWNER');
    if (
      row.disposition !== 'RENEWED' ||
      row.ownerToken !== input.probeActionIntentId ||
      row.status !== 'active' ||
      row.expiresAtMs === undefined ||
      row.expiresAtMs <= nowMs
    ) {
      return failure('UNAVAILABLE');
    }
    return {
      ok: true,
      disposition: 'RENEWED',
      circuitKey: input.circuitKey,
      probeActionIntentId: input.probeActionIntentId,
      leaseReference: leaseReference(input.circuitKey),
      expiresAt: new Date(row.expiresAtMs).toISOString() as Rfc3339Timestamp,
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    };
  }

  release(input: W03HalfOpenProbeReleaseRequest): W03HalfOpenProbeLeaseResult {
    if (!validIdentity(input)) return failure('MALFORMED');
    const nowMs = timestampMs(input.observedAt);
    if (nowMs === null) return failure('MALFORMED');
    let row: LeaseRow | null;
    try {
      row = parseRow(
        this.#sql.query({
          sql: RELEASE_SQL,
          variables: {
            tenant_id: input.tenantId,
            lease_key: leaseKey(input.circuitKey),
            owner_token: input.probeActionIntentId,
            subject_type: SUBJECT_TYPE,
            subject_id: input.probeActionIntentId,
            now_ms: String(nowMs),
          },
        }),
        false,
      );
    } catch {
      return failure('UNAVAILABLE');
    }
    if (row === null) return failure('UNAVAILABLE');
    if (row.disposition === 'NOT_CURRENT_OWNER') return failure('NOT_CURRENT_OWNER');
    if (
      row.disposition !== 'RELEASED' ||
      row.ownerToken !== input.probeActionIntentId ||
      row.status !== 'released'
    ) {
      return failure('UNAVAILABLE');
    }
    return {
      ok: true,
      disposition: 'RELEASED',
      circuitKey: input.circuitKey,
      probeActionIntentId: input.probeActionIntentId,
      leaseReference: leaseReference(input.circuitKey),
      authorizesExecution: false,
      provesExecutionSuccess: false,
      retryAuthorized: false,
    };
  }
}
