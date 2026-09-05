// @ts-expect-error -- Aurora targets Node 22 runtime built-ins without repository-wide @types/node.
import { execFileSync } from 'node:child_process';
// @ts-expect-error -- Aurora targets Node 22 runtime built-ins without repository-wide @types/node.
import { createHash } from 'node:crypto';

import type {
  W03DurableDeliveryReservationPort,
  W03DurableDeliveryReservationRequest,
  W03DurableDeliveryReservationResult,
} from '../device-command-delivery/types.js';
import type {
  W03ReceiptIngressCompletionRequest,
  W03ReceiptIngressCompletionResult,
  W03ReceiptIngressReservationPort,
  W03ReceiptIngressReservationRequest,
  W03ReceiptIngressReservationResult,
} from '../device-receipt-ingress/types.js';

const TENANT_ID = /^ten_[0-9A-HJKMNP-TV-Z]{26}$/u;
const CORRELATION_ID = /^cor_[0-9A-HJKMNP-TV-Z]{26}$/u;
const COMMAND_ID = /^cmd_[0-9A-HJKMNP-TV-Z]{26}$/u;
const EXECUTION_ID = /^exe_[0-9A-HJKMNP-TV-Z]{26}$/u;
const RECEIPT_ID = /^rcp_[0-9A-HJKMNP-TV-Z]{26}$/u;
const SAFE_KEY = /^[A-Za-z0-9._:/+-]{1,256}$/u;
const HEX_SHA256 = /^[0-9a-f]{64}$/u;
const MAX_DATABASE_URL_LENGTH = 4096;

const DELIVERY_OPERATION = 'W14_DEVICE_DELIVERY_V1';
const RECEIPT_OPERATION = 'W14_DEVICE_RECEIPT_V1';

const RESERVE_SQL = String.raw`
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

const COMPLETE_SQL = String.raw`
WITH updated AS (
  UPDATE w03_idempotency_key
  SET status = 'completed',
      updated_at = to_timestamp((:'now_ms')::double precision / 1000.0)
  WHERE tenant_id = :'tenant_id'
    AND idempotency_key = :'idempotency_key'
    AND operation_name = :'operation_name'
    AND lower(canonical_payload_hash) = :'payload_hash'
    AND status IN ('accepted', 'inflight', 'completed')
  RETURNING operation_name, lower(canonical_payload_hash) AS canonical_payload_hash, status
)
SELECT operation_name, canonical_payload_hash, status FROM updated
UNION ALL
SELECT operation_name, lower(canonical_payload_hash), status
FROM w03_idempotency_key
WHERE tenant_id = :'tenant_id'
  AND idempotency_key = :'idempotency_key'
  AND NOT EXISTS (SELECT 1 FROM updated)
LIMIT 1;
`.trim();

export interface W03SyncSqlRequest {
  readonly sql: string;
  readonly variables: Readonly<Record<string, string>>;
}

export interface W03SyncSqlExecutor {
  query(request: W03SyncSqlRequest): string;
}

type ExecFileSyncLike = (
  file: string,
  args: readonly string[],
  options: Readonly<{
    encoding: 'utf8';
    env: Readonly<Record<string, string | undefined>>;
    stdio: readonly ['ignore', 'pipe', 'pipe'];
    timeout: number;
  }>,
) => string;

export interface PsqlW03SyncExecutorConfig {
  readonly databaseUrl: string;
  readonly psqlBinary?: string;
  readonly timeoutMs?: number;
}

/**
 * LOCAL physical-host SQL executor over the accepted W03 Postgres schema.
 *
 * The database URL is supplied through PGDATABASE rather than the process command line and is never
 * included in returned errors. Values are validated by callers and passed through psql variables,
 * so this layer neither interpolates raw identity into SQL nor owns a second idempotency ledger.
 */
export class PsqlW03SyncExecutor implements W03SyncSqlExecutor {
  readonly #databaseUrl: string;
  readonly #psqlBinary: string;
  readonly #timeoutMs: number;
  readonly #execFileSync: ExecFileSyncLike;

  constructor(
    config: PsqlW03SyncExecutorConfig,
    execFile: ExecFileSyncLike = execFileSync as unknown as ExecFileSyncLike,
  ) {
    if (
      config.databaseUrl.length === 0 ||
      config.databaseUrl.length > MAX_DATABASE_URL_LENGTH ||
      /[\r\n]/u.test(config.databaseUrl)
    ) {
      throw new Error('W03 database URL is invalid.');
    }
    const binary = config.psqlBinary ?? 'psql';
    if (!/^[A-Za-z0-9._/+-]{1,512}$/u.test(binary)) {
      throw new Error('psql binary path is invalid.');
    }
    const timeoutMs = config.timeoutMs ?? 5_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) {
      throw new Error('W03 psql timeout is invalid.');
    }
    this.#databaseUrl = config.databaseUrl;
    this.#psqlBinary = binary;
    this.#timeoutMs = timeoutMs;
    this.#execFileSync = execFile;
  }

  query(request: W03SyncSqlRequest): string {
    const args = [
      '--no-psqlrc',
      '--quiet',
      '--tuples-only',
      '--no-align',
      '--field-separator',
      '\t',
      '--set',
      'ON_ERROR_STOP=1',
    ];
    for (const [key, value] of Object.entries(request.variables)) {
      if (!/^[a-z][a-z0-9_]{0,63}$/u.test(key) || /[\r\n\0]/u.test(value)) {
        throw new Error('W03 SQL variable is invalid.');
      }
      args.push('--set', `${key}=${value}`);
    }
    args.push('--command', request.sql);

    try {
      return this.#execFileSync(this.#psqlBinary, args, {
        encoding: 'utf8',
        env: { ...process.env, PGDATABASE: this.#databaseUrl },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: this.#timeoutMs,
      });
    } catch {
      throw new Error('W03 Postgres reservation query failed.');
    }
  }
}

interface ReservationRow {
  readonly inserted: boolean;
  readonly operationName: string;
  readonly payloadHash: string;
  readonly status: string;
}

interface CompletionRow {
  readonly operationName: string;
  readonly payloadHash: string;
  readonly status: string;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function validNow(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function validFingerprint(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 4096 &&
    !/[\r\n\0]/u.test(value)
  );
}

function parseReservationRow(output: string): ReservationRow | null {
  const lines = output.trim().split(/\r?\n/u).filter(Boolean);
  if (lines.length !== 1) return null;
  const fields = lines[0]?.split('\t') ?? [];
  if (fields.length !== 4) return null;
  const [disposition, operationName, payloadHash, status] = fields;
  if (
    (disposition !== 'RESERVED' && disposition !== 'EXISTING') ||
    typeof operationName !== 'string' ||
    typeof payloadHash !== 'string' ||
    !HEX_SHA256.test(payloadHash) ||
    typeof status !== 'string'
  ) {
    return null;
  }
  return { inserted: disposition === 'RESERVED', operationName, payloadHash, status };
}

function parseCompletionRow(output: string): CompletionRow | null {
  const lines = output.trim().split(/\r?\n/u).filter(Boolean);
  if (lines.length !== 1) return null;
  const fields = lines[0]?.split('\t') ?? [];
  if (fields.length !== 3) return null;
  const [operationName, payloadHash, status] = fields;
  if (
    typeof operationName !== 'string' ||
    typeof payloadHash !== 'string' ||
    !HEX_SHA256.test(payloadHash) ||
    typeof status !== 'string'
  ) {
    return null;
  }
  return { operationName, payloadHash, status };
}

function durableReference(prefix: 'w03d' | 'w03r', tenantId: string, key: string): string {
  return `${prefix}:${sha256(`${tenantId}\n${key}`)}`;
}

function deliveryHash(request: W03DurableDeliveryReservationRequest): string {
  return sha256(
    [
      DELIVERY_OPERATION,
      request.tenantId,
      request.correlationId,
      request.commandId,
      request.executionId,
      request.idempotencyKey,
    ].join('\n'),
  );
}

function receiptKey(receiptId: string): string {
  return `w14g:${receiptId}`;
}

function receiptHash(request: W03ReceiptIngressReservationRequest): string {
  return sha256(
    [
      RECEIPT_OPERATION,
      request.tenantId,
      request.receiptId,
      request.commandId,
      request.executionId,
      request.fingerprint,
    ].join('\n'),
  );
}

function deliveryMalformed(
  request: W03DurableDeliveryReservationRequest,
): W03DurableDeliveryReservationResult | null {
  return TENANT_ID.test(request.tenantId) &&
    CORRELATION_ID.test(request.correlationId) &&
    COMMAND_ID.test(request.commandId) &&
    EXECUTION_ID.test(request.executionId) &&
    SAFE_KEY.test(request.idempotencyKey) &&
    validNow(request.nowMs)
    ? null
    : { ok: false, code: 'MALFORMED', retryable: false, authorizesExecution: false };
}

function receiptMalformed(
  request: W03ReceiptIngressReservationRequest,
): W03ReceiptIngressReservationResult | null {
  return TENANT_ID.test(request.tenantId) &&
    RECEIPT_ID.test(request.receiptId) &&
    COMMAND_ID.test(request.commandId) &&
    EXECUTION_ID.test(request.executionId) &&
    validFingerprint(request.fingerprint) &&
    validNow(request.nowMs)
    ? null
    : { ok: false, code: 'MALFORMED', retryable: false, authorizesExecution: false };
}

/**
 * Structural W14-F/W14-G compatibility adapter over the W03-owned durable Postgres ledger.
 *
 * It does not persist delivery or receipt truth outside `w03_idempotency_key`. W14 continues to own
 * transport state; W03 remains the durable replay/idempotency owner; W07 remains outcome/retry owner.
 */
export class W03PostgresDeviceReservationAdapter
  implements W03DurableDeliveryReservationPort, W03ReceiptIngressReservationPort
{
  readonly #sql: W03SyncSqlExecutor;

  constructor(sql: W03SyncSqlExecutor) {
    this.#sql = sql;
  }

  reserve(
    request: W03DurableDeliveryReservationRequest,
  ): W03DurableDeliveryReservationResult;
  reserve(request: W03ReceiptIngressReservationRequest): W03ReceiptIngressReservationResult;
  reserve(
    request: W03DurableDeliveryReservationRequest | W03ReceiptIngressReservationRequest,
  ): W03DurableDeliveryReservationResult | W03ReceiptIngressReservationResult {
    if ('idempotencyKey' in request) return this.#reserveDelivery(request);
    return this.#reserveReceipt(request);
  }

  complete(request: W03ReceiptIngressCompletionRequest): W03ReceiptIngressCompletionResult {
    const malformed = receiptMalformed(request);
    if (malformed !== null) return malformed;
    const key = receiptKey(request.receiptId);
    const expectedReference = durableReference('w03r', request.tenantId, key);
    if (request.durableReference !== expectedReference) {
      return { ok: false, code: 'CONFLICT', retryable: false, authorizesExecution: false };
    }
    const payloadHash = receiptHash(request);
    let row: CompletionRow | null;
    try {
      row = parseCompletionRow(
        this.#sql.query({
          sql: COMPLETE_SQL,
          variables: {
            tenant_id: request.tenantId,
            idempotency_key: key,
            operation_name: RECEIPT_OPERATION,
            payload_hash: payloadHash,
            now_ms: String(request.nowMs),
          },
        }),
      );
    } catch {
      return { ok: false, code: 'UNAVAILABLE', retryable: true, authorizesExecution: false };
    }
    if (
      row === null ||
      row.operationName !== RECEIPT_OPERATION ||
      row.payloadHash !== payloadHash ||
      row.status !== 'completed'
    ) {
      return { ok: false, code: 'CONFLICT', retryable: false, authorizesExecution: false };
    }
    return {
      ok: true,
      status: 'completed',
      durableReference: expectedReference,
      authorizesExecution: false,
    };
  }

  #reserveDelivery(
    request: W03DurableDeliveryReservationRequest,
  ): W03DurableDeliveryReservationResult {
    const malformed = deliveryMalformed(request);
    if (malformed !== null) return malformed;
    const payloadHash = deliveryHash(request);
    let row: ReservationRow | null;
    try {
      row = parseReservationRow(
        this.#sql.query({
          sql: RESERVE_SQL,
          variables: {
            tenant_id: request.tenantId,
            idempotency_key: request.idempotencyKey,
            operation_name: DELIVERY_OPERATION,
            payload_hash: payloadHash,
          },
        }),
      );
    } catch {
      return { ok: false, code: 'UNAVAILABLE', retryable: true, authorizesExecution: false };
    }
    if (row === null) {
      return { ok: false, code: 'UNAVAILABLE', retryable: true, authorizesExecution: false };
    }
    if (
      row.operationName !== DELIVERY_OPERATION ||
      row.payloadHash !== payloadHash ||
      row.status === 'rejected'
    ) {
      return { ok: false, code: 'CONFLICT', retryable: false, authorizesExecution: false };
    }
    return {
      ok: true,
      disposition: row.inserted ? 'RESERVED' : 'ALREADY_RESERVED',
      durableReference: durableReference('w03d', request.tenantId, request.idempotencyKey),
      authorizesExecution: false,
    };
  }

  #reserveReceipt(
    request: W03ReceiptIngressReservationRequest,
  ): W03ReceiptIngressReservationResult {
    const malformed = receiptMalformed(request);
    if (malformed !== null) return malformed;
    const key = receiptKey(request.receiptId);
    const payloadHash = receiptHash(request);
    let row: ReservationRow | null;
    try {
      row = parseReservationRow(
        this.#sql.query({
          sql: RESERVE_SQL,
          variables: {
            tenant_id: request.tenantId,
            idempotency_key: key,
            operation_name: RECEIPT_OPERATION,
            payload_hash: payloadHash,
          },
        }),
      );
    } catch {
      return { ok: false, code: 'UNAVAILABLE', retryable: true, authorizesExecution: false };
    }
    if (row === null) {
      return { ok: false, code: 'UNAVAILABLE', retryable: true, authorizesExecution: false };
    }
    if (
      row.operationName !== RECEIPT_OPERATION ||
      row.payloadHash !== payloadHash ||
      row.status === 'rejected'
    ) {
      return { ok: false, code: 'CONFLICT', retryable: false, authorizesExecution: false };
    }
    return {
      ok: true,
      disposition: row.inserted ? 'RESERVED' : 'ALREADY_RESERVED',
      status: row.status === 'completed' ? 'completed' : 'inflight',
      durableReference: durableReference('w03r', request.tenantId, key),
      authorizesExecution: false,
    };
  }
}
