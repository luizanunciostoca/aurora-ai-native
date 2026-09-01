export const W03_POSTGRES_CONVENTIONS = [
  'Use sequential migration numbers and stable forward-only numbering.',
  'Keep migrations deterministic, idempotent where practical, and record retention and ownership.',
  'Prefer UUID + timestamptz + JSONB for durable event and workflow state.',
  'Normalize tenant and canonical identifiers in every table key to prevent cross-tenant leakage.',
  'Backfill only via additive migrations; avoid destructive changes without a documented rollback path.',
] as const;

export const W03_POSTGRES_TABLES = {
  event: 'w03_event',
  outbox: 'w03_event_outbox',
  inbox: 'w03_event_inbox',
  idempotency: 'w03_idempotency_key',
  timer: 'w03_timer',
  lease: 'w03_lease',
} as const;

export const W03_POSTGRES_BASELINE = {
  migrationId: '001_w03_postgres_baseline',
  name: 'W03 Postgres baseline',
  supportedStatus: [
    'queued',
    'claimed',
    'acked',
    'failed',
    'dlq',
    'completed',
    'cancelled',
    'expired',
  ],
  tables: [
    W03_POSTGRES_TABLES.event,
    W03_POSTGRES_TABLES.outbox,
    W03_POSTGRES_TABLES.inbox,
    W03_POSTGRES_TABLES.idempotency,
    W03_POSTGRES_TABLES.timer,
    W03_POSTGRES_TABLES.lease,
  ],
  dataRetention: {
    default: '90 days',
    event: '90 days',
    inbox: '90 days',
    failed: '30 days',
    dlq: '180 days',
  },
  conventions: W03_POSTGRES_CONVENTIONS,
} as const;

export function getW03PostgresBaseline() {
  return {
    ...W03_POSTGRES_BASELINE,
    tables: [...W03_POSTGRES_BASELINE.tables],
  };
}
