#!/usr/bin/env bash
set -euo pipefail

ADB_BIN="${ADB_BIN:-adb}"
PACKAGE_ID="${AURORA_PACKAGE_ID:-ai.aurora.device.local}"
ACTIVITY_CLASS="${AURORA_ACTIVITY_CLASS:-ai.aurora.device.MainActivity}"
OUTPUT_DIR="${AURORA_EVIDENCE_DIR:-w15j-physical-evidence-$(date -u +%Y%m%dT%H%M%SZ)}"
GATEWAY_PORT="${AURORA_GATEWAY_PORT:-8080}"
CONFIGURE_ADB_REVERSE="${AURORA_CONFIGURE_ADB_REVERSE:-1}"

fail() {
  printf 'W15-J physical evidence collection failed: %s\n' "$*" >&2
  exit 2
}

[[ "$GATEWAY_PORT" =~ ^[0-9]+$ ]] || fail "AURORA_GATEWAY_PORT must be numeric"
(( GATEWAY_PORT >= 1 && GATEWAY_PORT <= 65535 )) || fail "AURORA_GATEWAY_PORT is out of range"
[[ "$CONFIGURE_ADB_REVERSE" == "0" || "$CONFIGURE_ADB_REVERSE" == "1" ]] || \
  fail "AURORA_CONFIGURE_ADB_REVERSE must be 0 or 1"
command -v "$ADB_BIN" >/dev/null 2>&1 || fail "adb is not installed or not on PATH"

mapfile -t DEVICES < <("$ADB_BIN" devices | awk 'NR > 1 && $2 == "device" {print $1}')
[[ "${#DEVICES[@]}" -eq 1 ]] || fail "exactly one authorized Android device is required; found ${#DEVICES[@]}"
SERIAL="${DEVICES[0]}"

QEMU="$($ADB_BIN -s "$SERIAL" shell getprop ro.kernel.qemu | tr -d '\r')"
[[ "$QEMU" != "1" && "$SERIAL" != emulator-* ]] || fail "emulator detected; DP5 requires representative physical hardware"

mkdir -p "$OUTPUT_DIR"

adb_shell() {
  "$ADB_BIN" -s "$SERIAL" shell "$@"
}

capture() {
  local name="$1"
  shift
  "$@" >"$OUTPUT_DIR/$name" 2>&1 || true
}

MODEL="$(adb_shell getprop ro.product.model | tr -d '\r')"
MANUFACTURER="$(adb_shell getprop ro.product.manufacturer | tr -d '\r')"
PRODUCT="$(adb_shell getprop ro.product.name | tr -d '\r')"
API_LEVEL="$(adb_shell getprop ro.build.version.sdk | tr -d '\r')"
FINGERPRINT="$(adb_shell getprop ro.build.fingerprint | tr -d '\r')"
SERIAL_HASH="$(printf '%s' "$SERIAL" | sha256sum | awk '{print $1}')"

cat >"$OUTPUT_DIR/device-identity.txt" <<EOF_IDENTITY
collected_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
serial_sha256=$SERIAL_HASH
manufacturer=$MANUFACTURER
model=$MODEL
product=$PRODUCT
api_level=$API_LEVEL
build_fingerprint=$FINGERPRINT
ro.kernel.qemu=$QEMU
package_id=$PACKAGE_ID
activity_class=$ACTIVITY_CLASS
gateway_port=$GATEWAY_PORT
EOF_IDENTITY

if [[ -n "${AURORA_APK:-}" ]]; then
  [[ -f "$AURORA_APK" ]] || fail "AURORA_APK does not exist: $AURORA_APK"
  sha256sum "$AURORA_APK" >"$OUTPUT_DIR/apk-sha256.txt"
  "$ADB_BIN" -s "$SERIAL" install -r "$AURORA_APK" >"$OUTPUT_DIR/apk-install.txt" 2>&1 || fail "APK install failed"
fi

adb_shell pm path "$PACKAGE_ID" >"$OUTPUT_DIR/package-path.txt" 2>&1 || fail "package $PACKAGE_ID is not installed"
capture package-dump.txt adb_shell dumpsys package "$PACKAGE_ID"

REQUESTED_PERMISSIONS="$OUTPUT_DIR/requested-permissions.txt"
adb_shell dumpsys package "$PACKAGE_ID" | sed -n '/requested permissions:/,/install permissions:/p' >"$REQUESTED_PERMISSIONS" || true

grep -q 'android.permission.INTERNET' "$REQUESTED_PERMISSIONS" || \
  fail "candidate APK does not request android.permission.INTERNET"

ADB_REVERSE_STATUS="NOT_CONFIGURED"
if [[ "$CONFIGURE_ADB_REVERSE" == "1" ]]; then
  "$ADB_BIN" -s "$SERIAL" reverse "tcp:$GATEWAY_PORT" "tcp:$GATEWAY_PORT" \
    >"$OUTPUT_DIR/adb-reverse-configure.txt" 2>&1 || fail "adb reverse configuration failed"
  "$ADB_BIN" -s "$SERIAL" reverse --list >"$OUTPUT_DIR/adb-reverse-list.txt" 2>&1 || \
    fail "could not enumerate adb reverse mappings"
  grep -q "tcp:$GATEWAY_PORT tcp:$GATEWAY_PORT" "$OUTPUT_DIR/adb-reverse-list.txt" || \
    fail "expected adb reverse mapping was not observed"
  ADB_REVERSE_STATUS="CONFIGURED_LOCAL_ONLY"
else
  capture adb-reverse-list.txt "$ADB_BIN" -s "$SERIAL" reverse --list
fi

capture battery-before.txt adb_shell dumpsys battery
capture meminfo-before.txt adb_shell dumpsys meminfo "$PACKAGE_ID"
capture cpuinfo-before.txt adb_shell dumpsys cpuinfo
capture storage-before.txt adb_shell du -sk "/data/user/0/$PACKAGE_ID"

adb_shell am force-stop "$PACKAGE_ID"
sleep 1
capture cold-start.txt adb_shell am start -W -n "$PACKAGE_ID/$ACTIVITY_CLASS"
sleep 2
capture meminfo-after-cold-start.txt adb_shell dumpsys meminfo "$PACKAGE_ID"

adb_shell am force-stop "$PACKAGE_ID"
sleep 1
capture restart-start.txt adb_shell am start -W -n "$PACKAGE_ID/$ACTIVITY_CLASS"
sleep 2
capture meminfo-after-restart.txt adb_shell dumpsys meminfo "$PACKAGE_ID"
capture cpuinfo-after-restart.txt adb_shell dumpsys cpuinfo
capture battery-after.txt adb_shell dumpsys battery
capture storage-after.txt adb_shell du -sk "/data/user/0/$PACKAGE_ID"
capture services.txt adb_shell dumpsys activity services "$PACKAGE_ID"

cat >"$OUTPUT_DIR/acceptance-status.txt" <<EOF_STATUS
DP4_STATUS=OPEN
DP5_STATUS=INCOMPLETE_UNTIL_SCENARIO_MATRIX_SIGNED
PHYSICAL_DEVICE_PREFLIGHT=PASS
INTERNET_PERMISSION=PRESENT
ADB_REVERSE_STATUS=$ADB_REVERSE_STATUS
GATEWAY_PORT=$GATEWAY_PORT
GATEWAY_TRANSPORT_SCOPE=LOCAL_ADB_REVERSE_ONLY
REQUIRED_NEXT=Complete W15J_PHYSICAL_ACCEPTANCE.md mandatory scenarios with PASS/FAIL/BLOCKED evidence references and remove the ADB reverse mapping after the governed test window.
EOF_STATUS

printf 'W15-J physical evidence collected in %s\n' "$OUTPUT_DIR"
printf 'DP5 remains closed until the mandatory scenario matrix and Risk Gates A-D are complete.\n'
printf 'If configured, remove the test mapping after the scenario window: adb -s %q reverse --remove tcp:%s\n' "$SERIAL" "$GATEWAY_PORT"
