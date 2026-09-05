#!/usr/bin/env bash
set -euo pipefail

ADB_BIN="${ADB_BIN:-adb}"
PACKAGE_ID="${AURORA_PACKAGE_ID:-ai.aurora.device.local}"
ACTIVITY_CLASS="${AURORA_ACTIVITY_CLASS:-ai.aurora.device.MainActivity}"
MODE="${AURORA_EVIDENCE_MODE:-preflight}"
OUTPUT_DIR="${AURORA_EVIDENCE_DIR:-w15j-physical-evidence-$(date -u +%Y%m%dT%H%M%SZ)}"
GATEWAY_PORT="${AURORA_GATEWAY_PORT:-8080}"
CONFIGURE_ADB_REVERSE="${AURORA_CONFIGURE_ADB_REVERSE:-1}"
CANDIDATE_SHA="${AURORA_CANDIDATE_SHA:-}"
APK_PATH="${AURORA_APK:-}"
APK_VARIANT="${AURORA_APK_VARIANT:-}"
OPERATOR="${AURORA_OPERATOR:-}"
GATEWAY_IDENTITY="${AURORA_GATEWAY_IDENTITY:-}"
GATEWAY_VERSION="${AURORA_GATEWAY_VERSION:-}"

REVERSE_CONFIGURED_BY_SCRIPT=0
COLLECTION_SUCCEEDED=0
SERIAL=""

fail() {
  printf 'W15-J physical evidence collection failed: %s\n' "$*" >&2
  exit 2
}

safe_metadata_value() {
  local label="$1"
  local value="$2"
  [[ -n "$value" ]] || fail "$label is required"
  [[ "${#value}" -le 256 ]] || fail "$label exceeds 256 characters"
  [[ "$value" != *$'\n'* && "$value" != *$'\r'* ]] || fail "$label cannot contain newlines"
}

cleanup_on_exit() {
  local status=$?
  trap - EXIT
  if [[ "$COLLECTION_SUCCEEDED" != "1" && "$REVERSE_CONFIGURED_BY_SCRIPT" == "1" && -n "$SERIAL" ]]; then
    "$ADB_BIN" -s "$SERIAL" reverse --remove "tcp:$GATEWAY_PORT" >/dev/null 2>&1 || true
  fi
  exit "$status"
}
trap cleanup_on_exit EXIT

[[ "$MODE" == "preflight" || "$MODE" == "finalize" ]] || \
  fail "AURORA_EVIDENCE_MODE must be preflight or finalize"
[[ "$GATEWAY_PORT" =~ ^[0-9]+$ ]] || fail "AURORA_GATEWAY_PORT must be numeric"
(( GATEWAY_PORT >= 1 && GATEWAY_PORT <= 65535 )) || fail "AURORA_GATEWAY_PORT is out of range"
[[ "$CONFIGURE_ADB_REVERSE" == "0" || "$CONFIGURE_ADB_REVERSE" == "1" ]] || \
  fail "AURORA_CONFIGURE_ADB_REVERSE must be 0 or 1"
[[ "$CANDIDATE_SHA" =~ ^[0-9a-f]{40}$ ]] || \
  fail "AURORA_CANDIDATE_SHA must be the exact lowercase 40-hex candidate SHA"
[[ "$PACKAGE_ID" =~ ^[A-Za-z0-9._]+$ ]] || fail "AURORA_PACKAGE_ID contains unsafe characters"
[[ "$ACTIVITY_CLASS" =~ ^[A-Za-z0-9._]+$ ]] || fail "AURORA_ACTIVITY_CLASS contains unsafe characters"
safe_metadata_value "AURORA_APK_VARIANT" "$APK_VARIANT"
safe_metadata_value "AURORA_OPERATOR" "$OPERATOR"
safe_metadata_value "AURORA_GATEWAY_IDENTITY" "$GATEWAY_IDENTITY"
safe_metadata_value "AURORA_GATEWAY_VERSION" "$GATEWAY_VERSION"
[[ -n "$APK_PATH" && -f "$APK_PATH" ]] || fail "AURORA_APK must point to the exact candidate APK"
command -v "$ADB_BIN" >/dev/null 2>&1 || fail "adb is not installed or not on PATH"
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum is required"

mapfile -t DEVICES < <("$ADB_BIN" devices | awk 'NR > 1 && $2 == "device" {print $1}')
[[ "${#DEVICES[@]}" -eq 1 ]] || \
  fail "exactly one authorized Android device is required; found ${#DEVICES[@]}"
SERIAL="${DEVICES[0]}"

QEMU="$($ADB_BIN -s "$SERIAL" shell getprop ro.kernel.qemu | tr -d '\r\n')"
[[ "$QEMU" != "1" && "$SERIAL" != emulator-* ]] || \
  fail "emulator detected; DP5 requires representative physical hardware"

if [[ "$MODE" == "preflight" ]]; then
  [[ ! -e "$OUTPUT_DIR" ]] || fail "preflight evidence directory already exists: $OUTPUT_DIR"
  mkdir -p "$OUTPUT_DIR"
else
  [[ -d "$OUTPUT_DIR" ]] || fail "finalize requires existing AURORA_EVIDENCE_DIR"
  [[ -f "$OUTPUT_DIR/preflight-metadata.txt" ]] || \
    fail "finalize requires preflight-metadata.txt in AURORA_EVIDENCE_DIR"
fi

adb_shell() {
  "$ADB_BIN" -s "$SERIAL" shell "$@"
}

capture_optional() {
  local name="$1"
  shift
  set +e
  "$@" >"$OUTPUT_DIR/$name" 2>&1
  local status=$?
  set -e
  printf '%s\n' "$status" >"$OUTPUT_DIR/$name.exit-code"
}

capture_required() {
  local name="$1"
  shift
  set +e
  "$@" >"$OUTPUT_DIR/$name" 2>&1
  local status=$?
  set -e
  printf '%s\n' "$status" >"$OUTPUT_DIR/$name.exit-code"
  (( status == 0 )) || fail "required capture failed: $name"
}

write_manifest() {
  local target="$1"
  (
    cd "$OUTPUT_DIR"
    : >"$target"
    while IFS= read -r -d '' file; do
      local_file="${file#./}"
      [[ "$local_file" == "$target" ]] && continue
      sha256sum "$local_file" >>"$target"
    done < <(find . -maxdepth 1 -type f -print0 | sort -z)
  )
}

MODEL="$(adb_shell getprop ro.product.model | tr -d '\r\n')"
MANUFACTURER="$(adb_shell getprop ro.product.manufacturer | tr -d '\r\n')"
PRODUCT="$(adb_shell getprop ro.product.name | tr -d '\r\n')"
API_LEVEL="$(adb_shell getprop ro.build.version.sdk | tr -d '\r\n')"
FINGERPRINT="$(adb_shell getprop ro.build.fingerprint | tr -d '\r\n')"
SERIAL_HASH="$(printf '%s' "$SERIAL" | sha256sum | awk '{print $1}')"
APK_SHA256="$(sha256sum "$APK_PATH" | awk '{print $1}')"

for value in "$MODEL" "$MANUFACTURER" "$PRODUCT" "$API_LEVEL" "$FINGERPRINT"; do
  [[ -n "$value" ]] || fail "required physical device identity field is empty"
done

if [[ "$MODE" == "preflight" ]]; then
  cat >"$OUTPUT_DIR/preflight-metadata.txt" <<EOF_PREFLIGHT
collected_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
candidate_sha=$CANDIDATE_SHA
apk_path_sha256=$APK_SHA256
apk_variant=$APK_VARIANT
serial_sha256=$SERIAL_HASH
manufacturer=$MANUFACTURER
model=$MODEL
product=$PRODUCT
api_level=$API_LEVEL
build_fingerprint=$FINGERPRINT
ro.kernel.qemu=$QEMU
package_id=$PACKAGE_ID
activity_class=$ACTIVITY_CLASS
gateway_identity=$GATEWAY_IDENTITY
gateway_version=$GATEWAY_VERSION
gateway_port=$GATEWAY_PORT
operator=$OPERATOR
EOF_PREFLIGHT

  sha256sum "$APK_PATH" >"$OUTPUT_DIR/apk-sha256.txt"
  capture_required apk-install.txt "$ADB_BIN" -s "$SERIAL" install -r "$APK_PATH"
  capture_required package-path.txt adb_shell pm path "$PACKAGE_ID"
  capture_required package-dump.txt adb_shell dumpsys package "$PACKAGE_ID"

  PACKAGE_DUMP="$OUTPUT_DIR/package-dump.txt"
  VERSION_CODE="$(sed -n 's/.*versionCode=\([0-9][0-9]*\).*/\1/p' "$PACKAGE_DUMP" | head -n 1)"
  VERSION_NAME="$(sed -n 's/^[[:space:]]*versionName=\(.*\)$/\1/p' "$PACKAGE_DUMP" | head -n 1)"
  [[ -n "$VERSION_CODE" ]] || fail "could not determine installed versionCode"
  [[ -n "$VERSION_NAME" ]] || fail "could not determine installed versionName"

  cat >"$OUTPUT_DIR/apk-identity.txt" <<EOF_APK
candidate_sha=$CANDIDATE_SHA
application_id=$PACKAGE_ID
variant=$APK_VARIANT
version_code=$VERSION_CODE
version_name=$VERSION_NAME
apk_sha256=$APK_SHA256
EOF_APK

  REQUESTED_PERMISSIONS="$OUTPUT_DIR/requested-permissions.txt"
  sed -n '/requested permissions:/,/install permissions:/p' "$PACKAGE_DUMP" >"$REQUESTED_PERMISSIONS"
  grep -q 'android.permission.INTERNET' "$REQUESTED_PERMISSIONS" || \
    fail "candidate APK does not request android.permission.INTERNET"

  if [[ "$CONFIGURE_ADB_REVERSE" == "1" ]]; then
    capture_required adb-reverse-configure.txt \
      "$ADB_BIN" -s "$SERIAL" reverse "tcp:$GATEWAY_PORT" "tcp:$GATEWAY_PORT"
    REVERSE_CONFIGURED_BY_SCRIPT=1
  fi
  capture_required adb-reverse-list.txt "$ADB_BIN" -s "$SERIAL" reverse --list
  grep -q "tcp:$GATEWAY_PORT tcp:$GATEWAY_PORT" "$OUTPUT_DIR/adb-reverse-list.txt" || \
    fail "expected adb reverse mapping was not observed"

  capture_optional battery-before.txt adb_shell dumpsys battery
  capture_optional meminfo-before.txt adb_shell dumpsys meminfo "$PACKAGE_ID"
  capture_optional cpuinfo-before.txt adb_shell dumpsys cpuinfo
  capture_optional storage-before.txt adb_shell du -sk "/data/user/0/$PACKAGE_ID"
  capture_optional services-before.txt adb_shell dumpsys activity services "$PACKAGE_ID"

  adb_shell am force-stop "$PACKAGE_ID"
  sleep 1
  capture_required cold-start.txt adb_shell am start -W -n "$PACKAGE_ID/$ACTIVITY_CLASS"
  sleep 2
  capture_required warm-start.txt adb_shell am start -W -n "$PACKAGE_ID/$ACTIVITY_CLASS"
  capture_optional meminfo-after-warm-start.txt adb_shell dumpsys meminfo "$PACKAGE_ID"

  adb_shell am force-stop "$PACKAGE_ID"
  sleep 1
  capture_required restart-start.txt adb_shell am start -W -n "$PACKAGE_ID/$ACTIVITY_CLASS"
  sleep 2
  capture_optional meminfo-after-restart.txt adb_shell dumpsys meminfo "$PACKAGE_ID"
  capture_optional cpuinfo-after-restart.txt adb_shell dumpsys cpuinfo
  capture_optional storage-after-restart.txt adb_shell du -sk "/data/user/0/$PACKAGE_ID"
  capture_optional services-after-restart.txt adb_shell dumpsys activity services "$PACKAGE_ID"

  cat >"$OUTPUT_DIR/acceptance-status.txt" <<EOF_STATUS
DP4_STATUS=OPEN
DP5_STATUS=INCOMPLETE_UNTIL_SCENARIO_MATRIX_SIGNED
PHYSICAL_DEVICE_PREFLIGHT=PASS
CANDIDATE_SHA=$CANDIDATE_SHA
APK_SHA256=$APK_SHA256
INTERNET_PERMISSION=PRESENT
ADB_REVERSE_STATUS=CONFIGURED_OR_OBSERVED_LOCAL_ONLY
GATEWAY_PORT=$GATEWAY_PORT
GATEWAY_TRANSPORT_SCOPE=LOCAL_ADB_REVERSE_ONLY
RAW_CAPTURE_EXIT_CODES=REVIEW_REQUIRED
REQUIRED_NEXT=Execute every W15J_PHYSICAL_ACCEPTANCE.md scenario, populate per-scenario records in W15J_EVIDENCE_TEMPLATE.json, then rerun this collector with AURORA_EVIDENCE_MODE=finalize and the same AURORA_EVIDENCE_DIR.
EOF_STATUS

  write_manifest evidence-manifest-preflight.sha256
  COLLECTION_SUCCEEDED=1
  printf 'W15-J physical preflight evidence collected in %s\n' "$OUTPUT_DIR"
  printf 'ADB reverse remains active only for the governed scenario window.\n'
  printf 'Finalize with the same evidence directory after scenarios complete.\n'
else
  grep -Fxq "candidate_sha=$CANDIDATE_SHA" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize candidate SHA does not match preflight"
  grep -Fxq "serial_sha256=$SERIAL_HASH" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize physical device does not match preflight"
  grep -Fxq "package_id=$PACKAGE_ID" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize package id does not match preflight"
  grep -Fxq "gateway_identity=$GATEWAY_IDENTITY" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize gateway identity does not match preflight"
  grep -Fxq "gateway_version=$GATEWAY_VERSION" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize gateway version does not match preflight"
  grep -Fxq "apk_path_sha256=$APK_SHA256" "$OUTPUT_DIR/preflight-metadata.txt" || \
    fail "finalize APK hash does not match preflight"

  capture_required adb-reverse-list-before-finalize.txt "$ADB_BIN" -s "$SERIAL" reverse --list
  grep -q "tcp:$GATEWAY_PORT tcp:$GATEWAY_PORT" "$OUTPUT_DIR/adb-reverse-list-before-finalize.txt" || \
    fail "expected governed adb reverse mapping is missing before finalize"

  capture_optional battery-after.txt adb_shell dumpsys battery
  capture_optional meminfo-after.txt adb_shell dumpsys meminfo "$PACKAGE_ID"
  capture_optional cpuinfo-after.txt adb_shell dumpsys cpuinfo
  capture_optional storage-after.txt adb_shell du -sk "/data/user/0/$PACKAGE_ID"
  capture_optional services-after.txt adb_shell dumpsys activity services "$PACKAGE_ID"

  capture_required adb-reverse-remove.txt \
    "$ADB_BIN" -s "$SERIAL" reverse --remove "tcp:$GATEWAY_PORT"
  capture_required adb-reverse-list-after-finalize.txt "$ADB_BIN" -s "$SERIAL" reverse --list
  if grep -q "tcp:$GATEWAY_PORT tcp:$GATEWAY_PORT" "$OUTPUT_DIR/adb-reverse-list-after-finalize.txt"; then
    fail "adb reverse mapping still exists after finalize"
  fi

  cat >"$OUTPUT_DIR/finalize-metadata.txt" <<EOF_FINAL
finalized_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
candidate_sha=$CANDIDATE_SHA
apk_sha256=$APK_SHA256
serial_sha256=$SERIAL_HASH
gateway_identity=$GATEWAY_IDENTITY
gateway_version=$GATEWAY_VERSION
gateway_port=$GATEWAY_PORT
operator=$OPERATOR
adb_reverse_status=REMOVED
EOF_FINAL

  cat >"$OUTPUT_DIR/acceptance-status.txt" <<EOF_STATUS
DP4_STATUS=OPEN
DP5_STATUS=INCOMPLETE_UNTIL_SCENARIO_MATRIX_SIGNED
PHYSICAL_DEVICE_PREFLIGHT=PASS
PHYSICAL_WINDOW_FINALIZED=PASS
CANDIDATE_SHA=$CANDIDATE_SHA
APK_SHA256=$APK_SHA256
ADB_REVERSE_STATUS=REMOVED
GATEWAY_PORT=$GATEWAY_PORT
GATEWAY_TRANSPORT_SCOPE=LOCAL_ADB_REVERSE_ONLY
RAW_CAPTURE_EXIT_CODES=REVIEW_REQUIRED
REQUIRED_NEXT=Complete and independently review the per-scenario evidence matrix plus Risk Gates A-D. This collector output alone cannot close DP5.
EOF_STATUS

  write_manifest evidence-manifest.sha256
  COLLECTION_SUCCEEDED=1
  printf 'W15-J physical evidence window finalized in %s\n' "$OUTPUT_DIR"
  printf 'ADB reverse mapping removed. DP5 remains closed pending per-scenario evidence and Risk Gates A-D.\n'
fi
