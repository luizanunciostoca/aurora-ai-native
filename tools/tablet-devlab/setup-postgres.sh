#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora Tablet-Only PostgreSQL setup failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
for cmd in openssl initdb pg_ctl psql createdb pg_isready git grep find chmod; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is missing; run bootstrap-termux.sh"
done

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
HOST_DIR="$DEVLAB_ROOT/worktrees/host"
STATE_DIR="$DEVLAB_ROOT/state"
PG_ROOT="$DEVLAB_ROOT/postgres"
PG_DATA="$PG_ROOT/data"
PG_SOCKET="$PG_ROOT/socket"
PG_LOG="$PG_ROOT/postgres.log"
DB_ENV="$STATE_DIR/postgres.env"
DB_STATE="$STATE_DIR/postgres.txt"
DB_ADMIN="aurora_admin"
DB_ROLE="aurora_w15j"
DB_NAME="aurora_w15j"
DB_HOST="127.0.0.1"
DB_PORT="5432"
PASSWORD="$(openssl rand -hex 24)"

[[ -d "$HOST_DIR/.git" || -f "$HOST_DIR/.git" ]] || fail "host worktree missing; run worktrees.sh"
for migration in \
  migrations/001_w03_postgres_baseline.sql \
  migrations/002_w03_execution_attempt_quota.sql \
  migrations/003_w03_execution_containment_state.sql; do
  [[ -f "$HOST_DIR/$migration" ]] || fail "required migration missing: $migration"
done

mkdir -p "$STATE_DIR" "$PG_ROOT" "$PG_SOCKET"
chmod 700 "$STATE_DIR" "$PG_ROOT" "$PG_SOCKET"

if [[ -d "$PG_DATA" && ! -f "$PG_DATA/PG_VERSION" ]]; then
  if find "$PG_DATA" -mindepth 1 -print -quit 2>/dev/null | grep -q .; then
    fail "Termux-native DevLab PostgreSQL data directory is non-empty but uninitialized: $PG_DATA"
  fi
fi

if [[ ! -f "$PG_DATA/PG_VERSION" ]]; then
  mkdir -p "$PG_DATA"
  chmod 700 "$PG_DATA"
  initdb \
    --pgdata="$PG_DATA" \
    --username="$DB_ADMIN" \
    --auth-local=trust \
    --auth-host=scram-sha-256 \
    --encoding=UTF8 \
    --no-locale >/dev/null
fi

if ! pg_ctl -D "$PG_DATA" status >/dev/null 2>&1; then
  if pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null 2>&1; then
    fail "port $DB_PORT is already serving a different PostgreSQL instance"
  fi
  pg_ctl \
    -D "$PG_DATA" \
    -l "$PG_LOG" \
    -o "-h $DB_HOST -p $DB_PORT -k $PG_SOCKET" \
    start -w >/dev/null
fi

pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null
[[ "$(psql -h "$PG_SOCKET" -p "$DB_PORT" -U "$DB_ADMIN" -d postgres -Atqc 'SELECT current_user')" == "$DB_ADMIN" ]] || \
  fail "private Termux PostgreSQL ownership check failed"

role_exists="$(psql -h "$PG_SOCKET" -p "$DB_PORT" -U "$DB_ADMIN" -d postgres -Atqc "SELECT 1 FROM pg_roles WHERE rolname = '$DB_ROLE'")"
if [[ "$role_exists" != "1" ]]; then
  psql -h "$PG_SOCKET" -p "$DB_PORT" -U "$DB_ADMIN" -d postgres -v ON_ERROR_STOP=1 \
    -c "CREATE ROLE $DB_ROLE LOGIN PASSWORD '$PASSWORD'" >/dev/null
else
  psql -h "$PG_SOCKET" -p "$DB_PORT" -U "$DB_ADMIN" -d postgres -v ON_ERROR_STOP=1 \
    -c "ALTER ROLE $DB_ROLE PASSWORD '$PASSWORD'" >/dev/null
fi

db_exists="$(psql -h "$PG_SOCKET" -p "$DB_PORT" -U "$DB_ADMIN" -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'")"
if [[ "$db_exists" != "1" ]]; then
  createdb -h "$PG_SOCKET" -p "$DB_PORT" -U "$DB_ADMIN" -O "$DB_ROLE" "$DB_NAME"
fi

export PGPASSWORD="$PASSWORD"
DB_URL="postgresql://$DB_ROLE:$PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"
for migration in \
  migrations/001_w03_postgres_baseline.sql \
  migrations/002_w03_execution_attempt_quota.sql \
  migrations/003_w03_execution_containment_state.sql; do
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$HOST_DIR/$migration" >/dev/null
done

psql "$DB_URL" -Atqc "SELECT to_regclass('public.w03_idempotency_key') IS NOT NULL" | grep -qx t
psql "$DB_URL" -Atqc "SELECT to_regclass('public.w03_execution_attempt_quota') IS NOT NULL" | grep -qx t
psql "$DB_URL" -Atqc "SELECT to_regclass('public.w03_execution_containment_state') IS NOT NULL" | grep -qx t

umask 077
printf '%s\n' \
  "AURORA_W15J_DATABASE_URL=$DB_URL" \
  >"$DB_ENV"
chmod 600 "$DB_ENV"

cat >"$DB_STATE" <<EOF
status=READY
cluster_scope=TERMUX_NATIVE_PRIVATE_CLUSTER
server_runtime=TERMUX_NATIVE_ANDROID
server_uid=$(id -u)
host=$DB_HOST
port=$DB_PORT
database=$DB_NAME
role=$DB_ROLE
migrations=001,002,003
host_candidate_sha=$(git -C "$HOST_DIR" rev-parse HEAD)
configured_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
authorizes_execution=false
physical_acceptance=false
EOF
chmod 600 "$DB_STATE"

printf 'Aurora W15-J PostgreSQL: READY\nState: %s\n' "$DB_STATE"
