#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PSQL=(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -qAt)

run_sql() { "${PSQL[@]}" -c "$1"; }
assert_eq() {
  local expected="$1" actual="$2" label="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "W03G_POSTGRES_FAIL $label expected=$expected actual=$actual" >&2
    exit 1
  fi
  echo "W03G_POSTGRES_PASS $label"
}

"${PSQL[@]}" -f "$ROOT/migrations/001_w03_postgres_baseline.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/migrations/002_w03_execution_attempt_quota.sql" >/dev/null

TENANT_A='ten_01K0M0M0M0M0M0M0M0M0M0M0M0'
TENANT_B='ten_01K0M0M0M0M0M0M0M0M0M0M0M1'
ACTION_INTENT='act_01K0M0M0M0M0M0M0M0M0M0M0A1'
EXEC_REF='exec-ref-reality-1'
NOW='2026-09-06T00:00:00Z'
LATER='2026-09-06T00:05:00Z'

# Positive: first insert establishes attempt=1/maxAttempts=5 at version 1; no defaults fabricated.
run_sql "INSERT INTO w03_execution_attempt_quota (tenant_id, action_intent_id, execution_ref, attempt_number, max_attempts, quota_limit, quota_used, created_at, updated_at) VALUES ('$TENANT_A','$ACTION_INTENT','$EXEC_REF',1,5,10,0,'$NOW','$NOW');" >/dev/null
assert_eq 1 "$(run_sql "SELECT version FROM w03_execution_attempt_quota WHERE tenant_id='$TENANT_A' AND action_intent_id='$ACTION_INTENT' AND execution_ref='$EXEC_REF';")" POSITIVE_INITIAL_VERSION_1
assert_eq 1 "$(run_sql "SELECT attempt_number FROM w03_execution_attempt_quota WHERE tenant_id='$TENANT_A' AND action_intent_id='$ACTION_INTENT' AND execution_ref='$EXEC_REF';")" POSITIVE_ATTEMPT_1

# Optimistic-concurrency: a compare-and-swap against the current version succeeds and advances attempt/version.
cas_current="$(run_sql "WITH u AS (UPDATE w03_execution_attempt_quota SET attempt_number=2, max_attempts=5, quota_limit=10, quota_used=1, version=version+1, updated_at='$LATER' WHERE tenant_id='$TENANT_A' AND action_intent_id='$ACTION_INTENT' AND execution_ref='$EXEC_REF' AND version=1 RETURNING 1) SELECT count(*) FROM u;")"
assert_eq 1 "$cas_current" R_CAS_CURRENT_VERSION_SUCCEEDS

# Concurrency: a second writer racing on the now-stale version 1 affects zero rows (fails closed, no clobber).
cas_stale="$(run_sql "WITH u AS (UPDATE w03_execution_attempt_quota SET attempt_number=99, max_attempts=5, quota_limit=10, quota_used=1, version=version+1, updated_at='$LATER' WHERE tenant_id='$TENANT_A' AND action_intent_id='$ACTION_INTENT' AND execution_ref='$EXEC_REF' AND version=1 RETURNING 1) SELECT count(*) FROM u;")"
assert_eq 0 "$cas_stale" R_CAS_STALE_VERSION_REJECTED
assert_eq 2 "$(run_sql "SELECT attempt_number FROM w03_execution_attempt_quota WHERE tenant_id='$TENANT_A' AND action_intent_id='$ACTION_INTENT' AND execution_ref='$EXEC_REF';")" R_CAS_WINNER_STATE_PRESERVED

# Tenant isolation: same ActionIntentId/executionRef under a different tenant is an independent row.
run_sql "INSERT INTO w03_execution_attempt_quota (tenant_id, action_intent_id, execution_ref, attempt_number, max_attempts, created_at, updated_at) VALUES ('$TENANT_B','$ACTION_INTENT','$EXEC_REF',1,3,'$NOW','$NOW');" >/dev/null
assert_eq 1 "$(run_sql "SELECT attempt_number FROM w03_execution_attempt_quota WHERE tenant_id='$TENANT_B' AND action_intent_id='$ACTION_INTENT' AND execution_ref='$EXEC_REF';")" R_TENANT_ISOLATION
run_sql "UPDATE w03_execution_attempt_quota SET attempt_number=2, version=version+1 WHERE tenant_id='$TENANT_A' AND action_intent_id='$ACTION_INTENT' AND execution_ref='$EXEC_REF' AND version=2;" >/dev/null
assert_eq 1 "$(run_sql "SELECT attempt_number FROM w03_execution_attempt_quota WHERE tenant_id='$TENANT_B' AND action_intent_id='$ACTION_INTENT' AND execution_ref='$EXEC_REF';")" R_CROSS_TENANT_UNAFFECTED

# Negative: malformed canonical ActionIntentId is rejected by the database constraint.
if run_sql "INSERT INTO w03_execution_attempt_quota (tenant_id, action_intent_id, execution_ref, attempt_number, max_attempts, created_at, updated_at) VALUES ('$TENANT_A','bad-id','exec-ref-bad',1,3,'$NOW','$NOW');" >/dev/null 2>&1; then
  echo 'W03G_POSTGRES_FAIL malformed ActionIntentId unexpectedly accepted' >&2
  exit 1
fi
echo 'W03G_POSTGRES_PASS R_MALFORMED_ACTION_INTENT_REJECTED'

# Negative: attempt_number/max_attempts below 1, and a mismatched quota pair (limit without used), are rejected.
if run_sql "INSERT INTO w03_execution_attempt_quota (tenant_id, action_intent_id, execution_ref, attempt_number, max_attempts, created_at, updated_at) VALUES ('$TENANT_A','$ACTION_INTENT','exec-ref-bad-attempt',0,3,'$NOW','$NOW');" >/dev/null 2>&1; then
  echo 'W03G_POSTGRES_FAIL non-positive attempt_number unexpectedly accepted' >&2
  exit 1
fi
echo 'W03G_POSTGRES_PASS R_NONPOSITIVE_ATTEMPT_REJECTED'

if run_sql "INSERT INTO w03_execution_attempt_quota (tenant_id, action_intent_id, execution_ref, attempt_number, max_attempts, quota_limit, created_at, updated_at) VALUES ('$TENANT_A','$ACTION_INTENT','exec-ref-bad-quota',1,3,10,'$NOW','$NOW');" >/dev/null 2>&1; then
  echo 'W03G_POSTGRES_FAIL mismatched quota_limit/quota_used pair unexpectedly accepted' >&2
  exit 1
fi
echo 'W03G_POSTGRES_PASS R_MISMATCHED_QUOTA_PAIR_REJECTED'

# Failure boundary: an unavailable database must produce a non-zero operation, never a guessed success.
BAD_URL='host=127.0.0.1 port=1 dbname=aurora_w03g connect_timeout=2'
if psql "$BAD_URL" -X -v ON_ERROR_STOP=1 -qAt -c 'SELECT 1' >/dev/null 2>&1; then
  echo 'W03G_POSTGRES_FAIL DB unavailable boundary unexpectedly succeeded' >&2
  exit 1
fi
echo 'W03G_POSTGRES_PASS DB_UNAVAILABLE_FAIL_CLOSED'

echo 'W03G_POSTGRES_REALITY_GATE PASS'
