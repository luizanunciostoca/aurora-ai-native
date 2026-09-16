#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

fail() {
  printf 'Aurora W14 stale-binding recovery failed: %s\n' "$*" >&2
  exit 2
}

[[ "${PREFIX:-}" == "/data/data/com.termux/files/usr" ]] || fail "run inside Termux"
[[ "${AURORA_W14_STALE_BINDING_RECOVERY:-}" == "YES" ]] || fail "explicit recovery opt-in required"
for cmd in adb python sha256sum stat date; do
  command -v "$cmd" >/dev/null 2>&1 || fail "$cmd is missing"
done

ROOT="${AURORA_DEVLAB_ROOT:-$HOME/aurora-devlab}"
PACKAGE_ID="${AURORA_PACKAGE_ID:-ai.aurora.device.local}"
STATE="$ROOT/state"
ARCHIVE_ROOT="$ROOT/archive/physical-evidence"
NOW="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="$ARCHIVE_ROOT/w14-stale-binding-recovery-$NOW"
BEFORE="$ARCHIVE/before.xml"
AFTER="$ARCHIVE/after.xml"
RECOVERED="$STATE/.w14-key-only-$NOW.xml"

[[ ! -e "$STATE/dp5-effect-consent.json" ]] || fail "unconsumed physical-effect consent must be absent"
mkdir -p "$ARCHIVE"
chmod 700 "$ARCHIVE"
umask 077python - <<'PY'
import socket
for port in (8080, 8081):
    sock = socket.socket()
    sock.settimeout(0.2)
    try:
        if sock.connect_ex(('127.0.0.1', port)) == 0:
            raise SystemExit(f'LOCAL port {port} is still listening')
    finally:
        sock.close()
PY

mapfile -t DEVICES < <(adb devices | awk 'NR>1 && $2=="device" {print $1}')
[[ "${#DEVICES[@]}" -eq 1 ]] || fail "exactly one authorized self-ADB device is required"
SERIAL="${DEVICES[0]}"
QEMU="$(adb -s "$SERIAL" shell getprop ro.kernel.qemu | tr -d '\r\n')"
[[ "$QEMU" != "1" && "$SERIAL" != emulator-* ]] || fail "physical tablet required"

adb -s "$SERIAL" shell am force-stop "$PACKAGE_ID" >/dev/null
adb -s "$SERIAL" exec-out run-as "$PACKAGE_ID" sh -c \
  'cat shared_prefs/aurora_device_session_metadata.xml' >"$BEFORE" || fail "cannot read W14 metadata"
chmod 600 "$BEFORE"

python - "$BEFORE" "$RECOVERED" <<'PY'
import sys, xml.etree.ElementTree as ET
before, recovered = sys.argv[1:]
root = ET.parse(before).getroot()values = {}
for element in root:
    name = element.attrib.get('name')
    if name:
        values[name] = element.text if element.tag == 'string' else element.attrib.get('value')
required = ['key_alias', 'key_generation', 'device_id', 'tenant_id', 'registration_version',
            'device_state', 'device_session_id', 'connection_id',
            'gateway_auth_expires_at_ms', 'last_evaluated_at_ms']
if any(not values.get(name) for name in required):
    raise SystemExit('current Android W14 binding is incomplete')
if values['device_state'] != 'ACTIVE' or int(values['registration_version']) <= 0:
    raise SystemExit('current Android W14 registration is not ACTIVE')
if int(values['key_generation']) <= 0:
    raise SystemExit('current Android W14 key generation is invalid')
next_root = ET.Element('map')
alias = ET.SubElement(next_root, 'string', {'name': 'key_alias'})
alias.text = values['key_alias']
ET.SubElement(next_root, 'long', {'name': 'key_generation', 'value': values['key_generation']})
ET.ElementTree(next_root).write(recovered, encoding='utf-8', xml_declaration=True)
with open(recovered, 'ab') as handle:
    handle.write(b'\n')
PY
chmod 600 "$RECOVERED"

adb -s "$SERIAL" shell run-as "$PACKAGE_ID" sh -c \
  'cat > shared_prefs/aurora_device_session_metadata.xml && chmod 600 shared_prefs/aurora_device_session_metadata.xml' \
  <"$RECOVERED" || fail "could not install key-only W14 metadata"adb -s "$SERIAL" exec-out run-as "$PACKAGE_ID" sh -c \
  'cat shared_prefs/aurora_device_session_metadata.xml' >"$AFTER" || fail "cannot verify recovered W14 metadata"
chmod 600 "$AFTER"

python - "$BEFORE" "$AFTER" <<'PY'
import sys, xml.etree.ElementTree as ET

def values(path):
    root = ET.parse(path).getroot(); result = {}
    for element in root:
        name = element.attrib.get('name')
        if name:
            result[name] = element.text if element.tag == 'string' else element.attrib.get('value')
    return result
before, after = map(values, sys.argv[1:])
assert after.get('key_alias') == before.get('key_alias')
assert after.get('key_generation') == before.get('key_generation')
assert set(after) == {'key_alias', 'key_generation'}
print('W14_STALE_BINDING_RECOVERY=KEY_PRESERVED_FRESH_INSTALL_READY')
print('REGISTRATION_METADATA=CLEARED_STALE')
print('SESSION_METADATA=CLEARED_STALE')
print('KEY_MATERIAL=NOT_DELETED')
print('AUTHORIZES_EXECUTION=false')
print('PHYSICAL_ACCEPTANCE=false')
PY

sha256sum "$BEFORE" >"$ARCHIVE/before.sha256"
sha256sum "$AFTER" >"$ARCHIVE/after.sha256"
rm -f -- "$RECOVERED"
printf 'archive=%s\n' "$ARCHIVE"
printf 'recovery_status=READY_NOT_ACCEPTED\n'