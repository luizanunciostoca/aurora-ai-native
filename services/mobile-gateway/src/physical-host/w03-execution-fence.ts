import type { TenantId } from '@aurora/contracts/ids';

import type { W03SyncSqlExecutor } from './w03-postgres-reservations.js';

const TENANT_ID = /^ten_[0-9A-HJKMNP-TV-Z]{26}$/u;
const SAFE_KEY = /^[A-Za-z0-9._:/+-]{1,256}$/u;
const SAFE_OPERATION = /^[A-Za-z0-9._:/+-]{1,256}$/u;
const SHA256 = /^sha256:([0-9a-f]{64})$/u;
const HEX_SHA256 = /^[0-9a-f]{64}$/u;

const RESERVE_EXECUTION_SQL = String.raw`
WITH inserted AS (
  INSERT INTO w03_idempotency_key (
    tenant_id, idempotency_key, operation_name, canonical_payload_hash, event_id, status
  ) VALUES (
    :'tenant_id', :'idempotency_key', :'operation_name', :'payload_hash', NULL, 'inflight'
  )
  ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
  RETURNING 1
)
SELECT
  CASE WHEN EXISTS (SELECT 1 FROM inserted) THEN 'RESERVED' ELSE 'EXISTING' END,
  operation_name,
  lower(canonical_payload_hash),
  status
FROM w03_idempotency_key
WHERE tenant_id = :'tenant_id' AND idempotency_key = :'idempotency_key';
`.trim();

export interface LocalW07IdempotencyFenceRequest {
  readonly tenantId: TenantId;
  readonly key: string;
  readonly operationName: string;
  readonly canonicalPayloadHash: string;
}

export type LocalW07IdempotencyFenceDecision =
  | Readonly<{ kind: 'RESERVED' }>
  | Readonly<{ kind: 'REPLAY_COMPLETED'; reference?: string }>
  | Readonly<{ kind: 'INFLIGHT' }>
  | Readonly<{ kind: 'CONFLICT'; reason: string }>;

export interface LocalW07IdempotencyFencePort {
  reserve(request: LocalW07IdempotencyFenceRequest): LocalW07IdempotencyFenceDecision;
}

interface ReservationRow {
  readonly disposition: 'RESERVED' | 'EXISTING';
  readonly operationName: string;
  readonly payloadHash: string;
  readonly status: 'accepted' | 'rejected' | 'inflight' | 'completed';
}

function parseRow(output: string): ReservationRow | null {
  const lines = output.trim().split(/\r?\n/u).filter(Boolean);
  if (lines.length !== 1) return null;
  const fields = lines[0]?.split('\t') ?? [];
  if (fields.length !== 4) return null;
  const [disposition, operationName, payloadHash, status] = fields;
  if (
    (disposition !== 'RESERVED' && disposition !== 'EXISTING') ||
    typeof operationName !== 'string' ||
    !SAFE_OPERATION.test(operationName) ||
    typeof payloadHash !== 'string' ||
    !HEX_SHA256.test(payloadHash) ||
    (status !== 'accepted' &&
      status !== 'rejected' &&
      status !== 'inflight' &&
      status !== 'completed')
  ) {
    return null;
  }
  return { disposition, operationName, payloadHash, status };
}

function validRequest(request: LocalW07IdempotencyFenceRequest): string | null {
  if (!TENANT_ID.test(request.tenantId)) return null;
  if (!SAFE_KEY.test(request.key) || !SAFE_OPERATION.test(request.operationName)) return null;
  const match = SHA256.exec(request.canonicalPayloadHash);
  return match?.[1] ?? null;
}

/**
 * W03 compatibility adapter for the W07-C business-idempotency guard in the LOCAL physical host.
 *
 * It uses only the accepted `w03_idempotency_key` table. It owns no cache, retry policy, outcome,
 * device delivery state, or authority. SQL unavailability throws a sanitized error so W07-C maps
 * it to `IDEMPOTENCY_FENCE_FAILED` instead of treating infrastructure failure as a safe replay.
 */
export class W03PostgresExecutionIdempotencyFence implements LocalW07IdempotencyFencePort {
  readonly #sql: W03SyncSqlExecutor;

  constructor(sql: W03SyncSqlExecutor) {
    this.#sql = sql;
  }

  reserve(request: LocalW07IdempotencyFenceRequest): LocalW07IdempotencyFenceDecision {
    const payloadHash = validRequest(request);
    if (payloadHash === null) return { kind: 'CONFLICT', reason: 'MALFORMED_REQUEST' };

    let row: ReservationRow | null;
    try {
      row = parseRow(
        this.#sql.query({
          sql: RESERVE_EXECUTION_SQL,
          variables: {
            tenant_id: request.tenantId,
            idempotency_key: request.key,
            operation_name: request.operationName,
            payload_hash: payloadHash,
          },
        }),
      );
    } catch {
      throw new Error('W03 execution idempotency reservation unavailable.');
    }
    if (row === null) throw new Error('W03 execution idempotency protocol violation.');
    if (row.operationName !== request.operationName || row.payloadHash !== payloadHash) {
      return { kind: 'CONFLICT', reason: 'BINDING_CONFLICT' };
    }
    if (row.disposition === 'RESERVED') return { kind: 'RESERVED' };

    switch (row.status) {
      case 'completed':
        return { kind: 'REPLAY_COMPLETED' };
      case 'accepted':
      case 'inflight':
        return { kind: 'INFLIGHT' };
      case 'rejected':
        return { kind: 'CONFLICT', reason: 'REJECTED_PRIOR_RESERVATION' };
    }
  }
}
