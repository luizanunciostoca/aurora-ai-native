#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora Tablet-Only host start failed: %s\n' "$*" >&2
  exit 2
}

secure_regular_file() {
  local path="$1"
  [[ -f "$path" && ! -L "$path" ]] || return 1
  local mode
  mode="$(stat -c '%a' "$path")"
  [[ "$mode" == "600" ]] || return 1
  [[ "$(stat -c '%u' "$path")" == "$(id -u)" ]] || return 1
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
command -v proot-distro >/dev/null 2>&1 || fail "proot-distro is missing"
command -v git >/dev/null 2>&1 || fail "git is missing"

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
HOST_DIR="$DEVLAB_ROOT/worktrees/host"
PROVIDER="$DEVLAB_ROOT/config/trusted-w15j-provider.mjs"
MATERIAL="$DEVLAB_ROOT/config/w15j-dp5-material.json"
READINESS_PARENT="$DEVLAB_ROOT/host-readiness"
STATE_DIR="$DEVLAB_ROOT/state"
WORKTREE_STATE="$STATE_DIR/worktrees.txt"
DB_ENV="$STATE_DIR/postgres.env"

[[ -d "$HOST_DIR/.git" || -f "$HOST_DIR/.git" ]] || fail "exact host worktree is missing; run worktrees.sh"
secure_regular_file "$WORKTREE_STATE" || fail "trusted worktree state missing or insecure; run worktrees.sh"
secure_regular_file "$DB_ENV" || fail "PostgreSQL state missing or insecure; run setup-postgres.sh"
secure_regular_file "$PROVIDER" || fail "trusted provider missing or insecure; run prepare-dp5-provider.sh"
secure_regular_file "$MATERIAL" || fail "DP5 material missing or insecure; run prepare-dp5-provider.sh"

HOST_SHA="$(git -C "$HOST_DIR" rev-parse HEAD)"
STATE_HOST_SHA="$(awk -F= '$1 == "host" {print $2}' "$WORKTREE_STATE")"
[[ "$STATE_HOST_SHA" =~ ^[a-f0-9]{40}$ ]] || fail "worktree state host SHA is malformed"
EXPECTED_HOST_SHA="${AURORA_HOST_SHA:-$STATE_HOST_SHA}"
[[ "$EXPECTED_HOST_SHA" =~ ^[a-f0-9]{40}$ ]] || fail "expected host SHA is malformed"
[[ "$HOST_SHA" == "$EXPECTED_HOST_SHA" ]] || fail "host worktree is $HOST_SHA, expected $EXPECTED_HOST_SHA"
[[ -z "$(git -C "$HOST_DIR" status --porcelain)" ]] || fail "host worktree must be clean"

grep -q 'TABLET_DEVLAB_PROVIDER_NOT_CONFIGURED' "$PROVIDER" && \
  fail "provider is still the fail-closed template; run prepare-dp5-provider.sh"

mkdir -p "$READINESS_PARENT" "$STATE_DIR"
chmod 700 "$READINESS_PARENT" "$STATE_DIR"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
READINESS_DIR="$READINESS_PARENT/$RUN_ID"
[[ ! -e "$READINESS_DIR" ]] || fail "readiness path unexpectedly exists: $READINESS_DIR"
printf '%s\n' "$READINESS_DIR" >"$STATE_DIR/last-readiness-termux.txt"
chmod 600 "$STATE_DIR/last-readiness-termux.txt"

# The Debian `aurora` user mirrors the Termux UID/GID. The shared workspace is therefore owned by
# the same effective operator identity while /usr/bin/git inside Debian remains root-owned.
proot-distro login debian \
  --user aurora \
  --bind "$DEVLAB_ROOT:/aurora-devlab" \
  -- bash -lc "
set -euo pipefail
export NVM_DIR=\"\$HOME/.nvm\"
# shellcheck disable=SC1090
source \"\$NVM_DIR/nvm.sh\"
nvm use 22 >/dev/null
node -e 'const [M,m]=process.versions.node.split(\".\").map(Number); if(M!==22||m<16) process.exit(2)'
cd /aurora-devlab/worktrees/host
[[ \"\$(git rev-parse HEAD)\" == '$EXPECTED_HOST_SHA' ]]
[[ -z \"\$(git status --porcelain)\" ]]

set -a
# shellcheck disable=SC1091
source /aurora-devlab/state/postgres.env
set +a
[[ \"\${AURORA_W15J_DATABASE_URL:-}\" == postgresql://* || \"\${AURORA_W15J_DATABASE_URL:-}\" == postgres://* ]]
export AURORA_W15J_DP5_MATERIAL=/aurora-devlab/config/w15j-dp5-material.json
export AURORA_W15J_PROVIDER_MODULE=/aurora-devlab/config/trusted-w15j-provider.mjs
export AURORA_W15J_HOST_READINESS_DIR=/aurora-devlab/host-readiness/$RUN_ID

npm ci
# The external provider imports only freshly compiled canonical owners from this exact host HEAD.
# Do not rely on residual dist output from a previous run.
npm run build --workspace @aurora/contracts
npm run build --workspace @aurora/events
npm run build --workspace @aurora/policy-core
./node_modules/.bin/tsc --project services/executors/tsconfig.build.json --pretty false
./node_modules/.bin/tsc --project services/mobile-gateway/tsconfig.runtime.json --pretty false
node tools/physical/run-w15j-local-host.mjs
"
