#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora DP5 Host supervisor start failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
for cmd in node python stat; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is missing"
done

ROOT="${AURORA_REPO_ROOT:-$HOME/aurora-ai-native}"
DEVLAB="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
STATE="$DEVLAB/state"
SOCKET="$STATE/dp5-host-supervisor.sock"
PIDFILE="$STATE/dp5-host-supervisor.pid"
LOG="$STATE/dp5-host-supervisor.log"

cd "$ROOT"
bash tools/tablet-devlab/verify-host-prebuild.sh >/dev/null
EXPECTED_HOST_SHA="$(git -C "$DEVLAB/worktrees/host" rev-parse HEAD)"
[[ "$EXPECTED_HOST_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "current Host SHA unavailable"

if [[ -S "$SOCKET" ]]; then
  if STATUS="$(node tools/tablet-devlab/dp5-host-supervisor-client.mjs status 2>/dev/null)"; then
    printf '%s\n' "$STATUS"
    printf '%s\n' "$STATUS" | grep -Fq "\"hostSha\": \"$EXPECTED_HOST_SHA\"" ||
      fail "existing supervisor is bound to a different Host SHA"
    printf '%s\n' "$STATUS" | grep -q '"authorizesExecution": false' ||
      fail "existing supervisor status became authoritative"
    printf 'DP5_HOST_SUPERVISOR=ALREADY_READY_NOT_AUTHORITY\n'
    exit 0
  fi
  rm -f "$SOCKET"
fi

python - <<'PY'
import socket
for port in (8080, 8081):
    sock = socket.socket()
    try:
        if sock.connect_ex(('127.0.0.1', port)) == 0:
            raise SystemExit(f'LOCAL port {port} is already listening; refusing to replace an unknown Host')
    finally:
        sock.close()
PY

mkdir -p "$STATE"
chmod 700 "$STATE"
umask 077
nohup node tools/tablet-devlab/dp5-host-supervisor.mjs >>"$LOG" 2>&1 &
PID=$!
printf '%s\n' "$PID" >"$PIDFILE"
chmod 600 "$PIDFILE"

for _ in $(seq 1 50); do
  [[ -S "$SOCKET" ]] && break
  if ! kill -0 "$PID" 2>/dev/null; then
    fail "supervisor exited before socket became ready"
  fi
  sleep 0.2
done

[[ -S "$SOCKET" ]] || fail "supervisor socket did not become ready"
[[ "$(stat -c '%a' "$SOCKET")" == "600" ]] || fail "supervisor socket mode is not 600"

STATUS="$(node tools/tablet-devlab/dp5-host-supervisor-client.mjs status)"
printf '%s\n' "$STATUS"
printf '%s\n' "$STATUS" | grep -q '"ok": true' || fail "supervisor STATUS rejected"
printf '%s\n' "$STATUS" | grep -q '"authorizesExecution": false' || fail "supervisor status became authoritative"

printf 'DP5_HOST_SUPERVISOR=READY_NOT_AUTHORITY\n'
printf 'pid=%s\n' "$PID"
