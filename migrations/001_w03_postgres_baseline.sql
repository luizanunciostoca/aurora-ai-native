BEGIN;

CREATE TYPE w03_event_status AS ENUM ('queued', 'claimed', 'acked', 'failed', 'dlq');
CREATE TYPE w03_delivery_status AS ENUM ('pending', 'claimed', 'acked', 'failed', 'dead_lettered');
CREATE TYPE w03_timer_status AS ENUM ('scheduled', 'claimed', 'completed', 'cancelled', 'expired');
CREATE TYPE w03_lease_status AS ENUM ('active', 'released', 'expired');

CREATE TABLE IF NOT EXISTS w03_event (
    event_id TEXT PRIMARY KEY CHECK (event_id ~ '^evt_[0-9A-HJKMNP-TV-Z]{26}$'),
    tenant_id TEXT NOT NULL CHECK (tenant_id ~ '^ten_[0-9A-HJKMNP-TV-Z]{26}$'),
    envelope_kind TEXT NOT NULL DEFAULT 'EVENT' CHECK (envelope_kind = 'EVENT'),
    event_type TEXT NOT NULL CHECK (event_type <> ''),
    schema_version TEXT NOT NULL CHECK (schema_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
    occurred_at TIMESTAMPTZ NOT NULL,
    producer_kind TEXT NOT NULL CHECK (producer_kind IN ('HUMAN', 'AGENT', 'SERVICE', 'SYSTEM')),
    producer_identity_id TEXT NOT NULL CHECK (producer_identity_id ~ '^idn_[0-9A-HJKMNP-TV-Z]{26}$'),
    source_service TEXT NOT NULL CHECK (source_service <> ''),
    source_component TEXT,
    source_instance TEXT,
    correlation_id TEXT NOT NULL CHECK (correlation_id ~ '^cor_[0-9A-HJKMNP-TV-Z]{26}$'),
    causation_id TEXT CHECK (causation_id IS NULL OR causation_id ~ '^cau_[0-9A-HJKMNP-TV-Z]{26}$'),
    subject TEXT,
    data_classification TEXT CHECK (
        data_classification IS NULL OR
        data_classification IN ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED')
    ),
    payload JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    status w03_event_status NOT NULL DEFAULT 'queued',
    retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
    next_attempt_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    last_error TEXT,
    UNIQUE (tenant_id, event_id)
);

CREATE TABLE IF NOT EXISTS w03_event_outbox (
    event_id TEXT PRIMARY KEY CHECK (event_id ~ '^evt_[0-9A-HJKMNP-TV-Z]{26}$'),
    tenant_id TEXT NOT NULL CHECK (tenant_id ~ '^ten_[0-9A-HJKMNP-TV-Z]{26}$'),
    delivery_status w03_delivery_status NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    claim_token TEXT,
    unlocked_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ,
    enqueued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_attempted_at TIMESTAMPTZ,
    last_error TEXT,
    UNIQUE (tenant_id, event_id),
    FOREIGN KEY (tenant_id, event_id)
        REFERENCES w03_event (tenant_id, event_id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS w03_event_inbox (
    inbox_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL CHECK (tenant_id ~ '^ten_[0-9A-HJKMNP-TV-Z]{26}$'),
    event_id TEXT NOT NULL CHECK (event_id ~ '^evt_[0-9A-HJKMNP-TV-Z]{26}$'),
    correlation_id TEXT NOT NULL CHECK (correlation_id ~ '^cor_[0-9A-HJKMNP-TV-Z]{26}$'),
    delivery_status w03_delivery_status NOT NULL DEFAULT 'pending',
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acked_at TIMESTAMPTZ,
    UNIQUE (tenant_id, event_id),
    FOREIGN KEY (tenant_id, event_id)
        REFERENCES w03_event (tenant_id, event_id)
        ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS w03_idempotency_key (
    tenant_id TEXT NOT NULL CHECK (tenant_id ~ '^ten_[0-9A-HJKMNP-TV-Z]{26}$'),
    idempotency_key TEXT NOT NULL CHECK (idempotency_key <> ''),
    operation_name TEXT NOT NULL CHECK (operation_name <> ''),
    canonical_payload_hash CHAR(64) NOT NULL CHECK (canonical_payload_hash ~ '^[0-9a-fA-F]{64}$'),
    event_id TEXT CHECK (event_id IS NULL OR event_id ~ '^evt_[0-9A-HJKMNP-TV-Z]{26}$'),
    status TEXT NOT NULL CHECK (status IN ('accepted', 'rejected', 'inflight', 'completed')),
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, idempotency_key),
    FOREIGN KEY (tenant_id, event_id)
        REFERENCES w03_event (tenant_id, event_id)
        ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS w03_timer (
    -- timer_id is a database-local surrogate, not a new Aurora canonical ID namespace.
    timer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL CHECK (tenant_id ~ '^ten_[0-9A-HJKMNP-TV-Z]{26}$'),
    timer_name TEXT NOT NULL CHECK (timer_name <> ''),
    schedule_key TEXT NOT NULL CHECK (schedule_key <> ''),
    status w03_timer_status NOT NULL DEFAULT 'scheduled',
    scheduled_for TIMESTAMPTZ NOT NULL,
    claimed_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS w03_lease (
    -- lease_id is a database-local surrogate, not a new Aurora canonical ID namespace.
    lease_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL CHECK (tenant_id ~ '^ten_[0-9A-HJKMNP-TV-Z]{26}$'),
    lease_key TEXT NOT NULL CHECK (lease_key <> ''),
    owner_token TEXT NOT NULL CHECK (owner_token <> ''),
    subject_type TEXT NOT NULL CHECK (subject_type <> ''),
    subject_id TEXT NOT NULL CHECK (subject_id <> ''),
    status w03_lease_status NOT NULL DEFAULT 'active',
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_error TEXT,
    UNIQUE (tenant_id, lease_key)
);

CREATE INDEX IF NOT EXISTS idx_w03_event_tenant_status_next_attempt
    ON w03_event (tenant_id, status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_w03_event_type_created_at
    ON w03_event (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_w03_event_outbox_claim
    ON w03_event_outbox (tenant_id, delivery_status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_w03_event_inbox_claim
    ON w03_event_inbox (tenant_id, delivery_status, last_updated_at);

CREATE INDEX IF NOT EXISTS idx_w03_idempotency_key_status
    ON w03_idempotency_key (tenant_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_w03_timer_status_schedule
    ON w03_timer (tenant_id, status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_w03_lease_tenant_key_expiry
    ON w03_lease (tenant_id, status, expires_at);

COMMENT ON TABLE w03_event IS 'W03 durable canonical EventEnvelope store. Canonical Aurora IDs remain prefixed ULID strings; local UUIDs are not used for event/tenant/correlation identity. Retention: 90 days for acknowledged and successful records, 30 days for failed attempts, 180 days for DLQ records.';
COMMENT ON TABLE w03_event_outbox IS 'Transactional outbox delivery ledger for W03 event fan-out and bounded retry semantics.';
COMMENT ON TABLE w03_event_inbox IS 'Inbox ack state used to prevent duplicate processing of replayed event envelopes.';
COMMENT ON COLUMN w03_event_inbox.inbox_id IS 'Database-local surrogate only; not an Aurora canonical ID.';
COMMENT ON TABLE w03_idempotency_key IS 'Idempotency ledger keyed by tenant and operation id. Event deletion is restricted while a ledger row references it so tenant/event provenance cannot be silently broken.';
COMMENT ON TABLE w03_timer IS 'Durable timer state for schedule-driven workflow re-entry and cancellation. timer_id is database-local only.';
COMMENT ON TABLE w03_lease IS 'Lease/heartbeat state used for contention fencing and safe worker reclaims. lease_id is database-local only.';

COMMIT;
