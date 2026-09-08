#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora Tablet-Only PostgreSQL setup failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
command -v proot-distro >/dev/null 2>&1 || fail "proot-distro is missing"
command -v openssl >/dev/null 2>&1 || fail "openssl is missing"

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
HOST_DIR="$DEVLAB_ROOT/worktrees/host"
STATE_DIR="$DEVLAB_ROOT/state"
DB_ENV="$STATE_DIR/postgres.env"
DB_STATE="$STATE_DIR/postgres.txt"
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

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"

proot-distro login debian \
  --user aurora \
  --bind "$DEVLAB_ROOT:/aurora-devlab" \
  -- bash -lc "
set -euo pipefail

PG_BINDIR=\"\$(find /usr/lib/postgresql -mindepth 2 -maxdepth 2 -type d -name bin 2>/dev/null | sort -V | tail -1)\"
[[ -n \"\$PG_BINDIR\" ]] || { echo 'PostgreSQL bindir not found' >&2; exit 2; }
for cmd in initdb pg_ctl psql createdb pg_isready; do
  [[ -x \"\$PG_BINDIR/\$cmd\" ]] || { echo \"missing PostgreSQL binary: \$cmd\" >&2; exit 2; }
done

PG_ROOT=\"\$HOME/.local/share/aurora-w15j-postgres\"
PG_DATA=\"\$PG_ROOT/data\"
PG_SOCKET=\"\$PG_ROOT/socket\"
PG_LOG=\"\$PG_ROOT/postgres.log\"
mkdir -p \"\$PG_ROOT\" \"\$PG_SOCKET\"
chmod 700 \"\$PG_ROOT\" \"\$PG_SOCKET\"

if [[ -d \"\$PG_DATA\" && ! -f \"\$PG_DATA/PG_VERSION\" ]]; then
  if find \"\$PG_DATA\" -mindepth 1 -print -quit 2>/dev/null | grep -q .; then
    echo \"private DevLab PostgreSQL data directory is non-empty but uninitialized: \$PG_DATA\" >&2
    exit 2
  fi
fi

if [[ ! -f \"\$PG_DATA/PG_VERSION\" ]]; then
  mkdir -p \"\$PG_DATA\"
  chmod 700 \"\$PG_DATA\"
  \"\$PG_BINDIR/initdb\" \
    --pgdata=\"\$PG_DATA\" \
    --username=aurora \
    --auth-local=trust \
    --auth-host=scram-sha-256 \
    --encoding=UTF8 \
    --no-locale >/dev/null
fi

if ! \"\$PG_BINDIR/pg_ctl\" -D \"\$PG_DATA\" status >/dev/null 2>&1; then
  if \"\$PG_BINDIR/pg_isready\" -h '$DB_HOST' -p '$DB_PORT' >/dev/null 2>&1; then
    echo 'port $DB_PORT is already serving a different PostgreSQL instance' >&2
    exit 2
  fi
  \"\$PG_BINDIR/pg_ctl\" \
    -D \"\$PG_DATA\" \
    -l \"\$PG_LOG\" \
    -o \"-h $DB_HOST -p $DB_PORT -k \\\"\$PG_SOCKET\\\"\" \
    start -w >/dev/null
fi

\"\$PG_BINDIR/pg_isready\" -h '$DB_HOST' -p '$DB_PORT' >/dev/null

role_exists=\"\$(\"\$PG_BINDIR/psql\" -h \"\$PG_SOCKET\" -p '$DB_PORT' -d postgres -Atqc \"SELECT 1 FROM pg_roles WHERE rolname = '$DB_ROLE'\")\"
if [[ \"\$role_exists\" != '1' ]]; then
  \"\$PG_BINDIR/psql\" -h \"\$PG_SOCKET\" -p '$DB_PORT' -d postgres -v ON_ERROR_STOP=1 \
    -c \"CREATE ROLE $DB_ROLE LOGIN PASSWORD '$PASSWORD'\" >/dev/null
else
  \"\$PG_BINDIR/psql\" -h \"\$PG_SOCKET\" -p '$DB_PORT' -d postgres -v ON_ERROR_STOP=1 \
    -c \"ALTER ROLE $DB_ROLE PASSWORD '$PASSWORD'\" >/dev/null
fi

db_exists=\"\$(\"\$PG_BINDIR/psql\" -h \"\$PG_SOCKET\" -p '$DB_PORT' -d postgres -Atqc \"SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'\")\"
if [[ \"\$db_exists\" != '1' ]]; then
  \"\$PG_BINDIR/createdb\" -h \"\$PG_SOCKET\" -p '$DB_PORT' -O '$DB_ROLE' '$DB_NAME'
fi

export PGPASSWORD='$PASSWORD'
DB_URL='postgresql://$DB_ROLE:$PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME'
for migration in \
  /aurora-devlab/worktrees/host/migrations/001_w03_postgres_baseline.sql \
  /aurora-devlab/worktrees/host/migrations/002_w03_execution_attempt_quota.sql \
  /aurora-devlab/worktrees/host/migrations/003_w03_execution_containment_state.sql; do
  \"\$PG_BINDIR/psql\" \"\$DB_URL\" -v ON_ERROR_STOP=1 -f \"\$migration\" >/dev/null
done

\"\$PG_BINDIR/psql\" \"\$DB_URL\" -Atqc \"SELECT to_regclass('public.w03_idempotency_key') IS NOT NULL\" | grep -qx t
\"\$PG_BINDIR/psql\" \"\$DB_URL\" -Atqc \"SELECT to_regclass('public.w03_execution_attempt_quota') IS NOT NULL\" | grep -qx t
\"\$PG_BINDIR/psql\" \"\$DB_URL\" -Atqc \"SELECT to_regclass('public.w03_execution_containment_state') IS NOT NULL\" | grep -qx t
"

umask 077
printf '%s\n' \
  "AURORA_W15J_DATABASE_URL=postgresql://$DB_ROLE:$PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" \
  >"$DB_ENV"
chmod 600 "$DB_ENV"

cat >"$DB_STATE" <<EOF
status=READY
cluster_scope=PRIVATE_DEVLAB_USER_CLUSTER
server_user=aurora
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
