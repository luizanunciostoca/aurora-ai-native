BEGIN;

-- Coordinator-owned cross-wave remediation (tracks #469, #470, #474, #460, W15-J/DP5).
--
-- Provides the missing durable server-owned runtime state for W07-C safeguard
-- inputs `attemptNumber`, `maxAttempts` and optional tenant-scoped execution
-- quota. This table is intentionally distinct from:
--   - w03_event_outbox.attempt_count/max_attempts (EventEnvelope transport
--     delivery counters; MUST NOT be reused for execution attempts),
--   - w03_idempotency_key (an operation fence, not an attempt/quota counter),
--   - W04 ExecutionBudget (planning-lane metadata, not runtime safety state).
-- W07-F remains the sole owner of retry *eligibility*; this table only
-- persists the current counters/quota that a W07-C-owned read port re-reads.
-- No column here grants authority, outcome or retry permission.
CREATE TABLE IF NOT EXISTS w03_execution_attempt_quota (
    tenant_id TEXT NOT NULL CHECK (tenant_id ~ '^ten_[0-9A-HJKMNP-TV-Z]{26}$'),
    action_intent_id TEXT NOT NULL CHECK (action_intent_id ~ '^act_[0-9A-HJKMNP-TV-Z]{26}$'),
    execution_ref TEXT NOT NULL CHECK (execution_ref <> ''),
    attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
    max_attempts INTEGER NOT NULL CHECK (max_attempts >= 1),
    quota_limit INTEGER CHECK (quota_limit IS NULL OR quota_limit >= 1),
    quota_used INTEGER CHECK (quota_used IS NULL OR quota_used >= 0),
    version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, action_intent_id, execution_ref),
    CHECK ((quota_limit IS NULL) = (quota_used IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_w03_execution_attempt_quota_updated_at
    ON w03_execution_attempt_quota (tenant_id, action_intent_id, updated_at DESC);

COMMENT ON TABLE w03_execution_attempt_quota IS 'W03-owned durable execution-attempt/quota runtime state consumed read-only by the W07-C safeguard gate. Bound to tenant + canonical ActionIntentId + executionRef. Absence/outage/malformed/stale rows must fail closed at the consumer; this table never defaults attempt=1/maxAttempts=3 and never grants authority or retry permission. Mutation ownership is server-side and compatible with W07 reconciliation/retry ownership; no Android/wake/STT/W14 ACK/device-trust input may create or mutate rows.';
COMMENT ON COLUMN w03_execution_attempt_quota.execution_ref IS 'Opaque server-assigned execution context reference; not an Aurora canonical ID namespace.';
COMMENT ON COLUMN w03_execution_attempt_quota.version IS 'Optimistic-concurrency fence: mutations must supply the currently-read version and increment it, so a stale writer cannot silently clobber a newer attempt/quota state.';

COMMIT;
