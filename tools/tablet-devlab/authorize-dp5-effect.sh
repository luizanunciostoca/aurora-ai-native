#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora W15-J physical-effect authorization failed: %s\n' "$*" >&2
  exit 2
}

secure_regular_file() {
  local path="$1"
  [[ -f "$path" && ! -L "$path" ]] || return 1
  [[ "$(stat -c '%a' "$path")" == "600" ]] || return 1
  [[ "$(stat -c '%u' "$path")" == "$(id -u)" ]] || return 1
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
[[ -t 0 && -t 1 ]] || fail "an interactive physical-operator TTY is required"
for cmd in python sha256sum stat git; do command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is missing"; done

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
STATE_DIR="$DEVLAB_ROOT/state"
WORKTREE_STATE="$STATE_DIR/worktrees.txt"
CONSENT="$STATE_DIR/dp5-effect-consent.json"
ANDROID_DIR="$DEVLAB_ROOT/worktrees/android"
HOST_DIR="$DEVLAB_ROOT/worktrees/host"
MAIN_DIR="$DEVLAB_ROOT/worktrees/main"

secure_regular_file "$WORKTREE_STATE" || fail "secure worktree state is required; run worktrees.sh"
[[ ! -e "$CONSENT" ]] || fail "an unconsumed DP5 effect consent already exists"

MAIN_SHA="$(awk -F= '$1 == "main" {print $2}' "$WORKTREE_STATE")"
ANDROID_SHA="$(awk -F= '$1 == "android" {print $2}' "$WORKTREE_STATE")"
HOST_SHA="$(awk -F= '$1 == "host" {print $2}' "$WORKTREE_STATE")"
for sha in "$MAIN_SHA" "$ANDROID_SHA" "$HOST_SHA"; do
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || fail "worktree tuple contains malformed SHA"
done

for pair in "$MAIN_DIR:$MAIN_SHA" "$ANDROID_DIR:$ANDROID_SHA" "$HOST_DIR:$HOST_SHA"; do
  path="${pair%%:*}"
  expected="${pair##*:}"
  [[ -d "$path/.git" || -f "$path/.git" ]] || fail "required exact worktree missing: $path"
  [[ "$(git -C "$path" rev-parse HEAD)" == "$expected" ]] || fail "worktree drift detected: $path"
  [[ -z "$(git -C "$path" status --porcelain)" ]] || fail "worktree is dirty: $path"
done

CHALLENGE="$(python - <<'PY'
import secrets
print(secrets.token_hex(4).upper())
PY
)"

cat <<EOF
Aurora W15-J / DP5 bounded physical-effect consent

Exact tuple:
  main    $MAIN_SHA
  android $ANDROID_SHA
  host    $HOST_SHA

Scope: exactly one governed media-volume step-up, only after current W02/W07 authority.
This consent is not policy authority, not an execution authorization, not retry permission,
and not physical acceptance. It only records a human operator's permission to open the
short-lived positive-effect test window for this exact tuple.

Challenge: $CHALLENGE
EOF

read -r -p "Type exactly 'APPROVE W15J DP5 $CHALLENGE': " RESPONSE
[[ "$RESPONSE" == "APPROVE W15J DP5 $CHALLENGE" ]] || fail "authorization phrase mismatch; no consent created"

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"
umask 077

python - "$CONSENT" "$MAIN_SHA" "$ANDROID_SHA" "$HOST_SHA" <<'PY'
import base64
import json
import os
import secrets
import sys
from datetime import datetime, timedelta, timezone

path, main_sha, android_sha, host_sha = sys.argv[1:]
now = datetime.now(timezone.utc)
expires = now + timedelta(minutes=10)
iso = lambda value: value.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
approval = 'apr_' + base64.urlsafe_b64encode(secrets.token_bytes(18)).decode('ascii').rstrip('=')
record = {
    'kind': 'W15J_DP5_PHYSICAL_EFFECT_CONSENT',
    'schemaVersion': '1.0.0',
    'issuedAt': iso(now),
    'expiresAt': iso(expires),
    'mainSha': main_sha,
    'androidSha': android_sha,
    'hostSha': host_sha,
    'scope': 'ONE_BOUNDED_MEDIA_VOLUME_STEP_UP',
    'approvalReference': approval,
    'authorizesExecution': False,
    'retryAuthorized': False,
    'physicalAcceptance': False,
}
temporary = f'{path}.tmp-{os.getpid()}'
fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
try:
    with os.fdopen(fd, 'w', encoding='utf-8') as handle:
        json.dump(record, handle, indent=2, sort_keys=True)
        handle.write('\n')
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)
    os.chmod(path, 0o600)
finally:
    try:
        os.unlink(temporary)
    except FileNotFoundError:
        pass
PY

CONSENT_SHA="$(sha256sum "$CONSENT" | awk '{print $1}')"
printf 'Aurora W15-J DP5 physical-effect consent: RECORDED_NOT_AUTHORITY\nconsent_sha256=%s\nexpires_in_minutes=10\n' "$CONSENT_SHA"
