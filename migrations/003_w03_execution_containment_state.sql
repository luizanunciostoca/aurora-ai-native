BEGIN;

CREATE TABLE IF NOT EXISTS w03_execution_containment (
    tenant_id TEXT NOT NULL CHECK (tenant_id ~ '^ten_[0-9A-HJKMNP-TV-Z]{26}$'),
    circuit_key TEXT NOT NULL CHECK (circuit_key <> '' AND char_length(circuit_key) <= 180),
    version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
    circuit_state TEXT NOT NULL CHECK (circuit_state IN ('CLOSED', 'OPEN', 'HALF_OPEN')),
    consecutive_failures INTEGER NOT NULL CHECK (consecutive_failures >= 0),
    opened_at TIMESTAMPTZ,
    kill_switch_state TEXT NOT NULL CHECK (kill_switch_state IN ('INACTIVE', 'ACTIVE')),
    kill_switch_changed_at TIMESTAMPTZ NOT NULL,
    dependency_health TEXT NOT NULL CHECK (dependency_health IN ('HEALTHY', 'DEGRADED', 'UNAVAILABLE')),
    cancellation_requested BOOLEAN NOT NULL,
    current_in_flight INTEGER NOT NULL CHECK (current_in_flight >= 0),
    max_in_flight INTEGER NOT NULL CHECK (max_in_flight >= 1),
    retry_depth INTEGER NOT NULL CHECK (retry_depth >= 0),
    max_retry_depth INTEGER NOT NULL CHECK (max_retry_depth >= 0),
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (tenant_id, circuit_key),
    CHECK (current_in_flight <= max_in_flight),
    CHECK (retry_depth <= max_retry_depth),
    CHECK (
        (circuit_state = 'OPEN' AND opened_at IS NOT NULL)
        OR (circuit_state <> 'OPEN' AND opened_at IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_w03_execution_containment_updated
    ON w03_execution_containment (tenant_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_w03_execution_containment_circuit_state
    ON w03_execution_containment (tenant_id, circuit_state, updated_at DESC);

COMMENT ON TABLE w03_execution_containment IS
    'W03 durable storage for current W07 failure-containment state. W07 owns transition semantics; this table grants no execution authority, outcome, or retry permission. HALF_OPEN probe ownership remains fenced separately by w03_lease.';
COMMENT ON COLUMN w03_execution_containment.version IS
    'Monotonic compare-and-set version used to reject stale competing containment updates.';
COMMENT ON COLUMN w03_execution_containment.circuit_key IS
    'Server-owned tenant-scoped circuit/dependency identity. Never derived from Android voice text or transport acknowledgements.';

COMMIT;
