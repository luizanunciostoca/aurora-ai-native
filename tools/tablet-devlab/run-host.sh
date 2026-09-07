#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora Tablet-Only host start failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
command -v proot-distro >/dev/null 2>&1 || fail "proot-distro is missing"

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
HOST_DIR="$DEVLAB_ROOT/worktrees/host"
PROVIDER="$DEVLAB_ROOT/config/trusted-w15j-provider.mjs"
READINESS_PARENT="$DEVLAB_ROOT/host-readiness"
STATE_DIR="$DEVLAB_ROOT/state"

[[ -d "$HOST_DIR/.git" || -f "$HOST_DIR/.git" ]] || fail "exact host worktree is missing; run worktrees.sh"
HOST_SHA="$(git -C "$HOST_DIR" rev-parse HEAD)"
EXPECTED_HOST_SHA="${AURORA_HOST_SHA:-3c7c3aa917c00d91d738121dee5fd32ed07b5444}"
[[ "$HOST_SHA" == "$EXPECTED_HOST_SHA" ]] || fail "host worktree is $HOST_SHA, expected $EXPECTED_HOST_SHA"
[[ -z "$(git -C "$HOST_DIR" status --porcelain)" ]] || fail "host worktree must be clean"
[[ -f "$PROVIDER" && ! -L "$PROVIDER" ]] || fail "trusted provider missing: $PROVIDER"

grep -q 'TABLET_DEVLAB_PROVIDER_NOT_CONFIGURED' "$PROVIDER" && \
  fail "provider is still the fail-closed template; bind it to trusted W03/W07/W14 owners first"

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
export AURORA_W15J_PROVIDER_MODULE=/aurora-devlab/config/trusted-w15j-provider.mjs
export AURORA_W15J_HOST_READINESS_DIR=/aurora-devlab/host-readiness/$RUN_ID
npm ci
npm run build --workspace @aurora/contracts
npm run build --workspace @aurora/events
node tools/physical/run-w15j-local-host.mjs
"
