#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora W15-J W14 binding recovery failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
for cmd in adb python sha256sum stat realpath date; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is missing"
done

DEVLAB_ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
STATE_DIR="$DEVLAB_ROOT/state"
PACKAGE_ID="${AURORA_PACKAGE_ID:-ai.aurora.device.local}"
SOURCE="${AURORA_W14_RECOVERY_SOURCE:-}"
[[ -n "$SOURCE" ]] || fail "AURORA_W14_RECOVERY_SOURCE is required"
[[ -f "$SOURCE" && ! -L "$SOURCE" ]] || fail "recovery source must be a regular non-symlink file"
[[ "$(stat -c '%a' "$SOURCE")" == "600" ]] || fail "recovery source must be mode 0600"
SOURCE_REAL="$(realpath "$SOURCE")"
STATE_REAL="$(realpath "$STATE_DIR")"
case "$SOURCE_REAL" in
  "$STATE_REAL"/*) ;;
  *) fail "recovery source must live under the protected DevLab state directory" ;;
esac

mapfile -t DEVICES < <(adb devices | awk 'NR>1 && $2=="device" {print $1}')
[[ "${#DEVICES[@]}" -eq 1 ]] || fail "exactly one authorized self-ADB device is required"
SERIAL="${DEVICES[0]}"
QEMU="$(adb -s "$SERIAL" shell getprop ro.kernel.qemu | tr -d '\r\n')"
[[ "$QEMU" != "1" && "$SERIAL" != emulator-* ]] || fail "physical tablet required"

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"
umask 077
WINDOW="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE="$STATE_DIR/dp5-w14-binding-recovery-$WINDOW"
mkdir "$EVIDENCE"
chmod 700 "$EVIDENCE"
BEFORE="$EVIDENCE/before.xml"
AFTER="$EVIDENCE/after.xml"
SUMMARY="$EVIDENCE/recovery-evidence.json"

adb -s "$SERIAL" exec-out run-as "$PACKAGE_ID" sh -c   'cat shared_prefs/aurora_device_session_metadata.xml' >"$BEFORE" ||
  fail "current W14 metadata is unavailable"
chmod 600 "$BEFORE"

python - "$BEFORE" "$SOURCE" <<'PY'
import re
import sys
import time
import xml.etree.ElementTree as ET

before_path, source_path = sys.argv[1:]

def values(path):
    root = ET.parse(path).getroot()
    if root.tag != 'map':
        raise SystemExit('W14 metadata root must be map')
    out = {}
    for element in root:
        name = element.attrib.get('name')
        if not name or name in out:
            raise SystemExit('W14 metadata contains duplicate or unnamed values')
        out[name] = element.text if element.tag == 'string' else element.attrib.get('value')
    return out

before = values(before_path)
source = values(source_path)
key_fields = {'key_alias', 'key_generation', 'key_bound_registration_version'}
if set(before) != key_fields:
    raise SystemExit('current W14 state is not exact key-only recovery state')
if before.get('key_alias') != 'aurora.w15b.device-signing':
    raise SystemExit('current W14 key alias is unexpected')
try:
    key_generation = int(before['key_generation'])
    bound_version = int(before['key_bound_registration_version'])
except (TypeError, ValueError) as error:
    raise SystemExit('current W14 key metadata is malformed') from error
if key_generation <= 0 or bound_version <= 0:
    raise SystemExit('current W14 key metadata is malformed')

required = {
    'key_alias', 'key_generation', 'key_bound_registration_version',
    'device_id', 'tenant_id', 'registration_version', 'device_state',
    'device_session_id', 'connection_id', 'gateway_generation',
    'gateway_auth_expires_at_ms', 'last_evaluated_at_ms',
}
if set(source) != required:
    raise SystemExit('recovery source W14 schema is not exact')
for field in key_fields:
    if source.get(field) != before.get(field):
        raise SystemExit('recovery source key binding does not match current Keystore metadata')
if source.get('device_state') != 'ACTIVE':
    raise SystemExit('recovery source device registration is not ACTIVE')
if not re.fullmatch(r'dvc_[0-9A-HJKMNP-TV-Z]{26}', source.get('device_id') or ''):
    raise SystemExit('recovery source device id is malformed')
if not re.fullmatch(r'ten_[0-9A-HJKMNP-TV-Z]{26}', source.get('tenant_id') or ''):
    raise SystemExit('recovery source tenant id is malformed')
if not re.fullmatch(r'[A-Za-z0-9._:/+-]{1,128}', source.get('device_session_id') or ''):
    raise SystemExit('recovery source device session id is malformed')
try:
    registration_version = int(source['registration_version'])
    gateway_generation = int(source['gateway_generation'])
    expires_ms = int(source['gateway_auth_expires_at_ms'])
    evaluated_ms = int(source['last_evaluated_at_ms'])
except (TypeError, ValueError) as error:
    raise SystemExit('recovery source W14 numeric metadata is malformed') from error
if registration_version != bound_version or gateway_generation <= 0 or evaluated_ms < 0:
    raise SystemExit('recovery source W14 binding is inconsistent')
if expires_ms > int(time.time() * 1000):
    raise SystemExit('recovery source session must already be expired')
PY

adb -s "$SERIAL" shell am force-stop "$PACKAGE_ID"
sleep 0.5
PID="$(adb -s "$SERIAL" shell pidof "$PACKAGE_ID" 2>/dev/null | tr -d '\r\n' || true)"
[[ -z "$PID" ]] || fail "Aurora process remained alive; recovery withheld"

adb -s "$SERIAL" exec-in run-as "$PACKAGE_ID" sh -c '
  set -eu
  mkdir -p shared_prefs
  umask 077
  tmp=shared_prefs/.aurora_device_session_metadata.xml.dp5-recovery
  cat >"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" shared_prefs/aurora_device_session_metadata.xml
' <"$SOURCE" || fail "atomic W14 metadata restore failed"

adb -s "$SERIAL" exec-out run-as "$PACKAGE_ID" sh -c   'cat shared_prefs/aurora_device_session_metadata.xml' >"$AFTER" ||
  fail "recovered W14 metadata readback failed"
chmod 600 "$AFTER"
cmp -s "$SOURCE" "$AFTER" || fail "recovered W14 metadata differs from protected source"
PID="$(adb -s "$SERIAL" shell pidof "$PACKAGE_ID" 2>/dev/null | tr -d '\r\n' || true)"
[[ -z "$PID" ]] || fail "Aurora unexpectedly launched during metadata recovery"

BEFORE_SHA="$(sha256sum "$BEFORE" | awk '{print $1}')"
SOURCE_SHA="$(sha256sum "$SOURCE" | awk '{print $1}')"
AFTER_SHA="$(sha256sum "$AFTER" | awk '{print $1}')"
python - "$SUMMARY" "$BEFORE_SHA" "$SOURCE_SHA" "$AFTER_SHA" <<'PY'
import json
import os
import sys
from datetime import datetime, timezone

path, before_sha, source_sha, after_sha = sys.argv[1:]
record = {
    'kind': 'W14_EXPIRED_BINDING_RECOVERY_EVIDENCE_V1',
    'observedAtUtc': datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
    'beforeSha256': before_sha,
    'sourceSha256': source_sha,
    'afterSha256': after_sha,
    'keystoreBindingPreserved': True,
    'registrationAndSessionMetadataRestored': True,
    'applicationLaunched': False,
    'authorizesExecution': False,
    'provesExecutionSuccess': False,
    'retryAuthorized': False,
    'physicalAcceptance': False,
}
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w', encoding='utf-8') as handle:
    json.dump(record, handle, indent=2, sort_keys=True)
    handle.write('\n')
PY
chmod 600 "$SUMMARY"
(
  cd "$EVIDENCE"
  sha256sum before.xml after.xml recovery-evidence.json >manifest.sha256
)
chmod 600 "$EVIDENCE/manifest.sha256"
printf '%s\n' "$EVIDENCE" >"$STATE_DIR/last-dp5-w14-binding-recovery.txt"
chmod 600 "$STATE_DIR/last-dp5-w14-binding-recovery.txt"

printf 'W14_BINDING_RECOVERY=RESTORED_EXPIRED_BINDING_NOT_AUTHORITY\nevidence=%s\n' "$EVIDENCE"
