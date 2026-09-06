BEGIN;

CREATE TABLE IF NOT EXISTS w03_failure_containment_state (
    tenant_id TEXT NOT NULL CHECK (tenant_id ~ '^ten_[0-9A-HJKMNP-TV-Z]{26}$'),
    dependency_id TEXT NOT NULL CHECK (dependency_id <> ''),
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
    max_retry_depth INTEGER NOT NULL CHECK (max_retry_depth >= 1),
    version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (tenant_id, dependency_id)
);

COMMENT ON TABLE w03_failure_containment_state IS
    'W03 durable server-owned current containment snapshot. HALF_OPEN probe ownership is fenced by w03_lease and is intentionally not stored here.';

CREATE INDEX IF NOT EXISTS idx_w03_failure_containment_state_updated
    ON w03_failure_containment_state (tenant_id, updated_at DESC);

COMMIT;
