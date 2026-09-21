#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora W15-J runtime Host candidate failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
for cmd in git date stat; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is missing"
done

ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
HOST="$ROOT/worktrees/host"
STATE="$ROOT/state"
OUT="$STATE/w15j-runtime-host-candidate.txt"
SHA="${1:-}"
SOURCE_REF="${2:-manual-reconciliation}"

[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || fail "candidate SHA must be 40 lowercase hex"
[[ "$(git -C "$HOST" rev-parse HEAD)" == "$SHA" ]] || fail "Host worktree is not at candidate SHA"
[[ -z "$(git -C "$HOST" status --porcelain)" ]] || fail "Host worktree must be clean"

mkdir -p "$STATE"
chmod 700 "$STATE"
TMP="$OUT.tmp.$$"
umask 077
cat >"$TMP" <<EOF
kind=W15J_RUNTIME_HOST_CANDIDATE_V1
host_sha=$SHA
source_ref=$SOURCE_REF
recorded_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
authorizes_execution=false
physical_acceptance=false
EOF
chmod 600 "$TMP"
mv -f "$TMP" "$OUT"
printf 'W15J_RUNTIME_HOST_CANDIDATE=RECORDED_NOT_AUTHORITY\n'
printf 'host_sha=%s\n' "$SHA"
