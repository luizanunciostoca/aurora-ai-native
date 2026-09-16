#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora W15-J host prebuild verification failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
for cmd in git python sha256sum stat date; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is missing"
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
HOST="$ROOT/worktrees/host"
STATE="$ROOT/state"
WORKTREES="$STATE/worktrees.txt"
MANIFEST="$STATE/w15j-host-prebuild.txt"
MAX_AGE_SECONDS="${AURORA_W15J_PREBUILD_MAX_AGE_SECONDS:-3600}"
[[ "$MAX_AGE_SECONDS" =~ ^[0-9]+$ && "$MAX_AGE_SECONDS" -gt 0 ]] || fail "invalid prebuild max age"

[[ -f "$MANIFEST" && ! -L "$MANIFEST" ]] || fail "prebuild manifest missing"
[[ "$(stat -c '%a' "$MANIFEST")" == "600" ]] || fail "prebuild manifest mode must be 600"
[[ "$(stat -c '%u' "$MANIFEST")" == "$(id -u)" ]] || fail "prebuild manifest owner mismatch"

value() { awk -F= -v key="$1" '$1==key {sub(/^[^=]*=/,""); print; exit}' "$MANIFEST"; }
[[ "$(value kind)" == "W15J_HOST_PREBUILD_V1" ]] || fail "manifest kind mismatch"
[[ "$(value authorizes_execution)" == "false" ]] || fail "manifest cannot authorize execution"
[[ "$(value physical_acceptance)" == "false" ]] || fail "manifest cannot claim physical acceptance"
HOST_SHA="$(git -C "$HOST" rev-parse HEAD)"
EXPECTED_SHA="$(awk -F= '$1=="host" {print $2}' "$WORKTREES")"
[[ "$HOST_SHA" == "$EXPECTED_SHA" && "$HOST_SHA" == "$(value host_sha)" ]] || fail "host SHA mismatch"
[[ -z "$(git -C "$HOST" status --porcelain)" ]] || fail "host worktree must be clean"
[[ "$(git -C "$HOST" rev-parse HEAD^{tree})" == "$(value host_tree_sha)" ]] || fail "host tree mismatch"
[[ "$(sha256sum "$HOST/package-lock.json" | awk '{print $1}')" == "$(value package_lock_sha256)" ]] || fail "package lock drift"
[[ "$(sha256sum "$HOST/node_modules/.package-lock.json" | awk '{print $1}')" == "$(value node_modules_lock_sha256)" ]] || fail "node_modules lock drift"

ACTUAL_RUNTIME_TREE="$(python "$SCRIPT_DIR/hash-host-prebuild.py" "$HOST")"
[[ "$ACTUAL_RUNTIME_TREE" == "$(value runtime_tree_sha256)" ]] || fail "runtime tree drift"
[[ "$(value node_version)" == "22.16.0" ]] || fail "prebuild Node version mismatch"
[[ "$(value npm_version)" == "10.9.2" ]] || fail "prebuild npm version mismatch"

python - "$MANIFEST" "$MAX_AGE_SECONDS" <<'PY'
import datetime,sys
path=sys.argv[1]; max_age=int(sys.argv[2]); values={}
for line in open(path, encoding='utf-8'):
    if '=' in line:
        k,v=line.rstrip('\n').split('=',1); values[k]=v
built=datetime.datetime.fromisoformat(values['built_at_utc'].replace('Z','+00:00'))
now=datetime.datetime.now(datetime.timezone.utc)
age=(now-built).total_seconds()
if age < 0 or age > max_age:
    raise SystemExit(f'prebuild manifest stale age_seconds={age:.0f} max={max_age}')
print(f'W15J_HOST_PREBUILD_AGE=PASS age_seconds={int(age)} max_seconds={max_age}')
PY

printf 'W15J_HOST_PREBUILD_VERIFY=PASS_NOT_AUTHORITY\n'
printf 'runtime_tree_sha256=%s\n' "$ACTUAL_RUNTIME_TREE"
