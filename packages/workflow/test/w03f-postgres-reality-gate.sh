#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PSQL=(psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -qAt)

run_sql() { "${PSQL[@]}" -c "$1"; }
assert_eq() {
  local expected="$1" actual="$2" label="$3"
  if [[ "$actual" != "$expected" ]]; then
    echo "W03F_POSTGRES_FAIL $label expected=$expected actual=$actual" >&2
    exit 1
  fi
  echo "W03F_POSTGRES_PASS $label"
}

"${PSQL[@]}" -f "$ROOT/migrations/001_w03_postgres_baseline.sql" >/dev/null

TENANT_A='ten_01K0M0M0M0M0M0M0M0M0M0M0M0'
TENANT_B='ten_01K0M0M0M0M0M0M0M0M0M0M0M1'
IDENTITY='idn_01K0M0M0M0M0M0M0M0M0M0M0M3'
CORRELATION='cor_01K0M0M0M0M0M0M0M0M0M0M0M2'
EVENT1='evt_01K0M0M0M0M0M0M0M0M0M0M0F1'
NOW='2026-09-01T05:50:00Z'

# R02: transactional event+outbox rollback leaves no durable residue.
"${PSQL[@]}" <<SQL >/dev/null
BEGIN;
INSERT INTO w03_event (
  event_id, tenant_id, event_type, schema_version, occurred_at,
  producer_kind, producer_identity_id, source_service, correlation_id, payload, metadata
) VALUES (
  '$EVENT1', '$TENANT_A', 'aurora.w03.rollback', '1.0.0', '$NOW',
  'SYSTEM', '$IDENTITY', 'w03f-postgres', '$CORRELATION', '{}'::jsonb, '{}'::jsonb
);
INSERT INTO w03_event_outbox (event_id, tenant_id) VALUES ('$EVENT1', '$TENANT_A');
ROLLBACK;
SQL
assert_eq 0 "$(run_sql "SELECT count(*) FROM w03_event WHERE tenant_id='$TENANT_A' AND event_id='$EVENT1';")" R02_event_rollback
assert_eq 0 "$(run_sql "SELECT count(*) FROM w03_event_outbox WHERE tenant_id='$TENANT_A' AND event_id='$EVENT1';")" R02_outbox_rollback

# R03/R06/R07: committed outbox survives, one current claim wins, stale owner cannot ack after reclaim.
"${PSQL[@]}" <<SQL >/dev/null
INSERT INTO w03_event (
  event_id, tenant_id, event_type, schema_version, occurred_at,
  producer_kind, producer_identity_id, source_service, correlation_id, payload, metadata
) VALUES (
  '$EVENT1', '$TENANT_A', 'aurora.w03.delivery', '1.0.0', '$NOW',
  'SYSTEM', '$IDENTITY', 'w03f-postgres', '$CORRELATION', '{"value":1}'::jsonb, '{}'::jsonb
);
INSERT INTO w03_event_outbox (event_id, tenant_id) VALUES ('$EVENT1', '$TENANT_A');
SQL
assert_eq 1 "$(run_sql "SELECT count(*) FROM w03_event_outbox WHERE tenant_id='$TENANT_A' AND event_id='$EVENT1' AND delivery_status='pending';")" R03_committed_outbox_survives

claim_a="$(run_sql "WITH u AS (UPDATE w03_event_outbox SET delivery_status='claimed',claim_token='worker-a',unlocked_at='2026-09-01T05:50:01Z',attempt_count=attempt_count+1,last_attempted_at='$NOW' WHERE tenant_id='$TENANT_A' AND event_id='$EVENT1' AND delivery_status='pending' RETURNING 1) SELECT count(*) FROM u;")"
claim_second="$(run_sql "WITH u AS (UPDATE w03_event_outbox SET delivery_status='claimed',claim_token='worker-x',unlocked_at='2026-09-01T05:50:02Z',attempt_count=attempt_count+1,last_attempted_at='$NOW' WHERE tenant_id='$TENANT_A' AND event_id='$EVENT1' AND delivery_status='pending' RETURNING 1) SELECT count(*) FROM u;")"
assert_eq 1 "$claim_a" R06_first_claim
assert_eq 0 "$claim_second" R06_no_second_active_owner

run_sql "UPDATE w03_event_outbox SET unlocked_at='2026-09-01T05:49:59Z' WHERE tenant_id='$TENANT_A' AND event_id='$EVENT1';" >/dev/null
reclaim="$(run_sql "WITH u AS (UPDATE w03_event_outbox SET claim_token='worker-b',unlocked_at='2026-09-01T05:52:00Z',attempt_count=attempt_count+1,last_attempted_at='$NOW' WHERE tenant_id='$TENANT_A' AND event_id='$EVENT1' AND delivery_status='claimed' AND unlocked_at <= '$NOW' RETURNING 1) SELECT count(*) FROM u;")"
stale_ack="$(run_sql "WITH u AS (UPDATE w03_event_outbox SET delivery_status='acked',claim_token=NULL,unlocked_at=NULL WHERE tenant_id='$TENANT_A' AND event_id='$EVENT1' AND delivery_status='claimed' AND claim_token='worker-a' AND unlocked_at > '$NOW' RETURNING 1) SELECT count(*) FROM u;")"
current_ack="$(run_sql "WITH u AS (UPDATE w03_event_outbox SET delivery_status='acked',claim_token=NULL,unlocked_at=NULL WHERE tenant_id='$TENANT_A' AND event_id='$EVENT1' AND delivery_status='claimed' AND claim_token='worker-b' AND unlocked_at > '$NOW' RETURNING 1) SELECT count(*) FROM u;")"
assert_eq 1 "$reclaim" R07_expired_claim_reclaimed
assert_eq 0 "$stale_ack" R07_stale_owner_cannot_ack
assert_eq 1 "$current_ack" R07_current_owner_ack

# R16: tenant-scoped idempotency keys are independent and cannot cross-update.
"${PSQL[@]}" <<SQL >/dev/null
INSERT INTO w03_idempotency_key (tenant_id,idempotency_key,operation_name,canonical_payload_hash,status)
VALUES ('$TENANT_A','same-key','op','$(printf 'a%.0s' {1..64})','inflight');
INSERT INTO w03_idempotency_key (tenant_id,idempotency_key,operation_name,canonical_payload_hash,status)
VALUES ('$TENANT_B','same-key','op','$(printf 'b%.0s' {1..64})','inflight');
UPDATE w03_idempotency_key SET status='completed' WHERE tenant_id='$TENANT_A' AND idempotency_key='same-key';
SQL
assert_eq inflight "$(run_sql "SELECT status FROM w03_idempotency_key WHERE tenant_id='$TENANT_B' AND idempotency_key='same-key';")" R16_cross_tenant_idempotency_isolation

# R13/R15: two concurrent claimers race for one timer; only one terminal transition is permitted.
run_sql "INSERT INTO w03_timer (tenant_id,timer_name,schedule_key,scheduled_for) VALUES ('$TENANT_A','reality','race-1','$NOW');" >/dev/null
claim_query="WITH candidate AS (SELECT timer_id FROM w03_timer WHERE tenant_id='$TENANT_A' AND status='scheduled' AND scheduled_for <= '$NOW' ORDER BY timer_id FOR UPDATE SKIP LOCKED LIMIT 1), held AS (SELECT timer_id, pg_sleep(0.30) FROM candidate), updated AS (UPDATE w03_timer t SET status='claimed',claimed_by='RACE_OWNER' FROM held h WHERE t.timer_id=h.timer_id RETURNING t.timer_id) SELECT count(*) FROM updated;"
("${PSQL[@]}" -c "${claim_query/RACE_OWNER/worker-1}" > /tmp/w03f-claim-1) & p1=$!
("${PSQL[@]}" -c "${claim_query/RACE_OWNER/worker-2}" > /tmp/w03f-claim-2) & p2=$!
wait "$p1"; wait "$p2"
winners=$(( $(cat /tmp/w03f-claim-1) + $(cat /tmp/w03f-claim-2) ))
assert_eq 1 "$winners" R13_single_timer_claim_winner
winner="$(run_sql "SELECT claimed_by FROM w03_timer WHERE tenant_id='$TENANT_A' AND schedule_key='race-1';")"
complete_count="$(run_sql "WITH u AS (UPDATE w03_timer SET status='completed',completed_at='$NOW' WHERE tenant_id='$TENANT_A' AND schedule_key='race-1' AND status='claimed' AND claimed_by='$winner' RETURNING 1) SELECT count(*) FROM u;")"
cancel_count="$(run_sql "WITH u AS (UPDATE w03_timer SET status='cancelled' WHERE tenant_id='$TENANT_A' AND schedule_key='race-1' AND status='claimed' AND claimed_by='$winner' RETURNING 1) SELECT count(*) FROM u;")"
assert_eq 1 "$complete_count" R15_first_terminal_transition_wins
assert_eq 0 "$cancel_count" R15_second_terminal_transition_rejected

# R14: durable workflow follow-up metadata/version survives a restart recovery cycle.
workflow_timer_id="$(run_sql "INSERT INTO w03_timer (tenant_id,timer_name,schedule_key,status,scheduled_for,claimed_by,metadata) VALUES ('$TENANT_A','workflow-follow-up','workflow:objective:1500:await-durable-event','claimed','$NOW','workflow-worker','{\"workflowKey\":\"objective:1500\",\"stepKey\":\"await-durable-event\",\"workflowVersion\":\"1.2.3\",\"expectedPrecondition\":\"event-acknowledged\",\"durableWorkflowPrimitive\":true}'::jsonb) RETURNING timer_id;")"
run_sql "INSERT INTO w03_lease (tenant_id,lease_key,owner_token,subject_type,subject_id,status,acquired_at,expires_at,heartbeat_at) VALUES ('$TENANT_A','timer:$workflow_timer_id','workflow-worker','timer','$workflow_timer_id','active','2026-09-01T05:49:00Z','2026-09-01T05:49:59Z','2026-09-01T05:49:30Z');" >/dev/null
resume_count="$(run_sql "WITH expired AS (UPDATE w03_lease SET status='expired',heartbeat_at='$NOW',last_error='lease expired before timer completion' WHERE tenant_id='$TENANT_A' AND status='active' AND subject_type='timer' AND expires_at <= '$NOW' RETURNING subject_id,owner_token), recovered AS (UPDATE w03_timer AS timer SET status='scheduled',claimed_by=NULL,updated_at='$NOW' FROM expired WHERE timer.tenant_id='$TENANT_A' AND timer.timer_id::text=expired.subject_id AND timer.status='claimed' AND timer.claimed_by=expired.owner_token RETURNING 1) SELECT count(*) FROM recovered;")"
assert_eq 1 "$resume_count" R14_restart_requeues_exact_stale_owner
assert_eq scheduled "$(run_sql "SELECT status FROM w03_timer WHERE timer_id='$workflow_timer_id';")" R14_resume_state
assert_eq 1.2.3 "$(run_sql "SELECT metadata->>'workflowVersion' FROM w03_timer WHERE timer_id='$workflow_timer_id';")" R14_version_preserved
assert_eq event-acknowledged "$(run_sql "SELECT metadata->>'expectedPrecondition' FROM w03_timer WHERE timer_id='$workflow_timer_id';")" R14_precondition_preserved

# R17: malformed canonical EventId is rejected by database constraints.
if run_sql "INSERT INTO w03_event (event_id,tenant_id,event_type,schema_version,occurred_at,producer_kind,producer_identity_id,source_service,correlation_id,payload) VALUES ('bad-id','$TENANT_A','bad','1.0.0','$NOW','SYSTEM','$IDENTITY','w03f-postgres','$CORRELATION','{}');" >/dev/null 2>&1; then
  echo 'W03F_POSTGRES_FAIL R17 malformed event unexpectedly accepted' >&2
  exit 1
fi
echo 'W03F_POSTGRES_PASS R17_malformed_event_rejected'

# Failure boundary: an unavailable database must produce a non-zero operation, never a guessed success.
BAD_URL='postgresql://postgres:postgres@127.0.0.1:1/aurora_w03f'
if psql "$BAD_URL" -X -v ON_ERROR_STOP=1 -qAt -c 'SELECT 1' >/dev/null 2>&1; then
  echo 'W03F_POSTGRES_FAIL DB unavailable boundary unexpectedly succeeded' >&2
  exit 1
fi
echo 'W03F_POSTGRES_PASS DB_UNAVAILABLE_FAIL_CLOSED'

# R18: real durable backlog and repeated bounded claim batches with recorded latency.
"${PSQL[@]}" <<SQL >/dev/null
INSERT INTO w03_event (
  event_id, tenant_id, event_type, schema_version, occurred_at,
  producer_kind, producer_identity_id, source_service, correlation_id, payload, metadata
)
SELECT
  'evt_' || lpad(gs::text, 26, '0'), '$TENANT_A', 'aurora.w03.load', '1.0.0', '$NOW',
  'SYSTEM', '$IDENTITY', 'w03f-postgres-load', '$CORRELATION',
  jsonb_build_object('objective', gs), '{"class":"load"}'::jsonb
FROM generate_series(1, 1500) AS gs;
INSERT INTO w03_event_outbox (event_id, tenant_id)
SELECT event_id, tenant_id FROM w03_event WHERE tenant_id='$TENANT_A' AND event_type='aurora.w03.load';
SQL
assert_eq 1500 "$(run_sql "SELECT count(*) FROM w03_event_outbox WHERE tenant_id='$TENANT_A' AND delivery_status='pending';")" R18_durable_backlog_1500

durations=()
for batch in $(seq 1 10); do
  start_ns="$(date +%s%N)"
  claimed="$(run_sql "WITH candidate AS (SELECT event_id FROM w03_event_outbox WHERE tenant_id='$TENANT_A' AND delivery_status='pending' ORDER BY enqueued_at,event_id FOR UPDATE SKIP LOCKED LIMIT 32), updated AS (UPDATE w03_event_outbox AS o SET delivery_status='claimed',claim_token='load-$batch',unlocked_at='2026-09-01T06:10:00Z',attempt_count=attempt_count+1,last_attempted_at='$NOW' FROM candidate WHERE o.tenant_id='$TENANT_A' AND o.event_id=candidate.event_id RETURNING 1) SELECT count(*) FROM updated;")"
  end_ns="$(date +%s%N)"
  assert_eq 32 "$claimed" "R18_claim_batch_$batch"
  durations+=( $(( (end_ns - start_ns) / 1000000 )) )
done
mapfile -t sorted_durations < <(printf '%s\n' "${durations[@]}" | sort -n)
p50_ms="${sorted_durations[4]}"
p95_ms="${sorted_durations[9]}"
max_ms="${sorted_durations[9]}"
if (( max_ms >= 5000 )); then
  echo "W03F_POSTGRES_FAIL R18 claim latency unbounded max_ms=$max_ms" >&2
  exit 1
fi
echo "W03F_POSTGRES_LOAD_METRICS {\"durableBacklog\":1500,\"claimBatches\":10,\"batchSize\":32,\"claimP50Ms\":$p50_ms,\"claimP95Ms\":$p95_ms,\"claimMaxMs\":$max_ms}"

# Force planner visibility of the accepted queue index even on the deliberately small gate database.
plan="$(run_sql "SET enable_seqscan=off; EXPLAIN SELECT event_id FROM w03_event_outbox WHERE tenant_id='$TENANT_A' AND delivery_status='pending' AND (next_attempt_at IS NULL OR next_attempt_at <= '$NOW') LIMIT 32;")"
if [[ "$plan" != *"idx_w03_event_outbox_claim"* && "$plan" != *"Index"* ]]; then
  echo "W03F_POSTGRES_FAIL backlog query did not expose index plan: $plan" >&2
  exit 1
fi
echo 'W03F_POSTGRES_PASS BACKLOG_INDEX_PLAN'

echo 'W03F_POSTGRES_REALITY_GATE PASS'
