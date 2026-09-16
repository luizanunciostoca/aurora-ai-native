#!/usr/bin/env bash
set -euo pipefail

# Evidence boundary: POSTGRES_REALITY_GATE only.
# This script does not exercise Android hardware and must never be cited as physical DP5 evidence.

: "${DATABASE_URL:?DATABASE_URL is required}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../../.." && pwd)"
PSQL=(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -qAt -F $'\t')
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TEMP_DIR"' EXIT

run_sql() { "${PSQL[@]}" -c "$1"; }

assert_eq() {
  local expected="$1" actual="$2" label="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "W15J_POSTGRES_FAIL $label expected=$expected actual=$actual" >&2
    exit 1
  fi
  echo "W15J_POSTGRES_PASS $label"
}

acquire_probe() {
  local tenant_id="$1" circuit_key="$2" owner_token="$3" now_ms="$4" expires_ms="$5"
  local result
  result="$("${PSQL[@]}" \
    -v tenant_id="$tenant_id" \
    -v lease_key="w07g:half-open:$circuit_key" \
    -v owner_token="$owner_token" \
    -v subject_type='w07-half-open-probe' \
    -v subject_id="$owner_token" \
    -v now_ms="$now_ms" \
    -v expires_ms="$expires_ms" <<'SQL'
WITH acquired AS (
  INSERT INTO w03_lease (
    tenant_id, lease_key, owner_token, subject_type, subject_id,
    status, acquired_at, expires_at, heartbeat_at
  ) VALUES (
    :'tenant_id', :'lease_key', :'owner_token', :'subject_type', :'subject_id',
    'active',
    to_timestamp((:'now_ms')::double precision / 1000.0),
    to_timestamp((:'expires_ms')::double precision / 1000.0),
    to_timestamp((:'now_ms')::double precision / 1000.0)
  )
  ON CONFLICT (tenant_id, lease_key) DO UPDATE SET
    owner_token = EXCLUDED.owner_token,
    subject_type = EXCLUDED.subject_type,
    subject_id = EXCLUDED.subject_id,
    status = 'active',
    acquired_at = EXCLUDED.acquired_at,
    expires_at = EXCLUDED.expires_at,
    heartbeat_at = EXCLUDED.heartbeat_at,
    last_error = NULL
  WHERE w03_lease.status <> 'active'
     OR w03_lease.expires_at <= to_timestamp((:'now_ms')::double precision / 1000.0)
  RETURNING owner_token, subject_type, subject_id, status,
            floor(extract(epoch FROM expires_at) * 1000)::bigint AS expires_at_ms
)
SELECT 'ACQUIRED', owner_token, subject_type, subject_id, status, expires_at_ms
FROM acquired
UNION ALL
SELECT
  CASE
    WHEN owner_token = :'owner_token'
     AND subject_type = :'subject_type'
     AND subject_id = :'subject_id'
     AND status = 'active'
     AND expires_at > to_timestamp((:'now_ms')::double precision / 1000.0)
    THEN 'ALREADY_OWNED'
    ELSE 'OWNED_BY_OTHER'
  END,
  owner_token,
  subject_type,
  subject_id,
  status,
  floor(extract(epoch FROM expires_at) * 1000)::bigint
FROM w03_lease
WHERE tenant_id = :'tenant_id'
  AND lease_key = :'lease_key'
  AND NOT EXISTS (SELECT 1 FROM acquired)
LIMIT 1;
SQL
  )"
  if [[ -n "$result" ]]; then
    printf '%s\n' "$result"
    return
  fi

  # The INSERT statement snapshot can predate a concurrently committed unique-key winner.
  # Re-read that winner in a new statement; never repeat the mutating acquire.
  "${PSQL[@]}" \
    -v tenant_id="$tenant_id" \
    -v lease_key="w07g:half-open:$circuit_key" \
    -v owner_token="$owner_token" \
    -v subject_type='w07-half-open-probe' \
    -v subject_id="$owner_token" \
    -v now_ms="$now_ms" <<'SQL'
SELECT
  CASE
    WHEN owner_token = :'owner_token'
     AND subject_type = :'subject_type'
     AND subject_id = :'subject_id'
     AND status = 'active'
     AND expires_at > to_timestamp((:'now_ms')::double precision / 1000.0)
    THEN 'ALREADY_OWNED'
    ELSE 'OWNED_BY_OTHER'
  END,
  owner_token,
  subject_type,
  subject_id,
  status,
  floor(extract(epoch FROM expires_at) * 1000)::bigint
FROM w03_lease
WHERE tenant_id = :'tenant_id'
  AND lease_key = :'lease_key'
LIMIT 1;
SQL
}

heartbeat_probe() {
  local tenant_id="$1" circuit_key="$2" owner_token="$3" now_ms="$4" expires_ms="$5"
  "${PSQL[@]}" \
    -v tenant_id="$tenant_id" \
    -v lease_key="w07g:half-open:$circuit_key" \
    -v owner_token="$owner_token" \
    -v subject_type='w07-half-open-probe' \
    -v subject_id="$owner_token" \
    -v now_ms="$now_ms" \
    -v expires_ms="$expires_ms" <<'SQL'
WITH renewed AS (
  UPDATE w03_lease
  SET heartbeat_at = to_timestamp((:'now_ms')::double precision / 1000.0),
      expires_at = to_timestamp((:'expires_ms')::double precision / 1000.0)
  WHERE tenant_id = :'tenant_id'
    AND lease_key = :'lease_key'
    AND owner_token = :'owner_token'
    AND subject_type = :'subject_type'
    AND subject_id = :'subject_id'
    AND status = 'active'
    AND expires_at > to_timestamp((:'now_ms')::double precision / 1000.0)
  RETURNING owner_token, subject_type, subject_id, status,
            floor(extract(epoch FROM expires_at) * 1000)::bigint AS expires_at_ms
)
SELECT 'RENEWED', owner_token, subject_type, subject_id, status, expires_at_ms
FROM renewed
UNION ALL
SELECT 'NOT_CURRENT_OWNER', owner_token, subject_type, subject_id, status,
       floor(extract(epoch FROM expires_at) * 1000)::bigint
FROM w03_lease
WHERE tenant_id = :'tenant_id'
  AND lease_key = :'lease_key'
  AND NOT EXISTS (SELECT 1 FROM renewed)
LIMIT 1;
SQL
}

release_probe() {
  local tenant_id="$1" circuit_key="$2" owner_token="$3" now_ms="$4"
  "${PSQL[@]}" \
    -v tenant_id="$tenant_id" \
    -v lease_key="w07g:half-open:$circuit_key" \
    -v owner_token="$owner_token" \
    -v subject_type='w07-half-open-probe' \
    -v subject_id="$owner_token" \
    -v now_ms="$now_ms" <<'SQL'
WITH released AS (
  UPDATE w03_lease
  SET status = 'released',
      heartbeat_at = to_timestamp((:'now_ms')::double precision / 1000.0)
  WHERE tenant_id = :'tenant_id'
    AND lease_key = :'lease_key'
    AND owner_token = :'owner_token'
    AND subject_type = :'subject_type'
    AND subject_id = :'subject_id'
    AND status = 'active'
  RETURNING owner_token, subject_type, subject_id, status
)
SELECT 'RELEASED', owner_token, subject_type, subject_id, status
FROM released
UNION ALL
SELECT 'NOT_CURRENT_OWNER', owner_token, subject_type, subject_id, status
FROM w03_lease
WHERE tenant_id = :'tenant_id'
  AND lease_key = :'lease_key'
  AND NOT EXISTS (SELECT 1 FROM released)
LIMIT 1;
SQL
}

stage_initial_state() {
  local tenant_id="$1" action_intent_id="$2" execution_ref="$3" circuit_key="$4"
  "${PSQL[@]}" \
    -v tenant_id="$tenant_id" \
    -v action_intent_id="$action_intent_id" \
    -v execution_ref="$execution_ref" \
    -v attempt_number='1' \
    -v max_attempts='3' \
    -v quota_limit='-' \
    -v quota_used='-' \
    -v circuit_key="$circuit_key" \
    -v circuit_state='CLOSED' \
    -v consecutive_failures='0' \
    -v opened_at_ms='-' \
    -v kill_switch_state='INACTIVE' \
    -v kill_switch_changed_at_ms='1788652800000' \
    -v dependency_health='HEALTHY' \
    -v cancellation_requested='false' \
    -v current_in_flight='0' \
    -v max_in_flight='1' \
    -v retry_depth='0' \
    -v max_retry_depth='0' \
    -v updated_at_ms='1788652800000' <<'SQL'
WITH lock_scope AS (
  SELECT pg_advisory_xact_lock(
    hashtextextended(:'tenant_id' || ':' || :'action_intent_id' || ':' || :'execution_ref', 0)
  )
), attempt_insert AS (
  INSERT INTO w03_execution_attempt_quota (
    tenant_id, action_intent_id, execution_ref, attempt_number, max_attempts,
    quota_limit, quota_used, version, created_at, updated_at
  )
  SELECT
    :'tenant_id', :'action_intent_id', :'execution_ref',
    (:'attempt_number')::integer, (:'max_attempts')::integer,
    NULLIF(:'quota_limit', '-')::integer,
    NULLIF(:'quota_used', '-')::integer,
    1,
    to_timestamp((:'updated_at_ms')::double precision / 1000.0),
    to_timestamp((:'updated_at_ms')::double precision / 1000.0)
  FROM lock_scope
  ON CONFLICT (tenant_id, action_intent_id, execution_ref) DO NOTHING
  RETURNING 1
), containment_insert AS (
  INSERT INTO w03_execution_containment (
    tenant_id, circuit_key, version, circuit_state, consecutive_failures, opened_at,
    kill_switch_state, kill_switch_changed_at, dependency_health, cancellation_requested,
    current_in_flight, max_in_flight, retry_depth, max_retry_depth, updated_at
  )
  SELECT
    :'tenant_id', :'circuit_key', 1, :'circuit_state', (:'consecutive_failures')::integer,
    to_timestamp(NULLIF(:'opened_at_ms', '-')::double precision / 1000.0),
    :'kill_switch_state',
    to_timestamp((:'kill_switch_changed_at_ms')::double precision / 1000.0),
    :'dependency_health', (:'cancellation_requested')::boolean,
    (:'current_in_flight')::integer, (:'max_in_flight')::integer,
    (:'retry_depth')::integer, (:'max_retry_depth')::integer,
    to_timestamp((:'updated_at_ms')::double precision / 1000.0)
  FROM attempt_insert
  ON CONFLICT (tenant_id, circuit_key) DO NOTHING
  RETURNING 1
)
SELECT
  CASE
    WHEN EXISTS (SELECT 1 FROM attempt_insert) THEN 'STAGED'
    ELSE 'ATTEMPT_EXISTS'
  END,
  CASE
    WHEN EXISTS (SELECT 1 FROM containment_insert) THEN 'CONTAINMENT_INITIALIZED'
    WHEN EXISTS (SELECT 1 FROM attempt_insert) THEN 'CONTAINMENT_EXISTS'
    ELSE 'CONTAINMENT_NOT_TOUCHED'
  END;
SQL
}

"${PSQL[@]}" -f "$ROOT/migrations/001_w03_postgres_baseline.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/migrations/002_w03_execution_attempt_quota.sql" >/dev/null
"${PSQL[@]}" -f "$ROOT/migrations/003_w03_execution_containment_state.sql" >/dev/null

TENANT='ten_01ARZ3NDEKTSV4RRFFQ69G5FAV'
OWNER_A='act_01ARZ3NDEKTSV4RRFFQ69G5FAV'
OWNER_B='act_01ARZ3NDEKTSV4RRFFQ69G5FAW'
CIRCUIT='device.camera.half-open-reality'
T0_MS='1788652800000'
T1_MS='1788652830000'
T2_MS='1788652860000'
T3_MS='1788652890000'
T4_MS='1788652920000'

# Two independent sessions race for one tenant-scoped circuit lease.
(acquire_probe "$TENANT" "$CIRCUIT" "$OWNER_A" "$T0_MS" "$T2_MS" >"$TEMP_DIR/owner-a") &
pid_a=$!
(acquire_probe "$TENANT" "$CIRCUIT" "$OWNER_B" "$T0_MS" "$T2_MS" >"$TEMP_DIR/owner-b") &
pid_b=$!
wait "$pid_a"
wait "$pid_b"

disposition_a="$(cut -f1 "$TEMP_DIR/owner-a")"
disposition_b="$(cut -f1 "$TEMP_DIR/owner-b")"
sorted_dispositions="$(printf '%s\n%s\n' "$disposition_a" "$disposition_b" | sort | paste -sd, -)"
assert_eq 'ACQUIRED,OWNED_BY_OTHER' "$sorted_dispositions" HALF_OPEN_TWO_OWNER_SERIALIZATION

if [[ "$disposition_a" == 'ACQUIRED' ]]; then
  winner="$OWNER_A"
  loser="$OWNER_B"
else
  winner="$OWNER_B"
  loser="$OWNER_A"
fi

stored_owner="$(run_sql "SELECT owner_token FROM w03_lease WHERE tenant_id='$TENANT' AND lease_key='w07g:half-open:$CIRCUIT';")"
assert_eq "$winner" "$stored_owner" HALF_OPEN_RACE_WINNER_IS_DURABLE_OWNER
assert_eq 'OWNED_BY_OTHER' "$(acquire_probe "$TENANT" "$CIRCUIT" "$loser" "$T1_MS" "$T3_MS" | cut -f1)" HALF_OPEN_ACTIVE_OWNER_CANNOT_BE_STOLEN

# Release allows the competing owner to acquire, while the former owner can no longer mutate it.
assert_eq 'RELEASED' "$(release_probe "$TENANT" "$CIRCUIT" "$winner" "$T1_MS" | cut -f1)" HALF_OPEN_EXACT_OWNER_RELEASE
assert_eq 'ACQUIRED' "$(acquire_probe "$TENANT" "$CIRCUIT" "$loser" "$T1_MS" "$T3_MS" | cut -f1)" HALF_OPEN_RECLAIM_AFTER_RELEASE
assert_eq 'NOT_CURRENT_OWNER' "$(heartbeat_probe "$TENANT" "$CIRCUIT" "$winner" "$T2_MS" "$T4_MS" | cut -f1)" HALF_OPEN_OLD_OWNER_HEARTBEAT_FAILS_AFTER_TAKEOVER
assert_eq 'NOT_CURRENT_OWNER' "$(release_probe "$TENANT" "$CIRCUIT" "$winner" "$T2_MS" | cut -f1)" HALF_OPEN_OLD_OWNER_RELEASE_FAILS_AFTER_TAKEOVER

# Expiry cannot be extended by heartbeat, but it does permit a new atomic owner claim.
assert_eq 'NOT_CURRENT_OWNER' "$(heartbeat_probe "$TENANT" "$CIRCUIT" "$loser" "$T4_MS" "$((T4_MS + 30000))" | cut -f1)" HALF_OPEN_HEARTBEAT_AFTER_EXPIRY_FAILS
assert_eq 'ACQUIRED' "$(acquire_probe "$TENANT" "$CIRCUIT" "$winner" "$T4_MS" "$((T4_MS + 30000))" | cut -f1)" HALF_OPEN_RECLAIM_AFTER_EXPIRY

# A duplicate attempt must make the complete initial stage a no-op. In particular, it must not
# manufacture a containment row for a new circuit after attempt insertion loses its conflict.
STAGE_ACTION='act_01ARZ3NDEKTSV4RRFFQ69G5FAX'
STAGE_EXECUTION='exe_01ARZ3NDEKTSV4RRFFQ69G5FAY'
STAGE_CIRCUIT='device.camera.atomic-stage-reality'
run_sql "INSERT INTO w03_execution_attempt_quota (tenant_id,action_intent_id,execution_ref,attempt_number,max_attempts,created_at,updated_at) VALUES ('$TENANT','$STAGE_ACTION','$STAGE_EXECUTION',2,3,'2026-09-06T00:00:00Z','2026-09-06T00:00:00Z');" >/dev/null
assert_eq 0 "$(run_sql "SELECT count(*) FROM w03_execution_containment WHERE tenant_id='$TENANT' AND circuit_key='$STAGE_CIRCUIT';")" INITIAL_STAGE_PRECONDITION_NO_CONTAINMENT

stage_result="$(stage_initial_state "$TENANT" "$STAGE_ACTION" "$STAGE_EXECUTION" "$STAGE_CIRCUIT")"
stage_attempt="$(cut -f1 <<<"$stage_result")"
stage_containment="$(cut -f2 <<<"$stage_result")"
assert_eq 'ATTEMPT_EXISTS' "$stage_attempt" INITIAL_STAGE_DUPLICATE_ATTEMPT_REJECTED
assert_eq 'CONTAINMENT_NOT_TOUCHED' "$stage_containment" INITIAL_STAGE_CONTAINMENT_WRITE_NOT_ATTEMPTED
assert_eq 0 "$(run_sql "SELECT count(*) FROM w03_execution_containment WHERE tenant_id='$TENANT' AND circuit_key='$STAGE_CIRCUIT';")" INITIAL_STAGE_DUPLICATE_ATTEMPT_CREATES_NO_CONTAINMENT

echo 'W15J_POSTGRES_REALITY_GATE PASS evidence=POSTGRES_REALITY_GATE physical_dp5=false'
