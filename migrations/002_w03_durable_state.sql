BEGIN;

CREATE TABLE IF NOT EXISTS w03_durable_state (
    tenant_id TEXT NOT NULL CHECK (tenant_id ~ '^ten_[0-9A-HJKMNP-TV-Z]{26}$'),
    state_namespace TEXT NOT NULL CHECK (
        char_length(state_namespace) BETWEEN 1 AND 128 AND
        state_namespace ~ '^[a-z][a-z0-9._:-]*$'
    ),
    state_key TEXT NOT NULL CHECK (
        char_length(state_key) BETWEEN 1 AND 512 AND
        position(chr(0) in state_key) = 0
    ),
    revision BIGINT NOT NULL CHECK (revision > 0),
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, state_namespace, state_key)
);

CREATE INDEX IF NOT EXISTS idx_w03_durable_state_tenant_namespace_updated
    ON w03_durable_state (tenant_id, state_namespace, updated_at DESC);

COMMENT ON TABLE w03_durable_state IS
    'W03 generic tenant-scoped durable JSON state with optimistic revision fencing. Domain semantics remain owned by the calling wave; this table never grants authority. Retention is domain-governed and must be enforced by the owning lifecycle policy.';
COMMENT ON COLUMN w03_durable_state.revision IS
    'Monotonic optimistic-concurrency revision. A successful equal-payload CAS may preserve the same revision; changed payload advances exactly once.';
COMMENT ON COLUMN w03_durable_state.payload IS
    'Opaque JSON projection owned by the calling domain. Credentials, current PolicyTokens, OwnerDecisions and raw audio are prohibited by domain adapters.';

COMMIT;
