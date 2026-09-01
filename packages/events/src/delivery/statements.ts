import type {
  IdempotencyRequest,
  InboxRegistrationInput,
  OutboxClaimCommitInput,
  OutboxClaimInput,
  OutboxFailureInput,
  PersistEventInput,
  SqlStatement,
} from './types';
import { assertCanonicalPayloadHash } from './canonical-json';

function requireNonEmpty(value: string, name: string): string {
  if (!value.trim()) throw new Error(`${name} must be non-empty`);
  return value;
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

export const PERSIST_EVENT_AND_OUTBOX_SQL = `
WITH persisted_event AS (
  INSERT INTO w03_event (
    event_id, tenant_id, envelope_kind, event_type, schema_version, occurred_at,
    producer_kind, producer_identity_id, source_service, source_component, source_instance,
    correlation_id, causation_id, subject, data_classification, payload, metadata
  ) VALUES (
    $1, $2, 'EVENT', $3, $4, $5::timestamptz,
    $6, $7, $8, $9, $10,
    $11, $12, $13, $14, $15::jsonb, $16::jsonb
  )
  RETURNING tenant_id, event_id
)
INSERT INTO w03_event_outbox (tenant_id, event_id, delivery_status)
SELECT tenant_id, event_id, 'pending'::w03_delivery_status
FROM persisted_event
RETURNING tenant_id, event_id, delivery_status, attempt_count, enqueued_at;
`.trim();

export function buildPersistEventAndOutboxStatement(input: PersistEventInput): SqlStatement {
  const envelope = input.envelope;
  return {
    text: PERSIST_EVENT_AND_OUTBOX_SQL,
    values: [
      envelope.eventId,
      envelope.tenant.tenantId,
      envelope.eventType,
      envelope.schemaVersion,
      envelope.occurredAt,
      envelope.producer.kind,
      envelope.producer.identityId,
      requireNonEmpty(envelope.source.service, 'source.service'),
      envelope.source.component ?? null,
      envelope.source.instance ?? null,
      envelope.correlation.correlationId,
      envelope.correlation.causation?.causationId ?? null,
      envelope.subject ?? null,
      envelope.dataClassification ?? null,
      JSON.stringify(envelope.payload),
      JSON.stringify(envelope.metadata ?? {}),
    ],
  };
}

export const CLAIM_OUTBOX_SQL = `
UPDATE w03_event_outbox
SET delivery_status = 'claimed',
    claim_token = $3,
    unlocked_at = $5::timestamptz,
    attempt_count = attempt_count + 1,
    last_attempted_at = $4::timestamptz,
    last_error = NULL
WHERE tenant_id = $1
  AND event_id = $2
  AND attempt_count < $6
  AND (next_attempt_at IS NULL OR next_attempt_at <= $4::timestamptz)
  AND (
    delivery_status IN ('pending', 'failed')
    OR (delivery_status = 'claimed' AND unlocked_at <= $4::timestamptz)
  )
RETURNING tenant_id, event_id, delivery_status, attempt_count, claim_token, unlocked_at;
`.trim();

export function buildClaimOutboxStatement(input: OutboxClaimInput): SqlStatement {
  return {
    text: CLAIM_OUTBOX_SQL,
    values: [
      input.tenantId,
      input.eventId,
      requireNonEmpty(input.claimToken, 'claimToken'),
      input.now,
      input.unlockedAt,
      requirePositiveInteger(input.maxAttempts, 'maxAttempts'),
    ],
  };
}

export const ACK_OUTBOX_SQL = `
UPDATE w03_event_outbox
SET delivery_status = 'acked',
    claim_token = NULL,
    unlocked_at = NULL,
    next_attempt_at = NULL,
    last_error = NULL
WHERE tenant_id = $1
  AND event_id = $2
  AND delivery_status = 'claimed'
  AND claim_token = $3
  AND unlocked_at > $4::timestamptz
RETURNING tenant_id, event_id, delivery_status, attempt_count;
`.trim();

export function buildAckOutboxStatement(input: OutboxClaimCommitInput): SqlStatement {
  return {
    text: ACK_OUTBOX_SQL,
    values: [
      input.tenantId,
      input.eventId,
      requireNonEmpty(input.claimToken, 'claimToken'),
      input.now,
    ],
  };
}

export const FAIL_OUTBOX_SQL = `
UPDATE w03_event_outbox
SET delivery_status = 'failed',
    claim_token = NULL,
    unlocked_at = NULL,
    next_attempt_at = $5::timestamptz,
    last_error = $6
WHERE tenant_id = $1
  AND event_id = $2
  AND delivery_status = 'claimed'
  AND claim_token = $3
  AND unlocked_at > $4::timestamptz
RETURNING tenant_id, event_id, delivery_status, attempt_count, next_attempt_at;
`.trim();

export function buildFailOutboxStatement(input: OutboxFailureInput): SqlStatement {
  return {
    text: FAIL_OUTBOX_SQL,
    values: [
      input.tenantId,
      input.eventId,
      requireNonEmpty(input.claimToken, 'claimToken'),
      input.now,
      input.nextAttemptAt,
      requireNonEmpty(input.errorCode, 'errorCode'),
    ],
  };
}

export const REGISTER_INBOX_SQL = `
INSERT INTO w03_event_inbox (
  tenant_id, event_id, correlation_id, delivery_status, first_seen_at, last_updated_at
) VALUES ($1, $2, $3, 'pending', $4::timestamptz, $4::timestamptz)
ON CONFLICT (tenant_id, event_id) DO UPDATE
SET last_updated_at = EXCLUDED.last_updated_at
RETURNING tenant_id, event_id, correlation_id, delivery_status, first_seen_at, last_updated_at;
`.trim();

export function buildRegisterInboxStatement(input: InboxRegistrationInput): SqlStatement {
  return {
    text: REGISTER_INBOX_SQL,
    values: [input.tenantId, input.eventId, input.correlationId, input.now],
  };
}

export const CLAIM_INBOX_SQL = `
UPDATE w03_event_inbox
SET delivery_status = 'claimed', last_updated_at = $3::timestamptz
WHERE tenant_id = $1
  AND event_id = $2
  AND delivery_status = 'pending'
RETURNING tenant_id, event_id, correlation_id, delivery_status;
`.trim();

export function buildClaimInboxStatement(
  input: Pick<InboxRegistrationInput, 'tenantId' | 'eventId' | 'now'>,
): SqlStatement {
  return { text: CLAIM_INBOX_SQL, values: [input.tenantId, input.eventId, input.now] };
}

export const ACK_INBOX_SQL = `
UPDATE w03_event_inbox
SET delivery_status = 'acked', acked_at = $3::timestamptz, last_updated_at = $3::timestamptz
WHERE tenant_id = $1
  AND event_id = $2
  AND delivery_status = 'claimed'
RETURNING tenant_id, event_id, correlation_id, delivery_status, acked_at;
`.trim();

export function buildAckInboxStatement(
  input: Pick<InboxRegistrationInput, 'tenantId' | 'eventId' | 'now'>,
): SqlStatement {
  return { text: ACK_INBOX_SQL, values: [input.tenantId, input.eventId, input.now] };
}

export const INSERT_IDEMPOTENCY_SQL = `
INSERT INTO w03_idempotency_key (
  tenant_id, idempotency_key, operation_name, canonical_payload_hash, event_id, status
) VALUES ($1, $2, $3, $4, $5, 'inflight')
ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
RETURNING tenant_id, idempotency_key, operation_name, canonical_payload_hash, event_id, status;
`.trim();

export function buildInsertIdempotencyStatement(input: IdempotencyRequest): SqlStatement {
  return {
    text: INSERT_IDEMPOTENCY_SQL,
    values: [
      input.tenantId,
      requireNonEmpty(input.key, 'idempotency key'),
      requireNonEmpty(input.operationName, 'operationName'),
      assertCanonicalPayloadHash(input.canonicalPayloadHash),
      input.eventId ?? null,
    ],
  };
}

export const SELECT_IDEMPOTENCY_SQL = `
SELECT tenant_id, idempotency_key, operation_name, canonical_payload_hash, event_id, status
FROM w03_idempotency_key
WHERE tenant_id = $1 AND idempotency_key = $2;
`.trim();

export function buildSelectIdempotencyStatement(
  input: Pick<IdempotencyRequest, 'tenantId' | 'key'>,
): SqlStatement {
  return {
    text: SELECT_IDEMPOTENCY_SQL,
    values: [input.tenantId, requireNonEmpty(input.key, 'idempotency key')],
  };
}

export const COMPLETE_IDEMPOTENCY_SQL = `
UPDATE w03_idempotency_key
SET status = 'completed', updated_at = $3::timestamptz
WHERE tenant_id = $1 AND idempotency_key = $2 AND status IN ('inflight', 'accepted')
RETURNING tenant_id, idempotency_key, status, updated_at;
`.trim();

export function buildCompleteIdempotencyStatement(
  input: Pick<IdempotencyRequest, 'tenantId' | 'key'> & { readonly now: string },
): SqlStatement {
  return {
    text: COMPLETE_IDEMPOTENCY_SQL,
    values: [input.tenantId, requireNonEmpty(input.key, 'idempotency key'), input.now],
  };
}
