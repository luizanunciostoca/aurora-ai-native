#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora W15-J host prebuild failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
for cmd in proot-distro git python sha256sum stat date; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is missing"
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
HOST="$ROOT/worktrees/host"
STATE="$ROOT/state"
WORKTREES="$STATE/worktrees.txt"
MANIFEST="$STATE/w15j-host-prebuild.txt"
NODE_VERSION=22.16.0
NPM_VERSION=10.9.2

[[ -f "$WORKTREES" && ! -L "$WORKTREES" ]] || fail "trusted worktree state is missing"
HOST_SHA="$(git -C "$HOST" rev-parse HEAD)"
EXPECTED_SHA="$(awk -F= '$1=="host" {print $2}' "$WORKTREES")"
[[ "$HOST_SHA" == "$EXPECTED_SHA" ]] || fail "host worktree SHA drift"
[[ -z "$(git -C "$HOST" status --porcelain)" ]] || fail "host worktree must be clean"
TREE_SHA="$(git -C "$HOST" rev-parse HEAD^{tree})"
LOCK_SHA="$(sha256sum "$HOST/package-lock.json" | awk '{print $1}')"

python - <<'PY'
import socket
for port in (8080, 8081):
    sock = socket.socket()
    try:
        if sock.connect_ex(('127.0.0.1', port)) == 0:
            raise SystemExit(f'LOCAL port {port} is listening during prebuild')
    finally:
        sock.close()
PY

proot-distro login debian --bind "$ROOT:/aurora-devlab" -- bash -lc "
set -euo pipefail
export HOME=/home/aurora
export NVM_DIR=/home/aurora/.nvm
source \"\$NVM_DIR/nvm.sh\"
nvm use $NODE_VERSION >/dev/null
[[ \"\$(node --version)\" == \"v$NODE_VERSION\" ]]
[[ \"\$(npm --version)\" == \"$NPM_VERSION\" ]]
cd /aurora-devlab/worktrees/host
export GIT_CONFIG_COUNT=1
export GIT_CONFIG_KEY_0=safe.directory
export GIT_CONFIG_VALUE_0=/aurora-devlab/worktrees/host
[[ \"\$(git rev-parse HEAD)\" == '$HOST_SHA' ]]
[[ -z \"\$(git status --porcelain)\" ]]
npm ci
npm run build --workspace @aurora/contracts
npm run build --workspace @aurora/events
npm run build --workspace @aurora/policy-core
./node_modules/.bin/tsc --project services/executors/tsconfig.build.json --pretty false
./node_modules/.bin/tsc --project services/mobile-gateway/tsconfig.runtime.json --pretty false
"

RUNTIME_TREE_SHA="$(python "$SCRIPT_DIR/hash-host-prebuild.py" "$HOST")"
NODE_MODULES_LOCK_SHA="$(sha256sum "$HOST/node_modules/.package-lock.json" | awk '{print $1}')"
BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
mkdir -p "$STATE"
chmod 700 "$STATE"
TMP="$MANIFEST.tmp.$$"
umask 077
cat >"$TMP" <<EOF
kind=W15J_HOST_PREBUILD_V1
host_sha=$HOST_SHA
host_tree_sha=$TREE_SHA
package_lock_sha256=$LOCK_SHA
node_modules_lock_sha256=$NODE_MODULES_LOCK_SHA
runtime_tree_sha256=$RUNTIME_TREE_SHA
node_version=$NODE_VERSION
npm_version=$NPM_VERSION
built_at_utc=$BUILT_AT
authorizes_execution=false
physical_acceptance=false
EOF
chmod 600 "$TMP"
mv -f "$TMP" "$MANIFEST"
printf 'W15J_HOST_PREBUILD=READY_NOT_AUTHORITY\n'
printf 'host_sha=%s\nruntime_tree_sha256=%s\n' "$HOST_SHA" "$RUNTIME_TREE_SHA"
