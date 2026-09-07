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
  --bind "$DEVLAB_ROOT:/aurora-devlab" \
  -- bash -lc "
set -euo pipefail
command -v pg_lsclusters >/dev/null
command -v pg_ctlcluster >/dev/null
command -v psql >/dev/null
command -v runuser >/dev/null

version=\"\$(pg_lsclusters --no-header 2>/dev/null | awk 'NR==1 {print \$1}')\"
if [[ -z \"\$version\" ]]; then
  version=\"\$(find /usr/lib/postgresql -mindepth 1 -maxdepth 1 -type d -printf '%f\\n' | sort -V | tail -1)\"
  [[ -n \"\$version\" ]] || { echo 'no PostgreSQL version installed' >&2; exit 2; }
  pg_createcluster \"\$version\" main >/dev/null
fi

if ! pg_ctlcluster \"\$version\" main status >/dev/null 2>&1; then
  pg_ctlcluster \"\$version\" main start
fi
pg_isready -h '$DB_HOST' -p '$DB_PORT' >/dev/null

role_exists=\"\$(runuser -u postgres -- psql -Atqc \"SELECT 1 FROM pg_roles WHERE rolname = '$DB_ROLE'\")\"
if [[ \"\$role_exists\" != '1' ]]; then
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c \"CREATE ROLE $DB_ROLE LOGIN PASSWORD '$PASSWORD'\" >/dev/null
else
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c \"ALTER ROLE $DB_ROLE PASSWORD '$PASSWORD'\" >/dev/null
fi

db_exists=\"\$(runuser -u postgres -- psql -Atqc \"SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'\")\"
if [[ \"\$db_exists\" != '1' ]]; then
  runuser -u postgres -- createdb -O '$DB_ROLE' '$DB_NAME'
fi

export PGPASSWORD='$PASSWORD'
DB_URL='postgresql://$DB_ROLE:$PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME'
for migration in \
  /aurora-devlab/worktrees/host/migrations/001_w03_postgres_baseline.sql \
  /aurora-devlab/worktrees/host/migrations/002_w03_execution_attempt_quota.sql \
  /aurora-devlab/worktrees/host/migrations/003_w03_execution_containment_state.sql; do
  psql \"\$DB_URL\" -v ON_ERROR_STOP=1 -f \"\$migration\" >/dev/null
done

psql \"\$DB_URL\" -Atqc \"SELECT to_regclass('public.w03_idempotency_key') IS NOT NULL\" | grep -qx t
psql \"\$DB_URL\" -Atqc \"SELECT to_regclass('public.w03_execution_attempt_quota') IS NOT NULL\" | grep -qx t
psql \"\$DB_URL\" -Atqc \"SELECT to_regclass('public.w03_execution_containment_state') IS NOT NULL\" | grep -qx t
"

umask 077
printf '%s\n' \
  "AURORA_W15J_DATABASE_URL=postgresql://$DB_ROLE:$PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME" \
  >"$DB_ENV"
chmod 600 "$DB_ENV"

cat >"$DB_STATE" <<EOF
status=READY
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
